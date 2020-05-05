const crypto = require('./crypto')

class Potasium {
    constructor(feed) {
        this._feed = feed
    }

    createEncryptedMessage(plaintext, vectorTimestamp, key, cb) {
        let internalMessage = {
            vector: vectorTimestamp,
            message: plaintext
        }

        let cipher = crypto.encryptMessage(JSON.stringify(internalMessage), key)
        let chatID = crypto.makeChatID(key, this._feed.key).toString('hex')

        this._feed.head((err, head) => {
            let dict = (err) ? {} : head.data.dict
            dict[chatID] = this._feed.length
            cb({
                type: 'message',
                data: {
                    dict: dict,
                    ciphertext: cipher.toString('hex')
                }
            })
        })
    }

    decryptMessageUsingKey(ciphertext, key) {
        let res = crypto.decryptMessage(ciphertext, key)
        if (!res) return null

        return JSON.parse(res.toString('utf-8'))
    }

    //TODO: Remove. Unused
    _makeTimestamp(keysAndLengths) {
        // We need to add 1 to our own feed length before appending the message (vector clock invariant)
        let vector = keysAndLengths.map(({ feedkey, length }) => length)
        let indexOfOwnKey = keysAndLengths.findIndex(({ feedkey, length }) => this._feed.key.equals(feedkey))

        vector[indexOfOwnKey] = vector[indexOfOwnKey] + 1
        return vector
    }
}

module.exports = Potasium