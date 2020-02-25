const { EventEmitter } = require('events')
const jsonStream = require('duplex-json-stream')
const hypercore = require('hypercore')
const hyperswarm = require('hyperswarm')
const noisepeer = require('noise-peer')
const uuid = require('uuid')
const Contacts = require('./contacts')
const crypto = require('./crypto')

function generateChatID() {
    return uuid()
}

class TopLevel extends EventEmitter {

    constructor(name) {
        super()
        this._name = name
        this._contacts = new Contacts(name)
        this._swarm = hyperswarm()
        this._feed = hypercore('./feeds/' + name, { valueEncoding: 'json' })
    }

    start() {
        this._feed.ready(() => {
            // Is used so that other party knows how under what public key to discover you. 
            console.log('pk=', this._feed.key.toString('hex'))
            // Announce yourself under your own public key
            this._swarm.join(this._feed.key, { lookup: false, announce: true })
            this._swarm.on('connection', (socket, details) => {
                if (!details.client) {
                    // make a secure json socket using the Noise Protocol. This side is not inititator
                    let secureSocket = jsonStream(noisepeer(socket, false))
                    secureSocket.on('data', message => { this._handleMessageAtStartAsServer(message, this._feed, secureSocket) })
                }
            })
            this.emit('ready')
        })
    }

    //TODO: Add timeout error to callback. Card: https://github.com/agisboye/hyperchat-poc/projects/1#card-33617552
    invite(otherPublicKey, cb) {
        let otherPublicKeyBuffer = Buffer.from(otherPublicKey, 'hex')
        this._swarm.join(otherPublicKeyBuffer, { lookup: true, announce: false })
        this._swarm.on('connection', (socket, details) => {
            // make a secure json socket using the Noise Protocol. This side is initiator
            let secureSocket = jsonStream(noisepeer(socket, true))

            //TODO: Should message be signed by sender to prove authentication (sodium-native)? Maybe sign using own feed private key?
            let sharedSymKey = crypto.generateSymKey()
            let chatID = generateChatID()
            let inviteMessage = {
                type: 'inviteRequest',
                senderPublicKey: this._feed.key.toString('hex'),
                sharedSymKey: sharedSymKey,
                chatID: chatID
            }
            secureSocket.write(inviteMessage)

            secureSocket.on('data', message => {
                if (message.type === 'inviteResponse') {
                    // persist the new contact info 
                    this._contacts.persist(message.senderPublicKey, message.chatID, chatID, sharedSymKey)
                    // Callback with no error
                    cb(null)
                }
            })
        })
    }

    _handleMessageAtStartAsServer(message, feed, secureSocket) {
        if (message.type === 'inviteRequest') {
            //TODO: If message should be signed by sender and checked here. (sodium-native). Maybe signed with senders feed private key?
            // Card: https://github.com/agisboye/hyperchat-poc/projects/1#card-33617786
            let chatID = generateChatID()
            let inviteResponse = {
                type: 'inviteResponse',
                senderPublicKey: feed.key.toString('hex'),
                chatID: chatID
            }

            secureSocket.write(inviteResponse)
            this._contacts.persist(message.senderPublicKey, message.chatID, chatID, message.sharedSymKey)
        }
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
}


module.exports = TopLevel