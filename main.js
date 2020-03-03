const Hyperchat = require('./hyperchat')

let knowsOtherPeerId = process.argv[3] !== undefined
let name = process.argv[2]
let chat = new Hyperchat(name)

chat.start()

chat.on('ready', () => {
    if (knowsOtherPeerId) {
        let otherPeerId = process.argv[3].toString('hex')
        chat.invite(otherPeerId)
        chat.sendMessageTo(otherPeerId, "hello from the other side")
    }
})

chat.on('invite', (peerId) => {
    chat.acceptInvite(peerId)
})