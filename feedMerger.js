const { EventEmitter } = require('events')
const promisify = require('util').promisify
const ReverseFeedStream = require('./reverseFeedStream')
const vectorClock = require('./vectorClock')

class FeedMerger extends EventEmitter {
    constructor(potasium, key, feedsByPeers) {
        super()
        this._streams = feedsByPeers.map(({peerID, feed}) => new ReverseFeedStream(potasium, feed, peerID, key))
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

    _handleData(data) {
        this.emit('data', this._removeUnusedMetaData(data))
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