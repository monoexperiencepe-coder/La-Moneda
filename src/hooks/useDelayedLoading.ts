import { useEffect, useState } from 'react';

type Options = {
  /** Mostrar loader tras este ms (evita parpadeo). Default 250. */
  showAfterMs?: number;
  /** Mostrar mensaje largo tras este ms. Default 800. */
  messageAfterMs?: number;
};

/**
 * Convierte un flag `active` en visibilidad retardada para loaders premium.
 */
export function useDelayedLoading(
  active: boolean,
  { showAfterMs = 250, messageAfterMs = 800 }: Options = {},
) {
  const [showLoader, setShowLoader] = useState(false);
  const [showMessage, setShowMessage] = useState(false);

  useEffect(() => {
    if (!active) {
      setShowLoader(false);
      setShowMessage(false);
      return;
    }
    const t1 = window.setTimeout(() => setShowLoader(true), showAfterMs);
    const t2 = window.setTimeout(() => setShowMessage(true), messageAfterMs);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [active, showAfterMs, messageAfterMs]);

  return { showLoader, showMessage };
}
