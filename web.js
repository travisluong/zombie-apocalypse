var express = require("express");
var app = express();
var server = require('http').createServer(app);
var io = require('socket.io').listen(server);
var redis = require('redis-url').connect(process.env.REDISTOGO_URL);
var zombies = {};
var zombie_counter = 0;

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

// respawn timer
var setRespawnTimer = function (chatter_data) {
  setTimeout(function () {
    chatter_data.hp = 100;
    chatter_data.mp = 100;
    chatter_data.alive = true;
    var chatter_json = JSON.stringify(chatter_data);
    redis.hset('chatters', chatter_data.nickname, chatter_json);
    io.sockets.emit('messages', chatter_data.nickname + ' has been resurrected!');
  }, 10000);
}

// parameters: name of attacker and attacked
var handleAttack = function (nickname, attacked, socket) {

  redis.hget("chatters", nickname, function (err, reply) {
    var attacker = JSON.parse(reply);
    // first, check if chatter is alive
    if (attacker.alive === false) {
      socket.emit('messages', 'You are dead!');
      return;
    }

    // check if chatter exists
    redis.hexists('chatters', attacked, function (err, reply) {
      if (reply === 0) {
        socket.emit('messages', attacked + ' does not exist!');
        return;
      }

      // reduce mp of attacker
      attacker.mp = attacker.mp - 10;

      // check if attacker has enough mana
      if (attacker.mp < 0) {
        socket.emit('messages', "You don't have enough mana!");
        return;
      }

      // update attacker stats on redis
      attacker = JSON.stringify(attacker);
      redis.hset("chatters", nickname, attacker);

      // get attacked from redis
      redis.hget("chatters", attacked, function (err, reply) {
        var attacked_chatter = JSON.parse(reply);

        // check if already dead
        if (attacked_chatter.alive === false) {
          socket.emit('messages', attacked_chatter.nickname + ' is already dead!');
          return;
        }

        // deal damage
        var damage = Math.round(Math.random() * 30);
        attacked_chatter.hp = attacked_chatter.hp - damage;

        // broadcast attack to all
        io.sockets.emit("messages", nickname +
          " attacked " + attacked + " for " + damage + " damage!");

        // check if killed
        if (attacked_chatter.hp < 1) {
          io.sockets.emit('messages', nickname + ' has killed ' +
            attacked_chatter.nickname + '!' );
          attacked_chatter.alive = false;
          setRespawnTimer(attacked_chatter);
        }

        // update attacked_chatter to redis
        attacked_chatter_nickname = attacked_chatter.nickname;
        attacked_chatter = JSON.stringify(attacked_chatter);
        redis.hset("chatters", attacked_chatter_nickname, attacked_chatter);
      });
    });
  });
}

// handle attacking zombie
var handleAttackZombie = function (nickname, zombie, socket) {
  redis.hget('chatters', nickname, function (err, reply) {
    var attacker = JSON.parse(reply);

    // check if attacker is alive
    if (attacker.alive === false) {
      socket.emit('messages', 'You are dead!');
      return;
    }

    // check if zombie exists
    if (zombies[zombie] === undefined) {
      socket.emit('messages', 'What zombie?')
      return;
    }

    // reduce mp of attacker
    attacker.mp = attacker.mp - 10;

    // check if attacker has enough mana
    if (attacker.mp < 0) {
      socket.emit('messages', "You don't have enough mana!");
      return;
    }

    // update attacker stats on redis
    attacker = JSON.stringify(attacker);
    redis.hset("chatters", nickname, attacker);

    // deal damage
    var damage = Math.round(Math.random() * 30);
    zombies[zombie].hp = zombies[zombie].hp - damage;

    // broadcast attack to all
    io.sockets.emit("messages", nickname +
      " attacked zombie " + zombie + " for " + damage + " damage!");

    // check if killed
    if (zombies[zombie].hp < 1) {
      io.sockets.emit('messages', nickname + ' has killed zombie ' +
        zombie + '!' );
      delete zombies[zombie];
    }
  })
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
      hp: 100,
      mp: 100
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
      } else if (split_words[0] === 'shoot') {
        var zombie = split_words[1];
        handleAttackZombie(nickname, zombie, socket);
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

// set interval to replenish mana and hp
setInterval(function () {
  redis.hkeys('chatters', function (err, chatters) {
    chatters.forEach(function (chatter_key) {
      redis.hget('chatters', chatter_key, function (err, chatter_json) {
        var chatter_data = JSON.parse(chatter_json);
        var chatter_updated = false;

        if (chatter_data.alive) {
          if (chatter_data.hp < 100) {
            chatter_data.hp = chatter_data.hp + 4;
            chatter_updated = true;
            if (chatter_data.hp > 100) {
              chatter_data.hp = 100;
            }
          }

          if (chatter_data.mp < 100) {
            chatter_data.mp = chatter_data.mp + 4;
            chatter_updated = true;
            if (chatter_data.mp > 100) {
              chatter_data.mp = 100;
            }
          }
        }

        if (chatter_updated) {
          var new_chatter_data = JSON.stringify(chatter_data);
          redis.hset('chatters', chatter_data.nickname, new_chatter_data);
        }
      });
    });
  });
}, 4000);

// spawn zombies
setInterval(function () {
  num_zombies = Object.keys(zombies).length;
  if (num_zombies > 4) {
    return;
  }
  zombie_counter = zombie_counter + 1;
  zombie = {
    id: zombie_counter,
    hp: 100
  }
  zombies[zombie_counter] = zombie;
}, 5000);

// send zombie to clients
setInterval(function () {
  io.sockets.emit('update zombies', zombies);
}, 5000);

var zombieAttack = function (zombie, nickname) {
  redis.hget('chatters', nickname, function (err, reply) {
    var victim = JSON.parse(reply);

    // deal damage
    var damage = Math.round(Math.random() * 30);
    victim.hp = victim.hp - damage;

    if (victim.alive) {
      var message = 'zombie ' + zombie + ' deals ' +
        damage + ' damage to ' + nickname;

      io.sockets.emit('messages', message);
    }

    // save victim to redis
    new_victim_json = JSON.stringify(victim);
    redis.hset('chatters', nickname, new_victim_json);
  });
}

// set zombie attack interval
setInterval(function () {
  redis.hkeys('chatters', function (err, chatters) {
    var num_chatters = chatters.length;

    for (var zombie in zombies) {
      var random_number = Math.floor(Math.random() * num_chatters);
      var random_victim_nickname = chatters[random_number];
      var random_time_interval = Math.floor(Math.random() * 5000);

      // we use with statement to create a new scope so each zombie
      // can take its turn feasting and not just the last
      // since closures are not created in loops
      with ({zombie_num: zombie}) {
        // attack at a random time between 1 to 10 seconds
        setTimeout(function () {
          zombieAttack(zombie_num, random_victim_nickname);
        }, random_time_interval);
      }
    }
  });
}, 5000);
