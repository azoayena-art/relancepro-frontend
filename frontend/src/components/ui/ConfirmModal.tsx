import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';

export default function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirmer',
  variant = 'danger',
  loading = false,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  variant?: 'danger' | 'primary' | 'info';
  loading?: boolean;
}) {
  if (!isOpen) return null;

  const colors = {
    danger: {
      icon: 'text-red-600 dark:text-red-400',
      bg: 'bg-red-50 dark:bg-red-900/20',
      btn: 'bg-red-600 hover:bg-red-700 shadow-red-500/20',
    },
    primary: {
      icon: 'text-indigo-600 dark:text-indigo-400',
      bg: 'bg-indigo-50 dark:bg-indigo-900/20',
      btn: 'bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 shadow-indigo-500/20',
    },
    info: {
      icon: 'text-blue-600 dark:text-blue-400',
      bg: 'bg-blue-50 dark:bg-blue-900/20',
      btn: 'bg-blue-600 hover:bg-blue-700 shadow-blue-500/20',
    },
  }[variant];

  const Icon = variant === 'danger' ? AlertTriangle : Info;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/50 backdrop-blur-sm p-4 animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md overflow-hidden bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700 shadow-2xl shadow-slate-900/20 dark:shadow-black/30 animate-scaleIn"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div
              className={`flex h-11 w-11 items-center justify-center rounded-xl flex-shrink-0 ${colors.bg}`}
            >
              <Icon
                size={21}
                strokeWidth={2}
                className={colors.icon}
              />
            </div>

            <div className="flex-1 min-w-0 pt-0.5">
              <h3 className="text-[17px] font-semibold tracking-tight text-slate-900 dark:text-white">
                {title}
              </h3>

              <p className="mt-1.5 text-sm leading-5 text-slate-500 dark:text-slate-400">
                {message}
              </p>
            </div>
          </div>

          <div className="flex gap-3 mt-7">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-800 transition-all duration-150"
            >
              Annuler
            </button>

            <button
              type="button"
              onClick={onConfirm}
              disabled={loading}
              className={`flex-1 px-4 py-2.5 text-sm font-semibold text-white rounded-xl shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-800 transition-all duration-150 ${colors.btn}`}
            >
              {loading ? (
                <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
              ) : (
                <CheckCircle2 size={16} strokeWidth={2} />
              )}

              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}