import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { databases, DATABASE_ID } from '../appwrite';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { Query } from 'appwrite';
import {
  Euro, Clock, AlertCircle, CheckCircle2, ArrowUpRight, ArrowDownRight,
  Calendar, Target, Activity, Bell, Receipt, FileText, Wallet, Users, UserCheck,
  Plus, FilePlus, UserPlus, TrendingUp
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import Sidebar from '../components/Sidebar';

interface Invoice {
  $id: string;
  invoiceNumber: string;
  clientName: string;
  teamId: string;
  total: number;
  subtotal: number;
  type?: string;
  status?: string;
  payments?: any;
  $createdAt?: string;
  paidAt?: string;
  issueDate?: string;
  dueDate?: string;
  companyTva?: string;
}

interface KPI {
  label: string;
  value: string;
  subValue?: string;
  trend?: number;
  trendLabel?: string;
  icon: any;
  color: string;
  bgColor: string;
  trendColor: string;
}

interface Alert {
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

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444'];

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { hasPermission, loading: permLoading } = usePermissions();

  const [kpis, setKpis] = useState<KPI[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [chartData, setChartData] = useState<any[]>([]);
  const [pieData, setPieData] = useState<any[]>([]);
  const [goalProgress, setGoalProgress] = useState(0);
  const [monthlyGoal, setMonthlyGoal] = useState(0);
  const [caCurrentMonth, setCaCurrentMonth] = useState(0);
  const [isSubjectToVAT, setIsSubjectToVAT] = useState(false); // ✅ NOUVEAU STATE
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || permLoading) return;
    loadDashboardData();
  }, [user, permLoading]);

  const getPaidAmount = (invoice: Invoice): number => {
    let payments: any[] = [];
    try {
      if (typeof invoice.payments === 'string' && invoice.payments.trim()) {
        payments = JSON.parse(invoice.payments);
      } else if (Array.isArray(invoice.payments)) {
        payments = invoice.payments;
      }
    } catch (e) {
      payments = [];
    }
    return payments.reduce((sum: number, p: any) => sum + (p.amount || 0), 0);
  };

  const loadDashboardData = async () => {
    try {
      setLoading(true);

      let teamId = null;
      const teamsRes = await databases.listDocuments(DATABASE_ID, 'teams', [Query.equal('ownerId', user.$id)]);
      if (teamsRes.documents.length > 0) {
        teamId = teamsRes.documents[0].$id;
      } else {
        const membersRes = await databases.listDocuments(DATABASE_ID, 'team_members', [Query.equal('userId', user.$id)]);
        if (membersRes.documents.length > 0) teamId = membersRes.documents[0].teamId;
      }

      if (!teamId) { setLoading(false); return; }

      const [prospectsRes, quotesRes, invoicesRes] = await Promise.all([
        databases.listDocuments(DATABASE_ID, 'prospects', [Query.equal('teamId', teamId), Query.limit(5000)]),
        databases.listDocuments(DATABASE_ID, 'quotes', [Query.equal('teamId', teamId), Query.limit(5000)]),
        databases.listDocuments(DATABASE_ID, 'invoices', [Query.equal('teamId', teamId), Query.limit(5000)])
      ]);

      const prospects = prospectsRes.documents;
      const quotes = quotesRes.documents;
      const invoices = invoicesRes.documents as unknown as Invoice[];

      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();
      const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
      const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;

      // ========================================================================
      // ✅ DÉTECTION RÉGIME TVA (mise en state pour être accessible au JSX)
      // ========================================================================
      const vatDetected = invoices.some(inv => 
        inv.companyTva && 
        inv.companyTva.trim() !== '' && 
        !inv.companyTva.toLowerCase().includes('non applicable')
      );
      setIsSubjectToVAT(vatDetected); // ✅ Mise à jour du state

      const vatBaseLabel = vatDetected ? 'HT' : 'TTC';
      const amountOf = (inv: Invoice): number => vatDetected ? (inv.subtotal || 0) : (inv.total || 0);

      // ========================================================================
      // ✅ RÈGLE COMPTABLE : CA Net = Encaissé - Décaissé (avec paidFraction)
      // ========================================================================

      const currentMonthInvoices = invoices.filter(inv => {
        if (!inv.paidAt) return false;
        const paidDate = new Date(inv.paidAt);
        return paidDate.getMonth() === currentMonth && paidDate.getFullYear() === currentYear;
      });

      const revenueInvoicesThisMonth = currentMonthInvoices.filter(i => 
        (i.type === 'standard' || i.type === 'advance' || i.type === 'balance') && i.status !== 'cancelled'
      );
      const creditInvoicesThisMonth = currentMonthInvoices.filter(i => 
        i.type === 'credit' && i.status !== 'cancelled'
      );

      const paidFraction = (i: Invoice): number =>
        i.total > 0 ? Math.min(1, getPaidAmount(i) / i.total) : 0;

      const caEncaisseThisMonth = revenueInvoicesThisMonth.reduce((sum, i) => sum + amountOf(i) * paidFraction(i), 0);
      const totalDecaisseThisMonth = creditInvoicesThisMonth.reduce((sum, i) => sum + amountOf(i), 0);
      
      const caThisMonth = Math.max(0, caEncaisseThisMonth - totalDecaisseThisMonth);
      setCaCurrentMonth(caThisMonth);

      const lastMonthInvoices = invoices.filter(inv => {
        if (!inv.paidAt) return false;
        const paidDate = new Date(inv.paidAt);
        return paidDate.getMonth() === lastMonth && paidDate.getFullYear() === lastMonthYear;
      });

      const revenueInvoicesLastMonth = lastMonthInvoices.filter(i => 
        (i.type === 'standard' || i.type === 'advance' || i.type === 'balance') && i.status !== 'cancelled'
      );
      const creditInvoicesLastMonth = lastMonthInvoices.filter(i => 
        i.type === 'credit' && i.status !== 'cancelled'
      );

      const caEncaisseLastMonth = revenueInvoicesLastMonth.reduce((sum, i) => sum + amountOf(i) * paidFraction(i), 0);
      const totalDecaisseLastMonth = creditInvoicesLastMonth.reduce((sum, i) => sum + amountOf(i), 0);
      
      const caLastMonth = Math.max(0, caEncaisseLastMonth - totalDecaisseLastMonth);
      
      const caTrend = caLastMonth !== 0 ? ((caThisMonth - caLastMonth) / Math.abs(caLastMonth)) * 100 : 0;

      const goal = caLastMonth > 0 ? caLastMonth * 1.2 : 5000;
      setMonthlyGoal(goal);
      setGoalProgress(Math.min((caThisMonth / goal) * 100, 100));

      const pendingQuotes = quotes.filter(q => q.status === 'Envoyé');
      const pendingQuotesAmount = pendingQuotes.reduce((sum, q) => sum + (parseFloat(q.total) || 0), 0);
      
      const unpaidInvoices = invoices.filter(inv => 
        inv.type !== 'credit' && inv.status !== 'paid' && inv.status !== 'cancelled'
      );
      const unpaidAmount = unpaidInvoices.reduce((sum, inv) => sum + (parseFloat(inv.total) || 0), 0);
      
      const sentQuotes = quotes.filter(q => ['Envoyé', 'Accepté', 'Refusé', 'Facturé'].includes(q.status));
      const acceptedQuotes = quotes.filter(q => ['Accepté', 'Facturé'].includes(q.status));
      const conversionRate = sentQuotes.length > 0 ? (acceptedQuotes.length / sentQuotes.length) * 100 : 0;

      const standardInvoicesCount = revenueInvoicesThisMonth.length;

      setKpis([
        { 
          label: `CA Net ${vatBaseLabel} du mois`, 
          value: formatCurrency(caThisMonth), 
          subValue: `${standardInvoicesCount} facture(s) nette(s)`, 
          trend: caTrend, 
          trendLabel: 'vs mois dernier', 
          icon: Euro, 
          color: 'text-emerald-600 dark:text-emerald-400', 
          bgColor: 'bg-emerald-50 dark:bg-emerald-900/30', 
          trendColor: caTrend >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400' 
        },
        { label: 'Devis en attente', value: pendingQuotes.length.toString(), subValue: formatCurrency(pendingQuotesAmount), icon: Clock, color: 'text-amber-600 dark:text-amber-400', bgColor: 'bg-amber-50 dark:bg-amber-900/30' },
        { label: 'Factures impayées', value: unpaidInvoices.length.toString(), subValue: formatCurrency(unpaidAmount), icon: AlertCircle, color: 'text-red-600 dark:text-red-400', bgColor: 'bg-red-50 dark:bg-red-900/30' },
        { label: 'Taux de conversion', value: `${conversionRate.toFixed(1)}%`, subValue: `${acceptedQuotes.length}/${sentQuotes.length} acceptés`, icon: Target, color: 'text-blue-600 dark:text-blue-400', bgColor: 'bg-blue-50 dark:bg-blue-900/30' }
      ]);

      const monthsData = [];
      for (let i = 5; i >= 0; i--) {
        const date = new Date(currentYear, currentMonth - i, 1);
        const monthInvoices = invoices.filter(inv => {
          if (!inv.paidAt) return false;
          const paidDate = new Date(inv.paidAt);
          return paidDate.getMonth() === date.getMonth() && paidDate.getFullYear() === date.getFullYear();
        });

        const revInv = monthInvoices.filter(inv => 
          (inv.type === 'standard' || inv.type === 'advance' || inv.type === 'balance') && inv.status !== 'cancelled'
        );
        const credInv = monthInvoices.filter(inv => 
          inv.type === 'credit' && inv.status !== 'cancelled'
        );

        const mEncaisse = revInv.reduce((sum, inv) => sum + amountOf(inv) * paidFraction(inv), 0);
        const mDecaisse = credInv.reduce((sum, inv) => sum + amountOf(inv), 0);

        monthsData.push({ 
          name: date.toLocaleDateString('fr-FR', { month: 'short' }), 
          ca: Math.max(0, mEncaisse - mDecaisse)
        });
      }
      setChartData(monthsData);

      const paidInvoices = invoices.filter(inv => inv.status === 'paid' && inv.paidAt);
      
      const revenuePaid = paidInvoices.filter(i => 
        (i.type === 'standard' || i.type === 'advance' || i.type === 'balance') && i.status !== 'cancelled'
      );
      const creditPaid = paidInvoices.filter(i => 
        i.type === 'credit' && i.status !== 'cancelled'
      );

      const clientCA = {} as Record<string, number>;

      revenuePaid.forEach(inv => {
        const client = inv.clientName || 'Client inconnu';
        clientCA[client] = (clientCA[client] || 0) + (amountOf(inv) * paidFraction(inv));
      });

      creditPaid.forEach(inv => {
        const client = inv.clientName || 'Client inconnu';
        clientCA[client] = (clientCA[client] || 0) - amountOf(inv);
      });

      const topClients = Object.entries(clientCA)
        .filter(([, value]) => value > 0)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([name, value]) => ({ name, value }));
      
      setPieData(topClients.length > 0 ? topClients : [{ name: 'Aucune donnée', value: 1 }]);

      const alertsData: Alert[] = [];
      const overdue = invoices.filter(inv => 
        inv.type !== 'credit' && 
        (inv.status === 'overdue' || (inv.dueDate && new Date(inv.dueDate) < now && inv.status !== 'paid' && inv.status !== 'cancelled'))
      );
      
      if (overdue.length > 0) {
        const overdueAmountTotal = overdue.reduce((s, i) => s + (parseFloat(i.total) || 0), 0);
        alertsData.push({ type: 'danger', title: `${overdue.length} facture(s) en retard`, description: `Total: ${formatCurrency(overdueAmountTotal)}`, action: 'Voir', count: overdue.length });
      }
      
      const oldQuotes = pendingQuotes.filter(q => q.issueDate && (now.getTime() - new Date(q.issueDate).getTime()) / 86400000 > 7);
      if (oldQuotes.length > 0) {
        alertsData.push({ type: 'warning', title: `${oldQuotes.length} devis à relancer`, description: 'Plus de 7 jours sans réponse', action: 'Voir', count: oldQuotes.length });
      }

      setAlerts(alertsData);

      const activities: RecentActivity[] = [];
      invoices
        .filter(inv => inv.type !== 'credit')
        .sort((a, b) => new Date(b.$createdAt || 0).getTime() - new Date(a.$createdAt || 0).getTime())
        .slice(0, 3)
        .forEach(inv => activities.push({ 
          type: 'invoice', 
          title: `Facture ${inv.invoiceNumber}`, 
          subtitle: inv.clientName || 'Client', 
          amount: formatCurrency(parseFloat(inv.total) || 0), 
          date: inv.$createdAt || inv.issueDate || '' 
        }));
      
      quotes
        .sort((a, b) => new Date(b.$createdAt || 0).getTime() - new Date(a.$createdAt || 0).getTime())
        .slice(0, 3)
        .forEach(q => activities.push({ 
          type: 'quote', 
          title: `Devis ${q.quoteNumber}`, 
          subtitle: q.clientName || 'Client', 
          amount: formatCurrency(parseFloat(q.total) || 0), 
          date: q.$createdAt || q.issueDate || '' 
        }));
      
      activities.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setRecentActivity(activities.slice(0, 5));

    } catch (error) {
      console.error('Erreur chargement dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(amount);
  
  const formatDate = (dateString: string) => {
    if (!dateString) return '';
    const diffDays = Math.floor((new Date().getTime() - new Date(dateString).getTime()) / 86400000);
    if (diffDays === 0) return "Aujourd'hui";
    if (diffDays === 1) return 'Hier';
    if (diffDays < 7) return `Il y a ${diffDays} j.`;
    return new Date(dateString).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  };

  if (permLoading || loading) return <Sidebar><div className="flex items-center justify-center h-full w-full"><div className="text-slate-500 dark:text-slate-400 text-lg animate-pulse">Chargement...</div></div></Sidebar>;
  if (!user) return null;

  return (
    <Sidebar>
      <div className="w-full p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
        
        {/* En-tête */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">Tableau de bord</h1>
            <p className="text-slate-500 dark:text-slate-400 mt-1">Vue d'ensemble de votre activité (CA Net {isSubjectToVAT ? 'HT' : 'TTC'})</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {hasPermission('prospects.create') && (
              <button onClick={() => navigate('/prospects')} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm">
                <UserPlus size={16} /> Nouveau prospect
              </button>
            )}
            {hasPermission('quotes.create') && (
              <button onClick={() => navigate('/quotes')} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm">
                <FilePlus size={16} /> Nouveau devis
              </button>
            )}
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
          {kpis.map((kpi, idx) => (
            <div key={idx} className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className={`w-10 h-10 sm:w-12 sm:h-12 ${kpi.bgColor} rounded-lg flex items-center justify-center`}>
                  <kpi.icon size={20} className={`sm:w-6 sm:h-6 ${kpi.color}`} />
                </div>
                {kpi.trend !== undefined && kpi.trend !== 0 && (
                  <div className={`flex items-center gap-1 text-xs font-semibold ${kpi.trendColor}`}>
                    {kpi.trend >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                    {Math.abs(kpi.trend).toFixed(1)}%
                  </div>
                )}
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">{kpi.label}</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-white mb-1">{kpi.value}</p>
              {kpi.subValue && <p className="text-xs text-slate-500 dark:text-slate-400">{kpi.subValue}</p>}
            </div>
          ))}
        </div>

        {/* OBJECTIF MENSUEL */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl shadow-md p-5 sm:p-6 text-white">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-4">
            <div>
              <h3 className="text-lg font-bold flex items-center gap-2">
                <TrendingUp size={20} /> Objectif du mois (CA Net {isSubjectToVAT ? 'HT' : 'TTC'})
              </h3>
              <p className="text-blue-100 text-sm mt-1">
                {formatCurrency(caCurrentMonth)} réalisés sur {formatCurrency(monthlyGoal)}
              </p>
            </div>
            <div className="text-right">
              <span className="text-3xl font-bold">{goalProgress.toFixed(0)}%</span>
              <p className="text-xs text-blue-200">de l'objectif atteint</p>
            </div>
          </div>
          <div className="w-full bg-blue-900/30 rounded-full h-3 overflow-hidden">
            <div 
              className="bg-white h-3 rounded-full transition-all duration-1000 ease-out"
              style={{ width: `${goalProgress}%` }}
            ></div>
          </div>
        </div>

        {/* GRAPHIQUES : Évolution + Répartition */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Évolution CA (2/3) */}
          <div className="lg:col-span-2 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-5 sm:p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">Évolution du CA Net {isSubjectToVAT ? 'HT' : 'TTC'}</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">6 derniers mois (Encaissé - Décaissé)</p>
              </div>
            </div>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorCa" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" stroke="#64748b" style={{ fontSize: '12px' }} />
                  <YAxis stroke="#64748b" style={{ fontSize: '12px' }} />
                  <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#f1f5f9' }} formatter={(value: number) => [formatCurrency(value), `CA Net ${isSubjectToVAT ? 'HT' : 'TTC'}`]} />
                  <Area type="monotone" dataKey="ca" stroke="#3b82f6" strokeWidth={2} fill="url(#colorCa)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Répartition CA par client (1/3) */}
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-5 sm:p-6">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-1">Top Clients</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Répartition du CA Net {isSubjectToVAT ? 'HT' : 'TTC'} encaissé</p>
            <div className="h-64 w-full flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => formatCurrency(value)} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" formatter={(val) => <span className="text-xs text-slate-600 dark:text-slate-300">{val}</span>} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* ALERTES + ACTIVITÉ */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Alertes */}
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-5 sm:p-6">
            <div className="flex items-center gap-2 mb-4">
              <Bell size={20} className="text-orange-500" />
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Alertes & Notifications</h2>
            </div>
            {alerts.length === 0 ? (
              <div className="text-center py-8">
                <CheckCircle2 size={48} className="mx-auto text-green-500 mb-3" />
                <p className="text-slate-600 dark:text-slate-400 font-medium">Tout est à jour !</p>
              </div>
            ) : (
              <div className="space-y-3">
                {alerts.map((alert, idx) => (
                  <div key={idx} className={`p-4 rounded-lg border-l-4 ${alert.type === 'danger' ? 'bg-red-50 dark:bg-red-900/20 border-red-500' : 'bg-amber-50 dark:bg-amber-900/20 border-amber-500'}`}>
                    <div className="flex items-start justify-between">
                      <div>
                        <p className={`font-semibold text-sm ${alert.type === 'danger' ? 'text-red-900 dark:text-red-200' : 'text-amber-900 dark:text-amber-200'}`}>{alert.title}</p>
                        <p className={`text-xs mt-1 ${alert.type === 'danger' ? 'text-red-700 dark:text-red-300' : 'text-amber-700 dark:text-amber-300'}`}>{alert.description}</p>
                      </div>
                      {alert.count && <div className={`px-2 py-1 rounded-full text-xs font-bold ${alert.type === 'danger' ? 'bg-red-500 text-white' : 'bg-amber-500 text-white'}`}>{alert.count}</div>}
                    </div>
                    {alert.action && <button onClick={() => navigate(alert.type === 'danger' ? '/invoices' : '/quotes')} className="mt-2 text-xs font-medium underline hover:no-underline text-slate-700 dark:text-slate-300">{alert.action} →</button>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Activité récente */}
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-5 sm:p-6">
            <div className="flex items-center gap-2 mb-4">
              <Activity size={20} className="text-blue-500" />
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Activité récente</h2>
            </div>
            {recentActivity.length === 0 ? (
              <div className="text-center py-8">
                <Calendar size={48} className="mx-auto text-slate-300 dark:text-slate-600 mb-3" />
                <p className="text-slate-600 dark:text-slate-400 font-medium">Aucune activité récente</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recentActivity.map((activity, idx) => (
                  <div key={idx} className="flex items-start gap-3 p-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 rounded-lg transition-colors">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${activity.type === 'invoice' ? 'bg-purple-100 dark:bg-purple-900/30' : 'bg-green-100 dark:bg-green-900/30'}`}>
                      {activity.type === 'invoice' ? <Receipt size={18} className="text-purple-600 dark:text-purple-400" /> : <FileText size={18} className="text-green-600 dark:text-green-400" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{activity.title}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{activity.subtitle}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-slate-400 dark:text-slate-500">{formatDate(activity.date)}</span>
                        {activity.amount && <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">• {activity.amount}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </Sidebar>
  );
}