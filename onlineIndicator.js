class OnlineIndicator {
    constructor(onOnline, onOffline) {
        this._onOnline = onOnline
        this._onOffline = onOffline
        this._counts = {}
    }

    /**
     * 
     * @param {Peer} peer 
     * @returns {Boolean}
     */
    isOnline(peer) {
        return this._counts[peer.id] >= 1
    }

    /**
     * 
     * @param {Peer} peer 
     */
    increment(peer) {
        let key = peer.id
        let count = this._counts[key]
        if (count) {
            this._counts[key] = count + 2
        } else {
            this._counts[key] = 2
            this._onOnline(peer)
        }

        return this._counts[key]
    }

    /**
     * 
     * @param {Peer} peer 
     */
    decrement(peer) {
        let key = peer.id
        let count = this._counts[key]

        if (count === 1) {
            delete this._counts[key]
            this._onOffline(peer)
        } else if (count > 1) {
            this._counts[key] = count - 1
        }
    }
}


module.exports = OnlineIndicator