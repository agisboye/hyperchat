const hypercore = require('hypercore')

/**
 * Responsible for ensuring that all feeds are ready for use and to keep track of all feed lengths
 */
class FeedManager {
    constructor(path, ownFeed) {
        this._path = path
        this._ownFeed = ownFeed

        /// known peers. Keyed by feed public key (hex-string)
        this._feeds = {}
    }

    /**
     * 
     * @param {Peer} peer 
     * @param {*} cb 
     */
    getFeed(peer, cb) {
        if (peer.pubKey.equals(this._ownFeed.key)) return cb(this._ownFeed)

        const feed = this._feeds[peer.id]
        if (feed) return cb(feed)

        this._addFeed(peer, () => {
            cb(this._feeds[peer.id])
        })
    }

    /// Returns [{peer, feed}], pairs of peer and its corresponding feed. 
    /**
     * 
     * @param {Group} group 
     * @param {*} cb 
     */
    getFeedsByPeersForGroup(group, cb) {
        let peers = [... new Set(group.peers)]
        this._getFeedsByPeersForGroup(peers, [], cb)
    }

    _getFeedsByPeersForGroup(peers, feedsByPeers, cb) {
        if (peers.length === 0) return cb(feedsByPeers)

        let peer = peers.shift()
        this.getFeed(peer, feed => {
            feedsByPeers.push({peer, feed})
            this._getFeedsByPeersForGroup(peers, feedsByPeers, cb)
        })
    }

    /**
     * 
     * @param {Group} group
     * @param {*} cb 
     */
    getLengthsOfFeeds(group, cb) {
        let peers = [...group.peers]
        this._getLengthsOfFeeds(peers, [], cb)
    }

    _getLengthsOfFeeds(peers, keysAndLengths, cb) {
        if (peers.length === 0) return cb(this._sortLengthsByKeys(keysAndLengths))

        const peer = peers.shift()
        this._getLengthOf(peer, (res) => {
            keysAndLengths.push(res)
            this._getLengthsOfFeeds(peers, keysAndLengths, cb)
        })
    }

    _sortLengthsByKeys(keysAndLengths) {
        keysAndLengths.sort((a, b) => a.feedkey.localeCompare(b.feedkey, "en"))
        return keysAndLengths.map(({feedkey, length}) => length)
    }

    _getLengthOf(peer, cb) {
        this.getFeed(peer, (feed) => {
            cb({
                feedkey: feed.key.toString('hex'),
                length: feed.length
            })
        })
    }

    _addFeed(peer, cb) {
        const path = this._path + peer.id
        const feed = hypercore(path, peer.pubKey, { valueEncoding: 'json' })

        this._feeds[peer.id] = feed

        feed.ready(cb)
    }
}

module.exports = FeedManager