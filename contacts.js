const fs = require('fs')

class Contacts {
    constructor(name) {
        this._name = name
        this._filepath = './persistence/' + name + '.json'
        this._contacts = this._read()
    }

    _read() {
        //TODO: Add decryption
        try {
            return JSON.parse(fs.readFileSync(this._filepath))
        } catch {
            // file is not created. Write an empty dict to file
            fs.writeFileSync(this._filepath, JSON.stringify({}))
            return JSON.parse(fs.readFileSync(this._filepath))
        }
    }

    _write() {
        //TODO: Add encryption
        fs.writeFileSync(this._filepath, JSON.stringify(this._contacts))
    }

    persist(pk, otherChatID, ownChatID, sharedSymKey) {
        this._contacts[pk] = {
            ownChatID: ownChatID,
            otherChatID: otherChatID,
            symKey: sharedSymKey
        }
        this._write()
    }

}

module.exports = Contacts