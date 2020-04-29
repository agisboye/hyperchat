const FeedChunk = require('./feedChunk')

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
    if (enumeratedChunks.length === 1) {
        return case0(enumeratedChunks[0].chunk)
    }

    let chunk1 = enumeratedChunks[0].chunk
    let chunk2 = enumeratedChunks[1].chunk
    let chunk1Index = enumeratedChunks[0].index
    let chunk2Index = enumeratedChunks[1].index

    if(chunk1.isParallelWith(chunk2)) {
        return case3(chunk1, chunk2) 
    } else if (chunk1.isOverlappedBy(chunk2)) {
        return case2(chunk2, chunk1, chunk1Index)
    } else if (chunk1.isOverlapping(chunk2)) {
        return case2(chunk1, chunk2, chunk2Index)
    } else if (chunk1.isNewerThan(chunk2)) {
        return case1(chunk1, chunk2, chunk2Index)
    } else {
        // chunk2 is newer than chunk1
        return case1(chunk2, chunk1, chunk1Index)
    }
}

// only 1 chunk left
function case0(chunk) {
    return {
        left: chunk,
        right: new FeedChunk([]),
        rest: new FeedChunk([]),
        restIndex: null
    }
}

// Assumes entire chunk1 is newer than entire chunk2
function case1(chunk1, chunk2, chunk2Index) {
    return {
        left: chunk1,
        right: new FeedChunk([]),
        rest: chunk2,
        restIndex: chunk2Index
    }
}

// part of chunk1 is parallel with part of chunk2. Chunk1 splits chunk2. 
function case2(chunk1, chunk2, chunk2Index) {
    let reference = chunk1.newest
    let { newer, older } = chunk2.splitBy(reference)

    return {
        left: chunk1,
        right: newer,
        rest: older,
        restIndex: chunk2Index
    }
}

// Entire chunk1 is parallel with entire chunk2
function case3(chunk1, chunk2) {
    return {
        left: chunk1, 
        right: chunk2, 
        rest: [], 
        restIndex: null
    }
}

module.exports = {
    compare
}