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

    // _getAllPrevs(cb) {
    //     function _getAllPrevsInternal(streams, res, cb) {
    //         if (streams.length === 0) return cb(res)

    //         let stream = streams.shift()
    //         stream.getPrev((err, prev) => {
    //             if (!err) res.push({ stream, prev })
    //             _getAllPrevsInternal(streams, res, cb)
    //         })
    //     }

    //     let streamClone = [... this._streams]
    //     _getAllPrevsInternal(streamClone, [], cb)
    // }

    _getAllPrevs2(cb) {
        this._getAllPrevsInternal2(0, [], cb)
    }

    _getAllPrevsInternal2(index, res, cb) {
        if (this._streams.length === index) return cb(res)

        let stream = this._streams[index]
        stream.getPrev((err, prev) => {
            res.push({ stream, err, prev })
            index++
            this._getAllPrevsInternal2(index, res, cb)
        })
    }

    _getPrev(cb) {
        this._getAllPrevs2(streamsAndPrevs => {
            let leftStream = streamsAndPrevs[0].stream
            let rightStream = streamsAndPrevs[1].stream
            let left = streamsAndPrevs[0].prev || null
            let right = streamsAndPrevs[1].prev || null

            if (left === null && right === null) return cb(new Error("both streams are empty"), null)
            // left feed is empty. 
            if (left === null) return cb(null, this._removeUnusedMetaData(right))
            // feed B is empty
            if (right === null) return cb(null, this._removeUnusedMetaData(left))

            // NOTE: ENTERING HACKY-ZONE!  
            left.otherSeq = left.otherSeqs[0].length
            right.otherSeq = right.otherSeqs[0].length
            // LEAVING HACKY ZONE

            let res = this._compare2(left, right)
            // save right/left for next round
            if (res === 1) {
                rightStream.saveUnused(right)
            } else if (res === -1) {
                leftStream.saveUnused(left)
            } else {
                //TODO: handle collision
                throw new Error("COLLISION DETECTED. NOT HANDLED YET")
            }

            (res === 1) ? cb(null, this._removeUnusedMetaData(left)) : cb(null, this._removeUnusedMetaData(right))
        })
    }

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
}

module.exports = FeedMerger