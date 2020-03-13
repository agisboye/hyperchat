const Identity = require('./identity')
const Potasium = require('./potasium')
const hypercore = require('hypercore')
const { ReverseFeedStream2 } = require('./stream-manager')

let feedA = hypercore('testingA', { valueEncoding: 'json' })
let feedB = hypercore('testingB', { valueEncoding: 'json' })
let feedC = hypercore('testingC', { valueEncoding: 'json' })
// feed of A is filled with encrypted messages to B and vice versa

feedA.ready(() => {
    feedC.ready(() => {
        let identityA = new Identity("A", feedA.key)
        let identityB = new Identity("B", feedC.key)
        let potasiumA = new Potasium(identityA.keypair(), identityA.me(), feedA)

        let stream = new ReverseFeedStream2(potasiumA, feedA, identityB.me())

        let p1 = await stream.getPrev()
        let p2 = await stream.getPrev()
        let p3 = await stream.getPrev()
        let p4 = await stream.getPrev()
        let p5 = await stream.getPrev()
    })
})



    // let identity = new Identity("A", feedA.key)
    // let potasium = new Potasium(identity.keypair(), identity.me(), feedA)

    // let stream = new ReverseFeedStream2(potasium, feedA, )