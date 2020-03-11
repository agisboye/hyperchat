const Identity = require('./identity')
const hypercore = require('hypercore')
const ReverseFeedStream = require('./stream-manager')
const promisify = require('util').promisify

hypercore.prototype.get = promisify(hypercore.prototype.get)
hypercore.prototype.head = promisify(hypercore.prototype.head)

let feedA = hypercore('testingA', { valueEncoding: 'json' })
let feedB = hypercore('testingB', { valueEncoding: 'json' })
let feedC = hypercore('testingC', { valueEncoding: 'json' })
// feed of A is filled with encrypted messages to B and vice versa

feedA.ready(async () => {
    feedB.ready(async () => {
        feedC.ready(async () => {
            let identityA = new Identity("A", feedA.key)
            let identityB = new Identity("B", feedB.key)
            let identityC = new Identity("C", feedC.key)

        })
    })
})

async function getHeadDict(feed) {
    return (feed.length === 0) ? {} : (await feed.head()).data.dict
}

// Sending a message
// 
// dict["B"] = feedA.length

    // let text = "Hi again B, this is A again"

    // let cipher = identityA.encryptMessage(text, identityB.me())

    // let message = {
    //     type: 'message',
    //     data: {
    //         dict: dict,
    //         ciphertext: cipher.toString('hex')
    //     }
    // }
    // feedA.append(message)