var EventEmitter = require('events').EventEmitter
var http = require('http')
var util = require('util')
var HttpSocket = require('./httpsocket')

var curId = 1;

var Connector = function(port, host, opts) {
    if (!(this instanceof Connector)) {
        return new Connector(port, host, opts)
    }

    EventEmitter.call(this)

    this.host = host
    this.port = port
    this.opts = opts || {}
    if (this.opts.keepAlive === undefined) {
        this.opts.keepAlive = true
    }
    this.opts.timeout = this.opts.timeout || 86400
    this.sockets = {}
}

util.inherits(Connector, EventEmitter)

module.exports = Connector

Connector.prototype.start = function(cb) {
    var self = this

    if(!!this.opts.distinctHost) {
        this.server = http.createServer().listen(this.port, this.host)
    } else {
        this.server = http.createServer().listen(this.port)
    }

    this.server.setTimeout(this.opts.timeout*1000, function(socket){
        socket.destroy()
    })

    this.server.on('connection', function(socket){
        var identifier = getSocketIdentifier(socket)
        var httpsocket = new HttpSocket(curId++, socket, self.opts)
        self.sockets[identifier] = httpsocket

        httpsocket.on('closing', function(reason){
            httpsocket.send(self.encode(null, 'onKick', {
                reason: reason
            }))
        })

        httpsocket.on('disconnect', function() {
            delete self.sockets[identifier]
        })

        self.emit('connection', httpsocket)
    })

    this.server.on('request', function(req) {
        var body = ''
        req.on('data', function(data){
            body += data
        })

        req.on('end', function(){
            var httpsocket = self.sockets[getSocketIdentifier(req.connection)]
            if (!!httpsocket) {
                if (body.length === 0) {
                    //httpsocket.onError()
                }
                else {
                    httpsocket.onMessage(body)
                }
            }
        })
    })

    process.nextTick(cb)
}

Connector.prototype.stop = function(force, cb) {
    this.server.close()
    process.nextTick(cb)
}

Connector.encode = Connector.prototype.encode = function(reqId, route, msg) {
    return JSON.stringify({
        id: reqId,
        route: route, 
        body: msg
    })
}

Connector.decode = Connector.prototype.decode = function(msg) {
    return JSON.parse(msg)
}

var getSocketIdentifier = function(socket) {
    return socket.remoteAddress + ':' + socket.remotePort
}