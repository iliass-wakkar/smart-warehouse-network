let nbVehicules = 20;
let target;
let vehicle;
let vehicles = [];
let font, points = [];
let mode = "Snake";

// Appelée avant de démarrer l'animation
function preload() {
  // en général on charge des images, des fontes de caractères etc.
  font = loadFont('./assets/inconsolata.otf');
}

function setup() {
  createCanvas(windowWidth, windowHeight);

  // On crée un véhicule à la position (100, 100)
  //vehicle = new Vehicle(100, 100);


  target = createVector(random(width), random(height));

  // le texte
  // Get the point array.
  points = font.textToPoints('Rabat', 116, 250, 320, { sampleFactor: 0.04 });

  // autant de véhicules que de points sur le texte  
  nbVehicules = points.length;
  // on creer des vehicules
  for (let i = 0; i < nbVehicules; i++) {
    vehicles.push(new Vehicle(random(width), random(height)));
  }


}

// appelée 60 fois par seconde
function draw() {
  // couleur pour effacer l'écran
  background(0);
  // pour effet psychedelique
  //background(0, 0, 0, 10);

  // Dessin des points du texte
  for (let p of points) {
    push();
    noFill();
    stroke("white");
    circle(p.x, p.y, 8);
    pop();
  }

  // Cible qui suit la souris, cercle rouge de rayon 32
  target.x = mouseX;
  target.y = mouseY;

  push();
  fill(255, 0, 0);
  noStroke();
  ellipse(target.x, target.y, 32);
  pop();

  vehicles.forEach((vehicle, index) => {
    // si on a affaire au premier véhicule
    // alors il suit la souris (target)
    let steeringForce;

    switch (mode) {
      case "Snake":
        if (index === 0) {
          steeringForce = vehicle.arrive(target);
        } else {
          // j'ai affaire à un autre véhicule, pas le premier.
          // je veux qu'il suive le précédent
          let vehiculePrecedent = vehicles[index - 1];

          // le véhicule courant fait un arrive sur le précédent
          // le second parametre est la distance par rapport au centre du
          // véhicule précédent. Doit être inférieure à rayonDistanceFreinage
          steeringForce = vehicle.arrive(vehiculePrecedent.pos, 20);

          // On dessine une ligne entre le véhicule courant et le véhicule précédent
          push();
          noFill();
          stroke(random(255), 255, 255, 60);
          strokeWeight(20);
          line(vehicle.pos.x, vehicle.pos.y,
            vehiculePrecedent.pos.x, vehiculePrecedent.pos.y)
          pop();
        }
        break;
      case "Texte":
        // Les vaisseaux vont chacun suivre leur cible

        // le véhicule courant a pour cible points[index]
        pointTarget = createVector(points[index].x, points[index].y);
        steeringForce = vehicle.arrive(pointTarget);
        break;
    }


    vehicle.applyForce(steeringForce);
    vehicle.update();
    vehicle.show();
  })
}


function keyPressed() {
  if (key === 'd') {
    Vehicle.debug = !Vehicle.debug;
  } else if (key === "s") {
    mode = "Snake";
  } else if (key === "t") {
    mode = "Texte";
  }
}