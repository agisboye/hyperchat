const crypto = require('./crypto')

class Potasium {
    constructor(feed) {
        this._feed = feed
    }

    createEncryptedMessage(plaintext, vector, key, cb) {
        let internalMessage = {
            vector: vector, 
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

        return (res) ? JSON.parse(res.toString('utf-8')) : null
    }

}

module.exports = Potasium