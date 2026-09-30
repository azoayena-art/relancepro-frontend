const statusConfig: Record<string, { text: string; bg: string; ring: string; dot: string }> = {
  active: { text: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-500/10', ring: 'ring-emerald-600/10 dark:ring-emerald-500/20', dot: 'bg-emerald-500' },
  inactive: { text: 'text-slate-600 dark:text-slate-400', bg: 'bg-slate-100 dark:bg-slate-500/10', ring: 'ring-slate-500/10 dark:ring-slate-500/20', dot: 'bg-slate-400 dark:bg-slate-500' },
  archived: { text: 'text-slate-500 dark:text-slate-500', bg: 'bg-slate-50 dark:bg-slate-800/60', ring: 'ring-slate-500/10 dark:ring-slate-700/30', dot: 'bg-slate-400 dark:bg-slate-600' },
  new: { text: 'text-sky-700 dark:text-sky-400', bg: 'bg-sky-50 dark:bg-sky-500/10', ring: 'ring-sky-600/10 dark:ring-sky-500/20', dot: 'bg-sky-500' },
  contacted: { text: 'text-amber-700 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-500/10', ring: 'ring-amber-600/10 dark:ring-amber-500/20', dot: 'bg-amber-500' },
  quote_sent: { text: 'text-violet-700 dark:text-violet-400', bg: 'bg-violet-50 dark:bg-violet-500/10', ring: 'ring-violet-600/10 dark:ring-violet-500/20', dot: 'bg-violet-500' },
  pending: { text: 'text-orange-700 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-500/10', ring: 'ring-orange-600/10 dark:ring-orange-500/20', dot: 'bg-orange-500' },
  followup: { text: 'text-pink-700 dark:text-pink-400', bg: 'bg-pink-50 dark:bg-pink-500/10', ring: 'ring-pink-600/10 dark:ring-pink-500/20', dot: 'bg-pink-500' },
  won: { text: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-500/10', ring: 'ring-emerald-600/10 dark:ring-emerald-500/20', dot: 'bg-emerald-500' },
  lost: { text: 'text-rose-700 dark:text-rose-400', bg: 'bg-rose-50 dark:bg-rose-500/10', ring: 'ring-rose-600/10 dark:ring-rose-500/20', dot: 'bg-rose-500' },
  draft: { text: 'text-slate-700 dark:text-slate-400', bg: 'bg-slate-50 dark:bg-slate-500/10', ring: 'ring-slate-500/10 dark:ring-slate-500/20', dot: 'bg-slate-400 dark:bg-slate-500' },
  sent: { text: 'text-sky-700 dark:text-sky-400', bg: 'bg-sky-50 dark:bg-sky-500/10', ring: 'ring-sky-600/10 dark:ring-sky-500/20', dot: 'bg-sky-500' },
  near_due: { text: 'text-amber-700 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-500/10', ring: 'ring-amber-600/10 dark:ring-amber-500/20', dot: 'bg-amber-500' },
  overdue: { text: 'text-rose-700 dark:text-rose-400', bg: 'bg-rose-50 dark:bg-rose-500/10', ring: 'ring-rose-600/10 dark:ring-rose-500/20', dot: 'bg-rose-500' },
  paid: { text: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-500/10', ring: 'ring-emerald-600/10 dark:ring-emerald-500/20', dot: 'bg-emerald-500' },
  partial: { text: 'text-orange-700 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-500/10', ring: 'ring-orange-600/10 dark:ring-orange-500/20', dot: 'bg-orange-500' },
  cancelled: { text: 'text-slate-500 dark:text-slate-500', bg: 'bg-slate-50 dark:bg-slate-800/60', ring: 'ring-slate-500/10 dark:ring-slate-700/30', dot: 'bg-slate-400 dark:bg-slate-600' },
  refunded: { text: 'text-rose-700 dark:text-rose-400', bg: 'bg-rose-50 dark:bg-rose-500/10', ring: 'ring-rose-600/10 dark:ring-rose-500/20', dot: 'bg-rose-500' },
  partial_refund: { text: 'text-orange-700 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-500/10', ring: 'ring-orange-600/10 dark:ring-orange-500/20', dot: 'bg-orange-500' },
  to_refund: { text: 'text-amber-700 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-500/10', ring: 'ring-amber-600/10 dark:ring-amber-500/20', dot: 'bg-amber-500' },
  allocated: { text: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-500/10', ring: 'ring-emerald-600/10 dark:ring-emerald-500/20', dot: 'bg-emerald-500' },
};

const fallbackConfig = {
  text: 'text-slate-600 dark:text-slate-400',
  bg: 'bg-slate-100 dark:bg-slate-500/10',
  ring: 'ring-slate-500/10 dark:ring-slate-500/20',
  dot: 'bg-slate-400',
};

export const statusLabels: Record<string, string> = {
  active: 'Actif', inactive: 'Inactif', archived: 'Archivé',
  new: 'Nouveau', contacted: 'Contacté', quote_sent: 'Devis envoyé',
  pending: 'En attente', followup: 'Relance', won: 'Gagné', lost: 'Perdu',
  draft: 'Brouillon', sent: 'Envoyée', near_due: 'Bientôt échue',
  overdue: 'En retard', paid: 'Payée', partial: 'Partielle', cancelled: 'Archivée',
  refunded: 'Remboursé', partial_refund: 'Remb. partiel', to_refund: 'À rembourser', allocated: 'Avoir imputé',
};

export default function StatusIndicator({ status }: { status: string }) {
  const config = statusConfig[status] || fallbackConfig;
  const label = statusLabels[status] || status;

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold leading-4 whitespace-nowrap ring-1 ring-inset ${config.bg} ${config.text} ${config.ring}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${config.dot}`} />
      {label}
    </span>
  );
}