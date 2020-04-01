const sodium = require('sodium-native')

const HYPERCORE_KEY_SIZE = 32

function _createChallengeProof(input, key) {
    let output = Buffer.alloc(sodium.crypto_generichash_BYTES_MAX)
    sodium.crypto_generichash(output, input, key)
    return output
}

/// returns (rx, tx)
function _generateClientKeys(clientPublicKey, clientSecretKey, serverPublicKey) {
    let rx = Buffer.alloc(sodium.crypto_kx_SESSIONKEYBYTES)
    let tx = Buffer.alloc(sodium.crypto_kx_SESSIONKEYBYTES)
    sodium.crypto_kx_client_session_keys(rx, tx, clientPublicKey, clientSecretKey, serverPublicKey)
    return { rx, tx }
}

function _generateServerKeys(serverPublicKey, serverSecretKey, clientPublicKey) {
    let rx = Buffer.alloc(sodium.crypto_kx_SESSIONKEYBYTES)
    let tx = Buffer.alloc(sodium.crypto_kx_SESSIONKEYBYTES)
    sodium.crypto_kx_server_session_keys(rx, tx, serverPublicKey, serverSecretKey, clientPublicKey)
    return { rx, tx }
}

function _splitPeerID(peerID) {
    // First 32 bytes of peerID is public key
    // last 32 bytes of peerID is DH public key
    let feedKey = Buffer.alloc(HYPERCORE_KEY_SIZE)
    let publicKey = Buffer.alloc(sodium.crypto_kx_PUBLICKEYBYTES)
    peerID.copy(feedKey, 0, 0, HYPERCORE_KEY_SIZE)
    peerID.copy(publicKey, 0, HYPERCORE_KEY_SIZE, peerID.length)
    return { feedKey, publicKey }
}

/// returns true iff received signature (proof) is valid
function _compareProofs(message, ownPublicKey, ownSecretKey) {
    // Verify that the sender also knows the shared secret key.
    let nonce = Buffer.from(message.nonce, 'hex')
    let proof = Buffer.from(message.proof, 'hex')

    let otherPeerID = Buffer.from(message.peerIDs[0], 'hex')
    let otherPublicKey = getPublicKeyFromPeerID(otherPeerID)

    let { rx, _ } = _generateServerKeys(ownPublicKey, ownSecretKey, otherPublicKey)

    let myProof = _createChallengeProof(nonce, rx)

    // compare the two hashes
    return sodium.sodium_memcmp(proof, myProof)
}

// ------- public functions ------- //

function splitNonceAndCipher(cipherAndNonce) {
    // nonce is always prepended to cipher when encrypted. 
    // Therefore, copy the first part into 'nonce' and second part into 'ciphertext'
    let nonce = Buffer.alloc(sodium.crypto_secretbox_NONCEBYTES)
    let cipher = Buffer.alloc(cipherAndNonce.length - nonce.length)
    cipherAndNonce.copy(nonce, 0, 0, sodium.crypto_secretbox_NONCEBYTES)
    cipherAndNonce.copy(cipher, 0, sodium.crypto_secretbox_NONCEBYTES, cipherAndNonce.length)

    return { nonce, cipher }
}

function getPublicKeyFromPeerID(peerID) {
    return _splitPeerID(peerID).publicKey
}

function getDiscoveryKeyFromFeedPublicKey(publicKey) {
    var digest = Buffer.alloc(32)
    sodium.crypto_generichash(digest, Buffer.from('hypercore'), publicKey)
    return digest
}

/// Returns (pk, sk)
function generateKeyPair() {
    let pk = Buffer.alloc(sodium.crypto_kx_PUBLICKEYBYTES)
    let sk = Buffer.alloc(sodium.crypto_kx_SECRETKEYBYTES)
    sodium.crypto_kx_keypair(pk, sk)
    return { pk, sk }
}

function generateSymmetricKey() {
    let clientKeys = generateKeyPair()
    let serverKeys = generateKeyPair()
    let { rx, tx } = _generateClientKeys(clientKeys.pk, clientKeys.sk, serverKeys.pk)
    return rx
}

function getFeedKeyFromPeerID(peerID) {
    return _splitPeerID(peerID).feedKey
}

function createPeerID(ownFeedKey, ownPublicKey) {
    return Buffer.concat([ownFeedKey, ownPublicKey])
}

function encryptMessage(plainMessage, key) {
    let ciphertext = Buffer.alloc(plainMessage.length + sodium.crypto_secretbox_MACBYTES)
    let message = Buffer.from(plainMessage, 'utf-8')
    let nonce = generateNonce()

    sodium.crypto_secretbox_easy(ciphertext, message, nonce, key)

    // Prepend nonce to ciphertext
    return Buffer.concat([nonce, ciphertext])
}

function decryptMessage(nonceAndCipher, key) {
    let { nonce, cipher } = splitNonceAndCipher(nonceAndCipher)
    let plainTextBuffer = Buffer.alloc(cipher.length - sodium.crypto_secretbox_MACBYTES)
    if (sodium.crypto_secretbox_open_easy(plainTextBuffer, cipher, nonce, key)) {
        return plainTextBuffer
    } else {
        // Decryption failed. 
        return null
    }
}

function generateChallenge(ownSecretKey, ownPublicKey, ownPeerID, receiverPeerID, otherPeerIDs, key) {
    let receiverPublicKey = getPublicKeyFromPeerID(receiverPeerID)

    let nonce = generateNonce()
    let { _, tx } = _generateClientKeys(ownPublicKey, ownSecretKey, receiverPublicKey)
    let proof = _createChallengeProof(nonce, tx)

    let peerIDs = [ownPeerID].concat(otherPeerIDs).map(peerID => peerID.toString('hex'))

    let message = {
        peerIDs: peerIDs,
        nonce: nonce.toString('hex'),
        proof: proof.toString('hex'),
        key: key.toString('hex')
    }

    let messageBuffer = Buffer.from(JSON.stringify(message), 'utf8')
    let ciphertext = Buffer.alloc(messageBuffer.length + sodium.crypto_box_SEALBYTES)

    sodium.crypto_box_seal(ciphertext, messageBuffer, receiverPublicKey)

    return ciphertext
}

/// returns {key: Buffer, peerIDs: [Buffer]) if challenge can be answered else null
function answerChallenge(ciphertext, ownSecretKey, ownPublicKey) {
    let result = Buffer.alloc(ciphertext.length - sodium.crypto_box_SEALBYTES)

    if (sodium.crypto_box_seal_open(result, ciphertext, ownPublicKey, ownSecretKey)) {
        let message = JSON.parse(result.toString('utf8'))

        if (_compareProofs(message, ownPublicKey, ownSecretKey)) {
            let peerIDs = message.peerIDs.map(peerID => Buffer.from(peerID, 'hex'))
            return {
                key: Buffer.from(message.key, 'hex'),
                peerIDs: peerIDs
            }
        }
    }
    return null
}

/// returns hash(key || peerID)
function makeChatID(key, senderPeerID) {
    let output = Buffer.alloc(sodium.crypto_generichash_BYTES_MAX)
    sodium.crypto_generichash(output, Buffer.concat([key, senderPeerID]))
    return output
}

function generateNonce() {
    let nonce = Buffer.alloc(sodium.crypto_secretbox_NONCEBYTES)
    sodium.randombytes_buf(nonce)
    return nonce
}

function hash(input) {
    let output = Buffer.alloc(sodium.crypto_generichash_BYTES_MIN)
    sodium.crypto_generichash(output, input)
    return output
}

module.exports = {
    hash,
    generateNonce,
    splitNonceAndCipher,
    getFeedKeyFromPeerID,
    getPublicKeyFromPeerID,
    createPeerID,
    decryptMessage,
    generateChallenge,
    answerChallenge,
    generateKeyPair,
    generateSymmetricKey,
    getDiscoveryKeyFromFeedPublicKey,
    makeChatID,
    encryptMessage,
    decryptMessage
}