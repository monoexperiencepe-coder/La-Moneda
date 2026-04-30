import { useState, useCallback } from 'react';
import { ToastMessage, ToastType } from '../components/Common/Toast';

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
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const success = useCallback((title: string, message?: string) =>
    addToast('success', title, message), [addToast]);

  const error = useCallback((title: string, message?: string) =>
    addToast('error', title, message, 5000), [addToast]);

  const warning = useCallback((title: string, message?: string) =>
    addToast('warning', title, message), [addToast]);

  const info = useCallback((title: string, message?: string) =>
    addToast('info', title, message), [addToast]);

  return { toasts, removeToast, success, error, warning, info };
};
