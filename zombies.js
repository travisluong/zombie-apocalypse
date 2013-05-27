var spawnZombies = function () {
  for (var i = 0; i <= zombie_wave; i++) {
    zombie_counter = zombie_counter + 1;
    zombie = {
      id: zombie_counter,
      hp: ZOMBIE_HP
    }
    zombies[zombie_counter] = zombie;
  }

  zombie_wave = zombie_wave + 1;

  if (zombie_wave === 1) {
    io.sockets.emit('messages', "A zombie entered the room!");
  } else {
    io.sockets.emit('messages', zombie_wave + ' Zombies entered the room!');
  }
}

// set zombie interval
setInterval(function () {
  var num_chatters = io.sockets.clients();
  num_zombies = Object.keys(zombies).length;

  // check to make sure it doesn't go above the zombie limit
  if (num_zombies >= num_chatters.length * ZOMBIES_PER_CHATTER) {
    return;
  }

  // check to make sure there are no more zombies before
  // releasing the next wave
  if (num_zombies > 0) {
    return;
  }

  setTimeout(spawnZombies, 10000);

  if (zombie_wave > 0) {
    io.sockets.emit('messages', 'You survived wave ' + zombie_wave +
      ' of zombies! Be prepared for the next horde...')
  }
}, ZOMBIE_SPAWN_RATE);

// send zombie to clients
setInterval(function () {
  io.sockets.emit('update zombies', zombies);
}, 2000);

var zombieAttack = function (zombie, nickname) {

  // check first if chatter exists
  redis.hexists('chatters', nickname, function (err, exists) {
    if (exists) {
      confirmZombieAttack();
    }
  });

  // was too deeply nested, moved this out to its own function
  var confirmZombieAttack = function () {
    redis.hget('chatters', nickname, function (err, reply) {
      var victim = JSON.parse(reply);

      // only attack if zombie is still alive
      if (zombies[zombie] === undefined) {
        return;
      }

      // deal damage
      var damage = Math.round(Math.random() * ZOMBIE_ATTACK_DAMAGE);
      victim.hp = victim.hp - damage;

      if (victim.alive) {
        var message = 'Zombie ' + zombie + ' bites ' +
          nickname + ' for ' + damage + ' damage!';

        io.sockets.emit('messages', message);

        if (victim.hp < 1) {
          var message = 'Zombie ' + zombie + ' killed ' +
            nickname + '!';
          io.sockets.emit('messages', message);
          victim.alive = false;
          human_actions.setRespawnTimer(nickname);
        }
      } else {
        var message = 'Zombie ' + zombie +
        ' is feasting on the corpse of ' + nickname + '!';
        io.sockets.emit('messages', message);
      }

      // save victim to redis
      new_victim_json = JSON.stringify(victim);
      redis.hset('chatters', nickname, new_victim_json);
    });
  }

}

// set zombie attack interval
setInterval(function () {
  redis.hkeys('chatters', function (err, chatters) {
    var num_chatters = chatters.length;

    for (var zombie in zombies) {
      var random_number = Math.floor(Math.random() * num_chatters);
      var random_victim_nickname = chatters[random_number];
      var random_time_interval = Math.floor(Math.random() * ZOMBIE_ATTACK_RATE);

      // we use with statement to create a new scope so each zombie
      // can take its turn feasting and not just the last
      // since closures are not created in loops
      with ({
        zombie: zombie,
        random_victim_nickname: random_victim_nickname,
        random_time_interval: random_time_interval
      }) {
        // attack at a random time between 1 to 10 seconds
        setTimeout(function () {
          zombieAttack(zombie, random_victim_nickname);
        }, random_time_interval);
      }
    }
  });
}, ZOMBIE_ATTACK_RATE);
