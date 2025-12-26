import { create } from 'zustand';

export interface Toast {
  id: string;
  message: string;
  type?: 'info' | 'warning' | 'error' | 'success';
  duration?: number;
}

interface ToastState {
  toasts: Toast[];
}

interface ToastActions {
  showToast: (message: string, type?: Toast['type'], duration?: number) => void;
  removeToast: (id: string) => void;
  clearToasts: () => void;
}

export const useToastStore = create<ToastState & ToastActions>((set, get) => ({
  toasts: [],

  showToast: (message, type = 'info', duration = 3000) => {
    const id = Date.now().toString() + Math.random().toString(36).slice(2);
    const newToast: Toast = { id, message, type, duration };

    set((state) => ({
      toasts: [...state.toasts, newToast],
    }));

    // Auto-remove after duration
    setTimeout(() => {
      get().removeToast(id);
    }, duration);
  },

  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((toast) => toast.id !== id),
    }));
  },

  clearToasts: () => {
    set({ toasts: [] });
  },
}));

// Convenience functions
export const showToast = (message: string, type?: Toast['type'], duration?: number) => {
  useToastStore.getState().showToast(message, type, duration);
};

export const showWarning = (message: string, duration?: number) => {
  showToast(message, 'warning', duration);
};

export const showError = (message: string, duration?: number) => {
  showToast(message, 'error', duration);
};

export const showSuccess = (message: string, duration?: number) => {
  showToast(message, 'success', duration);
};
