const Identity = require('./identity')
const hypercore = require('hypercore')
const crypto = require('./crypto')

let feedA = hypercore('testing')
let feedB = hypercore('testing2')

feedA.ready(() => {
    feedB.ready(() => {
        let identityA = new Identity("a", feedA.key)
        let identityB = new Identity("b", feedB.key)

        identityA.addPeer(identityB.me())
        identityB.addPeer(identityA.me())

        let pkA = identityA.getFeedPublicKeyFromPeerID(identityA.me())
        let dkA = identityA.getDicoveryKeyFromPublicKey(pkA)

        console.log(identityA.me().toString('hex'))
        console.log(identityA._keypair.pk.toString('hex'))
        console.log(identityA._keypair.sk.toString('hex'))

        console.log(identityB.me().toString('hex'))
        console.log(identityB._keypair.pk.toString('hex'))
        console.log(identityB._keypair.sk.toString('hex'))


        // encrypt message and append to your own feed
        let message = "hello world - Im A"
        let ciphertext = identityA.encryptMessage(message, identityB.me())
        let chatID = identityA.makeChatIDClient(identityB.me())
        let letter = {
            type: 'message',
            data: {
                chatID: chatID.toString('hex'),
                ciphertext: ciphertext.toString('hex')
            }
        }

        let decrypted = identityB.decryptMessage(letter, dkA)

        console.log(decrypted)
    })
})