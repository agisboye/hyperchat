const crypto = require('./crypto')
const fs = require('fs')
const sodium = require('sodium-native')

class KeyChain {

    constructor(name) {
        //TODO: name is only used for making distinct filepaths. Should be removed in production. 
        this._keyChainFilepath = "./persistence/keychain" + name + ".txt"
        this._masterKeysFilePath = "./persistence/masterkeys" + name + ".json"
        this._loadMasterKeys()

        // Map from hash of peers in a DM to corresponding secret key for that DM.
        // <hash(otherPeers), key> 
        this._loadKeyChain()
    }

    // TODO: This is error-prone. Refactor the creation of peerIDs from potasium 
    // such that this setter can be done in initialiser of KeyChain. 
    setOwnPeerID(id) {
        // Invariant: ownPeerID is always added to all 'peerIDs'
        this._ownPeerID = id.toString('hex')
    }

    /// Returns secret key for DM with 'peerIDs'. 
    /// If DM is new, a secret key is generated, saved, and returned. 
    getKeyForGroup(group) {
        let hash = this._hashGroup(group)
        let key = this._keys[hash]

        if (key) {
            console.log(">keychain: key=", key.substring(0, 5))
            return Buffer.from(key, 'hex')
        }
        key = crypto.generateSymmetricKey()
        this._keys[hash] = key.toString('hex')

        this._saveKeyChain()

        console.log("> keychain: key=", key.toString('hex').substring(0, 5))
        return key
    }

    saveKeyForPeerIDs(key, peerIDs) {
        let hash = this._hashGroup(peerIDs)
        console.log("> keychain. Saving key=", key.toString('hex').substring(0, 5))
        this._keys[hash] = key.toString('hex')
        this._saveKeyChain()
    }

    _loadMasterKeys() {
        let masterkeys = {}

        try {
            masterkeys = JSON.parse(fs.readFileSync(this._masterKeysFilePath))
        } catch { }
        if (masterkeys.pk === undefined || masterkeys.sk === undefined) {
            this.masterKeys = crypto.generateKeyPair()
            this._saveMasterKeys()
        } else {
            this.masterKeys = this._hexKeypairToBuffers(masterkeys)
        }
    }

    // decrypts keys and loads them into '_keys'
    _loadKeyChain() {
        try {
            let file = fs.readFileSync(this._keyChainFilepath, 'utf-8')
            let nonceAndCipher = Buffer.from(file, 'hex')

            let { nonce, cipher } = crypto.splitNonceAndCipher(nonceAndCipher)
            let plainTextBuffer = Buffer.alloc(cipher.length - sodium.crypto_secretbox_MACBYTES)

            if (sodium.crypto_secretbox_open_easy(plainTextBuffer, cipher, nonce, this.masterKeys.sk)) {
                this._keys = JSON.parse(plainTextBuffer.toString('utf-8'))
            } else {
                throw new Error("keychhain decryption failed...")
            }
        } catch (err) {
            this._keys = {}
            this._saveKeyChain()
        }
    }

    // Encrypt and save '_keys' to disk
    _saveKeyChain() {
        let plaintext = Buffer.from(JSON.stringify(this._keys), 'utf-8')
        let cipher = Buffer.alloc(plaintext.length + sodium.crypto_secretbox_MACBYTES)
        let nonce = crypto.generateNonce()
        sodium.crypto_secretbox_easy(cipher, plaintext, nonce, this.masterKeys.sk)

        let nonceAndCipher = Buffer.concat([nonce, cipher]).toString('hex')
        fs.writeFileSync(this._keyChainFilepath, nonceAndCipher)
    }

    /// Save masterkeys to disk unencrypted. Should be encrypted using a password in the real world
    _saveMasterKeys() {
        let obj = JSON.stringify(this.masterKeys)

        fs.writeFileSync(this._masterKeysFilePath, obj)
    }

    _hashGroup(group) {
        // Ensure that own peer ID is part of 'peerIDs'
        group = group.map(p => p.toString('hex'))
        let peerIDSet = new Set(group)
        peerIDSet.add(this._ownPeerID)

        group = [...peerIDSet]
        // We need to sort the peers lexiographically because a 
        // DM between A and B is identical to a DM between B and A
        group.sort((p1, p2) => p1.localeCompare(p2))
        group = group.map((p) => Buffer.from(p, 'hex'))

        this._printpeers(group)
        return crypto.hash(Buffer.concat(group)).toString('hex')
    }

    _hexKeypairToBuffers(keypair) {
        return {
            pk: Buffer.from(keypair.pk, 'hex'),
            sk: Buffer.from(keypair.sk, 'hex')
        }
    }

    _printpeers(peers) {
        let str = "["
        peers.forEach(p => {
            str += p.toString('hex').substring(0, 5) + ", "
        })
        str += "]"
        console.log('> keychain:', str)
    }
}

module.exports = KeyChain