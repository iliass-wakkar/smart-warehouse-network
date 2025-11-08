let target, target2, vehicle;
let vitesseMaxSlider, accelerationMaxSlider, tailleVehiculeSlider ;
// tableau de véhicules
let vehicles = [];
// nombre initial de véhicules
let nbVehicles = 1;

// la fonction setup est appelée une fois au démarrage du programme par p5.js
function setup() {
  // on crée un canvas de 800px par 800px
  createCanvas(800, 800);

  // On crée un véhicule à la position (100, 100)
  //vehicle = new Vehicle(100, 100);

  // TODO: créer un tableau de véhicules en global
  // ajouter nb vehicules au tableau dans une boucle
  // avec une position random dans le canvas
  creerVehicules(nbVehicles);

  // La cible est un vecteur avec une position aléatoire dans le canvas
  // dirigée par la souris ensuite dans draw()
  target = createVector(random(width), random(height));

  // la cible mobile
  target2 = new Target(random(width), random(height));

   // On crée un slider pour régler la vitesse max des véhicules
  // On crée le slider et on le positionne
  // les paramètres sont : min, max, valeur initiale, pas
  vitesseMaxSlider = createSlider(1, 20, 10, 1);
  vitesseMaxSlider.position(920, 10);
  vitesseMaxSlider.size(80);

  // je crée un label juste devant en X
  let labelVitesseMax = createDiv('Vitesse Max:')
  labelVitesseMax.position(810, 10);
  labelVitesseMax.style('color', 'black');
  labelVitesseMax.style('font-size', '14px');

  // On crée un slider pour régler la vitesse max des véhicules
  // On crée le slider et on le positionne
  // les paramètres sont : min, max, valeur initiale, pas
  accelerationMaxSlider = createSlider(0, 2, 0.1, 0.01);
  accelerationMaxSlider.position(920, 40);
  accelerationMaxSlider.size(80);

  // je crée un label juste devant en X
  let labelAccelerationMax = createDiv('Force Max:')
  labelAccelerationMax.position(810, 40);
  labelAccelerationMax.style('color', 'black');
  labelAccelerationMax.style('font-size', '14px');

  // On cree un curseur pour indiquer le nombre de véhicules
  // a l'écran
  // paramètres : min, max, valeur initiale, pas
  let nbVehiculesSlider = createSlider(1, 200, nbVehicles, 1);
  // ecouteur sur le slider pour recréer les véhicules
  nbVehiculesSlider.input(() => {
    // on vide le tableau
    vehicles = [];
    // on recrée les véhicules
    creerVehicules(nbVehiculesSlider.value());
  });
  nbVehiculesSlider.position(920, 70);
  nbVehiculesSlider.size(80);

  // je crée un label juste devant en X
  let labelNbVehicules = createDiv('Véhicules:')
  labelNbVehicules.position(790, 70);
  labelNbVehicules.style('color', 'black');
  labelNbVehicules.style('font-size', '14px');

  // Je cree un slider pour changer la taille des véhicules
   tailleVehiculeSlider = createSlider(4, 64, 16, 1);
  tailleVehiculeSlider.position(920, 100);
  tailleVehiculeSlider.size(80);

  // label pour la taille des véhicules
  let labelTailleVehicule = createDiv('Taille Véhicule:')
  labelTailleVehicule.position(790, 100);
  labelTailleVehicule.style('color', 'black');
  labelTailleVehicule.style('font-size', '14px');
  
}

function creerVehicules(nb) {
  for (let i = 0; i < nb; i++) {
    let v = new Vehicle(random(width), random(height));
    // on ajoute le véhicule au tableau à la fin
    vehicles.push(v);
  }
}

// la fonction draw est appelée en boucle par p5.js, 60 fois par seconde par défaut
// Le canvas est effacé automatiquement avant chaque appel à draw
function draw() {
  // fond noir pour le canvas
  background(0);

  // A partir de maintenant toutes les formes pleines seront en rouge
  fill("red");
  // pas de contours pour les formes.
  noStroke();

  // mouseX et mouseY sont des variables globales de p5.js, elles correspondent à la position de la souris
  // on les stocke dans un vecteur pour pouvoir les utiliser avec la méthode seek (un peu plus loin)
  // du vehicule
  target.x = mouseX;
  target.y = mouseY;

  // Dessine un cercle de rayon 32px à la position de la souris
  // la couleur de remplissage est rouge car on a appelé fill(255, 0, 0) plus haut
  // pas de contours car on a appelé noStroke() plus haut
  circle(target.x, target.y, 32);

  // On dessine aussi la cible mobile
  target2.vel.x += random(-0.5, 0.5);
  target2.vel.y += random(-0.5, 0.5);
  
  target2.update();
  target2.edges();
  target2.show();

  // TODO :au lieu d'afficher un seul véhicule
  // faire une boucle pour afficher plusieurs véhicules
  vehicles.forEach(vehicle => {
    // On récupère la valeur du slider et on la met dans la vitesse max du véhicule
    vehicle.maxSpeed = vitesseMaxSlider.value();
    // On récupère l'accelération max du slider et on la met dans la force max du véhicule
    vehicle.maxForce = accelerationMaxSlider.value();

    // je déplace et dessine le véhicule
    vehicle.applyBehaviors(target2.pos);
    vehicle.update();

    // Detecter si collision avec la cible
    // on calcule la distance avec la cible
    let d = p5.Vector.dist(vehicle.pos, target2.pos);
    if(d < vehicle.r) {
      // il y a collision
      // on déplace le vehicule à une position aléatoire
      vehicle.pos.x = random(width);
      vehicle.pos.y = random(height);
    }

    // Si le vehicule sort de l'écran
    // TODO : appeler la méthode edges() du véhicule
    vehicle.edges();

    // On dessine le véhicule
    vehicle.r = tailleVehiculeSlider.value();
    vehicle.show();
  });
}
