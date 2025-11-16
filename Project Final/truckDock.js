// Truck Dock UI and spawn management

class TruckDock {
  constructor(x, y, width, height, numSpots = 10, options = {}) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.numSpots = numSpots;

    this.options = Object.assign(
      {
        showFrontPoints: true,
        frontPointColor: color(255, 0, 255),
        frontPointSize: 12,
        frontPointOffsetY: 12, // backward-compat; if set, used for Y offsets
        frontPointOffset: 12, // distance from chosen edge
        frontSide: "top", // "top" | "bottom" | "left" | "right"
      },
      options
    );

    // Create parking spots
    this.spots = [];
    this.createSpots();

    // Default spawn point: center of the dock
    this.spawnX = this.x + this.width / 2;
    this.spawnY = this.y + this.height / 2;
  }

  // Create parking spots distributed along the dock
  createSpots() {
    this.spots = [];
    const spotSpacing = this.width / (this.numSpots + 1);

    for (let i = 0; i < this.numSpots; i++) {
      const spotX = this.x + spotSpacing * (i + 1);
      const spotY = this.y + this.height / 2;

      this.spots.push({
        id: i,
        x: spotX,
        y: spotY,
        occupied: false,
        truck: null,
      });
    }
  }

  // Get next available spot
  getAvailableSpot() {
    return this.spots.find((spot) => !spot.occupied);
  }

  // Reserve a spot for a truck
  reserveSpot(spotId, truck) {
    if (spotId >= 0 && spotId < this.spots.length) {
      this.spots[spotId].occupied = true;
      this.spots[spotId].truck = truck;
      return this.spots[spotId];
    }
    return null;
  }

  // Release a spot
  releaseSpot(spotId) {
    if (spotId >= 0 && spotId < this.spots.length) {
      this.spots[spotId].occupied = false;
      this.spots[spotId].truck = null;
    }
  }

  // Allow repositioning dynamically (e.g., responsive layout)
  resize(x, y, width, height) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.spawnX = this.x + this.width / 2;
    this.spawnY = this.y + this.height / 2;
    this.createSpots(); // Recreate spots with new dimensions
  }

  display() {
    // Background area
    fill(150, 100, 100, 100);
    stroke(255, 255, 0);
    strokeWeight(1);
    rect(this.x, this.y, this.width, this.height);

    // Label
    noStroke();
    fill(255);
    textSize(12);
    textAlign(LEFT, TOP);
    text("TRUCK DOCK", this.x + 8, this.y + 8);

    // Draw parking spots
    for (let spot of this.spots) {
      // Spot rectangle
      if (spot.occupied) {
        fill(255, 100, 100, 100); // Red for occupied
        stroke(255, 0, 0);
      } else {
        fill(100, 255, 100, 100); // Green for available
        stroke(0, 255, 0);
      }
      strokeWeight(2);
      rectMode(CENTER);
      rect(spot.x, spot.y, 80, 60);
      rectMode(CORNER);

      // Spot number
      noStroke();
      fill(255);
      textSize(10);
      textAlign(CENTER, CENTER);
      text("SPOT " + (spot.id + 1), spot.x, spot.y);
    }

    // Front points aligned with each spot on a chosen edge of the dock
    if (this.options.showFrontPoints) {
      push();
      noStroke();
      fill(this.options.frontPointColor);
      const side = this.options.frontSide || "top";
      const offset =
        this.options.frontPointOffset !== undefined
          ? this.options.frontPointOffset
          : this.options.frontPointOffsetY;
      for (let spot of this.spots) {
        let cx, cy;
        if (side === "top") {
          cx = spot.x;
          cy = this.y + offset;
        } else if (side === "bottom") {
          cx = spot.x;
          cy = this.y + this.height - offset;
        } else if (side === "left") {
          cx = this.x + offset;
          cy = spot.y;
        } else if (side === "right") {
          cx = this.x + this.width - offset;
          cy = spot.y;
        } else {
          cx = spot.x;
          cy = this.y + offset;
        }
        circle(cx, cy, this.options.frontPointSize);
      }
      pop();
    }
  }

  // Expose current front points as vectors to integrate with routes
  getFrontPoints() {
    const pts = [];
    const side = this.options.frontSide || "top";
    const offset =
      this.options.frontPointOffset !== undefined
        ? this.options.frontPointOffset
        : this.options.frontPointOffsetY;
    for (let spot of this.spots) {
      let cx, cy;
      if (side === "top") {
        cx = spot.x;
        cy = this.y + offset;
      } else if (side === "bottom") {
        cx = spot.x;
        cy = this.y + this.height - offset;
      } else if (side === "left") {
        cx = this.x + offset;
        cy = spot.y;
      } else if (side === "right") {
        cx = this.x + this.width - offset;
        cy = spot.y;
      } else {
        cx = spot.x;
        cy = this.y + offset;
      }
      pts.push(createVector(cx, cy));
    }
    return pts;
  }

  // Plain XY values for integration
  getFrontPointsXY() {
    return this.getFrontPoints().map((p) => ({ x: p.x, y: p.y }));
  }
}
