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
    chat.sendMessageTo(peerId, "I accepted your invite")
    chat._getFeed(chat._identity.getPublicKeyFromPeerID(peerId)).createReadStream({ live: true }).on('data', data => {
        console.log("New data on peer stream")
        console.log(data)
    })
})

chat._feed.createReadStream({ live: true }).on('data', data => {
    console.log("New data on my stream")
    console.log(data)
})
