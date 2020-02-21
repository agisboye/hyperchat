const { EventEmitter } = require('events')

class TopLevel extends EventEmitter {
    invite(discoveryWords, name, cb) {
        cb(null, true)
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