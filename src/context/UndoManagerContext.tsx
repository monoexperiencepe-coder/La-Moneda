import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { RegisterUndoInput, UndoAction, UndoExecuteResult } from '../undo/types';

/** @deprecated Usar `RegisterUndoInput`. */
export type UndoableEntry = {
  id: string;
  label: string;
  undo: () => Promise<boolean>;
};

type UndoManagerValue = {
  /** Registra la única acción reversible de la sesión (reemplaza la anterior). */
  registerUndo: (input: RegisterUndoInput) => string;
  executeUndo: (actionId?: string) => Promise<UndoExecuteResult>;
  clearUndo: () => void;
  getAction: (actionId: string) => UndoAction | undefined;
  /** Última acción reversible o null. */
  lastAction: UndoAction | null;
  latestActionId: string | null;
  latestLabel: string | null;
  undoRunning: boolean;
  registerUndoable: (entry: UndoableEntry | null) => void;
};

const UndoManagerContext = createContext<UndoManagerValue | null>(null);

function newActionId(): string {
  return `undo-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export const UndoManagerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lastAction, setLastAction] = useState<UndoAction | null>(null);
  const [undoRunning, setUndoRunning] = useState(false);
  const lastActionRef = useRef<UndoAction | null>(null);

  lastActionRef.current = lastAction;

  const clearUndo = useCallback(() => {
    setLastAction(null);
  }, []);

  const registerUndo = useCallback((input: RegisterUndoInput): string => {
    const id = newActionId();
    const action: UndoAction = {
      id,
      type: input.type,
      label: input.label,
      entityType: input.entityType,
      entityId: input.entityId,
      timestamp: Date.now(),
      undo: input.undo,
    };
    setLastAction(action);
    return id;
  }, []);

  const registerUndoable = useCallback(
    (entry: UndoableEntry | null) => {
      if (!entry) return;
      registerUndo({
        type: 'update',
        label: entry.label,
        entityType: 'other',
        entityId: entry.id,
        undo: async () => {
          const ok = await entry.undo();
          if (!ok) throw new Error('undo_failed');
        },
      });
    },
    [registerUndo],
  );

  const executeUndo = useCallback(
    async (actionId?: string): Promise<UndoExecuteResult> => {
      const target = lastActionRef.current;
      if (!target || undoRunning) return 'noop';

      if (actionId && actionId !== target.id) {
        return 'stale';
      }

      setUndoRunning(true);
      try {
        await target.undo();
        setLastAction(null);
        return 'ok';
      } catch {
        return 'fail';
      } finally {
        setUndoRunning(false);
      }
    },
    [undoRunning],
  );

  const getAction = useCallback((actionId: string) => {
    const a = lastActionRef.current;
    return a?.id === actionId ? a : undefined;
  }, []);

  const value = useMemo(
    () => ({
      registerUndo,
      executeUndo,
      clearUndo,
      getAction,
      lastAction,
      latestActionId: lastAction?.id ?? null,
      latestLabel: lastAction?.label ?? null,
      undoRunning,
      registerUndoable,
    }),
    [
      registerUndo,
      executeUndo,
      clearUndo,
      getAction,
      lastAction,
      undoRunning,
      registerUndoable,
    ],
  );

  return <UndoManagerContext.Provider value={value}>{children}</UndoManagerContext.Provider>;
};

export function useUndoManager(): UndoManagerValue {
  const ctx = useContext(UndoManagerContext);
  if (!ctx) throw new Error('useUndoManager must be used within UndoManagerProvider');
  return ctx;
}

export const UndoActionProvider = UndoManagerProvider;

export function useUndoAction(): UndoManagerValue & {
  pendingLabel: string | null;
  sessionUndoConsumed: boolean;
} {
  const m = useUndoManager();
  return {
    ...m,
    pendingLabel: m.latestLabel,
    sessionUndoConsumed: false,
  };
}
