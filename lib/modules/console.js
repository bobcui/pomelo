/*!
 * Pomelo -- consoleModule serverStop stop/kill
 * Copyright(c) 2012 fantasyni <fantasyni@163.com>
 * MIT Licensed
 */
var logger = require('pomelo-logger').getLogger('pomelo', __filename);
var countDownLatch = require('../util/countDownLatch');
var utils = require('../util/utils');
var Constants = require('../util/constants');
var starter = require('../master/starter');
var exec = require('child_process').exec;
var usage = require('usage');
var pomelo = require('../pomelo');

module.exports = function(opts) {
  return new Module(opts);
};

module.exports.moduleId = '__console__';

var Module = function(opts) {
  opts = opts || {};
  this.app = opts.app;
  this.starter = opts.starter;
};

Module.prototype.monitorHandler = function(agent, msg, cb) {
  var serverId = agent.id;
  var serverType = agent.type;  
  var app = this.app;
  switch(msg.signal) {
    case 'stop':
      if(agent.type === Constants.RESERVED.MASTER) {
        return;
      }
      this.app.stop(true);
      break;
    case 'list':
      var pid = process.pid;
      var heapUsed = (process.memoryUsage().heapUsed/(1024 * 1024)).toFixed(2);
      var rss = (process.memoryUsage().rss/(1024 * 1024)).toFixed(2);
      var heapTotal = (process.memoryUsage().heapTotal/(1024 * 1024)).toFixed(2);
      var uptime = (process.uptime()/60).toFixed(2);
      var cpu, cpuSys, cpuUser, usageRss, mem, vsize
      usage.lookup(pid, {keepHistory: true}, function(err, result) {
        if (!err) {
          cpu = result.cpu.toFixed(2);
          if (!!result.cpuInfo) {
            cpuSys = result.cpuInfo.pcpuSystem.toFixed(2);
            cpuUser = result.cpuInfo.pcpuUser.toFixed(2);
          }
          mem = (result.memory/(1024 * 1024)).toFixed(2);
          usageRss = (result.memoryInfo.rss/(1024 * 1024)).toFixed(2);
          vsize = (result.memoryInfo.vsize/(1024 * 1024)).toFixed(0);
        }

        var connCount=null, loginedCount=null;
        var connection = app.components.__connection__;
        if (!!connection) {
          var connStats = connection.getStatisticsCount()
          connCount = connStats.totalConnCount
          loginedCount = connStats.loginedCount
        }

        utils.invokeCallback(cb, {
          serverId: serverId,
          body: {
            serverId: serverId, 
            serverType: serverType, 
            pid: pid, 
            rss: rss, 
            heapTotal: heapTotal, 
            heapUsed: heapUsed, 
            cpu: cpu,
            cpuSys: cpuSys,
            cpuUser: cpuUser,
            mem: mem,
            usageRss: usageRss,
            vsize: vsize,
            connCount: connCount,
            loginedCount: loginedCount,
            uptime:uptime
          }
        });
      });
      break;
    case 'listConn':
      var connection = app.components.__connection__;
      if (!!connection) {
        var connStats = connection.getStatisticsCount()
        utils.invokeCallback(cb, {
          serverId: serverId,
          body: {
            serverId: serverId, 
            serverType: serverType, 
            connCount: connStats.totalConnCount,
            loginedCount: connStats.loginedCount
          }
        });
      }
      else {
        utils.invokeCallback(cb, {
          serverId: serverId,
          serverType: serverType, 
          connCount: null,
          loginedCount: null
        });
      }
      break;          
    case 'dumpHeap':
      var heapdump = require('heapdump');
      var filename = msg.dir + '/' + serverId + '-' + process.pid + '-'+ Date.now() + '.heapsnapshot'
      heapdump.writeSnapshot(filename, function(err){
        utils.invokeCallback(cb, err);
      })
      break;               
    case 'gc':
      if (!global.gc) {
        utils.invokeCallback(cb, {
          serverId: serverId,
          body: {
            serverId: serverId, 
            serverType: serverType, 
            err: 'fail, no gc() function',
            cost: -1
          }
        });
      }
      else {
        var begin = Date.now()
        global.gc()
        var cost = Date.now() - begin
        logger.warn('gc() cost %sms', cost)
        utils.invokeCallback(cb, {
          serverId: serverId,
          body: {
            serverId: serverId, 
            serverType: serverType, 
            err: 'succ',
            cost: cost
          }
        });
      }
      break;               
    case 'kill':
      utils.invokeCallback(cb, serverId);
      if (agent.type !== 'master') {
        setTimeout(function() {
          process.exit(-1);
        }, Constants.TIME.TIME_WAIT_MONITOR_KILL);
      }
      break;
    case 'addCron':
      this.app.addCrons([msg.cron]);
      break;
    case 'removeCron':
      this.app.removeCrons([msg.cron]);
      break;
    case 'blacklist':
      if(this.app.isFrontend()) {
        var connector = this.app.components.__connector__;
        connector.blacklist = connector.blacklist.concat(msg.blacklist);
      }
      break;
    case 'restart':
      if(agent.type === Constants.RESERVED.MASTER) {
        return;
      }
      var self = this;
      var server = this.app.get(Constants.RESERVED.CURRENT_SERVER);
      utils.invokeCallback(cb, server);
      process.nextTick(function() {
        self.app.stop(true);
      });
      break;
    default:
      logger.error('receive error signal: %j', msg);
      break;
  }
};

Module.prototype.clientHandler = function(agent, msg, cb) {
  var app = this.app;
  switch(msg.signal) {
    case 'kill':
      kill(app, agent, msg, cb);
      break;
    case 'stop':
      stop(app, agent, msg, cb);
      break;
    case 'list':
      list(agent, msg, cb);
      break;
    case 'listConn':
      listConn(agent, msg, cb);
      break;
    case 'dumpHeap':
      dumpHeap(agent, msg, cb);
      break;
    case 'gc':
      collectGarbage(agent, msg, cb);
      break;
    case 'add':
      add(app, msg, cb);
      break;
    case 'addCron':
      addCron(app, agent, msg, cb);
      break;
    case 'removeCron':
      removeCron(app, agent, msg, cb);
      break;
    case 'blacklist':
      blacklist(agent, msg, cb);
      break;
    case 'restart':
      restart(app, agent, msg, cb);
      break;
    default:
      utils.invokeCallback(cb, new Error('The command cannot be recognized, please check.'), null);
      break;
  }
};

var kill = function(app, agent, msg, cb) {
  var sid, record;
  var serverIds = [];
  var count = utils.size(agent.idMap);
  var latch = countDownLatch.createCountDownLatch(count, {timeout: Constants.TIME.TIME_WAIT_MASTER_KILL}, function(isTimeout) {
    if (!isTimeout) {
      utils.invokeCallback(cb, null, {code: 'ok'});
    } else {
      utils.invokeCallback(cb, null, {code: 'remained', serverIds: serverIds});
    }
    setTimeout(function() {
      process.exit(-1);
    }, Constants.TIME.TIME_WAIT_MONITOR_KILL);
  });

  var agentRequestCallback = function(msg) {
      for (var i = 0; i < serverIds.length; ++i) {
        if (serverIds[i] === msg) {
          serverIds.splice(i,1);
          latch.done();
          break;
        }
      }
  };

  for(sid in agent.idMap) {
    record = agent.idMap[sid];
    serverIds.push(record.id);
    agent.request(record.id, module.exports.moduleId, { signal: msg.signal }, agentRequestCallback);
  }
};

var stop = function(app, agent, msg, cb) {
  var serverIds = msg.ids;
  if(!!serverIds.length) {
    var servers = app.getServers();
    app.set(Constants.RESERVED.STOP_SERVERS, serverIds);
    for(var i=0; i<serverIds.length; i++) {
      var serverId = serverIds[i];
      if(!servers[serverId]) {
        utils.invokeCallback(cb, new Error('Cannot find the server to stop.'), null);
      } else {
        agent.notifyById(serverId, module.exports.moduleId, { signal: msg.signal });
      }
    }
    utils.invokeCallback(cb, null, { status: "part" });
  } else {
    agent.notifyAll(module.exports.moduleId, { signal: msg.signal });
    setTimeout(function() {
      app.stop(true);
      utils.invokeCallback(cb, null, { status: "all" });
    }, Constants.TIME.TIME_WAIT_STOP);
  }
};

var restart = function(app, agent, msg, cb) {
  var successFlag;
  var successIds = [];
  var serverIds = msg.ids;
  var type = msg.type;
  var servers;
  if(!serverIds.length && !!type) {
    servers = app.getServersByType(type);
    if(!servers) {
      utils.invokeCallback(cb, new Error('restart servers with unknown server type: ' + type));
      return;
    }
    for(var i=0; i<servers.length; i++) {
      serverIds.push(servers[i].id);
    }
  } else if(!serverIds.length) {
    servers = app.getServers();
    for(var key in servers) {
      serverIds.push(key);
    }
  }  
  var count = serverIds.length;
  var latch = countDownLatch.createCountDownLatch(count, {timeout: Constants.TIME.TIME_WAIT_COUNTDOWN}, function() {
    if(!successFlag) {
      utils.invokeCallback(cb, new Error('all servers start failed.'));
      return;
    }
    utils.invokeCallback(cb, null, utils.arrayDiff(serverIds, successIds));
  });

  var request = function(id) {
    return (function() {
      agent.request(id, module.exports.moduleId, { signal: msg.signal }, function(msg) {
        if(!utils.size(msg)) {
          latch.done();
          return;
        }
        setTimeout(function() {
         runServer(app, msg, function(err, status) {
          if(!!err) {
            logger.error('restart ' + id + ' failed.');
          } else {
            successIds.push(id);
            successFlag = true;
          }
          latch.done();
        });
       }, Constants.TIME.TIME_WAIT_RESTART);
      });
    })();
  };

  for(var j=0; j<serverIds.length; j++) {
    request(serverIds[j]);
  }
};

var list = function(agent, msg, cb) {
  var sid, record;
  var serverInfo = {};
  var count = utils.size(agent.idMap);
  var latch = countDownLatch.createCountDownLatch(count, {timeout: Constants.TIME.TIME_WAIT_COUNTDOWN}, function() {
    utils.invokeCallback(cb, null, { msg: serverInfo });
  });

  var callback = function(msg) {
    serverInfo[msg.serverId] = msg.body;
    latch.done();
  };
  for(sid in agent.idMap) {
    record = agent.idMap[sid];
    agent.request(record.id, module.exports.moduleId, { signal: msg.signal }, callback);
  }
};

var listConn = function(agent, msg, cb) {
  var sid, record;
  var serverInfo = {};
  var count = 0;

  for(sid in agent.idMap) {
    record = agent.idMap[sid];
    if (!!msg.serverType) {
      if (record.type === msg.serverType) {
        count++;  
      }
    }
    else if (record.info.frontend === 'true') {
      count++;
    }
  }

  var latch = countDownLatch.createCountDownLatch(count, {timeout: Constants.TIME.TIME_WAIT_COUNTDOWN}, function() {
    utils.invokeCallback(cb, null, { msg: serverInfo });
  });

  var callback = function(msg) {
    serverInfo[msg.serverId] = msg.body;
    latch.done();
  };
  for(sid in agent.idMap) {
    record = agent.idMap[sid];
    if (!!msg.serverType) {
      if (record.type === msg.serverType) {
        agent.request(record.id, module.exports.moduleId, { signal: msg.signal }, callback);  
      }
    }
    else if (record.info.frontend === 'true') {
      agent.request(record.id, module.exports.moduleId, { signal: msg.signal }, callback);  
    }
  }
};

var dumpHeap = function(agent, msg, cb) {
console.log(msg)    
  agent.request(msg.serverId, module.exports.moduleId, msg, function(err, msg) {
    cb(err, msg);
  });
};

var collectGarbage = function(agent, msg, cb) {
console.log(msg)
  var sids = []
  if (msg.all) {
    for(var sid in agent.idMap) {
      sids.push(sid)
    }
  }
  else {
    sids.push(msg.serverId)
  }

  var serverInfo = {}
  var count = sids.length
  var latch = countDownLatch.createCountDownLatch(count, {timeout: Constants.TIME.TIME_WAIT_COUNTDOWN}, function() {
    utils.invokeCallback(cb, null, { msg: serverInfo });
  });

  var callback = function(msg) {
    serverInfo[msg.serverId] = msg.body;
    latch.done();
  };
  for(var i in sids) {
    agent.request(sids[i], module.exports.moduleId, { signal: msg.signal }, callback);  
  }
};

var add = function(app, msg, cb) {
  if(checkCluster(msg)) {
    startCluster(app, msg, cb);
  } else {
    startServer(app, msg, cb);
  }
  reset(ServerInfo);
};

var addCron = function(app, agent, msg, cb) {
  var cron = parseArgs(msg, CronInfo, cb);
  sendCronInfo(cron, agent, msg, CronInfo, cb);
};

var removeCron = function(app, agent, msg, cb) {
  var cron = parseArgs(msg, RemoveCron, cb);
  sendCronInfo(cron, agent, msg, RemoveCron, cb);
};

var blacklist = function(agent, msg, cb) {
  var ips = msg.args;
  for(var i=0; i<ips.length; i++) {
    if(!(new RegExp(/(\d+)\.(\d+)\.(\d+)\.(\d+)/g).test(ips[i]))) {
      utils.invokeCallback(cb, new Error('blacklist ip: ' + ips[i] + ' is error format.'), null);
      return;
    }
  }
  agent.notifyAll(module.exports.moduleId, { signal: msg.signal, blacklist: msg.args });
  process.nextTick(function() {
    cb(null, { status: "ok" });
  });
};

var checkPort = function(server, cb) {
  if (!server.port && !server.clientPort) {
    utils.invokeCallback(cb, 'leisure');
    return;
  }

  var p = server.port || server.clientPort;
  var host = server.host;
  var cmd = 'netstat -tln | grep ';
  if (!utils.isLocal(host)) {
    var ssh_params = pomelo.app.get(Constants.RESERVED.SSH_CONFIG_PARAMS);
    cmd = 'ssh ' + host + ' ' + ssh_params + ' ' + cmd;
  }

  exec(cmd + p, function(err, stdout, stderr) {
    if (stdout || stderr) {
      utils.invokeCallback(cb, 'busy');
    } else {
      p = server.clientPort;
      exec(cmd + p, function(err, stdout, stderr) {
        if (stdout || stderr) {
          utils.invokeCallback(cb, 'busy');
        } else {
          utils.invokeCallback(cb, 'leisure');
        }
      });
    }
  });
};

var parseArgs = function(msg, info, cb) {
  var rs = {};
  var args = msg.args;
  for(var i =0; i<args.length; i++) {
    if(args[i].indexOf('=') < 0) {
      cb(new Error('Error server parameters format.'), null);
      return;
    }
    var pairs = args[i].split('=');
    var key = pairs[0];
    if(!!info[key]) {
      info[key] = 1;
    }
    rs[pairs[0]] = pairs[1];
  }
  return rs;
};

var sendCronInfo = function(cron, agent, msg, info, cb) {
  if(isReady(info) && (cron.serverId || cron.serverType)) {
    if(!!cron.serverId) {
      agent.notifyById(cron.serverId, module.exports.moduleId, { signal: msg.signal, cron: cron });
    } else {
      agent.notifyByType(cron.serverType, module.exports.moduleId, { signal: msg.signal, cron: cron });
    }
    process.nextTick(function() {
      cb(null, { status: "ok" });
    });
  } else {
    cb(new Error('Miss necessary server parameters.'), null);
  }
  reset(info);
};

var startServer = function(app, msg, cb) {
  var server = parseArgs(msg, ServerInfo, cb);
  if (server.args !== undefined) {
    server.args = server.args.split(',')
  }
  if(isReady(ServerInfo)) {
    runServer(app, server, cb);
  } else {
    cb(new Error('Miss necessary server parameters.'), null);
  }
};

var runServer = function(app, server, cb) {
  checkPort(server, function(status) {
    if(status === 'busy') {
      utils.invokeCallback(cb, new Error('Port occupied already, check your server to add.'));
    } else {
      starter.run(app, server, function(err) {
        if(err) {
          utils.invokeCallback(cb, new Error(err), null);
          return;
        }
      });
      process.nextTick(function() {
        utils.invokeCallback(cb, null, { status: "ok" });
      });
    }
  });
};

var startCluster = function(app, msg, cb) {
  var serverMap = {};
  var fails = [];
  var successFlag;
  var serverInfo = parseArgs(msg, ClusterInfo, cb);
  utils.loadCluster(app, serverInfo, serverMap);
  var count = utils.size(serverMap);
  var latch = countDownLatch.createCountDownLatch(count, function() {
    if(!successFlag) {
      utils.invokeCallback(cb, new Error('all servers start failed.'));
      return;
    }
    utils.invokeCallback(cb, null, fails);
  });

  var start = function(server) {
    return (function() {
      checkPort(server, function(status) {
        if(status === 'busy') {
          fails.push(server);
          latch.done();
        } else {
          starter.run(app, server, function(err) {
            if(err) {
              fails.push(server);
              latch.done();
            }
          });
          process.nextTick(function() {
            successFlag = true;
            latch.done();
          });
        }
      });
    })();
  };
  for(var key in serverMap) {
    var server = serverMap[key];
    start(server);
  }
};

var checkCluster = function(msg) {
  var flag = false;
  var args = msg.args;
  for(var i=0; i < args.length; i++) {
    if(utils.startsWith(args[i], Constants.RESERVED.CLUSTER_COUNT)) {
      flag = true;
    }
  }
  return flag;
};

var isReady = function(info) {
  for(var key in info) {
    if(info[key]) {
      return false;
    }
  }
  return true;
};

var reset = function(info) {
  for(var key in info) {
    info[key] = 0;
  }
};

var ServerInfo = {
  host: 0,
  port: 0,
  id:   0,
  serverType: 0
};

var CronInfo = {
  id: 0,
  action: 0,
  time: 0
};

var RemoveCron = {
  id: 0
};

var ClusterInfo = {
  host: 0,
  port: 0,
  clusterCount: 0
};