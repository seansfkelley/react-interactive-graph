export interface Node {
  id: string;
  x: number;
  y: number;
}

export interface Edge {
  /**
   * Optional unique identifier for this edge. Provide this value if you want to have multiple
   * edges between the same two nodes.
   */
  id?: string;
  sourceId: string;
  targetId: string;
}
