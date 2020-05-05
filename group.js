const crypto = require("./crypto")
const Peer = require('./peer')
const Timestamp = require('./timestamp')

class Group {

    /**
     * 
     * @param {Array<Peer>} peers 
     */
    constructor(peersOrJSON, ownPeer, vectorTimestamp) {
        if (Array.isArray(peersOrJSON) && peersOrJSON[0] instanceof Peer) {
            this.peers = this._sortPeersLexiographically(peersOrJSON)
            this.timestamp = new Timestamp(ownPeer, this, vectorTimestamp)
        } else {
            let json = peersOrJSON
            this.peers = json.peers.map(id => new Peer(id)), 
            this.timestamp = new Timestamp(json.timestamp)
        }
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

    get size() {
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

    toJSON() {
        return {
            peers: this.peers.map(p => p.id),
            timestamp: this.timestamp.toJSON()
        }
    }

    static fromJSON(json) {
        let peers = json.peers.map(id => new Peer(id))
        let vector = Timestamp.f
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