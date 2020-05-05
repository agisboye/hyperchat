const LESS_THAN = 1
const GREATER_THAN = 2
const PARALLEL = 3

class Timestamp {

    constructor({ index, vector }) {
        this.index = index
        this.vector = vector
    }

    static init(peer, peers, vector) {
        // ensure group is on [Peer] format
        peers.sort((p1, p2) => Buffer.compare(p1.pubKey, p2.pubKey))
        let index = peers.findIndex((p) => peer.equals(p))
        if (index === -1) throw new Error("'peer' is not in 'group'")

        vector = vector || new Array(peers.length).fill(0)
        if (vector.length !== peers.length) throw new Error("'vector' length doesnt match 'group' length")

        return new Timestamp({ index, vector })
    }

    sendableForm() {
        return this.vector
    }

    increment() {
        console.log('incrementing at index', this.index)
        this.vector[this.index] = this.vector[this.index] + 1
    }

    update(other) {
        if (!Array.isArray(other)) {
            // other is 'Timestamp' instance
            other = other.vector
        }

        if (this.vector.length !== other.length) throw new Error("TimeStamper Error: Cannot update vectors of different size")

        for (var i = 0; i < this.vector.length; i++) {
            this.vector[i] = Math.max(this.vector[i], other[i])
        }

        this.increment()

        console.log('updated timestamp =', this.vector)
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

    //TODO: Remove
    // elementwiseDifference(other) {
    //     let totalDiff = 0
    //     for (let i = 0; i < this.length; i++) {
    //         totalDiff += Math.abs(this._array[i] - other._array[i])
    //     }
    //     return totalDiff
    // }

    _compareTo(otherTimestamp) {
        let otherVector = Array.isArray(otherTimestamp) ? otherTimestamp : otherTimestamp.vector
        var lessThan = 0
        var greaterThan = 0
        var equal = 0

        for (var i = 0; i < this.vector.length; i++) {
            if (this.vector[i] < otherVector[i]) lessThan++
            else if (this.vector[i] > otherVector[i]) greaterThan++
            else equal++
        }

        if (equal === this.length) return PARALLEL // If this == other then they are also parallel
        if (lessThan > 0 && greaterThan > 0) return PARALLEL
        if (lessThan > 0) return LESS_THAN
        return GREATER_THAN
    }
}

module.exports = Timestamp