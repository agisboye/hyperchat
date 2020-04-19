const crypto = require('./crypto')
const fs = require('fs')

class PeerPersistence {

    constructor(name) {
        this._filepath = "./persistence/groups" + name + ".json"
        // load groups from disc
        this._loadGroups()
    }

    groups() {
        return this._groups.map(group => group.map(peer => Buffer.from(peer, 'hex')))
    }

    uniquePeers() {
        return [... new Set(this._groups.flat())]
    }

    // Ensures that each group is converted to strings + sorted lexiographically before adding it
    addGroup(group) {
        if (this.knowsGroup(group)) return
        let convertedGroup = this._convert(group)
        this._groups.push(convertedGroup)
        this._save()
    }

    _convert(group) {
        // Make a copy to avoid side effects
        let res = [...group]
        // We convert peers to strings, remove duplicates 
        // and sort lexiographically before adding the group.
        res = res.map(p => p.toString('hex'))
        res = [... new Set(res)]
        res.sort((p1, p2) => p1.localeCompare(p2))

        return res
    }

    knowsGroup(group) {
        let converted = this._convert(group)
        return this._groups.find(group => this._equal(group, converted)) !== undefined
    }

    /// Pre: Both groups are lexiographically sorted
    _equal(group1, group2) {
        if (group1.length !== group2.length) return false

        for (var i = 0; i < group1.length; i++) {
            if (group1[i] !== group2[i]) return false
        }
        return true
    }

    //TODO: Refactor. It's stupid to just call crypto further down.
    getDiscoveryKeyFromFeedPublicKey(feedKey) {
        return crypto.getDiscoveryKeyFromFeedPublicKey(feedKey)
    }

    //TODO: Refactor. It's stupid to just call crypto further down.
    getFeedPublicKeyFromPeerID(peerID) {
        return crypto.getFeedKeyFromPeerID(peerID)
    }

    //TODO: Refactor. It's stupid to just call crypto further down.
    getDiscoveryKeyFromPeerID(peerID) {
        return crypto.getDiscoveryKeyFromFeedPublicKey(this.getFeedPublicKeyFromPeerID(peerID))
    }

    //TODO: Refactor. It's stupid to just call crypto further down.
    getFeedPublicKeyFromDiscoveryKey(discoveryKey) {
        return this.getFeedPublicKeyFromPeerID(this.getFirstPeerIDMatchingTopic(discoveryKey))
    }

    // TODO: This is a really shitty solution....... Find a better one
    getFirstPeerIDMatchingTopic(topic) {
        for (let group of this.groups()) {
            for (let peerID of group) {
                let discoveryKey = this.getDiscoveryKeyFromPeerID(peerID)
                if (discoveryKey.equals(topic)) return peerID
            }
        }
        return null
    }

    /*
        Private API
    */

    _loadGroups() {
        let groups;

        try {
            groups = JSON.parse(fs.readFileSync(this._filepath))
        } catch { }

        this._groups = groups || []
    }

    /// Save groups to disk
    _save() {
        fs.writeFileSync(this._filepath, JSON.stringify(this._groups))
    }
}

module.exports = PeerPersistence