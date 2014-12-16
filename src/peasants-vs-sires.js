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
  .controls()
  .touch();

  Q.gravityX = 0;
  Q.gravityY = 0;


  //
  // A component for pathfinding.
  // TODO: Maybe a better location to put this?
  //
  Q.component('pathfinding', {
    defaults: {
      // The pathfinding target (either a Sprite or an [x,y] array).
      target: null,
      // The entity's movement speed.
      speed: 30,
      // The entity's facing (front, left, back or right).
      facing: 'front',
      // The maximum distance we would like to be from the target. Pathfinding
      // will cease whenever we are at least this close to the target.
      targetDistance: 20,
      // Isometric coordinates of the entity.
      isoCoords: null,
      // Isometric coordinates of the movement target.
      targetIsoCoords: null,
      // True when the target has been reached.
      targetReached: true,
      // The distance which must be travelled in the current direction
      // before the direction can be changed. This is used to prevent
      // stuttery diagonal movement, by making entities commit to larger
      // straight lines of movement.
      commitDistance: 0
    },

    added: function() {
      var p = this.entity.p;
      Q._defaults(p, this.defaults);
      this.entity.on('step', this, 'step');
    },

    // Updates the isometric coordinates of the entity and its target.
    _updateIsoCoords: function() {
      var p = this.entity.p;
      p.isoCoords = [0.8660*p.x - 0.5*p.y, 0.5*p.x + 0.8660*p.y];

      if(p.target === null) {
        p.targetIsoCoords = null;
        return;
      }
      else if(Array.isArray(p.target)) {
        var targetX = p.target[0];
        var targetY = p.target[1];
      }
      else {
        var targetX = p.target.p.x;
        var targetY = p.target.p.y;
      }

      // Get the X and Y coordinates translated to the isometric plane
      // (i.e. a 30 degree rotation of the screen coordinates). Movement is
      // only in the isometric directions so computing this helps us figure out
      // which direction to move in.
      var targetIsoX = 0.8660*targetX - 0.5*targetY;
      var targetIsoY = 0.5*targetX + 0.8660*targetY;
      var diffX = targetIsoX - p.isoCoords[0];
      var diffY = targetIsoY - p.isoCoords[1];

      // Adjust the target so that we actually move to be orthogonally beside
      // the target. We pick the orthogonal side that is closest.
      if (Math.abs(diffX) > Math.abs(diffY)) {
        if (diffX > 0) {
          targetIsoX = targetIsoX - p.targetDistance;
          targetIsoY = targetIsoY;
        }
        else {
          targetIsoX = targetIsoX + p.targetDistance;
          targetIsoY = targetIsoY;
        }
      }
      else {
        if (diffY > 0) {
          targetIsoX = targetIsoX;
          targetIsoY = targetIsoY - p.targetDistance;
        }
        else {
          targetIsoX = targetIsoX;
          targetIsoY = targetIsoY + p.targetDistance;
        }
      }

      p.targetIsoCoords = [targetIsoX, targetIsoY];
    },

    // Choose which direction to face in order to move toward the target.
    _chooseFacing: function() {
      var p = this.entity.p;

      // If there's no target, or if we've committed to keep moving forward,
      // there is nothing to do.
      if (p.targetIsoCoords === null || this.commitDistance > 0) {
        return;
      }

      var diffX = p.targetIsoCoords[0] - p.isoCoords[0];
      var diffY = p.targetIsoCoords[1] - p.isoCoords[1];

      var coordDiff = Math.abs(diffX) - Math.abs(diffY);

      // If we're very close to diagonal movement, start making movement
      // commitments to avoid stuttery movement.
      if (Math.abs(coordDiff) < p.speed/15) {
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
      this._chooseFacing();
      p.commitDistance = 0;

      this.entity.trigger('targetReached', p.target);
    },

    step: function(dt) {
      var p = this.entity.p;
      this._updateIsoCoords();

      // Nothing to do if there is no target.
      if(p.targetIsoCoords === null) {
        return;
      }

      var diffX = p.targetIsoCoords[0] - p.isoCoords[0];
      var diffY = p.targetIsoCoords[1] - p.isoCoords[1];

      // If we're acceptably close to the target, we don't bother to pathfind
      // again.
      var distance = Math.sqrt(diffX*diffX + diffY*diffY);
      if(distance <= p.speed/5) {
        if (!p.targetReached) {
          this._onTargetReached();
        }

        return;
      }

      // If we're committed to movement, we decrease the commitment by the
      // amount that we're about to move.
      if (this.commitDistance > 0) {
        this.commitDistance -= dt * p.speed;
      }
      // Otherwise we determine a new facing.
      else {
        this._chooseFacing();
      }

      // Apply the movement in the desired direction.
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

      this.entity.play("running_" + p.facing);
    },

    // Find the closest other entity on the specified team.
    findClosestByTeam: function(team) {
      var stage = Q.stages[Q.activeStage];
      var closestEnemy = null;
      var closestDistance = null;

      for(var i = 0; i < stage.items.length; i++) {
        var target = stage.items[i];

        if(target.p.team !== team || target === this.entity) {
          continue;
        }

        var x = target.x - this.entity.x;
        var y = target.y - this.entity.y;
        var targetDistance = Math.sqrt(x*x + y*y);

        if(closestEnemy === null) {
          closestEnemy = target;
          closestDistance = targetDistance;
          continue;
        }

        if(targetDistance < closestDistance) {
          closestEnemy = target;
          closestDistance = targetDistance;
        }
      }

      return closestEnemy;
    },

    // Finds the closest enemy entity.
    findClosestEnemy: function() {
      if(this.entity.p.team === "peasants") {
        return this.findClosestByTeam("sires");
      }
      else if(this.entity.p.team === "sires") {
        return this.findClosestByTeam("peasants");
      }
    },

    extend: {
      // Sets a new pathfinding target.
      setTarget: function(target) {
        this.p.target = target;
        this.p.targetReached = false;
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
  // Sprites
  //
  Q.Sprite.extend("Fighter",{
    init: function(props, defaultProps) {
      defaultProps.cx = 32;
      defaultProps.cy = 46;
      defaultProps.points = [[18,46],[31,39],[45,46],[32,52]];
      defaultProps.retargetFreq = 60;
      defaultProps.retargetCounter = Math.floor(Math.random() * defaultProps.retargetFreq);

      this._super(props, defaultProps);
      this.add("2d, animation, pathfinding");

      this.on('targetReached', function() {
        this.play("idle_" + this.p.facing);
      });
    },

    step: function(dt) {
      this.p.z = this.p.y;

      if (++this.p.retargetCounter === this.p.retargetFreq) {
        this.setTarget(this.pathfinding.findClosestEnemy());
        this.p.retargetCounter = 0;
      }
    }
  });

  Q.Fighter.extend("Peasant",{
    init: function(p) {
      this._super(p, {
        sprite: 'fighter',
        sheet: 'peasant',
        team: "peasants",
      });
      this.play('idle_back');
    }
  });

  Q.Fighter.extend("Sire",{
    init: function(p) {
      this._super(p, {
        sprite: 'fighter',
        sheet: 'peasant',
        team: "sires",
      });
      this.play('idle_front');
    }
  });


  //
  // Scenes
  //

  // The scene where the main actions happens.
  Q.scene("gameplay", function(stage) {
    // Insert a few dummy entities for now.
    var peasant = stage.insert(new Q.Peasant({ x: 400, y: 450 }));
    var sire = stage.insert(new Q.Sire({ x: 600, y: 150 }));

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

