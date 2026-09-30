import { TrendingUp, TrendingDown, Minus, Inbox, X, Receipt, FileText, UserCheck, Users, Package, AlertCircle } from 'lucide-react';
import type { ReactNode, ReactElement } from 'react';

// ============================================================
// 🌐 TYPES & INTERFACES GÉNÉRIQUES
// ============================================================

export interface Entity {
  type?: string;
  firstName?: string;
  lastName?: string;
  companyName?: string;
  email?: string;
  phone?: string;
}

export type DotTone =
  | 'sky'
  | 'teal'
  | 'violet'
  | 'amber'
  | 'emerald'
  | 'rose'
  | 'orange'
  | 'slate'
  | 'pink'
  | 'indigo'
  | 'red';

export type SharedStatus =
  | 'active' | 'inactive' | 'archived' | 'new' | 'contacted' | 'quote_sent'
  | 'pending' | 'followup' | 'won' | 'lost' | 'draft' | 'sent' | 'near_due'
  | 'overdue' | 'paid' | 'partial' | 'cancelled' | 'refunded' | 'partial_refund'
  | 'to_refund' | 'allocated';

// ============================================================
// 🏷️ LIBELLÉS CENTRALISÉS
// ============================================================

export const statusLabels: Record<string, string> = {
  active: 'Actif', inactive: 'Inactif', archived: 'Archivé',
  new: 'Nouveau', contacted: 'Contacté', quote_sent: 'Devis envoyé',
  pending: 'En attente', followup: 'Relance', won: 'Gagné', lost: 'Perdu',
  draft: 'Brouillon', sent: 'Envoyée', near_due: 'Bientôt échue',
  overdue: 'En retard', paid: 'Payée', partial: 'Partielle', cancelled: 'Archivée',
  refunded: 'Remboursé', partial_refund: 'Remb. partiel', to_refund: 'À rembourser', allocated: 'Avoir imputé',
};

export const typeLabels: Record<string, string> = {
  particulier: 'Particulier', entreprise: 'Entreprise',
  standard: 'Facture', advance: 'Acompte', balance: 'Solde', credit: 'Avoir',
  quote: 'Devis',
};

// ============================================================
// 🎨 CONFIGURATION VISUELLE DES STATUTS
// ============================================================

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

const toneMap: Record<DotTone, { text: string; dot: string; bg?: string; ring?: string }> = {
  sky: { text: 'text-sky-600 dark:text-sky-400', dot: 'bg-sky-400 dark:bg-sky-500', bg: 'bg-sky-50 dark:bg-sky-500/10', ring: 'ring-sky-600/10 dark:ring-sky-500/20' },
  teal: { text: 'text-teal-600 dark:text-teal-400', dot: 'bg-teal-400 dark:bg-teal-500', bg: 'bg-teal-50 dark:bg-teal-500/10', ring: 'ring-teal-600/10 dark:ring-teal-500/20' },
  violet: { text: 'text-violet-600 dark:text-violet-400', dot: 'bg-violet-400 dark:bg-violet-500', bg: 'bg-violet-50 dark:bg-violet-500/10', ring: 'ring-violet-600/10 dark:ring-violet-500/20' },
  amber: { text: 'text-amber-600 dark:text-amber-400', dot: 'bg-amber-400 dark:bg-amber-500', bg: 'bg-amber-50 dark:bg-amber-500/10', ring: 'ring-amber-600/10 dark:ring-amber-500/20' },
  emerald: { text: 'text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-400 dark:bg-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-500/10', ring: 'ring-emerald-600/10 dark:ring-emerald-500/20' },
  rose: { text: 'text-rose-600 dark:text-rose-400', dot: 'bg-rose-400 dark:bg-rose-500', bg: 'bg-rose-50 dark:bg-rose-500/10', ring: 'ring-rose-600/10 dark:ring-rose-500/20' },
  orange: { text: 'text-orange-600 dark:text-orange-400', dot: 'bg-orange-400 dark:bg-orange-500', bg: 'bg-orange-50 dark:bg-orange-500/10', ring: 'ring-orange-600/10 dark:ring-orange-500/20' },
  slate: { text: 'text-slate-500 dark:text-slate-400', dot: 'bg-slate-400 dark:bg-slate-500', bg: 'bg-slate-50 dark:bg-slate-500/10', ring: 'ring-slate-500/10 dark:ring-slate-500/20' },
  pink: { text: 'text-pink-600 dark:text-pink-400', dot: 'bg-pink-400 dark:bg-pink-500', bg: 'bg-pink-50 dark:bg-pink-500/10', ring: 'ring-pink-600/10 dark:ring-pink-500/20' },
  indigo: { text: 'text-indigo-600 dark:text-indigo-400', dot: 'bg-indigo-400 dark:bg-indigo-500', bg: 'bg-indigo-50 dark:bg-indigo-500/10', ring: 'ring-indigo-600/10 dark:ring-indigo-500/20' },
  red: { text: 'text-red-600 dark:text-red-400', dot: 'bg-red-400 dark:bg-red-500', bg: 'bg-red-50 dark:bg-red-500/10', ring: 'ring-red-600/10 dark:ring-red-500/20' },
};

export const typeTones: Record<string, DotTone> = {
  entreprise: 'sky', particulier: 'teal',
  standard: 'violet', advance: 'sky', balance: 'teal', credit: 'rose',
  quote: 'indigo',
};

export const mapInvoiceStatusToShared = (status: string, type?: string, creditStatus?: string): string => {
  if (type === 'credit') {
    if (creditStatus === 'refunded') return 'won';
    if (creditStatus === 'allocated') return 'active';
    if (creditStatus === 'partial_refund') return 'followup';
    if (creditStatus === 'to_refund') return 'pending';
    return 'contacted';
  }
  switch (status) {
    case 'paid': return 'won';
    case 'partial': return 'followup';
    case 'overdue': return 'lost';
    case 'near_due': return 'pending';
    case 'sent': return 'contacted';
    case 'draft': return 'new';
    case 'cancelled': return 'archived';
    default: return status;
  }
};

export const toEntity = (item: any): Entity => {
  if (!item) return { type: 'particulier' };
  if (item.clientName && !item.firstName) {
    return { type: 'entreprise', companyName: item.clientName, email: item.clientEmail, phone: item.clientPhone };
  }
  return {
    type: item.type || 'particulier', firstName: item.firstName, lastName: item.lastName,
    companyName: item.companyName, email: item.email, phone: item.phone,
  };
};

export const formatDate = (d?: string | null): string => {
  if (!d) return '-';
  try { return new Date(d).toLocaleDateString('fr-FR'); } catch { return '-'; }
};

// ============================================================
// ✨ COMPOSANTS UI
// ============================================================

export const StatusIndicator = ({ status }: { status: string }) => {
  const config = statusConfig[status] || fallbackConfig;
  const label = statusLabels[status] || status;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold leading-4 whitespace-nowrap ring-1 ring-inset ${config.bg} ${config.text} ${config.ring}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${config.dot}`} />
      {label}
    </span>
  );
};

export const DotLabel = ({ label, tone = 'slate' }: { label: string; tone?: DotTone }) => {
  const config = toneMap[tone] || toneMap.slate;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${config.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${config.dot}`} />
      {label}
    </span>
  );
};

export const TypeLabel = ({ type }: { type: string }) => (
  <DotLabel label={typeLabels[type] || type} tone={typeTones[type] || 'slate'} />
);

export const Avatar = ({ client, size = 'md' }: { client: Entity; size?: 'sm' | 'md' | 'lg' }) => {
  const initials = client.type === 'entreprise'
    ? (client.companyName?.charAt(0) || 'E').toUpperCase()
    : ((client.firstName?.charAt(0) || '') + (client.lastName?.charAt(0) || '')).toUpperCase() || '?';
  const sizeClasses = { sm: 'w-8 h-8 text-xs', md: 'w-9 h-9 text-xs', lg: 'w-11 h-11 text-sm' }[size];
  return (
    <div className={`flex-shrink-0 ${sizeClasses} rounded-full bg-indigo-50 dark:bg-indigo-500/10 ring-1 ring-inset ring-indigo-100 dark:ring-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-300 font-semibold`}>
      {initials}
    </div>
  );
};

export const StatCell = ({ value, trend, label, sublabel, active, onClick }: {
  value: ReactNode; trend?: number; label: string; sublabel?: string; active?: boolean; onClick?: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    className="relative bg-white dark:bg-slate-800 px-4 py-3 text-left transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-700/30 focus:outline-none w-full border-r border-slate-200 dark:border-slate-700 last:border-r-0"
  >
    <div className="flex items-baseline gap-1.5 flex-wrap">
      <span className="text-lg font-bold tracking-tight text-slate-900 dark:text-white tabular-nums">{value}</span>
      {typeof trend === 'number' && (
        <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold tabular-nums ${trend > 0 ? 'text-emerald-500' : trend < 0 ? 'text-red-500' : 'text-slate-400 dark:text-slate-500'}`}>
          {trend > 0 ? <TrendingUp size={10} strokeWidth={2.5} /> : trend < 0 ? <TrendingDown size={10} strokeWidth={2.5} /> : <Minus size={10} />}
          {trend > 0 ? '+' : ''}{trend}%
        </span>
      )}
    </div>
    <p className="text-[11px] font-medium text-slate-700 dark:text-slate-300 mt-0.5">{label}</p>
    {sublabel && <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">{sublabel}</p>}
    {active && <span className="absolute left-4 right-4 bottom-0 h-[2px] rounded-full bg-slate-900 dark:bg-white" />}
  </button>
);

export const EmptyState = ({
  icon: Icon = Inbox, title, description, action, tone = 'slate',
}: {
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  title: string; description?: string; action?: ReactNode;
  tone?: 'slate' | 'indigo' | 'emerald' | 'rose' | 'amber';
}) => {
  const iconToneMap: Record<string, string> = {
    slate: 'text-slate-300 dark:text-slate-600', indigo: 'text-indigo-300 dark:text-indigo-600',
    emerald: 'text-emerald-300 dark:text-emerald-600', rose: 'text-rose-300 dark:text-rose-600',
    amber: 'text-amber-300 dark:text-amber-600',
  };
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-12 text-center shadow-sm">
      <Icon size={48} className={`mx-auto mb-4 ${iconToneMap[tone]}`} />
      <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-2">{title}</h3>
      {description && <p className="text-sm text-slate-500 dark:text-slate-400 mb-4 max-w-md mx-auto">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
};

export const Modal = ({
  open, onClose, title, icon: Icon, iconColor = 'text-indigo-600', children, footer, maxWidth = 'max-w-md', closeOnBackdrop = true,
}: {
  open: boolean; onClose: () => void; title: string;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  iconColor?: string; children: ReactNode; footer?: ReactNode;
  maxWidth?: string; closeOnBackdrop?: boolean;
}): ReactElement | null => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4 animate-fadeIn" onClick={closeOnBackdrop ? onClose : undefined}>
      <div className={`bg-white dark:bg-slate-800 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:${maxWidth} max-h-[90vh] flex flex-col animate-slideUp`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
          <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            {Icon && <Icon size={20} className={iconColor} />}
            {title}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors">
            <X size={20} className="text-slate-500 dark:text-slate-400" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 px-4 sm:px-6 py-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/90 rounded-b-2xl flex-shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

/** ✅ NOUVEAU PageHeader Adouci */
export const PageHeader = ({
  icon: Icon,
  iconColor = 'purple',
  title,
  description,
  actions,
}: {
  icon?: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
  iconColor?: 'purple' | 'sky' | 'emerald' | 'rose' | 'amber' | 'indigo' | 'violet' | 'cyan';
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) => {
  const colorMap = {
    purple: { bg: 'bg-purple-50 dark:bg-purple-500/10', ring: 'ring-purple-100 dark:ring-purple-500/20', text: 'text-purple-600 dark:text-purple-400' },
    sky: { bg: 'bg-sky-50 dark:bg-sky-500/10', ring: 'ring-sky-100 dark:ring-sky-500/20', text: 'text-sky-600 dark:text-sky-400' },
    emerald: { bg: 'bg-emerald-50 dark:bg-emerald-500/10', ring: 'ring-emerald-100 dark:ring-emerald-500/20', text: 'text-emerald-600 dark:text-emerald-400' },
    rose: { bg: 'bg-rose-50 dark:bg-rose-500/10', ring: 'ring-rose-100 dark:ring-rose-500/20', text: 'text-rose-600 dark:text-rose-400' },
    amber: { bg: 'bg-amber-50 dark:bg-amber-500/10', ring: 'ring-amber-100 dark:ring-amber-500/20', text: 'text-amber-600 dark:text-amber-400' },
    indigo: { bg: 'bg-indigo-50 dark:bg-indigo-500/10', ring: 'ring-indigo-100 dark:ring-indigo-500/20', text: 'text-indigo-600 dark:text-indigo-400' },
    violet: { bg: 'bg-violet-50 dark:bg-violet-500/10', ring: 'ring-violet-100 dark:ring-violet-500/20', text: 'text-violet-600 dark:text-violet-400' },
    cyan: { bg: 'bg-cyan-50 dark:bg-cyan-500/10', ring: 'ring-cyan-100 dark:ring-cyan-500/20', text: 'text-cyan-600 dark:text-cyan-400' },
  };

  const colors = colorMap[iconColor] || colorMap.purple;

  return (
    <header className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-md shadow-sm border-b border-slate-200/60 dark:border-slate-700/60 sticky top-0 z-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            {Icon && (
              <div className={`w-10 h-10 rounded-xl ${colors.bg} ring-1 ring-inset ${colors.ring} flex items-center justify-center`}>
                <Icon size={20} className={colors.text} strokeWidth={2} />
              </div>
            )}
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                {title}
              </h1>
              {description && (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {description}
                </p>
              )}
            </div>
          </div>

          {actions && (
            <div className="flex items-center gap-2">
              {actions}
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export const TabButton = ({
  active, onClick, children, count, color = 'purple',
}: {
  active: boolean; onClick: () => void; children: ReactNode; count?: number;
  color?: 'purple' | 'cyan' | 'indigo' | 'emerald';
}) => {
  const colorMap = {
    purple: { active: 'border-purple-600 text-purple-600 dark:text-purple-400' },
    cyan: { active: 'border-cyan-600 text-cyan-600 dark:text-cyan-400' },
    indigo: { active: 'border-indigo-600 text-indigo-600 dark:text-indigo-400' },
    emerald: { active: 'border-emerald-600 text-emerald-600 dark:text-emerald-400' },
  };
  const activeClass = colorMap[color].active;
  return (
    <button
      onClick={onClick}
      className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${active ? activeClass : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}
    >
      {children}
      {typeof count === 'number' && <span className="ml-1.5 text-xs text-slate-400 tabular-nums">({count})</span>}
    </button>
  );
};

export const SkeletonRow = () => (
  <tr className="animate-pulse">
    <td className="px-6 py-4"><div className="flex items-center gap-3"><div className="w-9 h-9 bg-slate-200 dark:bg-slate-700 rounded-full" /><div className="space-y-2 flex-1"><div className="h-4 bg-slate-200 dark:bg-slate-700 rounded-md w-32" /><div className="h-3 bg-slate-200 dark:bg-slate-700 rounded-md w-24" /></div></div></td>
    <td className="px-6 py-4"><div className="space-y-2"><div className="h-3 bg-slate-200 dark:bg-slate-700 rounded-md w-40" /><div className="h-3 bg-slate-200 dark:bg-slate-700 rounded-md w-28" /></div></td>
    <td className="px-6 py-4"><div className="h-4 bg-slate-200 dark:bg-slate-700 rounded-md w-20" /></td>
    <td className="px-6 py-4"><div className="h-5 bg-slate-200 dark:bg-slate-700 rounded-full w-16" /></td>
    <td className="px-2 py-4 w-12"><div className="h-8 bg-slate-200 dark:bg-slate-700 rounded-lg w-8 ml-auto" /></td>
  </tr>
);

export const SkeletonCard = () => (
  <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm animate-pulse">
    <div className="flex justify-between items-start mb-4">
      <div className="flex items-center gap-3 flex-1"><div className="w-10 h-10 bg-slate-200 dark:bg-slate-700 rounded-full" /><div className="space-y-2 flex-1"><div className="h-4 bg-slate-200 dark:bg-slate-700 rounded-md w-32" /><div className="h-3 bg-slate-200 dark:bg-slate-700 rounded-md w-24" /></div></div>
      <div className="h-5 bg-slate-200 dark:bg-slate-700 rounded-full w-16" />
    </div>
    <div className="h-16 bg-slate-100 dark:bg-slate-900/50 rounded-xl mb-4" />
    <div className="h-10 bg-slate-200 dark:bg-slate-700 rounded-xl" />
  </div>
);