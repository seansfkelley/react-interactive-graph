import * as React from "react";

export interface SelectionSet {
  count: number;
  has(id: string): boolean;
  add(id: string): void;
  remove(id: string): void;
  toggle(id: string): void;
  clear(): void;
  map<T>(callback: (id: string) => T): T[];
  forEach(callback: (id: string) => void): void;
}

function useForceUpdate() {
  const [, setNonce] = React.useState(0);
  return React.useCallback(() => {
    setNonce((n) => n + 1);
  }, []);
}

export function useSelectionSet(): SelectionSet {
  const [set] = React.useState(() => new Set<string>());
  const forceUpdate = useForceUpdate();

  const count = set.size;
  const has = React.useMemo(() => set.has.bind(set), [set]);
  const add = React.useCallback(
    (id: string) => {
      if (!set.has(id)) {
        set.add(id);
        forceUpdate();
      }
    },
    [set, forceUpdate],
  );
  const remove = React.useCallback(
    (id: string) => {
      if (set.delete(id)) {
        forceUpdate();
      }
    },
    [set, forceUpdate],
  );

  const toggle = React.useCallback(
    (id: string) => {
      if (!set.delete(id)) {
        set.add(id);
      }
      forceUpdate();
    },
    [set, forceUpdate],
  );

  const clear = React.useCallback(() => {
    if (set.size > 0) {
      set.clear();
      forceUpdate();
    }
  }, [set, forceUpdate]);

  const map = React.useCallback(
    <T extends unknown>(callback: (id: string) => T) => {
      const array: T[] = [];
      for (const item of set) {
        array.push(callback(item));
      }
      return array;
    },
    [set],
  );

  const forEach = React.useCallback(
    (callback: (id: string) => void) => {
      for (const item of set) {
        callback(item);
      }
    },
    [set],
  );

  const selectionSet = React.useMemo(
    () => ({
      count,
      has,
      add,
      remove,
      toggle,
      clear,
      map,
      forEach,
    }),
    [count, has, add, remove, toggle, clear, map, forEach],
  );

  return selectionSet;
}
