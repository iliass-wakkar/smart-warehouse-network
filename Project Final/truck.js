class Truck extends Vehicle {
  constructor(x, y, image, dock = null) {
    super(x, y, image, "white");

    // FSM State: "EN_ROUTE", "AU_QUAI", "DÉPART"
    this.state = "EN_ROUTE";

    // Dock de référence (TruckDock)
    this.dock = dock;
    this.assignedSpot = null;
    this.spotId = -1;

    // Position du quai (utilise le dock si disponible)
    if (this.dock) {
      this.quaiPos = createVector(this.dock.spawnX, this.dock.spawnY);
    } else {
      this.quaiPos = createVector(width - 100, height / 2);
    }

    // Position de départ (hors de l'écran en haut)
    this.departPos = this.dock
      ? createVector(this.quaiPos.x, -100)
      : createVector(width / 2, -100);

    // Spawn control for packages
    this.spawnTimer = 0;
    this.spawnInterval = 60; // Legacy interval (unused when spawning all at dock arrival)
    this.spawnedThisArrival = false; // Ensure we spawn once when arriving at dock

    // Liste des packages générés
    this.packages = [];

    // Temps passé au quai
    this.timeAtQuai = 0;
    this.maxTimeAtQuai = 180; // Rester 3 secondes (180 frames à 60fps)

    // Braking radius for smooth arrival
    this.rayonZoneDeFreinage = 100;

    // Waiting timer for continuous cycling
    this.isWaiting = false;
    this.waitTimer = 0;
    this.waitInterval = 0;

    // Nombre de colis (packages) pour ce camion [1..10]
    this.colisCount = floor(random(1, 11));
  }

  assignSpot(spot) {
    this.assignedSpot = spot;
    this.spotId = spot.id;
    // Update quai position to the assigned spot
    this.quaiPos = createVector(spot.x, spot.y);
    // Update departure position to go upward (above the screen)
    this.departPos = createVector(spot.x, -200);
    console.log(
      "Truck #" +
        this.spotId +
        " assigned. Depart target Y: " +
        this.departPos.y +
        " (reset at Y < -150)"
    );
  }

  // Méthode pour démarrer une période d'attente avant la prochaine arrivée
  startWaiting() {
    this.pos.set(this.quaiPos.x, -500);
    this.vel.set(0, 0);
    this.packages = [];
    this.spawnTimer = 0;
    this.timeAtQuai = 0;
    this.isWaiting = true;
    this.waitTimer = 0;
    this.waitInterval = floor(random(180, 600)); // 3-10 seconds
    // Assigner un nouveau nombre de colis pour le prochain cycle [1..10]
    this.colisCount = floor(random(1, 11));
    this.spawnedThisArrival = false;
  }

  // Méthode pour gérer la période d'attente
  handleWaiting() {
    this.waitTimer++;
    if (this.waitTimer >= this.waitInterval) {
      console.log(
        "Truck #" + this.spotId + " finished waiting, going EN_ROUTE"
      );
      this.isWaiting = false;
      this.state = "EN_ROUTE";
    }
  }

  runFSM() {
    let force = createVector(0, 0);

    // Handle waiting period before starting
    if (this.isWaiting) {
      this.handleWaiting();
      return force; // No movement while waiting
    }

    switch (this.state) {
      case "EN_ROUTE":
        // Se diriger vers le quai avec arrive behavior
        force = this.arrive(this.quaiPos);

        // Vérifier si on a atteint le quai (distance très petite)
        let distanceQuai = p5.Vector.dist(this.pos, this.quaiPos);
        if (distanceQuai < 5) {
          this.state = "AU_QUAI";
          this.timeAtQuai = 0;
          this.vel.set(0, 0); // Stop completely
          // Spawn all packages for this arrival at the assigned spot/front point
          if (!this.spawnedThisArrival) {
            this.spawnPackagesAtSpot();
            this.spawnedThisArrival = true;
          }
        }
        break;

      case "AU_QUAI":
        // Rester au quai (force nulle pour rester immobile)
        force = createVector(0, 0);
        this.vel.mult(0.95); // Damping pour arrêt complet

        this.spawnTimer++;
        this.timeAtQuai++;

        // Partir après 3 secondes
        if (this.timeAtQuai >= this.maxTimeAtQuai) {
          console.log(
            "Truck #" +
              this.spotId +
              " leaving dock. Current Y: " +
              this.pos.y.toFixed(1) +
              ", Depart target Y: " +
              this.departPos.y
          );
          this.state = "DÉPART";
        }
        break;

      case "DÉPART":
        // Quitter l'écran vers le haut
        force = this.arrive(this.departPos);
        if (frameCount % 60 === 0) {
          // Log every second
          console.log(
            "Truck #" +
              this.spotId +
              " DÉPART - Y: " +
              this.pos.y.toFixed(1) +
              " (going to " +
              this.departPos.y +
              ")"
          );
        }
        break;
    }

    return force;
  }

  spawnPackage() {
    // Créer un nouveau package à la position actuelle (fallback)
    const baseX = this.pos.x;
    const baseY = this.pos.y;
    let newPackage = new Package(baseX, baseY, null);
    this.packages.push(newPackage);

    // Retourner le nouveau package (pour qu'il soit ajouté à la liste globale)
    return newPackage;
  }

  // Spawn all packages for this arrival at the truck's assigned spot front point,
  // arranging them in a compact grid so they don't overlap.
  spawnPackagesAtSpot() {
    // Clear any leftover from previous cycles (safety)
    this.packages = [];

    const count = this.colisCount || 0;
    if (count <= 0) return;

    // Determine drop origin: front point for the assigned spot if available
    let origin = this.quaiPos.copy();
    let side = this.dock ? this.dock.options.frontSide || "top" : "top";
    if (this.dock && this.spotId >= 0) {
      origin = this.dock.getFrontPointForSpot(this.spotId);
      side = this.dock.options.frontSide || side;
    }

    // Grid layout parameters
    const pkgSize = 24; // Updated package size from Package class
    const spacing = pkgSize + 4; // small gap
    const cols = 5; // arrange up to 5 per row by default
    const rows = Math.ceil(count / cols);

    // Direction: place packages inside the dock area relative to front side
    let dirX = 0,
      dirY = 0;
    if (side === "bottom") {
      dirX = 0;
      dirY = -1;
    } else if (side === "top") {
      dirX = 0;
      dirY = 1;
    } else if (side === "left") {
      dirX = 1;
      dirY = 0;
    } else if (side === "right") {
      dirX = -1;
      dirY = 0;
    }

    // Start position so the grid is centered around the origin and grows inward
    const gridWidth = Math.min(count, cols) * spacing;
    const startX = origin.x - (gridWidth - spacing) / 2;
    const startY =
      origin.y - ((rows - 1) * spacing * (dirY === -1 ? -1 : 1)) / 2; // center by side

    for (let i = 0; i < count; i++) {
      const c = i % cols;
      const r = Math.floor(i / cols);
      let x = startX + c * spacing + dirX * c * 0; // dirX unused for now
      let y = origin.y + (dirY === 0 ? 0 : dirY * (r * spacing));
      // Adjust for centering by rows when dirY==0 (left/right sides)
      if (dirY === 0) {
        const gridHeight = rows * spacing;
        y = origin.y - (gridHeight - spacing) / 2 + r * spacing;
        x = origin.x + dirX * (c * spacing);
      }
      const pkg = new Package(x, y, null);
      this.packages.push(pkg);
    }
  }

  update() {
    let force = this.runFSM();
    this.applyForce(force);

    this.vel.add(this.acc);
    this.vel.limit(this.maxSpeed);
    this.pos.add(this.vel);
    this.acc.set(0, 0);

    // Check if truck reached top and needs reset
    // Only reset when in DÉPART state AND not already waiting
    if (this.state === "DÉPART" && !this.isWaiting) {
      // Check if truck is close to departure position (within 10 pixels)
      let distToDepartPos = p5.Vector.dist(this.pos, this.departPos);
      if (distToDepartPos < 10 || this.pos.y < -150) {
        console.log(
          "Truck #" +
            this.spotId +
            " reached top (y=" +
            this.pos.y.toFixed(1) +
            "), resetting to WAITING"
        );
        this.startWaiting();
      }
    } // Mettre à jour les packages
    this.packages.forEach((pkg) => {
      pkg.update();
    });
  }

  display() {
    // Dessiner le camion
    push();
    translate(this.pos.x, this.pos.y);
    rotate(this.vel.heading() + PI / 2); // Rotate 180 degrees (PI) to invert
    imageMode(CENTER);
    if (this.image) {
      image(this.image, 0, 0, this.r * 2.5, this.r * 2.5);
    } else {
      // Fallback: dessiner un rectangle
      fill(255, 100, 100);
      rect(-this.r, -this.r / 2, this.r * 2, this.r);
    }
    pop();

    // Afficher le nombre de colis au-dessus du camion
    push();
    textAlign(CENTER, BOTTOM);
    textSize(16);
    // Contour pour lisibilité
    stroke(0);
    strokeWeight(3);
    fill(255);
    text(this.colisCount, this.pos.x, this.pos.y - this.r * 1.6);
    pop();

    // Dessiner les packages
    this.packages.forEach((pkg) => {
      pkg.display();
    });
  }

  // Retirer un package de la liste (quand il est pris par un Forklift)
  removePackage(pkg) {
    let index = this.packages.indexOf(pkg);
    if (index > -1) {
      this.packages.splice(index, 1);
    }
  }
}
