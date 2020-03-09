//TODO: Come up with a better name than 'stream-manager'. Too generic
const { Transform } = require('stream')

class StreamFilter extends Transform {

    constructor(predicate) {
        super({ objectMode: true }) // Ensures that 'chunk' is interpreted as json-objects
        this._predicate = predicate
    }

    _transform(chunk, encoding, next) {
        if (this._predicate(chunk)) {
            return next(null, chunk)
        }

        next()
    }
}

class StreamMap extends Transform {
    constructor(func) {
        super({
            objectMode: true,
            transform(chunk, encoding, callback) {
                callback(null, func(chunk))
            }
        })
    }
}

class StreamManager {

    constructor(ownIdentity) {
        this._ownIdentity = ownIdentity
    }
    createDecryptedReadStream(feedStream, otherPeerID) {
        let filter = new StreamFilter(v => this._ownIdentity.canDecryptMessage(v, otherPeerID))
        let map = new StreamMap(v => this._ownIdentity.decryptMessage(v, otherPeerID))

        return feedStream.pipe(filter).pipe(map)
    }

    createDecryptedReadStream2(feed, otherPeerID) {
        // find dict in head
        feed.head({ wait: true, timeout: 0 }, (err, head) => {
            if (err) throw err

            let index = head.data.dict["B"]

            feed.get(index, (err, message) => {
                if (err) throw err
                let decrypted = this._ownIdentity.decryptMessageFromOther(message.data.ciphertext, otherPeerID)
                if (decrypted) {
                    //TODO: Append/emit/somtething to add this decrypted message to the outside
                    console.log(decrypted)
                }
            })
        })
    }
}

module.exports = StreamManager