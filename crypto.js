const sodium = require('sodium-native')

const HYPERCORE_DISCOVERYKEY_SIZE = 32
/// Returns (pk, sk)
function generateKeyPair() {
    let pk = Buffer.alloc(sodium.crypto_kx_PUBLICKEYBYTES)
    let sk = Buffer.alloc(sodium.crypto_kx_SECRETKEYBYTES)

    sodium.crypto_kx_keypair(pk, sk)

    return {pk, sk}
}

/// returns (rx, tx)
function generateReceiveAndTransmissionKeysAsClient(clientPublicKey, clientSecretKey, serverPublicKey) {
    let rx = Buffer.alloc(sodium.crypto_kx_SESSIONKEYBYTES)
    let tx = Buffer.alloc(sodium.crypto_kx_SESSIONKEYBYTES)
    sodium.crypto_kx_client_session_keys(rx, tx, clientPublicKey, clientSecretKey, serverPublicKey)
    return {rx, tx}
}

function generateReceiveAndTransmissionKeysAsServer(serverPublicKey, serverSecretKey, clientPublicKey) {
    let rx = Buffer.alloc(sodium.crypto_kx_SESSIONKEYBYTES)
    let tx = Buffer.alloc(sodium.crypto_kx_SESSIONKEYBYTES)
    sodium.crypto_kx_server_session_keys(rx, tx, serverPublicKey, serverSecretKey, clientPublicKey)
    return {rx, tx}
}

function splitPeerID(peerID) {
    // First 32 bytes of peerID is discovery key
    // last 32 bytes of peerID is DH public key
    let discoveryKey = Buffer.alloc(HYPERCORE_DISCOVERYKEY_SIZE)
    let publicKey = Buffer.alloc(sodium.crypto_kx_PUBLICKEYBYTES)
    peerID.copy(discoveryKey, 0, 0, HYPERCORE_DISCOVERYKEY_SIZE)
    peerID.copy(publicKey, 0, HYPERCORE_DISCOVERYKEY_SIZE, peerID.length)
    return {discoveryKey, publicKey}
}

function getPublicKeyFromPeerID(peerID) {
    return splitPeerID(peerID).publicKey
}

// ------- public functions ------- //

function getDiscoveryKeyFromPeerID(peerID) {
    return splitPeerID(peerID).discoveryKey
}

function createPeerID(ownFeedDiscoveryKey, ownPublicKey) {
    return Buffer.concat([ownFeedDiscoveryKey, ownPublicKey])
}

// TODO: Move to crypto persistence module
function peerIDAlreadyExists(peerID) {
    return false
}

function encryptMessage(plainMessage, otherPeerID) {
    let otherPK = getPublicKeyFromPeerID(otherPeerID)

}