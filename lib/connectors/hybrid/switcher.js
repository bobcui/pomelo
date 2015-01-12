var EventEmitter = require('events').EventEmitter;
var util = require('util');
var WSProcessor = require('./wsprocessor');
var TCPProcessor = require('./tcpprocessor');
var logger = require('pomelo-logger').getLogger('pomelo', __filename);

var HTTP_METHODS = [
  'GET', 'POST', 'DELETE', 'PUT', 'HEAD'
];

var ST_STARTED = 1;
var ST_CLOSED = 2;

var DEFAULT_TIMEOUT = 90;

/**
 * Switcher for tcp and websocket protocol
 *
 * @param {Object} server tcp server instance from node.js net module
 */
var Switcher = function(server, opts) {
  EventEmitter.call(this);
  this.server = server;
  this.wsprocessor = new WSProcessor();
  this.tcpprocessor = new TCPProcessor(opts.closeMethod);
  this.timeout = opts.firstTimeout || DEFAULT_TIMEOUT;
  this.timeout *= 5
  this.id = 1;
  this.timeoutQueue = []
  setInterval(this.closeTimeoutSockets.bind(this), 200) 

  this.setNoDelay = opts.setNoDelay;

  this.server.on('connection', this.newSocket.bind(this));
  this.wsprocessor.on('connection', this.emit.bind(this, 'connection'));
  this.tcpprocessor.on('connection', this.emit.bind(this, 'connection'));

  this.state = ST_STARTED;
};
util.inherits(Switcher, EventEmitter);

module.exports = Switcher;

Switcher.prototype.newSocket = function(socket) {
  if(this.state !== ST_STARTED) {
    return;
  }
  // if set connection timeout
  this.addToTimeoutQueue(socket)
  socket.id = this.id++;
  socket.nodata = true

  var self = this;

  socket.once('data', function(data) {
    if(!!socket.nodata) {
      delete socket.nodata
    }
    if(isHttp(data)) {
      processHttp(self, self.wsprocessor, socket, data);
    } else {
      if(!!self.setNoDelay) {
        socket.setNoDelay(true);
      }
      processTcp(self, self.tcpprocessor, socket, data);
    }
  });
};

Switcher.prototype.close = function() {
  if(this.state !== ST_STARTED) {
    return;
  }

  this.state = ST_CLOSED;
  this.wsprocessor.close();
  this.tcpprocessor.close();
};

var isHttp = function(data) {
  var head = data.toString('utf8', 0, 4);

  for(var i=0, l=HTTP_METHODS.length; i<l; i++) {
    if(head.indexOf(HTTP_METHODS[i]) === 0) {
      return true;
    }
  }

  return false;
};

var processHttp = function(switcher, processor, socket, data) {
  processor.add(socket, data);
};

var processTcp = function(switcher, processor, socket, data) {
  processor.add(socket, data);
};

Switcher.prototype.addToTimeoutQueue = function(socket) {
  var timeoutSockets = this.timeoutQueue[this.timeoutQueue.length-1]
  var now = Math.ceil(Date.now() / 200)
  if (!timeoutSockets || timeoutSockets.time !== now) {
    timeoutSockets = {
      time: now,
      sockets: [socket]
    }
    this.timeoutQueue.push(timeoutSockets)
  }
  else {
    timeoutSockets.sockets.push(socket)
  }
}

Switcher.prototype.closeTimeoutSockets = function() {
  var timeoutTime = Math.floor(Date.now() / 200) - this.timeout
  while(!!this.timeoutQueue[0] && this.timeoutQueue[0].time <= timeoutTime) {
    var timeoutSockets = this.timeoutQueue.shift()
    for (var i=0; i<timeoutSockets.sockets.length; ++i) {
      var socket = timeoutSockets.sockets[i]
      if (!!socket.nodata && !socket.destroyed) {
        logger.debug('client %j first timeout.', socket.id)
        socket.destroy()
      }
    }
  }
}
