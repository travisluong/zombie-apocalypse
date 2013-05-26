// is chatter ready?
var isChatterReady = function (chatter, stamina_cost, socket) {

    // check if chatter is alive
    if (chatter.alive === false) {
      socket.emit('messages', 'You are dead!');
      return false;
    }

    // check if enough stamina
    if (chatter.stamina < stamina_cost) {
      socket.emit('messages', 'You do not have enough stamina!');
      return false;
    }

    // return true if conditions not met
    return true;
}

// does attacker have enough ammo?
var isEnoughAmmo = function (attacker, socket) {
  // reduce ammo of attacker
  attacker.ammo = attacker.ammo - 1;

  // check if attacker has enough mana
  if (attacker.ammo < 0) {
    socket.emit('messages', "You are out of ammo!");
    return false;
  }

  return true;
}

// respawn timer
exports.setRespawnTimer = function (nickname) {
  setTimeout(function () {
    redis.hget('chatters', nickname, function (err, reply) {
      // return if no exist
      if (reply === undefined) {
        return;
      }

      chatter_data = JSON.parse(reply);

      // return if alive
      if (chatter_data.alive === true) {
        return;
      }

      // resurrect! and reset score...
      chatter_data.hp = CHATTER_HP;
      chatter_data.ammo = CHATTER_AMMO;
      chatter_data.score = 0;
      chatter_data.alive = true;
      chatter_data.first_aid_kit = CHATTER_FIRST_AID_KIT;
      var chatter_json = JSON.stringify(chatter_data);
      redis.hset('chatters', chatter_data.nickname, chatter_json);
      io.sockets.emit('messages', chatter_data.nickname + ' has been resurrected!');
    });
  }, CHATTER_RESPAWN_RATE);
}

// parameters: name of attacker and attacked
exports.handleAttackChatter = function (nickname, attacked, socket) {

  redis.hget("chatters", nickname, function (err, reply) {
    var attacker = JSON.parse(reply);

    // if basic attack conditions are not met, stop the attack
    if (isChatterReady(attacker, CHATTER_ATTACK_COST, socket) === false) {
      return;
    }

    // check if chatter exists
    redis.hexists('chatters', attacked, function (err, reply) {
      if (reply === 0) {
        socket.emit('messages', attacked + ' does not exist!');
        return;
      }

      if (isEnoughAmmo(attacker, socket) === false) {
        return;
      }

      attacker.stamina = attacker.stamina - CHATTER_ATTACK_COST;

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
        var damage = Math.round(Math.random() * CHATTER_ATTACK_DAMAGE);
        attacked_chatter.hp = attacked_chatter.hp - damage;

        // broadcast attack to all
        io.sockets.emit("messages", nickname +
          " shoots " + attacked + " for " + damage + " damage!");

        // check if killed
        if (attacked_chatter.hp < 1) {
          io.sockets.emit('messages', nickname + ' killed ' +
            attacked_chatter.nickname + '!' );
          attacked_chatter.alive = false;
          human_actions.setRespawnTimer(attacked_chatter.nickname);
        }

        // update attacked_chatter to redis
        attacked_chatter_nickname = attacked_chatter.nickname;
        attacked_chatter = JSON.stringify(attacked_chatter);
        redis.hset("chatters", attacked_chatter_nickname, attacked_chatter);
      });
    });
  });
}

var isZombiePresent = function (zombie, socket) {
  // check if any zombie exists
  if (Object.keys(zombies).length === 0) {
    socket.emit('messages', 'There are no zombies here...');
    return false;
  }

  // check if user selected zombie exists
  // if not, default to first zombie on list
  if (zombies[zombie] === undefined) {
    for (var z in zombies) {
      return z;
    }
  }

  // if user selected zombie exists, return it
  return zombie;
}

// handle attacking zombie
exports.handleAttackZombie = function (nickname, zombie, socket) {
  redis.hget('chatters', nickname, function (err, reply) {
    var attacker = JSON.parse(reply);

    // if basic attack conditions are not met, stop the attack
    if (isChatterReady(attacker, CHATTER_ATTACK_COST, socket) === false) {
      return;
    }

    // check if zombie is present
    zombie = isZombiePresent(zombie, socket);
    if (zombie === false) {
      return;
    }

    // check if attacker has enough ammo
    if (isEnoughAmmo(attacker, socket) === false) {
      return;
    }

    // reduce stamina of attacker
    attacker.stamina = attacker.stamina - CHATTER_ATTACK_COST;

    // deal damage
    var damage = Math.round(Math.random() * CHATTER_ATTACK_DAMAGE);
    zombies[zombie].hp = zombies[zombie].hp - damage;

    // broadcast attack to all
    io.sockets.emit("messages", nickname +
      " shoots zombie " + zombie + " for " + damage + " damage!");

    // check if killed
    if (zombies[zombie].hp < 1) {
      io.sockets.emit('messages', nickname + ' killed zombie ' +
        zombie + '!' );
      delete zombies[zombie];
      attacker.score = attacker.score + 1;
    }

    // update attacker stats on redis
    attacker = JSON.stringify(attacker);
    redis.hset("chatters", nickname, attacker);
  })
}

exports.handleStabZombie = function (nickname, zombie, socket) {
  redis.hget('chatters', nickname, function (err, reply) {
    var attacker = JSON.parse(reply);

    // if basic attack conditions are not met, stop the attack
    if (isChatterReady(attacker, CHATTER_STAB_COST, socket) === false) {
      return;
    }

    // check if zombie exists
    // check if zombie is present
    zombie = isZombiePresent(zombie, socket);
    if (zombie === false) {
      return;
    }

    // reduce stamina of attacker
    attacker.stamina = attacker.stamina - CHATTER_STAB_COST;

    // deal damage
    var damage = Math.round(Math.random() * CHATTER_STAB_DAMAGE);
    zombies[zombie].hp = zombies[zombie].hp - damage;

    // broadcast attack to all
    io.sockets.emit("messages", nickname +
      " stabs zombie " + zombie + " for " + damage + " damage!");

    // check if killed
    if (zombies[zombie].hp < 1) {
      io.sockets.emit('messages', nickname + ' killed zombie ' +
        zombie + '!' );
      delete zombies[zombie];
      attacker.score = attacker.score + 1;
    }

    // update attacker stats on redis
    attacker = JSON.stringify(attacker);
    redis.hset("chatters", nickname, attacker);
  })
}

// handle first aid kits
exports.handleHeal = function (nickname, target, socket) {
  redis.hget('chatters', nickname, function (err, reply) {
    var healer = JSON.parse(reply);

    // check if chatter ready
    if (isChatterReady(healer, CHATTER_HEAL_COST, socket) === false) {
      return;
    }

    // check if chatter has enough first aid kits
    if (healer.first_aid_kit < 1) {
      socket.emit('messages', 'You are out of first aid kits!');
      return;
    }

    // heal self if no target given, or if target is self
    if (target === undefined || nickname === target) {
      healer.hp = 100;
      healer.first_aid_kit = healer.first_aid_kit - 1;
      healer.stamina = healer.stamina - CHATTER_HEAL_COST;

      // emit message
      io.sockets.emit('messages', nickname + ' healed ' + nickname +
        ' with a first aid kit!');

      // save to redis
      new_healer_json = JSON.stringify(healer);
      redis.hset('chatters', nickname, new_healer_json);
      return;
    }

    // check if target is legit
    redis.hexists('chatters', target, function (err, reply) {
      // if target is legit, heal! or resurrect if dead...

      // if target doesnt exist
      if (reply === false) {
        socket.emit('messages', target + ' does not exist!');
      }

      if (reply) {
        redis.hget('chatters', target, function (err, chatter) {
          chatter_object = JSON.parse(chatter);
          healer.stamina = healer.stamina - CHATTER_HEAL_COST;

          if (chatter_object.alive === true) {
            chatter_object.hp = 100;
            io.sockets.emit('messages', nickname + ' healed ' +
              target + ' with a first aid kit!');
          } else {
            chatter_object.hp = 100;
            chatter_object.alive = true;
            io.sockets.emit('messages', nickname + ' resurrected ' +
              target + ' with a first aid kit!');
          }
          new_chatter_json = JSON.stringify(chatter_object);
          redis.hset('chatters', target, new_chatter_json);
          healer.first_aid_kit = healer.first_aid_kit - 1;

          // save to redis
          new_healer_json = JSON.stringify(healer);
          redis.hset('chatters', nickname, new_healer_json);
        });
      }
    });
  });
}

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

// set interval to replenish mana, hp, and stamina
setInterval(function () {
  redis.hkeys('chatters', function (err, chatters) {
    chatters.forEach(function (chatter_key) {
      redis.hget('chatters', chatter_key, function (err, chatter_json) {
        var chatter_data = JSON.parse(chatter_json);
        var chatter_updated = false;

        if (chatter_data.alive) {
          if (chatter_data.hp < CHATTER_HP) {
            chatter_data.hp = chatter_data.hp + HP_REGEN_RATE;
            chatter_updated = true;
            if (chatter_data.hp > CHATTER_HP) {
              chatter_data.hp = CHATTER_HP;
            }
          }

          if (chatter_data.ammo < CHATTER_AMMO) {
            chatter_data.ammo = chatter_data.ammo + AMMO_REGEN_RATE;
            chatter_updated = true;
            if (chatter_data.ammo > CHATTER_AMMO) {
              chatter_data.ammo = CHATTER_AMMO;
            }
          }

          if (chatter_data.stamina < CHATTER_STAMINA) {
            chatter_data.stamina = chatter_data.stamina + STAMINA_REGEN_RATE;
            chatter_updated = true;
            if (chatter_data.stamina > CHATTER_STAMINA) {
              chatter_data.stamina = CHATTER_STAMINA;
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
}, REGEN_INTERVAL);
