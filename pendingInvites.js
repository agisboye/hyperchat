const crypto = require('./crypto')
class PendingInvites {

    constructor(me) {
        this._me = me

        /// Map<Peer, Map<Group, Invite>>
        this._invites = {}
    }

    /**
     * 
     * @param {Group} group
     * @param {Buffer} key The symmetric encryption key used to encrypt messages in the group.
     */
    addPendingInvites(group, key) {

        const invite = {
            key: key.toString("hex"),
            peers: group.peers.map(p => p.id)
        }

        // Save invite for each peer in the group (except for myself)
        for (let peer of group.peers) {
            if (peer.equals(this._me)) continue

            const invites = this._invites[peer.id]
            if (invites && invites[group.id]) continue
            if (!invites) this._invites[peer.id] = {}

            this._invites[peer.id][group.id] = invite
        }

    }

    removePendingInvites(peer) {
        delete this._invites[peer.id]
    }

    /**
     * Returns all invites that are pending for a given peer.
     * The invites will be removed from the 
     * @param {Peer} peer 
     */
    getPendingInvites(peer) {
        const invites = this._invites[peer.id] || {}
        const values = Object.values(invites)

        this.removePendingInvites(peer)
        return values
    }

}

module.exports = PendingInvites