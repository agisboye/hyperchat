const Identity = require('./identity')
const Potasium = require('./potasium')
const hypercore = require('hypercore')
const { ReverseFeedStream, StreamMerger } = require('./stream-manager')
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
            let potasiumA = new Potasium(identityA.keypair(), identityA.me(), feedA)
            let potasiumB = new Potasium(identityB.keypair(), identityB.me(), feedB)

            let challenge = potasiumA.generateChallenge(identityB.me()).toString('hex')

            let res = potasiumB.answerChallenge(challenge)
        })
    })
})


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