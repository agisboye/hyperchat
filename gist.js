const Protocol = require('hypercore-protocol')
const pump = require('pump')
const hyperswarm = require('hyperswarm')
const crypto = require('crypto')
const hypercore = require('hypercore')

const swarm = hyperswarm()
const inviter = process.argv.includes('--inviter')
const topic = Buffer.alloc(32).fill('testing')

let feed

swarm.on('connection', function (socket, info) {
    const p = new Protocol(info.client, {
        onauthenticate(remotePublicKey, done) {
            console.log('remote person is', remotePublicKey)
            done()
        }
    })

    const ext = p.registerExtension('test-extension', {
        encoding: 'json',
        onmessage(message) {
            if (!feed) feed = hypercore('inviter-clone', Buffer.from(message.key, 'hex'))
            feed.replicate(p, { live: true })

            feed.get(0, (err, data) => {
                console.log('inviter said: ' + data.toString())
            })
        }
    })

    if (inviter) {
        if (!feed) feed = hypercore('initiator')
        feed.append('hello from inviter!')
        feed.ready(function () {
            ext.send({
                key: feed.key.toString('hex')
            })
            feed.replicate(p, { live: true })
        })
    }

    pump(p, socket, p)
})

swarm.join(topic, { announce: inviter, lookup: !inviter })