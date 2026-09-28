import { useState } from 'react';

// Class-component style state: setState merges a partial patch into the current state.
export function useMergeState<T extends object>(initial: T) {
  const [state, set] = useState(initial);
  const setState = (patch: Partial<T> | ((prev: T) => Partial<T>)) =>
    set((prev) => ({ ...prev, ...(typeof patch === 'function' ? patch(prev) : patch) }));
  return [state, setState] as const;
}
