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
        console.log('known peers:', this._peers)
        return this.getPublicKeyFromPeerID(peerID)
    }

    getAllKnownPeerIDs() {
        return Object.keys(this._peers)
    }

    knows(topic) {
        let peerIDContainingTopic = this._getFirstPeerIDMatchingTopic(topic)
        return this._getPeer(peerIDContainingTopic) !== undefined
    }

    getPublicKeyFromPeerID(peerID) {
        return crypto.getFeedKeyFromPeerID(peerID)
    }

    getPublicKeyFromDiscoveryKey(discoveryKey) {
        return this._getPublicKeyFromPeerID(this._getFirstPeerIDMatchingTopic(discoveryKey))
    }

    generateChallenge(topic) {
        // We need to find the peerID containing topic. 
        let peerIDContainingTopic = this._getFirstPeerIDMatchingTopic(topic)
        return crypto.generateChallenge(this._keypair.sk, this._keypair.pk, this._peerID, peerIDContainingTopic)
    }

    // TODO: This is a really shitty solution....... Find a better one
    _getFirstPeerIDMatchingTopic(topic) {
        return Object.keys(this._peers).map(k => Buffer.from(k, 'hex')).find(peerID => {
            let publicKey = this.getPublicKeyFromPeerID(peerID)
            let discoveryKey = crypto.dicoveryKeyFromPublicKey(publicKey)
            return discoveryKey.equals(topic)
        })
    }

    answerChallenge(ciphertext) {
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