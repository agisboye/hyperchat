const crypto = require('./crypto')

class Identity {

    constructor(myDiscoveryKey) {
        this._filepath = "./persistence/identity.json"
        this._peers = new Set()
    }

    me() {

    }

    addPeer(peerID, isInitiator) {
        // TODO: Should be no-op if we already know peer but right now we can change who is initiator.
        this._peers[peerID] = { isInitiator }
    }

    knows(peerID) {
        return this._peers[peerID] !== undefined
    }

    generateChallenge(otherPeerID) {
        return crypto.generateChallenge(
            // TODO:
        )
    }

    answerChallenge() {

    }


    _load() {
        try {
            let obj = JSON.parse(fs.readFileSync(this._filepath))
            this._keypair = {
                public_key: obj.public_key,
                private_key: obj.private_key
            }
            this._peers = new Set(obj.peers)
        } catch {}
    }

    _save() {
        fs.writeFileSync(this._filepath, JSON.stringify(this._contacts))
    }

}

module.exports = Identity