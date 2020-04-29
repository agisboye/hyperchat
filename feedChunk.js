
class FeedChunk {
    constructor(input) {
        if (Array.isArray(input)) this._content = input
        else this._content = [input]
    }

    get length() {
        return this._content.length
    }
    get messages() {
        return this._content.map(data => {
            return {
                message: data.message, 
                sender: data.sender, 
                vector: data.vector._array
            }
        })
    }

    get _vectors() {
        return this._content.map(message => message.vector)
    }

    extend(message) {
        this._content.push(message)
    }

    get newest() {
        return this._content[0].vector
    }


    get oldest() {
        return this._content[this._content.length - 1].vector
    }

    //TODO: handle case where there is no split index. May be used to determine 
    // if we are in case 1 or 2? (i.e we should always split)
    splitBy(reference) {
        let splitIndex = this._content.findIndex((message) => message.vector.par(reference))
        
        // Split aronud reference. 
        
        return {
            newer: new FeedChunk(this._content.slice(0, splitIndex)), 
            older: new FeedChunk(this._content.slice(splitIndex))
        }
    }

    isOlderThan(other) {
        return this.newest.leq(other.oldest)
    }

    isNewerThan(other) {
        return this.oldest.geq(other.newest)
    }

    //TODO: Delete
    overlapsWith(otherChunk) {
        return this.oldest.leq(otherChunk.newest) && otherChunk.oldest.leq(this.newest)
    }

    // 'this' is smaller than 'other'
    isOverlapping(other) {
        return this.oldest.geqPar(other.oldest) && this.newest.leqPar(other.newest)
    }

    // 'this' is larger than 'other'
    isOverlappedBy(other) {
        return this.oldest.leq(other.oldest) && this.newest.geq(other.newest)
    }
}


module.exports = FeedChunk