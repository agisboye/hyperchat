const crypto = require('./crypto')
const fs = require('fs')
const sodium = require('sodium-native')

class KeyChain {

    /// master key is used for encrypting the keychain on disk
    constructor(name, masterkey) {
        //TODO: name is only used for making distinct filepaths. Should be removed in production. 
        this._masterkey = masterkey
        this._filepath = "./persistence/keychain" + name + ".txt"
        // Map from hash of peers in a DM to corresponding secret key for that DM.
        // <hash(otherPeers), key> 
        this._load()
    }

    /// Returns secret key for DM with 'peerIDs'. 
    /// If DM is new, a secret key is generated, saved, and returned. 
    getKeyForPeerIDs(peerIDs) {
        let hash = this._hashPeers(peerIDs)
        let key = this._keys[hash]

        if (key) return Buffer.from(key, 'hex')

        key = crypto.generateSymmetricKey()
        this._keys[hash] = key.toString('hex')

        this._save()

        return key
    }

    saveKeyForPeerIDs(key, peerIDs) {
        let hash = this._hashPeers(peerIDs)
        this._keys[hash] = key.toString('hex')
        this._save()
    }

    // decrypts keys and loads them into '_keys'
    _load() {
        try {
            let file = fs.readFileSync(this._filepath, 'utf-8')
            let nonceAndCipher = Buffer.from(file, 'hex')

            let { nonce, cipher } = crypto.splitNonceAndCipher(nonceAndCipher)
            let plainTextBuffer = Buffer.alloc(cipher.length - sodium.crypto_secretbox_MACBYTES)

            if (sodium.crypto_secretbox_open_easy(plainTextBuffer, cipher, nonce, this._masterkey)) {
                this._keys = JSON.parse(plainTextBuffer.toString('utf-8'))
            } else {
                throw new Error("keychhain decryption failed...")
            }
        } catch (err) {
            this._keys = {}
            this._save()
        }
    }

    // Encrypt and save '_keys' to disk
    _save() {
        let plaintext = Buffer.from(JSON.stringify(this._keys), 'utf-8')
        let cipher = Buffer.alloc(plaintext.length + sodium.crypto_secretbox_MACBYTES)
        let nonce = crypto.generateNonce()
        sodium.crypto_secretbox_easy(cipher, plaintext, nonce, this._masterkey)

        let nonceAndCipher = Buffer.concat([nonce, cipher]).toString('hex')
        fs.writeFileSync(this._filepath, nonceAndCipher)
    }

    _hashPeers(peerIDs) {
        // We need to sort the peers lexiographically because a 
        // DM between A and B is identical to a DM between B and A
        let peerIDStrings = peerIDs.map((p) => p.toString('hex'))
        peerIDStrings.sort((p1, p2) => p1.localeCompare(p2))
        peerIDs = peerIDStrings.map((p) => Buffer.from(p, 'hex'))

        let output = Buffer.alloc(sodium.crypto_generichash_BYTES_MAX)
        sodium.crypto_generichash(output, Buffer.concat(peerIDs))
        return output.toString('hex')
    }
}

module.exports = KeyChain