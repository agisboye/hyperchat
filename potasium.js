const crypto = require('./crypto')
const Vector = require('./vector')

class Potasium {
    constructor(feed, masterkeys) {
        this._feed = feed
        this._pk = masterkeys.pk
        this._sk = masterkeys.sk
        this.ownPeerID = crypto.createPeerID(feed.key, this._pk)
    }

    /*
        Public API
    */

    generateChallenge(key, receiverPeerID, group) {
        return crypto.generateChallenge(this._sk, this._pk, this.ownPeerID, receiverPeerID, group, key)
    }

    answerChallenge(ciphertext) {
        return crypto.answerChallenge(ciphertext, this._sk, this._pk)
    }

    createEncryptedMessage(plaintext, vector, key, cb) {
        let internalMessage = {
            vector: vector, 
            message: plaintext
        }

        let cipher = crypto.encryptMessage(JSON.stringify(internalMessage), key)

        let chatID = this.makeChatID(key, this._feed.key)

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

    makeChatID(key, senderFeedKey) {
        return crypto.makeChatID(key, senderFeedKey).toString('hex')
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
}

module.exports = Potasium