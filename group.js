const crypto = require("./crypto")
const Peer = require('./peer')
const Timestamp = require('./timestamp')

class Group {

    constructor(peers, timestamp) {
        this.peers = this._sortPeersLexiographically(peers)
        this.timestamp = timestamp
    }

    static fromObject(object) {
        const peers = object.peers.map(id => new Peer(id))
        const timestamp = new Timestamp(object.timestamp)
        return new Group(peers, timestamp)
    }

    /**
     * 
     * @param {[Peer]} peers 
     * @param {Peer} ownPeer 
     */
    static init(peers, ownPeer) {
        const timestamp = Timestamp.init(ownPeer, peers)
        return new Group(peers, timestamp)
    }

    get id() {
        // Sort peers to ensure we always get the same
        // hash for the same set of peers.
        const ids = [...new Set(this.peers.map(p => p.id))]
        const uniquePeers = ids.map(id => new Peer(id))

        const buffers = uniquePeers
            .map(p => p.pubKey)
            .sort(Buffer.compare)

        const concatenation = Buffer.concat(buffers)
        const hash = crypto.hash(concatenation)

        return hash.toString("hex")
    }

    get length() {
        return this.peers.length
    }

    /**
     * Determines whether the group contains a given peer.
     * @param {Peer} peer 
     * @returns {boolean}
     */
    contains(peer) {
        return this.peers.find(p => p.equals(peer)) !== undefined
    }

    toString() {
        let str = "[" + this.id.toString("hex") + "] "
        str += this.peers.reduce((acc, peer) => acc + peer.id.substring(0, 6) + ".. ,")
        return str
    }

    toSaveableForm() {
        return {
            peers: this.peers.map(p => p.id),
            timestamp: this.timestamp
        }
    }

    equals(otherGroup) {
        return this.id === otherGroup.id
    }

    _sortPeersLexiographically(peers) {
        const uniquePeerkeys = [...new Set(peers.map(p => p.pubKey))]
        uniquePeerkeys.sort(Buffer.compare)

        let sortedUniquePeers = uniquePeerkeys.map(id => new Peer(id))
        return sortedUniquePeers
    }

}

module.exports = Group