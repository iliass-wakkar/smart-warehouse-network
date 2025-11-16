class Forklift extends Vehicle {
  constructor(x, y, image) {
    super(x, y, image, "yellow");

    // FSM State: "ATTENTE", "COLLECTE", "LIVRAISON", "RETOUR"
    this.state = "ATTENTE";

    // Package actuellement transporté
    this.heldPackage = null;

    // Cible actuelle
    this.targetPackage = null;
    this.targetSlot = null;
    this.parkingPos = createVector(100, 100);
  }

  runFSM(otherForklifts = []) {
    let force = createVector(0, 0);
    let separateForce = createVector(0, 0);

    // Appliquer la séparation pour éviter les autres forklifts
    if (otherForklifts.length > 0) {
      separateForce = this.separate(otherForklifts);
      separateForce.mult(1.5); // Poids de la force de séparation
    }

    switch (this.state) {
      case "ATTENTE":
        // En attente au parking
        force = this.arrive(this.parkingPos);
        break;

      case "COLLECTE":
        // Se déplacer vers le package et le ramasser
        if (this.targetPackage) {
          force = this.arrive(this.targetPackage.pos);

          // Vérifier si on a atteint le package
          let distance = p5.Vector.dist(this.pos, this.targetPackage.pos);
          if (distance < 50) {
            // Ramasser le package
            this.heldPackage = this.targetPackage;
            this.heldPackage.state = "EN_TRANSIT";
            this.targetPackage = null;
            this.state = "LIVRAISON";
          }
        }
        break;

      case "LIVRAISON":
        // Se déplacer vers l'emplacement de stockage
        if (this.targetSlot) {
          force = this.arrive(this.targetSlot.pos);

          // Vérifier si on a atteint l'emplacement
          let distance = p5.Vector.dist(this.pos, this.targetSlot.pos);
          if (distance < 50) {
            // Déposer le package
            if (this.heldPackage) {
              this.heldPackage.pos = this.targetSlot.pos.copy();
              this.heldPackage.state = "LIVRÉ";
              this.targetSlot.addPackage(); // Incrémenter le compteur
            }
            this.heldPackage = null;
            this.targetSlot = null;
            this.state = "RETOUR";
          }
        }
        break;

      case "RETOUR":
        // Retourner au parking
        force = this.arrive(this.parkingPos);
        let distance = p5.Vector.dist(this.pos, this.parkingPos);
        if (distance < 50) {
          this.state = "ATTENTE";
        }
        break;
    }

    // Combiner la force principale avec la force de séparation
    force.add(separateForce);

    return force;
  }

  update(otherForklifts = []) {
    let force = this.runFSM(otherForklifts);
    this.applyForce(force);

    this.vel.add(this.acc);
    this.vel.limit(this.maxSpeed);
    this.pos.add(this.vel);
    this.acc.set(0, 0);

    // Mettre à jour la position du package transporté
    if (this.heldPackage) {
      this.heldPackage.pos = this.pos.copy();
    }

    // Ajouter à la trajectoire
    this.path.push(this.pos.copy());
    if (this.path.length > this.pathLength) {
      this.path.shift();
    }
  }

  display() {
    // Dessiner la trajectoire
    this.path.forEach((p, index) => {
      if (!(index % 3)) {
        stroke(this.pathColor);
        fill(this.pathColor);
        circle(p.x, p.y, 1);
      }
    });

    // Dessiner le chariot
    push();
    translate(this.pos.x, this.pos.y);
    // Rotate opposite direction (invert heading by 180°)
    rotate(this.vel.heading() + PI);
    imageMode(CENTER);
    if (this.image) {
      // Make the forklift thinner and longer
      const spriteW = this.r * 3.1; // narrower width
      const spriteH = this.r * 1.8; // taller height
      image(this.image, 0, 0, spriteW, spriteH);
    } else {
      // Fallback: dessiner un rectangle
      fill(100, 150, 255);
      const rectW = this.r * 3.1;
      const rectH = this.r * 1.8;
      rect(-rectW / 2, -rectH / 2, rectW, rectH);
    }
    pop();

    // Dessiner le package s'il en transporte un
    if (this.heldPackage) {
      this.heldPackage.display();
    }
  }

  // Assigner une tâche de collecte
  assignPackage(pkg, slot) {
    this.targetPackage = pkg;
    this.targetSlot = slot;
    this.state = "COLLECTE";
  }
}
