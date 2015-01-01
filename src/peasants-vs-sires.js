// Resets global game state.
function resetState(q) {
  q.state.reset({
    // Array of reinforcements available to the peasant player.
    availablePeasants: [],
    // Array of reinforcements available to the sire player.
    availableSires: [],
    // Queue of peasant types that need to be spawned.
    peasantSpawnQueue: [],
    // Queue of sire types that need to be spawned.
    sireSpawnQueue: [],
    // Count of the number of peasants who have died.
    peasantLosses: 0,
    // Count of the number of knights who have died.
    knightLosses: 0,
    // Count of the number of lords who have died.
    lordLosses: 0,
    // Count of the number of kings who have died.
    kingLosses: 0
  });
}

window.addEventListener('load',function(e) {
  //
  // Instantiating and configuring Quintus.
  //
  var Q = Quintus({
    audioPath: "assets/audio/",
    imagePath: "assets/images/",
    dataPath:  "assets/data/",
    audioSupported: ['mp3', 'wav']
  })
  .include("Sprites, Scenes, Input, Anim, 2D, Touch, UI, Audio")
  .setup("quintusContainer")
  .touch()
  .enableSound();

  Q.input.keyboardControls({
    32: "space",         // SPACE
    81: "peasantHelp",   // Q
    87: "peasantFight",  // W
    79: "sireHelp",      // O
    80: "sireFight"      // P
  });

  // Quintus enables platformer-style gravity by default on anything with the
  // '2d' component. If you ask me, the default should be no gravity, but we
  // have to set that ourselves.
  Q.gravityX = 0;
  Q.gravityY = 0;

  // Reset global game state.
  resetState(Q);

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
      p.retargetCountdown += p.retargetFreq;

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
      speed: 25,
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
      // Determines the frequency, in seconds, at which a new target is picked.
      retargetFreq: 1.0,
      // Counter used for determining when to look for a new target. Randomized
      // so as to average out the costly retargeting of many entities over time
      // rather than doing them all in the same frame.
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
      p.retargetCountdown = Math.random() * p.retargetFreq;
    },

    step: function(dt) {
      var p = this.entity.p;
      p.retargetCountdown -= dt;

      // Try to find a target if we don't have one, if it's dead, or if it's
      // just time to refresh.
      if (p.retargetCountdown <= 0
          && (p.target === null
            || !p.target.has('combat')
            || p.target.health <= 0
            || p.retargetCountdown <= 0)) {
        this._acquireTarget();

        p.homingActive = true;
      }

      // Quit if we failed to find one.
      if (p.target === null) {
        return;
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

      p.commitment -= dt;
    },

    // Override destroy() so that we reduce followerCount on the target if a
    // target was set.
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
      attackVariance: 0.25,
      // Attack cooldown time, in seconds.
      cooldown: 2,
      // Variance factor for the cooldown time.
      cooldownVariance: 0.25,
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
      }
    },

    // Handler called when we have successfully attacked the target.
    attacked: function(dt) {
      var p = this.entity.p;

      if (p.attackTarget && p.attackTarget.takeDamage) {
        Q.audio.play(p.strikeSound, 0.1);
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
          // Increment the appropriate global death counter.
          if (this.p.team === 'peasants') {
            Q.state.inc('peasantLosses', 1);
          }
          else if (this.p.team === 'sires' && this.p.sheet === 'knight') {
            Q.state.inc('knightLosses', 1);
          }
          else if (this.p.team === 'sires' && this.p.sheet === 'lord') {
            Q.state.inc('lordLosses', 1);
          }
          else if (this.p.team === 'sires' && this.p.sheet === 'king') {
            Q.state.inc('kingLosses', 1);
          }

          this.trigger('dead');
          this.play("dying_" + this.p.facing);
          Q.audio.play(this.p.deathSound, 0.1);
          this.del('combat');
          this.del('homing');
          this.del('2d');
          this.p.sensor = true;
        }
      }
    }
  });

  //
  // A component which runs a fighter off the edge of the screen. Used on
  // surviving fighters after a game has ended.
  //
  Q.component('runForward', {
    defaults: {
      // The entity's speed.
      speed: 25,
      // The direction it should run ('front' or 'back').
      direction: 'front'
    },

    added: function() {
      var p = this.entity.p;
      Q._defaults(p, this.defaults);
      this.entity.on('step', this, 'step');
      this.entity.play(p.direction === 'front' ? 'running_front' : 'running_back');
    },

    step: function(dt) {
      var p = this.entity.p;

      if (p.direction === 'front') {
        p.x -= dt * p.speed;
        p.y += dt * p.speed/2;
      }
      else if (p.direction === 'back') {
        p.x += dt * p.speed;
        p.y -= dt * p.speed/2;
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
    dead_front: { frames: [6,7,8], rate: 15, loop: false, trigger: 'destroy' },
    idle_left: { frames: [9] },
    running_left: { frames: [10,9,11,9], rate: 1/3 },
    ready_left: { frames: [12] },
    striking_left: { frames: [12,13], rate: 1/6, next: 'withdrawing_left', trigger: 'attacked' },
    withdrawing_left: { frames: [13,12], rate: 1/6, next: 'ready_left' },
    dying_left: { frames: [14], rate: 1/3, next: 'dead_left' },
    dead_left: { frames: [15,16,17], rate: 15, loop: false, trigger: 'destroy' },
    idle_back: { frames: [18] },
    running_back: { frames: [19,18,20,18], rate: 1/3 },
    ready_back: { frames: [21] },
    striking_back: { frames: [21,22], rate: 1/6, next: 'withdrawing_back', trigger: 'attacked' },
    withdrawing_back: { frames: [22,21], rate: 1/6, next: 'ready_back' },
    dying_back: { frames: [23], rate: 1/3, next: 'dead_back' },
    dead_back: { frames: [24,25,26], rate: 15, loop: false, trigger: 'destroy' },
    idle_right: { frames: [27] },
    running_right: { frames: [28,27,29,27], rate: 1/3 },
    ready_right: { frames: [30] },
    striking_right: { frames: [30,31], rate: 1/6, next: 'withdrawing_right', trigger: 'attacked' },
    withdrawing_right: { frames: [31,30], rate: 1/6, next: 'ready_right' },
    dying_right: { frames: [32], rate: 1/3, next: 'dead_right' },
    dead_right: { frames: [33,34,35], rate: 15, loop: false, trigger: 'destroy' },
  });


  //
  // Sprites and other Game Objects
  //

  // Abstract Fighter base class. Expects the 'sprite' and 'sheet' properties to be set by
  // the subclass, along with the 'homing' and 'combat' properties.
  Q.Sprite.extend("Fighter",{
    init: function(props, defaultProps) {
      defaultProps.cx = 32;
      defaultProps.cy = 46;
      defaultProps.points = [[19,45],[32,39],[44,46],[31,51]];

      this._super(props, defaultProps);
      this.add("2d, animation, homing, combat");
      this.play("idle_" + this.p.facing);

      this.on('homingStarted', function(target) {
        this.play("running_" + this.p.facing);
      });

      this.on('homingEnded', function(target) {
        this.play("idle_" + this.p.facing);
      });

      this.on('destroy', function() {
        this.destroy();
      });
    },

    step: function(dt) {
      // Set the z coordinate to the y coordinate so that sprites which are
      // further "in front" in the isometric perspective get drawn on top of
      // those further "behind" them.
      // We do the same thing with dead sprites, but we ensure that ALL dead
      // sprites get drawn under ALL live sprites.
      this.p.z = this.p.y + (this.p.health > 0 ? 1000000 : 0);

      // If we're dead, just stahp now. Staaahp.
      if (this.p.health <= 0) {
        return;
      }
    }
  });

  // Abstract Peasant base class. Expects the 'sheet', 'health' and 'attack'
  // properties to be set by the subclass.
  Q.Fighter.extend("PeasantBase", {
    init: function(props, defaultProps) {
        defaultProps.sprite = 'fighter';
        defaultProps.team = "peasants";
        defaultProps.predicate = function(t) {
          return t.has('combat') && t.p.health > 0 && t.p.team === "sires";
        };
        defaultProps.facing = "back";
        defaultProps.strikeSound = 'peasant_strike.mp3';
        defaultProps.deathSound = 'peasant_death.mp3';
        this._super(props, defaultProps);
      }
  });

  Q.PeasantBase.extend("PoorPeasant", {
    init: function(p) {
      this._super(p, {
        sheet: 'poor_peasant',
        health: 2,
        attack: 1
      });
    }
  });

  Q.PeasantBase.extend("PitchforkPeasant",{
    init: function(p) {
      this._super(p, {
        sheet: 'pitchfork_peasant',
        health: 3,
        attack: 1.5
      });
    }
  });

  Q.PeasantBase.extend("ArmedPeasant",{
    init: function(p) {
      this._super(p, {
        sheet: 'armed_peasant',
        health: 4,
        attack: 2
      });
    }
  });

  // Abstract Sire base class. Expects the 'sheet', 'health' and 'attack'
  // properties to be set by the subclass.
  Q.Fighter.extend("SireBase",{
    init: function(props, defaultProps) {
        defaultProps.sprite = 'fighter';
        defaultProps.team = "sires";
        defaultProps.cooldown = 1;
        defaultProps.predicate = function(t) {
          return t.has('combat') && t.p.health > 0 && t.p.team === "peasants";
        };
        defaultProps.facing = "front";
        defaultProps.strikeSound = 'sire_strike.mp3';
        defaultProps.deathSound = 'sire_death.mp3';
        this._super(props, defaultProps);
      }
  });

  Q.SireBase.extend("Knight",{
    init: function(p) {
      this._super(p, {
        sheet: 'knight',
        health: 36,
        attack: 2
      });
    }
  });

  Q.SireBase.extend("Lord",{
    init: function(p) {
      this._super(p, {
        sheet: 'lord',
        health: 54,
        attack: 3
      });
    }
  });

  Q.SireBase.extend("King",{
    init: function(p) {
      this._super(p, {
        sheet: 'king',
        health: 72,
        attack: 4
      });
    }
  });

  // Invisible object that spawns other entities. Expects the 'spawnFuncs'
  // property to be set to a hash of functions that each return a new entity to
  // be spawned.
  Q.Sprite.extend("Spawner", {
    init: function(p) {
      this._super(p, {
        // The number of entities in each wave.
        waveSize: 1,
        // The variance, in pixels, to apply randomly to each spawned entity.
        placementVariance: 50,
        // An optional sound resource to play each time a wave is spawned.
        spawnSound: null,
        // A hash of functions, each of which produces a new instance of a
        // sprite to spawn.
        spawnFuncs: {}
      });
    },

    // Spawns a new wave, using the function indicated by 'spawnKey' to
    // generate each entity.
    spawnWave: function(spawnKey) {
      if (this.p.spawnSound) {
        Q.audio.play(this.p.spawnSound);
      }

      for (var i = 0; i < this.p.waveSize; i++) {
        var x = this.p.x + (2*Math.random() - 1) * this.p.placementVariance;
        var y = this.p.y + (2*Math.random() - 1) * this.p.placementVariance;
        this.stage.insert(this.p.spawnFuncs[spawnKey](x, y));
      }
    }
  });

  // Sprite used to indicate whether a key is disabled, enabled, or pressed.
  // Expects subclasses to add 'disabledAsset', 'enabledAsset', and 'pressedAsset'
  // properties, along with a 'key' property specifying the key to track.
  Q.Sprite.extend("ButtonIndicator", {
    init: function(p) {
      this._super(p, {
        cx: 0,
        cy: 0,
        asset: p.enabledAsset,
        // Function that returns whether or not the button is enabled.
        enabledFunc: function() { return true; }
      });
    },

    step: function(dt) {
      if (!this.p.enabledFunc()) {
        this.p.asset = this.p.disabledAsset;
      }
      else if (Q.inputs[this.p.key]) {
        this.p.asset = this.p.pressedAsset;
      }
      else {
        this.p.asset = this.p.enabledAsset;
      }
    }
  });

  // An item on a reinforcements timeline, which moves gradually towards the
  // target end of the timeline.
  Q.Sprite.extend("TimelineItem", {
    init: function(stage, p) {
      this._super(p, {
        cx: 0,
        cy: 0,
        team: 'peasants',
        sprite: 'fighter',
        // The direction in which this item moves (left or right).
        direction: 'left',
        // The speed at which this item moves.
        speed: 25,
        // The target X-coordinate of the item.
        targetX: 0,
        // Whether or not the target has been reached.
        targetReached: false,
        // Optional sound to be played when the target has been reached.
        targetReachedSound: null
      });

      this.add("animation");
      this.play(this.p.direction === 'left' ? 'running_front' : 'running_left');
    },

    step: function(dt) {
      if (this.p.targetReached) {
        return;
      }

      var dx = this.p.speed * dt * (this.p.direction === 'left' ? -1 : 1);
      this.p.x += dx;

      var targetReached = this.p.direction === 'left'
        ? this.p.x <= this.p.targetX
        : this.p.x >= this.p.targetX;

      if (targetReached) {
        if (this.p.targetReachedSound) {
          Q.audio.play(this.p.targetReachedSound);
        }

        this.p.targetReached = true;
        this.p.x = this.p.targetX;
        this.play(this.p.direction === 'left' ? 'idle_front' : 'idle_left');

        // Add to the appropriate global list of reinforcements
        if (this.p.team === 'peasants') {
          Q.state.get('availablePeasants').push(this);
        }
        else if (this.p.team === 'sires') {
          Q.state.get('availableSires').push(this);
        }
      }
    },

    // Override 'draw' so we can draw a custom background behind the sprite.
    draw: function(ctx) {
      ctx.drawImage(Q.asset('timeline_item_background.png'), 14, 8);
      this._super(ctx);
    }
  });

  // Puts items on a timeline which move steadily towards the other end.
  Q.Sprite.extend("Timeline", {
    init: function(p) {
      this._super(p, {
        cx: 0,
        cy: 0,
        // The amount of time it takes for items to traverse the timeline.
        duration: 30,
        // The width of the timeline.
        width: 751,
        // The direction in which items travel on the timeline.
        direction: 'left',
        // A counter that decrements each time an item is added to the
        // timeline. This is used to set an ever-decreasing Z-coordinate to
        // each newly-spawned item, so that they stack correctly at the end of
        // the timeline.
        itemCounter: 0
      });
    },

    // Add an array of new items to the timeline. Each one will be spaced out
    // so they're visible; if you want to stack multiple items at the end of
    // the timeline, 'addItems' should be called for each item individually.
    // 'positionFactor' is an option parameter which should be a number between
    // 0 and 1, a scaling factor for how far on the timeline to place the new
    // items. For example, a 'positionFactor' of 0.5 means that items will be
    // placed at the halfway point of the timeline.
    addItems: function(itemNameArray, positionFactor) {
      for (var i = 0; i < itemNameArray.length; i++) {
        var itemName = itemNameArray[i];
        var speed = this.p.width / this.p.duration;

        if (!positionFactor) {
          positionFactor = 1.0;
        }

        this.stage.insert(new Q.TimelineItem(this.stage, {
          x: this.p.x - 14
            + (this.p.direction === 'left'
              ? positionFactor*(this.p.width - 1) - 40*i
              : (1-positionFactor)*(this.p.width - 1) + 40*i),
          y: this.p.y - 8,
          z: this.p.itemCounter,
          team: this.p.team,
          sheet: itemName,
          direction: this.p.direction,
          speed: speed,
          targetX: this.p.x - 14 + (this.p.direction === 'left' ? 0 : this.p.width - 1),
          targetReachedSound: this.p.team === 'peasants' ? "peasant_ready.mp3" : "sire_ready.mp3"
        }));

        this.p.itemCounter--;
      }
    }
  });

  // Manages adding items to the peasant and sire timelines.
  // It subclasses 'Sprite' because only Sprite defines the 'step' function.
  Q.Sprite.extend("TimelineManager", {
    // Returns a random peasant type.
    _randomPeasant: function() {
      var i = Math.floor(Math.random() * 3);
      if (i == 0) {
        return 'poor_peasant';
      } else if (i == 1) {
        return 'pitchfork_peasant';
      } else {
        return 'armed_peasant';
      }
    },

    // Returns a random sire type.
    _randomSire: function() {
      var i = Math.floor(Math.random() * 3);
      if (i == 0) {
        return 'knight';
      } else if (i == 1) {
        return 'lord';
      } else {
        return 'king';
      }
    },

    init: function(p) {
      this._super(p, {
        // A function that adds peasant items to a timeline.
        addPeasantItems: function(items) { },
        // A function that adds sire items to a timeline.
        addSireItems: function(items) { },
        // A function that spawns peasants on a battlefield.
        spawnPeasants: function(type) { },
        // A function that spawns a sire on a battlefield.
        spawnSire: function(type) { },
        // Frequency in seconds at which free reinforcements should be spawned.
        freeReinforcementFreq: 20,
        freeReinforcementCounter: 0
      });

      Q.input.on('peasantHelp', this, 'peasantHelp');
      Q.input.on('peasantFight', this, 'peasantFight');
      Q.input.on('sireHelp', this, 'sireHelp');
      Q.input.on('sireFight', this, 'sireFight');
    },

    step: function(dt) {
      this.p.freeReinforcementCounter += dt;

      // Add free reinforcements if it's time to do so.
      if (this.p.freeReinforcementCounter >= this.p.freeReinforcementFreq) {
        this.p.freeReinforcementCounter -= this.p.freeReinforcementFreq;

        this.p.addPeasantItems([this._randomPeasant()]);
        this.p.addSireItems([this._randomSire()]);
      }
    },

    // Handler for when the 'peasantHelp' button is pressed.
    // Checks the global list of available peasants and sends one for help if
    // there is one.
    peasantHelp: function() {
      var availablePeasants = Q.state.get('availablePeasants');

      if (availablePeasants.length > 0) {
        Q.audio.play("peasant_help.mp3");
        availablePeasants.shift().destroy();
        this.p.addPeasantItems([this._randomPeasant(), this._randomPeasant()]);
      }
    },

    // Handler for when the 'peasantFight' button is pressed.
    // Checks the global list of available peasants and sends one to fight if
    // there is one.
    peasantFight: function() {
      var availablePeasants = Q.state.get('availablePeasants');

      if (availablePeasants.length > 0) {
        var item = availablePeasants.shift();
        this.p.spawnPeasants(item.p.sheet);
        item.destroy();
      }
    },

    // Handler for when the 'sireHelp' button is pressed.
    // Checks the global list of available sires and sends one for help if
    // there is one.
    sireHelp: function() {
      var availableSires = Q.state.get('availableSires');

      if (availableSires.length > 0) {
        Q.audio.play("sire_help.mp3");
        availableSires.shift().destroy();
        this.p.addSireItems([this._randomSire(), this._randomSire()]);
      }
    },

    // Handler for when the 'sireFight' button is pressed.
    // Checks the global list of available sires and sends one to fight if
    // there is one.
    sireFight: function() {
      var availableSires = Q.state.get('availableSires');

      if (availableSires.length > 0) {
        var item = availableSires.shift();
        this.p.spawnSire(item.p.sheet);
        item.destroy();
      }
    }
  });

  // Manages spawning fighters on the battlefield.
  // It subclasses 'Sprite' because only Sprite defines the 'step' function.
  Q.Sprite.extend("SpawnerManager", {
    init: function(p) {
      this._super(p, {
        // Function that spawns a group of peasants on the battlefield.
        spawnPeasantsFunc: function(type) { },
        // Function that spawns a sire on the battlefield.
        spawnSireFunc: function(type) { }
      });
    },

    step: function(dt) {
      // Check the global peasant and sire queues and spawn fighters on the
      // battlefield if required.
      var peasantSpawnQueue = Q.state.get('peasantSpawnQueue');
      for (var i = 0; i < peasantSpawnQueue.length; i++) {
        this.p.spawnPeasantsFunc(peasantSpawnQueue.shift());
      }
      var sireSpawnQueue = Q.state.get('sireSpawnQueue');
      for (var i = 0; i < sireSpawnQueue.length; i++) {
        this.p.spawnSireFunc(sireSpawnQueue.shift());
      }
    }
  });

  // Manages spawning fighters on the battlefield, ensuring that there is
  // always at least one peasant and at least one sire on the battlefield.
  // It subclasses 'Sprite' because only Sprite defines the 'step' function.
  Q.SpawnerManager.extend("ContinuousSpawnerManager", {
    // Returns a random peasant type.
    _randomPeasant: function() {
      var i = Math.floor(Math.random() * 3);
      if (i == 0) {
        return 'poor_peasant';
      } else if (i == 1) {
        return 'pitchfork_peasant';
      } else {
        return 'armed_peasant';
      }
    },

    // Returns a random sire type.
    _randomSire: function() {
      var i = Math.floor(Math.random() * 3);
      if (i == 0) {
        return 'knight';
      } else if (i == 1) {
        return 'lord';
      } else {
        return 'king';
      }
    },

    step: function(dt) {
      var peasantCount = 0;
      Q.stage(0).each(function() {
        if (this.p.team && this.p.team === 'peasants' && this.p.health && this.p.health > 0) {
          peasantCount++;
        }
      });
      var sireCount = 0;
      Q.stage(0).each(function() {
        if (this.p.team && this.p.team === 'sires' && this.p.health && this.p.health > 0) {
          sireCount++;
        }
      });

      if (peasantCount <= 10) {
        this.p.spawnPeasantsFunc(this._randomPeasant());
      }
      if (sireCount <= 1) {
        this.p.spawnSireFunc(this._randomSire());
      }
    }
  });

  // Detects win conditions and stages the endgame scene.
  // It subclasses 'Sprite' because only Sprite defines the 'step' function.
  Q.Sprite.extend("WinConditionDetector", {
    // Stages the endgame popup scene for the appropriate winner.
    _endGame: function(winner) {
      Q.audio.stop();

      // Set the surviving fighters to run off the edge of the stage.
      Q.stage(0).each(function() {
        if (!this.p.team || !this.p.health || this.p.health < 0) {
          return;
        }

        if (this.p.team === 'peasants') {
          this.p.direction = 'back';
        }
        else if (this.p.team === 'sires') {
          this.p.direction = 'front';
        }

        this.del('homing');
        this.del('combat');
        this.add('runForward');
      });

      // Freeze the GUI stage.
      Q.stage(1).pause();

      Q.stageScene('endGame', 2, {
        winner: winner
      });
    },

    step: function(dt) {
      var peasantAlive = this.stage.detect(function() {
        return this.p.health && this.p.health > 0 && this.p.team && this.p.team === 'peasants';
      });
      var sireAlive = this.stage.detect(function() {
        return this.p.health && this.p.health > 0 && this.p.team && this.p.team === 'sires';
      });

      if (!peasantAlive) {
        this._endGame('sires');
      }
      else if (!sireAlive) {
        this._endGame('peasants');
      }
    }
  });


  //
  // Scenes
  //

  // Contains the main menu GUI content.
  Q.scene("mainMenu", function(stage) {
    Q.audio.play("title_theme.mp3", { loop: true });

    stage.insert(new Q.UI.Button(
      {
        asset: "play_button.png",
        x: Q.width/2,
        y: 500
      },
      function() {
        Q.audio.stop();
        Q.clearStages();
        Q.stageScene("battlefield", 0, { sort: true });
        Q.stageScene("battlefieldGUI", 1, { sort: true });
      }));

    // Draw the title art before each render.
    stage.on('prerender', function(ctx) {
      ctx.drawImage(Q.asset('main_menu.png'), 0, 0);
    });
  });

  // A scene for background battles taking place in menus.
  Q.scene("backgroundBattlefield", function(stage) {
    // Create peasant and sire spawners and add them to the stage.
    var peasantSpawner = new Q.Spawner({
        x: 500,
        y: 300,
        waveSize: 10,
        spawnSound: "peasant_spawn.mp3",
        spawnFuncs: {
          poor_peasant: function(x, y) {
            return new Q.PoorPeasant({ x: x, y: y});
          },
          pitchfork_peasant: function(x, y) {
            return new Q.PitchforkPeasant({ x: x, y: y});
          },
          armed_peasant: function(x, y) {
            return new Q.ArmedPeasant({ x: x, y: y});
          }
        }
    });
    stage.insert(peasantSpawner);
    var sireSpawner = new Q.Spawner({
        x: 580,
        y: 270,
        waveSize: 1,
        spawnSound: "sire_spawn.mp3",
        spawnFuncs: {
          knight: function(x, y) {
            return new Q.Knight({ x: x, y: y});
          },
          lord: function(x, y) {
            return new Q.Lord({ x: x, y: y});
          },
          king: function(x, y) {
            return new Q.King({ x: x, y: y});
          }
        }
    });
    stage.insert(sireSpawner);

    // Spawn an initial wave of middle-level fighters to start things off,
    // then move the spawners back to the normal positions.
    peasantSpawner.spawnWave('pitchfork_peasant');
    sireSpawner.spawnWave('lord');
    peasantSpawner.p.x = 100;
    peasantSpawner.p.y = 500;
    sireSpawner.p.x = 967;
    sireSpawner.p.y = 100;

    // Create a manager for the spawners and add it to the battlefield.
    var spawnerManager = new Q.ContinuousSpawnerManager({
      spawnPeasantsFunc: function(type) {
        peasantSpawner.spawnWave(type);
      },
      spawnSireFunc: function(type) {
        sireSpawner.spawnWave(type);
      }
    });
    stage.insert(spawnerManager);

    // Draw the background before each render.
    stage.on('prerender', function(ctx) {
      ctx.drawImage(Q.asset('background.png'), 0, 0);
    });
  });

  // The scene where the main action happens.
  Q.scene("battlefield", function(stage) {
    // Create peasant and sire spawners and add them to the stage.
    var peasantSpawner = new Q.Spawner({
        x: 100,
        y: 500,
        waveSize: 10,
        spawnSound: "peasant_spawn.mp3",
        spawnFuncs: {
          poor_peasant: function(x, y) {
            return new Q.PoorPeasant({ x: x, y: y});
          },
          pitchfork_peasant: function(x, y) {
            return new Q.PitchforkPeasant({ x: x, y: y});
          },
          armed_peasant: function(x, y) {
            return new Q.ArmedPeasant({ x: x, y: y});
          }
        }
    });
    stage.insert(peasantSpawner);
    var sireSpawner = new Q.Spawner({
        x: 967,
        y: 100,
        waveSize: 1,
        spawnSound: "sire_spawn.mp3",
        spawnFuncs: {
          knight: function(x, y) {
            return new Q.Knight({ x: x, y: y});
          },
          lord: function(x, y) {
            return new Q.Lord({ x: x, y: y});
          },
          king: function(x, y) {
            return new Q.King({ x: x, y: y});
          }
        }
    });
    stage.insert(sireSpawner);

    // Create a manager for the spawners and add it to the battlefield.
    var spawnerManager = new Q.SpawnerManager({
      spawnPeasantsFunc: function(type) {
        peasantSpawner.spawnWave(type);
      },
      spawnSireFunc: function(type) {
        sireSpawner.spawnWave(type);
      }
    });
    stage.insert(spawnerManager);

    // Spawn an initial wave of middle-level fighters to start things off.
    peasantSpawner.spawnWave('pitchfork_peasant');
    sireSpawner.spawnWave('lord');

    // Create the entity that does win condition detection.
    stage.insert(new Q.WinConditionDetector());

    // Draw the background before each render.
    stage.on('prerender', function(ctx) {
      ctx.drawImage(Q.asset('background.png'), 0, 0);
    });
  });

  // The scene with the UI content for the battlefield scene.
  Q.scene("battlefieldGUI", function(stage) {
    // Create indicators for each of the buttons and add them to the stage.
    var peasantHelpButton = new Q.ButtonIndicator({
        x: 6,
        y: 64,
        key: 'peasantHelp',
        disabledAsset: 'peasant_help_button_disabled.png',
        enabledAsset: 'peasant_help_button_enabled.png',
        pressedAsset: 'peasant_help_button_pressed.png',
        enabledFunc: function() {
          return Q.state.get('availablePeasants').length > 0;
        }
    });
    var peasantFightButton = new Q.ButtonIndicator({
        x: 76,
        y: 64,
        key: 'peasantFight',
        disabledAsset: 'peasant_fight_button_disabled.png',
        enabledAsset: 'peasant_fight_button_enabled.png',
        pressedAsset: 'peasant_fight_button_pressed.png',
        enabledFunc: function() {
          return Q.state.get('availablePeasants').length > 0;
        }
    });
    var sireHelpButton = new Q.ButtonIndicator({
        x: 927,
        y: 472,
        key: 'sireHelp',
        disabledAsset: 'sire_help_button_disabled.png',
        enabledAsset: 'sire_help_button_enabled.png',
        pressedAsset: 'sire_help_button_pressed.png',
        enabledFunc: function() {
          return Q.state.get('availableSires').length > 0;
        }
    });
    var sireFightButton = new Q.ButtonIndicator({
        x: 997,
        y: 472,
        key: 'sireFight',
        disabledAsset: 'sire_fight_button_disabled.png',
        enabledAsset: 'sire_fight_button_enabled.png',
        pressedAsset: 'sire_fight_button_pressed.png',
        enabledFunc: function() {
          return Q.state.get('availableSires').length > 0;
        }
    });
    stage.insert(peasantHelpButton);
    stage.insert(peasantFightButton);
    stage.insert(sireHelpButton);
    stage.insert(sireFightButton);

    // Create the reinforcement timelines and add them to the stage.
    var peasantTimeline = new Q.Timeline({
        x: 8,
        y: 8,
        direction: 'left',
        team: 'peasants'
    });
    stage.insert(peasantTimeline);
    var sireTimeline = new Q.Timeline({
        x: 273,
        y: 544,
        direction: 'right',
        team: 'sires'
    });
    stage.insert(sireTimeline);

    // Create the reinforcement timeline manager and add it to the stage.
    var timelineManager = new Q.TimelineManager({
      addPeasantItems: function(items) {
        peasantTimeline.addItems(items);
      },
      addSireItems: function(items) {
        sireTimeline.addItems(items)
      },
      spawnPeasants: function(type) {
        Q.state.get('peasantSpawnQueue').push(type);
      },
      spawnSire: function(type) {
        Q.state.get('sireSpawnQueue').push(type);
      },
    });
    stage.insert(timelineManager);

    // Add some items to the timelines to start things off.
    peasantTimeline.addItems(['pitchfork_peasant'], 0.1);
    peasantTimeline.addItems(['pitchfork_peasant'], 0.55);
    peasantTimeline.addItems(['pitchfork_peasant']);
    sireTimeline.addItems(['lord'], 0.1);
    sireTimeline.addItems(['lord'], 0.55);
    sireTimeline.addItems(['lord']);

    // Draw the GUI before each render.
    stage.on('prerender', function(ctx) {
      ctx.drawImage(Q.asset('gui.png'), 0, 0);
    });
  });

  // The scene displayed at the end of the game.
  Q.scene("endGame", function(stage) {
    Q.audio.play("victory.mp3");

    stage.insert(new Q.Sprite({
      asset: "endgame_popup_background.png",
      x: Q.width / 2,
      y: 440
    }));

    if (stage.options.winner === 'peasants') {
      var cost = Q.state.get('peasantLosses') + " lives";
    }
    else if (stage.options.winner === 'sires') {
      var cost = (10*Q.state.get('knightLosses')
        + 100*Q.state.get('lordLosses')
        + 1000*Q.state.get('kingLosses'))
        + " gold coins";
    }

    stage.insert(new Q.UI.Text({ 
      label: "The " + stage.options.winner + " are victorious!",
      color: "black",
      size: 16,
      x: Q.width / 2,
      y: 405
    }));
    stage.insert(new Q.UI.Text({ 
      label: "Cost of victory: " + cost,
      color: "black",
      size: 16,
      x: Q.width / 2,
      y: 430
    }));
    stage.insert(new Q.UI.Text({ 
      label: "Press SPACE to play again.",
      color: "black",
      size: 16,
      x: Q.width / 2,
      y: 480
    }));

    Q.input.on('space', function() {
      resetState(Q);
      Q.clearStages();
      Q.stageScene("battlefield", 0, { sort: true });
      Q.stageScene("battlefieldGUI", 1, { sort: true });
    });
  });


  //
  // Putting it all together
  //

  // Load assets and fire things off.
  Q.load(
    "background.png, " +
      "gui.png, " +
      "peasant_help_button_disabled.png, peasant_help_button_enabled.png, peasant_help_button_pressed.png, " +
      "peasant_fight_button_disabled.png, peasant_fight_button_enabled.png, peasant_fight_button_pressed.png, " +
      "sire_help_button_disabled.png, sire_help_button_enabled.png, sire_help_button_pressed.png, " +
      "sire_fight_button_disabled.png, sire_fight_button_enabled.png, sire_fight_button_pressed.png, " +
      "timeline_item_background.png, " +
      "poor_peasant.png, poor_peasant.json, " +
      "pitchfork_peasant.png, pitchfork_peasant.json, " +
      "armed_peasant.png, armed_peasant.json, " +
      "knight.png, knight.json, " +
      "lord.png, lord.json, " +
      "king.png, king.json, " +
      "main_menu.png, " +
      "play_button.png, " +
      "endgame_popup_background.png, " +
      "title_theme.mp3, victory.mp3, " +
      "peasant_ready.mp3, peasant_help.mp3, peasant_spawn.mp3, peasant_strike.mp3, peasant_death.mp3, " +
      "sire_ready.mp3, sire_help.mp3, sire_spawn.mp3, sire_strike.mp3, sire_death.mp3",
    function() {
        Q.compileSheets("poor_peasant.png","poor_peasant.json");
        Q.compileSheets("pitchfork_peasant.png","pitchfork_peasant.json");
        Q.compileSheets("armed_peasant.png","armed_peasant.json");
        Q.compileSheets("knight.png","knight.json");
        Q.compileSheets("lord.png","lord.json");
        Q.compileSheets("king.png","king.json");

        Q.stageScene("backgroundBattlefield", 0, { sort: true });
        Q.stageScene("mainMenu", 1);
    });
});

