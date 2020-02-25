const hypercore = require('hypercore')
const net = require('net')
const pump = require('pump')

let localFeed = hypercore('./tmp/testing', {valueEncoding: 'json'})
localFeed.ready(() => {
    let remoteFeed = hypercore('./tmp/remote', localFeed.key, {valueEncoding: 'json'})

    remoteFeed.ready(() => {
        const server = net.createServer(socket => {
            pump(socket, remoteFeed.replicate(false, {live: true}), socket)
        })
        server.listen(3000)
        
        let socket = net.connect(3000)
        
        pump(socket, localFeed.replicate(true, {live: true}), socket)

        remoteFeed.createReadStream({live: true}).on('data', console.log)

        process.stdin.on('data', data => {
            let message = {
                message: data.toString()
            }
            localFeed.append(message)
        })
        
    })    
})


