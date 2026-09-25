import * as React from "react";

const fallbackSelectorHook = (
  subscribe: (callback: () => void) => () => void,
  getSnapshot: () => unknown,
  getServerSnapshot?: () => unknown,
  selector?: (snapshot: unknown) => unknown,
  isEqual?: (a: unknown, b: unknown) => boolean,
) => {
  const snapshot = React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const selected = React.useMemo(() => (selector ? selector(snapshot) : snapshot), [selector, snapshot]);
  const lastSelected = React.useRef(selected);

  if (isEqual && lastSelected.current !== undefined && isEqual(lastSelected.current, selected)) {
    return lastSelected.current;
  }

  lastSelected.current = selected;
  return selected;
};

export const useSyncExternalStoreWithSelector =
  "useSyncExternalStoreWithSelector" in React
    ? (React.useSyncExternalStoreWithSelector as typeof React.useSyncExternalStoreWithSelector)
    : fallbackSelectorHook;

export default useSyncExternalStoreWithSelector;
