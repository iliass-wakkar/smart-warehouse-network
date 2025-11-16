// Warehouse Management System
// Final Project

// ============= GLOBAL VARIABLES =============

// Images (sprites)
let imgForklift, imgTruck, imgPackage, imgSlotEmpty, imgSlotFull;
let showMainPath = false; // toggle to show/hide the old demo path
let debugMode = false; // toggle debug visualization with 'd' key

// Object Lists
let forklifts = [];
let parking; // Parking manager (UI + spots)
let parkingSpots = [];
let packages = [];
let trucks = [];
let storageSlots = [];
let obstacles = [];

// Warehouse object (handles all warehouse display and logic)
let warehouse;
let truckDock;
let routes; // Complex routing network

// Main Path
let mainPath;

// UI Sliders
let sliderMaxSpeed, sliderMaxForce, sliderSeparation, sliderAvoidance;
let sliderRoutePoints; // controls total number of route UI points
let lastRoutePointsValue = null;

// Port connection settings (per-class distance thresholds)
let parkingConnectionDistance = 105; // Distance for Parking ports → route nodes
let dockConnectionDistance = 135; // Distance for Truck Dock front points → route nodes
let warehouseConnectionDistance = 105; // Distance for Warehouse endpoints → route nodes
let portConnections = []; // Store connections as {from: Vector, to: Vector}

// ============= PRELOAD =============

function preload() {
  // Charger les images
  imgForklift = loadImage("assets/forklift.png");
  imgTruck = loadImage("assets/truck.png");
  // imgPackage = loadImage('assets/package.png');
  // imgSlotEmpty = loadImage('assets/slot_empty.png');
  // imgSlotFull = loadImage('assets/slot_full.png');

  // Pour l'instant, nous utilisons null comme placeholder
  // imgForklift is loaded above
  imgPackage = null;
  imgSlotEmpty = null;
  imgSlotFull = null;
}

// ============= SETUP =============

function setup() {
  createCanvas(1920, 917);

  // Créer les UI Sliders
  sliderMaxSpeed = createSlider(1, 8, 4, 0.1);
  sliderMaxSpeed.position(10, 10);

  sliderMaxForce = createSlider(0.1, 0.5, 0.2, 0.01);
  sliderMaxForce.position(10, 40);

  sliderSeparation = createSlider(0, 1, 0.5, 0.1);
  sliderSeparation.position(10, 70);

  sliderAvoidance = createSlider(0, 1, 0.5, 0.1);
  sliderAvoidance.position(10, 100);

  // Slider to control total number of route points (default at minimum)
  sliderRoutePoints = createSlider(50, 600, 50, 1);
  sliderRoutePoints.position(10, 130);

  // Créer le chemin principal (routes)
  let pathPoints = [
    createVector(245, 750), // Départ: Centre du Parking
    createVector(300, 600), // Bas de l'Allée Ouest
    createVector(300, 200), // Haut de l'Allée Ouest
    createVector(960, 150), // Devant la Zone Camion
    createVector(1050, 300), // Vers warehouse
    createVector(1050, 720), // Bas du warehouse
    createVector(245, 750), // Point de retour vers le Parking
  ];
  mainPath = new Path(pathPoints);

  // Créer le warehouse manager
  // Position and dimensions: x, y, width, height, numSections, numRacks
  warehouse = new Warehouse(1150, 350, 750, 550, 6, 4);
  storageSlots = warehouse.getSlots();

  // Créer le Truck Dock (zone d'arrivée des camions)
  const numTruckSpots = 5; // Number of truck parking spots
  truckDock = new TruckDock(10, 100, 1900, 100, numTruckSpots, {
    frontSide: "bottom",
    frontPointOffset: 12,
  });

  // Créer le réseau de routes complexe
  routes = new Routes();
  // Définir les conteneurs de routes (zones où les nœuds peuvent être placés)
  const routesContainerLeft = { x: 50, y: 240, w: 420, h: 340 }; // Au-dessus du parking
  const routesContainerCenter = { x: 480, y: 240, w: 650, h: 650 }; // Centre principal
  const routesContainerAboveStock = { x: 1140, y: 240, w: 760, h: 100 }; // Au-dessus du warehouse

  routes.setContainers([
    routesContainerLeft,
    routesContainerCenter,
    routesContainerAboveStock,
  ]);

  // Construire le réseau par nombre total de points désiré (piloté par slider)
  lastRoutePointsValue = sliderRoutePoints.value();
  routes.setContainers([
    routesContainerLeft,
    routesContainerCenter,
    routesContainerAboveStock,
  ]);
  routes.setPointCount(lastRoutePointsValue, {
    areas: [
      routesContainerLeft,
      routesContainerCenter,
      routesContainerAboveStock,
    ],
  });

  // Initialiser les camions
  initializeTrucks();

  // Placer les Forklift initiaux (Zone Parking)
  let forkliftsCount = 3;

  // Instancier le Parking et générer les spots
  const parkRect = { x: 20, y: 600, w: 450, h: 300 };
  parking = new Parking(parkRect, forkliftsCount, {
    topPorts: { count: 3, startX: 80, gap: 120, offsetY: 12 },
    rightPorts: { count: 2, startY: 720, gap: 90, offsetX: 12 },
  });
  parkingSpots = parking.getSpots();
  // Lier les ports/endpoints aux routes (initial)
  routes.addExternalPoints("parking_ports", parking.getPorts());
  routes.addExternalPoints("truckdock_front", truckDock.getFrontPoints());
  routes.addExternalPoints("warehouse_endpoints", warehouse.getLineEndpoints());

  // Note: Storage slots are NOT part of the route network,
  // we only use their XY coordinates for positioning

  // Connect ports to nearest route points
  connectPortsToRoutes();

  // Créer les forklifts et leur assigner un spot dédié
  for (let i = 0; i < forkliftsCount; i++) {
    const spot = parking.getSpot(i);
    let forklift = new Forklift(spot.x, spot.y, imgForklift);
    forklift.parkingPos = spot.copy();
    forklift.state = "ATTENTE";
    forklifts.push(forklift);
  }
}

// ============= DRAW =============

function draw() {
  // Nettoyer l'écran
  background(50);

  // Lire les valeurs des sliders
  let currentSpeed = sliderMaxSpeed.value();
  let currentForce = sliderMaxForce.value();
  let separationWeight = sliderSeparation.value();
  let avoidanceWeight = sliderAvoidance.value();
  const desiredPts = sliderRoutePoints.value();
  if (desiredPts !== lastRoutePointsValue) {
    rebuildRoutesNetwork(desiredPts);
    lastRoutePointsValue = desiredPts;
  }

  // ========== AFFICHAGE DU STATIQUE ==========

  // Dessiner le réseau de routes complexe
  routes.display();

  // Dessiner les connexions des ports
  drawPortConnections();

  // Dessiner le parking (zone + spots + labels)
  parking.display();

  // Zone Camion (haut droite)
  truckDock.display();

  // Zone Stockage (Structured warehouse) - Handled by Warehouse class
  warehouse.display();

  // Dessiner le chemin principal (debug)
  if (showMainPath) mainPath.display();

  // Dessiner les obstacles
  for (let obs of obstacles) {
    obs.display();
  }

  // ========== LOGIQUE MANAGER/DISPATCHER ==========
  // Logique Dispatcher: Assigner des tâches
  // Chercher un package en attente, un forklift libre et un slot vide
  for (let pkg of packages) {
    if (pkg.state === "EN_ATTENTE") {
      // Chercher un forklift libre
      for (let forklift of forklifts) {
        if (forklift.state === "ATTENTE") {
          // Chercher un slot vide
          for (let slot of storageSlots) {
            if (slot.state === "VIDE") {
              // Assigner la tâche
              forklift.assignPackage(pkg, slot);
              pkg.state = "ASSIGNÉ";
              slot.state = "RÉSERVÉ";
              break; // On prend le premier slot vide trouvé
            }
          }
          break; // On prend le premier forklift libre trouvé
        }
      }
    }
  }

  // ========== MISE À JOUR ET AFFICHAGE DU DYNAMIQUE ==========

  // Mettre à jour et afficher les camions
  for (let truck of trucks) {
    truck.update();
    truck.display();

    // Ajouter les packages générés par le camion à la liste globale
    for (let pkg of truck.packages) {
      if (!packages.includes(pkg)) {
        packages.push(pkg);
        pkg.state = "EN_ATTENTE";
        console.log(
          "Package added to global list at",
          pkg.pos.x.toFixed(1),
          pkg.pos.y.toFixed(1)
        );
      }
    }
  }

  // Mettre à jour et afficher les forklifts
  for (let i = 0; i < forklifts.length; i++) {
    let forklift = forklifts[i];
    // Mettre à jour les paramètres depuis les sliders
    forklift.maxSpeed = currentSpeed;
    forklift.maxForce = currentForce;

    // Build A* path if needed
    if (
      !forklift.waypoints &&
      (forklift.state === "COLLECTE" ||
        forklift.state === "LIVRAISON" ||
        forklift.state === "RETOUR")
    ) {
      forklift.buildPathToTarget(routes);
    }

    // Passer les autres forklifts pour le comportement de séparation
    forklift.update(forklifts);
    forklift.display();
  }

  // Mettre à jour et afficher les packages
  for (let pkg of packages) {
    pkg.update();
    pkg.display();
  }

  // ========== AFFICHAGE DES INFORMATIONS ==========

  // Afficher les stats
  fill(255);
  textAlign(LEFT);
  textSize(12);
  text("Forklifts: " + forklifts.length, 10, 130);
  text("Packages: " + packages.length, 10, 145);
  text("Trucks: " + trucks.length, 10, 160);
  text(
    "Storage Slots: " +
      storageSlots.length +
      " (Empty: " +
      countEmptySlots() +
      ")",
    10,
    175
  );
  text(
    "Network: " +
      routes.getRouteCount() +
      " routes, " +
      routes.getStationCount() +
      " stations",
    10,
    190
  );

  // Afficher les sliders labels
  textSize(10);
  text("Max Speed: " + currentSpeed.toFixed(2), 10, 25);
  text("Max Force: " + currentForce.toFixed(2), 10, 55);
  text("Separation: " + separationWeight.toFixed(2), 10, 85);
  text("Avoidance: " + avoidanceWeight.toFixed(2), 10, 115);
  text("Route Points: " + desiredPts, 10, 145);

  // Debug mode indicator
  push();
  fill(debugMode ? color(0, 255, 0) : color(255, 0, 0));
  textSize(14);
  textAlign(RIGHT);
  text(
    "Debug: " + (debugMode ? "ON (press 'd')" : "OFF (press 'd')"),
    width - 10,
    20
  );
  pop();
}

// ============= HELPER FUNCTIONS =============

// Connect ports to route points using per-class distance thresholds
function connectPortsToRoutes() {
  portConnections = []; // Clear existing connections

  // Get all core route nodes
  const routeNodes = routes.nodes.core;

  // Function to connect a port to ALL route points within a given distance
  function connectPort(port, maxDist) {
    for (let node of routeNodes) {
      let d = p5.Vector.dist(port, node);
      if (d < maxDist) {
        portConnections.push({ from: port, to: node });
      }
    }
  }

  // Connect parking ports
  const parkingPorts = parking.getPorts();
  for (let port of parkingPorts) {
    connectPort(port, parkingConnectionDistance);
  }

  // Connect truck dock front points
  const dockFronts = truckDock.getFrontPoints();
  for (let front of dockFronts) {
    connectPort(front, dockConnectionDistance);
  }

  // Connect warehouse endpoints
  const warehouseEndpoints = warehouse.getLineEndpoints();
  for (let endpoint of warehouseEndpoints) {
    connectPort(endpoint, warehouseConnectionDistance);
  }

  // Note: Storage slot centers are NOT connected to routes
  // They are only used for XY positioning of packages
}

// Draw port connections
function drawPortConnections() {
  stroke(100, 200, 255, 150); // Light blue with transparency
  strokeWeight(1);

  for (let conn of portConnections) {
    line(conn.from.x, conn.from.y, conn.to.x, conn.to.y);
  }
}

// Initialiser les camions avec timing aléatoire
function initializeTrucks() {
  trucks = []; // Clear existing trucks

  for (let i = 0; i < truckDock.spots.length; i++) {
    let spot = truckDock.spots[i];
    let truck = new Truck(spot.x, -500, imgTruck, truckDock);
    truck.assignSpot(spot);
    // Start first cycle immediately so packages appear quickly
    truck.waitTimer = 0;
    truck.waitInterval = floor(random(180, 600));
    truck.isWaiting = false;
    truck.state = "EN_ROUTE";
    truckDock.reserveSpot(spot.id, truck);
    trucks.push(truck);
  }
}

// Compter les slots vides
function countEmptySlots() {
  return storageSlots.filter((slot) => slot.state === "VIDE").length;
}

// Classe Path (pour les routes)
class Path {
  constructor(points) {
    this.points = points;
  }

  display() {
    stroke(200);
    strokeWeight(3);
    noFill();
    beginShape();
    for (let p of this.points) {
      vertex(p.x, p.y);
    }
    endShape();
  }
}

// Reconstruire le réseau des routes quand le nombre de points change
function rebuildRoutesNetwork(pointCount) {
  // Rebuild core grid with requested total points across containers
  routes.setPointCount(pointCount);

  // Re-link external points (parking, truck dock, warehouse endpoints)
  routes.addExternalPoints("parking_ports", parking.getPorts());
  routes.addExternalPoints("truckdock_front", truckDock.getFrontPoints());
  routes.addExternalPoints("warehouse_endpoints", warehouse.getLineEndpoints());

  // Recompute proximity connections for visualization
  connectPortsToRoutes();

  // Clear current forklift paths so they rebuild against the new network
  for (let f of forklifts) {
    f.currentPath = null;
    if (typeof f.waypointIndex !== "undefined") f.waypointIndex = 0;
  }
}

// Toggle debug mode with 'd' key
function keyPressed() {
  if (key === "d" || key === "D") {
    debugMode = !debugMode;
    Vehicle.debug = debugMode;
    console.log("Debug mode:", debugMode ? "ON" : "OFF");
  }
}
