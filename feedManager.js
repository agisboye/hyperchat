const hypercore = require('hypercore')
const promisify = require('util').promisify
/**
 * Responsible for ensuring that all feeds are ready for use and to keep track of all feed lengths
 */
class FeedManager {
    constructor(path, ownFeed) {
        this._path = path
        this._ownFeed = ownFeed

        /// known peers. Keyed by feed public key (hex-string)
        this._feeds = {}
        this._getFeedsByPeersForGroupAsync = promisify(this._getFeedsByPeersForGroup).bind(this)
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

    get feeds() {
        let replicas = Object.values(this._feeds)
        replicas.push(this._ownFeed)
        return replicas
    }

    /// Returns [{peer, feed}], pairs of peer and its corresponding feed. 
    /**
     * 
     * @param {Group} group 
     * @param {*} cb 
     */
    async getFeedsByPeersForGroup(group) {
        let peers = [... new Set(group.peers)]
        try {
            return await this._getFeedsByPeersForGroupAsync(peers, [])
        } catch (err) {
            return null
        }
    }

    _getFeedsByPeersForGroup(group, feedsByPeers, cb) {
        if (group.length === 0) return cb(null, feedsByPeers)

        let peer = group.shift()
        this.getFeed(peer, feed => {
            feedsByPeers.push({ peer, feed })
            this._getFeedsByPeersForGroup(group, feedsByPeers, cb)
        })
    }

    getLengthByKeysOfFeeds(group, cb) {
        // We clone to avoid side effects of modifying group
        let peers = [...group.peers]
        this._getLengthByKeysOfFeeds(peers, [], cb)
    }

    _getLengthByKeysOfFeeds(group, keysAndLengths, cb) {
        if (group.length === 0) return cb(this._sortLengthsAndKeysByKeys(keysAndLengths))

        const peer = group.shift()
        this._getLengthOf(peer, (res) => {
            keysAndLengths.push(res)
            this._getLengthByKeysOfFeeds(group, keysAndLengths, cb)
        })
    }

    _sortLengthsAndKeysByKeys(keysAndLengths) {
        keysAndLengths.sort((a, b) => a.feedkey.localeCompare(b.feedkey))
        keysAndLengths = keysAndLengths.map(({ feedkey, length }) => ({ feedkey: Buffer.from(feedkey, 'hex'), length: length }))
        return keysAndLengths
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