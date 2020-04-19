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
const KeyChain = require('./keychain')
const PendingInvites = require('./pendingInvites')

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
        this._name = name
        this._path = './feeds/' + name + '/'
        this._swarm = hyperswarm()
        this._feed = hypercore(this._path + "own", { valueEncoding: 'json' })

        // TODO: When someone starts replicating with us, remove them from the list of pending invites? 
        // Replicating with someone is how an invite is accepted.
        this._peerPersistence = new PeerPersistence(this._name)
        this._pendingInvites = new PendingInvites()
        this._keychain = new KeyChain(this._name)

        // Streams from peers that have sent an invite which has not yet been accepted/rejected.
        // Keyed by peerID.
        this._inviteStreams = {}

        // Determines whether this client will send an online proof to other clients that it connects to.
        this.sendIdentityProofs = true

        this._onlineIndicator = new OnlineIndicator(peer => {
            console.log(this._ellipticizeBuffer(peer) + "... is online")
            this.emit(Events.PEERS_CHANGED, this.peers())
        }, peer => {
            console.log(this._ellipticizeBuffer(peer) + "... is offline")
            this.emit(Events.PEERS_CHANGED, this.peers())
        })
        this._protocolKeyPair = Protocol.keyPair()
    }

    /** Public API **/
    start() {
        this._feed.ready(() => {
            this._potasium = new Potasium(this._feed, this._keychain.masterKeys)
            this._keychain.setOwnPeerID(this._potasium.ownPeerID)
            this._feedsManager = new FeedManager(this._path, this._feed)
            this._print()
            this._announceSelf()
            this._joinGroups()
            this._setupReadStreams()
            this._swarm.on('connection', (socket, details) => this._onConnection(socket, details))
            this.emit(Events.READY)
        })
    }

    /**
     * Returns the users peer ID.
     */
    me() {
        return this._potasium.ownPeerID
    }

    /**
     * Returns an array of known peers as well as their current online status
     */
    peers() {
        let peers = Object.keys(this._peerPersistence._peers)
        return peers.map(id => {
            return {
                id: id,
                isOnline: this._onlineIndicator.isOnline(id)
            }
        })
    }

    invite(group) {
        group.push(this._potasium.ownPeerID)
        this._setupReadstreamForGroupIfNeeded(group)
        this._peerPersistence.addGroup(group)
        console.log("inviting", this._groupToString(group))
        this._joinGroup(group)
        
        let discoveryKeys = group.map(peer => this._peerPersistence.getDiscoveryKeyFromPeerID(peer))
        
        this._pendingInvites.addPendingInvite({ discKeys: discoveryKeys, peerIDs: group })
        
        this.emit(Events.PEERS_CHANGED, this.peers())
    }

    acceptInvite(group) {
        this._setupReadstreamForGroupIfNeeded(group)
        this._peerPersistence.addGroup(group)
        this.emit(Events.PEERS_CHANGED, this.peers())

        for (let peerID of group) {
            let stream = this._inviteStreams[peerID]
            if (stream) {
                delete this._inviteStreams[peerID]
                this._replicate(peerID, stream)
            }
        }
    }

    sendMessageTo(group, content) {
        this._feedsManager.getLengthsOfFeeds(group, lenghts => {
            let key = this._keychain.getKeyForGroup(group)
            this._potasium.createEncryptedMessage(content, lenghts, key, message => {
                this._feed.append(message, err => {
                    if (err) throw err
                })
            })
        })
    }

    /**
     * Sets up a read stream that contains all messages
     * for a given chat.
     * @param {*} peerID 
     */
    getReadStream(peerID, callback) {
        let otherFeedPublicKey = this._peerPersistence.getFeedPublicKeyFromPeerID(peerID)
        let key = this._keychain.getKeyForPeerIDs([peerID])
        
        this._feedsManager.getFeed(otherFeedPublicKey, feed => {
            let merged = new FeedMerger(this._potasium, key, feed, this._feed, peerID)
            callback(null, merged)
        })
    }

    /** Private API **/
    _announceSelf() {
        console.log("Announcing self:", this._ellipticizeBuffer(this._feed.discoveryKey))
        this._swarm.join(this._feed.discoveryKey, { lookup: true, announce: true })
    }

    _joinGroups() {
        this._peerPersistence.groups().forEach(group => this._joinGroup(group))
    }

    _joinGroup(group) {
        console.log(`Joining peer topics: ${this._groupToString(group)}`)
        group.forEach(peer => {
            let peerFeedKey = this._peerPersistence.getFeedPublicKeyFromPeerID(peer)
            let peerDiscoveryKey = this._peerPersistence.getDiscoveryKeyFromFeedPublicKey(peerFeedKey)
            this._swarm.join(peerDiscoveryKey, { lookup: true, announce: true })
        })
    }

    _setupReadStreams() {
        for (let group of this._peerPersistence.groups()) {
            this._setupReadStreamFor(group)
        }
    }

    _onConnection(socket, details) {
        const stream = new Protocol(details.client, {
            timeout: false,
            keyPair: this._protocolKeyPair,
            onhandshake: () => {
                // drop connection if it is already established
                let connectionIsDropped = details.deduplicate(stream.publicKey, stream.remotePublicKey)
                console.log("onhandshake,", connectionIsDropped)
                if (connectionIsDropped) return
            },
            ondiscoverykey: (discoveryKey) => {
                let peerID = this._peerPersistence.getFirstPeerIDMatchingTopic(discoveryKey)

                if (peerID) {
                    // If we have this topic among our known peers, we replicate it.
                    this._replicate(peerID, stream)

                    // If the peer has sent a capability for  their key, we know that they
                    // are the owner.
                    let feedKey = this._peerPersistence.getFeedPublicKeyFromPeerID(peerID)
                    if (stream.remoteVerified(feedKey)) {
                        this._onlineIndicator.increment(peerID)
                    }
                }
            },
            onchannelclose: (discoveryKey, publicKey) => {
                let peerID = this._peerPersistence.getFirstPeerIDMatchingTopic(discoveryKey)

                if (peerID) {
                    this._onlineIndicator.decrement(peerID)
                }
            }
        })

        const ext = stream.registerExtension(HYPERCHAT_EXTENSION, {
            encoding: 'json',
            onmessage: (message) => {

                switch (message.type) {
                    case HYPERCHAT_PROTOCOL_INVITE:
                        let challenge = Buffer.from(message.data.challenge, 'hex')
                        let answer = this._potasium.answerChallenge(challenge)
                        if (answer) {
                            console.log("Protocol message received. Challenge answered")
                            this._keychain.saveKeyForPeerIDs(answer.key, answer.peerIDs)

                            // Sender of challenge is always at head. Tail is other people in group.
                            let peerID = answer.peerIDs[0]
                            this._inviteStreams[peerID] = stream
                            this.emit(Events.INVITE, answer.peerIDs)
                        } else {
                            console.log("Protocol message received. Challenge failed")
                        }

                        break

                    default:
                        throw new Error("Unsupported protocol message")
                }
            }
        })

        // Send a challenge to the connecting peer
        // if we are trying to invite on this topic.

        this._pendingInvites.getAllPendingInvitesMatchingTopics(details.topics)
            .map(peerIDs => {
                let key = this._keychain.getKeyForGroup(peerIDs)
                let challenges = peerIDs.map(peerID => this._potasium.generateChallenge(key, peerID, peerIDs))
                return challenges
            })
            .flat()
            .forEach(challenge => {
                ext.send({
                    type: HYPERCHAT_PROTOCOL_INVITE,
                    data: {
                        challenge: challenge.toString('hex')
                    }
                })
            })

        this._replicate(this._potasium.ownPeerID, stream)
        pump(stream, socket, stream)
    }

    _replicate(peerID, stream) {
        this._feedsManager.getFeed(peerID, feed => {
            feed.replicate(stream, { live: true })
        })
    }

    _setupReadstreamForGroupIfNeeded(group) {
        if (this._peerPersistence.knowsGroup(group)) return // The readstream is already setup
        this._setupReadStreamFor(group)
    }

    async _setupReadStreamFor(group) {
        console.log("Setting up readstream for", this._groupToString(group))

        let key = this._keychain.getKeyForGroup(group)
        this._feedsManager.getFeedsForGroup(group, async feeds => {
            let merged = new FeedMerger(this._potasium, key, feeds, group)

            for (let i = 0; i < merged.length; i++) {
                let res = await merged.getPrevAsync()
                if (res) {
                    this.emit('decryptedMessage', res)
                } else {
                    break
                }
            }

            merged.on('data', message => {
                this.emit('decryptedMessage', message)
            })
        })
    }

    _print() {
        console.log('------------------------')
        console.log('> status [hex notation]:')
        console.log("> Peer ID:", this._potasium.ownPeerID.toString('hex'))
        console.log('> feedkey =', this._ellipticizeBuffer(this._feed.key))
        console.log('> disckey =', this._ellipticizeBuffer(this._feed.discoveryKey))
        console.log('> public  =', this._ellipticizeBuffer(this._keychain.masterKeys.pk))
        console.log('> secret  =', this._ellipticizeBuffer(this._keychain.masterKeys.sk))
        console.log('------------------------')
    }

    /**
     * Takes a buffer and returns the head followed by an ellipsis.
     * @param {Buffer} buffer 
     * @param {number} length
     * @returns {string}
     */
    _ellipticizeBuffer(buffer, length = 10) {
        return buffer.toString('hex').substring(0, length) + "..."
    }

    _groupToString(group) {
        let str = "["
        group.forEach(peerID => {
            str += peerID.toString('hex').substring(0, 6) + ".. ,"
        })
        str += "]"
        return str
    }
}

module.exports = { Hyperchat, Events }