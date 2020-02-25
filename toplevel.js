const { EventEmitter } = require('events')
const jsonStream = require('duplex-json-stream')
const hypercore = require('hypercore')
const hyperswarm = require('hyperswarm')
const noisepeer = require('noise-peer')
const uuid = require('uuid')
const Contacts = require('./contacts')
const crypto = require('./crypto')
const pump = require('pump')

function generateChatID() {
    return uuid()
}

class TopLevel extends EventEmitter {

    constructor(name) {
        super()
        this._name = name
        this._contacts = new Contacts(name)
        this._swarm = hyperswarm()
        this._feedPath = './feeds/' + name + '/'
        this._feed = hypercore(this._feedPath + 'own', { valueEncoding: 'json' })
        //TODO: Add persistence to _replicas
        this._replicas = []
    }

    start() {
        this._feed.ready(() => {
            // Is used so that other party knows how under what public key to discover you. 
            console.log('> ' + this._name + " is ready. pk=", this._feed.key.toString('hex'))
            // Announce yourself under your own public key
            this._swarm.join(this._feed.key, { lookup: false, announce: true })
            this._swarm.on('connection', (socket, details) => {
                if (!details.client) {
                    // make a secure json socket using the Noise Protocol. This side is not inititator
                    let secureSocket = noisepeer(socket, false)
                    let secureJSONSocket = jsonStream(secureSocket)
                    //TODO: Refactor _handleMessageAtStartAsServer into 2 'data' handlers - one for setting up the feed replication and one for responding to the invitation + persistence
                    secureJSONSocket.on('data', message => { this._handleInvitationRequest(message, secureJSONSocket) })
                }
            })
            this.emit('ready')
        })
    }

    //TODO: Add timeout error to callback. Card: https://github.com/agisboye/hyperchat-poc/projects/1#card-33617552
    invite(otherPublicKey, cb) {
        // Check if 'otherPublicKey' has already been invited
        if (this._contacts.containsPublicKey(otherPublicKey)) {
            // cb with null-error
            cb(null)
            return
        }

        console.log('> ' + this._name + " is inviting...")

        let otherPublicKeyBuffer = Buffer.from(otherPublicKey, 'hex')
        this._swarm.join(otherPublicKeyBuffer, { lookup: true, announce: false })
        this._swarm.on('connection', (socket, details) => {
            // make a secure json socket using the Noise Protocol. This side is initiator
            let secureSocket = noisepeer(socket, true)
            let secureJSONSocket = jsonStream(secureSocket)

            //TODO: Should message be signed by sender to prove authentication (sodium-native)? Maybe sign using own feed private key?
            let sharedSymKey = crypto.generateSymKey()
            let chatID = generateChatID()
            let inviteMessage = {
                type: 'inviteRequest',
                senderPublicKey: this._feed.key.toString('hex'),
                sharedSymKey: sharedSymKey,
                chatID: chatID
            }

            console.log('> ' + this._name + " writes invite-message")
            secureJSONSocket.write(inviteMessage)

            secureJSONSocket.on('data', message => {
                if (message.type === 'inviteResponse') {
                    console.log('> ' + this._name + " received invite response")
                    // persist the new contact info and replicate
                    this._contacts.persist(message.senderPublicKey, message.chatID, chatID, sharedSymKey)
                    this._initReplicaFor(message.senderPublicKey)
                    // Callback with no error
                    cb(null)
                    return
                } 
            })
        })
    }

    _handleInvitationRequest(message, secureJSONSocket) {
        if (message.type === 'inviteRequest') {
            //TODO: If message should be signed by sender and checked here. (sodium-native). Maybe signed with senders feed private key?
            // Card: https://github.com/agisboye/hyperchat-poc/projects/1#card-33617786

            console.log('> ' + this._name + " received inviteRequest")

            let chatID = generateChatID()
            let inviteResponse = {
                type: 'inviteResponse',
                senderPublicKey: this._feed.key.toString('hex'),
                chatID: chatID
            }
            secureJSONSocket.write(inviteResponse)

            this._contacts.persist(message.senderPublicKey, message.chatID, chatID, message.sharedSymKey)
            this._initReplicaFor(message.senderPublicKey)
        }
    }

    _initReplicaFor(otherPublicKey)  {
        // Setup to replicate feed of other peer
        let otherFeedKeyBuffer = Buffer.from(otherPublicKey, 'hex')
        let otherFeed = hypercore(this._feedPath + otherPublicKey, otherFeedKeyBuffer, {valueEncoding: 'json'})

        console.log('> ' + this._name + " initReplicate for " + otherPublicKey)
        this._replicas.push(otherFeed)
    }

    sendMessageTo(otherPublicKey, message) {
        let sharedKey = this._contacts.getSymKeyForPublicKey(otherPublicKey)
        let encryptedMessage = crypto.getEncryptedMessage(message, sharedKey)
        let chatID = this._contacts.getChatIDForPublicKey(otherPublicKey)

        console.log('> ' + this._name + " appends message")
        this._feed.append({
            chatID: chatID, 
            ciphertext: encryptedMessage
        })
    }

    /// Join all peers in contact list
    joinAll() {
        this._contacts.getAllPublicKeys().forEach(this._join)
    }

    _join(pk) {
        let publicKeyBuffer = Buffer.from(pk, 'hex')
        // join other peers public key. 'announce' is true because 'this' can be relay for others
        this._swarm.join(publicKeyBuffer, {lookup: true, announce: true})
        this._swarm.on('connection', (socket, details) => {
            // the client is the initiator, the server is not. 
            let secureSocket = noisepeer(socket, details.client)
            pump(secureSocket, remoteFeed.replicate(details.client, {live: true}), secureSocket)
        })
    }

    leave() {

    }

    getAllMessagesFrom(name, index) {
        return null
    }
}


module.exports = TopLevel