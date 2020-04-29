const crypto = require('./crypto')
const Vector = require('./vector')

class Potasium {
    constructor(feed) {
        this._feed = feed
    }

    createEncryptedMessage(plaintext, vector, key, cb) {
        let internalMessage = {
            vector: this._makeTimestamp(lengthsAndKeys),
            message: plaintext
        }

        let cipher = crypto.encryptMessage(JSON.stringify(internalMessage), key)
        let chatID = crypto.makeChatID(key, this._feed.key).toString('hex')
        console.log("> createEncryptedMessage: key=", key.toString('hex').substring(0, 10))

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

    //TODO: How do we obtain all other peerIDs in the group only from 'peerID'? We need some kind of map here.
    decryptMessageUsingKey(ciphertext, key) {
        let res = crypto.decryptMessage(ciphertext, key)
        if (!res) return null

        let parsed = JSON.parse(res.toString('utf-8'))
        // convert [int] to Vector
        parsed.vector = new Vector(parsed.vector)
        return parsed
    }

    _makeTimestamp(keysAndLengths) {
        // We need to add 1 to our own feed length before appending the message (vector clock invariant)
        let vector = keysAndLengths.map(({ feedkey, length }) => length)
        let indexOfOwnKey = keysAndLengths.findIndex(({ feedkey, length }) => this._feed.key.equals(feedkey))

        vector[indexOfOwnKey] = vector[indexOfOwnKey] + 1
        return vector
    }
}

module.exports = Potasium