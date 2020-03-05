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
        let peerIDContainingTopic = this._getFirstPeerIDMatchingTopic(topic)
        return this._getPeer(peerIDContainingTopic) !== undefined
    }

    getFeedPublicKeyFromPeerID(peerID) {
        return crypto.getFeedKeyFromPeerID(peerID)
    }

    getPublicKeyFromDiscoveryKey(discoveryKey) {
        return this.getFeedPublicKeyFromPeerID(this._getFirstPeerIDMatchingTopic(discoveryKey))
    }

    generateChallenge(topic) {
        // We need to find the peerID containing topic. 
        let peerIDContainingTopic = this._getFirstPeerIDMatchingTopic(topic)
        return crypto.generateChallenge(this._keypair.sk, this._keypair.pk, this._peerID, peerIDContainingTopic)
    }

    // TODO: This is a really shitty solution....... Find a better one
    _getFirstPeerIDMatchingTopic(topic) {
        return Object.keys(this._peers).map(k => Buffer.from(k, 'hex')).find(peerID => {
            let publicKey = this.getFeedPublicKeyFromPeerID(peerID)
            let discoveryKey = crypto.dicoveryKeyFromPublicKey(publicKey)
            let peerIDs = peerID.toString('hex')
            let pks = publicKey.toString('hex')
            let dks = discoveryKey.toString('hex')
            return discoveryKey.equals(topic)
        })
    }

    answerChallenge(ciphertext) {
        //TODO: Change this to just return res
        let res = crypto.answerChallenge(Buffer.from(ciphertext, 'hex'), this._keypair.pk, this._keypair.sk)
        if (res) {
            return res
        } else {
            return null
        }
    }

    dicoveryKeyFromPublicKey(publicKey) {
        return crypto.dicoveryKeyFromPublicKey(publicKey)
    }

    encryptMessage(plaintext, otherPeerID) {
        let cipherTextBuffer = crypto.encryptMessage(plaintext, this._keypair.pk, this._keypair.sk, otherPeerID)
        return cipherTextBuffer
    }

    _getPeer(id) {
        return this._peers[id.toString('hex')]
    }

    decryptMessage(letter, topic) {
        let topicString = topic.toString('hex')
        let otherPeerID = this._getFirstPeerIDMatchingTopic(topic)

        let myChatID = this.makeChatIDServer(otherPeerID)
        let theirChatID = Buffer.from(letter.data.chatID, 'hex')

        let res = myChatID.equals(theirChatID)
        if (!res) {
            return null
        } else {
            // try to decrypt the message
        }

        let ciphertext = cipher.ciphertext

        let cipherBuffer = Buffer.from(ciphertext, 'hex')
        return crypto.decryptMessage(cipherBuffer, this._keypair.pk, this._keypair.sk, Buffer.from(otherPeerID, 'hex')).toString('utf-8')
    }

    makeChatIDServer(otherPeerID) {
        let otherPublicKey = crypto._getPublicKeyFromPeerID(otherPeerID)
        return crypto.makeChatIDServer(this._keypair.pk, this._keypair.sk, otherPublicKey)
    }

    makeChatIDClient(otherPeerID) {
        let otherPublicKey = crypto._getPublicKeyFromPeerID(otherPeerID)
        let pk = this._keypair.pk.toString('hex')
        let sk = this._keypair.sk.toString('hex')
        let otherpk = otherPublicKey.toString('hex')
        return crypto.makeChatIDClient(this._keypair.pk, this._keypair.sk, otherPublicKey)
    }

    _hexKeypairToBuffers(keypair) {
        return {
            pk: Buffer.from(keypair.pk, 'hex'),
            sk: Buffer.from(keypair.sk, 'hex')
        }
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