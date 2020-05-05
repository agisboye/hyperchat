const Peer = require('./Peer')

const LEQ = 1
const GEQ = 2
const PAR = 3

class Timestamp {
    //TODO: Fix dual constructors based on augusts messages
    constructor(peerOrJSON, group, vector) {
        if (peerOrJSON.constructor.name === "Peer") {
            let peer = peerOrJSON
            this._init(peer, group, vector)
        } else {
            let json = peerOrJSON
            this.vector = json.vector
            this.index = json.index
        }
    }

    _init(peer, group, vector) {
        this.index = group.peers.findIndex((p) => peer.equals(p))
        if (this.index === -1) throw new Error("'peer' is not in 'group'")
        if (!!vector && vector.length !== group.size) throw new Error("'vector' length doesnt matche 'group' size")
        this.vector = vector || new Array(group.size).fill(0)
    }

    toJSON() {
        return {
            vector: this.vector,
            index: this.index
        }
    }


    finalise() {
        return this.vector
    }


    increment() {
        console.log("incrmenting")
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