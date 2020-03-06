const Hyperchat = require('./hyperchat')

let knowsOtherPeerId = process.argv[3] !== undefined
let name = process.argv[2]
let chat = new Hyperchat(name)
let recipient;

chat.start()

chat.on('ready', () => {
    if (knowsOtherPeerId) {
        let otherPeerId = Buffer.from(process.argv[3], 'hex')
        chat.invite(otherPeerId)
        recipient = otherPeerId
    }
})

chat.on('invite', (peerId) => {
    console.log("Accepting invite")
    chat.acceptInvite(peerId)
})

chat.on('decryptedMessage', (peerID, message) => {
    console.log('--------')
    console.log('> from:', peerID.toString('hex').substring(0, 10) + "...")
    console.log('> message:', message)
    recipient = peerID
})

process.stdin.on('data', data => {
    let message = data.toString('utf-8')
    chat.sendMessageTo(recipient, message)
})

// chat._feed.createReadStream({ live: true }).on('data', data => {
//     console.log(`[${name}] New data on my stream`)
//     console.log(data)
// })
