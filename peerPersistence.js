const crypto = require('./crypto')
const fs = require('fs')

class PeerPersistence {

    constructor(name) {
        this._filepath = "./persistence/peers" + name + ".json"

        /// Map<hash(disk-keys), Set<peerIDs>>
        this._invites = {}

        /// Set<Set<disk-key>>
        this._discoveryKeys = new Set()
        // load peers from disc
        this._loadPeers()
    }

    /// tuple = {disckKeys, peerIDs}
    addPendingInvite(tuple) {
        let { discKeys, discKeyStringSet, peerIDs } = this._convert(tuple)
        let hash = crypto.hash(Buffer.concat(discKeys))
        this._discoveryKeys.add(discKeyStringSet)
        this._invites[hash] = new Set(peerIDs)
    }

    /// tuple = {disckKeys, peerIDs}
    _convert(tuple) {
        // ensure dickKeys is [Buffer]
        let bufferdisckKeys = (Buffer.isBuffer(tuple.discKeys[0])) ? tuple.discKeys : tuple.discKeys.map(d => Buffer.from(d, 'hex'))
        // Ensure peerIDs is [string]
        let hexPeers = (Buffer.isBuffer(tuple.peerIDs[0])) ? tuple.peerIDs.map(b => b.toString('hex')) : tuple.peerIDs

        let discKeyStringSet = new Set(bufferdisckKeys.map(b => b.toString('hex')))
        return {
            discKeys: bufferdisckKeys,
            discKeyStringSet: discKeyStringSet,
            peerIDs: hexPeers
        }
    }

    getAllPendingInvitesMatchingTopics(topics) {
        // remove duplicate topics
        topics = [... new Set(topics)]
        let pendingInviteGroups = this._filterForPendingInvites(topics)

        // Find corresponding peerIDs from the found discovery-keys
        return pendingInviteGroups.map(group => {
            // A match is an array of dickovery-keys.
            // We find its corresponding peerIDs by
            let groupAsBuffers = group.map(discKeyString => Buffer.from(discKeyString, 'hex'))
            let hash = crypto.hash(Buffer.concat(groupAsBuffers))

            return [...this._invites[hash]].map(peer => Buffer.from(peer, 'hex'))
        })
    }

    /// returns a filtered array of pending invites (array of hex-disc-keys) containing a topic in 'topics'
    _filterForPendingInvites(topics) {
        // [[disc-key]]
        let res = []
        topics.forEach(topic => {
            let group = this._getInviteContaining(topic)
            if (group.length > 0) res.push(group)
        })
        return res
    }


    peers() {
        return Object.keys(this._peers).map(k => {
            let res = Buffer.from(k, 'hex')
            return res
        })
    }

    /// Adds peerID to known peers and returns feed public key for peerID
    addPeer(peerID, isInitiator) {
        // TODO: Should be no-op if we already know peer but right now we can change who is initiator.
        this._peers[peerID.toString('hex')] = isInitiator
        this._save()
        return this.getFeedPublicKeyFromPeerID(peerID)
    }

    getAllKnownPeerIDs() {
        return Object.keys(this._peers)
    }

    knowsPeer(peerID) {
        return this._peers[peerID.toString('hex')] !== undefined
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
        return this.peers().find(peerID => {
            let discoveryKey = this.getDiscoveryKeyFromPeerID(peerID)
            return discoveryKey.equals(topic)
        })
    }

    /*
        Private API
    */

    //TODO: handle case where 'topic' is in multiple groups
    _getInviteContaining(topic) {
        let topicString = topic.toString('hex')
        let res = []
        this._discoveryKeys.forEach(discKeys => {
            if (discKeys.has(topicString)) res.push(discKeys)
        })

        if (res.length === 0) {
            return []
        } else if (res.length > 1) {
            throw new Error("More than 1 pending invites were found for " + peer.toString('hex').substring(0, 10))
        }
        // convert to array of buffers
        return [...res[0]].map(p => Buffer.from(p, 'hex'))
    }

    _getPeer(id) {
        return this._peers[id.toString('hex')]
    }

    _loadPeers() {
        let peers;

        try {
            peers = JSON.parse(fs.readFileSync(this._filepath))
        } catch { }

        this._peers = peers || {}
    }

    /// Save peers to disk
    _save() {
        fs.writeFileSync(this._filepath, JSON.stringify(this._peers))
    }
}

module.exports = PeerPersistence