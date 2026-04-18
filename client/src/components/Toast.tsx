'use client';
import { useState, useCallback, createContext, useContext, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, XCircle, AlertTriangle, X, Trash2 } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type ToastType = 'success' | 'error' | 'warning';

interface Toast {
  id: number;
  type: ToastType;
  title: string;
  message?: string;
}

interface ConfirmState {
  title: string;
  message: string;
  resolve: (ok: boolean) => void;
}

interface ToastContextValue {
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
  warning: (title: string, message?: string) => void;
  confirm: (title: string, message: string) => Promise<boolean>;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const idRef = useRef(0);

  const push = useCallback((type: ToastType, title: string, message?: string) => {
    const id = ++idRef.current;
    setToasts(t => [...t, { id, type, title, message }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4000);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts(t => t.filter(x => x.id !== id));
  }, []);

  const confirm = useCallback((title: string, message: string): Promise<boolean> =>
    new Promise(resolve => setConfirmState({ title, message, resolve })), []);

  const handleConfirm = (ok: boolean) => {
    confirmState?.resolve(ok);
    setConfirmState(null);
  };

  const value: ToastContextValue = {
    success: (t, m) => push('success', t, m),
    error: (t, m) => push('error', t, m),
    warning: (t, m) => push('warning', t, m),
    confirm,
  };

  const ICON = { success: CheckCircle, error: XCircle, warning: AlertTriangle };
  const COLORS = {
    success: { bg: 'bg-emerald-500/15', border: 'border-emerald-500/30', icon: 'text-emerald-400', bar: 'bg-emerald-500' },
    error:   { bg: 'bg-red-500/15',     border: 'border-red-500/30',     icon: 'text-red-400',     bar: 'bg-red-500'     },
    warning: { bg: 'bg-amber-500/15',   border: 'border-amber-500/30',   icon: 'text-amber-400',   bar: 'bg-amber-500'   },
  };

  return (
    <ToastContext.Provider value={value}>
      {children}

      {/* Toast stack */}
      <div className="fixed top-5 right-5 z-[9999] flex flex-col gap-2 w-80 pointer-events-none">
        <AnimatePresence>
          {toasts.map(t => {
            const Icon = ICON[t.type];
            const c = COLORS[t.type];
            return (
              <motion.div key={t.id}
                initial={{ opacity: 0, x: 60, scale: 0.9 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 60, scale: 0.9 }}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                className={`pointer-events-auto relative overflow-hidden rounded-2xl border ${c.bg} ${c.border} backdrop-blur-xl shadow-2xl`}>
                {/* Progress bar */}
                <motion.div className={`absolute top-0 left-0 h-0.5 ${c.bar}`}
                  initial={{ width: '100%' }} animate={{ width: '0%' }}
                  transition={{ duration: 4, ease: 'linear' }} />
                <div className="flex items-start gap-3 p-4">
                  <Icon size={18} className={`${c.icon} flex-shrink-0 mt-0.5`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white">{t.title}</p>
                    {t.message && <p className="text-xs text-white/60 mt-0.5 leading-relaxed">{t.message}</p>}
                  </div>
                  <button onClick={() => dismiss(t.id)} className="text-white/30 hover:text-white/70 transition-colors flex-shrink-0">
                    <X size={14} />
                  </button>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Confirm dialog */}
      <AnimatePresence>
        {confirmState && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9998] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-[#18181b] border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 bg-red-500/15 rounded-xl">
                  <Trash2 size={16} className="text-red-400" />
                </div>
                <h3 className="font-bold text-white">{confirmState.title}</h3>
              </div>
              <p className="text-sm text-gray-400 mb-6 leading-relaxed">{confirmState.message}</p>
              <div className="flex gap-3">
                <button onClick={() => handleConfirm(false)}
                  className="flex-1 border border-white/10 rounded-xl py-2.5 text-sm hover:bg-white/5 transition-colors">
                  Cancel
                </button>
                <button onClick={() => handleConfirm(true)}
                  className="flex-1 bg-red-600 hover:bg-red-500 rounded-xl py-2.5 text-sm font-bold transition-colors">
                  Delete
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </ToastContext.Provider>
  );
}
