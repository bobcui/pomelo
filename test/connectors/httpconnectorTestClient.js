var http = require('http')
var argv = require('optimist').argv

var hostname = argv.h || argv.host || '127.0.0.1'
var port = argv.p || argv.port || 13051

var req = http.request({
    hostname: hostname,
    port: port,
    method: 'POST'
}, function(res){
    res.on('data', function(body) {
        console.log('BODY: ' + body);
    })
})

req.on('error', function(e) {
    console.log('problem with request: ' + e.message);
});

req.write(JSON.stringify({
    id: 1,
    route: 'api.apiHandler.applyToken',
    body: {
        test: 1
    }
}));

req.end()
