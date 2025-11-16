// ============= WAREHOUSE MANAGEMENT CLASS =============
// Handles all warehouse storage display and logic

class Warehouse {
  constructor(x, y, width, height, numSections, numRacks, options = {}) {
    // Position and dimensions
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;

    // Structure configuration
    this.numSections = numSections; // 6 columns
    this.numRacks = numRacks; // 4 rows
    this.positionsPerRack = 2; // 2x2 grid per cell
    this.paddingRatio = 0; // Percentage padding relative to warehouse size

    // Options
    this.options = Object.assign(
      {
        showLineEndpoints: true,
        endpointColor: color(255, 0, 255),
        endpointSize: 12,
      },
      options
    );

    // Storage slots
    this.slots = [];

    // Padding and calculated dimensions
    this.calculateDimensions();
    this.createSlots();
  }

  calculateDimensions() {
    // Calculate cell dimensions based on current warehouse size
    this.padding = min(this.width, this.height) * this.paddingRatio;
    this.availWidth = this.width - this.padding * 2;
    this.availHeight = this.height - this.padding * 2;
    this.cellWidth = this.availWidth / this.numSections;
    this.cellHeight = this.availHeight / this.numRacks;

    // Calculate automatic slot size so that placeholders center within each cell
    let potentialSlotWidth = this.cellWidth / (this.positionsPerRack + 1);
    let potentialSlotHeight = this.cellHeight / (this.positionsPerRack + 1);
    this.slotSize = min(potentialSlotWidth, potentialSlotHeight);

    // Offset between each slot and the cell borders (automatic padding inside cell)
    this.slotOffsetX =
      (this.cellWidth - this.positionsPerRack * this.slotSize) /
      (this.positionsPerRack + 1);
    this.slotOffsetY =
      (this.cellHeight - this.positionsPerRack * this.slotSize) /
      (this.positionsPerRack + 1);
  }

  createSlots() {
    // Clear existing slots
    this.slots = [];

    let slotIndex = 1;

    for (let section = 0; section < this.numSections; section++) {
      for (let rackRow = 0; rackRow < this.numRacks; rackRow++) {
        for (let posRow = 0; posRow < this.positionsPerRack; posRow++) {
          for (let posCol = 0; posCol < this.positionsPerRack; posCol++) {
            let slot = new StorageSlot(0, 0, null, null);
            slot.id = slotIndex;
            slot.section = section + 1;
            slot.rack = rackRow + 1;
            slot.posX = posCol + 1;
            slot.posY = posRow + 1;
            slot.size = this.slotSize;

            this.slots.push(slot);
            slotIndex++;
          }
        }
      }
    }
  }

  updateSlotPositions() {
    // Recalculate all slot positions based on current warehouse dimensions
    this.calculateDimensions();

    for (let slot of this.slots) {
      let section = slot.section - 1;
      let rackRow = slot.rack - 1;
      let posCol = slot.posX - 1;
      let posRow = slot.posY - 1;

      // Calculate responsive position
      let cellX = this.x + this.padding + section * this.cellWidth;
      let cellY = this.y + this.padding + rackRow * this.cellHeight;

      slot.pos.x =
        cellX +
        this.slotOffsetX +
        posCol * (this.slotSize + this.slotOffsetX) +
        this.slotSize / 2;
      slot.pos.y =
        cellY +
        this.slotOffsetY +
        posRow * (this.slotSize + this.slotOffsetY) +
        this.slotSize / 2;
      slot.size = this.slotSize;
    }
  }

  display() {
    // Update positions each frame (responsive)
    this.updateSlotPositions();

    // Draw warehouse background
    fill(100, 150, 100, 80);
    rect(this.x, this.y, this.width, this.height);

    // Draw grid lines (sections and racks)
    stroke(150, 200, 150);
    strokeWeight(1);

    // Vertical lines (section separators)
    for (let i = 1; i < this.numSections; i++) {
      let lineX = this.x + i * this.cellWidth;
      line(lineX, this.y, lineX, this.y + this.height);
    }
    // Endpoints at top of vertical lines
    if (this.options.showLineEndpoints) {
      push();
      noStroke();
      fill(this.options.endpointColor);
      for (let i = 1; i < this.numSections; i++) {
        let lineX = this.x + i * this.cellWidth;
        circle(lineX, this.y, this.options.endpointSize);
      }
      pop();
    }

    // Horizontal lines (rack separators)
    for (let i = 1; i < this.numRacks; i++) {
      let lineY = this.y + i * this.cellHeight;
      line(this.x, lineY, this.x + this.width, lineY);
    }
    // Endpoints at left of horizontal lines
    if (this.options.showLineEndpoints) {
      push();
      noStroke();
      fill(this.options.endpointColor);
      for (let i = 1; i < this.numRacks; i++) {
        let lineY = this.y + i * this.cellHeight;
        circle(this.x, lineY, this.options.endpointSize);
      }
      pop();
    }

    // Draw title and info
    fill(255);
    textSize(20);
    text("WAREHOUSE STORAGE", this.x + 250, this.y - 30);
    textSize(12);
    text(
      "Total: " + this.slots.length + " positions",
      this.x + 315,
      this.y - 15
    );

    // Display all storage slots
    for (let slot of this.slots) {
      slot.display();
    }
  }

  getSlots() {
    return this.slots;
  }

  // Centers of all storage slots as vectors
  getSlotCenters() {
    // Ensure slot positions are up to date
    this.updateSlotPositions();
    const pts = [];
    for (let slot of this.slots) {
      if (slot && slot.pos) {
        pts.push(
          slot.pos.copy ? slot.pos.copy() : createVector(slot.pos.x, slot.pos.y)
        );
      }
    }
    return pts;
  }

  // Return endpoints for: top ends of vertical lines and left ends of horizontal lines
  getLineEndpoints() {
    // Ensure dimensions are up to date
    this.calculateDimensions();
    const pts = [];
    // Top endpoints for each vertical separator
    for (let i = 1; i < this.numSections; i++) {
      let lineX = this.x + i * this.cellWidth;
      pts.push(createVector(lineX, this.y));
    }
    // Left endpoints for each horizontal separator
    for (let i = 1; i < this.numRacks; i++) {
      let lineY = this.y + i * this.cellHeight;
      pts.push(createVector(this.x, lineY));
    }
    return pts;
  }

  // Plain XY values for integration
  getLineEndpointsXY() {
    return this.getLineEndpoints().map((p) => ({ x: p.x, y: p.y }));
  }

  // Plain XY for slot centers
  getSlotCentersXY() {
    return this.getSlotCenters().map((p) => ({ x: p.x, y: p.y }));
  }

  getEmptySlots() {
    return this.slots.filter((slot) => slot.state === "VIDE");
  }

  getOccupiedSlots() {
    return this.slots.filter((slot) => slot.state === "OCCUPÉ");
  }

  resize(x, y, width, height) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.calculateDimensions();
    this.updateSlotPositions();
  }
}
