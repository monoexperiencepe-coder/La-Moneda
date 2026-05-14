import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

export type UndoableEntry = {
  /** Identificador interno (evita colisiones en React key si hace falta). */
  id: string;
  /** Texto corto para tooltip / accesibilidad. */
  label: string;
  /** Debe devolver true si la reversión en servidor/estado fue aceptable. */
  undo: () => Promise<boolean>;
};

export type UndoExecuteResult = 'ok' | 'fail' | 'noop';

type UndoContextValue = {
  /** Registra la última acción reversible (reemplaza la anterior). No hace nada si ya se consumió el único deshacer de la sesión. */
  registerUndoable: (entry: UndoableEntry | null) => void;
  /**
   * Ejecuta `pending.undo`, vacía la cola y bloquea futuros deshaceres hasta recargar la página.
   */
  executeUndo: () => Promise<UndoExecuteResult>;
  pendingLabel: string | null;
  /** Si ya se ejecutó un deshacer con éxito en esta carga de página. */
  sessionUndoConsumed: boolean;
  undoRunning: boolean;
};

const UndoActionContext = createContext<UndoContextValue | null>(null);

export const UndoActionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [pending, setPending] = useState<UndoableEntry | null>(null);
  const [sessionUndoConsumed, setSessionUndoConsumed] = useState(false);
  const [undoRunning, setUndoRunning] = useState(false);
  const sessionConsumedRef = useRef(false);
  const pendingRef = useRef<UndoableEntry | null>(null);

  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  const registerUndoable = useCallback((entry: UndoableEntry | null) => {
    if (entry === null) {
      setPending(null);
      return;
    }
    if (sessionConsumedRef.current) return;
    setPending(entry);
  }, []);

  const executeUndo = useCallback(async (): Promise<UndoExecuteResult> => {
    const entry = pendingRef.current;
    if (sessionConsumedRef.current || !entry || undoRunning) return 'noop';
    setUndoRunning(true);
    try {
      const ok = await entry.undo();
      if (ok) {
        sessionConsumedRef.current = true;
        setSessionUndoConsumed(true);
        setPending(null);
        return 'ok';
      }
      return 'fail';
    } finally {
      setUndoRunning(false);
    }
  }, [undoRunning]);

  const value = useMemo(
    () => ({
      registerUndoable,
      executeUndo,
      pendingLabel: pending?.label ?? null,
      sessionUndoConsumed,
      undoRunning,
    }),
    [registerUndoable, executeUndo, pending, sessionUndoConsumed, undoRunning],
  );

  return <UndoActionContext.Provider value={value}>{children}</UndoActionContext.Provider>;
};

export function useUndoAction(): UndoContextValue {
  const ctx = useContext(UndoActionContext);
  if (!ctx) throw new Error('useUndoAction must be used within UndoActionProvider');
  return ctx;
}
