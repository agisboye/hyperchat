const { Hyperchat, Events } = require('./hyperchat')
const Peer = require('./peer')

let name = process.argv[2]

let peers = []
if (process.argv[3]) peers.push(new Peer(Buffer.from(process.argv[3], 'hex')))
if (process.argv[4]) peers.push(new Peer(Buffer.from(process.argv[4], 'hex')))


let chat = new Hyperchat(name)
chat.start()

chat.on(Events.READY, () => {
    setupReadStreams(true)

    if (peers.length > 0) {
        chat.invite(peers)
    }
})

chat.on(Events.INVITE, group => {
    console.log("Accepting invite for " + group)
    chat.acceptInvite(group)
})

chat.on(Events.PEERS_CHANGED, peers => {
    setupReadStreams(false)
})

const messageCallback = message => {
    // const senderID = (message.sender === "other") ? peerID : chat.me()
    // const sender = senderID.toString('hex').substring(0, 10)
    console.log(`[${message.sender}]: ${message.message}`)
}

let streams = []

function setupReadStreams(printAll = false) {

    // Remove existing listeners
    streams.forEach(s => s.off("data", messageCallback))
    streams = []

    // Add new listeners
    for (let group of chat.groups) {
        chat.getReadStream(group, (error, stream) => {
            if (error) return console.log("Error setting up read stream", error)
            stream.on("data", messageCallback)
            streams.push(stream)
            if (printAll) drain(stream)
        })
    }
}

async function drain(stream) {
    console.log("drain")
    let res = await stream.getPrevAsync()
    while (res) {
        messageCallback(res)
        res = await stream.getPrevAsync()
    }
}

// _setupReadstreamForGroupIfNeeded(group) {
//     if (this._peerPersistence.knowsGroup(group)) return // The readstream is already setup
//     this._setupReadStreamFor(group)
// }

// async _setupReadStreamFor(group) {
//     console.log("Setting up readstream for", this._groupToString(group))

//     let key = this._keychain.getKeyForGroup(group)
//     this._feedsManager.getFeedsByPeersForGroup(group, async feedsByPeers => {
//         let merged = new FeedMerger(this._potasium, key, feedsByPeers, group)

//         // a bit hacky..
//         let thereIsMore = true
//         while (thereIsMore) {
//             let res = await merged.getPrevAsync()
//             if (res) {
//                 this.emit('decryptedMessage', res)
//             } else {
//                 thereIsMore = false
//             }
//         }

//         merged.on('data', message => {
//             this.emit('decryptedMessage', message)
//         })
//     })
// }

/* User input */
process.stdin.on('data', data => {

    let message = data.toString('utf-8')
    if (peers.length === 0) {
        let group = chat.groups[0]
        chat.sendMessageTo(group, message)
    } else {
        chat.sendMessageTo(peers, message)
    }
})

