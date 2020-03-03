const { EventEmitter } = require('events')
const Protocol = require('hypercore-protocol')
const pump = require('pump')
const hypercore = require('hypercore')
const hyperswarm = require('hyperswarm')
const Identity = require('./identity')

const HYPERCHAT_PROTOCOL_INVITE = "invite"

class Hyperchat extends EventEmitter {

    constructor() {
        super()
        this._swarm = hyperswarm()
        this._feed = hypercore(`./feeds/own`, { valueEncoding: 'json' })
        this._feeds = {}

        // TODO: Persist pending invites somewhere?
        // TODO: When someone starts replicating with us, remove them from the list of pending invites. Replicating with someone is how an invite is accepted.
        this._pendingInvites = new Set()
    }

    /** Public API **/
    start() {
        this._feed.ready(() => {
            this._identity = new Identity(this._feed.discoveryKey)
            console.log(`Peer ID: ${this._identity.me().toString("hex")}`)
            this._announceSelf()
            this._swarm.on('connection', (socket, details) => this._onConnection(socket, details))
            this.emit('ready')
        })
    }

    invite(peerId) {
        console.log('Inviting ' + peerId)

        let peerFeedKey = this._identity.addPeer(peerId, true)

        this._pendingInvites.add(peerFeedKey)
        this._swarm.join(peerFeedKey, { lookup: true, announce: false })
    }

    acceptInvite(peerId) {
        let peerFeedKey = this._identity.addPeer(peerId, false)
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
        console.log("Connection received")

        const stream = new Protocol(details.client, {
            // onauthenticate(remotePublicKey, done) {
            //     console.log('remote person is', remotePublicKey)
            //     // TODO: remotePublicKey is not the same as the remote's discovery key
            //     done()
            // },
            // onhandshake() {}
            timeout: false
        })

        const ext = stream.registerExtension('hyperchat', {
            encoding: 'json',
            onmessage(message) {
                console.log("Protocol message received: ")
                console.log(message)

                switch (message.type) {
                    case HYPERCHAT_PROTOCOL_INVITE:
                        // Attempt to decrypt the challenge. If decryption succeeds, we have the peerID of the peer that is sending us an invite.
                        let challenge = message.data.challenge
                        let peerId = this._identity.answerChallenge(challenge)
                        if (peerId) {
                            this._acceptInvite(peerId)
                            let peerFeedKey = this._identity.feedKey(peerId)
                            this._replicate(peerFeedKey, socket, stream)
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
            if (this._pendingInvites.has(topic)) {
                let challenge = this._identity.generateChallenge(topic)

                ext.send({
                    type: HYPERCHAT_PROTOCOL_INVITE,
                    data: challenge
                })
            }

            if (this._identity.knows(topic)) {
                // If we have this topic among our known peers, we replicate it.
                this._replicate(topic, socket, stream)

            } else if (topic === this._feed.discoveryKey) {
                // If the topic is our own feed, we also replicate it.
                this_.feed.replicate(stream, { live: true })
                pump(stream, socket, stream)

            }
        }

    }

    _replicate(discoveryKey, socket, stream) {
        let feed = this_._getFeed(discoveryKey)
        feed.replicate(stream, { live: true })
        pump(stream, socket, stream)
    }

    _getFeed(discoveryKey) {
        let feed = this_.feeds[discoveryKey]

        if (feed) return feed

        let discoveryKeyBuffer = Buffer.from(topic, 'hex')
        feed = hypercore(`./feeds/${discoveryKey}`, discoveryKeyBuffer, { valueEncoding: 'json' })
        this_.feeds[discoveryKey] = feed

        return feed
    }

}

module.exports = Hyperchat