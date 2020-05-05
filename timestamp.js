const Peer = require('./Peer')

const LEQ = 1
const GEQ = 2
const PAR = 3

class Timestamp {

    constructor({ index, vector }) {
        this.index = index
        this.vector = vector
    }

    static init(peer, group, vector) {
        // ensure group is on [Peer] format
        let peers = Array.isArray(group) ? group : group.peers
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
        console.log('incrementing')
        this.vector[this.index] = this.vector[this.index] + 1
    }

    update(other) {
        console.log('updating')
        if (!Array.isArray(other)) {
            // other is 'Timestamp' instance
            other = other.vector
        }

        if (this.vector.length !== other.length) throw new Error("TimeStamper Error: Cannot update vectors of different size")

        for (var i = 0; i < this.vector.length; i++) {
            this.vector[i] = Math.max(this.vector[i], other[i])
        }
        console.log('updating')
        this.increment()
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

    elementwiseDifference(other) {
        let totalDiff = 0
        for (let i = 0; i < this.length; i++) {
            totalDiff += Math.abs(this._array[i] - other._array[i])
        }
        return totalDiff
    }

    moreThan2ElementsDifferBy1(other) {
        let counter = 0
        for (let i = 0; i < this.length; i++) {
            if (Math.abs(this._array[i] - other._array[i]) > 0) counter++
            if (counter == 2) return true
        }
        return false
    }

    _compareTo(otherTimestamp) {
        var leq = 0
        var geq = 0
        var eq = 0

        for (var i = 0; i < this.vector; i++) {
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