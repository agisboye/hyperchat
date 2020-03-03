const { EventEmitter } = require('events')
const Protocol = require('hypercore-protocol')
const pump = require('pump')
const hypercore = require('hypercore')
const hyperswarm = require('hyperswarm')
const Identity = require('./identity')

const HYPERCHAT_PROTOCOL_INVITE = "invite"

class Hyperchat extends EventEmitter {

    constructor(name) {
        super()
        this._name = name
        this._path = './feeds/' + name + '/'
        this._swarm = hyperswarm()
        this._feed = hypercore(this._path + "own", { valueEncoding: 'json' })
        this._feeds = {}

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
            this._identity = new Identity(this._name, this._feed.discoveryKey)
            console.log(`Peer ID: ${this._identity.me()}`)
            this._announceSelf()
            this._swarm.on('connection', (socket, details) => this._onConnection(socket, details))
            this.emit('ready')
        })
    }

    invite(peerId) {
        let peerFeedKey = this._identity.addPeer(peerId, true)
        this._swarm.join(Buffer.from(peerFeedKey, 'hex'), { lookup: true, announce: false })
        this._pendingInvites.add(peerFeedKey)
    }

    acceptInvite(peerId) {
        console.log('accepting invite')
        let peerFeedKey = this._identity.addPeer(peerId, false)
        
        let stream = this._inviteStreams[peerId]
        
        if (stream) {
            delete this._inviteStreams[peerId]
            this._replicate(peerFeedKey, stream)
        }
    }

    sendMessageTo(name, message) {

    }

    join() {

    }

    leave() {

    }

    getAllMessagesFrom(name, index) {
        return []
    }

    /** Private API **/
    _announceSelf() {
        console.log("Announcing self")
        this._swarm.join(this._feed.discoveryKey, { lookup: false, announce: true })
    }

    _onConnection(socket, details) {
        console.log("Connection received. #topics =", details.topics.length)

        const stream = new Protocol(details.client, {
            timeout: false
        })

        const ext = stream.registerExtension('hyperchat', {
            encoding: 'json',
            onmessage: (message) => {
                console.log("Protocol message received")

                switch (message.type) {
                    case HYPERCHAT_PROTOCOL_INVITE:
                        let challenge = message.data.challenge
                        let peerId = this._identity.answerChallenge(challenge)
                        if (peerId) {
                            console.log('challenge answer succeeded')
                            this.emit('invite', peerId)
                            this._inviteStreams[peerId] = stream
                        } else {
                            console.log('challenge answer failed')
                        }

                        break

                    default:
                        throw new Error("Unsupported protocol message")
                }
            }
        })

        for (let topic of details.topics) {
            // Send a challenge to the connecting peer
            // if we are trying to invite on this topic.
            if (this._pendingInvites.has(topic.toString('hex'))) {
                let challenge = this._identity.generateChallenge(topic)

                console.log('sending protocol invite...')
                ext.send({
                    type: HYPERCHAT_PROTOCOL_INVITE,
                    data: {
                        challenge: challenge
                    }
                })
            }

            if (this._identity.knows(topic)) {
                // If we have this topic among our known peers, we replicate it.
                this._replicate(topic, stream)

            } else if (topic === this._feed.discoveryKey) {
                // If the topic is our own feed, we also replicate it.
                this_.feed.replicate(stream, { live: true })

            }
        }

        pump(stream, socket, stream)
    }

    _replicate(discoveryKey, stream) {
        let feed = this._getFeed(discoveryKey)
        feed.replicate(stream, { live: true })
    }

    _getFeed(discoveryKey) {
        let feed = this._feeds[discoveryKey]

        if (feed) return feed

        let discoveryKeyBuffer = Buffer.from(discoveryKey, 'hex')
        feed = hypercore(this._path + `${discoveryKey}`, discoveryKeyBuffer, { valueEncoding: 'json' })
        this._feeds[discoveryKey] = feed

        return feed
    }

}

module.exports = Hyperchat