var argv = require('optimist').argv
var HttpConnector = require('../../lib/connectors/httpconnector')

var host = argv.h || argv.host || '127.0.0.1'
var port = argv.p || argv.port || 13051

var httpConnector = new HttpConnector(port, host)

var bindEvents = function(socket) {
    socket.on('disconnect', function() {
        console.log('bindEvents on disconnect')
    })

    socket.on('error', function() {
        console.log('bindEvents on error')
    })

    socket.on('message', function(msg) {
        console.log('bindEvents on message %j', msg)
        socket.send(msg)
    })
}

httpConnector.on('connection', bindEvents)

httpConnector.start(function(){
    console.log('started')
})