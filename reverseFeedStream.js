const { EventEmitter } = require('events')
const crypto = require('./crypto')
const promisify = require('util').promisify

class ReverseFeedStream extends EventEmitter {
    constructor(feed, peer, key) {
        super()
        this.feed = feed
        this.peer = peer
        this._relevantIndex = feed.length - 1 // start at head index
        this._relevantIndexNotSet = true
        this._key = key
        this._isOwnFeed = feed.writable
        this._chatID = crypto.makeChatID(key, feed.key).toString("hex")
        this._setupHandlers()
        this._promisifiedGetPrev = promisify(this._getPrevViaCallback).bind(this)
    }

    async getAllPrevsParallelToTimestamps(timestamps) {
        if (timestamps.length === 0) return []
        let prev;
        let res = []
        while (prev = await this.getPrev()) {
            if (this._vectorIsParallelToAllTimestamps(timestamps, prev.vector)) {
                res.push(prev)
            } else {
                // we've gone 1 too long. Save the last 'prev' for next iteration
                this._cachedPrev = prev
                break
            }
        }
        return res
    }

    _vectorIsParallelToAllTimestamps(timestamps, vector) {
        for (let t of timestamps) {
            if (!t.isParallelTo(vector)) return false
        }
        return true
    }

    async getPrev() {
        try {
            return await this._promisifiedGetPrev()
        } catch (err) {
            return null
        }
    }
    /** 
     * Returns the latest message-block for a given conversation in the stream starting from head via callback. 
     * If no message-block is present for the conversation, an error is returned. 
     * We return using callback because we need to wait for 'feed.ready' callback. 
     * @param {err, { message: string, sender: string, vector: [int] }} cb 
     */
    _getPrevViaCallback(cb) {
        this.feed.ready(() => {
            if (this._cachedPrev) {
                let prev = this._cachedPrev
                this._cachedPrev = null
                return cb(null, prev)
            }
            if (this._relevantIndexNotSet) {
                this._relevantIndex = this.feed.length - 1
                this._relevantIndexNotSet = false
            }
            if (this._relevantIndex === undefined || this._relevantIndex < 0) return cb(new Error("end of stream"), null)

            if (this._relevantIndex === this.feed.length - 1) {
                // Base case: We need to find the index of the first message relevant for us.
                this.feed.head((err, head) => {
                    if (err) return cb(new Error("no head found"), null)

                    this._relevantIndex = head.conversationIDs[this._chatID]

                    return this._getDecryptedMessageOfRelevantIndex(cb)
                })
            } else {
                // relevant index was correctly set last time 'getPrev' was called (invariant)
                return this._getDecryptedMessageOfRelevantIndex(cb)
            }
        })
    }

    /// Returns (err, prev) via callback where prev: { message, sender, vector } 
    /// Precondition: '_relevantIndex' has been correctly set. 
    _getDecryptedMessageOfRelevantIndex(cb) {
        if (this._relevantIndex === undefined || this._relevantIndex < 0) return cb(new Error("end of stream"), null)

        this.feed.get(this._relevantIndex, (err, currentMessage) => {
            if (err) return cb(err, null)

            if (this._relevantIndex) {
                // A next message still exists. Update relevant index for next iteration (invariant)
                this.feed.get(this._relevantIndex - 1, (err, nextMessage) => {
                    if (err) return cb(err, null)

                    this._relevantIndex = nextMessage.conversationIDs[this._chatID]
                    let decrypted = this._getDecryptedMessage(currentMessage, cb)
                    return cb(null, decrypted)
                })
            } else {
                // Last message => There is no relevantIndex after this one
                // Setting '_relevantIndex = undefined' causes the next iteration of 'getPrev' to terminate.
                this._relevantIndex = undefined
                let decrypted = this._getDecryptedMessage(currentMessage, cb)
                return cb(null, decrypted)
            }
        })
    }

    /// Returns 'prev' via callback where prev: { message, sender, vector }. 
    /// 'currentMessage' is {type, data: { ciphertext, dict }}
    _getDecryptedMessage(currentMessage) {
        let decrypted = this._decryptAndAddMetaData(currentMessage.ciphertext)

        if (!decrypted) throw new Error("Decryption failed")
        else return decrypted
    }

    _setupHandlers() {
        if (this._isOwnFeed) {
            this.feed.on('append', () => this._onOwnFeedAppendHandler())
        } else {
            this.feed.on('download', (index, data) => this._onOtherFeedDownloadHandler(index, data))
        }
    }

    _onOtherFeedDownloadHandler(index, data) {
        let message = JSON.parse(data.toString('utf-8'))

        // Return if message is not intended for us
        if (message.conversationIDs[this._chatID] !== index) return

        let decrypted = this._decryptAndAddMetaData(message.ciphertext)

        if (decrypted) {
            this.emit('vectorclock', decrypted.vector)
            this.emit('data', decrypted)
        }
    }

    _onOwnFeedAppendHandler() {
        this.feed.head((err, message) => {
            if (err) throw err
            let decrypted = this._decryptAndAddMetaData(message.ciphertext)

            if (decrypted) {
                this.emit('data', decrypted)
            }
        })
    }

    /// Returns { message, sender, vector } if ciphertext can be decrypted else null. 
    _decryptAndAddMetaData(ciphertext) {
        let res = crypto.decryptMessage(Buffer.from(ciphertext, 'hex'), this._key)
        if (res) {
            const decrypted = JSON.parse(res.toString('utf-8'))
            decrypted['sender'] = this.peer.toString()
            return decrypted
        } else {
            return null
        }
    }
}

module.exports = ReverseFeedStream