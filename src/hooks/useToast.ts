import { useState, useCallback } from 'react';
import { ToastAction, ToastMessage, ToastType } from '../components/Common/Toast';

export const useToast = () => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = useCallback((
    type: ToastType,
    title: string,
    message?: string,
    duration?: number,
  ) => {
    const id = Date.now().toString() + Math.random().toString(36).slice(2);
    setToasts(prev => [...prev, { id, type, title, message, duration }]);
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
    setToasts(prev => [...prev, { id, type, title, message, duration, action, onDismiss }]);
    return id;
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const success = useCallback((title: string, message?: string, duration?: number) =>
    addToast('success', title, message, duration), [addToast]);

  const error = useCallback((title: string, message?: string) =>
    addToast('error', title, message, 5000), [addToast]);

  const warning = useCallback((title: string, message?: string) =>
    addToast('warning', title, message), [addToast]);

  const info = useCallback((title: string, message?: string) =>
    addToast('info', title, message), [addToast]);

  return { toasts, removeToast, addToastWithAction, success, error, warning, info };
};
