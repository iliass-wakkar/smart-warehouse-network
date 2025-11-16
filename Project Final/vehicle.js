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
}
