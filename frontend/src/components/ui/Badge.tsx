import React from 'react';

const variants: Record<string, { bg: string; text: string; dot: string }> = {
  draft: {
    bg: 'bg-slate-100 dark:bg-slate-800',
    text: 'text-slate-600 dark:text-slate-300',
    dot: 'bg-slate-400',
  },
  sent: {
    bg: 'bg-blue-50 dark:bg-blue-900/30',
    text: 'text-blue-700 dark:text-blue-300',
    dot: 'bg-blue-500',
  },
  near_due: {
    bg: 'bg-amber-50 dark:bg-amber-900/30',
    text: 'text-amber-700 dark:text-amber-300',
    dot: 'bg-amber-500',
  },
  overdue: {
    bg: 'bg-red-50 dark:bg-red-900/30',
    text: 'text-red-700 dark:text-red-300',
    dot: 'bg-red-500',
  },
  paid: {
    bg: 'bg-emerald-50 dark:bg-emerald-900/30',
    text: 'text-emerald-700 dark:text-emerald-300',
    dot: 'bg-emerald-500',
  },
  partial: {
    bg: 'bg-orange-50 dark:bg-orange-900/30',
    text: 'text-orange-700 dark:text-orange-300',
    dot: 'bg-orange-500',
  },
  cancelled: {
    bg: 'bg-slate-100 dark:bg-slate-800',
    text: 'text-slate-600 dark:text-slate-400',
    dot: 'bg-slate-400',
  },
  credit: {
    bg: 'bg-red-50 dark:bg-red-900/30',
    text: 'text-red-700 dark:text-red-300',
    dot: 'bg-red-500',
  },
  allocated: {
    bg: 'bg-emerald-50 dark:bg-emerald-900/30',
    text: 'text-emerald-700 dark:text-emerald-300',
    dot: 'bg-emerald-500',
  },
  to_refund: {
    bg: 'bg-orange-50 dark:bg-orange-900/30',
    text: 'text-orange-700 dark:text-orange-300',
    dot: 'bg-orange-500',
  },
  refunded: {
    bg: 'bg-emerald-50 dark:bg-emerald-900/30',
    text: 'text-emerald-700 dark:text-emerald-300',
    dot: 'bg-emerald-500',
  },
};

export default function Badge({
  variant,
  label,
  className = '',
}: {
  variant: string;
  label: string;
  className?: string;
}) {
  const v = variants[variant] || variants.draft;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold leading-4 whitespace-nowrap ring-1 ring-inset ring-black/[0.03] dark:ring-white/[0.05] ${v.bg} ${v.text} ${className}`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${v.dot}`}
        aria-hidden="true"
      />
      {label}
    </span>
  );
}