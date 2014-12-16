window.addEventListener('load',function(e) {
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

  Q.component('pathfinding', {
    defaults: {
      target: null,
      speed: 30,
      facing: 'front',
      targetReachedDistance: null
    },

    added: function() {
      var p = this.entity.p;
      Q._defaults(p, this.defaults);
      this.entity.on('step', this, 'step');
      this.entity.on("bump.top,bump.bottom,bump.left,bump.right", this, 'bump');
    },

    step: function(dt) {
      var p = this.entity.p;

      if(p.target === null) {
        this.entity.play("idle_" + p.facing);
        return;
      }

      if(Array.isArray(p.target)) {
        var x = p.target[0] - p.x;
        var y = p.target[1] - p.y;
      }
      else {
        var x = p.target.p.x - p.x;
        var y = p.target.p.y - p.y;
      }

      if (p.targetReachedDistance !== null) {
        var distance = Math.sqrt(x*x + y*y);

        if(distance >= p.targetReachedDistance) {
          return;
        }
      }

      var isoX = 0.8660*x - 0.5*y;
      var isoY = 0.5*x + 0.8660*y;

      if(Math.abs(isoX) > Math.abs(isoY)) {
        p.facing = isoX < 0 ? 'front' : 'back';
      }
      else {
        p.facing = isoY > 0 ? 'left' : 'right';
      }

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

    bump: function(col) {
      var p = this.entity.p;

      if (col.obj === p.target) {
        var x = col.obj.p.x - p.x;
        var y = col.obj.p.y - p.y;
        p.targetReachedDistance = Math.sqrt(x*x + y*y);
        this.entity.trigger('targetReached', p.target);
      }
    },

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

    findClosestEnemy: function() {
      if(this.entity.p.team === "peasants") {
        return this.findClosestByTeam("sires");
      }
      else if(this.entity.p.team === "sires") {
        return this.findClosestByTeam("peasants");
      }
    },

    extend: {
      setTarget: function(target) {
        this.p.target = target;
        this.p.targetReachedDistance = null;
      }
    }
  });

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
    }
  });

  Q.Fighter.extend("Sire",{
    init: function(p) {
      this._super(p, {
        sprite: 'fighter',
        sheet: 'peasant',
        team: "sires",
      });
    }
  });

  Q.scene("gameplay", function(stage) {          
    var peasant = stage.insert(new Q.Peasant({ x: 40, y: 550 }));
    var sire = stage.insert(new Q.Sire({ x: 1000, y: 50 }));

    stage.on('prerender', function(ctx) {
      ctx.drawImage(Q.asset('background.png'), 0, 0);
    });
  });

  Q.load("background.png, peasant.png, peasant.json", function() {
    Q.compileSheets("peasant.png","peasant.json");

    Q.stageScene("gameplay", { sort: true });
  });
});

