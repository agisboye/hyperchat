const crypto = require('./crypto')
const fs = require('fs')

class Identity {

    constructor(name, myPublicKey) {
        this._filepath = "./persistence/identity" + name + ".json"
        // load keypair and peers from disc
        this._load()
        this._publicKey = myPublicKey
        this._peerID = crypto.createPeerID(this._publicKey, this._keypair.pk)
    }

    /// returns own peerID
    me() {
        return this._peerID.toString('hex')
    }

    addPeer(peerID, isInitiator) {
        // TODO: Should be no-op if we already know peer but right now we can change who is initiator.
        this._peers[peerID] = isInitiator
        this._save()
        console.log('known peers:', this._peers)
        return this.getPublicKeyFromPeerID(Buffer.from(peerID, 'hex'))
    }

    getAllKnownPeerIDs() {
        return Object.keys(this._peers)
    }

    knows(topic) {
        let peerIDContainingTopic = this._getFirstPeerIDMatchingTopic(topic)
        return this._peers[peerIDContainingTopic] !== undefined
    }

    getPublicKeyFromPeerID(peerID) {
        return crypto.getFeedKeyFromPeerID(Buffer.from(peerID, 'hex')).toString('hex')
    }

    generateChallenge(topic) {
        // We need to find the peerID containing topic. 
        let peerIDContainingTopic = this._getFirstPeerIDMatchingTopic(topic)
        let otherPeerIDBuffer = Buffer.from(peerIDContainingTopic, 'hex')
        return crypto.generateChallenge(this._keypair.sk, this._keypair.pk, this._peerID, otherPeerIDBuffer).toString('hex')
    }

    // TODO: This is a really shitty solution....... Find a better one
    _getFirstPeerIDMatchingTopic(topicBuffer) {
        // PeerID is 64 bytes long. First 32 bytes is feedKey. Topic is discoveryKey, i.e. discoveryKey = hash(publicKey)
        // When converting 'topicBuffer' to a 'hex'-string its length becomes 64 as each hex-char is 1/2 byte. 
        // Therefore the feed key of 'peerID' is the first 64 characters. 
        let topicString = topicBuffer.toString('hex')
        return Object.keys(this._peers).find(peerID => {
            let publicKey = peerID.substring(0, 64)
            let publicKeyBuffer = Buffer.from(publicKey, 'hex')
            let discoveryKeyBuffer = crypto.dicoveryKeyFromPublicKey(publicKeyBuffer)
            return discoveryKeyBuffer === topicString
        })
    }

    answerChallenge(ciphertext) {
        let res = crypto.answerChallenge(Buffer.from(ciphertext, 'hex'), this._keypair.pk, this._keypair.sk)
        if (res) {
            return res.toString('hex')
        } else {
            return null
        }
    }

    encryptMessage(plaintext, otherPeerID) {
        let otherPeerIDBuffer = Buffer.from(otherPeerID, 'hex')
        let cipherTextBuffer = crypto.encryptMessage(plaintext, this._keypair.pk, this._keypair.sk, otherPeerIDBuffer)
        return cipherTextBuffer.toString('hex')
    }

    _hexKeypairToBuffers(keypair) {
        return {
            pk: Buffer.from(keypair.pk, 'hex'),
            sk: Buffer.from(keypair.sk, 'hex')
        }
    }

    _load() {
        let obj = {}

        try {
            obj = JSON.parse(fs.readFileSync(this._filepath))
        } catch { }
        if (obj.keypair === undefined) {
            this._keypair = crypto.generateKeyPair()
            this._save()
        } else {
            this._keypair = this._hexKeypairToBuffers(obj.keypair)
        }

        this._peers = (obj.peers === undefined) ? {} : obj.peers
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