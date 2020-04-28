const LEQ = 1
const GEQ = 2
const PAR = 3

class Vector {
    constructor(array) {
        this._array = array
        this.length = array.length
    }

    _compareTo(other) {
        var leq = 0
        var geq = 0
        var eq = 0

        for (var i = 0; i < this.length; i++) {
            if (this._array[i] < other._array[i]) leq++
            else if (this._array[i] > other._array[i]) geq++
            else eq++
        }

        if (eq === this.length) return PAR // If this == other then they are also parallel
        if (leq > 0 && geq > 0) return PAR
        if (leq > 0) return LEQ
        return GEQ
    }

    leq(other) {
        return this._compareTo(other) === LEQ
    }

    geq(other) {
        return this._compareTo(other) === GEQ
    }

    par(other) {
        return this._compareTo(other) === PAR
    }

    elementwiseDifference(other) {
        let totalDiff = 0
        for (let i = 0; i < this.length; i++) {
            totalDiff += Math.abs(this._array[i] - other._array[i])
        }
        return totalDiff
    }

}

module.exports = Vector