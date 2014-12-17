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
  // A component for pathfinding. If a target is set, at every frame it will
  // determine in which isometric direction the entity should move to aproach
  // the target.
  // TODO: Maybe a better location to put these components?
  //
  Q.component('pathfinding', {
    defaults: {
      // The pathfinding target (either a Sprite or an [x,y] array).
      target: null,
      // The entity's movement speed.
      speed: 30,
      // The entity's facing (front, left, back or right).
      facing: 'front',
      // The distance from the target at which point we consider to have
      // reached it. Pathfinding will cease whenever we are at least this
      // close to the target.
      goalDistance: 30,
      // The distance from the target at which, after having already reached
      // it, we should begin to pursue it again. This should be greater than
      // or equal to 'goalDistance'.
      pursuitDistance: 40,
      // Whether or not the target has been reached.
      targetReached: false,
      // The distance which must be travelled in the current direction
      // before the direction can be changed. This is used to prevent
      // stuttery diagonal movement, by making entities commit to larger
      // straight lines of movement.
      commitDistance: 0,
      // Isometric coordinates of the entity.
      isoCoords: null,
      // Isometric coordinates of the movement target.
      targetIsoCoords: null,
      // Isometric coordinates of an orthogonally-adjacent point to the target
      // that is within 'goalDistance' of the target.
      adjacentIsoCoords: null,
      // The distance to the target.
      targetDistance: null,
      // The distance to the orthogonally-adjacent point.
      adjacentDistance: null
    },

    added: function() {
      var p = this.entity.p;
      Q._defaults(p, this.defaults);
      this.entity.on('step', this, 'step');
    },

    // Updates coordinate and distance values for the target.
    _updateCoords: function() {
      var p = this.entity.p;
      p.isoCoords = [0.8660*p.x - 0.5*p.y, 0.5*p.x + 0.8660*p.y];

      if (p.target === null) {
        p.targetIsoCoords = null;
        p.adjacentIsoCoords = null;
        p.targetDistance = null;
        p.adjacentDistance = null;
        p.targetReached = false;
        this.entity.play("idle_" + p.facing);
        return;
      }
      else if (Array.isArray(p.target)) {
        var targetX = p.target[0];
        var targetY = p.target[1];
      }
      else {
        var targetX = p.target.p.x;
        var targetY = p.target.p.y;
      }

      var diffX = targetX - p.x;
      var diffY = targetY - p.y;
      p.targetDistance = Math.sqrt(diffX*diffX + diffY*diffY);

      // Get the X and Y coordinates translated to the isometric plane
      // (i.e. a -pi/6 radian rotation of the screen coordinates). Movement is
      // only in the isometric directions so computing this helps us figure out
      // which direction to move in.
      var targetIsoX = 0.8660*targetX - 0.5*targetY;
      var targetIsoY = 0.5*targetX + 0.8660*targetY;
      p.targetIsoCoords = [targetIsoX, targetIsoY];

      // We don't want to end up diagonal to the target, so often we actually
      // want to navigate towards a point that is orthogonal to the target. We
      // pick the closest point that is 'goalDistance' away from the target
      // and orthogonal to it.
      if (Math.abs(diffX) > Math.abs(diffY)) {
        if (diffX > 0) {
          var adjacentIsoX = targetIsoX - p.goalDistance;
          var adjacentIsoY = targetIsoY;
        }
        else {
          var adjacentIsoX = targetIsoX + p.goalDistance;
          var adjacentIsoY = targetIsoY;
        }
      }
      else {
        if (diffY > 0) {
          var adjacentIsoX = targetIsoX;
          var adjacentIsoY = targetIsoY - p.goalDistance;
        }
        else {
          var adjacentIsoX = targetIsoX;
          var adjacentIsoY = targetIsoY + p.goalDistance;
        }
      }

      p.adjacentIsoCoords = [adjacentIsoX, adjacentIsoY];
      diffX = p.adjacentIsoCoords[0] - p.isoCoords[0];
      diffY = p.adjacentIsoCoords[1] - p.isoCoords[1];
      p.adjacentDistance = Math.sqrt(diffX*diffX + diffY*diffY);
    },

    // Choose which direction to face in order to move toward the specified
    // coordinates.
    _chooseFacing: function(isoCoords) {
      var p = this.entity.p;

      // If there's no target, or if we've committed to keep moving forward,
      // there is nothing to do.
      if (isoCoords === null || this.commitDistance > 0) {
        return;
      }

      var diffX = isoCoords[0] - p.isoCoords[0];
      var diffY = isoCoords[1] - p.isoCoords[1];

      var coordDiff = Math.abs(diffX) - Math.abs(diffY);

      // If we're very close to diagonal movement, start making movement
      // commitments to avoid stuttery movement.
      if (!p.busy && Math.abs(coordDiff) < p.speed/15) {
        this.commitDistance = p.speed/6;
      }

      // Pick the direction that gets us closest to the target.
      if (coordDiff > 0) {
        p.facing = diffX < 0 ? 'front' : 'back';
      }
      else {
        p.facing = diffY > 0 ? 'left' : 'right';
      }
    },

    // Function to be called when the target has first been reached.
    _onTargetReached: function() {
      var p = this.entity.p;
      p.targetReached = true;

      // We may have bumped into them while not moving directly toward them,
      // so we set the facing one last time to make sure we're pointing at
      // the target, cancelling out any movement commitment that may have
      // applied.
      p.commitDistance = 0;
      this._chooseFacing(p.targetIsoCoords);
      p.commitDistance = 0;

      this.entity.trigger('targetReached', p.target);
    },

    step: function(dt) {
      var p = this.entity.p;

      // Nothing to do if there is no target.
      if (p.target === null) {
        this.entity.play("idle_" + p.facing);
        return;
      }

      this._updateCoords();

      // If we're acceptably close to the point that's adjacent to the target,
      // we call it success and stop pathfinding.
      if (p.adjacentDistance <= p.speed/5) {
        if (!p.targetReached) {
          this._onTargetReached();
        }

        return;
      }

      this._chooseFacing(p.adjacentIsoCoords);

      // If we've reached the target already, there is nothing to do unless the
      // target has moved outside of 'pursuitDistance'.
      if (p.targetReached) {
        if (p.targetDistance < p.pursuitDistance) {
          return;
        }
        else {
          p.targetReached = false;
          this.entity.trigger('targetLost', p.target);
        }
      }

      // Apply the movement in the desired direction if required.
      if (!p.busy) {
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

        // If we're committed to movement, we decrease the commitment by the
        // amount that we just moved.
        if (this.commitDistance > 0) {
          this.commitDistance -= dt * p.speed;
        }

        this.entity.play("running_" + p.facing);
      }
    },

    // Find the closest other entity which satisfies the provided predicate.
    findClosest: function(predicate) {
      var stage = Q.stages[Q.activeStage];
      var closest = null;
      var closestDistance = null;

      for (var i = 0; i < stage.items.length; i++) {
        var target = stage.items[i];

        if (!predicate(target) || target === this.entity) {
          continue;
        }

        var x = target.x - this.entity.x;
        var y = target.y - this.entity.y;
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

    // Finds the closest enemy entity.
    findClosestEnemy: function() {
      if (this.entity.p.team === "peasants") {
        return this.findClosest(function(t) {
          return t.has('combat') && t.p.health > 0 && t.p.team === "sires";
        });
      }
      else if (this.entity.p.team === "sires") {
        return this.findClosest(function(t) {
          return t.has('combat') && t.p.health > 0 && t.p.team === "peasants";
        });
      }
    },

    extend: {
      // Sets a new pathfinding target.
      setTarget: function(target) {
        if (this.p.target !== target) {
          this.p.targetReached = false;
        }

        this.p.target = target;
      }
    }
  });


  //
  // A component for combat. Depends on the pathfinding component.
  //
  Q.component('combat', {
    defaults: {
      // The target of the attack. Set when an attack starts so that even if
      // the target itself is changed in the middle of an attack, the original
      // target takes the damage.
      attackTarget: null,
      // The entity's health.
      health: 10,
      // The entity's attack range.
      range: 40,
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
      cooldownCounter: 0
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

      // If no entity target is set, there is nothing to do.
      if (p.target === null || typeof p.target !== 'object') {
        this.entity.play("idle_" + p.facing);
        return;
      }

      // Start an attack if we're not already attacking, we're in range,
      // we've reached our target (i.e. we're not moving around anymore),
      // and we've cooled down.
      if (p.attackTarget === null && p.targetDistance <= p.range && p.targetReached && p.cooldownCounter <= 0) {
        p.attackTarget = p.target;
        this.entity.play("striking_" + p.facing);
        this.entity.trigger('attackStart');
      }
    },

    attacked: function(dt) {
      var p = this.entity.p;

      if (p.attackTarget.takeDamage) {
        p.attackTarget.takeDamage(p.attack * (1.0 + (2*Math.random() - 1) * p.attackVariance));
      }

      p.attackTarget = null;

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
          this.del('pathfinding');
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
      defaultProps.points = [[18,46],[31,39],[45,46],[32,52]];

      // Frequency (in seconds) at which we check for a new target.
      defaultProps.retargetFreq = 0.25;
      // Counter for knowing when to look for a new target. We start it
      // off randomly so that retargeting averages out across all the fighters,
      // to avoid stuttering caused by doing costly targeting calculations for
      // all fighters in a single step.
      defaultProps.retargetCounter = Math.random() * defaultProps.retargetFreq;

      this._super(props, defaultProps);
      this.add("2d, animation, pathfinding, combat");
      this.play("idle_" + this.p.facing);

      this.on('targetReached', function(target) {
        if (!this.p.busy) {
          if (typeof target === 'object') {
            this.play("ready_" + this.p.facing);
          }
          // Otherwise chill
          else {
            this.play("idle_" + this.p.facing);
          }
        }
      });

      this.on('targetLost', function(target) {
      });

      this.on('attackStart', function(target, cost) {
        this.p.busy = true;
      });

      this.on('attackEnd', function(target, cost) {
        this.p.busy = false;
      });
    },

    step: function(dt) {
      this.p.z = this.p.health > 0 ? this.p.y : 0;

      // If we're dead, just stahp now. Staaahp.
      if (this.p.health <= 0) {
        return;
      }

      this.p.retargetCounter -= dt;

      if (this.p.retargetCounter <= 0) {
        this.setTarget(this.pathfinding.findClosestEnemy());
        this.p.retargetCounter += this.p.retargetFreq;
      }
    }
  });

  Q.Fighter.extend("Peasant",{
    init: function(p) {
      this._super(p, {
        sprite: 'fighter',
        sheet: 'peasant',
        team: "peasants",
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
        sheet: 'peasant',
        team: "sires",
        facing: "front",
        health: 15,
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
  Q.load("background.png, peasant.png, peasant.json", function() {
    Q.compileSheets("peasant.png","peasant.json");

    Q.stageScene("gameplay", { sort: true });
  });
});

