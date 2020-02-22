const { EventEmitter } = require('events')
const jsonStream = require('duplex-json-stream')
const hypercore = require('hypercore')
const hyperswarm = require('hyperswarm')
const noisepeer = require('noise-peer')
const uuid = require('uuid')
const fs = require('fs')

function generateSymKey() {
    //TODO: Should instead be generated based on some symmetric crypto (sodium-native)
    return uuid()
}

function generateChatID() {
    return uuid()
}

class TopLevel extends EventEmitter {

    constructor(name) {
        super()
        this._name = name
        this._contactsFilePath = './persistence/' + name + '.json'
        this._contacts = this._readContacts()
        this._swarm = hyperswarm()
        this._feed = hypercore('./feeds/' + name, { valueEncoding: 'json' })
    }

    // TODO: Put persistence into own module?
    _readContacts() {
        //TODO: Add decryption
        try {
            return JSON.parse(fs.readFileSync(this._contactsFilePath))
        } catch {
            // file is not created. Write an empty dict to file
            fs.writeFileSync(this._contactsFilePath, JSON.stringify({}))
            return JSON.parse(fs.readFileSync(this._contactsFilePath))
        }
    }

    _writeContacts() {
        //TODO: Add encryption
        fs.writeFileSync(this._contactsFilePath, JSON.stringify(this._contacts))
    }

    _updateAndPersistContacts(key, value) {
        this._contacts[key] = value
        this._writeContacts()
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

                    secureSocket.on('data', message => {
                        if (message.type === 'inviteRequest') {
                            //TODO: Message should be signed by sender and checked here. (sodium-native). Maybe signed with senders feed private key?

                            let chatID = generateChatID()
                            let inviteResponse = {
                                type: 'inviteResponse',
                                senderPublicKey: this._feed.key.toString('hex'),
                                chatID: chatID
                            }

                            secureSocket.write(inviteResponse)

                            this._updateAndPersistContacts(message.senderPublicKey, {
                                ownChatID: chatID,
                                otherChatID: message.chatID,
                                symKey: message.sharedSymKey,
                            })
                        }
                    })
                }
            })

            this.emit('ready')
        })

    }

    //TODO: Add timeout error to callback
    invite(otherPublicKey, cb) {
        let otherPublicKeyBuffer = Buffer.from(otherPublicKey, 'hex')
        this._swarm.join(otherPublicKeyBuffer, { lookup: true, announce: false })
        this._swarm.on('connection', (socket, details) => {
            // make a secure json socket using the Noise Protocol. This side is initiator
            let secureSocket = jsonStream(noisepeer(socket, true))

            //TODO: Message should be signed by sender to prove authentication (sodium-native). Maybe sign using own feed private key?
            let sharedSymKey = generateSymKey()
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
                    // persist symKey, chatID_A and chatID_B under other 
                    this._updateAndPersistContacts(message.senderPublicKey, {
                        ownChatID: chatID,
                        otherChatID: message.chatID,
                        symKey: sharedSymKey
                    })

                    // Callback with no error
                    cb(null)
                }
            })
        })
    }

    sendMessageTo(name, message) {
        this.emit('message', name, message)
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