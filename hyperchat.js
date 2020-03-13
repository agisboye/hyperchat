const { EventEmitter } = require('events')
const Protocol = require('hypercore-protocol')
const pump = require('pump')
const hypercore = require('hypercore')
const hyperswarm = require('hyperswarm')
const Identity = require('./identity')
const Potasium = require('./potasium')
const FeedManager = require('./feedManager')
const FeedMerger = require('./feedMerger')

const HYPERCHAT_PROTOCOL_INVITE = "invite"

class Hyperchat extends EventEmitter {

    constructor(name) {
        super()
        this._name = name
        this._path = './feeds/' + name + '/'
        this._swarm = hyperswarm()
        this._feed = hypercore(this._path + "own", { valueEncoding: 'json' })

        // TODO: Persist pending invites somewhere?
        // TODO: When someone starts replicating with us, remove them from the list of pending invites. Replicating with someone is how an invite is accepted.
        this._pendingInvites = new Set()

        // Streams from peers that have sent an invite which has not yet been accepted/rejected.
        // Keyed by peerID.
        this._inviteStreams = {}
    }

    /** Public API **/
    start() {
        this._feed.ready(() => {
            this._identity = new Identity(this._name, this._feed.key)
            this._potasitum = new Potasium(this._identity.keypair(), this._identity.me(), this._feed)
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
        let peerFeedKey = this._identity.addPeer(peerID, true)

        let peerDiscoveryKey = this._identity.getDicoveryKeyFromPublicKey(peerFeedKey)
        this._swarm.join(peerDiscoveryKey, { lookup: true, announce: false })
        this._pendingInvites.add(peerDiscoveryKey)
    }

    acceptInvite(peerID) {
        this._setupReadstreamForPeerIDIfNeeded(peerID)
        this._identity.addPeer(peerID, false)

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
        this._swarm.join(this._feed.discoveryKey, { lookup: false, announce: true })
    }

    _joinPeers() {
        for (let peer of this._identity.peers()) {
            console.log(`Joining peer topic: ${peer.toString('hex').substring(0, 10) + "..."}`)
            let discoveryKey = this._identity.getDiscoveryKeyFromPeerID(peer)
            this._swarm.join(discoveryKey, { lookup: true, announce: false })
        }
    }

    _setupReadStreams() {
        for (let peer of this._identity.peers()) {
            this._setupReadStreamFor(peer)
        }
    }

    _onConnection(socket, details) {
        console.log("Connection received.")

        const stream = new Protocol(details.client, {
            timeout: false,
            ondiscoverykey: (topic) => {
                // If we have this topic among our known peers, we replicate it.
                if (this._identity.knows(topic)) {
                    let peerID = this._identity.getFirstPeerIDMatchingTopic(topic)
                    this._replicate(peerID, stream)
                }
            }
        })

        const ext = stream.registerExtension('hyperchat', {
            encoding: 'json',
            onmessage: (message) => {
                console.log("Protocol message received")

                switch (message.type) {
                    case HYPERCHAT_PROTOCOL_INVITE:
                        let challenge = message.data.challenge
                        let peerId = this._potasitum.answerChallenge(challenge)
                        if (peerId) {
                            console.log('challenge answer succeeded')
                            this._inviteStreams[peerId] = stream
                            this.emit('invite', peerId)
                        } else {
                            console.log('challenge answer failed')
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
            .map(t => this._identity.getFirstPeerIDMatchingTopic(t))
            .map(peerID => this._potasitum.generateChallenge(peerID))
            .forEach(challenge => {
                ext.send({
                    type: HYPERCHAT_PROTOCOL_INVITE,
                    data: {
                        challenge: challenge
                    }
                })
            })

        this._replicate(this._identity.me(), stream)
        pump(stream, socket, stream)
    }

    _replicate(peerID, stream) {
        this._feedsManager.getFeed(peerID, feed => {
            feed.replicate(stream, { live: true })
        })
    }

    _setupReadstreamForPeerIDIfNeeded(peerID) {
        if (this._identity.knowsPeer(peerID)) return
        this._setupReadStreamFor(peerID)
    }

    async _setupReadStreamFor(otherPeerID) {
        console.log("Setting up readstream for", otherPeerID.toString('hex').substring(0, 5))
        let otherFeedPublicKey = this._identity.getFeedPublicKeyFromPeerID(otherPeerID)

        this._feedsManager.getFeed(otherFeedPublicKey, async otherFeed => {
            let merged = new FeedMerger(this._potasitum, otherPeerID, otherFeed, this._feed)

            for (var i = 0; i < merged.length; i++) {
                let res = await merged.getPrev()
                if (res === null) break
                this.emit('decryptedMessage', otherPeerID, res)
            }

            merged.on('data', data => {
                this.emit('decryptedMessage', otherPeerID, data)
            })
        })
    }

    _print() {
        console.log('------------------------')
        console.log('> status [hex notation]:')
        console.log("> Peer ID:", this._identity.me().toString('hex'))
        console.log('> feedkey =', this._feed.key.toString('hex').substring(0, 10) + "...")
        console.log('> disckey =', this._feed.discoveryKey.toString('hex').substring(0, 10) + "...")
        console.log('> public  =', this._identity._keypair.pk.toString('hex').substring(0, 10) + "...")
        console.log('> secret  =', this._identity._keypair.sk.toString('hex').substring(0, 10) + "...")
        console.log('------------------------')
    }
}

module.exports = Hyperchat