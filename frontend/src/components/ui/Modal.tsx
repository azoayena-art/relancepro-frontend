import { useEffect, useEffect as _useEffect } from 'react';
import type { ReactNode, ReactElement } from 'react';
import { X } from 'lucide-react';

// ============================================================
// 📦 MODAL GÉNÉRIQUE
// ============================================================

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  maxWidth?: string;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
}

/**
 * Modal générique avec fond flouté.
 * - Responsive : bottom sheet sur mobile, centré sur desktop
 * - Fermeture au clic sur le backdrop (configurable)
 * - Fermeture avec la touche Escape (configurable)
 * - Animations fadeIn / slideUp
 */
export const Modal = ({
  open,
  onClose,
  title,
  icon,
  children,
  footer,
  maxWidth = 'sm:max-w-md',
  closeOnBackdrop = true,
  closeOnEscape = true,
}: ModalProps): ReactElement | null => {
  // Fermeture avec la touche Escape
  useEffect(() => {
    if (!open || !closeOnEscape) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [open, closeOnEscape, onClose]);

  // Empêche le scroll du body quand la modale est ouverte
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4 animate-fadeIn"
      onClick={closeOnBackdrop ? onClose : undefined}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className={`bg-white dark:bg-slate-800 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full ${maxWidth} max-h-[90vh] flex flex-col animate-slideUp`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* En-tête */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
          <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            {icon}
            {title}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
            aria-label="Fermer"
          >
            <X size={20} className="text-slate-500 dark:text-slate-400" />
          </button>
        </div>

        {/* Contenu */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
          {children}
        </div>

        {/* Pied de page (optionnel) */}
        {footer && (
          <div className="flex items-center justify-end gap-2 px-4 sm:px-6 py-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/90 rounded-b-2xl flex-shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

// ✅ Export default (compatible avec `import Modal from './Modal'`)
export default Modal;