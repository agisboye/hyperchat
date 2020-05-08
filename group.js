const crypto = require("./crypto")
const Peer = require('./peer')
const Timestamp = require('./timestamp')

class Group {

    constructor(peers, timestamp) {
        this.peers = peers
        this.timestamp = timestamp
        this._sortAndUniquePeers()
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
        const buffers = this.peers.map(p => p.pubKey)
        const concatenation = Buffer.concat(buffers)
        const hash = crypto.hash(concatenation)
        return hash.toString("hex")
    }

    /**
     * Number of peers in the group.
     */
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

    /**
     * Ensures that the array of peers in this group
     * contains every peer exactly once and that the
     * peers are sorted according to their ID.
     */
    _sortAndUniquePeers() {
        const ids = [...new Set(this.peers.map(p => p.id))]
        this.peers = ids
            .map(id => Buffer.from(id, "hex"))
            .sort(Buffer.compare)
            .map(pubKey => new Peer(pubKey))
    }

}

module.exports = Group