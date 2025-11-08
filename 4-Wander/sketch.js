let vehicles = [];
let imageFusee;
let debugCheckbox;

function preload() {
  // on charge une image de fusée pour le vaisseau
  imageFusee = loadImage('./assets/vehicule.png');
}

function setup() {
  createCanvas(windowWidth, windowHeight);

  const nbVehicles = 1;
  for(let i=0; i < nbVehicles; i++) {
    let vehicle = new Vehicle(100, 100, imageFusee);
    vehicles.push(vehicle);
  }

  // On cree des sliders pour régler les paramètres
  creerSlidersPourProprietesVehicules();

  //TODO : creerSliderPourNombreDeVehicules(nbVehicles);
  creerSliderPourNombreDeVehicules(nbVehicles);

  //TODO : 
  creerSliderPourLongueurCheminDerriereVehicules(20);
}

function creerSliderPourNombreDeVehicules(nbVehiclesInitial) {
  let nbVehiculesSlider = createSlider(1, 100, nbVehiclesInitial, 1);
  // ecouteur sur le slider pour recréer les véhicules
  nbVehiculesSlider.input(() => {
    // on vide le tableau
    vehicles = [];
    // on recrée les véhicules
    for(let i=0; i < nbVehiculesSlider.value(); i++) {
      let vehicle = new Vehicle(width/2, height/2, imageFusee);
      vehicles.push(vehicle);
    }
  });
  nbVehiculesSlider.position(160, 230);
  
  // je crée un label juste devant en X
  let labelNbVehicules = createDiv('Nb véhicules:')
  labelNbVehicules.position(10, 230);
  labelNbVehicules.style('color', 'white');

  // affichage de la valeur du slider
  let valueSpan = createSpan(nbVehiculesSlider.value());
  valueSpan.position(310, 230);
  valueSpan.style('color', 'white');
  valueSpan.html(nbVehiculesSlider.value());
}

function creerSliderPourLongueurCheminDerriereVehicules(longueurInitiale) {
  let longueurCheminSlider = createSlider(10, 120, longueurInitiale, 1);
  
  // ecouteur sur le slider pour modifier la propriété pathLength de chaque véhicule
  longueurCheminSlider.input(() => {
    vehicles.forEach(vehicle => {
      vehicle.pathLength = longueurCheminSlider.value();
    });
  });
  longueurCheminSlider.position(160, 270);
  
  // je crée un label juste devant en X
  let labelLongueurChemin = createDiv('Longueur chemin:')
  labelLongueurChemin.position(10, 270);
  labelLongueurChemin.style('color', 'white');

  // affichage de la valeur du slider
  let valueSpan = createSpan(longueurCheminSlider.value());
  valueSpan.position(310, 270);
  valueSpan.style('color', 'white');
  valueSpan.html(longueurCheminSlider.value());
}

function creerSlidersPourProprietesVehicules() {
  // paramètres de la fonction custom de création de sliders :
  // label, min, max, val, step, posX, posY, propriete des véhicules
  creerUnSlider("Rayon du cercle", 10, 200, 50, 1, 10, 20, "wanderRadius");
  // TODO : ajouter des sliders pour les autres propriétés
  // distanceCercle, displaceRange, maxSpeed, maxForce

  creerUnSlider("Distance au cercle", 50, 300, 150, 1, 10, 60, "distanceCercle");
  creerUnSlider("Plage de déplacement", 0.01, 1, 0.3, 0.01, 10, 100, "displaceRange");
  creerUnSlider("Vitesse Max", 1, 10, 4, 0.1, 10, 140, "maxSpeed");
  creerUnSlider("Force Max", 0.01, 1, 0.2, 0.01, 10, 180, "maxForce");

  // checkbox pour debug on / off
  debugCheckbox = createCheckbox('Debug ', false);
  debugCheckbox.position(10, 300);
  debugCheckbox.style('color', 'white');

  debugCheckbox.changed(() => {
    Vehicle.debug = !Vehicle.debug;
  });
}

function creerUnSlider(label, min, max, val, step, posX, posY, propriete) {
  let slider = createSlider(min, max, val, step);
  
  let labelP = createP(label);
  labelP.position(posX, posY);
  labelP.style('color', 'white');

  slider.position(posX + 150, posY + 17);

  let valueSpan = createSpan(slider.value());
  valueSpan.position(posX + 300, posY+17);
  valueSpan.style('color', 'white');
  valueSpan.html(slider.value());

  slider.input(() => {
    valueSpan.html(slider.value());
    vehicles.forEach(vehicle => {
      vehicle[propriete] = slider.value();
    });
  });
}


// appelée 60 fois par seconde
function draw() {
  background(0);
  //background(0, 0, 0, 20);

  vehicles.forEach(vehicle => {
    vehicle.wander();

    vehicle.update();
    vehicle.show();
    vehicle.edges();
  });
}

function keyPressed() {
  if (key === 'd') {
    Vehicle.debug = !Vehicle.debug;
    // changer la checkbox, elle doit être checkée si debug est true
    debugCheckbox.checked(Vehicle.debug);
  }
}
