const Identity = require('./identity')
const Potasium = require('./potasium')
const hypercore = require('hypercore')
const { ReverseFeedStream2 } = require('./stream-manager')

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

            let potasiumA = new Potasium(identityA.keypair(), identityA.me(), feedA)
            let potasiumB = new Potasium(identityB.keypair(), identityB.me(), feedB)
            let potasiumC = new Potasium(identityC.keypair(), identityC.me(), feedC)

            // B's perspective
            let streamOther = new ReverseFeedStream2(potasiumB, feedA, identityA.me(), false)
            let streamOwn = new ReverseFeedStream2(potasiumB, feedB, identityA.me(), true)

            for (var i = 0; i < feedA.length; i++) {
                let res = await streamOther.getPrev()
                if (res === null) break
                console.log(res)
            }

            for (var i = 0; i < feedB.length; i++) {
                console.log(await streamOwn.getPrev())
            }

            streamOwn.on('data', data => {
                console.log("New data", data)
            })
        })
    })
})


// feedA.ready(async () => {
//     feedB.ready(async () => {
//         feedC.ready(async () => {
//             let identityA = new Identity("A", feedA.key)
//             let identityB = new Identity("B", feedB.key)
//             let identityC = new Identity("C", feedC.key)

//             let potasiumA = new Potasium(identityA.keypair(), identityA.me(), feedA)
//             let potasiumB = new Potasium(identityB.keypair(), identityB.me(), feedB)
//             let potasiumC = new Potasium(identityC.keypair(), identityC.me(), feedC)

//             // B's perspective
//             let streamOther = new ReverseFeedStream2(potasiumB, feedA, identityA.me(), false)
//             let streamOwn = new ReverseFeedStream2(potasiumB, feedB, identityA.me(), true)

//             for (var i = 0; i < feedA.length; i++) {
//                 console.log(await streamOther.getPrev())
//             }
//         })
//     })
// })