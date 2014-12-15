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

  Q.Sprite.extend("Peasant",{
    init: function(p) {
      this._super(p, {
        sheet: "peasant",
      });
      this.add('2d');
    },
    step: function(dt) {
    }                    
  });

  Q.scene("gameplay", function(stage) {          
    var peasant = stage.insert(new Q.Peasant({ x: 3*16 + 8, y: 24*16 + 8}));
    stage.on('prerender', function(ctx) {
      ctx.drawImage(Q.asset('background.png'), 0, 0);
    });
  });

  Q.load("background.png, peasant.png, peasant.json", function() {
    Q.compileSheets("peasant.png","peasant.json");
/*
    Q.animations('mario', {
      stand: { frames: [1] },
      run: { frames: [2,3,4,3], rate: 1/4 },
      jump: { frames: [6] }
    });
*/

    Q.stageScene("gameplay");
  });
});

