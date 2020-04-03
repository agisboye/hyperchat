const crypto = require('./crypto')
const fs = require('fs')

class PeerPersistence {

    constructor(name) {
        this._filepath = "./persistence/peers" + name + ".json"
        // load peers from disc
        this._loadPeers()
    }

    peers() {
        return [... this._peers].map(p => Buffer.from(p, 'hex'))
    }

    /// Adds peerID to known peers and returns feed public key for peerID
    addPeer(peerID) {
        // TODO: Should be no-op if we already know peer but right now we can change who is initiator.
        this._peers.add(peerID.toString('hex'))
        this._save()
        return this.getFeedPublicKeyFromPeerID(peerID)
    }

    knowsPeer(peerID) {
        return this._peers.has(peerID.toString('hex'))
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

    _loadPeers() {
        let peers;

        try {
            peers = JSON.parse(fs.readFileSync(this._filepath))
        } catch { }

        this._peers = peers || new Set()
    }

    /// Save peers to disk
    _save() {
        fs.writeFileSync(this._filepath, JSON.stringify(this._peers))
    }
}

module.exports = PeerPersistence