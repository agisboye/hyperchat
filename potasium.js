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

    generateChallenge2(key, receiverPeerID, otherPeerIDs) {
        return crypto.generateChallenge2(this._sk, this._pk, this.ownPeerID, receiverPeerID, otherPeerIDs, key)
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
        return crypto.answerChallenge2(ciphertext, this._sk, this._pk)
    }

    //TODO: Should be extended to allow for encrypted group messages
    createEncryptedMessage2(plaintext, otherSeq, key, cb) {
        let internalMessage = this._wrapMessage(plaintext, otherSeq)

        let cipher = crypto.encryptMessage2(JSON.stringify(internalMessage), key)

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
        return crypto.makeChatID2(key, senderPeerID)
    }

    //TODO: Remove
    // createEncryptedMessage(plaintext, otherPeerID, otherSeq, cb) {
    //     let internalMessage = {
    //         ownSeq: this._feed.length + 1,
    //         otherSeq: (otherSeq !== null) ? otherSeq : -1,
    //         message: plaintext
    //     }
    //     let cipher = crypto.encryptMessage(JSON.stringify(internalMessage), this._keypair.pk, this._keypair.sk, otherPeerID)
    //     let chatID = this.makeChatIDClient(otherPeerID).toString('hex')

    //     this._feed.head((err, head) => {
    //         let dict = (err) ? {} : head.data.dict
    //         dict[chatID] = this._feed.length
    //         cb({
    //             type: 'message',
    //             data: {
    //                 dict: dict,
    //                 ciphertext: cipher.toString('hex')
    //             }
    //         })
    //     })
    // }

    //TODO: Remove
    // decryptMessageFromOther(ciphertext, otherPeerID) {
    //     return this._decryptAMessage(ciphertext, otherPeerID, crypto.decryptMessage)
    // }

    // //TODO: Remove
    // decryptOwnMessage(ciphertext, otherPeerID) {
    //     return this._decryptAMessage(ciphertext, otherPeerID, crypto.decryptOwnMessage)
    // }

    //TODO: How do we obtain all other peerIDs in the group only from 'peerID'? We need some kind of map here.
    decryptMessageUsingKey(ciphertext, key) {
        let res = crypto.decryptMessage2(ciphertext, key)

        return (res) ? JSON.parse(res.toString('utf-8')) : null
    }
    /*
        Private API
    */

    // TODO: Remove
    // _decryptAMessage(ciphertext, otherPeerID, decrypter) {
    //     let otherPublicKey = crypto.getPublicKeyFromPeerID(otherPeerID)
    //     let cipherBuffer = Buffer.from(ciphertext, 'hex')

    //     let res = decrypter(cipherBuffer, this._pk, this._sk, otherPublicKey)

    //     return (res) ? JSON.parse(res.toString('utf-8')) : null
    // }

    //TODO: Remove. Is unused
    // makeChatIDClient(otherPeerID) {
    //     let otherPublicKey = crypto.getPublicKeyFromPeerID(otherPeerID)
    //     return crypto.makeChatIDClient(this._pk, this._sk, otherPublicKey)
    // }

    //TODO: Remove. Is unused
    // makeChatIDServer(otherPeerID) {
    //     let otherPublicKey = crypto.getPublicKeyFromPeerID(otherPeerID)
    //     return crypto.makeChatIDServer(this._pk, this._sk, otherPublicKey)
    // }

    _wrapMessage(plaintext, otherSeq) {
        return {
            ownSeq: this._feed.length + 1,
            otherSeq: (otherSeq !== null) ? otherSeq : -1,
            message: plaintext
        }
    }
}

module.exports = Potasium