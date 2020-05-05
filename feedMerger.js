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
            stream.on('data', data => {
                console.log("received data")
                this.emit('data', data)
            })

            stream.on('vectorclock', vector => {
                console.log("received vectorclock", vector)
                this.emit('vectorclock', vector, this._peers)
            })
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
                this._rest = []
                return cb(null, enumeratedPrevs[0].prev)
            }
            let maxIndex = this._compare(enumeratedPrevs)
            // save the rest to next iteration
            this._rest = enumeratedPrevs.filter(elem => elem.index !== maxIndex)

            // remove indices and other unused metadata
            let res = enumeratedPrevs[maxIndex].prev

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

    _compare(enumeratedPrevs) {
        let i1 = enumeratedPrevs[0].index
        let v1 = enumeratedPrevs[0].prev.vector
        let i2 = enumeratedPrevs[1].index
        let v2 = enumeratedPrevs[1].prev.vector
        let t1 = new Timestamp({ index: i1, vector: v1 })
        let t2 = new Timestamp({ index: i2, vector: v2 })

        return t1.geq(t2) ? 0 : 1
    }
}

module.exports = FeedMerger