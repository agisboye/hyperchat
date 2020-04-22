const { EventEmitter } = require('events')

class ReverseFeedStream extends EventEmitter {
    constructor(ownPotasium, feed, peerID, key) {
        super()
        this.feed = feed
        this._peerID = peerID
        this._relevantIndex = feed.length - 1 // start at head index
        this._potasium = ownPotasium
        this._relevantIndexNotSet = true
        this._key = key
        this._isOwnFeed = feed.writable
        this.length = feed.length
        this._chatID = this._potasium.makeChatID(key, feed.key).toString('hex')
        this._setupHandlers()
    }

    /// Returns (err, prev) via callback where prev: { message, sender, vector }

    getPrev(cb) {
        this.feed.ready(() => {
            if (this._relevantIndexNotSet) {
                this._relevantIndex = this.feed.length - 1
                this._relevantIndexNotSet = false
            }
            if (this._relevantIndex < 0 || this._relevantIndex === undefined) return cb(new Error("end of stream"), null)

            if (this._relevantIndex === this.feed.length - 1) {
                // Base case: We need to find the index of the first message relevant for us.
                this.feed.head((err, head) => {
                    if (err) return cb(new Error("no head found"), null)

                    this._relevantIndex = head.data.dict[this._chatID]

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
        if (this._relevantIndex < 0 || this._relevantIndex === undefined) return cb(new Error("end of stream"), null)

        this.feed.get(this._relevantIndex, (err, currentMessage) => {
            if (err) return cb(err, null)

            if (this._relevantIndex) {
                // A next message still exists. Update relevant index for next iteration (invariant)
                this.feed.get(this._relevantIndex - 1, (err, nextMessage) => {
                    if (err) return cb(err, null)

                    this._relevantIndex = nextMessage.data.dict[this._chatID]
                    this._getDecryptedMessage(currentMessage, cb)
                })
            } else {
                // Last message => There is no relevantIndex after this one
                // Setting '_relevantIndex = undefined' causes the next iteration of 'getPrev' to terminate.
                this._relevantIndex = undefined
                this._getDecryptedMessage(currentMessage, cb)
            }
        })
    }

    /// Returns (err, prev) via callback where prev: { message, sender, vector }. 
    /// 'currentMessage' is {type, data: { ciphertext, dict }}
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
            this.feed.on('append', () => this._onOwnFeedAppendHandler())
        } else {
            this.feed.on('download', (index, data) => this._onOtherFeedDownloadHandler(index, data))
        }
    }

    _onOtherFeedDownloadHandler(index, data) {
        let message = JSON.parse(data.toString('utf-8'))

        // Return if message is not intended for us
        if (message.data.dict[this._chatID] !== index) return

        let decrypted = this._decryptAndAddMetaData(message.data.ciphertext)

        if (decrypted) {
            this.emit('data', decrypted)
        }
    }

    _onOwnFeedAppendHandler() {
        this.feed.head((err, message) => {
            if (err) throw err
            let decrypted = this._decryptAndAddMetaData(message.data.ciphertext)

            if (decrypted) {
                this.emit('data', decrypted)
            }
        })
    }

    /// Returns { message, sender, vector } if ciphertext can be decrypted else null. 
    _decryptAndAddMetaData(ciphertext) {
        let decrypted = this._potasium.decryptMessageUsingKey(Buffer.from(ciphertext, 'hex'), this._key)
        if (decrypted) {
            decrypted['sender'] = this._peerID.toString('hex').substring(0, 5) + "..."
            return decrypted
        } else {
            return null
        }
    }
}

module.exports = ReverseFeedStream