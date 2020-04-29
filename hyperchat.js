const { EventEmitter } = require('events')
const Protocol = require('hypercore-protocol')
const pump = require('pump')
const hypercore = require('hypercore')
const hyperswarm = require('hyperswarm')
const PeerPersistence = require('./peerPersistence')
const Potasium = require('./potasium')
const FeedManager = require('./feedManager')
const FeedMerger = require('./feedMerger')
const OnlineIndicator = require('./onlineIndicator')
const Keychain = require('./keychain')
const PendingInvites = require('./pendingInvites')
const Peer = require('./peer')
const Group = require('./group')

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
        this._peerPersistence = new PeerPersistence(name)
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
        this._potasium = new Potasium(this._feed)

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
            this._joinTopics(this._peerPersistence.peers)
            this._swarm.on('connection', (socket, details) => this._onConnection(socket, details))
            this.emit(Events.READY)
        })
    }

    /**
     * Returns an array of all groups that we are participating in.
     * @returns {Array<Group>}
     */
    get groups() {
        return this._peerPersistence.groups
    }



    /**
     * Returns an array of known peers as well as their current online status
     * @returns {Array<Peer>}
     */
    get peers() {
        return this._peerPersistence.peers.map(peer => {
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

        const group = new Group(peers)
        this._peerPersistence.addGroup(group)
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
        this._peerPersistence.addGroup(group)
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
        this._feedsManager.getLengthByKeysOfFeeds(group, keysAndLengths => {
            let key = this._keychain.getGroupKey(group)
            this._potasium.createEncryptedMessage(content, keysAndLengths, key, (message) => {

                this._feed.append(message, err => {
                    if (err) throw err
                })
            })
        })
    }

    /**
     * Sets up a read stream that contains all messages
     * in a given conversation.
     * @param {Group} group
     * @param {Function} callback - Takes an error and a stream argument.
     */
    async getReadStream(group) {
        let key = this._keychain.getGroupKey(group)

        let feedsByPeers = await this._feedsManager.getFeedsByPeersForGroup(group)
        return new FeedMerger(this._potasium, key, feedsByPeers)
        
    }

    /** Private API **/
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
            timeout: false, // TODO: ?
            keyPair: this._protocolKeyPair,
            onhandshake: () => {
                // Drop connection if it is already established
                let connectionIsDropped = details.deduplicate(stream.publicKey, stream.remotePublicKey)
                console.log("onhandshake,", connectionIsDropped)
                if (connectionIsDropped) return
            },
            ondiscoverykey: (discoveryKey) => {
                console.log("ondiscoverykey")
                let peer = this._peerPersistence.getPeerForDiscoveryKey(discoveryKey)

                if (peer) {
                    // If we have this topic among our known peers, we replicate it.
                    this._replicate(peer, stream)

                    // If the peer has sent a capability for  their key, we know that they
                    // are the owner.                    
                    if (stream.remoteVerified(peer.pubKey)) {
                        const count = this._onlineIndicator.increment(peer)

                        // TODO: Make this prettier
                        if (count === 1) {
                            const invites = this._pendingInvites.getPendingInvites(peer)
                            for (let invite of invites) {
                                ext.send({
                                    type: HYPERCHAT_PROTOCOL_INVITE,
                                    data: invite
                                })
                            }
                        }

                    }
                }
            },
            onchannelclose: (discoveryKey, _) => {
                let peer = this._peerPersistence.getPeerForDiscoveryKey(discoveryKey)

                if (peer) {
                    this._onlineIndicator.decrement(peer)
                }
            }
        })

        const ext = stream.registerExtension(HYPERCHAT_EXTENSION, {
            encoding: 'json',
            onmessage: (message) => {

                switch (message.type) {
                    case HYPERCHAT_PROTOCOL_INVITE:
                        // TODO: Verify that invite contains a verified peer

                        const peers = message.data.peers.map(p => new Peer(p))
                        const group = new Group(peers)
                        const key = Buffer.from(message.data.key, "hex")
                        this._keychain.saveGroupKey(key, group)

                        this.emit(Events.INVITE, group)

                        break

                    default:
                        throw new Error("Unsupported protocol message")
                }
            }
        })

        this._replicate(this.me, stream)
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

    _print() {
        console.log('------------------------')
        console.log('> status [hex notation]:')
        console.log('> feedkey =', this.me.id)
        console.log('> disckey =', this.me.feedDiscoveryKey.toString('hex').substring(0, 10) + "...")
        console.log('------------------------')
    }

}

module.exports = { Hyperchat, Events }