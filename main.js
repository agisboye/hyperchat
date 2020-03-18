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

    let input = data.toString('utf-8').split(' ')
    let peerIndex = input[0]
    let message = input[1]

    let otherPeer = chat._identity.peers()[peerIndex]
    console.log('> to:', firstPeer.toString('hex').substring(0, 10) + "...")
    chat.sendMessageTo(firstPeer, message)
})

// chat._feed.createReadStream({ live: true }).on('data', data => {
//     console.log(`[${name}] New data on my stream`)
//     console.log(data)
// })

// let stream = chat.streamForPeer(peer)

// stream.from(index, "backwards").on('data', data => {

// })

// stream.get(index, data => {
//     // get index at 'index'
// })

// stream.on('data', data => {
//     // new message
// })
