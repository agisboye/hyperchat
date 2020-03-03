const crypto = require('./crypto')
const fs = require('fs')

class Identity {

    constructor(myDiscoveryKey) {
        this._filepath = "./persistence/identity.json"
        // load keypair and peers from disc
        this._load()
        this._discoveryKey = myDiscoveryKey
        this._peerID = crypto.createPeerID(this._discoveryKey, this._keypair.pk)
        this._save()
    }

    /// returns own peerID
    me() {
        return this._peerID.toString('hex')
    }

    addPeer(peerID, isInitiator) {
        // TODO: Should be no-op if we already know peer but right now we can change who is initiator.
        this._peers[peerID] = isInitiator
        this._save()
        console.log(this._peers)
        let discoveryKey = this.getDiscoveryKeyFromPeerID(Buffer.from(peerID, 'hex'))
        return discoveryKey.toString('hex')
    }

    knows(peerID) {
        return this._peers[peerID] !== undefined
    }

    getDiscoveryKeyFromPeerID(peerID) {
        return crypto.getDiscoveryKeyFromPeerID(Buffer.from(peerID, 'hex')).toString('hex')
    }

    generateChallenge(topic) {
        // We need to find the peerID containing topic. 
        // TODO: What if multuple peerIDs contain 'topic'?
        let topicString = topic.toString('hex')
        let peerIDContainingTopic = Object.keys(this._peers).find(peerID => {
            let dk = peerID.substring(0, 64)
            return dk === topicString
        })

        let otherPeerIDBuffer = Buffer.from(peerIDContainingTopic, 'hex')

        return crypto.generateChallenge(this._keypair.sk, this._keypair.pk, this._peerID, otherPeerIDBuffer).toString('hex')
    }

    answerChallenge(ciphertext) {
        let res = crypto.answerChallenge(Buffer.from(ciphertext, 'hex'), this._keypair.pk, this._keypair.sk)
        if (res) {
            return res.toString('hex')
        } else {
            return null
        }
    }

    _hexKeypairToBuffers(keypair) {
        return {
            pk: Buffer.from(keypair.pk, 'hex'),
            sk: Buffer.from(keypair.sk, 'hex')
        }
    }

    _load() {
        try {
            let obj = JSON.parse(fs.readFileSync(this._filepath))
            this._keypair = (obj.keypair === undefined) ? crypto.generateKeyPair() : this._hexKeypairToBuffers(obj.keypair)
            this._peers = (obj.peers === undefined) ? {} : obj.peers
        } catch (err) {
            // file doesnt exist. Init file with empty json
            fs.writeFileSync(this._filepath, "{}")
            this._load()
        }
    }

    /// Save peers and keypair to disk
    _save() {
        let hexKeypair = {
            pk: this._keypair.pk.toString('hex'),
            sk: this._keypair.sk.toString('hex')
        }

        let obj = JSON.stringify({
            keypair: hexKeypair,
            peers: this._peers
        })

        fs.writeFileSync(this._filepath, obj)
    }

}

module.exports = Identity