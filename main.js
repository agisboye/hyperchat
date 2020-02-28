const Hyperchat = require('./toplevel')

// let name = process.argv[2]
let knowsOtherPublicKey = process.argv[2] !== undefined
let toplevelObject = new Hyperchat()

toplevelObject.start()

toplevelObject.on('ready', () => {
    if (knowsOtherPublicKey) {
        let otherPublicKey = process.argv[2].toString('hex')
        toplevelObject.invite(otherPublicKey)
    }
})

