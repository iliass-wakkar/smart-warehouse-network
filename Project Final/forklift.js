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

    // Simple A* waypoint following
    this.waypoints = null; // Array of p5.Vector waypoints from A*
    this.currentWaypointIndex = 0; // Current waypoint we're heading to
    this.waypointReachRadius = 25; // How close to get to waypoint before moving to next
    this.hasValidPath = false; // Only move if we have a valid route
    this.separateWeight = 1.5;

    // Stop drifting by default (override Vehicle's initial velocity)
    if (this.vel) this.vel.set(0, 0);
  }

  runFSM(otherForklifts = []) {
    let force = createVector(0, 0);
    let separateForce = createVector(0, 0);

    // Appliquer la séparation pour éviter les autres forklifts
    if (otherForklifts.length > 0) {
      separateForce = this.separate(otherForklifts);
      separateForce.mult(this.separateWeight);
    }

    switch (this.state) {
      case "ATTENTE":
        // Stay at parking - only move if we have waypoints
        if (this.hasValidPath && this.waypoints && this.currentWaypointIndex < this.waypoints.length) {
          let target = this.waypoints[this.currentWaypointIndex];
          force = this.arrive(target);
          if (p5.Vector.dist(this.pos, target) < this.waypointReachRadius) {
            this.currentWaypointIndex++;
          }
        } else if (!this.hasValidPath) {
          // No valid path - don't move
          force = createVector(0, 0);
        } else {
          // Finished waypoints, arrive at parking
          force = this.arrive(this.parkingPos);
        }
        break;

      case "COLLECTE":
        // Follow waypoints to package - only move if we have a valid path
        if (this.targetPackage) {
          if (!this.hasValidPath) {
            // No valid path - don't move
            force = createVector(0, 0);
          } else if (this.waypoints && this.currentWaypointIndex < this.waypoints.length) {
            // Follow the A* path waypoints
            let target = this.waypoints[this.currentWaypointIndex];
            force = this.seek(target);
            if (p5.Vector.dist(this.pos, target) < this.waypointReachRadius) {
              this.currentWaypointIndex++;
            }
          } else {
            // Finished waypoints - seek directly to package
            force = this.seek(this.targetPackage.pos);
          }

          // Reached package?
          let distance = p5.Vector.dist(this.pos, this.targetPackage.pos);
          if (distance < 50) {
            this.heldPackage = this.targetPackage;
            this.heldPackage.state = "EN_TRANSIT";
            this.targetPackage = null;
            this.state = "LIVRAISON";
            this.waypoints = null;
            this.currentWaypointIndex = 0;
            this.hasValidPath = false;
          }
        }
        break;

      case "LIVRAISON":
        // Follow waypoints to storage slot - only move if we have a valid path
        if (this.targetSlot) {
          if (!this.hasValidPath) {
            // No valid path - don't move
            force = createVector(0, 0);
          } else if (this.waypoints && this.currentWaypointIndex < this.waypoints.length) {
            // Follow the A* path waypoints
            let target = this.waypoints[this.currentWaypointIndex];
            force = this.arrive(target);
            if (p5.Vector.dist(this.pos, target) < this.waypointReachRadius) {
              this.currentWaypointIndex++;
            }
          } else {
            // Finished waypoints - arrive directly at slot
            force = this.arrive(this.targetSlot.pos);
          }

          let distance = p5.Vector.dist(this.pos, this.targetSlot.pos);
          if (distance < 50) {
            if (this.heldPackage) {
              this.heldPackage.pos = this.targetSlot.pos.copy();
              this.heldPackage.state = "LIVRÉ";
              this.targetSlot.addPackage();
            }
            this.heldPackage = null;
            this.targetSlot = null;
            this.state = "RETOUR";
            this.waypoints = null;
            this.currentWaypointIndex = 0;
            this.hasValidPath = false;
          }
        }
        break;

      case "RETOUR":
        // Follow waypoints back to parking - only move if we have a valid path
        if (!this.hasValidPath) {
          // No valid path - don't move
          force = createVector(0, 0);
        } else if (this.waypoints && this.currentWaypointIndex < this.waypoints.length) {
          let target = this.waypoints[this.currentWaypointIndex];
          force = this.arrive(target);
          if (p5.Vector.dist(this.pos, target) < this.waypointReachRadius) {
            this.currentWaypointIndex++;
          }
        } else {
          // Finished waypoints - arrive at parking
          force = this.arrive(this.parkingPos);
        }
        
        let distance = p5.Vector.dist(this.pos, this.parkingPos);
        if (distance < 50) {
          this.state = "ATTENTE";
          this.waypoints = null;
          this.currentWaypointIndex = 0;
          this.hasValidPath = false;
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

    // Reduce residual drift when idle in parking
    if (this.state === "ATTENTE" && !this.currentPath) {
      this.vel.mult(0.85);
      if (this.vel.mag() < 0.05) this.vel.set(0, 0);
    }

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
    // Debug visualization for waypoint following
    if (Vehicle.debug && this.waypoints) {
      push();
      
      // Draw all waypoints as small circles
      noStroke();
      fill(0, 255, 0, 100);
      for (let i = 0; i < this.waypoints.length; i++) {
        let wp = this.waypoints[i];
        circle(wp.x, wp.y, 8);
      }
      
      // Draw current target waypoint larger
      if (this.currentWaypointIndex < this.waypoints.length) {
        let target = this.waypoints[this.currentWaypointIndex];
        stroke(0, 255, 0);
        strokeWeight(2);
        line(this.pos.x, this.pos.y, target.x, target.y);
        fill(255, 255, 0);
        noStroke();
        circle(target.x, target.y, 16);
      }
      
      // Draw path line
      stroke(0, 255, 0, 150);
      strokeWeight(2);
      noFill();
      beginShape();
      vertex(this.pos.x, this.pos.y);
      for (let i = this.currentWaypointIndex; i < this.waypoints.length; i++) {
        vertex(this.waypoints[i].x, this.waypoints[i].y);
      }
      endShape();
      
      pop();
    }    // Dessiner la trajectoire
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
    this.currentPath = null; // Will be built on first update
    this.waypointIndex = 0;
    console.log(
      "Forklift assigned package at",
      pkg.pos.x.toFixed(1),
      pkg.pos.y.toFixed(1),
      "-> slot at",
      slot.pos.x.toFixed(1),
      slot.pos.y.toFixed(1)
    );
  }

  // Build A* path to target using routes network
  buildPathToTarget(routesNetwork) {
    let targetPos;
    switch (this.state) {
      case "COLLECTE":
        if (this.targetPackage) targetPos = this.targetPackage.pos;
        break;
      case "LIVRAISON":
        if (this.targetSlot) targetPos = this.targetSlot.pos;
        break;
      case "RETOUR":
        targetPos = this.parkingPos;
        break;
      default:
        return;
    }

    if (!targetPos) return;

    console.log(`[Forklift ${this.id}] Building path for ${this.state} from (${this.pos.x.toFixed(0)}, ${this.pos.y.toFixed(0)}) to (${targetPos.x.toFixed(0)}, ${targetPos.y.toFixed(0)})`);

    // Use A* to build path through route network
    let path = routesNetwork.buildPath(this.pos, targetPos);

    if (path && path.points && path.points.length > 0) {
      this.waypoints = path.points;
      this.currentWaypointIndex = 0;
      this.hasValidPath = true;
      console.log(`[Forklift ${this.id}] ✓ Built path with ${path.points.length} waypoints for ${this.state}`);
    } else {
      console.error(`[Forklift ${this.id}] ✗ FAILED to build path for state ${this.state}`);
      console.log(`  Start nearest node:`, routesNetwork.getNearestNode(this.pos));
      console.log(`  End nearest node:`, routesNetwork.getNearestNode(targetPos));
      console.log(`  Total nodes in network:`, routesNetwork.stations ? routesNetwork.stations.length : 0);
      console.log(`  Total paths/edges:`, routesNetwork.paths ? routesNetwork.paths.length : 0);
      this.waypoints = null;
      this.hasValidPath = false;
    }
  }

  // Suivi de waypoints: le chariot se déplace de point en point
  followWaypoints() {
    if (
      !this.currentPath ||
      !this.currentPath.points ||
      this.currentPath.points.length === 0
    ) {
      return createVector(0, 0);
    }

    const pts = this.currentPath.points;
    // Assurer l'index dans les bornes
    if (this.waypointIndex < 0) this.waypointIndex = 0;
    if (this.waypointIndex >= pts.length) this.waypointIndex = pts.length - 1;

    const target = pts[this.waypointIndex];
    const dist = p5.Vector.dist(this.pos, target);

    // Si proche, passer au point suivant
    if (
      dist < this.waypointReachRadius &&
      this.waypointIndex < pts.length - 1
    ) {
      this.waypointIndex++;
    }

    // Arrive sur le dernier point, sinon seek
    const isLast = this.waypointIndex >= pts.length - 1;
    return isLast ? this.arrive(target) : this.seek(target);
  }
}
