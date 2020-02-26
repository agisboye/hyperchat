const hypercore = require('hypercore')
const net = require('net')
const pump = require('pump')
const noisepeer = require('noise-peer')
const jsonStream = require('duplex-json-stream')

let localFeed = hypercore('./tmp/testing', {valueEncoding: 'json'})
localFeed.ready(() => {
    let remoteFeed = hypercore('./tmp/remote', localFeed.key, {valueEncoding: 'json'})

    remoteFeed.ready(() => {
        const server = net.createServer(socket => {
            let noiseSocket = noisepeer(socket, false)
            pump(noiseSocket, process.stdout)
            pump(noiseSocket, remoteFeed.replicate(false, {live: true}), noiseSocket)
            //jsonsocket.on('data', data => console.log(data))
        })
        server.listen(3000)
        
        let socket = noisepeer(net.connect(3000), true)
        pump(socket, localFeed.replicate(true, {live: true}), socket, err => {
            if (err) throw err
        })
        
        socket.write(Buffer.from('hello world', 'hex'))
        remoteFeed.createReadStream({live: true}).on('data', console.log)

        process.stdin.on('data', data => {
            let prefix = data.toString().substring(0,1)
            if (prefix === 's') {
                // send as regular message
                socket.write(data)
            } else {
                //append to feed
                let message = {
                    message: data.toString()
                }
                localFeed.append(message)
            }
            
        })
        
    })    
})


