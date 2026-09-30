import type { ReactNode } from 'react';

interface MobileCardProps {
  children: ReactNode;
  className?: string;
}

export default function MobileCard({ children, className = '' }: MobileCardProps) {
  return (
    <div
      className={`bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 ${className}`}
    >
      {children}
    </div>
  );
}