/**
 * connection statistics service
 * record connection, login count and list
 */
var Service = function(app) {
  this.serverId = app.getServerId();
  this.connCount = 0;
  this.loginedCount = 0;
  this.logined = {};
};

module.exports = Service;

var pro = Service.prototype;


/**
 * Add logined user.
 *
 * @param uid {String} user id
 * @param info {Object} record for logined user
 */
pro.addLoginedUser = function(uid, sid, info) {
  if(!this.logined[uid]) {
    this.loginedCount++;
    this.logined[uid] = {}
  }
  this.logined[uid][sid] = info;
};

/**
 * Update user info.
 * @param uid {String} user id
 * @param info {Object} info for update.
 */
pro.updateUserInfo = function(uid, sid, info) {
    var user = this.logined[uid];
    if (!user) {
        return;
    }

    user = user[sid]
    if (!user) {
        return;
    }

    for (var p in info) {
        if (info.hasOwnProperty(p) && typeof info[p] !== 'function') {
            user[p] = info[p];
        }
    }
};

/**
 * Increase connection count
 */
pro.increaseConnectionCount = function() {
  this.connCount++;
};

/**
 * Remote logined user
 *
 * @param uid {String} user id
 */
pro.removeLoginedUser = function(uid, sid) {
  if(!!this.logined[uid] && !!this.logined[uid][sid]) {
    delete this.logined[uid][sid];

    var empty = true;
    for (var id in this.logined[uid]) {
      empty = false;
      break;
    }

    if (empty) {
      this.loginedCount--;
      delete this.logined[uid];
    }
  }
};

/**
 * Decrease connection count
 *
 * @param uid {String} uid
 */
pro.decreaseConnectionCount = function(uid, sid) {
  if(this.connCount) {
    this.connCount--;
  }
  if(!!uid) {
    this.removeLoginedUser(uid, sid);
  }
};

/**
 * Get statistics info
 *
 * @return {Object} statistics info
 */
pro.getStatisticsInfo = function() {
  var list = [];
  for(var uid in this.logined) {
    for (var sid in this.logined[uid]) {
      list.push(this.logined[uid][sid]);
    }
  }

  return {serverId: this.serverId, totalConnCount: this.connCount, loginedCount: this.loginedCount, loginedList: list};
};

pro.getStatisticsCount = function() {
  return {serverId: this.serverId, totalConnCount: this.connCount, loginedCount: this.loginedCount};
};
