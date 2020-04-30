const crypto = require("./crypto")
const Peer = require('./peer')
class Group {

    /**
     * 
     * @param {Array<Peer>} peers 
     */
    constructor(peers) {
        this.peers = peers
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

    equals(otherGroup) {
        return this.id === otherGroup.id
    }

}

module.exports = Group