const sodium = require('sodium-native')

function splitNonceAndCipher(cipherAndNonce) {
    // nonce is always prepended to cipher when encrypted. 
    // Therefore, copy the first part into 'nonce' and second part into 'ciphertext'
    let nonce = Buffer.alloc(sodium.crypto_secretbox_NONCEBYTES)
    let cipher = Buffer.alloc(cipherAndNonce.length - nonce.length)
    cipherAndNonce.copy(nonce, 0, 0, sodium.crypto_secretbox_NONCEBYTES)
    cipherAndNonce.copy(cipher, 0, sodium.crypto_secretbox_NONCEBYTES, cipherAndNonce.length)

    return { nonce, cipher }
}

function generateNonce() {
    let nonce = Buffer.alloc(sodium.crypto_secretbox_NONCEBYTES)
    sodium.randombytes_buf(nonce)
    return nonce
}

function generateSymmetricKey() {
    let nonce = Buffer.alloc(sodium.crypto_secretbox_KEYBYTES)
    sodium.randombytes_buf(nonce)
    return nonce
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