const crypto = require('./crypto')
const fs = require('fs')

class Identity {

    constructor(name, myPublicKey) {
        this._filepath = "./persistence/identity" + name + ".json"
        // load keypair and peers from disc
        this._peers = {}
        this._load()
        this._publicKey = myPublicKey
        this._peerID = crypto.createPeerID(this._publicKey, this._keypair.pk)
    }

    /// returns own peerID
    me() {
        return this._peerID
    }

    peers() {
        return Object.keys(this._peers).map(k => Buffer.from(k, 'hex'))
    }

    /// Adds peerID to known peers and returns feed public key for peerID
    addPeer(peerID, isInitiator) {
        // TODO: Should be no-op if we already know peer but right now we can change who is initiator.
        this._peers[peerID.toString('hex')] = isInitiator
        this._save()
        return this.getFeedPublicKeyFromPeerID(peerID)
    }

    getAllKnownPeerIDs() {
        return Object.keys(this._peers)
    }

    knows(topic) {
        let peerIDContainingTopic = this.getFirstPeerIDMatchingTopic(topic)
        return this._getPeer(peerIDContainingTopic) !== undefined
    }

    getFeedPublicKeyFromPeerID(peerID) {
        return crypto.getFeedKeyFromPeerID(peerID)
    }

    getDiscoveryKeyFromPeerID(peerID) {
        return crypto.getDicoveryKeyFromPublicKey(this.getFeedPublicKeyFromPeerID(peerID))
    }

    getFeedPublicKeyFromDiscoveryKey(discoveryKey) {
        return this.getFeedPublicKeyFromPeerID(this.getFirstPeerIDMatchingTopic(discoveryKey))
    }

    generateChallenge(topic) {
        // We need to find the peerID containing topic. 
        let peerIDContainingTopic = this.getFirstPeerIDMatchingTopic(topic)
        return crypto.generateChallenge(this._keypair.sk, this._keypair.pk, this._peerID, peerIDContainingTopic)
    }

    // TODO: This is a really shitty solution....... Find a better one
    getFirstPeerIDMatchingTopic(topic) {
        return this.peers().find(peerID => {
            let publicKey = this.getFeedPublicKeyFromPeerID(peerID)
            let discoveryKey = crypto.getDicoveryKeyFromPublicKey(publicKey)
            return discoveryKey.equals(topic)
        })
    }

    answerChallenge(ciphertext) {
        return crypto.answerChallenge(Buffer.from(ciphertext, 'hex'), this._keypair.pk, this._keypair.sk)
    }

    getDicoveryKeyFromPublicKey(publicKey) {
        return crypto.getDicoveryKeyFromPublicKey(publicKey)
    }

    encryptMessage(plaintext, otherPeerID) {
        return crypto.encryptMessage(plaintext, this._keypair.pk, this._keypair.sk, otherPeerID)
    }

    createEncryptedMessage(plaintext, otherPeerID, dict, ownSeq, otherSeq) {
        let internalMessage = {
            otherSeq: otherSeq || -1,
            message: plaintext
        }
        let cipher = this.encryptMessage(JSON.stringify(internalMessage), otherPeerID).toString('hex')
        let chatID = this.makeChatIDClient(otherPeerID).toString('hex')
        dict[chatID] = ownSeq
        return {
            type: 'message',
            data: {
                dict: dict,
                ciphertext: cipher.toString('hex')
            }
        }
    }

    //TODO: Check if still in use in hyperchat
    canDecryptMessage(message, otherPeerID) {
        let otherPublicKey = crypto.getPublicKeyFromPeerID(otherPeerID)
        let messageChatID = Buffer.from(message.data.chatID, 'hex')

        return crypto.chatIDsMatch(messageChatID, this._keypair.pk, this._keypair.sk, otherPublicKey) !== null
    }

    //TODO: Check if still in use in hyperchat
    //TODO: Can we refactor 'decryptMessage' and 'canDecryptMessage' so that 'crypto.chatIDsMatch' is not called twice?
    decryptMessage(message, otherPeerID) {
        let otherPublicKey = crypto.getPublicKeyFromPeerID(otherPeerID)
        let messageChatID = Buffer.from(message.data.chatID, 'hex')
        let cipherBuffer = Buffer.from(message.data.ciphertext, 'hex')

        switch (crypto.chatIDsMatch(messageChatID, this._keypair.pk, this._keypair.sk, otherPublicKey)) {
            case "matchedSelf":
                return crypto.decryptOwnMessage(cipherBuffer, this._keypair.pk, this._keypair.sk, otherPublicKey).toString('utf-8')
            case "mathedOther":
                return crypto.decryptMessage(cipherBuffer, this._keypair.pk, this._keypair.sk, otherPublicKey).toString('utf-8')
            default:
                return null
        }
    }

    decryptMessageFromOther(ciphertext, otherPeerID) {
        let otherPublicKey = crypto.getPublicKeyFromPeerID(otherPeerID)
        let cipherBuffer = Buffer.from(ciphertext, 'hex')

        return JSON.parse(crypto.decryptMessage(cipherBuffer, this._keypair.pk, this._keypair.sk, otherPublicKey).toString('utf-8'))
    }

    decryptOwnMessage(ciphertext, otherPeerID) {
        let otherPublicKey = crypto.getPublicKeyFromPeerID(otherPeerID)
        let cipherBuffer = Buffer.from(ciphertext, 'hex')
        return crypto.decryptOwnMessage(cipherBuffer, this._keypair.pk, this._keypair.sk, otherPublicKey).toString('utf-8')
    }

    makeChatIDClient(otherPeerID) {
        let otherPublicKey = crypto.getPublicKeyFromPeerID(otherPeerID)
        return crypto.makeChatIDClient(this._keypair.pk, this._keypair.sk, otherPublicKey)
    }

    makeChatIDServer(otherPeerID) {
        let otherPublicKey = crypto.getPublicKeyFromPeerID(otherPeerID)
        return crypto.makeChatIDServer(this._keypair.pk, this._keypair.sk, otherPublicKey)
    }

    _hexKeypairToBuffers(keypair) {
        return {
            pk: Buffer.from(keypair.pk, 'hex'),
            sk: Buffer.from(keypair.sk, 'hex')
        }
    }

    _getPeer(id) {
        return this._peers[id.toString('hex')]
    }

    _load() {
        let obj = {}

        try {
            obj = JSON.parse(fs.readFileSync(this._filepath))
        } catch { }
        if (obj.keypair === undefined) {
            this._keypair = crypto.generateKeyPair()
            this._save()
        } else {
            this._keypair = this._hexKeypairToBuffers(obj.keypair)
        }

        this._peers = obj.peers || {}
    }

    /// Save peers and keypair to disk
    _save() {
        let obj = JSON.stringify({
            keypair: {
                pk: this._keypair.pk.toString('hex'),
                sk: this._keypair.sk.toString('hex')
            },
            peers: this._peers
        })

        fs.writeFileSync(this._filepath, obj)
    }

}

module.exports = Identity