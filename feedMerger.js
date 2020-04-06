const { EventEmitter } = require('events')
const promisify = require('util').promisify
const ReverseFeedStream = require('./reverseFeedStream')
const vectorClock = require('./vectorClock')

class FeedMerger extends EventEmitter {
    constructor(potasium, key, feeds, group) {
        super()
        this._streams = feeds.map(feed => new ReverseFeedStream(potasium, feed, key, group))
        this._sortStreams()
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

    _getAllPrevs(cb) {
        this._getAllPrevsHelper(0, [], cb)
    }

    _getAllPrevsHelper(i, res, cb) {
        if (this._streams.length === i) return cb(res)

        // Search in '_rest' before searching through streams. 
        if (this._rest) {
            let found = (this._rest.find(({ index, prev }) => i === index))
            if (found) {
                res.push(found)
                i++
                return this._getAllPrevsHelper(i, res, cb)
            }
        }

        let stream = this._streams[i]

        stream.getPrev((err, prev) => {
            if (!err) res.push({ index: i, prev })
            i++
            this._getAllPrevsHelper(i, res, cb)
        })
    }

    _getPrev(cb) {
        this._getAllPrevs((enumeratedPrevs) => {
            let maxes = vectorClock.max(enumeratedPrevs)

            // save the rest to next iteration
            this._rest = enumeratedPrevs.filter(elem => !maxes.includes(elem))

            // remove indices before returning
            let res = maxes.map(({ index: _, prev: prev }) => prev)

            if (res.length > 0) {
                return cb(null, res)
            } else {
                return cb(new Error('end of stream'), null)
            }
        })
    }

    // _getPrev(cb) {
    //     this._getAllPrevs(prevs => {
    //         let leftStream = prevs[0].stream
    //         let rightStream = prevs[1].stream
    //         let left = prevs[0].prev || null
    //         let right = prevs[1].prev || null

    //         if (left === null && right === null) return cb(new Error("both streams are empty"), null)
    //         // left feed is empty. 
    //         if (left === null) return cb(null, this._removeUnusedMetaData(right))
    //         // feed B is empty
    //         if (right === null) return cb(null, this._removeUnusedMetaData(left))

    //         // NOTE: ENTERING HACKY-ZONE!  
    //         left.otherSeq = left.otherSeqs[0].length
    //         right.otherSeq = right.otherSeqs[0].length
    //         // LEAVING HACKY ZONE

    //         let res = this._compare2(left, right)
    //         // save right/left for next round
    //         if (res === 1) {
    //             rightStream.saveUnused(right)
    //         } else if (res === -1) {
    //             leftStream.saveUnused(left)
    //         } else {
    //             //TODO: handle collision
    //             throw new Error("COLLISION DETECTED. NOT HANDLED YET")
    //         }

    //         (res === 1) ? cb(null, this._removeUnusedMetaData(left)) : cb(null, this._removeUnusedMetaData(right))
    //     })
    // }

    _handleData(data) {
        this.emit('data', this._removeUnusedMetaData(data))
    }

    /// a comes before b: return 1
    /// b comes before a: return -1
    /// a, b not comparable: return 0
    _compare2(a, b) {
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

    _sortStreams() {
        this._streams.sort((s1, s2) => {
            let feedkey1 = s1.feed.key.toString('hex')
            let feedkey2 = s2.feed.key.toString('hex')
            return feedkey1.localeCompare(feedkey2)
        })
    }
}

module.exports = FeedMerger