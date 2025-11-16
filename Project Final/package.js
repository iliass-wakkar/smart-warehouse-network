class Package {
  constructor(x, y, image) {
    this.pos = createVector(x, y);
    this.image = image;
    this.size = 24; // Reduced from 32 to 24

    // State: "EN_ATTENTE", "EN_TRANSIT", "LIVRÉ"
    this.state = "EN_ATTENTE";
  }

  update() {
    // Si en transit, la position est gérée par le Forklift
    // Pas besoin de faire grand chose ici
  }

  display() {
    push();
    translate(this.pos.x, this.pos.y);
    imageMode(CENTER);

    if (this.image) {
      image(this.image, 0, 0, this.size, this.size);
    } else {
      // Fallback: dessiner un carré
      fill(255, 100, 100);
      rect(-this.size / 2, -this.size / 2, this.size, this.size);
    }

    pop();
  }
}
