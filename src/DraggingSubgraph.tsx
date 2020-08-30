import * as React from "react";
import { useDocumentEvent } from "./hooks";
import type { Node, NodeComponentProps, Edge, EdgeComponentProps } from "./types";

interface ScreenPosition {
  screenX: number;
  screenY: number;
}

// TODO: And another one of these but for edge creation.
export interface Props<N extends Node, E extends Edge, X> {
  nodeId: string;
  edgeIds: string[];
  nodes: Record<string, N>;
  edges: Record<string, E>;
  nodeWrapperComponent: React.ComponentType<{ id: string }>;
  nodeComponent: React.ComponentType<NodeComponentProps<N> & X>;
  edgeWrapperComponent: React.ComponentType<{ id: string }>;
  edgeComponent: React.ComponentType<EdgeComponentProps<N, E> & X>;
  startPosition: ScreenPosition;
  onDragFinish: (e: MouseEvent) => void;
  scale: number;
  extraProps: X;
}

export function DraggingSubgraph<N extends Node, E extends Edge, X>(props: Props<N, E, X>) {
  const { onDragFinish } = props;
  const [lastPosition, setLastPosition] = React.useState<ScreenPosition>(props.startPosition);

  const onMouseMoveDocument = React.useCallback((e: MouseEvent) => {
    setLastPosition({ screenX: e.screenX, screenY: e.screenY });
  }, []);

  useDocumentEvent("mousemove", onMouseMoveDocument);

  const onMouseUpDocument = React.useCallback(
    (e: MouseEvent) => {
      onDragFinish(e);
    },
    [onDragFinish],
  );

  useDocumentEvent("mouseup", onMouseUpDocument);

  const node = props.nodes[props.nodeId];

  const transformedNode = {
    ...node,
    x: (lastPosition.screenX - props.startPosition.screenX) / props.scale + node.x,
    y: (lastPosition.screenY - props.startPosition.screenY) / props.scale + node.y,
  };

  return (
    <>
      <props.nodeWrapperComponent id={props.nodeId}>
        <props.nodeComponent node={transformedNode} nodeId={props.nodeId} {...props.extraProps} />
      </props.nodeWrapperComponent>
      {props.edgeIds.map((id) => {
        const edge = props.edges[id];
        let source = props.nodes[edge.sourceId];
        let target = props.nodes[edge.targetId];

        if (props.nodeId === edge.sourceId) {
          source = {
            ...source,
            x: (lastPosition.screenX - props.startPosition.screenX) / props.scale + source.x,
            y: (lastPosition.screenY - props.startPosition.screenY) / props.scale + source.y,
          };
        }

        if (props.nodeId === edge.targetId) {
          target = {
            ...target,
            x: (lastPosition.screenX - props.startPosition.screenX) / props.scale + target.x,
            y: (lastPosition.screenY - props.startPosition.screenY) / props.scale + target.y,
          };
        }

        return (
          <props.edgeWrapperComponent id={id} key={id}>
            <props.edgeComponent
              edge={edge}
              edgeId={id}
              source={source}
              target={target}
              {...props.extraProps}
            />
          </props.edgeWrapperComponent>
        );
      })}
    </>
  );
}
