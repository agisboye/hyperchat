const crypto = require("./crypto")

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
        const buffers = [...new Set(this.peers)]
                            .map(p => p.pubKey)
                            .sort(Buffer.compare)
        
        const concatenation = Buffer.concat(buffers)
        const hash = crypto.hash(concatenation)

        return hash.toString("hex")
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