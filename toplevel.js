const { EventEmitter } = require('events')
const Protocol = require('hypercore-protocol')
const pump = require('pump')
const hypercore = require('hypercore')
const hyperswarm = require('hyperswarm')


const HYPERCHAT_PROTOCOL_INVITE = "invite"

/** Events
 * ready
 * invite
 * message
 */

/** Invite stages
     * 1. Waiting: (replica feed generated, keypair generated, swarm joined)
     * 2. Done/Invite completed. The peer has started replicating our feed.
     */

class Hyperchat extends EventEmitter {

    constructor() {
        super()
        this._swarm = hyperswarm()
        this._feed = hypercore(`./feeds/own`, { valueEncoding: 'json' })
        this._feeds = {}

        // TODO: Persist pending invites somewhere
        // TODO: When someone starts replicating with us, remove them from the list of pending invites. Replicating with someone is how an invite is accepted.
        this._pendingInvites = new Set()
    }

    /** Public API **/
    start() {
        this._feed.ready(() => {
            this._announceSelf()
            this._swarm.on('connection', (s, d) => this._onConnection(s, d))
            this.emit('ready')
        })
    }

    invite(peerId) {
        console.log('Inviting ' + peerId)

        let { peerFeedKey, _ } = CryptoModule.addPeer(peerId)

        // TODO: Do we even need to create the feed here? It will be created when _getFeed is called, and
        // it is called when sending a message.
        // let _ = this_._getFeed(discoveryKey)
        // let peerFeedKeyBuffer = Buffer.from(peerFeedKey, 'hex')
        // hypercore('./feeds/' + peerFeedKey, peerFeedKeyBuffer, { valueEncoding: 'json' })

        this._pendingInvites.add(peerFeedKey)
        this._swarm.join(peerFeedKey, { lookup: true, announce: false })
    }

    acceptInvite(peerId) {
        let { peerFeedKey, _ } = CryptoModule.addPeer(peerId)
        
        // Create replica feed
        // TODO: User feed manager
        let peerFeedKeyBuffer = Buffer.from(peerFeedKey, 'hex')
        hypercore('./feeds/' + peerFeedKey, peerFeedKeyBuffer, { valueEncoding: 'json' })
    }

    sendMessageTo(name, message) {

    }

    join() {

    }

    leave() {

    }

    getAllMessagesFrom(name, index) {
        return null
    }

    /** Private API **/
    _announceSelf() {
        console.log("Announcing self")
        this._swarm.join(this._feed.key, { lookup: false, announce: true })
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
                        let peerId = CryptoModule.answerChallenge(challenge)
                        if (peerId) {
                            this._acceptInvite(peerId)
                            let peerFeedKey = CryptoModule.feedKey(peerId)
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
                let challenge = CryptoModule.generateChallenge(topic)

                ext.send({
                    type: HYPERCHAT_PROTOCOL_INVITE,
                    data: challenge
                })
            }

            // If we have this topic among our known peers, we replicate it.
            if (CryptoModule.knows(topic)) {
                this._replicate(topic, socket, stream)
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
        let feed = hypercore(`./feeds/${discoveryKey}`, discoveryKeyBuffer, { valueEncoding: 'json' })
        this_.feeds[discoveryKey] = feed
        
        return feed
    }

}

module.exports = Hyperchat