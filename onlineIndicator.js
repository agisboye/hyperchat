class OnlineIndicator {
    constructor(onOnLine, onOffline) {
        this._onOnline = onOnLine
        this._onOffline = onOffline
        this._peers = {}
    }

    increment(peer) {
        // convert peer to hex string
        if (Buffer.isBuffer(peer)) return this.increment(peer.toString('hex'))

        let counter = this._peers[peer]
        if (counter) {
            this._peers[peer] = counter + 1
        } else {
            this._peers[peer] = 1
            this._onOnline(peer)
        }
    }

    decrement(peer) {
        // convert peer to hex string
        if (Buffer.isBuffer(peer)) return this.decrement(peer.toString('hex'))

        let counter = this._peers[peer]

        if (counter === 1) {
            delete this._peers[peer]
            this._onOffline(peer)
        } else if (counter > 1) {
            this._peers[peer] = counter - 1
        }
    }
}


module.exports = OnlineIndicator