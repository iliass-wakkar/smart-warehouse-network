// Parking UI and layout manager
// Generates parking spots and draws the parking area

class Parking {
  constructor(rect, count = 3, options = {}) {
    this.rect = rect; // {x, y, w, h}
    this.count = count;
    this.options = Object.assign(
      {
        spotWidth: 60,
        spotHeight: 80,
        marginX: 60,
        label: "PARKING",
        showIndices: true,
        strokeColor: color(255, 220),
        fillColor: color(100, 100, 150, 100),
        labelColor: color(255),
        // Ports (points d'entrée/sortie du parking)
        portsCount: 2,
        portColor: color(255, 0, 255), // Magenta vif pour bien voir
        portSize: 16,
        // Bords où placer les ports: options: 'top', 'right', 'bottom', 'left'
        // Par défaut: haut et gauche
        portEdges: ["top", "left"],
        // Contrôles manuels: soit un tableau XY exact, soit réglages par bord
        manualPorts: null, // [{x:..., y:...}, ...]
        topPorts: null, // { count, startX, gap, offsetY }
        rightPorts: null, // { count, startY, gap, offsetX }
      },
      options
    );

    this.spots = [];
    this.ports = [];
    this.layoutSpots();
    this.layoutPorts();
  }

  setCount(count) {
    this.count = count;
    this.layoutSpots();
  }

  getSpots() {
    return this.spots;
  }

  getSpot(i) {
    return this.spots[i % this.spots.length];
  }

  getPorts() {
    return this.ports;
  }

  // Plain XY values for integration
  getPortsXY() {
    return this.ports.map((p) => ({ x: p.x, y: p.y }));
  }

  layoutSpots() {
    this.spots = [];
    const { x, y, w, h } = this.rect;
    const marginX = this.options.marginX;
    const baseY = y + h - 80;
    const availableW = w - marginX * 2;

    for (let i = 0; i < this.count; i++) {
      const t = this.count > 1 ? i / (this.count - 1) : 0.5;
      const sx = x + marginX + t * availableW;
      const sy = baseY;
      this.spots.push(createVector(sx, sy));
    }
  }

  layoutPorts() {
    this.ports = [];
    const { x, y, w, h } = this.rect;
    const n = max(1, this.options.portsCount | 0);
    const edges =
      Array.isArray(this.options.portEdges) && this.options.portEdges.length
        ? this.options.portEdges
        : ["top", "left"]; // fallback

    // 1) Si des ports manuels XY sont fournis, on les utilise tels quels
    if (
      Array.isArray(this.options.manualPorts) &&
      this.options.manualPorts.length
    ) {
      for (const p of this.options.manualPorts) {
        this.ports.push(createVector(p.x, p.y));
      }
      return;
    }

    // 2) Sinon, ports réguliers sur le haut et la droite avec réglages simples
    const topCfg = this.options.topPorts;
    const rightCfg = this.options.rightPorts;
    let placed = 0;

    if (topCfg && topCfg.count > 0) {
      const count = topCfg.count | 0;
      const startX = topCfg.startX !== undefined ? topCfg.startX : x + 80;
      const gap = topCfg.gap !== undefined ? topCfg.gap : 120;
      const py = topCfg.offsetY !== undefined ? y + topCfg.offsetY : y + 12;
      for (let i = 0; i < count; i++) {
        const px = startX + i * gap;
        this.ports.push(createVector(px, py));
      }
      placed += count;
    }

    if (rightCfg && rightCfg.count > 0) {
      const count = rightCfg.count | 0;
      const startY = rightCfg.startY !== undefined ? rightCfg.startY : y + 80;
      const gap = rightCfg.gap !== undefined ? rightCfg.gap : 120;
      const px =
        rightCfg.offsetX !== undefined ? x + w - rightCfg.offsetX : x + w - 12;
      for (let i = 0; i < count; i++) {
        const py = startY + i * gap;
        this.ports.push(createVector(px, py));
      }
      placed += count;
    }

    if (placed > 0) return;

    // 3) Fallback: distribution automatique basée sur portEdges/portsCount

    // Répartir n ports entre les bords choisis (espacement linéaire)
    const counts = new Array(edges.length).fill(0);
    for (let i = 0; i < n; i++) counts[i % edges.length]++;

    let idx = 0;
    for (let e = 0; e < edges.length; e++) {
      const edge = edges[e];
      const cnt = counts[e];
      if (cnt === 0) continue;

      if (edge === "top") {
        const startX = x + 80;
        const endX = x + w - 80;
        const py = y + 12;
        for (let k = 0; k < cnt; k++, idx++) {
          const t = cnt > 1 ? k / (cnt - 1) : 0.5;
          const px = lerp(startX, endX, t);
          this.ports.push(createVector(px, py));
        }
      } else if (edge === "left") {
        const startY = y + 80;
        const endY = y + h - 120;
        const px = x + 12;
        for (let k = 0; k < cnt; k++, idx++) {
          const t = cnt > 1 ? k / (cnt - 1) : 0.5;
          const py = lerp(startY, endY, t);
          this.ports.push(createVector(px, py));
        }
      } else if (edge === "right") {
        const startY = y + h - 120;
        const endY = y + 80;
        const px = x + w - 12;
        for (let k = 0; k < cnt; k++, idx++) {
          const t = cnt > 1 ? k / (cnt - 1) : 0.5;
          const py = lerp(startY, endY, t);
          this.ports.push(createVector(px, py));
        }
      } else if (edge === "bottom") {
        const startX = x + 80;
        const endX = x + w - 80;
        const py = y + h - 12;
        for (let k = 0; k < cnt; k++, idx++) {
          const t = cnt > 1 ? k / (cnt - 1) : 0.5;
          const px = lerp(startX, endX, t);
          this.ports.push(createVector(px, py));
        }
      }
    }
  }

  display() {
    const { x, y, w, h } = this.rect;
    // Zone background
    push();
    noStroke();
    fill(this.options.fillColor);
    rect(x, y, w, h);
    pop();

    // Label
    push();
    fill(this.options.labelColor);
    textAlign(LEFT);
    text(this.options.label, x + 50, y + 50);
    pop();

    // Spots
    push();
    rectMode(CENTER);
    noFill();
    stroke(this.options.strokeColor);
    strokeWeight(2);
    for (let i = 0; i < this.spots.length; i++) {
      const p = this.spots[i];
      rect(p.x, p.y, this.options.spotWidth, this.options.spotHeight, 6);
      if (this.options.showIndices) {
        noStroke();
        fill(255);
        textAlign(CENTER, BOTTOM);
        textSize(12);
        text(i + 1, p.x, p.y - this.options.spotHeight / 2 + 10);
        stroke(this.options.strokeColor);
        noFill();
      }
    }
    pop();

    // Ports (petits points indiquant les entrées/sorties)
    push();
    noStroke();
    fill(this.options.portColor);
    for (let p of this.ports) {
      circle(p.x, p.y, this.options.portSize);
    }
    pop();
  }
}
