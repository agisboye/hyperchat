const Identity = require('./identity')
const hypercore = require('hypercore')
const ReverseFeedStream = require('./stream-manager')

let feedA = hypercore('testingA', { valueEncoding: 'json' })
let feedB = hypercore('testingB', { valueEncoding: 'json' })
let feedC = hypercore('testingC', { valueEncoding: 'json' })
// feed of A is filled with encrypted messages to B and vice versa

feedB.ready(async () => {
    feedA.ready(async () => {

        let identityA = new Identity("A", feedA.key)
        let identityB = new Identity("B", feedB.key)

        let stream = new ReverseFeedStream(identityB, feedA, identityA.me())

        stream.on('data', data => {
            console.log(data)
        })

    })
})

// //B: Go through feed A and filter on chatID
// let streamManagerB = new StreamManager(identityB)
// let inputStream = feedA.createReadStream({ live: true })
// streamManagerB.createDecryptedReadStream(inputStream, identityA.me()).on('data', data => {
//     console.log(data)
// })

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