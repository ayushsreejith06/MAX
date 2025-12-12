'use client';

import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';

export interface Toast {
  id: string;
  message: string;
  type?: 'info' | 'error' | 'success';
}

interface ToastProps {
  toast: Toast;
  onClose: (id: string) => void;
}

function ToastItem({ toast, onClose }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose(toast.id);
    }, 5000); // Auto-dismiss after 5 seconds

    return () => clearTimeout(timer);
  }, [toast.id, onClose]);

  const bgColor = toast.type === 'error' 
    ? 'bg-error-red/90 border-error-red' 
    : toast.type === 'success'
    ? 'bg-sage-green/90 border-sage-green'
    : 'bg-ink-600/90 border-ink-500';

  return (
    <div
      className={`${bgColor} border rounded-lg px-4 py-3 text-floral-white font-mono text-sm shadow-lg flex items-center justify-between gap-4 min-w-[300px] max-w-[500px]`}
    >
      <span>{toast.message}</span>
      <button
        onClick={() => onClose(toast.id)}
        className="text-floral-white/70 hover:text-floral-white transition-colors flex-shrink-0"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

interface ToastContainerProps {
  toasts: Toast[];
  onClose: (id: string) => void;
}

export function ToastContainer({ toasts, onClose }: ToastContainerProps) {
  if (!toasts || toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto">
          <ToastItem toast={toast} onClose={onClose} />
        </div>
      ))}
    </div>
  );
}

// Hook for managing toasts
export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = (message: string, type: 'info' | 'error' | 'success' = 'info') => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    setToasts((prev) => [...prev, { id, message, type }]);
  };

  const closeToast = (id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  };

  return { toasts, showToast, closeToast };
}

