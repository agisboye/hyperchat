
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

    newest() {
        return this._content[0]
    }

    oldest() {
        return this._content[this._content.length - 1]
    }

    //TODO: handle case where there is no split index. May be used to determine 
    // if we are in case 1 or 2? (i.e we should always split)
    splitBy(reference) {
        let splitIndex = this._content.findIndex((message) => message.vector.leq(reference.vector))
        
        // Split aronud reference. 
        
        return {
            newer: new FeedChunk(this._content.slice(0, splitIndex)), 
            older: new FeedChunk(this._content.slice(splitIndex))
        }
    }

    isOlderThan(otherChunk) {
        return this.newest().vector.leq(otherChunk.oldest().vector)
    }

    isNewerThan(otherChunk) {
        return this.oldest().vector.geq(otherChunk.newest().vector)
    }

    overlapsWith(otherChunk) {
        return this.oldest().vector.leq(otherChunk.newest().vector) && otherChunk.oldest().vector.leq(this.newest().vector)
    }
}


module.exports = FeedChunk