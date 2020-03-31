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

const HYPERCHAT_EXTENSION = "hyperchat"
const HYPERCHAT_PROTOCOL_INVITE = "invite"

class Hyperchat extends EventEmitter {

    constructor(name) {
        super()
        this._name = name
        this._path = './feeds/' + name + '/'
        this._swarm = hyperswarm()
        this._feed = hypercore(this._path + "own", { valueEncoding: 'json' })
        this._peerPersistence = new PeerPersistence(this._name)
        this._keychain = new KeyChain(this._name)

        // TODO: When someone starts replicating with us, remove them from the list of pending invites. 
        // Replicating with someone is how an invite is accepted.
        this._pendingInvites = new Set()

        // Streams from peers that have sent an invite which has not yet been accepted/rejected.
        // Keyed by peerID.
        this._inviteStreams = {}

        // Determines whether this client will send an online proof to other clients that it connects to.
        this.sendIdentityProofs = true

        this._onlineIndicator = new OnlineIndicator(peer => {
            console.log(peer.substring(0, 10) + "... is online")
        }, peer => {
            console.log(peer.substring(0, 10) + "... is offline")
        })
        this._protocolKeyPair = Protocol.keyPair()
    }

    /** Public API **/
    start() {
        this._feed.ready(() => {
            this._potasitum = new Potasium(this._keychain.masterKeys, this._feed)
            this._feedsManager = new FeedManager(this._path, this._feed)
            this._print()
            this._announceSelf()
            this._joinPeers()
            this._setupReadStreams()
            this._swarm.on('connection', (socket, details) => this._onConnection(socket, details))
            this.emit('ready')
        })
    }

    stop() {
        // TODO:
        // this._swarm.leave()
    }

    invite(peerID) {
        this._setupReadstreamForPeerIDIfNeeded(peerID)
        let peerFeedKey = this._peerPersistence.addPeer(peerID, true)

        let peerDiscoveryKey = this._peerPersistence.getDicoveryKeyFromPublicKey(peerFeedKey)
        console.log("inviting", this._peerIDToString(peerDiscoveryKey))
        this._swarm.join(peerDiscoveryKey, { lookup: true, announce: true })
        this._pendingInvites.add(peerDiscoveryKey)
    }

    acceptInvite(peerID) {
        this._setupReadstreamForPeerIDIfNeeded(peerID)
        this._peerPersistence.addPeer(peerID, false)

        let stream = this._inviteStreams[peerID]
        if (stream) {
            delete this._inviteStreams[peerID]
            this._replicate(peerID, stream)
        }
    }

    sendMessageTo(peerID, content) {
        //TODO: handle otherSeq in a smart way
        this._feedsManager.getFeedLengthOf(peerID, length => {
            this._potasitum.createEncryptedMessage(content, peerID, length, message => {
                this._feed.append(message, err => {
                    if (err) throw err
                })
            })
        })
    }

    /** Private API **/
    _announceSelf() {
        console.log("Announcing self:", this._peerIDToString(this._feed.discoveryKey))
        this._swarm.join(this._feed.discoveryKey, { lookup: true, announce: true })
    }

    _joinPeers() {
        for (let peer of this._peerPersistence.peers()) {
            console.log(`Joining peer topic: ${this._peerIDToString(peer)}`)
            let discoveryKey = this._peerPersistence.getDiscoveryKeyFromPeerID(peer)
            this._swarm.join(discoveryKey, { lookup: true, announce: true })
        }
    }

    _setupReadStreams() {
        for (let peer of this._peerPersistence.peers()) {
            this._setupReadStreamFor(peer)
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
                        let answer = this._potasitum.answerChallenge2(challenge)
                        if (answer) {
                            console.log("Protocol message received. Challenge answered")
                            this._keychain.saveKeyForPeerIDs(answer.key, answer.peerIDs)

                            // Sender of challenge is always at head. Tail is other people in group.
                            let peerID = answer.peerIDs[0]
                            this._inviteStreams[peerID] = stream
                            this.emit('invite', peerID)
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
        details.topics
            .filter(t => this._pendingInvites.has(t))
            .map(t => this._peerPersistence.getFirstPeerIDMatchingTopic(t))
            .map(peerID => {
                let key = this._keychain.getKeyForPeerIDs([peerID])
                return this._potasitum.generateChallenge2(key, peerID, [])
            })
            .forEach(challenge => {
                ext.send({
                    type: HYPERCHAT_PROTOCOL_INVITE,
                    data: {
                        challenge: challenge.toString('hex')
                    }
                })
            })

        this._replicate(this._potasitum.ownPeerID, stream)
        pump(stream, socket, stream)
    }

    _replicate(peerID, stream) {
        this._feedsManager.getFeed(peerID, feed => {
            feed.replicate(stream, { live: true })
        })
    }

    _setupReadstreamForPeerIDIfNeeded(peerID) {
        if (this._peerPersistence.knowsPeer(peerID)) return
        this._setupReadStreamFor(peerID)
    }

    async _setupReadStreamFor(otherPeerID) {
        console.log("Setting up readstream for", this._peerIDToString(otherPeerID))
        let otherFeedPublicKey = this._peerPersistence.getFeedPublicKeyFromPeerID(otherPeerID)

        this._feedsManager.getFeed(otherFeedPublicKey, async otherFeed => {
            let merged = new FeedMerger(this._potasitum, otherPeerID, otherFeed, this._feed)

            for (let i = 0; i < merged.length; i++) {
                let res = await merged.getPrevAsync()
                if (res) {
                    this.emit('decryptedMessage', otherPeerID, res)
                } else {
                    break
                }
            }

            merged.on('data', message => {
                this.emit('decryptedMessage', otherPeerID, message)
            })
        })

    }

    _print() {
        console.log('------------------------')
        console.log('> status [hex notation]:')
        console.log("> Peer ID:", this._potasitum.ownPeerID.toString('hex'))
        console.log('> feedkey =', this._feed.key.toString('hex').substring(0, 10) + "...")
        console.log('> disckey =', this._feed.discoveryKey.toString('hex').substring(0, 10) + "...")
        console.log('> public  =', this._keychain.masterKeys.pk.toString('hex').substring(0, 10) + "...")
        console.log('> secret  =', this._keychain.masterKeys.sk.toString('hex').substring(0, 10) + "...")
        console.log('------------------------')
    }

    _peerIDToString(peerID) {
        return peerID.toString('hex').substring(0, 10) + "..."
    }
}

module.exports = Hyperchat