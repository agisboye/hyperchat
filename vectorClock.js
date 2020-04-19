const EQ = 0
const LEQ = 1
const GEQ = 2
const PAR = 3

function _compare(v1, v2) {
    var leq = 0
    var geq = 0
    var eq = 0

    for (var i = 0; i < v1.length; i++) {
        if (v1[i] < v2[i]) leq++
        else if (v1[i] > v2[i]) geq++
        else eq++
    }

    if (eq === v1.length) return EQ
    if (leq > 0 && geq > 0) return PAR
    if (leq > 0) return LEQ
    return GEQ
}

function _minVector(k) {
    return (new Array(k)).fill(Number.NEGATIVE_INFINITY)
}

/// returns the largest of the vectors in 'vs'
function max(vs) {
    if (vs.length === 0) return null
    let max = _minVector(vs[0].prev.vector.length)
    let res = []

    for (var i = 0; i < vs.length; i++) {
        let vector = vs[i].prev.vector
        let comparison = _compare(vector, max)
        if (comparison === GEQ) {
            max = vs[i].prev.vector
            res = [vs[i]]
        } else if (comparison === PAR || comparison === EQ) {
            max = vs[i].prev.vector
            res.push(vs[i])
        }
    }
    return res
}

module.exports = {
    max
}