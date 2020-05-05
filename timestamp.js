const LEQ = 1
const GEQ = 2
const PAR = 3

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

    leq(otherTimestamp) {
        return this._compareTo(otherTimestamp) === LEQ
    }

    geq(otherTimestamp) {
        return this._compareTo(otherTimestamp) === GEQ
    }

    par(otherTimestamp) {
        return this._compareTo(otherTimestamp) === PAR
    }

    // elementwiseDifference(other) {
    //     let totalDiff = 0
    //     for (let i = 0; i < this.length; i++) {
    //         totalDiff += Math.abs(this._array[i] - other._array[i])
    //     }
    //     return totalDiff
    // }

    _compareTo(otherTimestamp) {
        var leq = 0
        var geq = 0
        var eq = 0

        for (var i = 0; i < this.vector.length; i++) {
            if (this.vector[i] < otherTimestamp.vector[i]) leq++
            else if (this.vector[i] > otherTimestamp.vector[i]) geq++
            else eq++
        }

        if (eq === this.length) return PAR // If this == other then they are also parallel
        if (leq > 0 && geq > 0) return PAR
        if (leq > 0) return LEQ
        return GEQ
    }
}

module.exports = Timestamp