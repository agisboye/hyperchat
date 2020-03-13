//TODO: Come up with a better name than 'stream-manager'. Too generic
const { Transform } = require('stream')
const promisify = require('util').promisify
const hypercore = require('hypercore')
const { EventEmitter } = require('events')

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

class ReverseFeedStream extends EventEmitter {
    constructor(ownPotasium, feed, otherPeerID) {
        super()
        this._feed = feed
        this._currentIndex = feed.length - 1 // start at head index
        this._potasium = ownPotasium
        this._otherPeerID = otherPeerID
        this._isOwnFeed = feed.writable
        this.length = feed.length

        this._feed.on('download', (index, data) => this._ondownloadHandler(data))
    }

    async getPrev() {
        if (this._currentIndex < 0 || this._currentIndex === null) {
            return null
        }

        if (this._currentIndex === this._feed.length - 1) {
            // first time 'getPrev' is called we find the index to jump to
            let head = await this._feed.head()
            this._currentIndex = head.data.dict[this._getChatID()]
        }

        let currentMessage = await this._feed.get(this._currentIndex)

        if (this._currentIndex) {
            // A next message still exists. Update _currentIndex for next iteration
            let nextMessage = await this._feed.get(this._currentIndex - 1)
            this._currentIndex = nextMessage.data.dict[this._getChatID()]
        } else {
            this._currentIndex = null
        }

        // decrypt currentMessage
        let res = this._decrypt(currentMessage.data.ciphertext)
        return res
    }

    _ondownloadHandler(data) {
        let message = JSON.parse(data.toString('utf-8'))
        //TODO: Now it's assumed that all received messages are for us. 
        // This is a poor assumption. Instead we should look in 'message.data.dict'
        // to determine if a message is intended for us. 
        let decrypted = this._decrypt(message.data.ciphertext)

        this.emit('data', decrypted)
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

class FeedMerger extends EventEmitter {
    constructor(potasium, otherPeerID, feedA, feedB) {
        super()
        this._a = new ReverseFeedStream(potasium, feedA, otherPeerID)
        this._b = new ReverseFeedStream(potasium, feedB, otherPeerID)
        this.length = this._a.length + this._b.length
        this._a.on('data', data => this._handleData(data))
        this._b.on('data', data => this._handleData(data))
    }

    _handleData(data) {
        this.emit('data', data)
    }

    _compare(a, b) {
        if (a.ownSeq > b.otherSeq && (b.ownSeq > a.otherSeq)) {
            // No strong causality between a, b. Their feed make a cross. 
            throw new Error("COLLISION DETECTED. NOT HANDLED YET")
        }

        if (a.ownSeq > b.otherSeq) {
            // a comes before b. Return a
            return 1
        } else if (b.ownSeq > a.otherSeq) {
            // b comes before a. Return b
            return -1
        }
    }

    async getPrev() {
        //TODO: handle collision
        let a = this._tmpA || await this._a.getPrev()
        let b = this._tmpB || await this._b.getPrev()

        if (a === null) return b
        if (b === null) return a

        let res = this._compare(a, b)

        if (res === 1) {
            // save res of b
            this._tmpB = b
            this._tmpA = null
        } else if (res === -1) {
            // save ref of a
            this._tmpA = a
            this._tmpB = null
        } else {
            // collision
        }

        return (res === 1) ? a : b
    }
}

module.exports = FeedMerger