const crypto = require('./crypto')

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

    generateChallenge(key, receiverPeerID, otherPeerIDs) {
        return crypto.generateChallenge(this._sk, this._pk, this.ownPeerID, receiverPeerID, otherPeerIDs, key)
    }

    answerChallenge(ciphertext) {
        return crypto.answerChallenge(ciphertext, this._sk, this._pk)
    }

    //TODO: Should be extended to allow for encrypted group messages
    createEncryptedMessage(plaintext, otherSeq, key, cb) {
        let internalMessage = this._wrapMessage(plaintext, otherSeq)

        let cipher = crypto.encryptMessage(JSON.stringify(internalMessage), key)

        let chatID = this.makeChatID(key, this.ownPeerID)

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

    makeChatID(key, senderPeerID) {
        return crypto.makeChatID(key, senderPeerID)
    }

    //TODO: How do we obtain all other peerIDs in the group only from 'peerID'? We need some kind of map here.
    decryptMessageUsingKey(ciphertext, key) {
        let res = crypto.decryptMessage(ciphertext, key)

        return (res) ? JSON.parse(res.toString('utf-8')) : null
    }
    /*
        Private API
    */

    _wrapMessage(plaintext, otherSeq) {
        return {
            ownSeq: this._feed.length + 1,
            otherSeq: (otherSeq !== null) ? otherSeq : -1,
            message: plaintext
        }
    }
}

module.exports = Potasium