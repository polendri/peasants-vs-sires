window.addEventListener('load',function(e) {
  //
  // Instantiating and configuring Quintus.
  //
  var Q = Quintus({
    imagePath: "assets/images/",
    dataPath:  "assets/data/",
  })
  .include("Sprites, Scenes, Input, Anim, 2D, UI")
  .setup("quintusContainer");

  Q.input.keyboardControls({
    81: "spawnPeasants",
    87: "spawnSires"
  });

  Q.gravityX = 0;
  Q.gravityY = 0;


  //
  // A component for automatically homing in on entities which satisfy a
  // predicate.
  //
  Q.component('homing', {
    // Rotates coordinates by -pi/6 to convert them to the isometric
    // plane.
    _toIsoCoords: function(x, y) {
      return {
        x: 0.8660*x - 0.5*y,
        y: 0.5*x + 0.8660*y
      };
    },

    // Choose which direction to face in order to move toward the target.
    _chooseFacing: function(target) {
      if (target === null || !target.p) {
        return;
      }
      var p = this.entity.p;

      var targetIsoCoords = this._toIsoCoords(target.p.x, target.p.y);
      var isoCoords = this._toIsoCoords(p.x, p.y);
      var diffX = targetIsoCoords.x - isoCoords.x;
      var diffY = targetIsoCoords.y - isoCoords.y;
      var coordDiff = Math.abs(diffX) - Math.abs(diffY);

      // Pick the direction that gets us closest to the target.
      if (coordDiff > 0) {
        p.facing = diffX < 0 ? 'front' : 'back';
      }
      else {
        p.facing = diffY > 0 ? 'left' : 'right';
      }

      // Set a commitment if we're moving nearly diagonally, to avoid
      // stuttery movement.
      if (Math.abs(coordDiff) <= p.speed/6) {
        p.commitment = 0.25;
      }
    },

    // Find the closest other entity which satisfies the provided predicate.
    _findClosest: function(predicate) {
      if (!predicate) {
        predicate = function() { return true; }
      }
      var p = this.entity.p;
      var stage = this.entity.stage;
      var closest = null;
      var closestDistance = null;

      for (var i = 0; i < stage.items.length; i++) {
        var target = stage.items[i];

        if (!predicate(target) || target === this.entity) {
          continue;
        }

        var x = target.p.x - p.x;
        var y = target.p.y - p.y;
        var targetDistance = Math.sqrt(x*x + y*y);

        if (closest === null) {
          closest = target;
          closestDistance = targetDistance;
          continue;
        }

        if (targetDistance < closestDistance) {
          closest = target;
          closestDistance = targetDistance;
        }
      }

      return closest;
    },

    _acquireTarget: function() {
      var p = this.entity.p;
      p.target = this._findClosest(function(target) {
        return p.predicate(target)
          && (!target.p.followerCount || target.p.followerCount < p.maxFollowers);
      });
      p.retargetCountdown = 1.0;

      if (p.target) {
        if (p.target.followerCount) {
          p.target.followerCount++;
        }
        else {
          p.target.followerCount = 1;
        }
      }
    },

    _abandonTarget: function() {
      var p = this.entity.p;
      if (p.target !== null) {
        p.target.followerCount--;
      }
    },

    defaults: {
      // The predicate with which to filter which entities get considered for
      // homing.
      predicate: function() { return true; },
      // The homing movement speed.
      speed: 30,
      // The entity's facing (front, left, back or right).
      facing: 'front',
      // The distance from a target at which homing will cease.
      stopDistance: 25,
      // The distance from a target at which homing should resume again.
      restartDistance: 30,
      // A count is kept for each entity of how many other entities are
      // targeting it. This sets an upper bound on the number of followers,
      // as a way of spreading out targets.
      maxFollowers: 5,
      // The homing target.
      target: null,
      // Counter used for determining when to look for a new target.
      retargetCountdown: 0,
      // Counter that must run down before a new facing can be chosen. This is
      // to prevent stuttery behaviour when moving diagonally.
      commitment: 0,
      // Whether or not homing is active.
      homingActive: false
    },

    added: function() {
      var p = this.entity.p;
      Q._defaults(p, this.defaults);
      this.entity.on('step', this, 'step');
    },

    step: function(dt) {
      var p = this.entity.p;

      // Try to find a target if we don't have one, if it's dead, or if it's
      // just time to refresh.
      if (p.target === null
          || !p.target.has('combat')
          || p.target.health <= 0
          || p.retargetCountdown <= 0) {
        this._acquireTarget();

        // Quit if we failed to find one.
        if (p.target === null) {
          return;
        }

        p.homingActive = true;
      }

      // Get the distance to the target.
      var diffX = p.target.p.x - p.x;
      var diffY = p.target.p.y - p.y;
      var targetDistance = Math.sqrt(diffX*diffX + diffY*diffY);

      // If we're inactive but the target is still within our restartDistance,
      // we can shortcircuit, otherwise we need to start up again.
      if (!p.homingActive && targetDistance < p.restartDistance) {
        return;
      }
      else {
        p.homingActive = true;
        this.entity.trigger('homingStarted');
      }

      // Stop if we're close enough to the target.
      if (targetDistance <= p.stopDistance) {
        p.homingActive = false;
        this.entity.trigger('homingEnded');
        return;
      }

      // Figure out which direction gets us closest to the target, unless
      // we've committed to going in the current direction.
      if (p.commitment <= 0) {
        this._chooseFacing(p.target);
      }

      // Apply the movement in the required direction.
      if (p.facing === 'front') {
        p.x -= dt * p.speed;
        p.y += dt * p.speed / 2;
      }
      else if (p.facing === 'left') {
        p.x += dt * p.speed;
        p.y += dt * p.speed / 2;
      }
      else if (p.facing === 'back') {
        p.x += dt * p.speed;
        p.y -= dt * p.speed / 2;
      }
      else if (p.facing === 'right') {
        p.x -= dt * p.speed;
        p.y -= dt * p.speed / 2;
      }

      p.retargetCountdown -= dt;
      p.commitment -= dt;
    },

    destroy: function() {
      var p = this.entity.p;
      if (p.target !== null && p.target.followerCount) {
        p.target.followerCount -= 1;
      }
      this._super();
    }
  });


  //
  // A component for combat. Depends on the homing component.
  //
  Q.component('combat', {
    defaults: {
      // The entity's health.
      health: 10,
      // The entity's attack range.
      range: 30,
      // The entity's attack damage.
      attack: 4,
      // The variance of the attack damage. Actual damage will be multiplied
      // by a random number between 1.0 - variance and 1.0 + variance.
      attackVariance: 0.5,
      // Attack cooldown time, in seconds.
      cooldown: 1.0,
      // Variance factor for the cooldown time.
      cooldownVariance: 0.5,
      // Counter for remaining cooldown.
      cooldownCounter: 0,
      // The target of attacks.
      attackTarget: null,
      // The distance to the attack target.
      attackTargetDistance: null
    },

    added: function() {
      var p = this.entity.p;
      Q._defaults(p, this.defaults);
      this.entity.on('step', this, 'step');
      this.entity.on('attacked', this, 'attacked');
    },

    step: function(dt) {
      var p = this.entity.p;

      if (p.cooldownCounter > 0) {
        p.cooldownCounter -= dt;

        if (p.cooldownCounter <= 0) {
          this.entity.trigger('attackEnd');
        }
      }

      // Try to find an attack target if we don't have a valid one.
      if (p.attackTarget === null || !p.attackTarget.has('combat') || p.attackTargetDistance > p.range) {
        p.attackTarget = this.entity.homing._findClosest(p.predicate);

        // Quit if we couldn't find one.
        if (p.attackTarget === null) {
          return;
        }

        var x = p.attackTarget.p.x - p.x;
        var y = p.attackTarget.p.y - p.y;
        p.attackTargetDistance = Math.sqrt(x*x + y*y);
      }

      // Start an attack if we can.
      if (p.attackTargetDistance <= p.range && p.cooldownCounter <= 0) {
        this.entity.play("striking_" + p.facing);
        this.entity.trigger('attackStart');
      }
    },

    attacked: function(dt) {
      var p = this.entity.p;

      if (p.attackTarget && p.attackTarget.takeDamage) {
        p.attackTarget.takeDamage(p.attack * (1.0 + (2*Math.random() - 1) * p.attackVariance));
      }

      // Set a cooldown to delay the next time we can attack again.
      p.cooldownCounter = p.cooldown * (1.0 + (2*Math.random() - 1) * p.cooldownVariance);
    },

    extend: {
      // Take the specified damage and update accordingly.
      takeDamage: function(dmg) {
        this.p.health -= dmg;

        if (this.p.health <= 0) {
          this.trigger('dead');
          this.play("dying_" + this.p.facing);
          this.del('combat');
          this.del('homing');
          this.del('2d');
          this.p.sensor = true;
        }
      }
    }
  });



  //
  // Animations
  //
  Q.animations('fighter', {
    idle_front: { frames: [0] },
    running_front: { frames: [1,0,2,0], rate: 1/3 },
    ready_front: { frames: [3] },
    striking_front: { frames: [3,4], rate: 1/6, next: 'withdrawing_front', trigger: 'attacked' },
    withdrawing_front: { frames: [4,3], rate: 1/6, next: 'ready_front' },
    dying_front: { frames: [5], rate: 1/3, next: 'dead_front' },
    dead_front: { frames: [6], },
    idle_left: { frames: [7] },
    running_left: { frames: [8,7,9,7], rate: 1/3 },
    ready_left: { frames: [10] },
    striking_left: { frames: [10,11], rate: 1/6, next: 'withdrawing_left', trigger: 'attacked' },
    withdrawing_left: { frames: [11,10], rate: 1/6, next: 'ready_left' },
    dying_left: { frames: [12], rate: 1/3, next: 'dead_left' },
    dead_left: { frames: [13], },
    idle_back: { frames: [14] },
    running_back: { frames: [15,14,16,14], rate: 1/3 },
    ready_back: { frames: [17] },
    striking_back: { frames: [17,18], rate: 1/6, next: 'withdrawing_back', trigger: 'attacked' },
    withdrawing_back: { frames: [18,17], rate: 1/6, next: 'ready_back' },
    dying_back: { frames: [19], rate: 1/3, next: 'dead_back' },
    dead_back: { frames: [20], },
    idle_right: { frames: [21] },
    running_right: { frames: [22,21,23,21], rate: 1/3 },
    ready_right: { frames: [24] },
    striking_right: { frames: [24,25], rate: 1/6, next: 'withdrawing_right', trigger: 'attacked' },
    withdrawing_right: { frames: [25,24], rate: 1/6, next: 'ready_right' },
    dying_right: { frames: [26], rate: 1/3, next: 'dead_right' },
    dead_right: { frames: [27], },
  });


  //
  // Sprites and other Game Objects
  //
  Q.Sprite.extend("Fighter",{
    init: function(props, defaultProps) {
      defaultProps.cx = 32;
      defaultProps.cy = 46;
      defaultProps.points = [[17,46],[31,38],[46,46],[32,52]];

      this._super(props, defaultProps);
      this.add("2d, animation, homing, combat");
      this.play("idle_" + this.p.facing);

      this.on('homingStarted', function(target) {
        this.play("running_" + this.p.facing);
      });

      this.on('homingEnded', function(target) {
        this.play("idle_" + this.p.facing);
      });

      this.on('attackStart', function(target, cost) {
      });

      this.on('attackEnd', function(target, cost) {
      });
    },

    step: function(dt) {
      this.p.z = this.p.health > 0 ? this.p.y : 0;

      // If we're dead, just stahp now. Staaahp.
      if (this.p.health <= 0) {
        return;
      }
    }
  });

  Q.Fighter.extend("Peasant",{
    init: function(p) {
      this._super(p, {
        sprite: 'fighter',
        sheet: 'peasant',
        team: "peasants",
        predicate: function(t) {
          return t.has('combat') && t.p.health > 0 && t.p.team === "sires";
        },
        facing: "back",
        health: 4,
        attack: 1
      });
    }
  });

  Q.Fighter.extend("Sire",{
    init: function(p) {
      this._super(p, {
        sprite: 'fighter',
        sheet: 'sire',
        team: "sires",
        predicate: function(t) {
          return t.has('combat') && t.p.health > 0 && t.p.team === "peasants";
        },
        facing: "front",
        health: 10,
        attack: 4,
        cooldown: 0.5
      });
    }
  });

  // Invisible object that spawns other entities.
  Q.Sprite.extend("Spawner", {
    init: function(spawnKey, p) {
      this._super(p, {
        // The number of entities in each wave.
        waveSize: 1,
        // The variance, in pixels, to apply randomly to each spawned entity.
        placementVariance: 50,
      });

      Q.input.on(spawnKey, this, "spawnWave");
    },

    spawnWave: function(dt) {
      for (var i = 0; i < this.p.waveSize; i++) {
        var x = this.p.x + (2*Math.random() - 1) * this.p.placementVariance;
        var y = this.p.y + (2*Math.random() - 1) * this.p.placementVariance;
        this.stage.insert(this.p.createNew(x, y));
      }
    }
  });


  //
  // Scenes
  //

  // The scene where the main actions happens.
  Q.scene("gameplay", function(stage) {
    // Insert a few dummy spawners for now.
    stage.insert(new Q.Spawner("spawnPeasants", {
      x: 60,
      y: 550,
      waveSize: 5,
      createNew: function(x, y) {
        return new Q.Peasant({ x: x, y: y});
      }
    }));

    stage.insert(new Q.Spawner("spawnSires", {
      x: 900,
      y: 100,
      createNew: function(x, y) {
        return new Q.Sire({ x: x, y: y});
      }
    }));

    // Draw the background image directly to the canvas.
    stage.on('prerender', function(ctx) {
      ctx.drawImage(Q.asset('background.png'), 0, 0);
    });
  });


  //
  // Putting it all together
  //

  // Load assets and fire things off.
  Q.load("background.png, peasant.png, peasant.json, sire.png, sire.json", function() {
    Q.compileSheets("peasant.png","peasant.json");
    Q.compileSheets("sire.png","sire.json");

    Q.stageScene("gameplay", { sort: true });
  });
});

