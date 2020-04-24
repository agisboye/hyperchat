const sodium = require('sodium-native')

/// returns (rx, tx)
function _generateClientKeys(clientPublicKey, clientSecretKey, serverPublicKey) {
    let rx = Buffer.alloc(sodium.crypto_kx_SESSIONKEYBYTES)
    let tx = Buffer.alloc(sodium.crypto_kx_SESSIONKEYBYTES)
    sodium.crypto_kx_client_session_keys(rx, tx, clientPublicKey, clientSecretKey, serverPublicKey)
    return { rx, tx }
}

function splitNonceAndCipher(cipherAndNonce) {
    // nonce is always prepended to cipher when encrypted. 
    // Therefore, copy the first part into 'nonce' and second part into 'ciphertext'
    let nonce = Buffer.alloc(sodium.crypto_secretbox_NONCEBYTES)
    let cipher = Buffer.alloc(cipherAndNonce.length - nonce.length)
    cipherAndNonce.copy(nonce, 0, 0, sodium.crypto_secretbox_NONCEBYTES)
    cipherAndNonce.copy(cipher, 0, sodium.crypto_secretbox_NONCEBYTES, cipherAndNonce.length)

    return { nonce, cipher }
}

// ------- public functions ------- //

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

/// returns hash(key || sender feed key)
function makeChatID(key, senderFeedKey) {
    let output = Buffer.alloc(sodium.crypto_generichash_BYTES_MAX)
    sodium.crypto_generichash(output, Buffer.concat([key, senderFeedKey]))
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
    generateSymmetricKey,
    makeChatID,
    encryptMessage,
    decryptMessage
}