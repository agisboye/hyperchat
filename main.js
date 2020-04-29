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

chat.on('decryptedMessage', (messages) => {
    if (messages.left && messages.right) {
        console.log('----- PAR ---')
        console.log(messages.left.messages)
        console.log(messages.right.messages)
    } else {
        console.log('-------------')
        console.log(messages)
    }
})

chat.on(Events.PEERS_CHANGED, peers => {
    setupReadStreams(false)

const messageCallback = result => {
    if (!Array.isArray(result)) result = [result] // TODO: Workaround since result can be either a single msg or an array of msgs.
    for (let message of result) {
        console.log(`[${message.sender}]: ${message.message}`)
    }
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
    let res = await stream.getPrevAsync()
    while (res) {
        messageCallback(res)
        res = await stream.getPrevAsync()
    }
}


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

