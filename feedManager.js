const crypto = require('./crypto')
const hypercore = require('hypercore')

/// Responsible for ensuring that all feeds are ready for use and to keep track of all feed lengths
/// It is a precondition that 'ownFeed' already is 'ready' when this class is initialised
class FeedManager {
    constructor(path, ownFeed) {
        this._path = path
        this._ownFeed = ownFeed
        this._feedsData = {}
    }

    getFeed(feedPublicKey, cb) {
        this._lookup(feedPublicKey, data => { cb(data.feed) })
    }

    getFeedLength(feedPublicKey, cb) {
        this._lookup(feedPublicKey, data => { cb(data.feed) })
    }

    _lookup(feedPublicKey, cb) {
        if (feedPublicKey.equals(this._ownFeed.key)) {
            let data = {
                feed: this._ownFeed,
                length: this._ownFeed.length
            }
            cb(data)
            return
        }

        let feedPublicKeyString = feedPublicKey.toString('hex')
        let data = this._feedsData[feedPublicKeyString]

        if (data) {
            cb(data)
            return
        }

        this._addFeed(feedPublicKey, () => {
            cb(this._feedsData[feedPublicKeyString])
        })
    }

    _addFeed(feedPublicKey, completion) {
        let path = this._path + `${feedPublicKey.toString('hex')}`
        let feed = hypercore(path, feedPublicKey, { valueEncoding: 'json' })

        feed.on('append', () => this._onAppendHandler(feed))

        this._feedsData[feedPublicKey.toString('hex')] = {
            feed: feed,
            length: feed.length
        }

        feed.ready(() => {
            completion()
        })
    }

    _onAppendHandler(feed) {
        console.log('onAppend', feed.key.toString('hex').substring(0, 5), feed.length + 1)
        this._feedsData[feed.key.toString('hex')] = {
            feed: feed,
            length: feed.length + 1
        }
    }
}

module.exports = FeedManager