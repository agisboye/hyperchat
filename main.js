const toplevel = require('./toplevel')

toplevel.invite("disc words", "B", (err, success) => {
    console.log(err, success)
})

toplevel.onMessage(() => {
    console.log('on message')
})