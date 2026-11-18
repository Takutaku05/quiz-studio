import { useCallback, useEffect, useState } from 'react';

/**
 * Manages a boolean flag that automatically resets to false after `durationMs`.
 */
export function useTransientFlag(durationMs = 2000): [boolean, () => void, () => void] {
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!active) return;
    const timer = window.setTimeout(() => setActive(false), durationMs);
    return () => window.clearTimeout(timer);
  }, [active, durationMs]);

  const trigger = useCallback(() => setActive(true), []);
  const clear = useCallback(() => setActive(false), []);

  return [active, trigger, clear];
}
