const { EventEmitter } = require('events')
const promisify = require('util').promisify

class ReverseFeedStream extends EventEmitter {
    constructor(ownPotasium, feed, otherPeerID) {
        super()
        this._feed = feed
        this._relevantIndex = feed.length - 1 // start at head index
        this._potasium = ownPotasium
        this._otherPeerID = otherPeerID
        this._isOwnFeed = feed.writable
        this.length = feed.length

        this._setupHandlers()
    }

    getPrev(cb) {
        if (this._unused) {
            let res = this._unused
            this._unused = null
            return cb(null, res)
        }
        if (this._relevantIndex < 0 || this._relevantIndex === undefined) return cb(new Error("end of stream"), null)

        if (this._relevantIndex === this._feed.length - 1) {
            // Base case: We need to find the index of the first message relevant for us.
            this._feed.head((err, head) => {
                if (err) return cb(new Error("no head found"), null)

                this._relevantIndex = head.data.dict[this._getChatID()]

                return this._getDecryptedMessageOfRelevantIndex(cb)
            })
        } else {
            // relevant index was correctly set last time 'getPrev' was called (invariant)
            return this._getDecryptedMessageOfRelevantIndex(cb)
        }
    }

    saveUnused(value) {
        this._unused = value
    }

    _getDecryptedMessageOfRelevantIndex(cb) {
        if (this._relevantIndex < 0 || this._relevantIndex === undefined) return cb(new Error("end of stream"), null)

        this._feed.get(this._relevantIndex, (err, currentMessage) => {
            if (err) return cb(err, null)

            if (this._relevantIndex) {
                // A next message still exists. Update relevant index for next iteration (invariant)
                this._feed.get(this._relevantIndex - 1, (err, nextMessage) => {
                    if (err) return cb(err, null)

                    this._relevantIndex = nextMessage.data.dict[this._getChatID()]
                    this._getDecryptedMessage(currentMessage, cb)
                })
            } else {
                // Last message => There is no relevantIndex after this one
                this._relevantIndex = undefined
                this._getDecryptedMessage(currentMessage, cb)
            }
        })
    }

    _getDecryptedMessage(currentMessage, cb) {
        let decrypted = this._decryptAndAddMetaData(currentMessage.data.ciphertext)

        if (decrypted) {
            return cb(null, decrypted)
        } else {
            return cb(new Error("Decryption failed"), null)
        }
    }

    _setupHandlers() {
        if (this._isOwnFeed) {
            this._feed.on('append', () => this._onOwnFeedAppendHandler())
        } else {
            this._feed.on('download', (index, data) => this._onOtherFeedDownloadHandler(index, data))
        }
    }

    _onOtherFeedDownloadHandler(index, data) {
        let message = JSON.parse(data.toString('utf-8'))

        // Return if message is not intended for us
        if (message.data.dict[this._getChatID()] !== index) return

        let decrypted = this._decryptAndAddMetaData(message.data.ciphertext)

        if (decrypted) {
            this.emit('data', decrypted)
        }
    }

    _onOwnFeedAppendHandler() {
        this._feed.head((err, message) => {
            if (err) throw err
            let decrypted = this._decryptAndAddMetaData(message.data.ciphertext)

            if (decrypted) {
                this.emit('data', decrypted)
            }
        })
    }

    _addMetaDataToDecryptedMessage(message) {
        let sender = this._isOwnFeed ? "self" : "other"
        message['sender'] = sender
        return message
    }

    _decryptAndAddMetaData(ciphertext) {
        let decrypted
        if (this._isOwnFeed) {
            decrypted = this._potasium.decryptOwnMessage(ciphertext, this._otherPeerID)
        } else {
            decrypted = this._potasium.decryptMessageFromOther(ciphertext, this._otherPeerID)
        }

        if (decrypted) {
            // add metadata for sender
            let sender = this._isOwnFeed ? "self" : "other"
            decrypted['sender'] = sender
            return decrypted
        } else {
            return null
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
        this._leftStream = new ReverseFeedStream(potasium, feedA, otherPeerID)
        this._rightStream = new ReverseFeedStream(potasium, feedB, otherPeerID)
        // TODO: Remove length. Doesnt make sense to use in hyperchat.
        this.length = this._leftStream.length + this._rightStream.length
        this._leftStream.on('data', data => this._handleData(data))
        this._rightStream.on('data', data => this._handleData(data))

        this._promisifiedGetPrev = promisify(this._getPrev).bind(this);
    }

    async getPrevAsync() {
        try {
            return await this._promisifiedGetPrev()
        } catch (err) {
            return null
        }
    }

    _getPrev(cb) {
        this._leftStream.getPrev((leftError, left) => {
            this._rightStream.getPrev((rightError, right) => {

                // both feeds are empty
                if (leftError && rightError) return cb(new Error("both streams are empty"), null)
                // left feed is empty. 
                if (left === null) return cb(null, this._removeUnusedMetaData(right))
                // feed B is empty
                if (right === null) {
                    let res = this._removeUnusedMetaData(left)
                    return cb(null, res)
                }
                let res = this._compare(left, right)

                // save right/left for next round
                if (res === 1) {
                    this._rightStream.saveUnused(right)
                } else if (res === -1) {
                    this._leftStream.saveUnused(left)
                } else {
                    //TODO: handle collision
                    throw new Error("COLLISION DETECTED. NOT HANDLED YET")
                }

                (res === 1) ? cb(null, this._removeUnusedMetaData(left)) : cb(null, this._removeUnusedMetaData(right))
            })
        })
    }

    _handleData(data) {
        this.emit('data', this._removeUnusedMetaData(data))
    }

    /// a comes before b: return 1
    /// b comes before a: return -1
    /// a, b not comparable: return 0
    _compare(a, b) {
        if (a.ownSeq > b.otherSeq && (b.ownSeq > a.otherSeq)) return 0

        if (a.ownSeq > b.otherSeq) return 1
        else if (b.ownSeq > a.otherSeq) return -1
        else {
            throw new Error("_compare: Cannot compare " + a + " and " + b)
        }
    }

    _removeUnusedMetaData(data) {
        return {
            sender: data.sender,
            message: data.message
        }
    }
}

module.exports = FeedMerger