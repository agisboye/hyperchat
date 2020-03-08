const Identity = require('./identity')
const hypercore = require('hypercore')
const StreamManager = require('./stream-manager')


let feedA = hypercore('testingA', { valueEncoding: 'json' })
let feedB = hypercore('testingB', { valueEncoding: 'json' })
// feed of A is filled with encrypted messages to B and vice versa

feedA.ready(() => {
    feedB.ready(() => {

        let identityA = new Identity("A", feedA.key)
        let identityB = new Identity("B", feedB.key)

        //B: Go through feed A and filter on chatID
        let streamManagerB = new StreamManager(identityB)
        let inputStream = feedA.createReadStream({ live: true })
        streamManagerB.createDecryptedReadStream(inputStream, identityA.me()).on('data', data => {
            console.log(data)
        })
    })
})

