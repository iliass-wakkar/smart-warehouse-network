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

    // Obstacle detection and stopping
    this.obstacleDetected = false; // Flag when obstacle is in the way
    this.stoppedForObstacle = false; // Flag when stopped for obstacle
    this.obstacleCheckDistance = 80; // Distance to look ahead for obstacles
    this.recalculateTimer = 0; // Frames to wait before recalculating
    this.recalculateDelay = 30; // Wait 0.5 seconds before recalculating (at 60fps)

    // Stop drifting by default (override Vehicle's initial velocity)
    if (this.vel) this.vel.set(0, 0);
  }

  // Check if there's an obstacle blocking our path
  detectObstacleAhead(otherForklifts) {
    if (!this.waypoints || this.currentWaypointIndex >= this.waypoints.length) {
      return false;
    }

    // Check direction we're heading
    let target = this.waypoints[this.currentWaypointIndex];
    let directionToTarget = p5.Vector.sub(target, this.pos);
    let distToTarget = directionToTarget.mag();

    // Only check if we're moving
    if (distToTarget < 5) return false;

    directionToTarget.normalize();

    // Check each other forklift
    for (let other of otherForklifts) {
      if (other === this) continue;

      let toOther = p5.Vector.sub(other.pos, this.pos);
      let distToOther = toOther.mag();

      // Is the other forklift close enough to be a problem?
      if (distToOther > this.obstacleCheckDistance) continue;

      // Is the other forklift in our path direction?
      toOther.normalize();
      let alignment = directionToTarget.dot(toOther);

      // If alignment > 0.7, they're in our path (within ~45 degrees)
      if (alignment > 0.7 && distToOther < this.obstacleCheckDistance) {
        return true;
      }
    }

    return false;
  }

  runFSM(otherForklifts = []) {
    let force = createVector(0, 0);
    let avoidForce = createVector(0, 0);

    // Detect obstacles ahead
    this.obstacleDetected = this.detectObstacleAhead(otherForklifts);

    // If obstacle detected and we're moving, stop and prepare to recalculate
    if (this.obstacleDetected && !this.stoppedForObstacle) {
      // Stop the forklift
      this.vel.mult(0.5); // Brake
      this.stoppedForObstacle = true;
      this.recalculateTimer = 0;
      console.log(`[Forklift ${this.id}] Obstacle detected! Stopping...`);
    }

    // If stopped for obstacle, wait then recalculate route
    if (this.stoppedForObstacle) {
      this.recalculateTimer++;

      // Still detecting obstacle - keep waiting
      if (this.obstacleDetected) {
        this.recalculateTimer = 0; // Reset timer
        return createVector(0, 0); // Don't move
      }

      // Obstacle cleared - wait a bit then recalculate
      if (this.recalculateTimer >= this.recalculateDelay) {
        console.log(
          `[Forklift ${this.id}] Obstacle cleared! Recalculating route...`
        );
        this.hasValidPath = false; // Force path recalculation
        this.waypoints = null;
        this.stoppedForObstacle = false;
        this.recalculateTimer = 0;
      } else {
        // Still waiting
        return createVector(0, 0);
      }
    }

    // Apply obstacle avoidance to avoid other forklifts
    if (otherForklifts.length > 0) {
      avoidForce = this.avoid(otherForklifts);
      avoidForce.mult(2.5); // Strong avoidance
    }

    switch (this.state) {
      case "ATTENTE":
        // Stay at parking - only move if we have waypoints
        if (
          this.hasValidPath &&
          this.waypoints &&
          this.currentWaypointIndex < this.waypoints.length
        ) {
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
        force.add(avoidForce);
        break;

      case "COLLECTE":
        // Follow waypoints to package - only move if we have a valid path
        if (this.targetPackage) {
          if (!this.hasValidPath) {
            // No valid path - don't move
            force = createVector(0, 0);
          } else if (
            this.waypoints &&
            this.currentWaypointIndex < this.waypoints.length
          ) {
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

          force.add(avoidForce);

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
            this.obstacleDetected = false;
            this.stoppedForObstacle = false;
            // Note: reservations will be cleared when building new path
          }
        }
        break;

      case "LIVRAISON":
        // Follow waypoints to storage slot - only move if we have a valid path
        if (this.targetSlot) {
          if (!this.hasValidPath) {
            // No valid path - don't move
            force = createVector(0, 0);
          } else if (
            this.waypoints &&
            this.currentWaypointIndex < this.waypoints.length
          ) {
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

          force.add(avoidForce);

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
            this.obstacleDetected = false;
            this.stoppedForObstacle = false;
          }
        }
        break;

      case "RETOUR":
        // Follow waypoints back to parking - only move if we have a valid path
        if (!this.hasValidPath) {
          // No valid path - don't move
          force = createVector(0, 0);
        } else if (
          this.waypoints &&
          this.currentWaypointIndex < this.waypoints.length
        ) {
          let target = this.waypoints[this.currentWaypointIndex];
          force = this.arrive(target);
          if (p5.Vector.dist(this.pos, target) < this.waypointReachRadius) {
            this.currentWaypointIndex++;
          }
        } else {
          // Finished waypoints - arrive at parking
          force = this.arrive(this.parkingPos);
        }

        force.add(avoidForce);

        let distance = p5.Vector.dist(this.pos, this.parkingPos);
        if (distance < 50) {
          this.state = "ATTENTE";
          this.waypoints = null;
          this.currentWaypointIndex = 0;
          this.hasValidPath = false;
        }
        break;
    }

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
    }

    // Show obstacle warning when stopped
    if (this.stoppedForObstacle) {
      push();
      fill(255, 0, 0, 150);
      noStroke();
      circle(this.pos.x, this.pos.y, this.r * 3);
      fill(255);
      textAlign(CENTER, CENTER);
      textSize(12);
      text("STOP", this.pos.x, this.pos.y - this.r * 2);
      pop();
    } // Dessiner la trajectoire
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

    console.log(
      `[Forklift ${this.id}] Building path for ${
        this.state
      } from (${this.pos.x.toFixed(0)}, ${this.pos.y.toFixed(
        0
      )}) to (${targetPos.x.toFixed(0)}, ${targetPos.y.toFixed(0)})`
    );

    // Clear any old reservations for this forklift
    routesNetwork.clearReservations(this.id);

    // Use A* to build path through route network, passing our ID to avoid reserved paths
    let path = routesNetwork.buildPath(this.pos, targetPos, this.id);

    if (path && path.points && path.points.length > 0) {
      this.waypoints = path.points;
      this.currentWaypointIndex = 0;
      this.hasValidPath = true;

      // Reserve this path so other forklifts avoid it
      routesNetwork.reserveWaypoints(this.waypoints, this.id);

      console.log(
        `[Forklift ${this.id}] ✓ Built path with ${path.points.length} waypoints for ${this.state}`
      );
    } else {
      console.error(
        `[Forklift ${this.id}] ✗ FAILED to build path for state ${this.state}`
      );
      console.log(
        `  Start nearest node:`,
        routesNetwork.getNearestNode(this.pos)
      );
      console.log(
        `  End nearest node:`,
        routesNetwork.getNearestNode(targetPos)
      );
      console.log(
        `  Total nodes in network:`,
        routesNetwork.stations ? routesNetwork.stations.length : 0
      );
      console.log(
        `  Total paths/edges:`,
        routesNetwork.paths ? routesNetwork.paths.length : 0
      );
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
