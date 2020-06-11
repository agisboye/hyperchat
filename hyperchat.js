const { EventEmitter } = require('events')
const Protocol = require('hypercore-protocol')
const pump = require('pump')
const hypercore = require('hypercore')
const hyperswarm = require('hyperswarm')
const GroupPersistence = require('./groupPersistence')
const FeedManager = require('./feedManager')
const FeedMerger = require('./feedMerger')
const OnlineIndicator = require('./onlineIndicator')
const Keychain = require('./keychain')
const PendingInvites = require('./pendingInvites')
const Peer = require('./peer')
const Group = require('./group')
const crypto = require('./crypto')

const HYPERCHAT_EXTENSION = "hyperchat"
const HYPERCHAT_PROTOCOL_INVITE = "invite"


const Events = {
    READY: "ready",
    INVITE: "invite",
    PEERS_CHANGED: "peers_changed"
}

class Hyperchat extends EventEmitter {

    constructor(name) {
        super()

        let path = './feeds/' + name + '/'

        this._keychain = new Keychain(name)

        let keyPair = this._keychain.myKeypair
        this.me = new Peer(keyPair.publicKey)
        this._groupPersistence = new GroupPersistence(name)
        this._pendingInvites = new PendingInvites(this.me)

        this._swarm = hyperswarm()
        this._protocolKeyPair = Protocol.keyPair()

        this._feed = hypercore(
            path + keyPair.publicKey.toString("hex"),
            keyPair.publicKey,
            {
                valueEncoding: 'json',
                secretKey: keyPair.secretKey
            }
        )
        this._feedsManager = new FeedManager(path, this._feed)

        // Streams from peers that have sent an invite which has not yet been accepted/rejected.
        // Keyed by peer.
        this._inviteStreams = {}

        // Determines whether this client will send an online proof to other clients that it connects to.
        this.sendIdentityProofs = true

        this._onlineIndicator = new OnlineIndicator(peer => {
            console.log(`${peer} is online`)
            this.emit(Events.PEERS_CHANGED, this.peers)
        }, peer => {
            console.log(`${peer} is offline`)
            this.emit(Events.PEERS_CHANGED, this.peers)
        })

    }

    /** Public API **/
    start() {
        this._feed.ready(() => {
            this._print()
            this._announceSelf()
            this._joinTopics(this._groupPersistence.peers)
            this._swarm.on('connection', (socket, details) => this._onConnection(socket, details))
            this.emit(Events.READY)
        })
    }

    /**
     * Returns an array of all groups that we are participating in.
     * @returns {Array<Group>}
     */
    get groups() {
        return this._groupPersistence.groups
    }

    /**
     * Returns an array of known peers as well as their current online status
     * @returns {Array<Peer>}
     */
    get peers() {
        return this._groupPersistence.peers.map(peer => {
            return {
                id: peer.id,
                isOnline: this._onlineIndicator.isOnline(peer)
            }
        })
    }

    /**
     * 
     * @param {Array<Peer>} peers
     */
    invite(peers) {
        // Include self in conversation
        peers.push(this.me)

        const group = Group.init(peers, this.me)
        this._groupPersistence.addGroup(group)
        const key = this._keychain.getGroupKey(group)
        console.log("Inviting " + group)

        this._pendingInvites.addPendingInvites(group, key)
        this._joinTopics(group.peers)
        this.emit(Events.PEERS_CHANGED, this.peers)
    }

    /**
     * 
     * @param {Group} group 
     */
    acceptInvite(group) {
        this._groupPersistence.addGroup(group)
        this.emit(Events.PEERS_CHANGED, this.peers)

        for (let peer of group.peers) {
            let stream = this._inviteStreams[peer.id]
            if (stream) {
                delete this._inviteStreams[peer.id]
                this._replicate(peer, stream)
            }
        }
    }

    /**
     * 
     * @param {Group} group 
     * @param {string} content 
     */
    sendMessageTo(group, content) {
        let key = this._keychain.getGroupKey(group)
        group.timestamp.increment()
        let vectorTimestamp = group.timestamp.sendableForm()
        this._groupPersistence.saveTimestampForGroup(group)
        this._createEncryptedMessage(content, vectorTimestamp, key, (message) => {
            this._feed.append(message, err => {
                if (err) throw err
            })
        })
    }

    /**
     * Sets up a read stream that contains all messages
     * in a given conversation.
     * @param {Group} group
     */
    async getReadStream(group) {
        let key = this._keychain.getGroupKey(group)

        let feedsByPeers = await this._feedsManager.getFeedsByPeersForGroup(group)
        let merger = new FeedMerger(key, feedsByPeers)

        merger.on('vectorclock', (vector, peers) => this._updateVectorclock(vector, peers))
        return merger
    }

    /** Private API **/

    /**
     * 
     * @param {Array<number>} vector 
     * @param {Array<Peer>} peers 
     */
    _updateVectorclock(vector, peers) {
        this._groupPersistence.updateTimestampForGroup(Group.init(peers, this.me), vector)
    }

    _announceSelf() {
        console.log("Announcing self")
        this._swarm.join(this.me.feedDiscoveryKey, { lookup: true, announce: true })
    }

    /**
     * Joins the topics of all peers that we know.
     * @param {Array<Peer>} peers 
     */
    _joinTopics(peers) {
        peers.forEach(peer => {
            this._swarm.join(peer.feedDiscoveryKey, { lookup: true, announce: true })
        })
    }

    _onConnection(socket, details) {

        const stream = new Protocol(details.client, {
            keyPair: this._protocolKeyPair,
            onhandshake: () => {
                // Drop duplicate connections
                let dropped = details.deduplicate(stream.publicKey, stream.remotePublicKey)
            },
            ondiscoverykey: (discoveryKey) => {
                let peer = this._groupPersistence.getPeerForDiscoveryKey(discoveryKey)

                if (peer) {
                    // If the peer has sent a capability for  their key, we know that they
                    // are the owner.                    
                    if (stream.remoteVerified(peer.pubKey)) {

                        const count = this._onlineIndicator.increment(peer)

                        // TODO: Make this prettier
                        if (count === 1) {
                            const invites = this._pendingInvites.getPendingInvites(peer)
                            for (let invite of invites) {
                                extension.send({
                                    type: HYPERCHAT_PROTOCOL_INVITE,
                                    data: invite
                                })
                            }
                        }
                    }
                }
            },
            onchannelclose: (discoveryKey, _) => {
                let peer = this._groupPersistence.getPeerForDiscoveryKey(discoveryKey)

                if (peer) {
                    this._onlineIndicator.decrement(peer)
                }
            }
        })

        const extension = stream.registerExtension(HYPERCHAT_EXTENSION, {
            encoding: 'json',
            onmessage: (message) => {

                switch (message.type) {
                    case HYPERCHAT_PROTOCOL_INVITE:

                        // Ensure that the inviting peer is in the group that they are invitin≥g to.
                        const pubKeys = message.data.peers.map(p => Buffer.from(p, "hex"))
                        const invitingPeerIndex = pubKeys.findIndex(k => stream.remoteVerified(k) && !this.me.pubKey.equals(k))
                        const verified = invitingPeerIndex !== -1

                        if (!verified) return
                        const peers = pubKeys.map(p => new Peer(p))
                        // TODO: Simple hack to make up for the missing 'remoteAuthenticated' 
                        // which is not yet integrated into hypercore-protocol. 
                        if (!peers.includes(this.me)) return
                        
                        const group = Group.init(peers, this.me)

                        // Save group and key
                        const key = Buffer.from(message.data.key, "hex")
                        this._keychain.saveGroupKey(key, group)
                        this._inviteStreams[peers[invitingPeerIndex].id] = stream


                        // connect to the remaining group members (all except yourself and inviter)
                        let remainingPubKeys = pubKeys
                        remainingPubKeys.splice(invitingPeerIndex, 1)
                        remainingPubKeys = remainingPubKeys.filter((k) => !this.me.pubKey.equals(k))
                        let remainingPeers = remainingPubKeys.map(k => new Peer(k))
                        this._joinTopics(remainingPeers)

                        this.emit(Events.INVITE, group)

                        break

                    default:
                        throw new Error("Unsupported protocol message")
                }
            }
        })

        this._replicateAll(stream)
        pump(stream, socket, stream)
    }

    /**
     * 
     * @param {Peer} peer 
     * @param {*} stream 
     */
    _replicate(peer, stream) {
        this._feedsManager.getFeed(peer, feed => {
            feed.replicate(stream, { live: true })
        })
    }

    _replicateAll(stream) {
        this._feedsManager.getAllFeeds((feeds) => {
            for (let feed of feeds) {
                feed.replicate(stream, { live: true })
            }
        })
    }

    _createEncryptedMessage(plaintext, vectorTimestamp, key, cb) {
        const internalMessage = {
            type: "message",
            vector: vectorTimestamp,
            message: plaintext
        }

        const ciphertext = crypto.encryptMessage(JSON.stringify(internalMessage), key)
        const chatID = crypto.makeChatID(key, this._feed.key).toString('hex')

        this._feed.head((err, head) => {
            if (err && this._feed.length > 0) return cb(err)

            const conversationIDs = ((head) ? head.conversationIDs : undefined) || {}
            conversationIDs[chatID] = this._feed.length
            cb({
                conversationIDs: conversationIDs,
                ciphertext: ciphertext.toString('hex')
            })
        })
    }

    _print() {
        console.log('------------------------')
        console.log('> status [hex notation]:')
        console.log('> feedkey =', this.me.id)
        console.log('> disckey =', this.me.feedDiscoveryKey.toString('hex').substring(0, 10) + "...")
        console.log('------------------------')
    }

}

module.exports = { Hyperchat, Events }