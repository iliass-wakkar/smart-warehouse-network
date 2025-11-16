// Routes.js - Complex routing network for warehouse navigation
// Génère un réseau complexe de stations et chemins pour le routage des forklifts

class Routes {
  constructor() {
    this.nodes = {}; // Stocke tous les nœuds (intersections, stations)
    this.paths = []; // Stocke tous les chemins (liens entre nœuds)
    this.stations = []; // Liste de toutes les stations accessibles
    this.containers = []; // Array of container rectangles for routes areas
    // Nombre maximum de points (waypoints) d'un chemin simplifié
    this.maxWaypoints = 14;
    // Nombre désiré total de points affichés dans l'UI de routes
    this.desiredPointCount = null; // si défini, on régénère en fonction de ce nombre

    // Route reservation system
    this.reservedPaths = new Map(); // Map of "x1,y1->x2,y2" to forklift ID
    this.pathReservationTime = 180; // frames to keep reservation (3 seconds at 60fps)

    // Time-aware (space-time) reservation system
    // Node reservations: key "x,y" -> Map<timeStep, forkliftId>
    this.nodeTimeReservations = new Map();
    // Edge reservations: key "x1,y1|x2,y2" (unordered) -> Map<timeStep, forkliftId>
    this.edgeTimeReservations = new Map();
    // Time step granularity in frames (use 1 frame granularity)
    this.timeStepFrames = 1;
    // Planning horizon cap (frames) to avoid unbounded searches
    this.maxPlanningHorizon = 1200; // ~20s at 60fps

    this.generateNetwork();
  }

  setContainer(rect) {
    this.containers = [rect]; // Backward compat: single container
  }

  // Reserve a path segment for a forklift
  reservePath(nodeA, nodeB, forkliftId) {
    const key1 = `${nodeA.x.toFixed(0)},${nodeA.y.toFixed(
      0
    )}->${nodeB.x.toFixed(0)},${nodeB.y.toFixed(0)}`;
    const key2 = `${nodeB.x.toFixed(0)},${nodeB.y.toFixed(
      0
    )}->${nodeA.x.toFixed(0)},${nodeA.y.toFixed(0)}`;
    this.reservedPaths.set(key1, {
      id: forkliftId,
      expires: frameCount + this.pathReservationTime,
    });
    this.reservedPaths.set(key2, {
      id: forkliftId,
      expires: frameCount + this.pathReservationTime,
    });
  }

  // Check if a path segment is reserved by another forklift
  isPathReserved(nodeA, nodeB, forkliftId) {
    const key = `${nodeA.x.toFixed(0)},${nodeA.y.toFixed(0)}->${nodeB.x.toFixed(
      0
    )},${nodeB.y.toFixed(0)}`;
    const reservation = this.reservedPaths.get(key);
    if (!reservation) return false;
    if (reservation.expires < frameCount) {
      this.reservedPaths.delete(key);
      return false;
    }
    return reservation.id !== forkliftId;
  }

  // Reserve entire path for a forklift
  reserveWaypoints(waypoints, forkliftId) {
    for (let i = 0; i < waypoints.length - 1; i++) {
      this.reservePath(waypoints[i], waypoints[i + 1], forkliftId);
    }
  }

  // Clear all reservations for a forklift
  clearReservations(forkliftId) {
    for (let [key, reservation] of this.reservedPaths.entries()) {
      if (reservation.id === forkliftId) {
        this.reservedPaths.delete(key);
      }
    }
  }

  setContainers(containers) {
    this.containers = containers; // Array of containers
  }

  // ======== Space-Time Reservation Helpers ========
  _nodeKey(node) {
    return `${node.x.toFixed(0)},${node.y.toFixed(0)}`;
  }

  _edgeKey(a, b) {
    const k1 = `${a.x.toFixed(0)},${a.y.toFixed(0)}`;
    const k2 = `${b.x.toFixed(0)},${b.y.toFixed(0)}`;
    return k1 < k2 ? `${k1}|${k2}` : `${k2}|${k1}`;
  }

  _getOrCreate(map, key) {
    if (!map.has(key)) map.set(key, new Map());
    return map.get(key);
  }

  clearTimeReservationsFor(forkliftId) {
    // Clear node reservations
    for (let [nodeKey, timeMap] of this.nodeTimeReservations.entries()) {
      for (let [t, id] of timeMap.entries()) {
        if (id === forkliftId) timeMap.delete(t);
      }
      if (timeMap.size === 0) this.nodeTimeReservations.delete(nodeKey);
    }
    // Clear edge reservations
    for (let [edgeKey, timeMap] of this.edgeTimeReservations.entries()) {
      for (let [t, id] of timeMap.entries()) {
        if (id === forkliftId) timeMap.delete(t);
      }
      if (timeMap.size === 0) this.edgeTimeReservations.delete(edgeKey);
    }
  }

  isNodeReservedAt(node, timeStep, forkliftId) {
    const nodeKey = this._nodeKey(node);
    const timeMap = this.nodeTimeReservations.get(nodeKey);
    if (!timeMap) return false;
    const holder = timeMap.get(timeStep);
    return holder && holder !== forkliftId;
  }

  isEdgeReservedAt(a, b, timeStep, forkliftId) {
    const edgeKey = this._edgeKey(a, b);
    const timeMap = this.edgeTimeReservations.get(edgeKey);
    if (!timeMap) return false;
    const holder = timeMap.get(timeStep);
    return holder && holder !== forkliftId;
  }

  reserveNodeAt(node, timeStep, forkliftId) {
    const nodeKey = this._nodeKey(node);
    const timeMap = this._getOrCreate(this.nodeTimeReservations, nodeKey);
    timeMap.set(timeStep, forkliftId);
  }

  reserveEdgeAt(a, b, timeStep, forkliftId) {
    const edgeKey = this._edgeKey(a, b);
    const timeMap = this._getOrCreate(this.edgeTimeReservations, edgeKey);
    timeMap.set(timeStep, forkliftId);
  }

  // ======== Time-Aware Path Planning (Space-Time A*) ========
  planTimeAwarePath(startPos, endPos, forkliftId, options = {}) {
    const speed = Math.max(0.1, options.speed || 4); // px/frame
    const allowDetour = options.allowDetour !== false; // Allow detours by default
    const detourAttempts = options.detourAttempts || 0;
    const maxDetourAttempts = 3;

    const startNode = this.getNearestNode(startPos);
    const endNode = this.getNearestNode(endPos);
    if (!startNode || !endNode) return null;

    const startFrame = Math.max(
      0,
      options.startFrame || (typeof frameCount !== "undefined" ? frameCount : 0)
    );
    const timeStep = Math.max(1, this.timeStepFrames | 0);
    const maxHorizon = Math.max(100, this.maxPlanningHorizon | 0);

    // Precompute neighbor map for performance
    const neighborsMap = new Map();
    const getNeighbors = (node) => {
      const key = this._nodeKey(node);
      if (neighborsMap.has(key)) return neighborsMap.get(key);
      const list = [];
      for (let e of this.paths) {
        if (e.a === node) list.push(e.b);
        else if (e.b === node) list.push(e.a);
      }
      neighborsMap.set(key, list);
      return list;
    };

    // Priority queue using array (small scale); f-score sort
    const open = [];
    const pushOpen = (item) => {
      open.push(item);
      open.sort((u, v) => u.f - v.f);
    };

    const startState = { node: startNode, t: startFrame };
    const h0 = p5.Vector.dist(startNode, endNode) / speed;
    pushOpen({
      node: startNode,
      t: startFrame,
      g: 0,
      h: h0,
      f: h0,
      parent: null,
    });

    const visited = new Map(); // key: nodeKey@t -> g
    const keyState = (node, t) => `${this._nodeKey(node)}@${t}`;
    const cameFrom = new Map(); // key -> prevKey

    let expansions = 0;
    const maxExpansions = 15000;

    while (open.length > 0) {
      const current = open.shift();
      const { node, t, g } = current;
      expansions++;
      if (expansions > maxExpansions) break;

      // Goal condition: at endNode within horizon
      if (node === endNode) {
        // Reconstruct schedule of states
        const seq = [];
        let ck = keyState(node, t);
        while (ck) {
          const [nk, ts] = ck.split("@");
          const [x, y] = nk.split(",").map((n) => Number(n));
          seq.unshift({ x, y, t: Number(ts) });
          ck = cameFrom.get(ck) || null;
        }

        // Convert to waypoints: include start/end positions
        const points = [];
        // Start pos
        points.push(
          startPos.copy ? startPos.copy() : createVector(startPos.x, startPos.y)
        );
        // Add network nodes when position changes (compress waits)
        let lastKey = null;
        for (let s of seq) {
          const k = `${s.x},${s.y}`;
          if (k !== lastKey) {
            points.push(createVector(s.x, s.y));
            lastKey = k;
          }
        }
        // End pos
        points.push(
          endPos.copy ? endPos.copy() : createVector(endPos.x, endPos.y)
        );

        // Reserve the schedule: reserve node occupancy and edge times
        // First clear any previous time reservations for this forklift
        this.clearTimeReservationsFor(forkliftId);
        for (let i = 0; i < seq.length; i++) {
          const s = seq[i];
          // Reserve node at time s.t
          this.reserveNodeAt({ x: s.x, y: s.y }, s.t, forkliftId);
          if (i < seq.length - 1) {
            const s2 = seq[i + 1];
            const sameNode = s.x === s2.x && s.y === s2.y;
            if (!sameNode) {
              // Reserve edge during traversal times (exclusive of start t, inclusive of arrival t)
              for (let tt = s.t + 1; tt <= s2.t; tt += timeStep) {
                this.reserveEdgeAt(
                  { x: s.x, y: s.y },
                  { x: s2.x, y: s2.y },
                  tt,
                  forkliftId
                );
              }
              // Reserve arrival node at s2.t as well
              this.reserveNodeAt({ x: s2.x, y: s2.y }, s2.t, forkliftId);
            }
          }
        }

        return { points, radius: 30, closed: false, schedule: seq };
      }

      // Prune if beyond horizon
      if (t - startFrame > maxHorizon) continue;

      const ckey = keyState(node, t);
      if (visited.has(ckey) && visited.get(ckey) <= g) continue;
      visited.set(ckey, g);

      // 1) Wait action: stay on node for one timestep
      const tWait = t + timeStep;
      if (!this.isNodeReservedAt(node, tWait, forkliftId)) {
        const h = p5.Vector.dist(node, endNode) / speed;
        const g2 = g + timeStep;
        const f = g2 + h;
        const nkey = keyState(node, tWait);
        if (!visited.has(nkey) || visited.get(nkey) > g2) {
          pushOpen({ node: node, t: tWait, g: g2, h, f, parent: ckey });
          cameFrom.set(nkey, ckey);
        }
      }

      // 2) Move actions to neighbors (respect reservations)
      const neighbors = getNeighbors(node);
      for (let nb of neighbors) {
        const dist = p5.Vector.dist(node, nb);
        const travelFrames = Math.max(1, Math.ceil(dist / speed));
        const arriveT = t + travelFrames;
        // Check edge reservation for all frames (t+1..arriveT)
        let blocked = false;
        for (let tt = t + 1; tt <= arriveT; tt += timeStep) {
          if (this.isEdgeReservedAt(node, nb, tt, forkliftId)) {
            blocked = true;
            break;
          }
        }
        if (blocked) continue;
        // Check arrival node reservation
        if (this.isNodeReservedAt(nb, arriveT, forkliftId)) continue;

        const h = p5.Vector.dist(nb, endNode) / speed;
        const g2 = g + travelFrames;
        const f = g2 + h;
        const nkey = keyState(nb, arriveT);
        if (!visited.has(nkey) || visited.get(nkey) > g2) {
          pushOpen({ node: nb, t: arriveT, g: g2, h, f, parent: ckey });
          cameFrom.set(nkey, ckey);
        }
      }
    }

    // Failed to find time-aware path
    // Try detour through alternative nearby nodes
    if (allowDetour && detourAttempts < maxDetourAttempts) {
      console.log(
        `[Routes] No direct path found for forklift ${forkliftId}, trying detour (attempt ${
          detourAttempts + 1
        }/${maxDetourAttempts})`
      );

      // Find alternative intermediate nodes near the midpoint
      const midPoint = createVector(
        (startPos.x + endPos.x) / 2,
        (startPos.y + endPos.y) / 2
      );

      // Get all nodes sorted by distance from midpoint
      const allNodes = this.stations || [];
      const candidates = allNodes
        .filter((n) => n !== startNode && n !== endNode)
        .map((n) => ({
          node: n,
          dist: p5.Vector.dist(n, midPoint),
        }))
        .sort((a, b) => a.dist - b.dist)
        .slice(0, 5); // Try top 5 nearest nodes

      // Try routing through each candidate waypoint
      for (let candidate of candidates) {
        const waypoint = candidate.node;

        // Try path: start -> waypoint -> end
        const leg1 = this.planTimeAwarePath(startPos, waypoint, forkliftId, {
          speed,
          startFrame: options.startFrame,
          allowDetour: false, // Don't nest detours
          detourAttempts: detourAttempts + 1,
        });

        if (!leg1) continue;

        // Calculate arrival time at waypoint
        const waypointArrivalFrame =
          leg1.schedule && leg1.schedule.length > 0
            ? leg1.schedule[leg1.schedule.length - 1].t
            : (options.startFrame || 0) + 60;

        const leg2 = this.planTimeAwarePath(waypoint, endPos, forkliftId, {
          speed,
          startFrame: waypointArrivalFrame,
          allowDetour: false,
          detourAttempts: detourAttempts + 1,
        });

        if (leg2) {
          // Successfully found detour path!
          console.log(
            `[Routes] ✓ Detour found via waypoint (${waypoint.x.toFixed(
              0
            )}, ${waypoint.y.toFixed(0)})`
          );

          // Merge the two legs
          const mergedPoints = [...leg1.points];
          // Remove duplicate waypoint
          if (leg2.points.length > 1) {
            mergedPoints.push(...leg2.points.slice(1));
          }

          const mergedSchedule = [...(leg1.schedule || [])];
          if (leg2.schedule && leg2.schedule.length > 1) {
            mergedSchedule.push(...leg2.schedule.slice(1));
          }

          return {
            points: mergedPoints,
            radius: 30,
            closed: false,
            schedule: mergedSchedule,
          };
        }
      }
    }

    return null;
  }

  drawContainer() {
    if (this.containers.length === 0) return;
    push();
    noFill();
    stroke(100, 150, 200);
    strokeWeight(2);
    for (let c of this.containers) {
      rect(c.x, c.y, c.w, c.h);
    }
    pop();
  }

  generateNetwork() {
    // ==================== DÉFINITION DES NŒUDS ====================

    // 1. Zone PARKING (bas gauche)
    this.nodes.parking_entry = createVector(100, 700);
    this.nodes.parking_main = createVector(245, 750);
    this.nodes.parking_exit = createVector(245, 680);

    // 2. Réseau PRINCIPAL - Colonne OUEST (allée verticale gauche)
    this.nodes.west_bottom = createVector(300, 750);
    this.nodes.west_mid_low = createVector(300, 650);
    this.nodes.west_mid = createVector(300, 500);
    this.nodes.west_mid_high = createVector(300, 350);
    this.nodes.west_top = createVector(300, 200);

    // 3. Réseau PRINCIPAL - Ligne HAUTE (horizontale du haut)
    this.nodes.top_west = createVector(450, 150);
    this.nodes.top_mid_west = createVector(600, 150);
    this.nodes.top_center = createVector(750, 150);
    this.nodes.top_mid_east = createVector(900, 150);
    this.nodes.top_east = createVector(1050, 150);

    // 4. Zone TRUCK DOCKS (haut centre) - Points de collecte
    this.nodes.dock_approach = createVector(960, 150);
    this.nodes.dock1 = createVector(400, 100);
    this.nodes.dock2 = createVector(600, 100);
    this.nodes.dock3 = createVector(800, 100);
    this.nodes.dock4 = createVector(1000, 100);
    this.nodes.dock5 = createVector(1200, 100);

    // 5. Intersections CENTRALES (zone milieu)
    this.nodes.center_west = createVector(500, 400);
    this.nodes.center_main = createVector(700, 400);
    this.nodes.center_east = createVector(900, 400);

    // 6. Réseau SUD (ligne horizontale bas-milieu)
    this.nodes.south_west = createVector(500, 600);
    this.nodes.south_center = createVector(700, 600);
    this.nodes.south_east = createVector(900, 600);

    // 7. Colonne EST (allée verticale droite)
    this.nodes.east_top = createVector(1050, 200);
    this.nodes.east_mid_high = createVector(1050, 350);
    this.nodes.east_mid = createVector(1050, 500);
    this.nodes.east_mid_low = createVector(1050, 650);
    this.nodes.east_bottom = createVector(1050, 750);

    // 8. Zone WAREHOUSE/STORAGE (droite) - Destinations
    this.nodes.warehouse_entry = createVector(1150, 300);
    this.nodes.warehouse_north = createVector(1250, 350);
    this.nodes.warehouse_mid_north = createVector(1350, 400);
    this.nodes.warehouse_center = createVector(1450, 450);
    this.nodes.warehouse_mid_south = createVector(1550, 500);
    this.nodes.warehouse_south = createVector(1650, 550);

    // Créer des points d'accès au storage (multiples rangées)
    this.nodes.storage_access = [];
    for (let i = 0; i < 6; i++) {
      this.nodes.storage_access.push(createVector(1100, 370 + i * 90));
    }

    // 9. Nœuds DIAGONAUX (raccourcis complexes)
    this.nodes.diag1 = createVector(400, 300);
    this.nodes.diag2 = createVector(800, 300);
    this.nodes.diag3 = createVector(600, 450);

    // ==================== DÉFINITION DES CHEMINS ====================

    // ZONE PARKING - Connexions
    this.addPath(this.nodes.parking_main, this.nodes.parking_exit);
    this.addPath(this.nodes.parking_exit, this.nodes.west_mid_low);
    this.addPath(this.nodes.parking_main, this.nodes.west_bottom);

    // COLONNE OUEST (Allée principale verticale)
    this.addPath(this.nodes.west_bottom, this.nodes.west_mid_low);
    this.addPath(this.nodes.west_mid_low, this.nodes.west_mid);
    this.addPath(this.nodes.west_mid, this.nodes.west_mid_high);
    this.addPath(this.nodes.west_mid_high, this.nodes.west_top);

    // LIGNE HAUTE (Route vers docks et warehouse)
    this.addPath(this.nodes.west_top, this.nodes.top_west);
    this.addPath(this.nodes.top_west, this.nodes.top_mid_west);
    this.addPath(this.nodes.top_mid_west, this.nodes.top_center);
    this.addPath(this.nodes.top_center, this.nodes.dock_approach);
    this.addPath(this.nodes.dock_approach, this.nodes.top_mid_east);
    this.addPath(this.nodes.top_mid_east, this.nodes.top_east);

    // CONNEXIONS AUX DOCKS (Points de collecte colis)
    this.addPath(this.nodes.top_west, this.nodes.dock1);
    this.addPath(this.nodes.top_mid_west, this.nodes.dock2);
    this.addPath(this.nodes.top_center, this.nodes.dock3);
    this.addPath(this.nodes.top_mid_east, this.nodes.dock4);
    this.addPath(this.nodes.top_east, this.nodes.dock5);

    // ZONE CENTRALE (Réseau d'intersections)
    this.addPath(this.nodes.west_mid, this.nodes.center_west);
    this.addPath(this.nodes.center_west, this.nodes.center_main);
    this.addPath(this.nodes.center_main, this.nodes.center_east);
    this.addPath(this.nodes.center_east, this.nodes.east_mid);

    // LIGNE SUD (Bas du réseau central)
    this.addPath(this.nodes.west_mid_low, this.nodes.south_west);
    this.addPath(this.nodes.south_west, this.nodes.south_center);
    this.addPath(this.nodes.south_center, this.nodes.south_east);
    this.addPath(this.nodes.south_east, this.nodes.east_mid_low);

    // CONNEXIONS VERTICALES (Entre lignes horizontales)
    this.addPath(this.nodes.south_west, this.nodes.center_west);
    this.addPath(this.nodes.south_center, this.nodes.center_main);
    this.addPath(this.nodes.south_east, this.nodes.center_east);
    this.addPath(this.nodes.center_west, this.nodes.diag1);
    this.addPath(this.nodes.center_east, this.nodes.diag2);

    // COLONNE EST (Allée vers warehouse)
    this.addPath(this.nodes.top_east, this.nodes.east_top);
    this.addPath(this.nodes.east_top, this.nodes.east_mid_high);
    this.addPath(this.nodes.east_mid_high, this.nodes.east_mid);
    this.addPath(this.nodes.east_mid, this.nodes.east_mid_low);
    this.addPath(this.nodes.east_mid_low, this.nodes.east_bottom);

    // CONNEXIONS WAREHOUSE (Réseau de stockage)
    this.addPath(this.nodes.east_mid_high, this.nodes.warehouse_entry);
    this.addPath(this.nodes.warehouse_entry, this.nodes.warehouse_north);
    this.addPath(this.nodes.warehouse_north, this.nodes.warehouse_mid_north);
    this.addPath(this.nodes.warehouse_mid_north, this.nodes.warehouse_center);
    this.addPath(this.nodes.warehouse_center, this.nodes.warehouse_mid_south);
    this.addPath(this.nodes.warehouse_mid_south, this.nodes.warehouse_south);

    // Connexions aux points d'accès storage
    for (let i = 0; i < this.nodes.storage_access.length; i++) {
      this.addPath(this.nodes.east_mid_high, this.nodes.storage_access[i]);
      if (i > 0) {
        this.addPath(
          this.nodes.storage_access[i - 1],
          this.nodes.storage_access[i]
        );
      }
    }

    // CHEMINS DIAGONAUX (Raccourcis complexes)
    this.addPath(this.nodes.diag1, this.nodes.top_west);
    this.addPath(this.nodes.diag2, this.nodes.top_center);
    this.addPath(this.nodes.west_mid_high, this.nodes.diag1);
    this.addPath(this.nodes.diag2, this.nodes.east_mid_high);
    this.addPath(this.nodes.diag3, this.nodes.center_west);
    this.addPath(this.nodes.diag3, this.nodes.south_center);
    this.addPath(this.nodes.center_main, this.nodes.diag3);

    // BOUCLES SUPPLÉMENTAIRES (Complexité réseau)
    this.addPath(this.nodes.west_bottom, this.nodes.south_west);
    this.addPath(this.nodes.east_bottom, this.nodes.south_east);

    // Construire la liste des stations accessibles
    this.buildStationsList();
  }

  addPath(nodeA, nodeB) {
    // prevent exact duplicate edges by reference
    for (let p of this.paths) {
      if (
        (p.a === nodeA && p.b === nodeB) ||
        (p.a === nodeB && p.b === nodeA)
      ) {
        return;
      }
    }
    this.paths.push({
      a: nodeA,
      b: nodeB,
      distance: p5.Vector.dist(nodeA, nodeB),
    });
  }

  buildStationsList() {
    // Extraire toutes les positions uniques comme stations
    this.stations = [];
    // Simple tableau plat exploitable dans sketch: {x, y, label}
    this.pointTable = [];

    for (let key in this.nodes) {
      const value = this.nodes[key];
      const list = Array.isArray(value) ? value : [value];
      for (let node of list) {
        if (!node) continue;
        this.stations.push(node);
        this.pointTable.push({ x: node.x, y: node.y, label: key });
      }
    }

    // Debug logging
    console.log(`buildStationsList: ${this.stations.length} total points`);
    let breakdown = {};
    for (let key in this.nodes) {
      const value = this.nodes[key];
      const count = Array.isArray(value) ? value.length : 1;
      breakdown[key] = count;
    }
    console.log("Point breakdown by type:", breakdown);
  }

  // Trouver le nœud le plus proche d'une position
  getNearestNode(pos) {
    let nearest = null;
    let minDist = Infinity;

    for (let key in this.nodes) {
      if (Array.isArray(this.nodes[key])) {
        for (let node of this.nodes[key]) {
          let d = p5.Vector.dist(pos, node);
          if (d < minDist) {
            minDist = d;
            nearest = node;
          }
        }
      } else {
        let d = p5.Vector.dist(pos, this.nodes[key]);
        if (d < minDist) {
          minDist = d;
          nearest = this.nodes[key];
        }
      }
    }

    return nearest;
  }

  // Construct a path from start to end position using A* pathfinding
  // This ALWAYS uses the route network - never creates direct paths
  buildPath(startPos, endPos, forkliftId = null) {
    const startNode = this.getNearestNode(startPos);
    const endNode = this.getNearestNode(endPos);
    if (!startNode || !endNode) {
      console.warn("Cannot find route nodes for path");
      return null;
    }

    // If start and end are very close, create short path through network
    if (p5.Vector.dist(startPos, endPos) < 10) {
      return {
        points: [startPos.copy(), startNode.copy(), endPos.copy()],
        radius: 30,
        closed: false,
      };
    }

    // A* pathfinding through the network, avoiding reserved paths
    const openSet = [
      {
        node: startNode,
        g: 0,
        h: p5.Vector.dist(startNode, endNode),
        f: 0,
        parent: null,
      },
    ];
    const closedSet = new Set();
    const cameFrom = new Map();

    while (openSet.length > 0) {
      // Get node with lowest f
      openSet.sort((a, b) => a.f - b.f);
      const current = openSet.shift();

      // Found the goal
      if (
        current.node === endNode ||
        p5.Vector.dist(current.node, endNode) < 10
      ) {
        // Reconstruct path through network nodes
        const pathNodes = [];
        let node = current.node;
        while (node) {
          pathNodes.unshift(node.copy());
          node = cameFrom.get(node);
        }

        // Add actual start/end positions
        if (pathNodes.length > 0) {
          pathNodes.push(endPos.copy());
          pathNodes.unshift(startPos.copy());
        }

        return { points: pathNodes, radius: 30, closed: false };
      }

      closedSet.add(current.node);

      // Find neighbors through the network edges
      const neighbors = [];
      for (let path of this.paths) {
        if (path.a === current.node) neighbors.push(path.b);
        if (path.b === current.node) neighbors.push(path.a);
      }

      for (let neighbor of neighbors) {
        if (closedSet.has(neighbor)) continue;

        // Skip if this path segment is reserved by another forklift
        if (
          forkliftId &&
          this.isPathReserved(current.node, neighbor, forkliftId)
        ) {
          continue;
        }

        const tentativeG = current.g + p5.Vector.dist(current.node, neighbor);
        const existing = openSet.find((n) => n.node === neighbor);
        if (!existing || tentativeG < existing.g) {
          const h = p5.Vector.dist(neighbor, endNode);
          const entry = {
            node: neighbor,
            g: tentativeG,
            h,
            f: tentativeG + h,
            parent: current.node,
          };
          if (!existing) openSet.push(entry);
          else Object.assign(existing, entry);
          cameFrom.set(neighbor, current.node);
        }
      }
    }

    // No path found through network - this shouldn't happen if network is connected
    console.error(
      "No path found through route network from",
      startPos,
      "to",
      endPos
    );
    // Return path through nearest nodes as emergency fallback
    return {
      points: [
        startPos.copy(),
        startNode.copy(),
        endNode.copy(),
        endPos.copy(),
      ],
      radius: 30,
      closed: false,
    };
  }

  addRandomCore(opts = {}) {
    const defaults = {
      nodeCount: 40,
      area: { x: 300, y: 120, w: 800, h: 700 },
      areas: null, // Array of multiple areas
      kNearest: 2,
      edgeProbability: 0.05,
      extraEdges: 50,
      gridSpacing: 80, // Spacing between grid points
      useGrid: true, // Use structured grid instead of random
    };
    const cfg = Object.assign({}, defaults, opts);
    // reset current core network (keep external added later)
    this.nodes = {};
    this.paths = [];
    this.stations = [];

    // generate core nodes
    this.nodes.core = [];

    // Support multiple areas
    const targetAreas =
      cfg.areas && Array.isArray(cfg.areas) ? cfg.areas : [cfg.area];

    if (cfg.useGrid) {
      // Structured grid layout
      const perAreaNodes = [];
      for (let areaIdx = 0; areaIdx < targetAreas.length; areaIdx++) {
        const area = targetAreas[areaIdx];
        const spacing = cfg.gridSpacing;
        const padding = spacing / 2;

        // Calculate grid dimensions
        const cols = Math.floor((area.w - padding * 2) / spacing);
        const rows = Math.floor((area.h - padding * 2) / spacing);

        // Center the grid within the area
        const offsetX = area.x + (area.w - cols * spacing) / 2;
        const offsetY = area.y + (area.h - rows * spacing) / 2;

        // Store grid info for later connection
        const gridStart = this.nodes.core.length;
        const gridNodes = [];

        for (let row = 0; row <= rows; row++) {
          for (let col = 0; col <= cols; col++) {
            const px = offsetX + col * spacing;
            const py = offsetY + row * spacing;
            const node = createVector(px, py);
            this.nodes.core.push(node);
            gridNodes.push({ node, row, col, isIntersection: false });
          }
        }

        // Add intersection points at the center of each 4-point cell
        for (let row = 0; row < rows; row++) {
          for (let col = 0; col < cols; col++) {
            const px = offsetX + col * spacing + spacing / 2;
            const py = offsetY + row * spacing + spacing / 2;
            const node = createVector(px, py);
            this.nodes.core.push(node);
            gridNodes.push({
              node,
              row: row + 0.5,
              col: col + 0.5,
              isIntersection: true,
            });
          }
        }

        // Connect grid neighbors (8 directions: right, down, and diagonals)
        for (let i = 0; i < gridNodes.length; i++) {
          const { node, row, col, isIntersection } = gridNodes[i];

          // For intersection points, connect to the 4 surrounding grid points
          if (isIntersection) {
            // Top-left
            const tlIdx = gridNodes.findIndex(
              (n) =>
                !n.isIntersection &&
                n.row === Math.floor(row) &&
                n.col === Math.floor(col)
            );
            if (tlIdx !== -1) this.addPath(node, gridNodes[tlIdx].node);

            // Top-right
            const trIdx = gridNodes.findIndex(
              (n) =>
                !n.isIntersection &&
                n.row === Math.floor(row) &&
                n.col === Math.ceil(col)
            );
            if (trIdx !== -1) this.addPath(node, gridNodes[trIdx].node);

            // Bottom-left
            const blIdx = gridNodes.findIndex(
              (n) =>
                !n.isIntersection &&
                n.row === Math.ceil(row) &&
                n.col === Math.floor(col)
            );
            if (blIdx !== -1) this.addPath(node, gridNodes[blIdx].node);

            // Bottom-right
            const brIdx = gridNodes.findIndex(
              (n) =>
                !n.isIntersection &&
                n.row === Math.ceil(row) &&
                n.col === Math.ceil(col)
            );
            if (brIdx !== -1) this.addPath(node, gridNodes[brIdx].node);
          } else {
            // For regular grid points, connect to right neighbor
            const rightIdx = gridNodes.findIndex(
              (n) => !n.isIntersection && n.row === row && n.col === col + 1
            );
            if (rightIdx !== -1) {
              this.addPath(node, gridNodes[rightIdx].node);
            }

            // Connect to bottom neighbor
            const downIdx = gridNodes.findIndex(
              (n) => !n.isIntersection && n.row === row + 1 && n.col === col
            );
            if (downIdx !== -1) {
              this.addPath(node, gridNodes[downIdx].node);
            }

            // Connect to bottom-right diagonal
            const diagRightIdx = gridNodes.findIndex(
              (n) => !n.isIntersection && n.row === row + 1 && n.col === col + 1
            );
            if (diagRightIdx !== -1) {
              this.addPath(node, gridNodes[diagRightIdx].node);
            }

            // Connect to bottom-left diagonal
            const diagLeftIdx = gridNodes.findIndex(
              (n) => !n.isIntersection && n.row === row + 1 && n.col === col - 1
            );
            if (diagLeftIdx !== -1) {
              this.addPath(node, gridNodes[diagLeftIdx].node);
            }
          }
        }

        // Keep track of all nodes created for this area (regular + intersections)
        perAreaNodes.push(this.nodes.core.slice(gridStart));
      }

      // Stitch adjacent areas together with a few nearest bridges
      if (perAreaNodes.length > 1) {
        const bridgesPerPair = 4;
        for (let i = 0; i < perAreaNodes.length - 1; i++) {
          const A = perAreaNodes[i];
          const B = perAreaNodes[i + 1];
          const pairs = [];
          for (let a of A) {
            for (let b of B) {
              pairs.push({ a, b, d: p5.Vector.dist(a, b) });
            }
          }
          pairs.sort((u, v) => u.d - v.d);
          const used = new Set();
          let added = 0;
          for (let k = 0; k < pairs.length && added < bridgesPerPair; k++) {
            const { a, b } = pairs[k];
            const key = a.x + "," + a.y + "|" + b.x + "," + b.y;
            if (used.has(key)) continue;
            this.addPath(a, b);
            used.add(key);
            added++;
          }
        }
      }
    } else {
      // Random layout (original behavior)
      const nodesPerArea = Math.ceil(cfg.nodeCount / targetAreas.length);

      for (let areaIdx = 0; areaIdx < targetAreas.length; areaIdx++) {
        const area = targetAreas[areaIdx];
        const numNodes =
          areaIdx === targetAreas.length - 1
            ? cfg.nodeCount - this.nodes.core.length
            : nodesPerArea;

        for (let i = 0; i < numNodes; i++) {
          const px = area.x + random(0, area.w);
          const py = area.y + random(0, area.h);
          this.nodes.core.push(createVector(px, py));
        }
      }
    }

    // Skip k-nearest and random edges when using structured grid
    if (!cfg.useGrid) {
      // connect k nearest neighbors
      const k = Math.max(1, cfg.kNearest | 0);
      for (let i = 0; i < this.nodes.core.length; i++) {
        const a = this.nodes.core[i];
        const others = [];
        for (let j = 0; j < this.nodes.core.length; j++) {
          if (i === j) continue;
          const b = this.nodes.core[j];
          others.push({ j, d: p5.Vector.dist(a, b) });
        }
        others.sort((u, v) => u.d - v.d);
        for (let t = 0; t < Math.min(k, others.length); t++) {
          const j = others[t].j;
          const b = this.nodes.core[j];
          this.addPath(a, b);
        }
      }

      // add extra random edges
      const attempts = Math.max(0, cfg.extraEdges | 0);
      const prob = Math.max(0, Math.min(1, Number(cfg.edgeProbability)));
      for (let t = 0; t < attempts; t++) {
        if (random() > prob) continue;
        const i = floor(random(0, this.nodes.core.length));
        const j = floor(random(0, this.nodes.core.length));
        if (i === j) continue;
        const a = this.nodes.core[i];
        const b = this.nodes.core[j];
        this.addPath(a, b);
      }
    }

    this.buildStationsList();
  }

  // Afficher le réseau complet
  display() {
    // 0. Dessiner le conteneur
    this.drawContainer();

    // 1. Dessiner tous les chemins (lignes grises)
    push();
    stroke(100, 150);
    strokeWeight(2);
    for (let path of this.paths) {
      line(path.a.x, path.a.y, path.b.x, path.b.y);
    }
    pop();

    // 2. Dessiner les nœuds
    if (Array.isArray(this.nodes.core)) {
      this.drawCoreNodes();
    } else {
      this.drawNodes();
    }

    // 3. Dessiner les nœuds externes (ports/points exposés)
    this.drawExternalNodes();

    // 4. Debug: Draw time-aware reservations if debug mode enabled
    if (Vehicle.debug) {
      this.drawTimeReservations();
    }
  }

  drawNodes() {
    // Fonction helper pour dessiner un nœud
    const drawNode = (vector, color, size = 8) => {
      push();
      fill(color);
      noStroke();
      circle(vector.x, vector.y, size);
      pop();
    };

    // Nœuds PARKING (Vert)
    drawNode(this.nodes.parking_main, color(76, 175, 80), 18);
    drawNode(this.nodes.parking_entry, color(139, 195, 74), 10);
    drawNode(this.nodes.parking_exit, color(139, 195, 74), 10);

    // Nœuds DOCKS (Rouge)
    drawNode(this.nodes.dock1, color(244, 67, 54), 14);
    drawNode(this.nodes.dock2, color(244, 67, 54), 14);
    drawNode(this.nodes.dock3, color(244, 67, 54), 14);
    drawNode(this.nodes.dock4, color(244, 67, 54), 14);
    drawNode(this.nodes.dock5, color(244, 67, 54), 14);
    drawNode(this.nodes.dock_approach, color(255, 152, 0), 10);

    // Nœuds WAREHOUSE (Bleu)
    drawNode(this.nodes.warehouse_entry, color(33, 150, 243), 12);
    drawNode(this.nodes.warehouse_north, color(33, 150, 243), 10);
    drawNode(this.nodes.warehouse_mid_north, color(33, 150, 243), 10);
    drawNode(this.nodes.warehouse_center, color(33, 150, 243), 10);
    drawNode(this.nodes.warehouse_mid_south, color(33, 150, 243), 10);
    drawNode(this.nodes.warehouse_south, color(33, 150, 243), 10);

    // Storage access points
    for (let node of this.nodes.storage_access) {
      drawNode(node, color(66, 165, 245), 8);
    }

    // Nœuds PRINCIPAUX (Gris clair - intersections importantes)
    drawNode(this.nodes.west_top, color(180, 180, 180), 10);
    drawNode(this.nodes.west_mid, color(180, 180, 180), 10);
    drawNode(this.nodes.west_bottom, color(180, 180, 180), 10);
    drawNode(this.nodes.center_main, color(180, 180, 180), 10);
    drawNode(this.nodes.east_top, color(180, 180, 180), 10);
    drawNode(this.nodes.east_mid, color(180, 180, 180), 10);
    drawNode(this.nodes.east_bottom, color(180, 180, 180), 10);

    // Nœuds SECONDAIRES (Gris foncé - intersections normales)
    const secondaryColor = color(120, 120, 120);
    drawNode(this.nodes.west_mid_low, secondaryColor, 7);
    drawNode(this.nodes.west_mid_high, secondaryColor, 7);
    drawNode(this.nodes.top_west, secondaryColor, 7);
    drawNode(this.nodes.top_mid_west, secondaryColor, 7);
    drawNode(this.nodes.top_center, secondaryColor, 7);
    drawNode(this.nodes.top_mid_east, secondaryColor, 7);
    drawNode(this.nodes.top_east, secondaryColor, 7);
    drawNode(this.nodes.center_west, secondaryColor, 7);
    drawNode(this.nodes.center_east, secondaryColor, 7);
    drawNode(this.nodes.south_west, secondaryColor, 7);
    drawNode(this.nodes.south_center, secondaryColor, 7);
    drawNode(this.nodes.south_east, secondaryColor, 7);
    drawNode(this.nodes.east_mid_high, secondaryColor, 7);
    drawNode(this.nodes.east_mid_low, secondaryColor, 7);

    // Nœuds DIAGONAUX (Jaune - raccourcis)
    drawNode(this.nodes.diag1, color(255, 193, 7), 8);
    drawNode(this.nodes.diag2, color(255, 193, 7), 8);
    drawNode(this.nodes.diag3, color(255, 193, 7), 8);
  }

  // Ajouter des points externes au réseau et les connecter au nœud le plus proche
  addExternalPoints(label, points, options = {}) {
    if (!Array.isArray(points) || points.length === 0) return;
    const key = `external_${label}`;
    // Store copies of points
    this.nodes[key] = points.map((p) =>
      p.copy ? p.copy() : createVector(p.x, p.y)
    );
    if (options.connect === false) return;

    // Connect each external point to multiple nearby nodes (top 3) for better connectivity
    for (let p of this.nodes[key]) {
      // Find all core nodes with distances
      let coreNodes = this.nodes.core || [];
      let distances = coreNodes.map((node) => ({
        node: node,
        dist: p5.Vector.dist(p, node),
      }));

      // Sort by distance and connect to top 3 nearest
      distances.sort((a, b) => a.dist - b.dist);
      let connectCount = Math.min(3, distances.length);

      for (let i = 0; i < connectCount; i++) {
        this.addPath(p, distances[i].node);
      }
    }

    // Mettre à jour les listes exposées
    this.buildStationsList();
  }

  // Dessiner les nœuds externes génériques
  drawExternalNodes() {
    for (let k in this.nodes) {
      if (!k.startsWith("external_")) continue;
      const arr = this.nodes[k];
      if (!Array.isArray(arr)) continue;
      push();
      fill(255, 0, 255);
      noStroke();
      for (let v of arr) circle(v.x, v.y, 8);
      pop();
    }
  }

  drawCoreNodes() {
    const arr = this.nodes.core || [];
    push();
    fill(200);
    noStroke();
    for (let v of arr) circle(v.x, v.y, 8);
    pop();
  }

  // Debug visualization for time-aware reservations
  drawTimeReservations() {
    const now = typeof frameCount !== "undefined" ? frameCount : 0;
    const futureWindow = 120; // Show next 2 seconds of reservations

    push();

    // 1. Draw reserved nodes with time info
    for (let [nodeKey, timeMap] of this.nodeTimeReservations.entries()) {
      const [x, y] = nodeKey.split(",").map((n) => Number(n));

      // Check if any reservation in near future
      let nearestReservation = null;
      let nearestT = Infinity;
      for (let [t, id] of timeMap.entries()) {
        if (t >= now && t < now + futureWindow && t < nearestT) {
          nearestT = t;
          nearestReservation = id;
        }
      }

      if (nearestReservation !== null) {
        // Draw reservation indicator
        const framesUntil = nearestT - now;
        const alpha = map(framesUntil, 0, futureWindow, 255, 50);

        // Outer ring showing time until reservation
        noFill();
        stroke(255, 100, 0, alpha);
        strokeWeight(2);
        const ringSize = map(framesUntil, 0, futureWindow, 20, 12);
        circle(x, y, ringSize);

        // Inner filled circle
        fill(255, 150, 0, alpha * 0.5);
        noStroke();
        circle(x, y, 6);

        // Show forklift ID and frames until
        if (framesUntil < 60) {
          fill(255, 200, 0);
          noStroke();
          textSize(9);
          textAlign(CENTER, BOTTOM);
          text(
            `F${nearestReservation}:${Math.ceil(framesUntil / 60)}s`,
            x,
            y - 12
          );
        }
      }
    }

    // 2. Draw reserved edges with time info
    for (let [edgeKey, timeMap] of this.edgeTimeReservations.entries()) {
      const [key1, key2] = edgeKey.split("|");
      const [x1, y1] = key1.split(",").map((n) => Number(n));
      const [x2, y2] = key2.split(",").map((n) => Number(n));

      // Check if any reservation in near future
      let hasNearReservation = false;
      let earliestT = Infinity;
      let reserverId = null;
      for (let [t, id] of timeMap.entries()) {
        if (t >= now && t < now + futureWindow) {
          hasNearReservation = true;
          if (t < earliestT) {
            earliestT = t;
            reserverId = id;
          }
        }
      }

      if (hasNearReservation) {
        const framesUntil = earliestT - now;
        const alpha = map(framesUntil, 0, futureWindow, 200, 30);

        stroke(0, 255, 255, alpha);
        strokeWeight(3);
        line(x1, y1, x2, y2);

        // Draw arrow showing direction and ID
        if (framesUntil < 30) {
          const midX = (x1 + x2) / 2;
          const midY = (y1 + y2) / 2;
          fill(0, 255, 255);
          noStroke();
          textSize(8);
          textAlign(CENTER, CENTER);
          text(`F${reserverId}`, midX, midY);
        }
      }
    }

    // 3. Draw reservation statistics in corner
    const nodeReservationCount = this.nodeTimeReservations.size;
    const edgeReservationCount = this.edgeTimeReservations.size;

    fill(0, 200);
    noStroke();
    rect(width - 250, 10, 240, 80, 5);

    fill(255);
    textAlign(LEFT, TOP);
    textSize(12);
    text("Time-Aware Reservations:", width - 245, 15);
    textSize(10);
    text(`Reserved Nodes: ${nodeReservationCount}`, width - 245, 35);
    text(`Reserved Edges: ${edgeReservationCount}`, width - 245, 50);
    text(`Frame: ${now}`, width - 245, 65);

    pop();
  }

  // Create straight roads between two point sets
  // pairing: 'nearest' (default) connects each A to its nearest B
  addRoadsBetween(pointsA, pointsB, options = {}) {
    if (!Array.isArray(pointsA) || !Array.isArray(pointsB)) return;
    const pairing = options.pairing || "nearest";
    if (pairing === "nearest") {
      for (let a of pointsA) {
        const av = a.copy ? a.copy() : createVector(a.x, a.y);
        // find nearest in B
        let best = null;
        let bestD = Infinity;
        for (let b of pointsB) {
          const bv = b.copy ? b.copy() : createVector(b.x, b.y);
          const d = p5.Vector.dist(av, bv);
          if (d < bestD) {
            bestD = d;
            best = bv;
          }
        }
        if (best) this.addPath(av, best);
      }
    } else if (pairing === "index") {
      const n = Math.min(pointsA.length, pointsB.length);
      for (let i = 0; i < n; i++) {
        const av = pointsA[i].copy
          ? pointsA[i].copy()
          : createVector(pointsA[i].x, pointsA[i].y);
        const bv = pointsB[i].copy
          ? pointsB[i].copy()
          : createVector(pointsB[i].x, pointsB[i].y);
        this.addPath(av, bv);
      }
    }
  }

  // Obtenir le nombre total de stations
  getStationCount() {
    return this.stations.length;
  }

  // Obtenir le nombre total de routes
  getRouteCount() {
    return this.paths.length;
  }

  // ===== Exposition des points pour sketch.js =====
  // Retourne une copie des vecteurs (p5.Vector)
  getAllPoints() {
    return (this.stations || []).map((v) =>
      v.copy ? v.copy() : createVector(v.x, v.y)
    );
  }

  // Retourne uniquement des {x, y}
  getAllPointsXY() {
    return (this.pointTable || []).map((p) => ({ x: p.x, y: p.y }));
  }

  // Retourne la table complète {x, y, label}
  getPointTable() {
    return (this.pointTable || []).map((p) => ({
      x: p.x,
      y: p.y,
      label: p.label,
    }));
  }

  // ---- Simplification de chemin vers une liste de waypoints ----
  // Limite le nombre de points tout en conservant le début et la fin
  limitWaypoints(points, maxCount = this.maxWaypoints) {
    if (!points || points.length === 0) return [];
    const n = points.length;
    if (maxCount <= 2) {
      const a = points[0];
      const b = points[n - 1];
      return [
        a.copy ? a.copy() : createVector(a.x, a.y),
        b.copy ? b.copy() : createVector(b.x, b.y),
      ];
    }
    if (n <= maxCount)
      return points.map((p) => (p.copy ? p.copy() : createVector(p.x, p.y)));

    const result = [];
    // Always include first and last; sample evenly among intermediates
    result.push(
      points[0].copy ? points[0].copy() : createVector(points[0].x, points[0].y)
    );
    const slots = maxCount - 2;
    for (let i = 1; i <= slots; i++) {
      const t = i / (slots + 1);
      const idx = Math.round(t * (n - 1));
      const p = points[idx];
      result.push(p.copy ? p.copy() : createVector(p.x, p.y));
    }
    result.push(
      points[n - 1].copy
        ? points[n - 1].copy()
        : createVector(points[n - 1].x, points[n - 1].y)
    );
    return result;
  }

  // Helper pour créer directement un objet path simplifié
  buildWaypointPath(startPos, endPos, maxCount = this.maxWaypoints) {
    const path = this.buildPath(startPos, endPos);
    if (!path) return null;
    const pts = this.limitWaypoints(path.points, maxCount);
    return { points: pts, radius: 20, closed: false };
  }

  // Construit un chemin COMPOSÉ UNIQUEMENT de nœuds du réseau (sans startPos/endPos)
  // Utile pour forcer les véhicules à rester strictement sur la route existante
  buildNodePath(startPos, endPos, maxCount = null) {
    const startNode = this.getNearestNode(startPos);
    const endNode = this.getNearestNode(endPos);
    if (!startNode || !endNode) return null;

    const openSet = [
      { node: startNode, g: 0, h: p5.Vector.dist(startNode, endNode), f: 0 },
    ];
    const cameFrom = new Map();
    const gScore = new Map();
    gScore.set(startNode, 0);

    while (openSet.length > 0) {
      openSet.sort((a, b) => a.g + a.h - (b.g + b.h));
      const current = openSet.shift();
      if (current.node === endNode) {
        // Reconstruct node-only path
        const nodes = [];
        let n = current.node;
        while (n) {
          nodes.unshift(n.copy());
          n = cameFrom.get(n) || null;
        }
        const limited = maxCount ? this.limitWaypoints(nodes, maxCount) : nodes;
        return { points: limited, radius: 16, closed: false };
      }

      // Neighbors via existing edges only
      const neighbors = [];
      for (let e of this.paths) {
        if (e.a === current.node) neighbors.push(e.b);
        else if (e.b === current.node) neighbors.push(e.a);
      }
      for (let nb of neighbors) {
        const tentative =
          (gScore.get(current.node) || 0) + p5.Vector.dist(current.node, nb);
        if (tentative < (gScore.get(nb) ?? Infinity)) {
          cameFrom.set(nb, current.node);
          gScore.set(nb, tentative);
          const h = p5.Vector.dist(nb, endNode);
          const existing = openSet.find((o) => o.node === nb);
          if (existing) {
            existing.g = tentative;
            existing.h = h;
          } else {
            openSet.push({ node: nb, g: tentative, h, f: tentative + h });
          }
        }
      }
    }
    return null;
  }

  // ====== Contrôle du nombre total de points dans l'UI ======
  // Calcule combien de points serait généré pour un spacing donné
  _countPointsForSpacing(spacing, areas) {
    let total = 0;
    const targetAreas =
      areas && areas.length ? areas : [{ x: 300, y: 120, w: 800, h: 700 }];
    for (let area of targetAreas) {
      const padding = spacing / 2;
      const cols = Math.max(0, Math.floor((area.w - padding * 2) / spacing));
      const rows = Math.max(0, Math.floor((area.h - padding * 2) / spacing));
      const gridPts = (rows + 1) * (cols + 1);
      const intersections = rows * cols;
      total += gridPts + intersections;
    }
    return total;
  }

  // Trouve un spacing approchant un nombre total de points souhaité
  _computeSpacingForPointCount(desired, areas) {
    // bornes raisonnables pour l'espacement
    let lo = 20,
      hi = 200,
      best = 80,
      bestDiff = Infinity;
    for (let iter = 0; iter < 24; iter++) {
      const mid = (lo + hi) / 2;
      const count = this._countPointsForSpacing(mid, areas);
      const diff = Math.abs(count - desired);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = mid;
      }
      if (count > desired) {
        // trop de points -> espacement plus grand
        lo = mid;
      } else {
        // pas assez de points -> espacement plus petit
        hi = mid;
      }
    }
    return Math.max(10, Math.round(best));
  }

  // Reconstruit le réseau core (grille) avec un nombre total désiré de points
  setPointCount(totalPoints, opts = {}) {
    this.desiredPointCount = Math.max(2, Math.floor(totalPoints || 0));
    const areas =
      opts.areas && Array.isArray(opts.areas) ? opts.areas : this.containers;
    const spacing = this._computeSpacingForPointCount(
      this.desiredPointCount,
      areas
    );
    this.addRandomCore({
      useGrid: true,
      gridSpacing: spacing,
      areas: areas && areas.length ? areas : undefined,
    });
  }

  // Récupère le nombre courant de points (stations)
  getCurrentPointCount() {
    return this.nodes.core && this.nodes.core.length
      ? this.nodes.core.length
      : this.getStationCount();
  }
}
