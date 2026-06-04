import { useState, useCallback } from 'react';
import { ToastAction, ToastMessage, ToastType } from '../components/Common/Toast';
import { TOAST_DEFAULT_MS, TOAST_ERROR_MS } from '../config/toastTiming';

export const useToast = () => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = useCallback((
    type: ToastType,
    title: string,
    message?: string,
    duration?: number,
  ) => {
    const id = Date.now().toString() + Math.random().toString(36).slice(2);
    setToasts(prev => [...prev, { id, type, title, message, duration: duration ?? TOAST_DEFAULT_MS }]);
    return id;
  }, []);

  const addToastWithAction = useCallback((
    type: ToastType,
    title: string,
    message: string | undefined,
    duration: number | undefined,
    action: ToastAction,
    onDismiss?: () => void,
  ) => {
    const id = Date.now().toString() + Math.random().toString(36).slice(2);
    setToasts(prev => [
      ...prev,
      { id, type, title, message, duration: duration ?? TOAST_DEFAULT_MS, action, onDismiss },
    ]);
    return id;
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const success = useCallback(
    (title: string, message?: string, duration?: number) =>
      addToast('success', title, message, duration ?? TOAST_DEFAULT_MS),
    [addToast],
  );

  const error = useCallback(
    (title: string, message?: string) => addToast('error', title, message, TOAST_ERROR_MS),
    [addToast],
  );

  const warning = useCallback(
    (title: string, message?: string) => addToast('warning', title, message, TOAST_DEFAULT_MS),
    [addToast],
  );

  const info = useCallback(
    (title: string, message?: string) => addToast('info', title, message, TOAST_DEFAULT_MS),
    [addToast],
  );

  return { toasts, removeToast, addToastWithAction, success, error, warning, info };
};
