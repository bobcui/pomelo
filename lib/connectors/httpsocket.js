var EventEmitter = require('events').EventEmitter
var util = require('util')

var Socket = function(id, server, socket) {
    EventEmitter.call(this);
    var self = this

    this.id = id
    this.socket = socket
    this.req = null
    this.res = null

    this.remoteAddress = {
        ip: socket.remoteAddress,
        port: socket.remotePort
    }

    server.on('request', function(req, res) {
        self.req = req
        self.res = res

        var body = ''
        req.on('data', function(data){
            console.log('on data %s', data)
            body += data
        })

        req.on('end', function(){
            console.log('req.read()=' + req.read())
            console.log('end data id = %s', self.id)
            if (body.length === 0) {
                self.emit('error')
            }
            else {
                self.emit('message', body)
            }
        })
    })

    socket.on('error', this.emit.bind(this, 'error'))
    socket.on('close', this.emit.bind(this, 'disconnect'))
}

util.inherits(Socket, EventEmitter)

module.exports = Socket

Socket.prototype.send = function(msg) {
    if (!!this.res) {
        this.res.writeHead(200, {'Content-Type': 'text/html'});
        this.res.end(msg)
        this.res = null
    }
    if (!!this.req) {
        this.req.connection.destroy()
        this.req = null
        console.log('disconnect req.connection.destroy')
    }    
}

Socket.prototype.disconnect = function() {
    if (!!this.res) {
        this.res = 400
        this.res.end()
        this.res = null
        console.log('disconnect res.end')
    }
    if (!!this.req) {
        this.req.connection.destroy()
        console.log('disconnect req.connection.destroy')
    }
    // if (!!this.socket) {
    //     this.socket.destroy()
    //     this.socket = null
    //     console.log('disconnect socket.destroy')
    // }

    console.log('disconnect')
}
