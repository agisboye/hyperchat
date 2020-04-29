const FeedChunk = require('./feedChunk')

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