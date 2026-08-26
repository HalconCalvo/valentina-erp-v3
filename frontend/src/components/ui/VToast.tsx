import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
  exiting?: boolean;
}

interface ToastContextValue {
  success: (message: string) => void;
  error: (message: string) => void;
  warning: (message: string) => void;
  info: (message: string) => void;
}

const MAX_TOASTS = 3;
const AUTO_DISMISS_MS = 4000;
const EXIT_ANIMATION_MS = 300;

const toastStyles: Record<ToastType, string> = {
  success: 'bg-emerald-600',
  error: 'bg-red-600',
  warning: 'bg-amber-500',
  info: 'bg-blue-600',
};

const ToastContext = createContext<ToastContextValue | null>(null);

let toastApi: ToastContextValue | null = null;

function createToastApi(
  addToast: (type: ToastType, message: string) => void,
): ToastContextValue {
  return {
    success: (message: string) => addToast('success', message),
    error: (message: string) => addToast('error', message),
    warning: (message: string) => addToast('warning', message),
    info: (message: string) => addToast('info', message),
  };
}

function toastFn(message: string) {
  toastApi?.info(message);
}

export const toast = Object.assign(toastFn, {
  success(message: string) {
    toastApi?.success(message);
  },
  error(message: string) {
    toastApi?.error(message);
  },
  warning(message: string) {
    toastApi?.warning(message);
  },
  info(message: string) {
    toastApi?.info(message);
  },
});

export const useToast = (): ToastContextValue => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast debe usarse dentro de VToastContainer');
  }
  return context;
};

const ToastViewport: React.FC<{
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}> = ({ toasts, onDismiss }) => (
  <div
    aria-live="polite"
    className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-3"
  >
    {toasts.map((item) => (
      <div
        key={item.id}
        role="status"
        className={`pointer-events-auto flex items-start gap-3 rounded-xl px-4 py-3 text-sm font-medium text-white shadow-lg transition-all duration-300 ease-out ${
          toastStyles[item.type]
        } ${
          item.exiting
            ? 'translate-x-full opacity-0'
            : 'translate-x-0 opacity-100 animate-in slide-in-from-right fade-in duration-300'
        }`}
      >
        <p className="flex-1 leading-snug">{item.message}</p>
        <button
          type="button"
          onClick={() => onDismiss(item.id)}
          className="shrink-0 rounded-full p-1 text-white/80 transition-colors hover:bg-white/20 hover:text-white"
          aria-label="Cerrar notificación"
        >
          <X size={16} />
        </button>
      </div>
    ))}
  </div>
);

export const VToastContainer: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const clearTimer = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const dismissToast = useCallback((id: string) => {
    clearTimer(id);

    setToasts((prev) =>
      prev.map((toastItem) =>
        toastItem.id === id ? { ...toastItem, exiting: true } : toastItem,
      ),
    );

    setTimeout(() => {
      setToasts((prev) => prev.filter((toastItem) => toastItem.id !== id));
    }, EXIT_ANIMATION_MS);
  }, [clearTimer]);

  const addToast = useCallback((type: ToastType, message: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    setToasts((prev) => {
      const next = [...prev, { id, message, type }];
      if (next.length <= MAX_TOASTS) return next;
      const overflow = next.slice(0, next.length - MAX_TOASTS);
      overflow.forEach((toastItem) => clearTimer(toastItem.id));
      return next.slice(-MAX_TOASTS);
    });

    const timer = setTimeout(() => dismissToast(id), AUTO_DISMISS_MS);
    timersRef.current.set(id, timer);
  }, [clearTimer, dismissToast]);

  const contextValue = useMemo(() => createToastApi(addToast), [addToast]);

  useEffect(() => {
    toastApi = contextValue;
    return () => {
      toastApi = null;
    };
  }, [contextValue]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismissToast} />
    </ToastContext.Provider>
  );
};
