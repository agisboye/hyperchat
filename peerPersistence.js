const crypto = require('./crypto')
const fs = require('fs')

class PeerPersistence {

    constructor(name) {
        this._filepath = "./persistence/peers" + name + ".json"
        // load peers from disc
        this._loadPeers()
    }

    peers() {
        return Object.keys(this._peers).map(k => {
            let res = Buffer.from(k, 'hex')
            return res
        })
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

    knowsPeer(peerID) {
        return this._peers[peerID.toString('hex')] !== undefined
    }

    //TODO: Refactor. It's stupid to just call crypto further down.
    getDiscoveryKeyFromFeedPublicKey(feedKey) {
        return crypto.getDiscoveryKeyFromFeedPublicKey(feedKey)
    }

    //TODO: Refactor. It's stupid to just call crypto further down.
    getFeedPublicKeyFromPeerID(peerID) {
        return crypto.getFeedKeyFromPeerID(peerID)
    }

    //TODO: Refactor. It's stupid to just call crypto further down.
    getDiscoveryKeyFromPeerID(peerID) {
        return crypto.getDiscoveryKeyFromFeedPublicKey(this.getFeedPublicKeyFromPeerID(peerID))
    }

    //TODO: Refactor. It's stupid to just call crypto further down.
    getFeedPublicKeyFromDiscoveryKey(discoveryKey) {
        return this.getFeedPublicKeyFromPeerID(this.getFirstPeerIDMatchingTopic(discoveryKey))
    }

    // TODO: This is a really shitty solution....... Find a better one
    getFirstPeerIDMatchingTopic(topic) {
        return this.peers().find(peerID => {
            let discoveryKey = this.getDiscoveryKeyFromPeerID(peerID)
            return discoveryKey.equals(topic)
        })
    }

    /*
        Private API
    */

    _getPeer(id) {
        return this._peers[id.toString('hex')]
    }

    _loadPeers() {
        let peers;

        try {
            peers = JSON.parse(fs.readFileSync(this._filepath))
        } catch { }

        this._peers = peers || {}
    }

    /// Save peers to disk
    _save() {
        fs.writeFileSync(this._filepath, JSON.stringify(this._peers))
    }
}

module.exports = PeerPersistence