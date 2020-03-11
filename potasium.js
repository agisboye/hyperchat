const crypto = require('./crypto')

class Potasium {
    constructor(keypair, ownPeerID, feed) {
        this._keypair = keypair
        this._feed = feed
        this._headDict = {}
        this._pendingHeadDict = {}
        this._ownPeerID = ownPeerID

        //TODO: Is this necessary? Needs testing
        feed.on('append', () => {
            this._headDict = this._pendingHeadDict
        })
    }

    /*
        Public API
    */

    generateChallenge(otherPeerID) {
        return crypto.generateChallenge(this._keypair.sk, this._keypair.pk, this._ownPeerID, otherPeerID)
    }

    answerChallenge(ciphertext) {
        return crypto.answerChallenge(Buffer.from(ciphertext, 'hex'), this._keypair.pk, this._keypair.sk)
    }

    createEncryptedMessage(plaintext, otherPeerID, otherSeq) {
        let internalMessage = {
            otherSeq: (otherSeq !== null) ? otherSeq : -1,
            message: plaintext
        }
        let cipher = crypto.encryptMessage(JSON.stringify(internalMessage), this._keypair.pk, this._keypair.sk, otherPeerID)
        let chatID = this.makeChatIDClient(otherPeerID).toString('hex')

        //TODO: Is this necessary? Needs testing
        this._pendingHeadDict = this._headDict
        this._pendingHeadDict[chatID] = this._feed.length
        return {
            type: 'message',
            data: {
                dict: this._pendingHeadDict,
                ciphertext: cipher.toString('hex')
            }
        }
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