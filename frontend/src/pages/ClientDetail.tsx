import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { databases, DATABASE_ID } from '../appwrite';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { useCompanySettings } from '../hooks/useCompanySettings';
import { toast } from 'sonner';
import {
  PageHeader,
  TypeTabs,
  KPIGrid,
  StatCell,
  EmptyState,
  StatusIndicator,
  TypeLabel,
  ConfirmDialog,
  Alert,
  Pagination,
  Card,
  Badge,
  SectionTitle,
  DataTable,
  MobileCard,
  formatDate,
  mapInvoiceStatusToShared,
  statusLabels,
} from '../components/ui/SharedUI';
import {
  ChevronLeft, Mail, Phone, Building, MapPin, FileText,
  Receipt, Edit2, Archive, RotateCcw, Hash, Calendar,
  AlertCircle, Clock, User
} from 'lucide-react';
import { Query } from 'appwrite';

// ============================================================
// 📋 INTERFACES
// ============================================================

interface Client {
  $id: string;
  teamId: string;
  userId: string;
  clientId?: string;
  type: string;
  firstName?: string;
  lastName?: string;
  companyName?: string;
  email?: string;
  phone?: string;
  address?: string;
  billingAddress?: string;
  taxNumber?: string;
  notes?: string;
  status: string;
  prospectId?: string;
  $createdAt?: string;
}

interface Quote {
  $id: string;
  quoteNumber: string;
  clientName: string;
  clientEmail?: string;
  clientId?: string;
  prospectId?: string;
  subject?: string;
  status: string;
  total: number;
  issueDate?: string;
  $createdAt?: string;
}

interface Invoice {
  $id: string;
  invoiceNumber: string;
  clientName?: string;
  clientId?: string;
  status: string;
  total: number;
  subtotal?: number;
  balance?: number;
  issueDate?: string;
  dueDate?: string;
  paidAt?: string;
  $createdAt?: string;
  type?: string;
  originalInvoiceId?: string;
  payments?: any;
  deposit?: number;
  companyTva?: string;
}

// ⚙️ Pagination
const ITEMS_PER_PAGE = 10;

// ============================================================
// 🎯 COMPOSANT PRINCIPAL
// ============================================================

export default function ClientDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { hasPermission, loading: permLoading } = usePermissions();
  const navigate = useNavigate();
  const { fm, currency, currencyConfig, loading: settingsLoading } = useCompanySettings();

  const [client, setClient] = useState<Client | null>(null);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentTeamId, setCurrentTeamId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'info' | 'quotes' | 'invoices' | 'history'>('info');
  const [metadataMap, setMetadataMap] = useState<Map<string, any>>(new Map());
  const [journalPayments, setJournalPayments] = useState<any[]>([]);
  const [clientToArchive, setClientToArchive] = useState<Client | null>(null);

  // ✅ Pagination
  const [quotesPage, setQuotesPage] = useState(1);
  const [invoicesPage, setInvoicesPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);

  useEffect(() => {
    if (!permLoading && !hasPermission('clients.view')) {
      navigate('/dashboard');
    }
  }, [permLoading, hasPermission, navigate]);

  useEffect(() => {
    if (!user || !id) return;
    loadClientData();
  }, [user, id]);

  // ✅ Reset pagination quand l'onglet change
  useEffect(() => {
    setQuotesPage(1);
    setInvoicesPage(1);
    setHistoryPage(1);
  }, [activeTab]);

  // ============================================================
  // ✅ HELPERS COMPTABLES
  // ============================================================

  const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

  const readJson = (raw: unknown): any => {
    if (!raw) return {};
    if (typeof raw === 'object') return raw;
    try { return JSON.parse(raw); } catch { return {}; }
  };

  const getMeta = (inv: Invoice) => metadataMap.get(inv.$id) || { creditData: {}, archiveData: {}, reconciliationData: {} };
  const getCreditData = (inv: Invoice): any => getMeta(inv).creditData || {};
  const getArchiveData = (inv: Invoice): any => getMeta(inv).archiveData || {};

  const isDocArchived = (inv: Invoice): boolean =>
    inv.status === 'cancelled' || getArchiveData(inv).archived === true;

  const getPaymentsSum = (inv: Invoice): number => {
    const journalSum = journalPayments
      .filter(jp => jp.invoiceId === inv.$id && jp.status === 'confirmed')
      .reduce((s, jp) => s + Number(jp.amount || 0), 0);
    if (journalSum > 0) return round2(journalSum);
    let payments: any[] = [];
    try {
      if (typeof inv.payments === 'string' && inv.payments.trim()) payments = JSON.parse(inv.payments);
      else if (Array.isArray(inv.payments)) payments = inv.payments;
    } catch { payments = []; }
    return round2(payments.reduce((s, p) => s + Number(p.amount || 0), 0));
  };

  const getEffectivePaidAmount = (inv: Invoice): number => {
    const directPayments = getPaymentsSum(inv);
    if ((inv.type === 'standard' || inv.type === 'balance') && inv.originalInvoiceId) {
      const advanceInvoice = invoices.find(i => i.$id === inv.originalInvoiceId && i.type === 'advance');
      if (advanceInvoice && advanceInvoice.status === 'paid') {
        return round2(directPayments + (advanceInvoice.total || 0));
      }
    }
    return directPayments;
  };

  const getCreditAllocatedAmount = (inv: Invoice): number => {
    if (inv.type !== 'credit') return 0;
    const credit = getCreditData(inv);
    if (credit.creditStatus === undefined) {
      const original = invoices.find(i => i.$id === inv.originalInvoiceId);
      const originalPaid = !!original && original.status === 'paid';
      return originalPaid ? 0 : (inv.total || 0);
    }
    return round2(credit.allocatedAmount || 0);
  };

  const getAllocatedCredits = (invoiceId: string): number => round2(
    invoices
      .filter(i => i.type === 'credit' && i.originalInvoiceId === invoiceId && !isDocArchived(i))
      .reduce((s, i) => s + getCreditAllocatedAmount(i), 0)
  );

  const getNetRemaining = (inv: Invoice): number => {
    if (inv.type === 'credit') return 0;
    const paidAmount = getEffectivePaidAmount(inv);
    const allocated = getAllocatedCredits(inv.$id);
    return round2(Math.max(0, (inv.total || 0) - paidAmount - allocated));
  };

  const getCreditRefunded = (inv: Invoice): number => {
    if (inv.type !== 'credit') return 0;
    const cd = getCreditData(inv);
    if (cd.creditStatus === undefined) return inv.total || 0;
    const refunds = Array.isArray(cd.refundPayments) ? cd.refundPayments : [];
    const sum = refunds.reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
    return round2(sum || Number(cd.refundedAmount) || 0);
  };

  const getCreditRefundable = (inv: Invoice): number => {
    if (inv.type !== 'credit') return 0;
    const total = inv.total || 0;
    const allocated = getCreditAllocatedAmount(inv);
    const refunded = getCreditRefunded(inv);
    return round2(Math.max(0, total - allocated - refunded));
  };

  const mapQuoteStatus = (s: string) => {
    const map: Record<string, string> = { 'Brouillon': 'draft', 'Envoyé': 'sent', 'Accepté': 'won', 'Refusé': 'lost', 'Facturé': 'won' };
    return map[s] || s.toLowerCase();
  };

  // ============================================================
  // 📥 CHARGEMENT DES DONNÉES
  // ============================================================

  const loadClientData = async () => {
    try {
      setLoading(true);
      let teamId = null;
      const teamsRes = await databases.listDocuments(DATABASE_ID, 'teams', [Query.equal('ownerId', user.$id)]);
      if (teamsRes.documents.length > 0) teamId = teamsRes.documents[0].$id;
      else {
        const membersRes = await databases.listDocuments(DATABASE_ID, 'team_members', [Query.equal('userId', user.$id)]);
        if (membersRes.documents.length > 0) teamId = membersRes.documents[0].teamId;
      }

      if (!teamId) {
        toast.error('Aucune équipe trouvée');
        setLoading(false);
        navigate('/clients');
        return;
      }
      setCurrentTeamId(teamId);

      const clientDoc = await databases.getDocument(DATABASE_ID, 'clients', id!);
      if (clientDoc.teamId !== teamId) {
        toast.error('Accès refusé : Ce client n\'appartient pas à votre équipe.');
        setLoading(false);
        navigate('/clients');
        return;
      }

      setClient(clientDoc as unknown as Client);
      const clientName = `${clientDoc.firstName || ''} ${clientDoc.lastName || ''}`.trim() || clientDoc.companyName || '';

      try {
        const quotesRes = await databases.listDocuments(DATABASE_ID, 'quotes', [
          Query.equal('teamId', teamId), Query.orderDesc('$createdAt'), Query.limit(500)
        ]);
        const clientQuotes = quotesRes.documents.filter((q: any) => {
          if (q.clientId === clientDoc.$id) return true;
          if (clientDoc.prospectId && q.prospectId === clientDoc.prospectId) return true;
          if (q.clientName && clientName && String(q.clientName).trim().toLowerCase() === clientName.trim().toLowerCase()) return true;
          if (q.clientEmail && clientDoc.email && String(q.clientEmail).trim().toLowerCase() === String(clientDoc.email).trim().toLowerCase()) return true;
          return false;
        });
        setQuotes(clientQuotes as unknown as Quote[]);
      } catch (e) { console.warn('Erreur chargement devis:', e); }

      try {
        const invoicesRes = await databases.listDocuments(DATABASE_ID, 'invoices', [
          Query.equal('teamId', teamId), Query.orderDesc('$createdAt'), Query.limit(500)
        ]);
        const clientInvoices = invoicesRes.documents.filter((inv: any) => {
          if (inv.clientId === clientDoc.$id) return true;
          if (inv.clientName && clientName && String(inv.clientName).trim().toLowerCase() === clientName.trim().toLowerCase()) return true;
          return false;
        });
        setInvoices(clientInvoices as unknown as Invoice[]);
      } catch (e) { console.warn('Erreur chargement factures:', e); }

      let metaDocs: any[] = [];
      try {
        const metaRes = await databases.listDocuments(DATABASE_ID, 'invoice_metadata', [Query.equal('teamId', teamId), Query.limit(2000)]);
        metaDocs = metaRes.documents;
      } catch { metaDocs = []; }

      let journalDocs: any[] = [];
      try {
        const journalRes = await databases.listDocuments(DATABASE_ID, 'invoice_payments', [Query.equal('teamId', teamId), Query.limit(2000)]);
        journalDocs = journalRes.documents;
      } catch { journalDocs = []; }

      const map = new Map<string, any>();
      metaDocs.forEach((d: any) => {
        map.set(d.invoiceId, {
          creditData: readJson(d.creditData),
          archiveData: readJson(d.archiveData),
          reconciliationData: readJson(d.reconciliationData),
        });
      });
      setMetadataMap(map);
      setJournalPayments(journalDocs.map((d: any) => ({ ...readJson(d.data), $id: d.$id })));

    } catch (error: any) {
      console.error('Erreur chargement client:', error);
      toast.error(`Erreur : ${error.message}`);
      navigate('/clients');
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // ✅ CALCULS HARMONISÉS
  // ============================================================

  const isSubjectToVAT = invoices.some(inv =>
    inv.companyTva && inv.companyTva.trim() !== '' && !inv.companyTva.toLowerCase().includes('non applicable')
  );
  const vatBaseLabel = isSubjectToVAT ? 'HT' : 'TTC';
  const amountOf = (inv: Invoice): number => isSubjectToVAT ? (inv.subtotal || 0) : (inv.total || 0);

  const activeInvoices = invoices.filter(inv => !isDocArchived(inv));
  const advancesWithFinal = new Set(
    activeInvoices
      .filter(i => (i.type === 'standard' || i.type === 'balance') && i.originalInvoiceId)
      .filter(i => activeInvoices.some(a => a.$id === i.originalInvoiceId && a.type === 'advance'))
      .map(i => i.originalInvoiceId!)
  );
  const originalsWithAdvance = new Set(
    activeInvoices.filter(i => i.type === 'advance' && i.originalInvoiceId).map(i => i.originalInvoiceId!)
  );
  const revenueInvoicesAll = activeInvoices.filter(i => i.type === 'standard' || i.type === 'advance' || i.type === 'balance');
  const revenueInvoices = revenueInvoicesAll.filter(i => {
    if (i.type === 'advance' && advancesWithFinal.has(i.$id)) return false;
    if ((i.type === 'standard' || i.type === 'balance') && originalsWithAdvance.has(i.$id)) return false;
    return true;
  });
  const creditInvoices = activeInvoices.filter(inv => inv.type === 'credit');

  const totalInvoiced = round2(revenueInvoices.reduce((s, inv) => s + amountOf(inv), 0));
  const totalEncaisse = round2(revenueInvoices.reduce((s, inv) => s + Math.min(getEffectivePaidAmount(inv), inv.total || 0), 0));
  const totalRemaining = round2(revenueInvoices.reduce((s, inv) => s + getNetRemaining(inv), 0));
  const totalAllocatedCredits = round2(revenueInvoices.reduce((s, inv) => s + getAllocatedCredits(inv.$id), 0));
  const totalCreditsIssued = round2(creditInvoices.reduce((s, i) => s + (i.total || 0), 0));
  const totalCreditsRefunded = round2(creditInvoices.reduce((s, i) => s + getCreditRefunded(i), 0));
  const totalCreditsToRefund = round2(creditInvoices.reduce((s, i) => s + getCreditRefundable(i), 0));
  const acceptedQuotes = quotes.filter(q => q.status === 'Accepté' || q.status === 'Facturé').length;

  // ✅ Calculs de pagination
  const quotesTotalPages = Math.max(1, Math.ceil(quotes.length / ITEMS_PER_PAGE));
  const quotesStartIndex = (quotesPage - 1) * ITEMS_PER_PAGE;
  const quotesEndIndex = quotesStartIndex + ITEMS_PER_PAGE;
  const paginatedQuotes = quotes.slice(quotesStartIndex, quotesEndIndex);

  const invoicesTotalPages = Math.max(1, Math.ceil(invoices.length / ITEMS_PER_PAGE));
  const invoicesStartIndex = (invoicesPage - 1) * ITEMS_PER_PAGE;
  const invoicesEndIndex = invoicesStartIndex + ITEMS_PER_PAGE;
  const paginatedInvoices = invoices.slice(invoicesStartIndex, invoicesEndIndex);

  const history = buildHistory();
  const historyTotalPages = Math.max(1, Math.ceil(history.length / ITEMS_PER_PAGE));
  const historyStartIndex = (historyPage - 1) * ITEMS_PER_PAGE;
  const historyEndIndex = historyStartIndex + ITEMS_PER_PAGE;
  const paginatedHistory = history.slice(historyStartIndex, historyEndIndex);

  // ============================================================
  // ⚙️ ACTIONS
  // ============================================================

  const handleArchiveConfirm = async () => {
    if (!clientToArchive) return;
    try {
      const doc = await databases.getDocument(DATABASE_ID, 'clients', clientToArchive.$id);
      if (doc.teamId !== currentTeamId) { toast.error('Accès refusé'); return; }
      await databases.updateDocument(DATABASE_ID, 'clients', clientToArchive.$id, { status: 'archived' });
      toast.success('Client archivé');
      setClientToArchive(null);
      navigate('/clients');
    } catch (error: any) { toast.error(`Erreur : ${error.message}`); }
  };

  const handleUnarchive = async () => {
    if (!client) return;
    try {
      const doc = await databases.getDocument(DATABASE_ID, 'clients', client.$id);
      if (doc.teamId !== currentTeamId) { toast.error('Accès refusé'); return; }
      await databases.updateDocument(DATABASE_ID, 'clients', client.$id, { status: 'active' });
      setClient({ ...client, status: 'active' });
      toast.success('Client désarchivé');
    } catch (error: any) { toast.error(`Erreur : ${error.message}`); }
  };

  function buildHistory() {
    const items: any[] = [];
    quotes.forEach(q => {
      items.push({
        type: 'quote',
        date: q.issueDate || q.$createdAt || '',
        title: `Devis ${q.quoteNumber}`,
        subtitle: q.subject || q.clientName,
        amount: q.total,
        status: q.status,
        id: q.$id
      });
    });
    invoices.forEach(inv => {
      const isCredit = inv.type === 'credit';
      const cd = isCredit ? getCreditData(inv) : {};
      items.push({
        type: 'invoice',
        docType: inv.type,
        creditStatus: cd.creditStatus,
        date: inv.issueDate || inv.$createdAt || '',
        title: `Facture ${inv.invoiceNumber}${inv.type === 'advance' ? ' (Acompte)' : isCredit ? ' (Avoir)' : ''}`,
        subtitle: isCredit
          ? `${inv.clientName || ''}${cd.creditStatus ? ` — ${statusLabels[cd.creditStatus] || 'Avoir émis'}` : ''}`
          : (inv.clientName || ''),
        amount: inv.total,
        status: inv.status,
        id: inv.$id
      });
    });
    items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return items;
  }

  if (permLoading || loading || settingsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="text-slate-500 dark:text-slate-400 text-lg animate-pulse">Chargement...</div>
      </div>
    );
  }

  if (!client) return null;

  const clientName = `${client.firstName || ''} ${client.lastName || ''}`.trim() || client.companyName || 'Client sans nom';

  const tabs = [
    { key: 'info', label: 'Informations', count: 1 },
    { key: 'quotes', label: 'Devis', count: quotes.length },
    { key: 'invoices', label: 'Factures', count: invoices.length },
    { key: 'history', label: 'Historique', count: history.length },
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <PageHeader
        icon={client.type === 'entreprise' ? Building : User}
        iconColor="purple"
        title={clientName}
        description={
          <div className="flex flex-wrap items-center gap-2 mt-1">
            {client.clientId && (
              <Badge tone="purple"><Hash size={10} className="mr-1" />{client.clientId}</Badge>
            )}
            <StatusIndicator status={client.status} />
            {client.companyName && client.type === 'particulier' && (
              <span className="text-sm text-slate-500 dark:text-slate-400">• {client.companyName}</span>
            )}
          </div>
        }
        action={
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => navigate('/clients')} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
              <ChevronLeft size={20} />
            </button>
            {hasPermission('quotes.create') && client.status !== 'archived' && (
              <button onClick={() => navigate(`/quotes?clientId=${client.$id}`)} className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 active:scale-95 transition-all">
                <FileText size={16} /> <span className="hidden sm:inline">Nouveau devis</span><span className="sm:hidden">Devis</span>
              </button>
            )}
            {hasPermission('clients.edit') && client.status !== 'archived' && (
              <button onClick={() => navigate(`/clients?edit=${client.$id}`)} className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600 active:scale-95 transition-all">
                <Edit2 size={16} /> <span className="hidden sm:inline">Modifier</span>
              </button>
            )}
            {hasPermission('clients.delete') && client.status !== 'archived' ? (
              <button onClick={() => setClientToArchive(client)} className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-orange-700 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/30 border border-orange-200 dark:border-orange-800 rounded-lg hover:bg-orange-100 dark:hover:bg-orange-900/50 active:scale-95 transition-all">
                <Archive size={16} /> <span className="hidden sm:inline">Archiver</span>
              </button>
            ) : hasPermission('clients.delete') && client.status === 'archived' ? (
              <button onClick={handleUnarchive} className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/50 active:scale-95 transition-all">
                <RotateCcw size={16} /> <span className="hidden sm:inline">Désarchiver</span>
              </button>
            ) : null}
          </div>
        }
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* KPIs */}
        <KPIGrid columns={4}>
          <StatCell value={fm(totalInvoiced)} label={`Facturé (${vatBaseLabel})`} sublabel={`${revenueInvoices.length} facture(s) active(s)`} />
          <StatCell value={fm(totalEncaisse)} label="Encaissé (TTC)" sublabel={`${revenueInvoices.filter(i => getEffectivePaidAmount(i) >= (i.total || 0) - 0.01).length} réglée(s)`} />
          <StatCell value={fm(totalRemaining)} label="Reste à payer" sublabel={`${revenueInvoices.filter(i => getNetRemaining(i) > 0).length} en attente`} />
          <StatCell value={acceptedQuotes} label="Devis acceptés" sublabel={`sur ${quotes.length} devis total`} />
        </KPIGrid>

        {/* Bannière Avoirs */}
        {creditInvoices.length > 0 && (
          <Alert tone="warning" icon={AlertCircle} title={`Avoirs du client (${creditInvoices.length})`} className="mb-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mt-3">
              <div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">Émis</p>
                <p className="font-bold text-slate-900 dark:text-white">{fm(totalCreditsIssued)}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">Imputés</p>
                <p className="font-bold text-green-700 dark:text-green-300">{fm(totalAllocatedCredits)}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">Remboursés</p>
                <p className="font-bold text-red-700 dark:text-red-300">{fm(totalCreditsRefunded)}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">À rembourser</p>
                <p className="font-bold text-amber-700 dark:text-amber-300">{fm(totalCreditsToRefund)}</p>
              </div>
            </div>
          </Alert>
        )}

        {/* Onglets */}
        <TypeTabs tabs={tabs} activeTab={activeTab} onTabChange={(k) => setActiveTab(k as any)} color="purple" />

        <div className="mt-6">
          {activeTab === 'info' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <SectionTitle icon={User}>Coordonnées</SectionTitle>
                <div className="space-y-3">
                  {client.email && (
                    <div className="flex items-center gap-3 text-sm">
                      <Mail size={16} className="text-slate-400 flex-shrink-0" />
                      <a href={`mailto:${client.email}`} className="text-purple-600 dark:text-purple-400 hover:underline truncate">{client.email}</a>
                    </div>
                  )}
                  {client.phone && (
                    <div className="flex items-center gap-3 text-sm">
                      <Phone size={16} className="text-slate-400 flex-shrink-0" />
                      <a href={`tel:${client.phone}`} className="text-purple-600 dark:text-purple-400 hover:underline">{client.phone}</a>
                    </div>
                  )}
                  {client.address && (
                    <div className="flex items-start gap-3 text-sm">
                      <MapPin size={16} className="text-slate-400 mt-0.5 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300">{client.address}</span>
                    </div>
                  )}
                  {client.billingAddress && client.billingAddress !== client.address && (
                    <div className="flex items-start gap-3 text-sm">
                      <Building size={16} className="text-slate-400 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Adresse de facturation</p>
                        <p className="text-slate-700 dark:text-slate-300">{client.billingAddress}</p>
                      </div>
                    </div>
                  )}
                </div>
              </Card>

              <Card>
                <SectionTitle icon={Building}>Informations légales</SectionTitle>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Type</span>
                    <TypeLabel type={client.type} />
                  </div>
                  {client.companyName && (
                    <div className="flex justify-between">
                      <span className="text-slate-500 dark:text-slate-400">Entreprise</span>
                      <span className="font-medium text-slate-900 dark:text-white">{client.companyName}</span>
                    </div>
                  )}
                  {client.taxNumber && (
                    <div className="flex justify-between">
                      <span className="text-slate-500 dark:text-slate-400">N° Fiscal / TVA</span>
                      <span className="font-mono text-xs text-slate-900 dark:text-white">{client.taxNumber}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Client depuis</span>
                    <span className="text-slate-900 dark:text-white">{formatDate(client.$createdAt)}</span>
                  </div>
                </div>
              </Card>

              {client.notes && (
                <Card className="md:col-span-2">
                  <SectionTitle icon={FileText}>Notes internes</SectionTitle>
                  <div className="bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg p-4 text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                    {client.notes}
                  </div>
                </Card>
              )}
            </div>
          )}

          {activeTab === 'quotes' && (
            quotes.length === 0 ? (
              <EmptyState 
                icon={FileText} 
                title="Aucun devis pour ce client" 
                action={hasPermission('quotes.create') && client.status !== 'archived' ? (
                  <button onClick={() => navigate(`/quotes?clientId=${client.$id}`)} className="mt-4 inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 active:scale-95 transition-all">
                    <FileText size={16} /> Créer un devis
                  </button>
                ) : null} 
              />
            ) : (
              <>
                {/* Desktop */}
                <Card padding={false} className="hidden md:block">
                  <DataTable headers={[
                    { label: 'N°', align: 'left' },
                    { label: 'Objet', align: 'left' },
                    { label: 'Date', align: 'left' },
                    { label: `Total (${currency})`, align: 'right' },
                    { label: 'Statut', align: 'left' }
                  ]}>
                    {paginatedQuotes.map(q => (
                      <tr key={q.$id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                        <td className="px-6 py-4">
                          <Badge tone="purple"><Hash size={10} className="mr-1"/>{q.quoteNumber}</Badge>
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-300">{q.subject || '-'}</td>
                        <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-300">{formatDate(q.issueDate)}</td>
                        <td className="px-6 py-4 text-sm font-semibold text-slate-900 dark:text-white text-right">{fm(q.total)}</td>
                        <td className="px-6 py-4">
                          <StatusIndicator status={mapQuoteStatus(q.status)} />
                        </td>
                      </tr>
                    ))}
                  </DataTable>
                </Card>

                {/* Mobile */}
                <div className="md:hidden space-y-3">
                  {paginatedQuotes.map(q => (
                    <MobileCard key={q.$id}>
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex-1 min-w-0">
                          <Badge tone="purple" className="mb-2"><Hash size={10} className="mr-1"/>{q.quoteNumber}</Badge>
                          <p className="text-sm text-slate-600 dark:text-slate-300 truncate">{q.subject || 'Sans objet'}</p>
                        </div>
                        <StatusIndicator status={mapQuoteStatus(q.status)} />
                      </div>
                      <div className="flex justify-between items-center pt-3 border-t border-slate-100 dark:border-slate-700">
                        <span className="text-xs text-slate-500 dark:text-slate-400">{formatDate(q.issueDate)}</span>
                        <span className="text-sm font-bold text-slate-900 dark:text-white">{fm(q.total)}</span>
                      </div>
                    </MobileCard>
                  ))}
                </div>

                {/* Pagination */}
                {quotesTotalPages > 1 && (
                  <Pagination
                    currentPage={quotesPage}
                    totalPages={quotesTotalPages}
                    onPageChange={setQuotesPage}
                    startItem={quotesStartIndex + 1}
                    endItem={Math.min(quotesEndIndex, quotes.length)}
                    totalItems={quotes.length}
                    itemName="devis"
                  />
                )}
              </>
            )
          )}

          {activeTab === 'invoices' && (
            invoices.length === 0 ? (
              <EmptyState icon={Receipt} title="Aucune facture pour ce client" />
            ) : (
              <>
                {/* Desktop */}
                <Card padding={false} className="hidden md:block">
                  <DataTable headers={[
                    { label: 'N°', align: 'left' },
                    { label: 'Type', align: 'left' },
                    { label: 'Date', align: 'left' },
                    { label: `Total (${currency})`, align: 'right' },
                    { label: `Reste (${currency})`, align: 'right' },
                    { label: 'Statut', align: 'left' }
                  ]}>
                    {paginatedInvoices.map(inv => {
                      const isCredit = inv.type === 'credit';
                      const cd = isCredit ? getCreditData(inv) : {};
                      const archived = isDocArchived(inv);
                      const mappedStatus = mapInvoiceStatusToShared(inv.status, inv.type, cd.creditStatus);
                      return (
                        <tr key={inv.$id} className={`hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors ${archived ? 'opacity-60' : ''}`}>
                          <td className="px-6 py-4">
                            <Badge tone="purple"><Hash size={10} className="mr-1"/>{inv.invoiceNumber}</Badge>
                          </td>
                          <td className="px-6 py-4">
                            <TypeLabel type={inv.type || 'standard'} />
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-300">{formatDate(inv.issueDate)}</td>
                          <td className="px-6 py-4 text-sm font-semibold text-slate-900 dark:text-white text-right">{fm(inv.total)}</td>
                          <td className="px-6 py-4 text-sm font-medium text-right">
                            {isCredit ? (
                              <span className="text-orange-600 dark:text-orange-400" title="Reste à rembourser au client">
                                {fm(getCreditRefundable(inv))}
                              </span>
                            ) : (
                              <span className="text-red-600 dark:text-red-400">{fm(getNetRemaining(inv))}</span>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <StatusIndicator status={mappedStatus} />
                          </td>
                        </tr>
                      );
                    })}
                  </DataTable>
                </Card>

                {/* Mobile */}
                <div className="md:hidden space-y-3">
                  {paginatedInvoices.map(inv => {
                    const isCredit = inv.type === 'credit';
                    const cd = isCredit ? getCreditData(inv) : {};
                    const archived = isDocArchived(inv);
                    const mappedStatus = mapInvoiceStatusToShared(inv.status, inv.type, cd.creditStatus);
                    return (
                      <MobileCard key={inv.$id} className={archived ? 'opacity-60' : ''}>
                        <div className="flex justify-between items-start mb-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2 flex-wrap">
                              <Badge tone="purple"><Hash size={10} className="mr-1"/>{inv.invoiceNumber}</Badge>
                              <TypeLabel type={inv.type || 'standard'} />
                            </div>
                          </div>
                          <StatusIndicator status={mappedStatus} />
                        </div>
                        <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-100 dark:border-slate-700 text-sm">
                          <div>
                            <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">Date</p>
                            <p className="font-medium text-slate-900 dark:text-white">{formatDate(inv.issueDate)}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">Total</p>
                            <p className="font-bold text-slate-900 dark:text-white">{fm(inv.total)}</p>
                          </div>
                          <div className="col-span-2">
                            <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">
                              {isCredit ? 'À rembourser' : 'Reste à payer'}
                            </p>
                            <p className={`font-bold ${isCredit ? 'text-orange-600 dark:text-orange-400' : 'text-red-600 dark:text-red-400'}`}>
                              {isCredit ? fm(getCreditRefundable(inv)) : fm(getNetRemaining(inv))}
                            </p>
                          </div>
                        </div>
                      </MobileCard>
                    );
                  })}
                </div>

                {/* Pagination */}
                {invoicesTotalPages > 1 && (
                  <Pagination
                    currentPage={invoicesPage}
                    totalPages={invoicesTotalPages}
                    onPageChange={setInvoicesPage}
                    startItem={invoicesStartIndex + 1}
                    endItem={Math.min(invoicesEndIndex, invoices.length)}
                    totalItems={invoices.length}
                    itemName="facture"
                  />
                )}
              </>
            )
          )}

          {activeTab === 'history' && (
            history.length === 0 ? (
              <EmptyState icon={Clock} title="Aucun historique pour ce client" />
            ) : (
              <>
                <div className="space-y-3">
                  {paginatedHistory.map((item, idx) => (
                    <Card key={idx} className="flex items-start gap-4">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                        item.type === 'quote' ? 'bg-indigo-50 dark:bg-indigo-500/10' : 'bg-violet-50 dark:bg-violet-500/10'
                      }`}>
                        {item.type === 'quote' ? (
                          <FileText size={18} className="text-indigo-600 dark:text-indigo-400" />
                        ) : (
                          <Receipt size={18} className="text-violet-600 dark:text-violet-400" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                          <p className="font-medium text-slate-900 dark:text-white truncate">{item.title}</p>
                          <StatusIndicator status={item.type === 'quote' ? mapQuoteStatus(item.status) : mapInvoiceStatusToShared(item.status, item.docType, item.creditStatus)} />
                        </div>
                        {item.subtitle && <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 truncate">{item.subtitle}</p>}
                        <div className="flex items-center justify-between mt-2">
                          <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                            <Calendar size={12} /> {formatDate(item.date)}
                          </p>
                          <p className="text-sm font-semibold text-slate-900 dark:text-white">{fm(item.amount)}</p>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>

                {/* Pagination */}
                {historyTotalPages > 1 && (
                  <Pagination
                    currentPage={historyPage}
                    totalPages={historyTotalPages}
                    onPageChange={setHistoryPage}
                    startItem={historyStartIndex + 1}
                    endItem={Math.min(historyEndIndex, history.length)}
                    totalItems={history.length}
                    itemName="élément"
                  />
                )}
              </>
            )
          )}
        </div>
      </main>

      <ConfirmDialog
        open={!!clientToArchive}
        onClose={() => setClientToArchive(null)}
        onConfirm={handleArchiveConfirm}
        title="Archiver ce client ?"
        description={
          clientToArchive ? (
            <>
              Le client <strong className="text-slate-700 dark:text-slate-200">{clientToArchive.firstName} {clientToArchive.lastName}</strong> sera masqué de la liste principale. Son historique et ses documents seront conservés.
            </>
          ) : null
        }
        confirmLabel="Confirmer"
        cancelLabel="Annuler"
        tone="danger"
      />
    </div>
  );
}