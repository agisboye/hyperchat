const Hyperchat = require('./toplevel')

// let name = process.argv[2]
let knowsOtherPublicKey = process.argv[3] !== undefined
let name = process.argv[2]
let toplevelObject = new Hyperchat(name)

toplevelObject.start()

toplevelObject.on('ready', () => {
    if (knowsOtherPublicKey) {
        let otherPublicKey = process.argv[3].toString('hex')
        toplevelObject.invite(otherPublicKey)
    }
})

