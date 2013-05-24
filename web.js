var express = require("express");
var app = express();
var server = require('http').createServer(app);
var io = require('socket.io').listen(server);
var redis = require('redis-url').connect(process.env.REDISTOGO_URL);

// enable logging
//app.use(express.logger());

// declare static directory
app.use(express.static(__dirname + '/public'));

app.get('/', function (request, response) {
  response.sendfile(__dirname + '/index.html');
});

var port = process.env.PORT || 5000;
server.listen(port, function () {
  console.log("Listening on " + port);
});

// parameters: name of attacker and attacked
var handleAttack = function (nickname, attacked, socket) {
  // check if chatter exists
  redis.hexists('chatters', attacked, function (err, reply) {
    if (reply === 1) {

      // reduce mp of attacker
      redis.hget("chatters", nickname, function (err, reply) {
        var attacker = JSON.parse(reply);
        attacker.mp = attacker.mp - 33;

        // if attacker has enough mana, attack!
        if (attacker.mp >= 0) {

          // update attacker stats on redis
          attacker = JSON.stringify(attacker);
          redis.hset("chatters", nickname, attacker);

          // broadcast attack to all
          io.sockets.emit("messages", nickname + " attacked " + attacked);

          // get attacked from redis, deal damage, and save back to redis
          redis.hget("chatters", attacked, function (err, reply) {
            var attacked_chatter = JSON.parse(reply);
            attacked_chatter.hp = attacked_chatter.hp - 10;
            attacked_chatter_nickname = attacked_chatter.nickname;
            attacked_chatter = JSON.stringify(attacked_chatter);
            redis.hset("chatters", attacked_chatter_nickname, attacked_chatter);
        });
        } else {
        socket.emit('messages', "You don't have enough mana!");
        }
      });
    } else {
    socket.emit('messages', attacked + ' does not exist!');
    }
  });
}

// https://devcenter.heroku.com/articles/using-socket-io-with-node-js-on-heroku
io.configure(function () {
  io.set("transports", ["xhr-polling"]);
  io.set("polling duration", 10);
});

// on connection
io.sockets.on('connection', function (socket) {
  console.log('Client connected...');

  // on disconnect
  socket.on('disconnect', function () {
    console.log('USER DISCONNECTED');
    socket.get('nickname', function (err, nickname) {
      redis.hdel('chatters', nickname, function (err, reply) {
        var message = nickname + " has left the room.";
        socket.broadcast.emit("messages", message);
        socket.broadcast.emit("remove chatter", nickname);
      });
    });
  });

  // on join
  socket.on('join', function (nickname) {

    // set nickname for this client
    socket.set('nickname', nickname);

    // initialize chatter data
    var chatter_data = {
      nickname: nickname,
      hp: 100,
      mp: 100,
      socket_id: socket.id
    }

    // save chatter to redis
    var chatter_json = JSON.stringify(chatter_data);
    redis.hset("chatters", nickname, chatter_json);

    // emit current chatters to client
    redis.hkeys('chatters', function (err, chatters) {

      // loop through chatters hash map and display them on client
      chatters.forEach(function (chatter_key) {
        redis.hget('chatters', chatter_key, function (err, chatter_json) {
          var chatter_data = JSON.parse(chatter_json);
          socket.emit('add chatter', chatter_data);
        });
      });

      // broadcast chatter has joined room
      var message = nickname + " has joined the room.";
      socket.broadcast.emit("messages", message);
      socket.emit("messages", message);

      // broadcast add chatter to other clients
      socket.broadcast.emit('add chatter', chatter_data);
    });
  });

  // on messages
  socket.on('messages', function (data) {
    socket.get('nickname', function (err, nickname) {

      split_words = data.split(' ');

      if (split_words[0] === 'kill') {
        var attacked = split_words[1];
        handleAttack(nickname, attacked, socket);
      } else {
        var message = nickname + ": " + data;
        socket.broadcast.emit("messages", message);
        socket.emit("messages", message);
      }
    });
  });
});

// set interval to update chatter stats
setInterval(function () {
  redis.hkeys('chatters', function (err, chatters) {
    chatters.forEach(function (chatter_key) {
      redis.hget('chatters', chatter_key, function (err, chatter_json) {
        var chatter_data = JSON.parse(chatter_json);
        io.sockets.emit('update chatter', chatter_data);
      });
    });
  });
}, 2000);

// set interval to replenish mana
setInterval(function () {
  redis.hkeys('chatters', function (err, chatters) {
    chatters.forEach(function (chatter_key) {
      redis.hget('chatters', chatter_key, function (err, chatter_json) {
        var chatter_data = JSON.parse(chatter_json);
        if (chatter_data.mp <= 100) {
          chatter_data.mp = chatter_data.mp + 4;
          if (chatter_data.mp > 100) {
            chatter_data.mp = 100;
          }
          new_chatter_data = JSON.stringify(chatter_data);
          redis.hset('chatters', chatter_data.nickname, new_chatter_data);
        }
      });
    });
  });
}, 4000);
