class StorageSlot {
  constructor(x, y, image_vide, image_occupe) {
    this.pos = createVector(x, y);
    this.image_vide = image_vide;
    this.image_occupe = image_occupe;
    this.size = 40; // Default size

    // State: "VIDE", "RÉSERVÉ", "OCCUPÉ"
    this.state = "VIDE";

    // Slot ID
    this.id = 0;

    // Structured warehouse location
    this.section = 0; // Section 1-6
    this.rack = 0; // Rack 1-4
    this.posX = 0; // Position X 1-2
    this.posY = 0; // Position Y 1-2 (vertical level)

    // Counter for packages
    this.packageCount = 0;
  }

  display() {
    push();
    translate(this.pos.x, this.pos.y);

    // Determine colors based on state
    let bgColor, strokeColor;
    if (this.state === "OCCUPÉ") {
      bgColor = color(150, 100, 150, 200);
      strokeColor = color(150, 50, 150);
    } else if (this.state === "RÉSERVÉ") {
      bgColor = color(200, 200, 100, 180);
      strokeColor = color(200, 200, 50);
    } else {
      bgColor = color(200, 200, 200, 100);
      strokeColor = color(150, 150, 150);
    }

    // Draw slot rectangle
    fill(bgColor);
    stroke(strokeColor);
    strokeWeight(1.5);
    rect(-this.size / 2, -this.size / 2, this.size, this.size);

    // Display position identifier (S1R1, etc)
    fill(80);
    textAlign(CENTER, CENTER);
    textSize(this.size * 0.22);
    let posLabel = "S" + this.section + "R" + this.rack;
    text(posLabel, 0, -this.size * 0.18);

    // Display package count if occupied
    if (this.packageCount > 0) {
      fill(0, 150, 0);
      textSize(this.size * 0.5);
      text(this.packageCount, 0, this.size * 0.22);
    }

    pop();
  }

  reserve() {
    if (this.state === "VIDE") {
      this.state = "RÉSERVÉ";
      return true;
    }
    return false;
  }

  addPackage() {
    this.packageCount++;
    this.state = "OCCUPÉ";
  }

  removePackage() {
    if (this.packageCount > 0) {
      this.packageCount--;
    }
    if (this.packageCount === 0) {
      this.state = "VIDE";
    }
  }
}
