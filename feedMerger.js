const { EventEmitter } = require('events')
const ReverseFeedStream = require('./reverseFeedStream')
const Timestamp = require('./timestamp')

class FeedMerger extends EventEmitter {
    constructor(potasium, key, feedsByPeers) {
        super()
        this._streams = feedsByPeers.map(({ peer, feed }) => new ReverseFeedStream(potasium, feed, peer, key))
        this._sortStreams()
        this._streamsEnumerated = this._streams.map((stream, index) => ({ index, stream }))

        this._peers = feedsByPeers.map(({ peer, feed }) => peer)
        this._streams.forEach(stream => {
            stream.on('data', data => this.emit('data', data))
            stream.on('vectorclock', vector => this.emit('vectorclock', vector, this._peers))
        })
    }

    /// Returns the latest messages (err, [{message, sender, vector}]) using callback 
    // How the algorithm runs: 
    // 1) Receive all the previous messages from '_streams'
    // 2) Compute the latest messages. This is done by finding the one with the largest vector
    //    and all messages parallel to this one. These are intended to be returned. 
    // 3) All the messages that are not the latest ones should be saved to next iteration in '_rest'
    // 4) Remove any unused metadata attached to each message
    async getPrev() {
        let enumeratedPrevs = await this._getAllPrevsEnumerated()

        if (enumeratedPrevs.length === 0) return null
        if (enumeratedPrevs.length === 1) return enumeratedPrevs[0].prev

        let newest = this._findNewest(enumeratedPrevs)
        // save the rest to next iteration
        this._rest = enumeratedPrevs.filter(({ index: i1, prev: _ }) => newest.findIndex(({ index: i2, prev: _ }) => i1 === i2) === -1)


        let timestamps = newest.map(({ timestamp }) => timestamp)

        let extra = []
        for (let { index } of newest) {
            let stream = this._streams[index]
            let parallels = await stream.getAllPrevsParallelToTimestamps(timestamps)
            extra = extra.concat(parallels)
        }

        newest = newest.map(({ index, prev }) => prev)
        // remove indices 
        let res = newest.concat(extra)
        return res
    }

    /// Returns [{index, prev}] where prev: {message, sender, vector} from all streams. 
    /// 'index' shows which stream from '_streams' the message came from. 
    async _getAllPrevsEnumerated() {
        return await this._getAllPrevsEnumeratedHelper(0, [])
    }

    /// Returns [{index, prev}] where prev: {message, sender, vector} from all streams. 
    // i = index for the current stream. 
    // res = where we save our result incrementally
    // How the algorithm runs: 
    // 1) Check in '_rest' if a message has been cached for the i'th stream. 
    // 2) Else get a fresh previous message from the i'th stream. 
    async _getAllPrevsEnumeratedHelper(i, res) {
        // All streams have been traversed
        if (this._streams.length === i) return res

        // Search in '_rest' before searching through streams. 
        if (this._rest) {
            let found = (this._rest.find(({ index, _ }) => i === index))
            if (found) {
                res.push(found)
                i++
                return await this._getAllPrevsEnumeratedHelper(i, res)
            }
        }

        let stream = this._streams[i]
        let prev = await stream.getPrev()
        if (prev) res.push({ index: i, prev })
        i++
        return await this._getAllPrevsEnumeratedHelper(i, res)
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
        let enumeratedPrevsWithTimestamps = enumeratedPrevs
            .map(({ index, prev }) => ({ index, prev, timestamp: new Timestamp({ index, vector: prev.vector }) }))

        // TODO: Im not sure of this is is correct as ||-property is not transitive..

        let max = this._findNewestTimestamp(enumeratedPrevsWithTimestamps)
        let parallels = this._findParallelsTo(max, enumeratedPrevsWithTimestamps)

        return parallels.map(({ index, timestamp: _ }) => enumeratedPrevsWithTimestamps[index])
    }

    _findNewestTimestamp(enumeratedPrevsWithTimestamps) {
        let { index: maxIndex, timestamp: maxTimestamp } = enumeratedPrevsWithTimestamps[0]

        // Find the newest timestamp
        for (let { index, timestamp } of enumeratedPrevsWithTimestamps) {
            if (timestamp.isNewerThan(maxTimestamp)) {
                maxIndex = index
                maxTimestamp = timestamp
            }
        }
        return enumeratedPrevsWithTimestamps[maxIndex]
    }

    _findParallelsTo(reference, list) {
        // Find parallels to the newest timestamp
        let parallels = [reference]
        for (let { index, timestamp } of list) {
            if (parallels.findIndex(({ index: _, timestamp: t }) => t.isParallelTo(timestamp)) > -1) {
                parallels.push({ index, timestamp })
            }
        }
        return parallels
    }
}

module.exports = FeedMerger