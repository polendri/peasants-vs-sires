window.addEventListener('load',function(e) {
  //
  // Instantiating and configuring Quintus.
  //
  var Q = Quintus({
    imagePath: "assets/images/",
    dataPath:  "assets/data/",
  })
  .include("Sprites, Scenes, Input, Anim, 2D, Touch, UI")
  .setup("quintusContainer")
  .touch();

  Q.input.keyboardControls({
    81: "peasantHelp",   // Q
    87: "peasantFight",  // W
    79: "sireHelp",      // O
    80: "sireFight"      // P
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
      speed: 30,
      // The entity's facing (front, left, back or right).
      facing: 'front',
      // The distance from a target at which homing will cease.
      stopDistance: 30,
      // The distance from a target at which homing should resume again.
      restartDistance: 35,
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
      range: 35,
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

  // Abstract Fighter class
  Q.Sprite.extend("Fighter",{
    init: function(props, defaultProps) {
      defaultProps.cx = 32;
      defaultProps.cy = 46;
      defaultProps.points = [[15,46],[31,36],[48,46],[32,50]];

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

      this.on('destroy', function() {
        this.destroy();
      });
    },

    step: function(dt) {
      this.p.z = this.p.y + (this.p.health > 0 ? 1000 : 0);

      // If we're dead, just stahp now. Staaahp.
      if (this.p.health <= 0) {
        return;
      }
    }
  });

  // Abstract Peasant class
  Q.Fighter.extend("PeasantBase", {
    init: function(props, defaultProps) {
        defaultProps.sprite = 'fighter';
        defaultProps.team = "peasants";
        defaultProps.predicate = function(t) {
          return t.has('combat') && t.p.health > 0 && t.p.team === "sires";
        };
        defaultProps.facing = "back";
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
        health: 4,
        attack: 1.5
      });
    }
  });

  Q.PeasantBase.extend("ArmedPeasant",{
    init: function(p) {
      this._super(p, {
        sheet: 'armed_peasant',
        health: 6,
        attack: 2
      });
    }
  });

  // Abstract Sire class
  Q.Fighter.extend("SireBase",{
    init: function(props, defaultProps) {
        defaultProps.sprite = 'fighter';
        defaultProps.team = "sires";
        defaultProps.predicate = function(t) {
          return t.has('combat') && t.p.health > 0 && t.p.team === "peasants";
        };
        defaultProps.facing = "front";
        this._super(props, defaultProps);
      }
  });

  Q.SireBase.extend("Knight",{
    init: function(p) {
      this._super(p, {
        sheet: 'knight',
        health: 10,
        attack: 4
      });
    }
  });

  Q.SireBase.extend("Lord",{
    init: function(p) {
      this._super(p, {
        sheet: 'lord',
        health: 15,
        attack: 6
      });
    }
  });

  Q.SireBase.extend("King",{
    init: function(p) {
      this._super(p, {
        sheet: 'king',
        health: 20,
        attack: 8
      });
    }
  });

  // Invisible object that spawns other entities.
  Q.Sprite.extend("Spawner", {
    init: function(p) {
      this._super(p, {
        // The number of entities in each wave.
        waveSize: 1,
        // The variance, in pixels, to apply randomly to each spawned entity.
        placementVariance: 50,
      });
    },

    spawnWave: function(spawnKey) {
      for (var i = 0; i < this.p.waveSize; i++) {
        var x = this.p.x + (2*Math.random() - 1) * this.p.placementVariance;
        var y = this.p.y + (2*Math.random() - 1) * this.p.placementVariance;
        this.stage.insert(this.p.spawnFuncs[spawnKey].call(x, y));
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
        enabled: true,
        asset: p.enabledAsset
      });
    },

    step: function(dt) {
      if (!this.p.enabled) {
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

  Q.Sprite.extend("TimelineItemBackground", {
    init: function(p) {
      this._super(p, {
        z: 0,
        cx: 0,
        cy: 0,
        asset: "timeline_item_background.png",
        direction: 'left',
        speed: 30,
        targetX: 0,
        targetReached: false,
        callback: function() { }
      });
    },

    step: function(dt) {
      if (this.p.targetReached) {
        return;
      }

      var i = this.p.direction === 'left' ? -1 : 1;
      this.p.x += i * this.p.speed * dt;

      if (this.p.x <= this.p.targetX) {
        this.p.targetReached = true;
        this.p.callback(this);
      }
    }
  });

  // Puts items on a timeline which move steadily towards the other end.
  Q.Sprite.extend("Timeline", {
    init: function(p) {
      this._super(p, {
        cx: 0,
        cy: 0,
        duration: 15,
        width: 747,
        direction: 'left',
      });
    },

    step: function(dt) {
    },

    addItem: function(itemSprite) {
      this.stage.insert(new Q.TimelineItemBackground({
        x: this.p.x + (this.p.direction === 'left' ? this.p.width - 1 : 0),
        y: this.p.y,
        direction: this.p.direction,
        speed: this.p.width / this.p.duration,
        targetX: this.p.x + (this.p.direction === 'left' ? 0 : this.p.width - 1),
        callback: function(item) {
          // TODO
          /*
          if (item.foregroundSprite) {
            item.foregroundSprite.destroy();
          }
          item.destroy();
          */
        }
      }));
    }
  });


  //
  // Scenes
  //

  Q.scene("mainMenu", function(stage) {
    var container = stage.insert(new Q.UI.Container({
      fill: "gray",
      border: 5,
      shadow: 10,
      shadowColor: "rgba(0,0,0,0.5)",
      x: Q.width / 2,
      y: Q.height / 2
    }));

    stage.insert(
      new Q.UI.Button(
        {
          label: "Play",
          x: 0,
          y: 0,
          fill: "#990000",
          border: 5,
          shadow: 10,
          shadowColor: "rgba(0,0,0,0.5)"
        },
        function() {
          Q.stageScene("gameplay", 0, { sort: true });
          Q.stageScene("gui", 1, { sort: true });
        }),
      container);

    container.fit(20,20);
  });

  // The scene where the main action happens.
  Q.scene("gameplay", function(stage) {
    stage.insert(new Q.Spawner({
        x: 60,
        y: 550,
        waveSize: 7,
        spawnFuncs: {
          poor_peasants: function(x, y) {
            return new Q.PoorPeasant({ x: x, y: y});
          },
          pitchfork_peasants: function(x, y) {
            return new Q.PitchforkPeasant({ x: x, y: y});
          },
          armed_peasants: function(x, y) {
            return new Q.ArmedPeasant({ x: x, y: y});
          }
        }
    }));
    stage.insert(new Q.Spawner({
        x: 60,
        y: 550,
        waveSize: 7,
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
    }));

    stage.on('prerender', function(ctx) {
      ctx.drawImage(Q.asset('background.png'), 0, 0);
    });
  });

  // The scene with the UI content for the gameplay scene.
  Q.scene("gui", function(stage) {
    var peasantHelpButton = new Q.ButtonIndicator({
        x: 6,
        y: 64,
        key: 'peasantHelp',
        disabledAsset: 'peasant_help_button_disabled.png',
        enabledAsset: 'peasant_help_button_enabled.png',
        pressedAsset: 'peasant_help_button_pressed.png',
    });
    var peasantFightButton = new Q.ButtonIndicator({
        x: 76,
        y: 64,
        key: 'peasantFight',
        disabledAsset: 'peasant_fight_button_disabled.png',
        enabledAsset: 'peasant_fight_button_enabled.png',
        pressedAsset: 'peasant_fight_button_pressed.png',
    });
    var sireHelpButton = new Q.ButtonIndicator({
        x: 927,
        y: 472,
        key: 'sireHelp',
        disabledAsset: 'sire_help_button_disabled.png',
        enabledAsset: 'sire_help_button_enabled.png',
        pressedAsset: 'sire_help_button_pressed.png',
    });
    var sireFightButton = new Q.ButtonIndicator({
        x: 997,
        y: 472,
        key: 'sireFight',
        disabledAsset: 'sire_fight_button_disabled.png',
        enabledAsset: 'sire_fight_button_enabled.png',
        pressedAsset: 'sire_fight_button_pressed.png',
    });
    stage.insert(peasantHelpButton);
    stage.insert(peasantFightButton);
    stage.insert(sireHelpButton);
    stage.insert(sireFightButton);

    var peasantTimeline = new Q.Timeline({
        x: 8,
        y: 8,
    });
    stage.insert(peasantTimeline);
    peasantTimeline.addItem();

    stage.on('prerender', function(ctx) {
      ctx.drawImage(Q.asset('gui.png'), 0, 0);
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
      "king.png, king.json",
    function() {
        Q.compileSheets("poor_peasant.png","poor_peasant.json");
        Q.compileSheets("pitchfork_peasant.png","pitchfork_peasant.json");
        Q.compileSheets("armed_peasant.png","armed_peasant.json");
        Q.compileSheets("knight.png","knight.json");
        Q.compileSheets("lord.png","lord.json");
        Q.compileSheets("king.png","king.json");

        Q.stageScene("mainMenu");
    });
});

