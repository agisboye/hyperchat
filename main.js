const Hyperchat = require('./hyperchat')

let knowsOtherPublicKey = process.argv[3] !== undefined
let name = process.argv[2]
let chat = new Hyperchat(name)

chat.start()

chat.on('ready', () => {
    if (knowsOtherPublicKey) {
        let otherPublicKey = process.argv[3].toString('hex')
        chat.invite(otherPublicKey)
    }
})
