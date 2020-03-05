const Hyperchat = require('./hyperchat')

let knowsOtherPeerId = process.argv[3] !== undefined
let name = process.argv[2]
let chat = new Hyperchat(name)

chat.start()

chat.on('ready', () => {
    console.log(`Peer ID: ${chat._identity.me().toString('hex')}`)

    if (knowsOtherPeerId) {
        let otherPeerId = Buffer.from(process.argv[3], 'hex')
        chat.invite(otherPeerId)
        chat.sendMessageTo(otherPeerId, "hello from the other side")
    }
})

chat.on('invite', (peerId) => {
    console.log("Accepting invite")
    chat.acceptInvite(peerId)
    chat.sendMessageTo(peerId, "I accepted your invite")
    chat._getFeed(chat._identity.getPublicKeyFromPeerID(peerId)).createReadStream({ live: true }).on('data', data => {
        console.log(`[${name}] New data on peer stream`)
        console.log(data)
    })
})

chat._feed.createReadStream({ live: true }).on('data', data => {
    console.log(`[${name}] New data on my stream`)
    console.log(data)
})
