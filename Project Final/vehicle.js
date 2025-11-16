class Vehicle {
  static debug = false;

  constructor(x, y, image, pathColor = "white") {
    this.pos = createVector(x, y);
    this.vel = createVector(1, 0);
    this.acc = createVector(0, 0);
    this.maxSpeed = 4;
    this.maxForce = 0.2;
    this.r = 46;

    // sprite image du véhicule
    this.image = image;

    // pour comportement wander
    this.distanceCercle = 150;
    this.wanderRadius = 50;
    this.wanderTheta = PI / 2;
    this.displaceRange = 0.3;

    // trainée derrière les véhicules
    this.path = [];
    this.pathLength = 40;
    this.pathColor = pathColor;
  }

  wander() {
    // point devant le véhicule, centre du cercle
    let wanderPoint = this.vel.copy();
    wanderPoint.setMag(this.distanceCercle);
    wanderPoint.add(this.pos);

    if (Vehicle.debug) {
      // on dessine le cercle en rouge
      // on le dessine sous la forme d'une petit cercle rouge
      fill("red");
      noStroke();
      circle(wanderPoint.x, wanderPoint.y, 8);

      // on dessine le cercle autour
      // Cercle autour du point
      noFill();
      stroke("white");
      circle(wanderPoint.x, wanderPoint.y, this.wanderRadius * 2);

      // on dessine une ligne qui relie le vaisseau à ce point
      // c'est la ligne blanche en face du vaisseau
      line(this.pos.x, this.pos.y, wanderPoint.x, wanderPoint.y);
    }

    // On va s'occuper de calculer le point vert SUR LE CERCLE
    // il fait un angle wanderTheta avec le centre du cercle
    // l'angle final par rapport à l'axe des X c'est l'angle du vaisseau
    // + cet angle
    let theta = this.wanderTheta + this.vel.heading();

    let x = this.wanderRadius * cos(theta);
    let y = this.wanderRadius * sin(theta);

    // on rajoute ces distances au point rouge au centre du cercle
    wanderPoint.add(x, y);

    if (Vehicle.debug) {
      // on le dessine sous la forme d'un cercle vert
      fill("green");
      noStroke();
      circle(wanderPoint.x, wanderPoint.y, 16);

      // on dessine le vecteur qui va du centre du vaisseau
      // à ce point vert sur le cercle
      noFill();
      stroke("white");

      // on dessine une ligne qui relie le vaisseau à ce point
      // c'est la ligne blanche en face du vaisseau
      line(this.pos.x, this.pos.y, wanderPoint.x, wanderPoint.y);
    }

    // entre chaque image on va déplacer aléatoirement
    // le point vert en changeant un peu son angle...
    this.wanderTheta += random(-this.displaceRange, this.displaceRange);

    // D'après l'article, la force est égale au vecteur qui va du
    // centre du vaisseau, à ce point vert. On va aussi la limiter
    // à this.maxForce
    let force = p5.Vector.sub(wanderPoint, this.pos);
    // On met la force à maxForce
    force.setMag(this.maxForce);
    // on applique la force
    this.applyForce(force);

    // et on la renvoie au cas où....
    return force;
  }

  evade(vehicle) {
    let pursuit = this.pursue(vehicle);
    pursuit.mult(-1);
    return pursuit;
  }

  pursue(vehicle) {
    let target = vehicle.pos.copy();
    let prediction = vehicle.vel.copy();
    prediction.mult(10);
    target.add(prediction);
    fill(0, 255, 0);
    circle(target.x, target.y, 16);
    return this.seek(target);
  }

  arrive(target) {
    // 2nd argument true enables the arrival behavior
    return this.seek(target, true);
  }

  flee(target) {
    return this.seek(target).mult(-1);
  }

  seek(target, arrival = false) {
    let force = p5.Vector.sub(target, this.pos);
    let desiredSpeed = this.maxSpeed;
    if (arrival) {
      let slowRadius = 100;
      let distance = force.mag();
      if (distance < slowRadius) {
        desiredSpeed = map(distance, 0, slowRadius, 0, this.maxSpeed);
      }
    }
    force.setMag(desiredSpeed);
    force.sub(this.vel);
    force.limit(this.maxForce);
    return force;
  }

  // Comportement Separation : on garde ses distances par rapport aux voisins
  // Obstacle avoidance behavior - looks ahead and steers away from obstacles/other vehicles
  avoid(obstacles) {
    // Look ahead vector (30 frames ahead)
    let ahead = this.vel.copy();
    ahead.mult(30);

    // Shorter look ahead (15 frames)
    let ahead2 = this.vel.copy();
    ahead2.mult(15);

    let pointAuBoutDeAhead = p5.Vector.add(this.pos, ahead);
    let pointAuBoutDeAhead2 = p5.Vector.add(this.pos, ahead2);

    // Debug visualization
    if (Vehicle.debug) {
      this.drawVector(this.pos, ahead, "yellow");
      this.drawVector(this.pos, ahead2, "purple");

      push();
      fill("red");
      circle(pointAuBoutDeAhead.x, pointAuBoutDeAhead.y, 10);
      fill("lightblue");
      circle(pointAuBoutDeAhead2.x, pointAuBoutDeAhead2.y, 10);

      // Draw avoidance zone
      stroke(255, 50);
      strokeWeight(this.r);
      line(this.pos.x, this.pos.y, pointAuBoutDeAhead.x, pointAuBoutDeAhead.y);
      pop();
    }

    // Find closest obstacle from the list
    let closestObstacle = null;
    let minDist = Infinity;

    for (let obstacle of obstacles) {
      if (obstacle === this) continue; // Skip self
      let d = p5.Vector.dist(this.pos, obstacle.pos);
      if (d < minDist) {
        minDist = d;
        closestObstacle = obstacle;
      }
    }

    if (!closestObstacle) return createVector(0, 0);

    // Calculate distances from look-ahead points to closest obstacle
    let distance1 = p5.Vector.dist(pointAuBoutDeAhead, closestObstacle.pos);
    let distance2 = p5.Vector.dist(pointAuBoutDeAhead2, closestObstacle.pos);
    let distance3 = p5.Vector.dist(this.pos, closestObstacle.pos);

    let closestPoint = pointAuBoutDeAhead;
    let minDistance = distance1;

    if (distance2 < minDistance) {
      minDistance = distance2;
      closestPoint = pointAuBoutDeAhead2;
    }
    if (distance3 < minDistance) {
      minDistance = distance3;
      closestPoint = this.pos;
    }

    // Check if we're in collision range
    let obstacleRadius = closestObstacle.r || 30;
    let avoidanceZone = obstacleRadius + this.r;

    if (minDistance < avoidanceZone) {
      // Calculate avoidance force - steer away from obstacle
      let force = p5.Vector.sub(closestPoint, closestObstacle.pos);

      if (Vehicle.debug) {
        this.drawVector(closestObstacle.pos, force, "yellow");
      }

      force.setMag(this.maxForce);
      return force;
    }

    return createVector(0, 0);
  }

  separate(vehicles) {
    let desiredSeparation = this.r * 2;
    let steer = createVector(0, 0);
    let count = 0;

    // On examine les autres véhicules pour voir s'ils sont trop près
    for (let i = 0; i < vehicles.length; i++) {
      let other = vehicles[i];
      let d = p5.Vector.dist(this.pos, other.pos);

      // Si la distance est > 0 (pas soi-même) et < distance désirée
      if (d > 0 && d < desiredSeparation) {
        // Calculer un vecteur qui pointe à l'opposé du voisin
        let diff = p5.Vector.sub(this.pos, other.pos);
        diff.normalize();
        diff.div(d); // Poids inversement proportionnel à la distance
        steer.add(diff);
        count++;
      }
    }

    // Moyenne basée sur le nombre de voisins
    if (count > 0) {
      steer.div(count);
      // Implémenter: Steering = Desired - Velocity
      steer.normalize();
      steer.mult(this.maxSpeed);
      steer.sub(this.vel);
      steer.limit(this.maxForce);
    }

    return steer;
  }

  applyForce(force) {
    this.acc.add(force);
  }

  // Path following for open polylines
  // path: { points: p5.Vector[], radius: number, closed?: boolean }
  follow(path) {
    if (!path || !path.points || path.points.length < 2)
      return createVector(0, 0);

    let predict = this.vel.copy();
    predict.normalize();
    predict.mult(25);
    let predictPos = p5.Vector.add(this.pos, predict);

    let normal = null;
    let target = null;
    let record = Infinity;

    const pts = path.points;
    const n = pts.length;
    const last = path.closed ? n : n - 1;

    for (let i = 0; i < last; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % n];
      let normalPoint = findProjectionPF(predictPos, a, b);

      const minX = Math.min(a.x, b.x) - 0.0001;
      const maxX = Math.max(a.x, b.x) + 0.0001;
      const minY = Math.min(a.y, b.y) - 0.0001;
      const maxY = Math.max(a.y, b.y) + 0.0001;
      if (
        normalPoint.x < minX ||
        normalPoint.x > maxX ||
        normalPoint.y < minY ||
        normalPoint.y > maxY
      ) {
        normalPoint = b.copy();
      }

      const d = p5.Vector.dist(predictPos, normalPoint);
      if (d < record) {
        record = d;
        normal = normalPoint;
        let dir = p5.Vector.sub(b, a);
        dir.normalize();
        dir.mult(25);
        target = normal.copy();
        target.add(dir);
      }
    }

    // Debug visualization matching 5-3-PathFollowingComplex style
    if (Vehicle.debug && normal && target) {
      push();
      // Line from vehicle position to predicted position
      stroke(0);
      fill(0);
      line(this.pos.x, this.pos.y, predictPos.x, predictPos.y);

      // Predicted position (small black circle)
      ellipse(predictPos.x, predictPos.y, 4, 4);

      // Normal point (projected point on path - black circle)
      stroke(0);
      fill(0);
      ellipse(normal.x, normal.y, 4, 4);

      // Line from predicted to target
      line(predictPos.x, predictPos.y, target.x, target.y);

      // Target point (red if off-path, otherwise normal)
      if (record > (path.radius || 20)) {
        fill(255, 0, 0);
      }
      noStroke();
      ellipse(target.x, target.y, 8, 8);
      pop();
    }

    const radius = path.radius !== undefined ? path.radius : 20;
    if (record > radius) {
      return this.seek(target || predictPos);
    }
    return createVector(0, 0);
  }

  update() {
    this.vel.add(this.acc);
    this.vel.limit(this.maxSpeed);
    this.pos.add(this.vel);
    this.acc.set(0, 0);

    // on rajoute la position courante dans le tableau du chemin
    this.path.push(this.pos.copy());

    // si le tableau a plus de this.pathLength éléments, on vire le plus ancien
    if (this.path.length > this.pathLength) {
      this.path.shift();
    }
  }

  show() {
    // dessin du chemin
    this.path.forEach((p, index) => {
      if (!(index % 3)) {
        stroke(this.pathColor);
        fill(this.pathColor);
        circle(p.x, p.y, 1);
      }
    });

    // dessin du vaisseau
    push();
    translate(this.pos.x, this.pos.y);
    rotate(this.vel.heading() - PI / 2);
    imageMode(CENTER);
    image(this.image, 0, 0, this.r * 2, this.r * 2);
    pop();
  }

  edges() {
    if (this.pos.x > width + this.r) {
      this.pos.x = -this.r;
    } else if (this.pos.x < -this.r) {
      this.pos.x = width + this.r;
    }
    if (this.pos.y > height + this.r) {
      this.pos.y = -this.r;
    } else if (this.pos.y < -this.r) {
      this.pos.y = height + this.r;
    }
  }

  // Draw a vector for debug visualization
  drawVector(pos, v, color) {
    push();
    strokeWeight(3);
    stroke(color);
    line(pos.x, pos.y, pos.x + v.x, pos.y + v.y);
    // Draw arrow at the end of the vector
    let arrowSize = 5;
    translate(pos.x + v.x, pos.y + v.y);
    rotate(v.heading());
    translate(-arrowSize / 2, 0);
    fill(color);
    noStroke();
    triangle(0, arrowSize / 2, 0, -arrowSize / 2, arrowSize, 0);
    pop();
  }
}

// Helper for path-following projection
function findProjectionPF(p, a, b) {
  let ap = p5.Vector.sub(p, a);
  let ab = p5.Vector.sub(b, a);
  ab.normalize();
  ab.mult(ap.dot(ab));
  return p5.Vector.add(a, ab);
}
