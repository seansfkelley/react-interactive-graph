import * as React from "react";

export interface SelectionSet {
  count: number;
  has(id: string): boolean;
  add(id: string): void;
  remove(id: string): void;
  toggle(id: string): void;
  reset(id?: string): void;
}

function useForceUpdate(): [() => void, unknown] {
  const [nonce, setNonce] = React.useState(0);
  return [
    React.useCallback(() => {
      setNonce((n) => n + 1);
    }, []),
    nonce,
  ];
}

export function useSelectionSet(): SelectionSet {
  const [set] = React.useState(() => new Set<string>());
  const [forceUpdate, updateNonce] = useForceUpdate();

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

  const reset = React.useCallback(
    (id?: string) => {
      set.clear();
      if (id != null) {
        set.add(id);
      }
      forceUpdate();
    },
    [set, forceUpdate],
  );

  const selectionSet = React.useMemo(
    () => ({
      count,
      has,
      add,
      remove,
      toggle,
      reset,
    }),
    // TODO: updateNonce isn't great. What's the contract this hook should have w/r/t object identity?
    [count, has, add, remove, toggle, reset, updateNonce],
  );

  return selectionSet;
}
