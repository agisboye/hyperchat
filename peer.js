const crypto = require("hypercore-crypto")

const PUBLIC_KEY_LENGTH = 32

class Peer {

    /**
     * 
     * @param {Buffer} pubKey - The public key of the peer.
     */
    constructor(pubKey) {
        if (typeof pubKey === "string") pubKey = Buffer.from(pubKey, "hex")
        if (!Buffer.isBuffer(pubKey) || pubKey.length != PUBLIC_KEY_LENGTH) {
            throw new Error("Invalid public key")
        }

        this.pubKey = pubKey
    }

    /**
     * Public key as a hex encoded string
     */
    get id() {
        return this.pubKey.toString("hex")
    }

    get feedDiscoveryKey() {
        return crypto.discoveryKey(this.pubKey)
    }

    toString() {
        return this.id.substring(0, 6) + "..."
    }

    equals(otherPeer) {
        return this.pubKey.equals(otherPeer.pubKey)
    }

}

module.exports = Peer