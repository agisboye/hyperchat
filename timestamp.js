const LESS_THAN = 1
const GREATER_THAN = 2
const PARALLEL = 3
const EQUAL = 4

class Timestamp {

    constructor({ index, vector }) {
        this.index = index
        this.vector = vector
    }

    static init(peer, peers, vector) {
        // ensure group is on [Peer] format
        peers.sort((p1, p2) => Buffer.compare(p1.pubKey, p2.pubKey))
        let index = peers.findIndex((p) => peer.equals(p))
        if (index === -1) {
            throw new Error("'peer' is not in 'group'")
        }

        vector = vector || new Array(peers.length).fill(0)
        if (vector.length !== peers.length) throw new Error("'vector' length doesnt match 'group' length")

        return new Timestamp({ index, vector })
    }

    sendableForm() {
        return this.vector
    }

    increment() {
        this.vector[this.index] += 1
    }

    update(other) {
        if (!Array.isArray(other)) {
            // other is 'Timestamp' instance
            other = other.vector
        }

        if (this.vector.length !== other.length) throw new Error("Timestamp Error: Cannot update vectors of different size")

        for (let i = 0; i < this.vector.length; i++) {
            this.vector[i] = Math.max(this.vector[i], other[i])
        }

        this.increment()
    }

    isEqualTo(otherTimestamp) {
        return this._compareTo(otherTimestamp) === EQUAL
    }

    isOlderThan(otherTimestamp) {
        return this._compareTo(otherTimestamp) === LESS_THAN
    }

    isNewerThan(otherTimestamp) {
        return this._compareTo(otherTimestamp) === GREATER_THAN
    }

    isParallelTo(otherTimestamp) {
        return this._compareTo(otherTimestamp) === PARALLEL
    }
    
    _compareTo(otherTimestamp) {
        let otherVector = Array.isArray(otherTimestamp) ? otherTimestamp : otherTimestamp.vector
        let lessThan = 0
        let greaterThan = 0
        let equal = 0

        for (let i = 0; i < this.vector.length; i++) {
            if (this.vector[i] < otherVector[i]) lessThan++
            else if (this.vector[i] > otherVector[i]) greaterThan++
            else equal++
        }

        if (equal === this.vector.length) return EQUAL
        if (lessThan > 0 && greaterThan > 0) return PARALLEL
        if (lessThan > 0) return LESS_THAN
        return GREATER_THAN
    }
}

module.exports = Timestamp