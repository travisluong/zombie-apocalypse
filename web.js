var express = require("express");
var app = express();
var server = require('http').createServer(app);
var io = require('socket.io').listen(server);
var redis = require('redis-url').connect(process.env.REDISTOGO_URL);

// enable logging
app.use(express.logger());

// declare static directory
app.use(express.static(__dirname + '/public'));

app.get('/', function (request, response) {
  response.sendfile(__dirname + '/index.html');
});

var port = process.env.PORT || 5000;
server.listen(port, function () {
  console.log("Listening on " + port);
});

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
      });
    });
  });

  // on join
  socket.on('join', function (nickname) {

    // emit current chatters to client
    redis.hkeys('chatters', function (err, nicknames) {
      nicknames.forEach(function (nickname) {
        socket.emit('add chatter', nickname);
      });
      // set nickname for this client
      socket.set('nickname', nickname);

      // save chatter to redis
      var chatter = JSON.stringify({nickname: nickname, hp: 100});
      redis.hset("chatters", nickname, chatter);

      // broadcast chatter has joined room
      var message = nickname + " has joined the room.";
      socket.broadcast.emit("messages", message);
      socket.emit("messages", message);

      // broadcast add chatter to chatter list
      socket.broadcast.emit('add chatter', nickname);
      socket.emit('add chatter', nickname);
    });
  });

  // on messages
  socket.on('messages', function (data) {
    socket.get('nickname', function (err, name) {
      split_words = data.split(' ');
      if (split_words[0] === 'kill') {
        var attacked = split_words[1];
        console.log("attacked" + attacked);
        socket.broadcast.emit("messages", name + " attacked " + attacked);
        socket.emit("messages", name + " attacked " + attacked);
        redis.hget("chatters", attacked, function (err, reply) {
          var attacked_chatter = JSON.parse(reply);
          attacked_chatter.hp = attacked_chatter.hp - 10;
          attacked_chatter_name = attacked_chatter.nickname;
          attacked_chatter = JSON.stringify(attacked_chatter);
          console.log(attacked_chatter);
          redis.hset("chatters", attacked_chatter_name, attacked_chatter);
        });
      } else {
        var message = name + ": " + data;
        socket.broadcast.emit("messages", message);
        socket.emit("messages", message);
      }
      redis.hget("chatters", name, function (err, reply) {
        var chatter = JSON.parse(reply);
        socket.emit('messages', '<span class="hp">' + chatter.hp.toString() + "hp</span>");
      });
    });
  });
});
