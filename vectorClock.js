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

    if (eq === v1.length) return PAR // If v1 == v2 then they are also parallel
    if (leq > 0 && geq > 0) return PAR
    if (leq > 0) return LEQ
    return GEQ
}

function _minVector(k) {
    return (new Array(k)).fill(Number.NEGATIVE_INFINITY)
}

function _minVectorForVectors(vs) {
    let vectorLength = vs[0][0].length
    return _minVector(vectorLength)
}

// Returns {max: [index], rest: [index]} where max is array with 
// indices of largest vectors (all parallel) and rest contains all other indices
function computeMax(vs) {
    let res = []
    if (vs.length === 0) return res

    let max = _minVectorForVectors(vs)

    for (var i = 0; i < vs.length; i++) {
        let vector = vs[i].prev.vector
        let comparison = _compare(vector, max)
        if (comparison === GEQ) {
            max = vs[i].prev.vector
            res = [vs[i]]
        } else if (comparison === PAR) {
            max = vs[i].prev.vector
            res.push(vs[i])
        }
    }
    return res
}

// CASE 2
// Split c2 into {top, bottom} based on c1_min as reference
// Assumes c1_max > c2_max and c1_min > c2_min
function splitChunkUsingReference(reference, c2) {
    let splitIndex = c2.findIndex((vector) => {
        let res = _compare(vector, reference) === LEQ
        return res
    })

    return {
        before: range(splitIndex, c2.length),
        after: range(0, splitIndex)
    }
}

// Works like pythons 'range' with step = 1
function range(start, stop) {
    var result = [];
    for (var i = start; i < stop; i += 1) {
        result.push(i);
    }

    return result;
};

module.exports = {
    computeMax,
    splitChunkUsingReference,
    range
}