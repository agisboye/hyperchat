const Identity = require('./identity')
const hypercore = require('hypercore')
const StreamManager = require('./stream-manager')
const promisify = require('util').promisify
const { Readable } = require('stream')

// hypercore.prototype.get = promisify(hypercore.prototype.get)
// hypercore.prototype.head = promisify(hypercore.prototype.head)


class ReverseFeedStream extends Readable {

    constructor(ownIdentity, feed, index, otherPeerID) {
        super({ objectMode: true })
        this._feed = feed
        this._currentIndex = index
        this._ownIdentity = ownIdentity
        this._otherPeerID = otherPeerID
        //TODO: Not in use now. Can be used to determine if we we're traversing our own (decryptOwnMessage) or someone elses (decryptMessage)
        this._isOwnFeed = feed.writable
    }

    _read() {
        if (this._currentIndex < 0) this.push(null) // End of feed has been reached.

        this._feed.get(this._currentIndex, (err, currentMessage) => {
            if (err) throw err

            this._currentIndex--

            if (this._currentIndex < 0) {
                let decrypted = this._ownIdentity.decryptMessageFromOther(currentMessage.data.ciphertext, this._otherPeerID)
                this.push(decrypted)
            }

            // find next index in next message 
            this._feed.get(this._currentIndex, (err, nextMessage) => {
                if (err) throw err

                this._currentIndex = nextMessage.data.dict["B"]

                let decrypted = this._ownIdentity.decryptMessageFromOther(currentMessage.data.ciphertext, this._otherPeerID)
                this.push(decrypted)

            })
        })
    }
}

let feedA = hypercore('testingA', { valueEncoding: 'json' })
let feedB = hypercore('testingB', { valueEncoding: 'json' })
let feedC = hypercore('testingC', { valueEncoding: 'json' })
// feed of A is filled with encrypted messages to B and vice versa

feedB.ready(async () => {
    feedA.ready(async () => {

        let identityA = new Identity("A", feedA.key)
        let identityB = new Identity("B", feedB.key)

        // find the first index to look into
        feedA.head((err, message) => {
            let headIndex = message.data.dict["B"]

            if (headIndex !== null) {
                let stream = new ReverseFeedStream(identityB, feedA, headIndex, identityA.me())

                stream.on('data', data => {
                    console.log(data)
                })
            }
        })




    })
})

async function nextDecryptedMessage(ownIdentity, feed, index, otherPeer) {
    if (index < 0) return
    // B reads messages on feedA
    let dict = await getDictAtIndex(feed, index)

    // find index of first message to B
    let indexNextMessage = dict["B"]

    if (indexNextMessage !== null) {
        let message = await feed.get(indexNextMessage)

        // decrypt it
        let decrypted = ownIdentity.decryptMessageFromOther(message.data.ciphertext, otherPeer)

        if (decrypted) {
            console.log(decrypted)
            // recurse
            nextDecryptedMessage(ownIdentity, feed, indexNextMessage - 1, otherPeer)
        }
    }
}

async function getDictAtIndex(feed, index) {
    return (await feed.get(index)).data.dict
}




// //B: Go through feed A and filter on chatID
// let streamManagerB = new StreamManager(identityB)
// let inputStream = feedA.createReadStream({ live: true })
// streamManagerB.createDecryptedReadStream(inputStream, identityA.me()).on('data', data => {
//     console.log(data)
// })

// Sending a message
// 
// dict["B"] = feedA.length

    // let text = "Hi again B, this is A again"

    // let cipher = identityA.encryptMessage(text, identityB.me())

    // let message = {
    //     type: 'message',
    //     data: {
    //         dict: dict,
    //         ciphertext: cipher.toString('hex')
    //     }
    // }
    // feedA.append(message)