var EventEmitter = require('events').EventEmitter
var util = require('util')

var Socket = function(id, socket, opts) {
    EventEmitter.call(this);

    this.id = id
    this.socket = socket
    this.opts = opts

    this.remoteAddress = {
        ip: socket.remoteAddress,
        port: socket.remotePort
    }

    if (opts.keepAlive) {
        this.headerConnection = 'Connection: keep-alive'
    }
    else {
        this.headerConnection = 'Connection: close'
    }

    socket.on('error', this.onError.bind(this))
    socket.on('close', this.onClose.bind(this))
}

util.inherits(Socket, EventEmitter)

module.exports = Socket

Socket.prototype.send = function(msg) {
    if (!!this.socket) {
        var data = [
            'HTTP/1.1 200 OK',
            'Content-Type: text/plain',
            'Content-Length: '+ Buffer.byteLength(msg.length, 'utf8'),
            this.headerConnection,
            '',
            msg
        ]

        data = data.join('\n')
        this.socket.write(data)

        if (!this.opts.keepAlive) {
            this.socket.destroy()
        }
    }
}

Socket.prototype.disconnect = function() {
    if (!!this.socket) {
        this.socket.destroy()
        this.socket = null
    }
}

Socket.prototype.onMessage = function(msg) {
    this.emit('message', msg)
}

Socket.prototype.onError = function(err) {
    this.emit('error')
}

Socket.prototype.onClose = function(had_error) {
    if (!!this.socket) {
        this.socket = null
        this.emit('disconnect')
    }
}
