const crypto = require('./crypto')
const hypercore = require('hypercore')

/// Responsible for ensuring that all feeds are ready for use and to keep track of all feed lengths
/// It is a precondition that 'ownFeed' already is 'ready' when this class is initialised
class FeedManager {
    constructor(path, ownFeed) {
        this._path = path
        this._ownFeed = ownFeed

        /// known peers. Keyed by feed public key (hex-string)
        this._feeds = {}
    }

    getFeed(peerID, cb) {
        let feedPublicKey = crypto.getFeedKeyFromPeerID(peerID)

        if (feedPublicKey.equals(this._ownFeed.key)) return cb(this._ownFeed)

        let feedPublicKeyString = feedPublicKey.toString('hex')
        let feed = this._feeds[feedPublicKeyString]

        if (feed) return cb(feed)

        this._addFeed(feedPublicKey, () => {
            cb(this._feeds[feedPublicKeyString])
        })
    }

    getFeedsForGroup(group, cb) {
        // We clone to avoid side effects of modifying groupKeys
        // We remove duplicates
        let groupClone = [... new Set(group)]
        this._getFeedsForGroup(groupClone, [], cb)
    }

    _getFeedsForGroup(group, feeds, cb) {
        if (group.length === 0) return cb(feeds)

        let peerID = group.shift()
        this.getFeed(peerID, feed => {
            feeds.push(feed)
            this._getFeedsForGroup(group, feeds, cb)
        })
    }

    getLengthsOfFeeds(peerIDs, cb) {
        // We clone to avoid side effects of modifying peerIDs
        let peerIDsClone = [...peerIDs]
        this._getLengthsOfFeeds(peerIDsClone, [], cb)
    }

    _getLengthsOfFeeds(peerIDs, keysAndLengths, cb) {
        if (peerIDs.length === 0) return cb(this._sortLengthsByKeys(keysAndLengths))

        let head = peerIDs.shift()
        this._getLengthOf(head, (res) => {
            keysAndLengths.push(res)
            this._getLengthsOfFeeds(peerIDs, keysAndLengths, cb)
        })
    }

    _sortLengthsByKeys(keysAndLengths) {
        keysAndLengths.sort((a, b) => a.feedkey.localeCompare(b.feedkey))
        return keysAndLengths.map(({feedkey, length}) => length)
    }

    _getLengthOf(peerID, cb) {
        this.getFeed(peerID, (feed) => {
            cb({
                feedkey: feed.key.toString('hex'),
                length: feed.length
            })
        })
    }

    _addFeed(feedPublicKey, cb) {
        let path = this._path + `${feedPublicKey.toString('hex')}`
        let feed = hypercore(path, feedPublicKey, { valueEncoding: 'json' })

        this._feeds[feedPublicKey.toString('hex')] = feed

        feed.ready(() => {
            cb()
        })
    }
}

module.exports = FeedManager