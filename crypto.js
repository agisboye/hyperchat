const sodium = require('sodium-native')

const HYPERCORE_KEY_SIZE = 32

function _generateNonce() {
    let nonce = Buffer.alloc(sodium.crypto_secretbox_NONCEBYTES)
    sodium.randombytes_buf(nonce)
    return nonce
}

function _createChallengeProof(input, key) {
    let output = Buffer.alloc(sodium.crypto_generichash_BYTES_MAX)
    sodium.crypto_generichash(output, input, key)
    return output
}

function _splitNonceAndCipher(cipherAndNonce) {
    // nonce is always prepended to cipher when encrypted. 
    // Therefore, copy the first part into 'nonce' and second part into 'ciphertext'
    let nonce = Buffer.alloc(sodium.crypto_secretbox_NONCEBYTES)
    let cipher = Buffer.alloc(cipherAndNonce.length - nonce.length)
    cipherAndNonce.copy(nonce, 0, 0, sodium.crypto_secretbox_NONCEBYTES)
    cipherAndNonce.copy(cipher, 0, sodium.crypto_secretbox_NONCEBYTES, cipherAndNonce.length)

    return { nonce, cipher }
}

function _decryptAMessage(nonceAndCipher, key) {
    let { nonce, cipher } = _splitNonceAndCipher(nonceAndCipher)
    let plainTextBuffer = Buffer.alloc(cipher.length - sodium.crypto_secretbox_MACBYTES)
    if (sodium.crypto_secretbox_open_easy(plainTextBuffer, cipher, nonce, key)) {
        return plainTextBuffer
    } else {
        // Decryption failed. 
        return null
    }
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

function _makeChatIDServer(serverPublicKey, serverSecretKey, clientPublicKey) {
    let output = Buffer.alloc(sodium.crypto_generichash_BYTES_MAX)
    let { rx, _ } = _generateServerKeys(serverPublicKey, serverSecretKey, clientPublicKey)
    sodium.crypto_generichash(output, rx)
    return output
}

// ------- public functions ------- //

function getPublicKeyFromPeerID(peerID) {
    return _splitPeerID(peerID).publicKey
}

function getDicoveryKeyFromPublicKey(publicKey) {
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

function getFeedKeyFromPeerID(peerID) {
    return _splitPeerID(peerID).feedKey
}

function createPeerID(ownFeedKey, ownPublicKey) {
    return Buffer.concat([ownFeedKey, ownPublicKey])
}

function encryptMessage(plainMessage, ownPublicKey, ownPrivateKey, otherPeerID) {
    let otherPublicKey = getPublicKeyFromPeerID(otherPeerID)
    let { _, tx } = _generateClientKeys(ownPublicKey, ownPrivateKey, otherPublicKey)
    let ciphertext = Buffer.alloc(plainMessage.length + sodium.crypto_secretbox_MACBYTES)
    let message = Buffer.from(plainMessage, 'utf-8')
    let nonce = _generateNonce()

    sodium.crypto_secretbox_easy(ciphertext, message, nonce, tx)

    // Prepend nonce to ciphertext
    return Buffer.concat([nonce, ciphertext])
}

function decryptMessage(nonceAndCipher, ownPublicKey, ownPrivateKey, otherPublicKey) {
    let { rx, _ } = _generateServerKeys(ownPublicKey, ownPrivateKey, otherPublicKey)
    return _decryptAMessage(nonceAndCipher, rx)
}

function decryptOwnMessage(nonceAndCipher, ownPublicKey, ownPrivateKey, otherPublicKey) {
    let { _, tx } = _generateClientKeys(ownPublicKey, ownPrivateKey, otherPublicKey)
    return _decryptAMessage(nonceAndCipher, tx)
}

/// A challenge is ownPeerID + nonce encrypted with otherPeerID's public key.
function generateChallenge(ownSecretKey, ownPublicKey, ownPeerID, otherPeerID) {
    let otherPublicKey = getPublicKeyFromPeerID(otherPeerID)
    let nonce = _generateNonce()

    let { _, tx } = _generateClientKeys(ownPublicKey, ownSecretKey, otherPublicKey)
    let proof = _createChallengeProof(nonce, tx)

    let message = {
        peerID: ownPeerID.toString('hex'),
        nonce: nonce.toString('hex'),
        proof: proof.toString('hex')
    }

    let messageBuffer = Buffer.from(JSON.stringify(message), 'utf8')
    let ciphertext = Buffer.alloc(messageBuffer.length + sodium.crypto_box_SEALBYTES)

    sodium.crypto_box_seal(ciphertext, messageBuffer, otherPublicKey)

    return ciphertext
}

function answerChallenge(ciphertext, ownPublicKey, ownSecretKey) {
    // TODO: Check format of data (i.e. ensure everything is present and of proper length). Right now some of the calls will crash the program if someone sends us malformed data.
    let result = Buffer.alloc(ciphertext.length - sodium.crypto_box_SEALBYTES)
    if (sodium.crypto_box_seal_open(result, ciphertext, ownPublicKey, ownSecretKey)) {
        let data = JSON.parse(result.toString('utf8'))

        // Verify that the sender also knows the shared secret key.
        let nonce = Buffer.from(data.nonce, 'hex')
        let proof = Buffer.from(data.proof, 'hex')
        let otherPeerID = Buffer.from(data.peerID, 'hex')
        let otherPublicKey = getPublicKeyFromPeerID(otherPeerID)

        let { rx, _ } = _generateServerKeys(ownPublicKey, ownSecretKey, otherPublicKey)

        let myProof = _createChallengeProof(nonce, rx)

        // compare the two hashes
        let res = sodium.sodium_memcmp(proof, myProof)

        if (res) {
            return otherPeerID
        }
    }

    return null
}

function makeChatIDClient(clientPublicKey, clientSecretKey, serverPublicKey) {
    let output = Buffer.alloc(sodium.crypto_generichash_BYTES_MAX)
    let { _, tx } = _generateClientKeys(clientPublicKey, clientSecretKey, serverPublicKey)
    sodium.crypto_generichash(output, tx)
    return output
}

// Incoming chatID matches if it is made by someone we know or if it is made by us
function chatIDsMatch(incomingChatID, ownPublicKey, ownPrivateKey, otherPublicKey) {
    let chatIDServer = _makeChatIDServer(ownPublicKey, ownPrivateKey, otherPublicKey)

    if (incomingChatID.equals(chatIDServer)) {
        return "mathedOther"
    } else if (incomingChatID.equals(makeChatIDClient(ownPublicKey, ownPrivateKey, otherPublicKey))) {
        return "matchedSelf"
    } else {
        return null
    }
}

module.exports = {
    getFeedKeyFromPeerID,
    getPublicKeyFromPeerID,
    createPeerID,
    encryptMessage,
    decryptMessage,
    decryptOwnMessage,
    generateChallenge,
    answerChallenge,
    generateKeyPair,
    getDicoveryKeyFromPublicKey,
    makeChatIDClient,
    chatIDsMatch
}

// server
// let serverDiscoveryKey = Buffer.alloc(HYPERCORE_DISCOVERYKEY_SIZE)
// sodium.randombytes_buf(serverDiscoveryKey)
// let serverKeyPair = _generateKeyPair()
// let serverPeerID = createPeerID(serverDiscoveryKey, serverKeyPair.pk)

// // client
// let clientDiscoveryKey = Buffer.alloc(HYPERCORE_DISCOVERYKEY_SIZE)
// sodium.randombytes_buf(clientDiscoveryKey)
// let clientKeyPair = _generateKeyPair()
// let clientPeerID = createPeerID(clientDiscoveryKey, clientKeyPair.pk)

// // client generates challenge
// let challenge = generateChallenge(clientKeyPair.sk, clientKeyPair.pk, clientPeerID, serverPeerID)

// // server answers challenge
// answerChallenge(challenge, serverKeyPair.pk, serverKeyPair.sk)