// const LEQ = 1
// const GEQ = 2
// const PAR = 3


// function compare(v1, v2) {
//     var leq = 0
//     var geq = 0
//     var eq = 0

//     for (var i = 0; i < v1.length; i++) {
//         if (v1[i] < v2[i]) leq++
//         else if (v1[i] > v2[i]) geq++
//         else eq++
//     }

//     if (eq === v1.length) return PAR // If v1 == v2 then they are also parallel
//     if (leq > 0 && geq > 0) return PAR
//     if (leq > 0) return LEQ
//     return GEQ
// }

// function _minVector(k) {
//     return (new Array(k)).fill(Number.NEGATIVE_INFINITY)
// }

// function _minVectorForVectors(vs) {
//     let vectorLength = vs[0].chunk[0].vector.length //TODO: Fix too tight coupling
//     return _minVector(vectorLength)
// }

// // Returns {max: [index], rest: [index]} where max is array with 
// // indices of largest vectors (all parallel) and rest contains all other indices
// function max(vs) {
//     let res = []
//     if (vs.length === 0) return res

//     let max = _minVectorForVectors(vs)

//     for (var i = 0; i < vs.length; i++) {
//         let vector = vs[i].message.vector
//         let comparison = compare(vector, max)
//         if (comparison === GEQ) {
//             max = vs[i].message.vector
//             res = [vs[i]]
//         } else if (comparison === PAR) {
//             max = vs[i].prev.vector
//             res.push(vs[i])
//         }
//     }
//     return res
// }

//TODO: Refactor out of vectorclock
function compare(enumeratedChunks) {
    let chunk1 = enumeratedChunks[0].chunk
    let chunk2 = enumeratedChunks[1].chunk
    chunk2Index = enumeratedChunks[1].index
    return case2(chunk1, chunk2, chunk2Index)
}

// CASE 1 is assumed
function case1(chunk1, chunk2) {
    return {
        left: range(0, chunk1.length),
        right: [],
        rest: range(0, chunk2.length)
    }
}

// CASE 2 is assumed (chunk1 splits chunk2)
function case2(chunk1, chunk2, chunk2Index) {
    let reference = chunk1.newest()
    let { newer, older } = chunk2.splitBy(reference)

    return {
        left: chunk1,
        right: newer,
        rest: older, 
        restIndex: chunk2Index
    }
}

// CASE 2 is assumed
// Split c2 into {before: [indices], after: [indices]} based on 'reference' vector.
function splitChunkUsingReference(reference, c2) {
    let splitIndex = c2.findIndex((vector) => compare(vector, reference) === LEQ)

    return {
        before: range(splitIndex, c2.length),
        after: range(0, splitIndex)
    }
}


// Works like pythons 'range' with step = 1
function range(start, stop) {
    var result = []
    for (var i = start; i < stop; i += 1) {
        result.push(i)
    }
    return result
}




module.exports = {
    compare
}