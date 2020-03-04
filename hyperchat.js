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
            this._identity = new Identity(this._name, this._feed.key)
            console.log(`Peer ID: ${this._identity.me()}`)
            this._announceSelf()
            this._swarm.on('connection', (socket, details) => this._onConnection(socket, details))
            this.emit('ready')
        })
    }

    invite(peerId) {
        let peerFeedKey = this._identity.addPeer(peerId, true)

        let peerDiscoveryKey = this._identity.dicoveryKeyFromPublicKey(peerFeedKey)
        this._swarm.join(Buffer.from(peerDiscoveryKey, 'hex'), { lookup: true, announce: false })
        this._pendingInvites.add(peerDiscoveryKey)
    }

    acceptInvite(peerId) {
        console.log('accepting invite')
        let peerFeedKey = this._identity.addPeer(peerId, false)

        let stream = this._inviteStreams[peerId]

        if (stream) {
            delete this._inviteStreams[peerId]
            this._replicate(peerFeedKey, stream)
        }

        let testFeed = this._getFeed(peerFeedKey)
        testFeed.ready(() => {
            testFeed.get(0, (err, data) => {
                console.log(data)
            })
        })
    }

    sendMessageTo(peerID, content) {
        // encrypt message and append to your own feed
        let ciphertext = this._identity.encryptMessage(content, peerID)
        let chatID = this._identity.makeChatIDClient(peerID).toString('hex')
        let message = {
            type: 'message',
            data: {
                chatID: chatID,
                ciphertext: ciphertext
            }
        }

        console.log("sending message on feed:", this._feed.key.toString('hex'))
        this._feed.append(message, err => {
            if (err) throw err
        })
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
        console.log("Connection received.")

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

            if (this._identity.knows(topic.toString('hex'))) {
                // If we have this topic among our known peers, we replicate it.
                this._replicate(topic.toString('hex'), stream)

            } else if (topic.equals(this._feed.key)) {
                // If the topic is our own feed, we also replicate it.
                console.log('replicating self')
                this._replicate(this._feed.key, stream)

            }
        }

        this._replicate(this._feed.key.toString('hex'), stream)
        pump(stream, socket, stream)
    }

    _replicate(key, stream) {
        console.log('replicating', key.toString('hex'))
        let feed = this._getFeed(key)
        feed.replicate(stream, { live: true })

        //NOTE: For debugging purposes
        let readStream = feed.createReadStream({ live: true })
        readStream.on('data', message => {
            console.log('data!!')
            let content = message.data
            let plaintext = this._identity.decryptMessage(content, feed.discoveryKey)

            console.log(plaintext)
        })
    }

    _getFeed(key) {
        // if (key.equals(this._feed.key)) {
        if (key === this._feed.key.toString('hex')) {
            return this._feed
        }

        let feed = this._feeds[key]

        if (feed) return feed

        feed = hypercore(this._path + `${key.toString('hex')}`, key, { valueEncoding: 'json' })
        this._feeds[key] = feed

        return feed
    }
}

module.exports = Hyperchat