# TODO

- support multiple edges and self-edges
- dragging node should be on top
- user should be able to modifier-click on ndoes/edges to force-pan
- should view pan if user mouses down on a node but no drag modifier is held?
- support arrows on self-edges
- straight-edged self-edges
- improve default/demo appearance
  - include hover states for interactive things
  - show pan/zoom values and allow settings/disabling them
  - clean up visuals
- allow implementing dragging multiple selected nodes at once
- code arch:
  - basic Graph component that does viewporting and event handling
  - more complex DefaultGraph component (or something) that supports selection/deletion/etc.
- edge hover: how to only mark hovering when near the actual line?
- how to change the appearance of nodes that are being hovered for edge creation?
- improve snap-to-grid
- box select
- implement pan/zoom controlled props and constraints
  - maybe "constraints" are really "settings"?
- pan/zoom controls
- CSS classes all over the place to allow for customization
- DOM rendering?
- canvas rendering?
- audit event handling to make sure it works as intended (for instance, node drag/background click overlap in using document-mouse-up)
- bug: https://stackoverflow.com/questions/19708943/svg-straight-path-with-clip-path-not-visible-in-chrome ?
- audit libraries and utilities to see if they're still used/dev only

# perf

## optimizations

- clipping out-of-bounds elements (doesn't seem worth it?)
  - naively (axis aligned bounding box)
    - [x] using react state: seems to make the problem worse
    - [ ] direct DOM manipuation
- [ ] low-res rendering while actively interacting?
- break apart high-frequency stateful rendering
  - [x] dragging nodes/edges (seems to work nicely!)
  - [ ] incomplete edge
- [ ] compare to other libraries
- [x] pure components for each node and edge to reduce render churn
