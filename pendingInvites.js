const crypto = require('./crypto')
class PendingInvites {

    constructor() {
        /// Map<hash(disk-keys), Set<peerIDs>>
        this._invites = {}

        /// Set<Set<disk-key>>
        this._discoveryKeys = new Set()
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

    /*
        Private API
    */

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
}

module.exports = PendingInvites