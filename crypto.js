const sodium = require('sodium-native')

function getEncryptedMessage(plainMessage, key) {
    let ciphertext = Buffer.alloc(plainMessage.length + sodium.crypto_secretbox_MACBYTES)
    let message = Buffer.from(plainMessage)
    let nonce = Buffer.alloc(sodium.crypto_secretbox_NONCEBYTES)
    sodium.randombytes_buf(nonce)
    let secretKey = sodium.sodium_malloc(sodium.crypto_secretbox_KEYBYTES)
    secretKey.write(key, 'utf-8')
    sodium.crypto_secretbox_easy(ciphertext, message, nonce, secretKey)
    // Prepend nonce to ciphertext
    let nonceAndCipher = Buffer.concat([nonce, ciphertext])
    return nonceAndCipher
}

function tryDecryptMessage(nonceAndCipherText, key) {
    // nonce is always prepended to ciphertext. Copy the first part into 'nonce'
    let nonce = Buffer.alloc(sodium.crypto_secretbox_NONCEBYTES)
    let ciphertext = Buffer.alloc(nonceAndCipherText.length - nonce.length)
    nonceAndCipherText.copy(nonce, 0, 0, sodium.crypto_secretbox_NONCEBYTES)
    nonceAndCipherText.copy(ciphertext, 0, sodium.crypto_secretbox_NONCEBYTES, nonceAndCipherText.length)

    let plainText = Buffer.alloc(ciphertext.length - sodium.crypto_secretbox_MACBYTES)
    let secretKey = sodium.sodium_malloc(sodium.crypto_secretbox_KEYBYTES)
    secretKey.write(key, 'utf-8')

    if (sodium.crypto_secretbox_open_easy(plainText, ciphertext, nonce, secretKey)) {
        return plainText.toString('utf-8')
    } else {
        throw Error('tryDecryptMessage failed')
    }
}

let symKey = "this is a very secure secret key"
let encrypted = getEncryptedMessage("hello world", symKey)

try {
    console.log(tryDecryptMessage(encrypted, symKey))
} catch (err) {
    console.log(err)
}
