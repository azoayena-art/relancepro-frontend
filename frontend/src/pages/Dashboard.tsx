import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { databases, DATABASE_ID } from '../appwrite';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { useCompanySettings } from '../hooks/useCompanySettings';
import { Query } from 'appwrite';
import { toast } from 'sonner';
import {
  PageHeader,
  KPIGrid,
  StatCell,
  EmptyState,
  Alert,
  Card,
  SectionTitle,
  Badge,
} from '../components/ui/SharedUI';
import {
  Clock, AlertCircle, CheckCircle2, ArrowUpRight,
  Calendar, Activity, Bell, Receipt, FileText,
  Users, FilePlus, UserPlus, TrendingUp
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import Sidebar from '../components/Sidebar';

// ============================================================
// 📋 INTERFACES
// ============================================================

interface Invoice {
  $id: string;
  invoiceNumber: string;
  clientName: string;
  teamId: string;
  total: number;
  subtotal: number;
  tax?: number;
  type?: string;
  status?: string;
  payments?: any;
  $createdAt?: string;
  paidAt?: string;
  issueDate?: string;
  dueDate?: string;
  companyTva?: string;
  originalInvoiceId?: string;
}

interface DashboardAlert {
  type: 'warning' | 'danger' | 'info' | 'success';
  title: string;
  description: string;
  action?: string;
  count?: number;
}

interface RecentActivity {
  type: 'quote' | 'invoice' | 'payment' | 'prospect' | 'client';
  title: string;
  subtitle: string;
  amount?: string;
  date: string;
  status?: string;
}

// ============================================================
// 🎨 CONSTANTES
// ============================================================

const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4'];

// ============================================================
// 🎯 COMPOSANT PRINCIPAL
// ============================================================

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { hasPermission, loading: permLoading } = usePermissions();
  const {
    fm,
    currency,
    currencyConfig,
    isSubjectToVAT,
    loading: settingsLoading,
    companyName
  } = useCompanySettings();

  const [alerts, setAlerts] = useState<DashboardAlert[]>([]);
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [chartData, setChartData] = useState<any[]>([]);
  const [pieData, setPieData] = useState<any[]>([]);
  const [goalProgress, setGoalProgress] = useState(0);
  const [monthlyGoal, setMonthlyGoal] = useState(0);
  const [caCurrentMonth, setCaCurrentMonth] = useState(0);
  const [caCurrentMonthHT, setCaCurrentMonthHT] = useState(0);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // KPIs
  const [caTrend, setCaTrend] = useState(0);
  const [pendingQuotesCount, setPendingQuotesCount] = useState(0);
  const [pendingQuotesAmount, setPendingQuotesAmount] = useState(0);
  const [unpaidInvoicesCount, setUnpaidInvoicesCount] = useState(0);
  const [unpaidAmount, setUnpaidAmount] = useState(0);
  const [conversionRate, setConversionRate] = useState(0);
  const [acceptedQuotesCount, setAcceptedQuotesCount] = useState(0);
  const [sentQuotesCount, setSentQuotesCount] = useState(0);
  const [standardInvoicesCount, setStandardInvoicesCount] = useState(0);

  useEffect(() => {
    if (!user || permLoading || settingsLoading) return;
    loadDashboardData();
  }, [user, permLoading, settingsLoading]);

  // ============================================================
  // 📥 CHARGEMENT DES DONNÉES
  // ============================================================

  const loadDashboardData = async () => {
    try {
      setLoading(true);

      let tid: string | null = null;
      const teamsRes = await databases.listDocuments(DATABASE_ID, 'teams', [Query.equal('ownerId', user.$id)]);
      if (teamsRes.documents.length > 0) {
        tid = teamsRes.documents[0].$id;
        setTeamId(tid);
      } else {
        const membersRes = await databases.listDocuments(DATABASE_ID, 'team_members', [Query.equal('userId', user.$id)]);
        if (membersRes.documents.length > 0) {
          tid = membersRes.documents[0].teamId;
          setTeamId(tid);
        }
      }

      if (!tid) { setLoading(false); return; }

      // ✅ Chargement de l'objectif depuis company_settings (lecture seule)
      let goal = 5000;
      try {
        const settingsRes = await databases.listDocuments(DATABASE_ID, 'company_settings', [
          Query.equal('teamId', tid),
          Query.limit(1)
        ]);

        if (settingsRes.documents.length > 0) {
          const settings = settingsRes.documents[0] as any;
          if (settings.monthlyGoal && typeof settings.monthlyGoal === 'number' && settings.monthlyGoal > 0) {
            goal = settings.monthlyGoal;
          }
        }
      } catch (e) {
        console.warn('Impossible de charger l\'objectif mensuel:', e);
      }

      const [prospectsRes, quotesRes, invoicesRes] = await Promise.all([
        databases.listDocuments(DATABASE_ID, 'prospects', [Query.equal('teamId', tid), Query.limit(5000)]),
        databases.listDocuments(DATABASE_ID, 'quotes', [Query.equal('teamId', tid), Query.limit(5000)]),
        databases.listDocuments(DATABASE_ID, 'invoices', [Query.equal('teamId', tid), Query.limit(5000)])
      ]);

      const quotes = quotesRes.documents;
      const invoices = invoicesRes.documents as unknown as Invoice[];

      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();
      const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
      const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;

      const vatActive = isSubjectToVAT || invoices.some(inv =>
        inv.companyTva && inv.companyTva.trim() !== '' && !inv.companyTva.toLowerCase().includes('non applicable')
      );
      const amountOf = (inv: Invoice): number => vatActive ? (inv.subtotal || 0) : (inv.total || 0);

      // Exclusion anti-double-comptage
      const advancesWithFinal = new Set(
        invoices
          .filter(i => (i.type === 'standard' || i.type === 'balance') && i.originalInvoiceId)
          .filter(i => invoices.some(a => a.$id === i.originalInvoiceId && a.type === 'advance'))
          .map(i => i.originalInvoiceId!)
      );
      const originalsWithAdvance = new Set(
        invoices.filter(i => i.type === 'advance' && i.originalInvoiceId).map(i => i.originalInvoiceId!)
      );

      const isRevenueInvoice = (i: Invoice) => {
        if (i.type === 'credit' || i.status === 'cancelled') return false;
        if (i.type === 'advance' && advancesWithFinal.has(i.$id)) return false;
        if ((i.type === 'standard' || i.type === 'balance') && originalsWithAdvance.has(i.$id)) return false;
        return true;
      };

      const getPaidAmount = (invoice: Invoice): number => {
        let payments: any[] = [];
        try {
          if (typeof invoice.payments === 'string' && invoice.payments.trim()) payments = JSON.parse(invoice.payments);
          else if (Array.isArray(invoice.payments)) payments = invoice.payments;
        } catch (e) { payments = []; }
        return payments.reduce((sum: number, p: any) => sum + (p.amount || 0), 0);
      };

      const getEffectivePaidAmount = (invoice: Invoice): number => {
        const directPayments = getPaidAmount(invoice);
        let totalPaid = directPayments;
        if ((invoice.type === 'standard' || invoice.type === 'balance') && invoice.originalInvoiceId) {
          const advanceInvoice = invoices.find(i => i.$id === invoice.originalInvoiceId && i.type === 'advance');
          if (advanceInvoice && advanceInvoice.status === 'paid') {
            totalPaid += (advanceInvoice.total || 0);
          }
        }
        return Math.min(totalPaid, invoice.total || 0);
      };

      const getNetRemaining = (invoice: Invoice): number => {
        if (invoice.type === 'credit') return 0;
        const paidAmount = getEffectivePaidAmount(invoice);
        const allocated = invoices
          .filter(inv => inv.type === 'credit' && inv.originalInvoiceId === invoice.$id && inv.status !== 'cancelled')
          .reduce((sum, inv) => sum + (inv.total || 0), 0);
        return Math.max(0, (invoice.total || 0) - paidAmount - allocated);
      };

      const getMonthlyCashflow = (month: number, year: number) => {
        let encaisseTTC = 0, decaisseTTC = 0, encaisseHT = 0, decaisseHT = 0;
        invoices.forEach(inv => {
          if (inv.status === 'cancelled') return;
          const ratio = inv.total > 0 ? amountOf(inv) / inv.total : 0;
          if (inv.type === 'credit') {
            if (inv.paidAt) {
              const d = new Date(inv.paidAt);
              if (d.getMonth() === month && d.getFullYear() === year) {
                decaisseTTC += (inv.total || 0);
                decaisseHT += (inv.total || 0) * ratio;
              }
            }
            return;
          }
          if (!isRevenueInvoice(inv)) return;
          let payments: any[] = [];
          try {
            if (typeof inv.payments === 'string' && inv.payments.trim()) payments = JSON.parse(inv.payments);
            else if (Array.isArray(inv.payments)) payments = inv.payments;
          } catch (e) { }
          payments.forEach((p: any) => {
            if (!p.date) return;
            const d = new Date(p.date);
            if (d.getMonth() === month && d.getFullYear() === year) {
              encaisseTTC += (p.amount || 0);
              encaisseHT += (p.amount || 0) * ratio;
            }
          });
          if ((inv.type === 'standard' || inv.type === 'balance') && inv.originalInvoiceId) {
            const advanceInv = invoices.find(i => i.$id === inv.originalInvoiceId && i.type === 'advance');
            if (advanceInv && advanceInv.status === 'paid' && advanceInv.paidAt) {
              const d = new Date(advanceInv.paidAt);
              if (d.getMonth() === month && d.getFullYear() === year) {
                encaisseTTC += (advanceInv.total || 0);
                encaisseHT += (advanceInv.total || 0) * ratio;
              }
            }
          }
        });
        return { encaisse: encaisseTTC, decaisse: decaisseTTC, encaisseHT, decaisseHT };
      };

      const currentMonthFlow = getMonthlyCashflow(currentMonth, currentYear);
      const caThisMonth = Math.max(0, currentMonthFlow.encaisse - currentMonthFlow.decaisse);
      const caThisMonthHT = Math.max(0, currentMonthFlow.encaisseHT - currentMonthFlow.decaisseHT);
      setCaCurrentMonth(caThisMonth);
      setCaCurrentMonthHT(caThisMonthHT);

      const lastMonthFlow = getMonthlyCashflow(lastMonth, lastMonthYear);
      const caLastMonthHT = Math.max(0, lastMonthFlow.encaisseHT - lastMonthFlow.decaisseHT);
      const trend = caLastMonthHT !== 0 ? ((caThisMonthHT - caLastMonthHT) / Math.abs(caLastMonthHT)) * 100 : (caThisMonthHT > 0 ? 100 : 0);
      setCaTrend(trend);

      if (goal === 5000 && caLastMonthHT > 0) goal = caLastMonthHT * 1.2;
      setMonthlyGoal(goal);
      setGoalProgress(Math.min((caThisMonthHT / goal) * 100, 100));

      // KPIs
      const pendingQuotes = quotes.filter(q => q.status === 'Envoyé');
      setPendingQuotesCount(pendingQuotes.length);
      setPendingQuotesAmount(pendingQuotes.reduce((sum, q) => sum + (Number(q.total) || 0), 0));

      const unpaidInvoices = invoices.filter(inv =>
        inv.type !== 'credit' && inv.status !== 'paid' && inv.status !== 'cancelled' && isRevenueInvoice(inv) && getNetRemaining(inv) > 0
      );
      setUnpaidInvoicesCount(unpaidInvoices.length);
      setUnpaidAmount(unpaidInvoices.reduce((sum, inv) => sum + getNetRemaining(inv), 0));

      const sentQuotes = quotes.filter(q => ['Envoyé', 'Accepté', 'Refusé', 'Facturé'].includes(q.status));
      const acceptedQuotes = quotes.filter(q => ['Accepté', 'Facturé'].includes(q.status));
      setSentQuotesCount(sentQuotes.length);
      setAcceptedQuotesCount(acceptedQuotes.length);
      setConversionRate(sentQuotes.length > 0 ? (acceptedQuotes.length / sentQuotes.length) * 100 : 0);

      const revenueInvoicesThisMonth = invoices.filter(i =>
        (i.type === 'standard' || i.type === 'advance' || i.type === 'balance') &&
        isRevenueInvoice(i) && i.paidAt &&
        new Date(i.paidAt).getMonth() === currentMonth &&
        new Date(i.paidAt).getFullYear() === currentYear
      );
      setStandardInvoicesCount(revenueInvoicesThisMonth.length);

      // Graphique évolution CA
      const monthsData = [];
      for (let i = 5; i >= 0; i--) {
        const date = new Date(currentYear, currentMonth - i, 1);
        const flow = getMonthlyCashflow(date.getMonth(), date.getFullYear());
        monthsData.push({
          name: date.toLocaleDateString('fr-FR', { month: 'short' }),
          ca: Math.max(0, flow.encaisse - flow.decaisse)
        });
      }
      setChartData(monthsData);

      // Pie chart top clients
      const clientCA = {} as Record<string, number>;
      invoices.forEach(inv => {
        if (inv.status === 'cancelled' || inv.type === 'credit') return;
        if (!isRevenueInvoice(inv)) return;
        const client = inv.clientName || 'Client inconnu';
        const paidTTC = getEffectivePaidAmount(inv);
        const refundedTTC = invoices
          .filter(cr => cr.type === 'credit' && cr.originalInvoiceId === inv.$id && cr.status !== 'cancelled' && cr.paidAt)
          .reduce((sum, cr) => sum + (cr.total || 0), 0);
        clientCA[client] = (clientCA[client] || 0) + Math.max(0, paidTTC - refundedTTC);
      });
      const topClients = Object.entries(clientCA)
        .filter(([, value]) => value > 0)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([name, value]) => ({ name, value }));
      setPieData(topClients.length > 0 ? topClients : [{ name: 'Aucune donnée', value: 1 }]);

      // Alertes
      const alertsData: DashboardAlert[] = [];
      const overdue = invoices.filter(inv =>
        inv.type !== 'credit' && inv.status !== 'paid' && inv.status !== 'cancelled' &&
        inv.dueDate && new Date(inv.dueDate) < now && isRevenueInvoice(inv) && getNetRemaining(inv) > 0
      );
      if (overdue.length > 0) {
        const overdueAmountTotal = overdue.reduce((s, i) => s + getNetRemaining(i), 0);
        alertsData.push({ type: 'danger', title: `${overdue.length} facture(s) en retard`, description: `Total : ${fm(overdueAmountTotal)}`, action: 'Voir', count: overdue.length });
      }
      const oldQuotes = pendingQuotes.filter(q => q.issueDate && (now.getTime() - new Date(q.issueDate).getTime()) / 86400000 > 7);
      if (oldQuotes.length > 0) {
        alertsData.push({ type: 'warning', title: `${oldQuotes.length} devis à relancer`, description: 'Plus de 7 jours sans réponse', action: 'Voir', count: oldQuotes.length });
      }
      setAlerts(alertsData);

      // Activité récente
      const activities: RecentActivity[] = [];
      invoices
        .filter(inv => inv.type !== 'credit' && isRevenueInvoice(inv))
        .sort((a, b) => new Date(b.$createdAt || 0).getTime() - new Date(a.$createdAt || 0).getTime())
        .slice(0, 3)
        .forEach(inv => activities.push({
          type: 'invoice', title: `Facture ${inv.invoiceNumber}`,
          subtitle: inv.clientName || 'Client', amount: fm(inv.total || 0),
          date: inv.$createdAt || inv.issueDate || ''
        }));
      quotes
        .sort((a, b) => new Date(b.$createdAt || 0).getTime() - new Date(a.$createdAt || 0).getTime())
        .slice(0, 3)
        .forEach(q => activities.push({
          type: 'quote', title: `Devis ${q.quoteNumber}`,
          subtitle: q.clientName || 'Client', amount: fm(Number(q.total) || 0),
          date: q.$createdAt || q.issueDate || ''
        }));
      activities.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setRecentActivity(activities.slice(0, 5));

    } catch (error) {
      console.error('Erreur chargement dashboard:', error);
      toast.error('Erreur lors du chargement du tableau de bord');
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // ⚙️ HELPERS
  // ============================================================

  const formatDate = (dateString: string) => {
    if (!dateString) return '';
    const diffDays = Math.floor((new Date().getTime() - new Date(dateString).getTime()) / 86400000);
    if (diffDays === 0) return "Aujourd'hui";
    if (diffDays === 1) return 'Hier';
    if (diffDays < 7) return `Il y a ${diffDays} j.`;
    return new Date(dateString).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  };

  // ============================================================
  // 🎨 RENDU
  // ============================================================

  if (permLoading || loading || settingsLoading) {
    return (
      <Sidebar>
        <div className="flex items-center justify-center h-full w-full">
          <div className="text-slate-500 dark:text-slate-400 text-lg animate-pulse">Chargement...</div>
        </div>
      </Sidebar>
    );
  }

  if (!user) return null;

  return (
    <Sidebar>
      <div className="min-h-full bg-slate-50 dark:bg-slate-900">
        <PageHeader
          icon={Activity}
          iconColor="purple"
          title="Tableau de bord"
          description={
            <>
              {companyName && <span className="font-semibold">{companyName}</span>}
              {companyName && ' • '}
              Vue d'ensemble de votre activité
            </>
          }
          currency={currency || 'EUR'}
          currencySymbol={currencyConfig?.symbol || '€'}
          action={
            <div className="flex flex-wrap gap-2">
              {hasPermission('prospects.create') && (
                <button
                  onClick={() => navigate('/prospects')}
                  className="flex items-center gap-2 px-4 py-2.5 bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium rounded-lg transition-all active:scale-95 shadow-sm"
                >
                  <UserPlus size={16} />
                  <span className="hidden sm:inline">Nouveau prospect</span>
                </button>
              )}
              {hasPermission('quotes.create') && (
                <button
                  onClick={() => navigate('/quotes')}
                  className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-all active:scale-95 shadow-sm"
                >
                  <FilePlus size={16} />
                  <span className="hidden sm:inline">Nouveau devis</span>
                </button>
              )}
            </div>
          }
        />

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
          {/* KPIs GRID */}
          <KPIGrid columns={4}>
            <StatCell
              value={fm(caCurrentMonthHT)}
              label="CA Net (HT) du mois"
              sublabel={`TTC : ${fm(caCurrentMonth)} • ${standardInvoicesCount} facture(s)`}
              trend={caTrend}
              active={false}
            />
            <StatCell
              value={pendingQuotesCount.toString()}
              label="Devis en attente"
              sublabel={fm(pendingQuotesAmount)}
              trend={undefined}
            />
            <StatCell
              value={unpaidInvoicesCount.toString()}
              label="Factures impayées"
              sublabel={fm(unpaidAmount)}
              trend={undefined}
            />
            <StatCell
              value={`${conversionRate.toFixed(1)}%`}
              label="Taux de conversion"
              sublabel={`${acceptedQuotesCount}/${sentQuotesCount} acceptés`}
              trend={undefined}
            />
          </KPIGrid>

          {/* BANNIÈRE OBJECTIF (lecture seule) */}
          <Card className="bg-gradient-to-r from-purple-600 to-indigo-600 border-0 shadow-lg shadow-purple-500/20">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingUp size={20} className="text-white" />
                  <h3 className="text-lg font-bold text-white">Objectif du mois (HT)</h3>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-purple-100 text-sm">
                    <span className="font-bold text-white">{fm(caCurrentMonthHT)}</span> réalisés sur
                  </p>
                  <span className="text-white font-bold text-lg">
                    {fm(monthlyGoal)}
                  </span>
                </div>
                <p className="text-purple-200 text-xs mt-1.5">
                  Modifiable dans Paramètres → Mon Entreprise → Objectifs commerciaux
                </p>
              </div>
              <div className="text-right">
                <span className="text-4xl font-bold text-white tabular-nums">{goalProgress.toFixed(0)}%</span>
                <p className="text-xs text-purple-200 mt-1">de l'objectif atteint</p>
              </div>
            </div>
            <div className="w-full bg-white/20 rounded-full h-3 overflow-hidden">
              <div
                className="bg-white h-3 rounded-full transition-all duration-1000 ease-out shadow-sm"
                style={{ width: `${goalProgress}%` }}
              />
            </div>
          </Card>

          {/* GRAPHIQUES */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Évolution CA */}
            <Card className="lg:col-span-2">
              <SectionTitle icon={TrendingUp}>
                Évolution du CA
                <Badge tone="slate">6 derniers mois</Badge>
              </SectionTitle>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                Trésorerie TTC ({currency})
              </p>
              {chartData.length === 0 ? (
                <EmptyState
                  icon={TrendingUp}
                  title="Aucune donnée"
                  description="Pas encore de factures encaissées."
                  tone="slate"
                />
              ) : (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="colorCa" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" className="dark:opacity-20" />
                      <XAxis dataKey="name" stroke="#64748b" style={{ fontSize: '12px' }} />
                      <YAxis stroke="#64748b" style={{ fontSize: '12px' }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#1e293b',
                          border: '1px solid #334155',
                          borderRadius: '12px',
                          color: '#f1f5f9',
                          boxShadow: '0 10px 25px rgba(0,0,0,0.2)'
                        }}
                        formatter={(value: number) => [fm(value), `CA ${currency}`]}
                      />
                      <Area
                        type="monotone"
                        dataKey="ca"
                        stroke="#8b5cf6"
                        strokeWidth={2.5}
                        fill="url(#colorCa)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>

            {/* Top Clients */}
            <Card>
              <SectionTitle icon={Users}>
                Top Clients
                <Badge tone="purple">Top 5</Badge>
              </SectionTitle>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                Répartition encaissé TTC
              </p>
              {pieData.length === 0 || (pieData.length === 1 && pieData[0].name === 'Aucune donnée') ? (
                <EmptyState
                  icon={Users}
                  title="Aucun client"
                  description="Pas encore de factures payées."
                  tone="indigo"
                />
              ) : (
                <div className="h-64 w-full flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value: number) => fm(value)}
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px rgba(0,0,0,0.15)' }}
                      />
                      <Legend
                        verticalAlign="bottom"
                        height={36}
                        iconType="circle"
                        formatter={(val) => <span className="text-xs text-slate-600 dark:text-slate-300 truncate max-w-[100px]">{val}</span>}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>
          </div>

          {/* ALERTES & ACTIVITÉ */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Alertes */}
            <Card>
              <SectionTitle icon={Bell} action={
                alerts.length > 0 && (
                  <Badge tone={alerts.some(a => a.type === 'danger') ? 'red' : 'amber'}>
                    {alerts.length} alerte{alerts.length > 1 ? 's' : ''}
                  </Badge>
                )
              }>
                Alertes & Notifications
              </SectionTitle>

              {alerts.length === 0 ? (
                <div className="text-center py-8">
                  <CheckCircle2 size={48} className="mx-auto text-emerald-500 mb-3" />
                  <p className="text-slate-600 dark:text-slate-400 font-medium">Tout est à jour !</p>
                  <p className="text-sm text-slate-500 dark:text-slate-500 mt-1">Aucune action requise.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {alerts.map((alert, idx) => (
                    <Alert
                      key={idx}
                      tone={alert.type === 'danger' ? 'error' : 'warning'}
                      icon={alert.type === 'danger' ? AlertCircle : Clock}
                      title={alert.title}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span>{alert.description}</span>
                        {alert.action && (
                          <button
                            onClick={() => navigate(alert.type === 'danger' ? '/invoices' : '/quotes')}
                            className="text-xs font-semibold underline hover:no-underline whitespace-nowrap flex items-center gap-1"
                          >
                            {alert.action} <ArrowUpRight size={12} />
                          </button>
                        )}
                      </div>
                    </Alert>
                  ))}
                </div>
              )}
            </Card>

            {/* Activité récente */}
            <Card>
              <SectionTitle icon={Activity} action={
                <Badge tone="blue">{recentActivity.length} événement{recentActivity.length > 1 ? 's' : ''}</Badge>
              }>
                Activité récente
              </SectionTitle>

              {recentActivity.length === 0 ? (
                <EmptyState
                  icon={Calendar}
                  title="Aucune activité"
                  description="Les dernières actions apparaîtront ici."
                  tone="indigo"
                />
              ) : (
                <div className="space-y-3">
                  {recentActivity.map((activity, idx) => (
                    <div
                      key={idx}
                      className="flex items-start gap-3 p-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 rounded-lg transition-colors cursor-pointer"
                      onClick={() => navigate(activity.type === 'invoice' ? '/invoices' : '/quotes')}
                    >
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                        activity.type === 'invoice'
                          ? 'bg-purple-50 dark:bg-purple-500/10 ring-1 ring-purple-100 dark:ring-purple-500/20'
                          : 'bg-emerald-50 dark:bg-emerald-500/10 ring-1 ring-emerald-100 dark:ring-emerald-500/20'
                      }`}>
                        {activity.type === 'invoice'
                          ? <Receipt size={18} className="text-purple-600 dark:text-purple-400" />
                          : <FileText size={18} className="text-emerald-600 dark:text-emerald-400" />
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{activity.title}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{activity.subtitle}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-slate-400 dark:text-slate-500 flex items-center gap-1">
                            <Calendar size={10} />
                            {formatDate(activity.date)}
                          </span>
                          {activity.amount && (
                            <span className="text-xs font-bold text-slate-700 dark:text-slate-300 tabular-nums">
                              • {activity.amount}
                            </span>
                          )}
                        </div>
                      </div>
                      <ArrowUpRight size={16} className="text-slate-400 flex-shrink-0 mt-1" />
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </main>
      </div>
    </Sidebar>
  );
}