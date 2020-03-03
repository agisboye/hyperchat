const Hyperchat = require('./toplevel')

// let name = process.argv[2]
let knowsOtherPeerID = process.argv[3] !== undefined
let name = process.argv[2]
let toplevelObject = new Hyperchat(name)

toplevelObject.start()

toplevelObject.on('ready', () => {
    if (knowsOtherPeerID) {
        let otherPeerID = process.argv[3].toString('hex')
        toplevelObject.invite(otherPeerID)
        toplevelObject.sendMessageTo(otherPeerID, "hello from A!")
    }
})

