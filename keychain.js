const fs = require('fs')
const hypercoreCrypto = require('hypercore-crypto')
const crypto = require('./crypto')

class Keychain {

    constructor(name) {
        this.path = "./persistence/keychain" + name + ".json"
        this._group_keys = {}
        this._loadKeychain()
    }

    /**
     * @returns {Object}
     */
    get myKeypair() {
        let keys = this._my_keys

        if (!keys) {
            keys = hypercoreCrypto.keyPair()
            this._my_keys = keys
            this._saveKeychain()
        }

        return keys
    }

    /**
     * Returns the message encryption key for a given group.
     * If a key doesn't exist yet, one will be generated.
     * @param {Group} group 
     * @returns {Buffer}
     */
    getGroupKey(group) {
        const id = group.id
        let key = this._group_keys[id]

        if (!key) {
            key = crypto.generateSymmetricKey()
            this._group_keys[id] = key
            this._saveKeychain()
        }

        console.log(">keychain: group key=", key.toString("hex").substring(0, 5))
        return key
    }

    /**
     * 
     * @param {Buffer} key 
     * @param {Group} group 
     */
    saveGroupKey(key, group) {
        console.log("> keychain. Saving key=", key.toString('hex').substring(0, 5))
        this._group_keys[group.id] = key
        this._saveKeychain()
    }

    /**
     * Loads keys from disk
     */
    _loadKeychain() {
        this._group_keys = {}

        try {
            // Deserialize
            const file = fs.readFileSync(this.path, 'utf-8')
            const obj = JSON.parse(file)
            this._my_keys = {
                publicKey: Buffer.from(obj.my_keys.publicKey, "hex"),
                secretKey: Buffer.from(obj.my_keys.publicKey, "hex")
            }

            for (let [k, v] of Object.entries(obj.group_keys)) {
                this._group_keys[k] = Buffer.from(v, "hex")
            }

        } catch (err) {}
    }

    /**
     * Saves keys to disk
     */
    _saveKeychain() {
        // Serialize
        const obj = {
            group_keys: {}
        }

        for (let [key, value] of Object.entries(this._group_keys)) {
            obj.group_keys[key] = value.toString("hex")
        }

        if (this._my_keys) {
            obj.my_keys = {
                publicKey: this._my_keys.publicKey.toString("hex"),
                secretKey: this._my_keys.secretKey.toString("hex")
            }
        }

        const plaintext = JSON.stringify(obj)

        fs.writeFileSync(this.path, plaintext)
    }

}

module.exports = Keychain