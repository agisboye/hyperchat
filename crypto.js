const sodium = require('sodium-native')

const HYPERCORE_DISCOVERYKEY_SIZE = 32
/// Returns (pk, sk)
function _generateKeyPair() {
    let pk = Buffer.alloc(sodium.crypto_kx_PUBLICKEYBYTES)
    let sk = Buffer.alloc(sodium.crypto_kx_SECRETKEYBYTES)
    sodium.crypto_kx_keypair(pk, sk)
    return {pk, sk}
}

/// returns (rx, tx)
function _generateEncryptionKey(clientPublicKey, clientSecretKey, serverPublicKey) {
    let tx = Buffer.alloc(sodium.crypto_kx_SESSIONKEYBYTES)
    sodium.crypto_kx_client_session_keys(null, tx, clientPublicKey, clientSecretKey, serverPublicKey)
    return tx
}

function _generateDecryptionKey(serverPublicKey, serverSecretKey, clientPublicKey) {
    let rx = Buffer.alloc(sodium.crypto_kx_SESSIONKEYBYTES)
    sodium.crypto_kx_server_session_keys(rx, null, serverPublicKey, serverSecretKey, clientPublicKey)
    return rx
}

function _splitPeerID(peerID) {
    // First 32 bytes of peerID is discovery key
    // last 32 bytes of peerID is DH public key
    let discoveryKey = Buffer.alloc(HYPERCORE_DISCOVERYKEY_SIZE)
    let publicKey = Buffer.alloc(sodium.crypto_kx_PUBLICKEYBYTES)
    peerID.copy(discoveryKey, 0, 0, HYPERCORE_DISCOVERYKEY_SIZE)
    peerID.copy(publicKey, 0, HYPERCORE_DISCOVERYKEY_SIZE, peerID.length)
    return {discoveryKey, publicKey}
}

function _getPublicKeyFromPeerID(peerID) {
    return _splitPeerID(peerID).publicKey
}

// ------- public functions ------- //

function getDiscoveryKeyFromPeerID(peerID) {
    return _splitPeerID(peerID).discoveryKey
}

function createPeerID(ownFeedDiscoveryKey, ownPublicKey) {
    return Buffer.concat([ownFeedDiscoveryKey, ownPublicKey])
}

function encryptMessage(plainMessage, ownPublicKey, ownPrivateKey, otherPeerID) {
    let otherPublicKey = _getPublicKeyFromPeerID(otherPeerID)
    let encryptionKey = _generateEncryptionKey(ownPublicKey, ownPrivateKey, otherPublicKey)
    let ciphertext = Buffer.alloc(plainMessage.length + sodium.crypto_secretbox_MACBYTES)
    let message = Buffer.from(plainMessage)
    let nonce = Buffer.alloc(sodium.crypto_secretbox_NONCEBYTES)
    sodium.randombytes_buf(nonce)

    sodium.crypto_secretbox_easy(ciphertext, message, nonce, encryptionKey)

    // Prepend nonce to ciphertext
    return Buffer.concat([nonce, ciphertext])
}



function tryDecryptMessage(cipherAndNonce, ownPublicKey, ownPrivateKey, otherPeerID) {
    let otherPublicKey = _getPublicKeyFromPeerID(otherPeerID)
    let decryptionKey = _generateDecryptionKey(ownPublicKey, ownPrivateKey, otherPublicKey)

    // nonce is always prepended to cipher when encrypted. 
    // Therefore, copy the first part into 'nonce' and second part into 'ciphertext'
    let nonce = Buffer.alloc(sodium.crypto_secretbox_NONCEBYTES)
    let cipher = Buffer.alloc(cipherAndNonce.length - nonce.length)
    cipherAndNonce.copy(nonce, 0, 0, sodium.crypto_secretbox_NONCEBYTES)
    cipherAndNonce.copy(cipher, 0, sodium.crypto_secretbox_NONCEBYTES, cipherAndNonce.length)

    let plainTextBuffer = Buffer.alloc(cipher.length - sodium.crypto_secretbox_MACBYTES)

    if (sodium.crypto_secretbox_open_easy(plainTextBuffer, cipher, nonce, decryptionKey)) {
        return plainTextBuffer
    } else {
        // Decryption failed. 
        throw new Error("tryDecryptMessage failed.")
    }
}

function generateChallenge(ownPeerID, otherPeerID) {

}

function answerChallenge(cipher, ownSecretKey) {
    
}

// server
let serverDiscoveryKey = Buffer.alloc(HYPERCORE_DISCOVERYKEY_SIZE)
sodium.randombytes_buf(serverDiscoveryKey)
let serverKeyPair = _generateKeyPair()
let serverPeerID = createPeerID(serverDiscoveryKey, serverKeyPair.pk)

// client
let clientDiscoveryKey = Buffer.alloc(HYPERCORE_DISCOVERYKEY_SIZE)
sodium.randombytes_buf(clientDiscoveryKey)
let clientKeyPair = _generateKeyPair()
let clientPeerID = createPeerID(clientDiscoveryKey, clientKeyPair.pk)

let message = "one small step for crypto, one large leap for hyperchat"
let cipher = encryptMessage(message, clientKeyPair.pk, clientKeyPair.sk, serverPeerID)

let receivedMessage = tryDecryptMessage(cipher, serverKeyPair.pk, serverKeyPair.sk, clientPeerID)

console.log(receivedMessage.toString('utf-8'))