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
    let peerIndex = input.length === 1 ? 0 : input[0]
    let message = input.length === 1 ? input[0] : input[1]

    let otherPeer = chat._identity.peers()[peerIndex]

    console.log("peerIndex:", peerIndex)
    chat.sendMessageTo(otherPeer, message)
})

