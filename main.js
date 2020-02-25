const TopLevel = require('./toplevel')

let name = process.argv[2]
let knowsOtherPublicKey = process.argv[3] !== undefined
let toplevelObject = new TopLevel(name)

toplevelObject.start()

toplevelObject.on('ready', () => {
    toplevelObject.join()
    if (knowsOtherPublicKey) {
        let otherPublicKey = process.argv[3].toString('hex')
        toplevelObject.invite(otherPublicKey, (err) => {

            // try to send a message to B
            let message = "One small step for man, one giant leap for HyperChat"
            toplevelObject.sendMessageTo(otherPublicKey, message)
        })
    }
})

