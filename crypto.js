const sodium = require('sodium-native')

function genereateSymKeyBuffer() {
    let key = sodium.sodium_malloc(sodium.crypto_secretbox_KEYBYTES)
    sodium.randombytes_buf(key)
    return key
}

function generateSymKey() {
    return genereateSymKeyBuffer().toString('hex')
}

/// plainMessage: string
/// key: string (utf-8)
/// returns: Buffer
function getEncryptedMessageBuffer(plainMessage, key) {
    let ciphertext = Buffer.alloc(plainMessage.length + sodium.crypto_secretbox_MACBYTES)
    let message = Buffer.from(plainMessage)
    let nonce = Buffer.alloc(sodium.crypto_secretbox_NONCEBYTES)
    sodium.randombytes_buf(nonce)
    let secretKey = sodium.sodium_malloc(sodium.crypto_secretbox_KEYBYTES)
    secretKey.write(key, 'hex')
    sodium.crypto_secretbox_easy(ciphertext, message, nonce, secretKey)
    // Prepend nonce to ciphertext
    let nonceAndCipher = Buffer.concat([nonce, ciphertext])
    return nonceAndCipher
}

/// plainMessage: string
/// key: string (utf-8)
/// returns: string (utf-8)
function getEncryptedMessage(plainMessage, key) {
    return getEncryptedMessageBuffer(plainMessage, key).toString('utf-8')
}


/// nonceAndCipherText: Buffer
/// key: string (utf-8)
/// returns: string (utf-8)
/// Throws on unsuccessful decryption
function tryDecryptMessageBuffer(nonceAndCipherText, key) {
    // nonce is always prepended to ciphertext. Copy the first part into 'nonce' and second part into 'ciphertext'
    let nonce = Buffer.alloc(sodium.crypto_secretbox_NONCEBYTES)
    let ciphertext = Buffer.alloc(nonceAndCipherText.length - nonce.length)
    nonceAndCipherText.copy(nonce, 0, 0, sodium.crypto_secretbox_NONCEBYTES)
    nonceAndCipherText.copy(ciphertext, 0, sodium.crypto_secretbox_NONCEBYTES, nonceAndCipherText.length)

    let plainText = Buffer.alloc(ciphertext.length - sodium.crypto_secretbox_MACBYTES)
    let secretKey = sodium.sodium_malloc(sodium.crypto_secretbox_KEYBYTES)
    secretKey.write(key, 'hex')

    if (sodium.crypto_secretbox_open_easy(plainText, ciphertext, nonce, secretKey)) {
        return plainText.toString('utf-8')
    } else {
        throw Error('tryDecryptMessageBuffer failed')
    }
}

/// nonceAndCipherText: string(utf-8)
/// key: string (utf-8)
/// returns: string (utf-8)
/// Throws on unsuccessful decryption
function tryDecryptMessage(nonceAndCipherText, key) {
    let nonceAndCipherBuffer = Buffer.from(nonceAndCipherText)
    return tryDecryptMessageBuffer(nonceAndCipherBuffer, key)
}





module.exports = {
    getEncryptedMessage: getEncryptedMessage,
    tryDecryptMessage: tryDecryptMessage,
    generateSymKey: generateSymKey
}