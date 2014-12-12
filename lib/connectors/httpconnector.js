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
}

util.inherits(Connector, EventEmitter)

module.exports = Connector

Connector.prototype.start = function(cb) {
    var self = this

    this.server = http.createServer().listen(this.port, this.host)
    this.server.on('connection', function(socket){
        var httpsocket = new HttpSocket(curId++, self.server, socket)
        httpsocket.on('closing', function(reason){
            httpsocket.send(self.encode(null, 'onKick', {
                reason: 'kick' + reason
            }))
        })
        self.emit('connection', httpsocket)
    })

    this.server.on('request', function(req, res) {
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
