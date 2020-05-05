const { EventEmitter } = require('events')
const promisify = require('util').promisify
const ReverseFeedStream = require('./reverseFeedStream')
const Timestamp = require('./timestamp')

class FeedMerger extends EventEmitter {
    constructor(potasium, key, feedsByPeers) {
        super()
        this._streams = feedsByPeers.map(({ peer, feed }) => new ReverseFeedStream(potasium, feed, peer, key))
        this._peers = feedsByPeers.map(({ peer, feed }) => peer)
        this._sortStreams()
        this._streams.forEach(stream => {
            stream.on('data', data => this.emit('data', data))
            stream.on('vectorclock', vector => this.emit('vectorclock', vector, this._peers))
        })
        this._promisifiedGetPrev = promisify(this._getPrev).bind(this);
    }

    /// Returns the latest messages [{message, sender, vector}] using callback
    /// or 'null' if end of stream is reached. 
    async getPrevAsync() {
        try {
            return await this._promisifiedGetPrev()
        } catch (err) {
            return null
        }
    }

    /// Returns the latest messages (err, [{message, sender, vector}]) using callback 
    // How the algorithm runs: 
    // 1) Receive all the previous messages from '_streams'
    // 2) Compute the latest messages. This is done by finding the one with the largest vector
    //    and all messages parallel to this one. These are intended to be returned. 
    // 3) All the messages that are not the latest ones should be saved to next iteration in '_rest'
    // 4) Remove any unused metadata attached to each message
    _getPrev(cb) {
        this._getAllPrevsEnumerated((enumeratedPrevs) => {
            if (enumeratedPrevs.length === 0) return cb(new Error('end of stream'), null)
            if (enumeratedPrevs.length === 1) {
                //TODO: make proper handling of this case. 
                this._rest = []
                return cb(null, enumeratedPrevs[0].prev)
            }
            let newest = this._findNewest(enumeratedPrevs)

            // save the rest to next iteration
            this._rest = enumeratedPrevs.filter(({ index: i1, prev: _ }) => newest.findIndex(({ index: i2, prev: _ }) => i1 === i2) === -1)

            // remove indices 
            let res = newest.map(({ index, prev }) => prev)

            return cb(null, res)
        })
    }

    /// Returns [{index, prev}] where prev: {message, sender, vector} from all streams. 
    /// 'index' shows which stream from '_streams' the message came from. 
    _getAllPrevsEnumerated(cb) {
        this._getAllPrevsEnumeratedHelper(0, [], cb)
    }

    /// Returns [{index, prev}] where prev: {message, sender, vector} from all streams. 
    // i = index for the current stream. 
    // res = where we save our result incrementally
    // How the algorithm runs: 
    // 1) Check in '_rest' if a message has been cached for the i'th stream. 
    // 2) Else get a fresh previous message from the i'th stream. 
    _getAllPrevsEnumeratedHelper(i, res, cb) {
        // All streams have been traversed
        if (this._streams.length === i) return cb(res)

        // Search in '_rest' before searching through streams. 
        if (this._rest) {
            let found = (this._rest.find(({ index, _ }) => i === index))
            if (found) {
                res.push(found)
                i++
                return this._getAllPrevsEnumeratedHelper(i, res, cb)
            }
        }

        let stream = this._streams[i]
        stream.getPrev((err, prev) => {
            if (!err) res.push({ index: i, prev })
            i++
            this._getAllPrevsEnumeratedHelper(i, res, cb)
        })
    }

    /// Sorts '_streams' lexiographically on their feed-key
    _sortStreams() {
        this._streams.sort((s1, s2) => Buffer.compare(s1.feed.key, s2.feed.key))
    }

    /**
     * 
     * @param {[{index, prev}]} enumeratedPrevs with length > 0
     * @returns {[{index, prev}]} array of the newest message and all parallel to it. 'index' marks which stream 'prev' came from
     */
    _findNewest(enumeratedPrevs) {
        let enumeratedTimestamps = enumeratedPrevs.map(({ index, prev }) => ({ index, timestamp: new Timestamp({ index, vector: prev.vector }) }))

        // TODO: Im not sure of this is is correct as ||-property is not transitive..

        let { index: maxIndex, timestamp: maxTimestamp } = enumeratedTimestamps[0]

        // Find the newest timestamp
        for (let { index, timestamp } of enumeratedTimestamps) {
            if (timestamp.isNewerThan(maxTimestamp)) {
                maxIndex = index
                maxTimestamp = timestamp
            }
        }

        // Find parallels to the newest timestamp
        let parallels = [{ index: maxIndex, timestamp: maxTimestamp }]

        for (let { index, timestamp } of enumeratedTimestamps) {
            if (parallels.findIndex(({ index: _, timestamp: t }) => t.isParallelTo(timestamp)) > -1) {
                parallels.push({ index, timestamp })
            }
        }

        return parallels.map(({ index, timestamp: _ }) => enumeratedPrevs[index])
    }
}

module.exports = FeedMerger