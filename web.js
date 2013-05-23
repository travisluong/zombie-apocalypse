var express = require("express");
var app = express();
var server = require('http').createServer(app);
var io = require('socket.io').listen(server);
var redis = require('redis-url').connect(process.env.REDISTOGO_URL);

// enable logging
app.use(express.logger());

// declare static directory
app.use(express.static(__dirname + '/public'));

redis.set('foo', 'bar');

redis.get('foo', function (err, value) {
  console.log('foo is: ' + value);
});

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

io.sockets.on('connection', function (socket) {
  console.log('Client connected...');

  socket.set('state', 1);

  socket.emit('messages', 'Please enter your name.')

  socket.on('disconnect', function () {
    console.log('USER DISCONNECTED');
    socket.get('nickname', function(err, name) {
      var message = name + " has left the room.";
      socket.broadcast.emit("messages", message);
    });
  });

  socket.on('messages', function (data) {
    console.log(data);

    socket.get('state', function (err, state) {
      console.log(state);
      switch (state) {
        case 1:
        socket.set('nickname', data);
        socket.set('state', 2);

        var player = JSON.stringify({nickname: data, hp: 100});

        redis.hset("players", data, player);

        redis.hget("players", data, function (err, reply) {
          console.log(reply);
        });

        var message = data + " has joined the room.";
        socket.broadcast.emit("messages", message);
        socket.emit("messages", message);
        break;
        case 2:
        socket.get('nickname', function (err, name) {
          split_words = data.split(' ');
          if (split_words[0] === 'kill') {
            var attacked = split_words[1];
            console.log("attacked" + attacked);
            socket.broadcast.emit("messages", name + " attacked " + attacked);
            socket.emit("messages", name + " attacked " + attacked);
            redis.hget("players", attacked, function (err, reply) {
              var attacked_player = JSON.parse(reply);
              attacked_player.hp = attacked_player.hp - 10;
              attacked_player_name = attacked_player.nickname;
              attacked_player = JSON.stringify(attacked_player);
              console.log(attacked_player);
              redis.hset("players", attacked_player_name, attacked_player);
            });
          } else {
            var message = name + ": " + data;
            socket.broadcast.emit("messages", message);
            socket.emit("messages", message);
          }
          redis.hget("players", name, function (err, reply) {
            var player = JSON.parse(reply);
            socket.emit('messages', '<span class="hp">' + player.hp.toString() + "hp</span>");
          });
        });
        break;
      }
    });
  });
});
