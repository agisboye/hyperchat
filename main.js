const Hyperchat = require('./hyperchat')

let knowsOtherPeerId = process.argv[3] !== undefined
let name = process.argv[2]
let chat = new Hyperchat(name)

chat.start()

chat.on('ready', () => {
    if (knowsOtherPeerId) {
        let otherPeerId = Buffer.from(process.argv[3], 'hex')
        chat.invite(otherPeerId)
    }
})

chat.on('invite', (peerID) => {
    console.log("Accepting invite")
    chat.acceptInvite(peerID)
})

chat.on('decryptedMessage', (peerID, message) => {
    console.log('--------')
    console.log('> from:', peerID.toString('hex').substring(0, 10) + "...")
    console.log('> message:', message)
})

process.stdin.on('data', data => {
    let message = data.toString('utf-8')
    let firstPeer = chat._identity.peers()[0]
    console.log('> to:', firstPeer.toString('hex').substring(0, 10) + "...")
    chat.sendMessageTo(firstPeer, message)
})

// chat._feed.createReadStream({ live: true }).on('data', data => {
//     console.log(`[${name}] New data on my stream`)
//     console.log(data)
// })
