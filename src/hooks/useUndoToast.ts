/**
 * Toast de éxito con «Deshacer» opcional. El undo vive en UndoManager
 * durante toda la sesión; cerrar el toast NO cancela la reversión.
 */
import type { ToastAction } from '../components/Common/Toast';
import type { RegisterUndoInput } from '../undo/types';
import { DEFAULT_UNDO_TOAST_MS } from '../undo/types';

export type ShowUndoToastParams = {
  message: string;
  detail?: string;
  undoAction: RegisterUndoInput;
  /** Descripción en header / tooltip (default: message). */
  sessionLabel?: string;
  /** Solo duración del toast visible (ms). */
  toastDurationMs?: number;
};

type ToastApi = {
  success: (title: string, message?: string, duration?: number) => string;
  error: (title: string, message?: string) => string;
  addToastWithAction: (
    type: 'success',
    title: string,
    message: string | undefined,
    duration: number | undefined,
    action: ToastAction,
  ) => string;
  removeToast: (id: string) => void;
};

type UndoApi = {
  registerUndo: (input: RegisterUndoInput) => string;
  executeUndo: (actionId?: string) => Promise<'ok' | 'fail' | 'stale' | 'noop'>;
  latestActionId: string | null;
};

export function createShowUndoToast(toast: ToastApi, undo: UndoApi) {
  return function showUndoToast(params: ShowUndoToastParams): string {
    const sessionLabel = params.sessionLabel ?? params.message;
    const actionId = undo.registerUndo({
      ...params.undoAction,
      label: sessionLabel,
    });

    const toastDuration = params.toastDurationMs ?? DEFAULT_UNDO_TOAST_MS;

    const toastId = toast.addToastWithAction(
      'success',
      params.message,
      params.detail,
      toastDuration,
      {
        label: 'Deshacer',
        onClick: async () => {
          const res = await undo.executeUndo(actionId);
          toast.removeToast(toastId);
          if (res === 'ok') {
            toast.success('Cambio revertido');
          } else if (res === 'stale') {
            toast.error(
              'Acción más reciente',
              'Ya hay otra acción posterior. Usa «Deshacer» del encabezado.',
            );
          } else if (res === 'fail') {
            toast.error('No se pudo revertir el cambio.');
          }
        },
      },
    );

    return toastId;
  };
}
