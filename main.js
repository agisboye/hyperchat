const TopLevel = require('./toplevel')

let name = process.argv[2]
let pathName = 'feeds/' + name
let knowsOtherPublicKey = process.argv[3] !== undefined
let toplevelObject = new TopLevel(pathName)

toplevelObject.start()

toplevelObject.on('ready', () => {
    if (knowsOtherPublicKey) {
        console.log('inviting')
        let otherPublicKey = process.argv[3].toString('hex')
        toplevelObject.invite(otherPublicKey, (err, success) => {
            console.log(err, success)
        })
    }
})

