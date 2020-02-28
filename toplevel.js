const { EventEmitter } = require('events')
const Protocol = require('hypercore-protocol')
const pump = require('pump')
// const jsonStream = require('duplex-json-stream')
const hypercore = require('hypercore')
const hyperswarm = require('hyperswarm')
// const noisepeer = require('noise-peer')
const uuid = require('uuid')
const Contacts = require('./contacts')

function generateSymKey() {
    //TODO: Should instead be generated based on some symmetric crypto (sodium-native)
    return uuid()
}

function generateChatID() {
    return uuid()
}

/** Events
 * ready
 * invite
 * message
 */

 /** Invite flow
  * - waitingForConnection
  * - invite sent
  */

class TopLevel extends EventEmitter {

    constructor(name) {
        super()
        this._name = name
        this._contacts = new Contacts(name)
        this._swarm = hyperswarm()
        this._feedPath = './feeds/' + name + '/'
        this._feed = hypercore(this._feedPath + 'own', { valueEncoding: 'json' })

        // TODO: Generate DH keypair

        this._pendingInvites = new Set()
        this._sentInviteRequests = {}
    }

    /** Public API **/

    myKey() {
        // TODO: Return concatenation of my key + recipient key
    }

    start() {
        this._feed.ready(() => {
            this._announceSelf()
            this._swarm.on('connection', (s, d) => this._onConnection(s, d))
            this.emit('ready')
        })
    }

    //TODO: Add timeout error to callback. Card: https://github.com/agisboye/hyperchat-poc/projects/1#card-33617552
    invite(otherPublicKey, cb) {
        let otherPublicKeyBuffer = Buffer.from(otherPublicKey, 'hex')
        // TODO: Return if we are already inviting this identity

        console.log('Inviting ' + otherPublicKey)

        this._pendingInvites.add(otherPublicKeyBuffer)
        this._swarm.join(otherPublicKeyBuffer, { lookup: true, announce: false })
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

        const p = new Protocol(details.client, {
            onauthenticate(remotePublicKey, done) {
                console.log('remote person is', remotePublicKey)
                
                if (this._pendingInvites.has(details.topics[0])) {
                    if (this._pendingInvites.has(remotePublicKey)) {
                        // found the peer from pending invite
                        done()
                    } else {
                        // We are trying to invite someone but someone else is responding.
                        done(new Error("Respond to invite by unrelated peer"))
                    }
                } else {
                    // Other cases: message replication, invite from someone
                    done()
                }
                
            },
            onhandshake() {
                
                if (this._pendingInvites.has(p.remotePublicKey)) {
                    console.log("Handshake completed with peer that we want to invite")
                    // Invite this peer
                    let sharedSymKey = generateSymKey()
                    let chatID = generateChatID()

                    ext.send({
                        type: "invite",
                        data: {
                            senderPublicKey: this._feed.key.toString('hex'),
                            sharedSymKey: sharedSymKey,
                            chatID: chatID
                        }
                    })

                    this._sentInviteRequests[message.data.senderPublicKey] = {
                        chatID, sharedSymKey
                    }

                    // feed.replicate(p, { live: true })

                } else {
                    // This peer is inviting us or trying to replicate
                    console.log("Handshake completed with other peer")
                }
            }
        })

        const ext = p.registerExtension('hyperchat', {
            encoding: 'json',
            onmessage(message) {
                console.log("Message received: ")
                console.log(message)
                let chatID

                switch (message.type) {
                    case 'invite':
                        chatID = generateChatID()
                        let inviteResponse = {
                            type: 'inviteResponse',
                            senderPublicKey: this._feed.key.toString('hex'),
                            chatID: chatID
                        }
                        ext.send(inviteResponse)
                        this._contacts.persist(message.data.senderPublicKey, chatID, message.data.chatID, message.data.sharedSymKey)
                        this._initReplicaFor(message.data.senderPublicKey)

                        break;
                        
                    case 'inviteResponse':
                        // TODO: Check if we are expecting this invite response
                        // TODO: Look up chatID and sharedSymKey
                        let req = this._sentInviteRequests[message.data.senderPublicKey]
                        chatID = req.chatID
                        let sharedSymKey = req.sharedSymKey
                            
                        this._contacts.persist(message.data.senderPublicKey, message.data.chatID, chatID, sharedSymKey)
                        this._initReplicaFor(message.data.senderPublicKey)

                        delete this._sentInviteRequests[message.data.senderPublicKey]
                        
                        break;

                    default:
                        throw new Error("Unsupported protocol message")
                }
            }
        })
        
        this._feed.replicate(p, { live: true })
        pump(p, socket, p)

    }

    _initReplicaFor(otherPublicKey) {
        let otherPublicKeyBuffer = Buffer.from(otherPublicKey, 'hex')
        let otherFeed = hypercore(this._feedPath + otherPublicKey, otherPublicKeyBuffer, { valueEncoding: 'json' })

        // this._replicas.push(otherFeed)
    }

}


module.exports = TopLevel