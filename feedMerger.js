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
        let prevs = await this._getAllPrevsEnumerated()

        if (prevs.length === 0) return null
        if (prevs.length === 1) {
            this._rest = []
            this._removeAddedProperties(prevs[0])
            return prevs[0]
        }
        let newest = this._findNewest(prevs)
        // save the rest to next iteration
        this._rest = prevs.filter(p1 => newest.findIndex(p2 => p1.index === p2.index) === -1)

        let extra = []
        for (let prev of newest) {
            let stream = this._streams[prev.index]

            let otherPrevs = newest.filter((p => !p.timestamp.isEqualTo(prev.timestamp)))
            let otherTimestamps = otherPrevs.map(prev => prev.timestamp)

            let parallels = await stream.getAllPrevsParallelToTimestamps(otherTimestamps)
            extra = extra.concat(parallels)
        }

        newest.forEach(this._removeAddedProperties)
        // remove indices 
        let res = newest.concat(extra)
        return res
    }

    //TODO: Refactor to loop instead of using helper.
    /// Returns [{index, prev}] where prev: {message, sender, vector} from all streams. 
    /// 'index' shows which stream from '_streams' the message came from. 
    async _getAllPrevsEnumerated() {
        return await this._getAllPrevsEnumeratedHelper(0, [])
    }


    //TODO: Refactor to loop instead of using helper.
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
            let found = (this._rest.find(prev => prev.index === i))
            if (found) {
                res.push(found)
                i++
                return await this._getAllPrevsEnumeratedHelper(i, res)
            }
        }

        let stream = this._streams[i]
        let prev = await stream.getPrev()
        if (prev) {
            prev.index = i
            res.push(prev)
        }
        i++
        return await this._getAllPrevsEnumeratedHelper(i, res)
    }

    /// Sorts '_streams' lexiographically on their feed-key
    _sortStreams() {
        this._streams.sort((s1, s2) => Buffer.compare(s1.feed.key, s2.feed.key))
    }

    /**
     * 
     * @param {[{index, prev}]} prevs with length > 0
     * @returns {[{index, prev}]} array of the newest message and all parallel to it. 'index' marks which stream 'prev' came from
     */
    _findNewest(prevs) {
        prevs.forEach(prev => prev.timestamp = new Timestamp({ index: prev.index, vector: prev.vector }))

        // TODO: Im not sure of this is is correct as ||-property is not transitive..
        let max = this._findNewestTimestamp(prevs)
        let parallels = this._findParallelsTo(max, prevs)

        return parallels
    }

    _removeAddedProperties(prev) {
        delete prev.index
        delete prev.timestamp
    }

    _findNewestTimestamp(prevs) {
        let max = prevs[0]
        // Find the newest timestamp
        for (let prev of prevs) {
            if (prev.timestamp.isNewerThan(max.timestamp)) {
                max = prev
            }
        }
        return max
    }

    _findParallelsTo(reference, prevs) {
        // Find parallels to the newest timestamp
        let parallels = [reference]
        for (let prev of prevs) {
            if (parallels.findIndex(par => par.timestamp.isParallelTo(prev.timestamp)) > -1) parallels.push(prev)
        }
        return parallels
    }
}

module.exports = FeedMerger