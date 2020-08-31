import type { Node, Edge } from "../";

let _id = 0;

export function nextId() {
  return (++_id).toString();
}

export enum ExampleType {
  SIMPLE = "Simple",
  DAG = "DAG",
  RANDOM = "Random",
  STRESS_TEST = "Stress Test",
}

type WithId<T extends object> = T & {
  id: string;
};

export const GENERATE: Record<
  ExampleType,
  () => { nodes: WithId<Node>[]; edges: WithId<Edge>[] }
> = {
  [ExampleType.SIMPLE]: () => {
    const nodes: WithId<Node>[] = [
      { id: nextId(), x: -100, y: 100 },
      { id: nextId(), x: -100, y: -100 },
      { id: nextId(), x: 100, y: 100 },
      { id: nextId(), x: 100, y: -100 },
    ];

    const edges: WithId<Edge>[] = [
      { id: nextId(), sourceId: nodes[0].id, targetId: nodes[1].id },
      { id: nextId(), sourceId: nodes[1].id, targetId: nodes[2].id },
      { id: nextId(), sourceId: nodes[2].id, targetId: nodes[3].id },
      { id: nextId(), sourceId: nodes[3].id, targetId: nodes[0].id },
      { id: nextId(), sourceId: nodes[0].id, targetId: nodes[2].id },
      { id: nextId(), sourceId: nodes[1].id, targetId: nodes[3].id },
    ];

    return { nodes, edges };
  },
  [ExampleType.DAG]: () => {
    const nodes: WithId<Node>[] = [
      { id: nextId(), x: 0, y: -150 },
      { id: nextId(), x: -75, y: 0 },
      { id: nextId(), x: 150, y: 0 },
      { id: nextId(), x: 150, y: 150 },
      { id: nextId(), x: -150, y: 150 },
      { id: nextId(), x: 0, y: 150 },
      { id: nextId(), x: 75, y: 300 },
      { id: nextId(), x: 75, y: 450 },
      { id: nextId(), x: -75, y: 450 },
      { id: nextId(), x: 225, y: 450 },
    ];
    const edges: WithId<Edge>[] = [
      { id: nextId(), sourceId: nodes[0].id, targetId: nodes[1].id },
      { id: nextId(), sourceId: nodes[0].id, targetId: nodes[2].id },
      { id: nextId(), sourceId: nodes[2].id, targetId: nodes[3].id },
      { id: nextId(), sourceId: nodes[1].id, targetId: nodes[4].id },
      { id: nextId(), sourceId: nodes[1].id, targetId: nodes[5].id },
      { id: nextId(), sourceId: nodes[3].id, targetId: nodes[6].id },
      { id: nextId(), sourceId: nodes[5].id, targetId: nodes[6].id },
      { id: nextId(), sourceId: nodes[6].id, targetId: nodes[7].id },
      { id: nextId(), sourceId: nodes[6].id, targetId: nodes[8].id },
      { id: nextId(), sourceId: nodes[6].id, targetId: nodes[9].id },
    ];

    return { nodes, edges };
  },
  [ExampleType.RANDOM]: () => {
    const nodes: WithId<Node>[] = Array(20)
      .fill(undefined)
      .map(() => ({
        id: nextId(),
        x: Math.random() * 1000 - 500,
        y: Math.random() * 1000 - 500,
      }));

    const edges: WithId<Edge>[] = Array(30)
      .fill(undefined)
      .map(() => ({
        id: nextId(),
        sourceId: nodes[Math.floor(Math.random() * nodes.length)].id,
        targetId: nodes[Math.floor(Math.random() * nodes.length)].id,
      }));

    return { nodes, edges };
  },
  [ExampleType.STRESS_TEST]: () => {
    const nodes: WithId<Node>[] = Array(100)
      .fill(undefined)
      .map(() => ({
        id: nextId(),
        x: Math.random() * 1000 - 500,
        y: Math.random() * 1000 - 500,
      }));

    const edges: WithId<Edge>[] = Array(200)
      .fill(undefined)
      .map(() => ({
        id: nextId(),
        sourceId: nodes[Math.floor(Math.random() * nodes.length)].id,
        targetId: nodes[Math.floor(Math.random() * nodes.length)].id,
      }));

    return { nodes, edges };
  },
};
