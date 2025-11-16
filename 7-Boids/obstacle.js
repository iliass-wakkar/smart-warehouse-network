/**
 * Represents a circular obstacle in the simulation.
 */
class CircleObstacle {
  /**
   * Creates an instance of CircleObstacle.
   * @param {number} x - The x-coordinate of the obstacle's center.
   * @param {number} y - The y-coordinate of the obstacle's center.
   * @param {number} r - The radius of the obstacle.
   */
  constructor(x, y, r) {
    this.pos = createVector(x, y);
    this.r = r;
  }

  /**
   * Displays the circular obstacle on the canvas.
   */
  show() {
    fill("gray");
    noStroke();
    circle(this.pos.x, this.pos.y, this.r * 2);
  }
}
