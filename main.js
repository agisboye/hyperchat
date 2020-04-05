const { Hyperchat } = require('./hyperchat')

let knowsOtherPeerId = process.argv[3] !== undefined
let name = process.argv[2]
let chat = new Hyperchat(name)

chat.start()

chat.on('ready', () => {
    if (knowsOtherPeerId) {
        if (process.argv[4]) {
            // we have 2 ids
            let otherPeerId1 = Buffer.from(process.argv[3], 'hex')
            let otherPeerid2 = Buffer.from(process.argv[4], 'hex')
            chat.invite([otherPeerId1, otherPeerid2])
        } else {
            // we have 1 id
            let otherPeerId1 = Buffer.from(process.argv[3], 'hex')
            chat.invite([otherPeerId1])
        }
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

    // let input = data.toString('utf-8').split(' ')
    // let peerIndex = input.length === 1 ? 0 : input[0]
    // let message = input.length === 1 ? input[0] : input[1]
    //console.log("peerIndex:", peerIndex)
    // let otherPeer = chat._identity.peers()[peerIndex]

    let otherPeer = chat._peerPersistence.peers()[0]
    if (!otherPeer) {
        console.log("no peers known")
        return
    }

    let message = data.toString('utf-8')

    chat.sendMessageTo(otherPeer, message)
})

