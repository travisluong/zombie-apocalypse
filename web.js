// global modules
global.express = require("express");
global.app = express();
global.server = require('http').createServer(app);
global.io = require('socket.io').listen(server);
global.redis = require('redis-url').connect(process.env.REDISTOGO_URL);

// global variables
global.zombies = {}
global.zombie_counter = 0;
global.zombie_wave = 0;

// global constants
global.ZOMBIE_SPAWN_RATE = 10000;
global.ZOMBIE_ATTACK_RATE = 10000;
global.ZOMBIE_ATTACK_DAMAGE = 20;
global.ZOMBIES_PER_CHATTER = 20;
global.ZOMBIE_HP = 100;
global.CHATTER_RESPAWN_RATE = 30000;
global.CHATTER_HP = 100;
global.CHATTER_AMMO = 12;
global.CHATTER_STAMINA = 100;
global.CHATTER_FIRST_AID_KIT = 3;
global.CHATTER_ATTACK_DAMAGE = 100;
global.CHATTER_STAB_DAMAGE = 50;
global.CHATTER_ATTACK_COST = 25;
global.CHATTER_STAB_COST = 50;
global.CHATTER_HEAL_COST = 100;
global.HP_REGEN_RATE = 1;
global.AMMO_REGEN_RATE = 0;
global.STAMINA_REGEN_RATE = 25;
global.REGEN_INTERVAL = 2000;
global.AMMO_DROP_RATE = 30;
global.FIRST_AID_DROP_RATE = 20;

// custom global modules
global.zombie_actions = require('./zombies.js');
global.human_actions = require('./humans.js');

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
        var message = nickname + " rage quit!";
        socket.broadcast.emit("messages", message);
        socket.broadcast.emit("remove chatter", socket.id);
      });
    });
  });

  // on join
  socket.on('join', function (nickname) {

    // set nickname for this client
    socket.set('nickname', nickname);

    // initialize chatter data
    var chatter_data = {
      socket_id: socket.id,
      nickname: nickname,
      alive: true,
      hp: CHATTER_HP,
      ammo: CHATTER_AMMO,
      stamina: CHATTER_STAMINA,
      first_aid_kit: CHATTER_FIRST_AID_KIT,
      score: 0
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
        human_actions.handleAttackChatter(nickname, attacked, socket);
      } else if (split_words[0] === 'shoot') {
        var zombie = split_words[1];
        human_actions.handleAttackZombie(nickname, zombie, socket);
      } else if (split_words[0] === 'stab') {
        var zombie = split_words[1];
        human_actions.handleStabZombie(nickname, zombie, socket);
      } else if (split_words[0] === 'heal') {
        var target = split_words[1];
        human_actions.handleHeal(nickname, target, socket);
      } else {
        var message = nickname + ": " + data;
        socket.broadcast.emit("messages", message);
        socket.emit("messages", message);
      }
    });
  });
});

