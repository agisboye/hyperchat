const { EventEmitter } = require('events')
const jsonStream = require('duplex-json-stream')
const hypercore = require('hypercore')
const hyperswarm = require('hyperswarm')

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

            this._swarm.join(this._feed.key, { lookup: false, announce: true })
            this.emit('ready')

            this._swarm.on('connection', (socket, details) => {
                console.log("connected!")
            })
        })

    }

    invite(otherPublicKey, name, cb) {

        let otherPublicKeyBuffer = Buffer.from(otherPublicKey, 'hex')
        this._swarm.join(otherPublicKeyBuffer, { lookup: true, announce: false })
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