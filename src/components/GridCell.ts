export interface GridCell {
  /**
   * Zero-based X index within the grid.
   */
  column: number;

  /**
   * Zero-based Z index within the grid.
   */
  row: number;

  /**
   * World-space X coordinate of the cell center.
   */
  x: number;

  /**
   * World-space Z coordinate of the cell center.
   */
  z: number;
}
