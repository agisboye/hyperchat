//TODO: Come up with a better name than 'stream-manager'. Too generic
const { Transform, Readable } = require('stream')
const promisify = require('util').promisify
const hypercore = require('hypercore')
const Union = require('sorted-union-stream')

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

    constructor(ownPotasium, feed, otherPeerID, isOwnFeed) {
        super({ objectMode: true })
        this._feed = feed
        this._currentIndex = feed.length - 1
        this._potasium = ownPotasium
        this._otherPeerID = otherPeerID
        // TODO: Change to use 'feed.writable' when this is tested in hyperchat
        this._isOwnFeed = isOwnFeed

        // debug
        this._chatIDClient = this._potasium.makeChatIDClient(this._otherPeerID).toString('hex')
        this._chatIDServer = this._potasium.makeChatIDServer(this._otherPeerID).toString('hex')
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
            let chatID = this._getChatID()
            this._currentIndex = head.data.dict[chatID]
        }

        let currentMessage = await this._feed.get(this._currentIndex)

        // Find the next index to go to; Look up the index in the
        // dict of the previous message. 
        this._currentIndex--
        if (this._currentIndex >= 0) {
            let nextMessage = await this._feed.get(this._currentIndex)
            this._currentIndex = nextMessage.data.dict[this._getChatID()]
        }

        let decrypted = this._decrypt(currentMessage.data.ciphertext)
        this.push(decrypted)
    }

    _decrypt(ciphertext) {
        if (this._isOwnFeed) {
            return this._potasium.decryptOwnMessage(ciphertext, this._otherPeerID)
        } else {
            return this._potasium.decryptMessageFromOther(ciphertext, this._otherPeerID)
        }
    }

    _getChatID() {
        // Only calculate the chatID once
        if (this._chatID) return this._chatID

        if (this._isOwnFeed) {
            this._chatID = this._potasium.makeChatIDClient(this._otherPeerID).toString('hex')
            return this._chatID
        } else {
            this._chatID = this._potasium.makeChatIDServer(this._otherPeerID).toString('hex')
            return this._chatID
        }
    }
}

class StreamMerger extends Union {
    constructor(a, b) {
        super(a, b, (a, b) => {
            if (a.ownSeq > b.otherSeq && (b.ownSeq > a.otherSeq)) {
                // No strong causality between a, b. Their feed make a cross. 
                throw new Error("COLLISION DETECTED. NOT HANDLED YET")
            }

            if (a.ownSeq > b.otherSeq) {
                // a comes before b. Return a
                return -1
            } else if (b.ownSeq > a.otherSeq) {
                // b comes before a. Return b
                return 1
            }
        })
    }
}

module.exports = { ReverseFeedStream, StreamMerger }