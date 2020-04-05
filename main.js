const Hyperchat = require('./hyperchat')

let knowsOtherPeerId = process.argv[3] !== undefined
let name = process.argv[2]

let peer1 = (process.argv[3]) ? Buffer.from(process.argv[3], 'hex') : null
let peer2 = (process.argv[4]) ? Buffer.from(process.argv[4], 'hex') : null

let peers = []
if (peer1) peers.push(peer1)
if (peer2) peers.push(peer2)

let chat = new Hyperchat(name)

chat.start()

chat.on('ready', () => {
    if (knowsOtherPeerId) {
        chat.invite(peers)
    }
})

chat.on('invite', (peerIDs) => {
    console.log("Accepting invite")
    chat.acceptInvite(peerIDs)
})

chat.on('decryptedMessage', (message) => {
    console.log('--------')
    console.log('> message:', message)
})

process.stdin.on('data', data => {

    // let input = data.toString('utf-8').split(' ')
    // let peerIndex = input.length === 1 ? 0 : input[0]
    // let message = input.length === 1 ? input[0] : input[1]
    //console.log("peerIndex:", peerIndex)
    // let otherPeer = chat._identity.peers()[peerIndex]

    let message = data.toString('utf-8')
    if (peers.length === 0) {
        let group = chat._peerPersistence.groups()[0]
        chat.sendMessageTo(group, message)
    } else {
        chat.sendMessageTo(peers, message)
    }
})

