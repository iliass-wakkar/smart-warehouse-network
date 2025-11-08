let pursuer;
let targets = [];
let sliderVitesseMaxCible;

function setup() {
  createCanvas(windowWidth, windowHeight);
  pursuer = new Vehicle(random(width), random(height));
  pursuer.maxSpeed = 4;
  pursuer.maxForce = 0.2;
  pursuer.vel = createVector(2, 4)
  target = new Target(random(width), random(height));
  target.maxSpeed = 3;
  target.maxForce = 1;

  targets.push(target);
}

let oldMousePos;

function draw() {
  background(0);

  // pursuer = le véhicule poursuiveur, il vise un point devant la cible
  //let force = pursuer.pursuePerfect(target);
  target = targets[0]
  let force = pursuer.pursue(target, 300);
  pursuer.applyForce(force);

  // 2 - calculer la distance etc.
  let d = p5.Vector.dist(pursuer.pos, target.pos);
  if (d < target.rayonDetection) {
    target.maxSpeed = 20;
    target.maxForce = 2;
    // on est dans le cercle de détection, on s'évade
    let evadeForce = target.evade(pursuer);
    target.applyForce(evadeForce);

    // on cree des leurres
    let leurre = new Target(target.pos.x, target.pos.y);
    leurre.r = 3;
    targets.push(leurre)

  } else if (d >= (target.rayonDetection + 200)) {
    target.maxSpeed = 3;
    target.maxForce = 0.1;
  }


  // déplacement et dessin du véhicule et de la target
  pursuer.update();
  pursuer.edges();
  pursuer.show();

  // on déplace et on dessine toutes les targets
  targets.forEach(target => {
    // lorsque la target atteint un bord du canvas elle ré-apparait de l'autre côté
    target.edges();
    // mettre en commentaire la ligne suivante
    // si cible controlée à la souris
    target.update();
    target.show();
  });
}
