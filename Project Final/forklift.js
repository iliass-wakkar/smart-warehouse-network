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

    // Conflict detection and replanning
    this.conflictDetected = false; // Flag when reservation conflict detected
    this.replanAttempts = 0; // Track replanning attempts
    this.maxReplanAttempts = 3; // Max attempts before giving up

    // Stop drifting by default (override Vehicle's initial velocity)
    if (this.vel) this.vel.set(0, 0);

    // Optional time-aware schedule returned by planner
    this.plannedSchedule = null; // array of {x,y,t}
    this.plannedStartFrame = 0;
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

  // Check if our planned path has reservation conflicts ahead
  detectPathConflict(routesNetwork) {
    if (!this.plannedSchedule || this.plannedSchedule.length === 0)
      return false;
    if (!routesNetwork || typeof routesNetwork.isNodeReservedAt !== "function")
      return false;

    const now = typeof frameCount !== "undefined" ? frameCount : 0;
    const lookAhead = 60; // Check next 1 second

    // Check if any of our scheduled nodes are now reserved by others
    for (let i = 0; i < this.plannedSchedule.length; i++) {
      const state = this.plannedSchedule[i];
      if (state.t < now || state.t > now + lookAhead) continue;

      const node = { x: state.x, y: state.y };
      if (routesNetwork.isNodeReservedAt(node, state.t, this.id)) {
        console.log(
          `[Forklift ${this.id}] ⚠️ Conflict detected at node (${state.x}, ${state.y}) at t=${state.t}`
        );
        return true;
      }
    }

    return false;
  }

  runFSM(otherForklifts = [], routesNetwork = null) {
    let force = createVector(0, 0);
    let avoidForce = createVector(0, 0);

    // If we have a time-aware plan, do not depart before planned start
    if (this.plannedSchedule && this.plannedSchedule.length > 0) {
      const now = typeof frameCount !== "undefined" ? frameCount : 0;
      const startT = this.plannedSchedule[0].t || this.plannedStartFrame || 0;
      if (now < startT) {
        // Hold position until scheduled departure
        return createVector(0, 0);
      }
    }

    // Check for path conflicts and trigger replanning if needed
    if (routesNetwork && this.hasValidPath && !this.conflictDetected) {
      this.conflictDetected = this.detectPathConflict(routesNetwork);
      if (
        this.conflictDetected &&
        this.replanAttempts < this.maxReplanAttempts
      ) {
        console.log(
          `[Forklift ${
            this.id
          }] 🔄 Conflict! Attempting automatic replan (attempt ${
            this.replanAttempts + 1
          }/${this.maxReplanAttempts})`
        );
        this.hasValidPath = false;
        this.waypoints = null;
        this.plannedSchedule = null;
        this.replanAttempts++;
        this.conflictDetected = false;
        return createVector(0, 0); // Stop briefly while replanning
      }
    }

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
        // Stay at current position if idle - only return to parking if far from it and no task
        const distanceToParking = p5.Vector.dist(this.pos, this.parkingPos);
        
        // Only move back to parking if we're far away (e.g., at warehouse after delivery)
        // and we've been idle for a while
        if (distanceToParking > 200) {
          // We're far from parking, go back gradually
          if (!this.hasValidPath) {
            // Build path back to parking only once
            this.state = "RETOUR";
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
            // Finished waypoints, arrive at parking
            force = this.arrive(this.parkingPos);
          }
        } else {
          // Close to parking or at work area - just stay put
          force = createVector(0, 0);
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
            this.replanAttempts = 0; // Reset replan counter on success
            this.conflictDetected = false;
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
            this.state = "ATTENTE"; // Go to ATTENTE instead of RETOUR - ready for next task
            this.waypoints = null;
            this.currentWaypointIndex = 0;
            this.hasValidPath = false;
            this.obstacleDetected = false;
            this.stoppedForObstacle = false;
            this.replanAttempts = 0; // Reset replan counter on success
            this.conflictDetected = false;
          }
        }
        break;

      case "RETOUR":
        // Build path to parking if needed
        if (!this.hasValidPath) {
          // Will trigger buildPathToTarget in sketch which builds path to parkingPos
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
          this.replanAttempts = 0; // Reset replan counter on success
          this.conflictDetected = false;
        }
        break;
    }

    return force;
  }

  update(otherForklifts = [], routesNetwork = null) {
    let force = this.runFSM(otherForklifts, routesNetwork);
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

      // Draw waypoint reach radius around current position
      noFill();
      stroke(255, 255, 0, 100);
      strokeWeight(1);
      circle(this.pos.x, this.pos.y, this.waypointReachRadius * 2);

      // Draw obstacle detection range
      stroke(255, 100, 0, 80);
      strokeWeight(1);
      circle(this.pos.x, this.pos.y, this.obstacleCheckDistance * 2);

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

      // Draw time-aware schedule if available
      if (this.plannedSchedule && this.plannedSchedule.length > 0) {
        const now = typeof frameCount !== "undefined" ? frameCount : 0;

        // Draw schedule timeline
        for (let i = 0; i < this.plannedSchedule.length; i++) {
          const s = this.plannedSchedule[i];
          const isPast = s.t < now;
          const isCurrent = i === this.currentWaypointIndex;

          // Color based on status
          if (isPast) {
            fill(100, 100, 100, 80); // Gray for past
          } else if (isCurrent) {
            fill(255, 255, 0, 200); // Yellow for current
          } else {
            fill(0, 200, 255, 150); // Cyan for future
          }

          noStroke();
          circle(s.x, s.y, 10);

          // Show time offset from now
          if (!isPast && i < 10) {
            // Limit text to avoid clutter
            const deltaT = s.t - now;
            const deltaSeconds = (deltaT / 60).toFixed(1);
            fill(255);
            textSize(8);
            textAlign(CENTER, TOP);
            text(`+${deltaSeconds}s`, s.x, s.y + 8);
          }
        }

        // Draw schedule info box
        const scheduleInfo = `Schedule: ${this.plannedSchedule.length} states | Start: ${this.plannedStartFrame}`;
        fill(0, 150);
        noStroke();
        const boxW = textWidth(scheduleInfo) + 10;
        rect(this.pos.x - boxW / 2, this.pos.y - 50, boxW, 15, 3);
        fill(0, 255, 255);
        textSize(9);
        textAlign(CENTER, CENTER);
        text(scheduleInfo, this.pos.x, this.pos.y - 42);
      }

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
    }

    // Show waiting for schedule indicator
    if (
      Vehicle.debug &&
      this.plannedSchedule &&
      this.plannedSchedule.length > 0
    ) {
      const now = typeof frameCount !== "undefined" ? frameCount : 0;
      const startT = this.plannedSchedule[0].t || this.plannedStartFrame || 0;
      if (now < startT) {
        push();
        fill(255, 200, 0, 150);
        noStroke();
        circle(this.pos.x, this.pos.y, this.r * 2.5);
        fill(255);
        textAlign(CENTER, CENTER);
        textSize(10);
        const waitTime = ((startT - now) / 60).toFixed(1);
        text(`WAIT ${waitTime}s`, this.pos.x, this.pos.y - this.r * 1.5);
        pop();
      }
    }

    // Show conflict/replanning indicator
    if (Vehicle.debug && this.conflictDetected) {
      push();
      fill(255, 100, 0, 200);
      noStroke();
      circle(this.pos.x, this.pos.y, this.r * 3);
      fill(255);
      textAlign(CENTER, CENTER);
      textSize(11);
      text(
        `REPLAN ${this.replanAttempts}/${this.maxReplanAttempts}`,
        this.pos.x,
        this.pos.y - this.r * 2
      );
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

    // Clear any old reservations for this forklift (spatial + time-aware)
    routesNetwork.clearReservations(this.id);
    if (typeof routesNetwork.clearTimeReservationsFor === "function") {
      routesNetwork.clearTimeReservationsFor(this.id);
    }

    // First try time-aware planning to avoid conflicts
    let path = null;
    if (typeof routesNetwork.planTimeAwarePath === "function") {
      try {
        path = routesNetwork.planTimeAwarePath(this.pos, targetPos, this.id, {
          speed: Math.max(0.1, this.maxSpeed || 4),
          startFrame: typeof frameCount !== "undefined" ? frameCount : 0,
        });
        if (path) {
          console.log(
            `[Forklift ${this.id}] ✓ Time-aware plan found (states: ${
              path.schedule ? path.schedule.length : "-"
            })`
          );
        }
      } catch (e) {
        console.warn(
          `[Forklift ${this.id}] Time-aware planning error, falling back:`,
          e
        );
        path = null;
      }
    }

    // Fallback: Use spatial A* to build path through route network (avoids reserved edges)
    if (!path) {
      path = routesNetwork.buildPath(this.pos, targetPos, this.id);
    }

    if (path && path.points && path.points.length > 0) {
      this.waypoints = path.points;
      this.currentWaypointIndex = 0;
      this.hasValidPath = true;

      // Store time-aware schedule if provided
      this.plannedSchedule = path.schedule || null;
      this.plannedStartFrame =
        this.plannedSchedule && this.plannedSchedule.length > 0
          ? this.plannedSchedule[0].t
          : 0;

      // Reserve this path spatially so other forklifts avoid it (legacy spatial reservations)
      if (typeof routesNetwork.reserveWaypoints === "function") {
        routesNetwork.reserveWaypoints(this.waypoints, this.id);
      }

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
      this.plannedSchedule = null;
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
