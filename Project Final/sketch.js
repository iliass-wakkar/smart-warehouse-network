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
let sliderMaxSpeed, sliderMaxForce;
let sliderRoutePoints; // controls total number of route UI points
let sliderTruckFrequency; // controls truck arrivals per minute (5-40)
let sliderWaypointRadius; // waypoint reach radius (10-50)
let sliderObstacleDistance; // obstacle check distance (40-150)
let sliderMaxReplans; // max replan attempts (1-5)
let sliderForkliftCount; // number of forklifts (1-10)
let lastRoutePointsValue = null;
let lastForkliftCount = 3;

// Fixed parameters (no sliders)
// Separation and avoidance weights removed (unused). Forklift/vehicle code uses internal weights.

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

  // Créer les UI Sliders - Positioned horizontally across the top
  const sliderY = 30; // Y position for all sliders
  const sliderWidth = 150; // Width of each slider
  const sliderSpacing = 180; // Horizontal spacing between sliders
  
  sliderMaxSpeed = createSlider(1, 8, 4, 0.1);
  sliderMaxSpeed.position(10, sliderY);
  sliderMaxSpeed.style('width', sliderWidth + 'px');

  sliderMaxForce = createSlider(0.1, 0.5, 0.2, 0.01);
  sliderMaxForce.position(10 + sliderSpacing, sliderY);
  sliderMaxForce.style('width', sliderWidth + 'px');

  // Slider to control total number of route points (default at minimum)
  sliderRoutePoints = createSlider(50, 600, 50, 1);
  sliderRoutePoints.position(10 + sliderSpacing * 2, sliderY);
  sliderRoutePoints.style('width', sliderWidth + 'px');

  // Slider to control truck arrival frequency (arrivals per minute)
  sliderTruckFrequency = createSlider(5, 40, 10, 1);
  sliderTruckFrequency.position(10 + sliderSpacing * 3, sliderY);
  sliderTruckFrequency.style('width', sliderWidth + 'px');

  // Slider for waypoint reach radius
  sliderWaypointRadius = createSlider(10, 50, 25, 1);
  sliderWaypointRadius.position(10 + sliderSpacing * 4, sliderY);
  sliderWaypointRadius.style('width', sliderWidth + 'px');

  // Slider for obstacle check distance
  sliderObstacleDistance = createSlider(40, 150, 80, 5);
  sliderObstacleDistance.position(10 + sliderSpacing * 5, sliderY);
  sliderObstacleDistance.style('width', sliderWidth + 'px');

  // Slider for max replan attempts
  sliderMaxReplans = createSlider(1, 5, 3, 1);
  sliderMaxReplans.position(10 + sliderSpacing * 6, sliderY);
  sliderMaxReplans.style('width', sliderWidth + 'px');

  // Slider for number of forklifts
  sliderForkliftCount = createSlider(1, 10, 3, 1);
  sliderForkliftCount.position(10 + sliderSpacing * 7, sliderY);
  sliderForkliftCount.style('width', sliderWidth + 'px');

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
    forklift.id = i + 1; // Assign unique ID
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
  const desiredPts = sliderRoutePoints.value();
  if (desiredPts !== lastRoutePointsValue) {
    rebuildRoutesNetwork(desiredPts);
    lastRoutePointsValue = desiredPts;
  }

  // Handle forklift count changes
  const desiredForkliftCount = sliderForkliftCount.value();
  if (desiredForkliftCount !== lastForkliftCount) {
    adjustForkliftCount(desiredForkliftCount);
    lastForkliftCount = desiredForkliftCount;
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
  const truckFrequency = sliderTruckFrequency.value(); // arrivals per minute
  for (let truck of trucks) {
    truck.setArrivalFrequency(truckFrequency);
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
  const waypointRadius = sliderWaypointRadius.value();
  const obstacleDistance = sliderObstacleDistance.value();
  const maxReplans = sliderMaxReplans.value();
  
  for (let i = 0; i < forklifts.length; i++) {
    let forklift = forklifts[i];
    // Mettre à jour les paramètres depuis les sliders
    forklift.maxSpeed = currentSpeed;
    forklift.maxForce = currentForce;
    forklift.waypointReachRadius = waypointRadius;
    forklift.obstacleCheckDistance = obstacleDistance;
    forklift.maxReplanAttempts = maxReplans;

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
    forklift.update(forklifts, routes);
    forklift.display();
  }

  // Mettre à jour et afficher les packages
  for (let pkg of packages) {
    pkg.update();
    pkg.display();
  }

  // ========== AFFICHAGE DES INFORMATIONS ==========

  // Draw slider labels above each slider
  push();
  fill(255);
  textAlign(CENTER);
  textSize(11);
  const labelY = 15;
  const sliderSpacing = 180;
  
  text("Max Speed", 10 + 75, labelY);
  text("Max Force", 10 + sliderSpacing + 75, labelY);
  text("Route Points", 10 + sliderSpacing * 2 + 75, labelY);
  text("Truck Freq", 10 + sliderSpacing * 3 + 75, labelY);
  text("Waypoint Radius", 10 + sliderSpacing * 4 + 75, labelY);
  text("Obstacle Dist", 10 + sliderSpacing * 5 + 75, labelY);
  text("Max Replans", 10 + sliderSpacing * 6 + 75, labelY);
  text("Forklifts", 10 + sliderSpacing * 7 + 75, labelY);
  
  // Draw current values below labels
  textSize(10);
  fill(200, 255, 200);
  text(currentSpeed.toFixed(1), 10 + 75, labelY + 45);
  text(currentForce.toFixed(2), 10 + sliderSpacing + 75, labelY + 45);
  text(desiredPts, 10 + sliderSpacing * 2 + 75, labelY + 45);
  text(sliderTruckFrequency.value() + "/min", 10 + sliderSpacing * 3 + 75, labelY + 45);
  text(sliderWaypointRadius.value() + "px", 10 + sliderSpacing * 4 + 75, labelY + 45);
  text(sliderObstacleDistance.value() + "px", 10 + sliderSpacing * 5 + 75, labelY + 45);
  text(sliderMaxReplans.value(), 10 + sliderSpacing * 6 + 75, labelY + 45);
  text(sliderForkliftCount.value(), 10 + sliderSpacing * 7 + 75, labelY + 45);
  pop();

  // Afficher les stats (moved down to avoid overlap with sliders)
  push();
  fill(255);
  textAlign(LEFT);
  textSize(12);
  const statsY = 90;
  text("Forklifts: " + forklifts.length, 10, statsY);
  text("Packages: " + packages.length, 10, statsY + 15);
  text("Trucks: " + trucks.length, 10, statsY + 30);
  text(
    "Storage Slots: " +
      storageSlots.length +
      " (Empty: " +
      countEmptySlots() +
      ")",
    10,
    statsY + 45
  );
  text(
    "Network: " +
      routes.getRouteCount() +
      " routes, " +
      routes.getStationCount() +
      " stations",
    10,
    statsY + 60
  );
  pop();

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

  // Show time-aware planning stats if debug enabled
  if (debugMode) {
    push();
    fill(0, 200);
    noStroke();
    rect(10, height - 180, 350, 170, 5);

    fill(255);
    textAlign(LEFT, TOP);
    textSize(12);
    text("Time-Aware Planning & Status:", 15, height - 175);

    let forkliftsWithSchedule = 0;
    let totalScheduleStates = 0;
    let forkliftStates = { ATTENTE: 0, COLLECTE: 0, LIVRAISON: 0, RETOUR: 0 };
    let totalReplans = 0;
    
    for (let f of forklifts) {
      if (f.plannedSchedule && f.plannedSchedule.length > 0) {
        forkliftsWithSchedule++;
        totalScheduleStates += f.plannedSchedule.length;
      }
      forkliftStates[f.state] = (forkliftStates[f.state] || 0) + 1;
      totalReplans += f.replanAttempts || 0;
    }

    textSize(10);
    text(
      `Forklifts w/ Schedule: ${forkliftsWithSchedule}/${forklifts.length}`,
      15,
      height - 155
    );
    text(`Total Schedule States: ${totalScheduleStates}`, 15, height - 140);
    text(
      `Reserved Nodes: ${
        routes.nodeTimeReservations ? routes.nodeTimeReservations.size : 0
      }`,
      15,
      height - 125
    );
    text(
      `Reserved Edges: ${
        routes.edgeTimeReservations ? routes.edgeTimeReservations.size : 0
      }`,
      15,
      height - 110
    );
    text(`Total Replans: ${totalReplans}`, 15, height - 95);
    
    // Forklift states breakdown
    fill(150, 200, 255);
    text(`States - ATTENTE:${forkliftStates.ATTENTE} COLLECTE:${forkliftStates.COLLECTE}`, 15, height - 75);
    text(`LIVRAISON:${forkliftStates.LIVRAISON} RETOUR:${forkliftStates.RETOUR}`, 15, height - 60);

    // Legend
    fill(255, 200, 0);
    text("🟡 Orange circle = Waypoint radius | Orange ring = Obstacle range", 15, height - 40);
    fill(0, 255, 255);
    text("🔵 Cyan = Reserved edges | Green dots = Waypoints", 15, height - 25);
    fill(255, 100, 0);
    text("🟠 REPLAN = Conflict detected, finding new route", 15, height - 10);

    pop();
  }
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

// Adjust number of forklifts dynamically
function adjustForkliftCount(targetCount) {
  const currentCount = forklifts.length;
  
  if (targetCount > currentCount) {
    // Add new forklifts
    for (let i = currentCount; i < targetCount; i++) {
      // Get or create parking spot
      let spot;
      if (i < parkingSpots.length) {
        spot = parkingSpots[i];
      } else {
        // Create additional parking spot if needed
        spot = createVector(245 + (i % 3) * 60, 750 - Math.floor(i / 3) * 60);
      }
      
      let forklift = new Forklift(spot.x, spot.y, imgForklift);
      forklift.id = i + 1;
      forklift.parkingPos = spot.copy ? spot.copy() : createVector(spot.x, spot.y);
      forklift.state = "ATTENTE";
      forklifts.push(forklift);
      console.log(`Added forklift ${forklift.id} at parking spot`);
    }
  } else if (targetCount < currentCount) {
    // Remove excess forklifts (only remove idle ones first)
    const toRemove = currentCount - targetCount;
    let removed = 0;
    
    // First pass: remove idle forklifts
    for (let i = forklifts.length - 1; i >= 0 && removed < toRemove; i--) {
      if (forklifts[i].state === "ATTENTE" && !forklifts[i].targetPackage) {
        console.log(`Removing idle forklift ${forklifts[i].id}`);
        forklifts.splice(i, 1);
        removed++;
      }
    }
    
    // Second pass: remove any remaining if still over count
    while (forklifts.length > targetCount) {
      const removed = forklifts.pop();
      console.log(`Removing forklift ${removed.id} (was busy)`);
    }
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
