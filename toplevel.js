const { EventEmitter } = require('events')
const jsonStream = require('duplex-json-stream')
const hypercore = require('hypercore')
const hyperswarm = require('hyperswarm')
const noisepeer = require('noise-peer')

function generateSymKey() {
    return "this is a sync key"
}

function generateChatIDForName() {
    return "this is a unique chat ID for " + name
}

class TopLevel extends EventEmitter {

    constructor(feedPath) {
        super()
        this._swarm = hyperswarm()
        this._feed = hypercore('./' + feedPath, { valueEncoding: 'json' })
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

                    secureSocket.on('end', () => {
                        console.log('ending secure socket1')
                    })

                    secureSocket.on('data', data => {
                        console.log(data)
                    })
                }
            })

            this.emit('ready')
        })

    }

    invite(otherPublicKey, name, cb) {

        let otherPublicKeyBuffer = Buffer.from(otherPublicKey, 'hex')
        this._swarm.join(otherPublicKeyBuffer, { lookup: true, announce: false })
        this._swarm.on('connection', (socket, details) => {
            // make a secure json socket using the Noise Protocol. This side is initiator
            let secureSocket = jsonStream(noisepeer(socket, true))

            secureSocket.write({ hello: 'world' })
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