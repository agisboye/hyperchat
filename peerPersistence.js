// const crypto = require('./crypto')
const fs = require('fs')
const Peer = require('./peer')
const Group = require('./group')

class PeerPersistence {

    constructor(name) {
        this._path = "./persistence/groups" + name + ".json"
        this._load()
    }

    get peers() {
        return [...new Set(this.groups.map(g => g.peers).flat())]
    }

    /**
     * 
     * @param {Group} group
     */
    addGroup(group) {
        if (!this.knowsGroup(group)) {
            this.groups.push(group)
            this._save()
        }
    }

    knowsGroup(group) {
        return this.groups.find(g => g.equals(group)) !== undefined
    }

    /**
     *
     * @param {Buffer} topic
     * @returns {Peer}
     */
    getPeerForDiscoveryKey(topic) {
        for (let group of this.groups) {
            for (let peer of group.peers) {
                if (peer.feedDiscoveryKey.equals(topic)) return peer
            }
        }
        return null
    }

    /*
        Private API
    */

    /**
     * Load groups from disk
     */
    _load() {
        let data;

        try {
            data = JSON.parse(fs.readFileSync(this._path))
        } catch { }

        // Deserialize data
        if (data) {
            this.groups = data.map(groupArray => {
                let peers = groupArray.map(p => new Peer(p))
                return new Group(peers)
            })

        } else {
            this.groups = []
        }
    }

    /**
     * Save groups to disk
     */
    _save() {

        // Serialize data
        let data = this.groups.map(group => {
            return group.peers.map(p => p.id)
        })


        fs.writeFileSync(this._path, JSON.stringify(data))
    }
}

module.exports = PeerPersistence