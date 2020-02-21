const TopLevel = require('./toplevel')

let toplevelObject = new TopLevel()

toplevelObject.invite("disc words", "B", (err, success) => {
    console.log(err, success)
})

toplevelObject.on('message', (name, message) => {
    console.log(name, message)
})

toplevelObject.sendMessageTo("B", "message")