export interface Position {
  x: number;
  y: number;
}

export interface Node extends Position {
  id: string;
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
