const { EventEmitter } = require('events')
const promisify = require('util').promisify
const ReverseFeedStream = require('./reverseFeedStream')

class FeedMerger extends EventEmitter {
    constructor(potasium, key, feeds, group) {
        super()
        this._streams = feeds.map(feed => new ReverseFeedStream(potasium, feed, key, group))
        // TODO: Remove length. Doesnt make sense to use in hyperchat.
        this.length = this._streams.reduce((accu, stream) => accu + stream.length, 0)
        this._streams.forEach(stream => stream.on('data', data => this._handleData(data)))

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