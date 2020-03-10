//TODO: Come up with a better name than 'stream-manager'. Too generic
const { Transform, Readable } = require('stream')
const promisify = require('util').promisify
const hypercore = require('hypercore')
hypercore.prototype.get = promisify(hypercore.prototype.get)
hypercore.prototype.head = promisify(hypercore.prototype.head)


class StreamFilter extends Transform {

    constructor(predicate) {
        super({ objectMode: true }) // Ensures that 'chunk' is interpreted as json-objects
        this._predicate = predicate
    }

    _transform(chunk, encoding, next) {
        if (this._predicate(chunk)) {
            return next(null, chunk)
        }

        next()
    }
}

class StreamMap extends Transform {
    constructor(func) {
        super({
            objectMode: true,
            transform(chunk, encoding, callback) {
                callback(null, func(chunk))
            }
        })
    }
}

class ReverseFeedStream extends Readable {

    constructor(ownIdentity, feed, otherPeerID) {
        super({ objectMode: true })
        this._feed = feed
        this._currentIndex = feed.length - 1
        this._ownIdentity = ownIdentity
        this._otherPeerID = otherPeerID
        //TODO: Not in use now. Can be used to determine if we we're traversing our own (decryptOwnMessage) or someone elses (decryptMessage)
        this._isOwnFeed = feed.writable
    }

    _read() {
        this._asyncRead()
    }

    async _asyncRead() {
        // We are at the head and need to find the first message intended for us

        if (this._currentIndex === this._feed.length - 1) {
            let head = await this._feed.head()
            this._currentIndex = head.data.dict["B"]
        }


        if (this._currentIndex < 0) {
            // End of feed has been reached.
            this.push(null)
            return
        }

        let currentMessage = await this._feed.get(this._currentIndex)

        // Find the next index to go to; Look up the index in the
        // dict of the previous message. 
        this._currentIndex--
        if (this._currentIndex >= 0) {
            let nextMessage = await this._feed.get(this._currentIndex)
            this._currentIndex = nextMessage.data.dict["B"]
        }

        let decrypted;

        if (this._isOwnFeed) {
            decrypted = this._ownIdentity.decryptOwnMessage(currentMessage.data.ciphertext, this._otherPeerID)
        } else {
            decrypted = this._ownIdentity.decryptMessageFromOther(currentMessage.data.ciphertext, this._otherPeerID)
        }

        this.push(decrypted)
    }
}

module.exports = ReverseFeedStream