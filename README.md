# 🏭 Intelligent Warehouse Management System

An advanced autonomous warehouse simulation featuring intelligent forklift agents with time-aware routing, conflict-free pathfinding, and real-time parameter tuning.

![Status](https://img.shields.io/badge/status-active-success.svg)
![License](https://img.shields.io/badge/license-MIT-blue.svg)

## 📋 Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Getting Started](#getting-started)
- [Controls](#controls)
- [Debug Mode](#debug-mode)
- [Technical Details](#technical-details)
- [Project Structure](#project-structure)
- [Algorithms](#algorithms)
- [Contributing](#contributing)

## 🎯 Overview

This project simulates an intelligent warehouse where autonomous forklift agents coordinate to handle package deliveries from trucks to storage locations. The system uses advanced pathfinding algorithms, time-aware routing, and conflict resolution to ensure efficient, collision-free operations.

**Key Highlights:**
- Multi-agent coordination with space-time planning
- Dynamic conflict detection and automatic rerouting
- Real-time parameter tuning via interactive sliders
- Comprehensive debug visualization system

## ✨ Features

### 🤖 Autonomous Forklift Fleet
- **Dynamic Fleet Management**: Scale from 1 to 10 forklifts in real-time
- **Intelligent Task Assignment**: Automated dispatcher assigns packages to available forklifts
- **Smart State Management**: Forklifts transition between ATTENTE (idle), COLLECTE (pickup), LIVRAISON (delivery), and RETOUR (return) states
- **Work Chaining**: Forklifts stay in the work area to handle multiple packages without unnecessary trips to parking

### 🗺️ Advanced Routing System
- **Time-Aware A* Pathfinding**: Plans routes considering both spatial position and temporal constraints
- **Configurable Network**: Adjustable grid density (50-600 nodes) with 8-directional connections
- **Conflict-Free Planning**: Space-time reservations prevent multiple agents from occupying the same location at the same time
- **Automatic Detour System**: When conflicts arise, agents find alternative routes through nearby waypoints (up to 3 rerouting attempts)

### 🚧 Collision Avoidance
- **Predictive Obstacle Detection**: Configurable look-ahead distance (40-150 pixels)
- **Stop & Replan Behavior**: Agents halt when blocked, wait briefly, then recalculate routes
- **Dynamic Path Reservations**: Time-based edge and node reservations with automatic expiry

### 🚛 Truck Delivery System
- **Configurable Arrival Frequency**: 5-40 truck arrivals per minute
- **Random Package Generation**: Each truck delivers 1-10 packages
- **Synchronized Docking**: 5 loading bays with timed cycles

### 📦 Storage Management
- **Structured Warehouse**: 6 sections × 4 racks = 24 storage slots
- **Dynamic Allocation**: Automatic slot assignment for incoming packages
- **Real-time Occupancy Tracking**: Monitor available and occupied slots

## 🚀 Getting Started

### Prerequisites
- Modern web browser (Chrome, Firefox, Safari, Edge)
- Local web server (optional, for best performance)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/micbuffa/MiageIA2Rabat_2025_2026.git
   cd MiageIA2Rabat_2025_2026/Project\ Final\ algorithms\ version
   ```

2. **Open in browser**
   - **Option A**: Simply open `index.html` in your browser
   - **Option B**: Use a local server (recommended):
     ```bash
     # Using Python 3
     python -m http.server 8000
     
     # Using Node.js
     npx http-server
     
     # Using VS Code Live Server extension
     # Right-click index.html → Open with Live Server
     ```

3. **Access the application**
   - Navigate to `http://localhost:8000` (or the URL provided by your server)

### Quick Start
1. Open the application in your browser
2. Watch the autonomous warehouse in action
3. Press **'d'** to toggle debug mode for detailed visualization
4. Adjust sliders to tune parameters in real-time
5. Observe how forklifts coordinate and avoid conflicts

## 🎮 Controls

### Interactive Sliders (Top Bar)

| Slider | Range | Default | Description |
|--------|-------|---------|-------------|
| **Max Speed** | 1-8 | 4 | Forklift movement speed |
| **Max Force** | 0.1-0.5 | 0.2 | Steering force strength |
| **Route Points** | 50-600 | 50 | Network node density |
| **Truck Freq** | 5-40/min | 10/min | Truck arrival frequency |
| **Waypoint Radius** | 10-50 px | 25 px | Movement precision threshold |
| **Obstacle Dist** | 40-150 px | 80 px | Obstacle detection range |
| **Max Replans** | 1-5 | 3 | Conflict resolution attempts |
| **Forklifts** | 1-10 | 3 | Active fleet size |

### Keyboard Controls
- **D**: Toggle debug mode on/off

## 🔍 Debug Mode

Press **'d'** to enable comprehensive visualization:

### Visual Overlays
- **Yellow circle** around forklift = Waypoint reach radius
- **Orange ring** around forklift = Obstacle detection zone
- **Cyan lines** = Reserved edges (active routes)
- **Orange circles on nodes** = Future node reservations with countdown
- **Green dots** = Waypoint path markers
- **Yellow dot** = Current target waypoint
- **Orange "REPLAN"** indicator = Conflict detected, rerouting in progress

### Forklift Information
Each forklift displays:
- **ID and State** (e.g., "F1: COLLECTE")
- **Current Parameters** (e.g., "WP:25 OD:80")
- **WAIT timer** when waiting for scheduled departure
- **STOP indicator** when blocked by obstacles

### Stats Panel (Bottom-Left)
- Forklifts with active schedules
- Total schedule states (time-aware planning depth)
- Reserved nodes and edges count
- Total replan attempts across fleet
- **State Breakdown**: Count of forklifts in each state
  - ATTENTE (idle)
  - COLLECTE (picking up)
  - LIVRAISON (delivering)
  - RETOUR (returning)

### Debug Legend
- 🟡 Yellow circle = Waypoint radius
- 🟠 Orange ring = Obstacle detection range
- 🔵 Cyan lines = Reserved edges
- 🟢 Green dots = Waypoints
- 🟠 REPLAN = Conflict/replanning status

## 🔧 Technical Details

### Technology Stack
- **p5.js**: Graphics and animation framework
- **JavaScript ES6+**: Core logic and algorithms
- **HTML5 Canvas**: Rendering engine

### Core Algorithms

#### 1. **A* Pathfinding**
- Standard A* for spatial navigation through the route network
- Heuristic: Euclidean distance to goal
- Optimized with neighbor caching

#### 2. **Time-Aware A* (Space-Time Planning)**
```javascript
State = (node, time)
Transitions:
  - Move to neighbor: cost = edge_distance / speed
  - Wait at node: cost = timestep
Constraints:
  - No node occupied by another agent at same time
  - No edge traversal conflicts
```

#### 3. **Conflict Detection & Resolution**
- **Proactive**: Check planned schedule for future conflicts
- **Reactive**: Detect physical obstacles via look-ahead vectors
- **Resolution**: 
  1. Clear old reservations
  2. Attempt time-aware replan (up to max attempts)
  3. Try detour through nearby intermediate waypoints
  4. If all fail, wait and retry

#### 4. **Detour Planning**
When direct path fails:
1. Find 5 nearest nodes to route midpoint
2. For each candidate, attempt two-leg path: `start → waypoint → goal`
3. Merge successful legs into continuous route
4. Reserve combined path in space-time

### Architecture

```
Vehicle (base class)
├── Forklift (extends Vehicle)
│   ├── FSM (Finite State Machine)
│   ├── Pathfinding integration
│   ├── Collision avoidance
│   └── Conflict detection
└── Truck (extends Vehicle)
    ├── Docking behavior
    └── Package spawning

Routes (route network)
├── Node/edge graph
├── A* pathfinder
├── Space-time reservations
└── Detour planner

Warehouse Components
├── Storage slots
├── Truck dock
├── Parking manager
└── Package dispatcher
```

### Performance Optimizations
- **Waypoint Compression**: Paths limited to 14 waypoints max
- **Planning Horizon**: Limited to 1200 frames (~20 seconds at 60fps)
- **Reservation Pruning**: Old reservations automatically expire
- **Efficient Lookups**: Spatial hashing for reservation queries
- **Neighbor Caching**: Precomputed adjacency lists

## 📁 Project Structure

```
Project Final algorithms version/
├── index.html              # Main entry point
├── sketch.js               # p5.js main sketch, UI, and orchestration
├── forklift.js            # Forklift agent logic and FSM
├── vehicle.js             # Base vehicle class with steering behaviors
├── truck.js               # Truck delivery logic
├── routes.js              # Route network, pathfinding, and reservations
├── warehouse.js           # Warehouse structure and storage management
├── truckDock.js           # Truck docking area management
├── parking.js             # Forklift parking area
├── package.js             # Package entity
├── storageSlot.js         # Storage slot entity
├── style.css              # Styling
├── jsconfig.json          # JavaScript configuration
├── assets/                # Images and sprites
│   ├── forklift.png
│   └── truck.png
└── libraries/             # p5.js library files
    ├── p5.min.js
    └── p5.sound.min.js
```

## 📊 Key Classes

### `Forklift`
- **Responsibilities**: Autonomous agent behavior, task execution, pathfinding
- **Key Methods**:
  - `runFSM()`: State machine execution
  - `buildPathToTarget()`: Request path from route network
  - `detectPathConflict()`: Check for reservation conflicts
  - `detectObstacleAhead()`: Predictive collision detection

### `Routes`
- **Responsibilities**: Route network management, pathfinding, reservations
- **Key Methods**:
  - `buildPath()`: Standard A* pathfinding
  - `planTimeAwarePath()`: Space-time A* with conflict avoidance
  - `reserveNodeAt()`: Reserve node at specific time
  - `isPathReserved()`: Check edge reservation status

### `Warehouse`
- **Responsibilities**: Storage layout, slot management
- **Key Methods**:
  - `getSlots()`: Return all storage slots
  - `getLineEndpoints()`: Export connection points for routing

### `Truck`
- **Responsibilities**: Delivery cycles, package generation
- **Key Methods**:
  - `runFSM()`: Docking state machine
  - `setArrivalFrequency()`: Adjust delivery rate
  - `spawnPackages()`: Generate delivery packages

## 🎓 Educational Value

This project demonstrates:
- **Multi-agent systems**: Coordination without central control
- **Pathfinding algorithms**: From basic A* to advanced space-time planning
- **Conflict resolution**: Proactive and reactive strategies
- **Finite state machines**: Clean agent behavior modeling
- **Real-time simulation**: Interactive parameter tuning
- **Visual debugging**: Comprehensive visualization techniques

## 🤝 Contributing

Contributions are welcome! Areas for enhancement:
- Additional pathfinding algorithms (D*, RRT)
- Machine learning for traffic optimization
- Extended warehouse layouts
- Battery/charging mechanics
- Task priority systems
- Performance metrics and analytics

## 📝 License

This project is part of the MIAGE IA2 course at Rabat, 2025-2026.

## 👥 Authors

- **Course**: MIAGE IA2 Rabat 2025-2026
- **Repository**: [MiageIA2Rabat_2025_2026](https://github.com/micbuffa/MiageIA2Rabat_2025_2026)

## 🙏 Acknowledgments

- p5.js community for the excellent creative coding framework
- Craig Reynolds for pioneering steering behaviors
- Research in multi-agent pathfinding and space-time planning

---

**⭐ Star this repository if you found it helpful!**

For questions or issues, please open an issue on GitHub.
