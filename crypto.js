const sodium = require('sodium-native')

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
    let feedKey = ""
    let pk = ""
    return {feedKey, pk}
}

function getPublicKeyFromPeerID(peerID) {
    return splitPeerID(peerID).pk
}

// ------- public functions ------- //

function getFeedKeyFromPeerID(peerID) {
    return splitPeerID(peerID).feedKey
}

function peerIDAlreadyExists(peerID) {
    return false
}

function encryptMessage(plainMessage, otherPeerID) {
    let otherPK = getPublicKeyFromPeerID(otherPeerID)

}

// client
let clientPairs = generateKeyPair()
let cpk = clientPairs.pk
let csk = clientPairs.sk

//server
let serverPairs = generateKeyPair()
let spk = serverPairs.pk
let ssk = serverPairs.sk

// (rx, tx) at client
let clientRXTX = generateReceiveAndTransmissionKeysAsClient(cpk, csk, spk)
let crx = clientRXTX.rx
let ctx = clientRXTX.tx
console.log('client')
console.log(crx.toString('hex'))
console.log(ctx.toString('hex'))

// (rx, tx) at server
let serverRXTX = generateReceiveAndTransmissionKeysAsServer(spk, ssk, cpk)
let srx = serverRXTX.rx
let stx = serverRXTX.tx
console.log('server')
console.log(srx.toString('hex'))
console.log(stx.toString('hex'))