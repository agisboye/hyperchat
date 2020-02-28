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
        return this._peerID
    }

    addPeer(peerID, isInitiator) {
        // TODO: Should be no-op if we already know peer but right now we can change who is initiator.
        this._peers[peerID] = isInitiator
        this._save()
        return this.getDiscoveryKeyFromPeerID(Buffer.from(peerID, 'hex'))
    }

    knows(peerID) {
        return this._peers[peerID] !== undefined
    }

    getDiscoveryKeyFromPeerID(peerID) {
        return crypto.getDiscoveryKeyFromPeerID(peerID)
    }

    generateChallenge(otherPeerID) {
        return crypto.generateChallenge(this._keypair.sk, this._keypair.pk, this._peerID, otherPeerID)
    }

    answerChallenge(ciphertext) {
        return crypto.answerChallenge(ciphertext, this._keypair.pk, this._keypair.sk)
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
            this._keypair = (obj.keypair === undefined) ? crypto.generateKeyPair() : this._hexKeypairToBuffers(obj.keypair)
            this._peers = (obj.peers === undefined) ? {} : obj.peers
        } catch(err) {
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