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

    me() {
        return this._peerID
    }

    keypair() {
        return this._keypair
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

    // TODO: This is a really shitty solution....... Find a better one
    getFirstPeerIDMatchingTopic(topic) {
        return this.peers().find(peerID => {
            let publicKey = this.getFeedPublicKeyFromPeerID(peerID)
            let discoveryKey = crypto.getDicoveryKeyFromPublicKey(publicKey)
            return discoveryKey.equals(topic)
        })
    }

    getDicoveryKeyFromPublicKey(publicKey) {
        return crypto.getDicoveryKeyFromPublicKey(publicKey)
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