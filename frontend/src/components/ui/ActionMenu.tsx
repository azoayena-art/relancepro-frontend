import { useState, useRef, useEffect, ReactNode, ComponentType } from 'react';
import { MoreHorizontal } from 'lucide-react';

// ============================================================
// 📋 INTERFACE
// ============================================================

export interface ActionMenuItemProps {
  onClick: () => void;
  icon?: ComponentType<{ size?: number; className?: string }>;
  label: string;
  danger?: boolean;
  disabled?: boolean;
}

// ============================================================
// 🎯 ACTION MENU ITEM
// ============================================================

export const ActionMenuItem = ({
  onClick,
  icon: Icon,
  label,
  danger = false,
  disabled = false,
}: ActionMenuItemProps) => {
  const baseClasses =
    'w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors';
  const colorClasses = danger
    ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20'
    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700';
  const disabledClasses = disabled ? 'opacity-50 cursor-not-allowed' : '';

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${baseClasses} ${colorClasses} ${disabledClasses}`}
    >
      {Icon && <Icon size={16} />}
      <span>{label}</span>
    </button>
  );
};

// ============================================================
// 🎯 ACTION MENU (Dropdown 3 points)
// ============================================================

const ActionMenu = ({ children }: { children: ReactNode }) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Fermer le menu au clic extérieur
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
        aria-label="Actions"
      >
        <MoreHorizontal
          size={16}
          className="text-slate-500 dark:text-slate-400"
        />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1 w-48 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 py-1 z-50 animate-fadeIn">
          {children}
        </div>
      )}
    </div>
  );
};

export default ActionMenu;