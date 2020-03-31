const crypto = require('./crypto')

class Potasium {
    constructor(keypair, feed) {
        this._keypair = keypair
        this._feed = feed
        this.ownPeerID = crypto.createPeerID(feed.key, keypair.pk)
    }

    /*
        Public API
    */

    generateChallenge2(key, receiverPeerID, otherPeerIDs) {
        return crypto.generateChallenge2(this._keypair.sk, this._keypair.pk, this.ownPeerID, receiverPeerID, otherPeerIDs, key)
    }
    //TODO: Remove when group key distribution works
    // generateChallenge(otherPeerID) {
    //     return crypto.generateChallenge(this._keypair.sk, this._keypair.pk, this._ownPeerID, otherPeerID)
    // }
    //TODO: Remove when group key distribution works 
    // answerChallenge(ciphertext) {
    //     return crypto.answerChallenge(Buffer.from(ciphertext, 'hex'), this._keypair.pk, this._keypair.sk)
    // }

    answerChallenge2(ciphertext) {
        return crypto.answerChallenge2(ciphertext, this._keypair.sk, this._keypair.pk)
    }

    createEncryptedMessage(plaintext, otherPeerID, otherSeq, cb) {
        let internalMessage = {
            ownSeq: this._feed.length + 1,
            otherSeq: (otherSeq !== null) ? otherSeq : -1,
            message: plaintext
        }
        let cipher = crypto.encryptMessage(JSON.stringify(internalMessage), this._keypair.pk, this._keypair.sk, otherPeerID)
        let chatID = this.makeChatIDClient(otherPeerID).toString('hex')

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

    decryptMessageFromOther(ciphertext, otherPeerID) {
        return this._decryptAMessage(ciphertext, otherPeerID, crypto.decryptMessage)
    }

    decryptOwnMessage(ciphertext, otherPeerID) {
        return this._decryptAMessage(ciphertext, otherPeerID, crypto.decryptOwnMessage)
    }

    /*
        Private API
    */

    _decryptAMessage(ciphertext, otherPeerID, decrypter) {
        let otherPublicKey = crypto.getPublicKeyFromPeerID(otherPeerID)
        let cipherBuffer = Buffer.from(ciphertext, 'hex')

        let res = decrypter(cipherBuffer, this._keypair.pk, this._keypair.sk, otherPublicKey)

        return (res) ? JSON.parse(res.toString('utf-8')) : null
    }

    makeChatIDClient(otherPeerID) {
        let otherPublicKey = crypto.getPublicKeyFromPeerID(otherPeerID)
        return crypto.makeChatIDClient(this._keypair.pk, this._keypair.sk, otherPublicKey)
    }

    makeChatIDServer(otherPeerID) {
        let otherPublicKey = crypto.getPublicKeyFromPeerID(otherPeerID)
        return crypto.makeChatIDServer(this._keypair.pk, this._keypair.sk, otherPublicKey)
    }
}

module.exports = Potasium