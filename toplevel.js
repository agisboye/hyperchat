function invite(discoveryWords, name, cb) {
    cb(null, true)
}

function sendMessageTo(name, message) {

}

function join() {

}

function leave() {

}

function onMessage(cb) {
    return cb("from Name", 'message', 'metaData')
}

function getAllMessagesFrom(name, index) {
    return null
}

module.exports = {
    invite: invite,
    sendMessageTo: sendMessageTo,
    join: join,
    leave: leave,
    getAllMessagesFrom: getAllMessagesFrom,
    onMessage: onMessage
}