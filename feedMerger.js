//TODO: Come up with a better name than 'stream-manager'. Too generic
const { Transform } = require('stream')
const hypercore = require('hypercore')
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
        if (this._relevantIndex < 0 || this._relevantIndex === null) {
            cb(new Error("end of stream"), null)
            return
        }

        if (this._relevantIndex === this._feed.length - 1) {
            // Base case: We need to find the index of the first message relevant for us.
            this._feed.head((err, head) => {
                if (err) throw err
                this._relevantIndex = head.data.dict[this._getChatID()]
                //TODO: Try just to pass 'cb' further down
                this._getDecryptedMessageOfRelevantIndex((err, decrypted) => {
                    cb(err, decrypted)
                })
            })
        } else {
            // relevant index was correctly set last time 'getPrev' was called (invariant)
            //TODO: Try just to pass 'cb' further down
            this._getDecryptedMessageOfRelevantIndex((err, decrypted) => {
                cb(err, decrypted)
            })
        }
    }

    _getDecryptedMessageOfRelevantIndex(cb) {
        this._feed.get(this._relevantIndex, (err, currentMessage) => {
            if (err) { cb(err, null); return }

            if (this._relevantIndex) {
                // A next message still exists. Update relevant index for next iteration (invariant)
                this._feed.get(this._relevantIndex - 1, (err, nextMessage) => {
                    if (err) { cb(err, null); return }
                    this._relevantIndex = nextMessage.data.dict[this._getChatID()]
                    let decrypted = this._decryptAndAddMetaData(currentMessage.data.ciphertext)

                    if (decrypted) {
                        cb(null, decrypted)
                    } else {
                        cb(new Error("Decryption failed"), null)
                    }
                })

            } else {
                this._relevantIndex = null
                let decrypted = this._decryptAndAddMetaData(currentMessage.data.ciphertext)
                if (decrypted) {
                    cb(null, decrypted)
                } else {
                    cb(new Error("Decryption failed"), null)
                }

            }
        })
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
        let decrypted;
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
        this._a = new ReverseFeedStream(potasium, feedA, otherPeerID)
        this._b = new ReverseFeedStream(potasium, feedB, otherPeerID)
        this.length = this._a.length + this._b.length
        this._a.on('data', data => this._handleData(data))
        this._b.on('data', data => this._handleData(data))
    }


    async getPrevAsync() {
        let x = promisify(this.getPrev)

        let res = await x()
        console.log(res)
    }

    getPrev(cb) {
        this._getPrev((err, prev) => {
            if (err) { cb(err, null); return }

            cb(null, this._removeUnusedMetaData(prev))
        })
    }

    _getPrev(cb) {
        //TODO: handle collision

        this._a.getPrev((err, prevA) => {
            if (err) { cb(err, null); return }
            this._b.getPrev((err, prevB) => {
                if (err) { cb(err, null); return }

                let a = this._tmpA || prevA
                let b = this._tmpB || prevB

                if (a === null) {
                    // feed A is empty. 
                    this._tmpB = null
                    cb(null, b)
                    return
                }

                if (b === null) {
                    // feed B is empty
                    this._tmpA = null
                    cb(null, a)
                    return
                }

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
                    //TODO: Handle properly
                    throw new Error("COLLISION DETECTED. NOT HANDLED YET")
                }

                (res === 1) ? cb(null, a) : cb(null, b)

            })
        })
    }

    _handleData(data) {
        this.emit('data', this._removeUnusedMetaData(data))
    }

    _compare(a, b) {
        if (a.ownSeq > b.otherSeq && (b.ownSeq > a.otherSeq)) {
            // No strong causality between a, b. Their feed make a cross. 
            return 0
        }

        if (a.ownSeq > b.otherSeq) {
            // a comes before b. Return a
            return 1
        } else if (b.ownSeq > a.otherSeq) {
            // b comes before a. Return b
            return -1
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