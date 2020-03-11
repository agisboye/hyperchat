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
        // base case: End of feed has been reached.
        if (this._currentIndex < 0) {
            this.push(null)
            return
        }
        // We are at the head and need to find the first message intended for us
        if (this._currentIndex === this._feed.length - 1) {
            let head = await this._feed.head()
            this._currentIndex = head.data.dict[this._getChatID()]
        }

        let currentMessage = await this._feed.get(this._currentIndex)

        // Find the next index to go to; Look up the index in the
        // dict of the previous message. 
        this._currentIndex--
        if (this._currentIndex >= 0) {
            let nextMessage = await this._feed.get(this._currentIndex)
            this._currentIndex = nextMessage.data.dict["B"]
        }

        let decrypted = this._decrypt(currentMessage.data.ciphertext)
        this.push(decrypted)
    }

    _decrypt(ciphertext) {
        return this._ownIdentity.decryptMessageFromOther(ciphertext, this._otherPeerID)
        // TODO: Uncomment and test when integrating into hypercore. 
        // Feeds need to be replicated for '_isOwnFeed' to be set correctly.
        // if (this._isOwnFeed) {
        //     return this._ownIdentity.decryptOwnMessage(ciphertext, this._otherPeerID)
        // } else {
        //     return this._ownIdentity.decryptMessageFromOther(ciphertext, this._otherPeerID)
        // }
    }

    _getChatID() {
        // Only calculate the chatID once
        if (this._chatID) return this._chatID

        this._chatID = this._ownIdentity.makeChatIDServer(this._otherPeerID).toString('hex')
        return this._chatID

        // TODO: Uncomment and test when integrating into hypercore. 
        // Feeds need to be replicated for '_isOwnFeed' to be set correctly.
        // if (this._isOwnFeed) {
        //     return this._ownIdentity.makeChatIDClient(this._otherPeerID).toString('hex')
        // } else {
        //     return this._ownIdentity.makeChatIDServer(this._otherPeerID).toString('hex')
        // }
    }
}

module.exports = ReverseFeedStream