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

        if (feedPublicKey.equals(this._ownFeed.key)) {
            cb(this._ownFeed)
            return
        }

        let feedPublicKeyString = feedPublicKey.toString('hex')
        let feed = this._feeds[feedPublicKeyString]

        if (feed) {
            cb(feed)
            return
        }

        this._addFeed(feedPublicKey, () => {
            cb(this._feeds[feedPublicKeyString])
        })
    }

    getFeedLengthOf(peerID, cb) {
        this.getFeed(peerID, (feed) => { cb(feed.length) })
    }

    _addFeed(feedPublicKey, completion) {
        let path = this._path + `${feedPublicKey.toString('hex')}`
        let feed = hypercore(path, feedPublicKey, { valueEncoding: 'json' })

        this._feeds[feedPublicKey.toString('hex')] = feed

        feed.ready(() => {
            completion()
        })
    }
}

module.exports = FeedManager