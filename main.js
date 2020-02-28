const TopLevel = require('./toplevel')

let name = process.argv[2]
let knowsOtherPublicKey = process.argv[3] !== undefined
let toplevelObject = new TopLevel(name)

toplevelObject.start()

toplevelObject.on('ready', () => {
    if (knowsOtherPublicKey) {
        let otherPublicKey = process.argv[3].toString('hex')
        toplevelObject.invite(otherPublicKey, (err) => {
            console.log(err)
        })
    }
})

