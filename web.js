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

io.sockets.on('connection', function (client) {
  console.log('Client connected...');

  client.set('state', 1);

  client.emit('messages', 'Please enter your name.')

  client.on('disconnect', function () {
    console.log('USER DISCONNECTED');
    client.get('nickname', function(err, name) {
      var message = name + " has left the room.";
      client.broadcast.emit("messages", message);
    });
  });

  client.on('messages', function (data) {
    console.log(data);

    client.get('state', function (err, state) {
      console.log(state);
      switch (state) {
        case 1:
        client.set('nickname', data);
        client.set('state', 2);

        var player = JSON.stringify({nickname: data, hp: 100});

        redis.hset("players", data, player);

        redis.hget("players", data, function (err, reply) {
          console.log(reply);
        });

        var message = data + " has joined the room.";
        client.broadcast.emit("messages", message);
        client.emit("messages", message);
        break;
        case 2:
        client.get('nickname', function (err, name) {
          split_words = data.split(' ');
          if (split_words[0] === 'kill') {
            client.broadcast.emit("messages", name + " attacked " + split_words[1]);
            client.emit("messages", name + " attacked " + split_words[1]);
          } else {
            var message = name + ": " + data;
            client.broadcast.emit("messages", message);
            client.emit("messages", message);
          }
          redis.hget("players", name, function (err, reply) {
            var player = JSON.parse(reply);
            client.emit('messages', '<span class="hp">' + player.hp.toString() + "hp</span>");
          });
        });
        break;
      }
    });
  });
});
