import { useState, useEffect, useMemo, useRef, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { databases, storage, DATABASE_ID, BUCKET_ID } from '../appwrite';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { useCompanySettings } from '../hooks/useCompanySettings';
import { getFilePreviewUrl } from '../utils/storage';
import { verifyDocumentAccess, logAuditAction } from '../utils/security';
import Sidebar from '../components/Sidebar';
import { toast } from 'sonner';
import {
  PageHeader, Modal, ActionMenu, ActionMenuItem, StatCell, StatusIndicator,
  DotLabel, Avatar, SkeletonRow, SkeletonCard, TypeTabs, KPIGrid, Pagination,
  mapInvoiceStatusToShared, toEntity, formatDate,
  type Entity, type DotTone,
} from '../components/ui/SharedUI';
import {
  Search, Download, Filter, CheckCircle2, Receipt, DollarSign,
  Archive, RotateCcw, Eye, X, FileText, FileMinus, AlertTriangle, RefreshCw,
  Banknote, FileCheck2, Link2,
  Zap, FileCode, Send, Clock,
} from 'lucide-react';
import { Query, ID, Permission, Role } from 'appwrite';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

// ============================================================
// 📐 INTERFACES
// ============================================================

interface InvoiceItem {
  id: string; reference: string; description: string; quantity: number;
  unit: string; unitPrice: number; tvaRate: number; total: number; discount: number;
}

interface Payment {
  id: string; amount: number; date: string; method: string; reference?: string; notes?: string;
}

interface Invoice {
  $id: string; invoiceNumber: string; quoteId?: string; userId: string; teamId?: string;
  clientToken?: string; status: string; issueDate: string; dueDate?: string; paidAt?: string; receivedAt?: string;
  subtotal: number; vatRate: number; vatAmount: number; total: number; discount: number;
  tax: number; deposit: number; balance: number;
  companyName?: string; companyLegalForm?: string; companyAddress?: string; companySiret?: string;
  companyRcs?: string; companyTva?: string; companyPhone?: string; companyEmail?: string; logoFileId?: string;
  clientName?: string; clientAddress?: string; clientBillingAddress?: string; clientEmail?: string; clientPhone?: string;
  items?: string; paymentMethods?: string; paymentConditions?: string; executionDelay?: string;
  specialConditions?: string; tradeType?: string; insuranceName?: string; insuranceAddress?: string; insurancePolicy?: string;
   notes?: string; payments?: string | Payment[]; createdAt?: string; type?: string;
  originalQuoteId?: string; originalInvoiceId?: string; advancePercent?: string; currencyCode?: string;
  // ✅ E-FACTURATION
  isElectronic?: boolean;
  transmissionStatus?: 'draft' | 'ready' | 'transmitted' | 'accepted' | 'rejected' | 'disputed' | 'cancelled';
  xmlContent?: string;
  pdfHash?: string;
  einvoicePlatform?: 'ppf' | 'pdp' | 'od';
  einvoiceFormat?: 'factur-x' | 'ubl' | 'cii';
  transmissionReference?: string;
}

interface QuoteDetail {
  $id: string; quoteNumber: string; clientName: string; subject?: string; status: string;
  total: number; issueDate?: string; validityDate?: string; items?: string; subtotal?: number; discount?: number; tax?: number; deposit?: number; balance?: number;
}

// ============================================================
// 🏷️ LIBELLÉS LOCAUX
// ============================================================

const statusLabels: Record<string, string> = {
  draft: 'Brouillon', sent: 'Envoyée', near_due: 'Bientôt échue',
  overdue: 'En retard', paid: 'Payée', partial: 'Partielle',
  cancelled: 'Archivée / Annulée',
};

const typeLabels: Record<string, string> = {
  standard: 'Facture', advance: "Facture d'acompte", balance: 'Facture de solde', credit: "Facture d'avoir",
};

const typeToneMap: Record<string, DotTone> = {
  standard: 'violet', advance: 'sky', balance: 'teal', credit: 'rose',
};

const paymentMethodsList = ['Virement bancaire', 'Chèque', 'Espèces', 'Carte bancaire', 'Prélèvement SEPA', 'Autre'];

// ✅ STATUTS DE TRANSMISSION E-FACTURE
const transmissionStatusLabels: Record<string, string> = {
  draft: 'Brouillon',
  ready: 'Prête à transmettre',
  transmitted: 'Transmise',
  accepted: 'Acceptée',
  rejected: 'Rejetée',
  disputed: 'Contestée',
  cancelled: 'Annulée',
};

const transmissionStatusColors: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300',
  ready: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  transmitted: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  accepted: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  rejected: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  disputed: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  cancelled: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
};

const toInt = (value: any, fallback: number = 0): number => {
  const n = Number(value);
  return isNaN(n) ? fallback : Math.round(n);
};
// ============================================================
// 🧩 COMPOSANT PRINCIPAL
// ============================================================

export default function Invoices() {
  const { user } = useAuth();
  const { hasPermission, loading: permLoading } = usePermissions();
  const navigate = useNavigate();
  const { fm, currency, currencyConfig, loading: settingsLoading } = useCompanySettings();
  const SYM = currencyConfig?.symbol || '€';

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [currentTeamId, setCurrentTeamId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'active' | 'archived'>('active');

  // ✅ Onglet de type de document
    // ✅ Onglet de type de document (avec e-factures)
  const [typeTab, setTypeTab] = useState<'all' | 'standard' | 'advance' | 'credit' | 'einvoice'>('all');

  // ✅ Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;
  const searchInputRef = useRef<HTMLInputElement>(null);

  // ✅ Raccourci Ctrl+K / Cmd+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  // ✅ Reset pagination quand les filtres changent
  useEffect(() => {
    setCurrentPage(1);
  }, [search, filterStatus, filterType, viewMode, typeTab]);

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [paymentForm, setPaymentForm] = useState({ amount: '', date: new Date().toISOString().split('T')[0], method: 'Virement bancaire', reference: '', notes: '' });
  const [savingPayment, setSavingPayment] = useState(false);
  const [showQuoteModal, setShowQuoteModal] = useState(false);
  const [quoteDetails, setQuoteDetails] = useState<QuoteDetail | null>(null);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [showAdvanceModal, setShowAdvanceModal] = useState(false);
  const [advanceForm, setAdvanceForm] = useState({ percent: '30', invoiceId: '' });
  const [savingAdvance, setSavingAdvance] = useState(false);
  const [generatingFinal, setGeneratingFinal] = useState(false);
  const [showReceiptChoiceModal, setShowReceiptChoiceModal] = useState(false);
  const [lastPaymentData, setLastPaymentData] = useState<{ invoice: Invoice; payment: Payment } | null>(null);
  const [showConfirmPaidModal, setShowConfirmPaidModal] = useState(false);
  const [invoiceToConfirm, setInvoiceToConfirm] = useState<Invoice | null>(null);
  const [showConfirmPaymentModal, setShowConfirmPaymentModal] = useState(false);
  const [paymentToConfirm, setPaymentToConfirm] = useState<{ invoice: Invoice; payment: Payment } | null>(null);
  const [showCreditModal, setShowCreditModal] = useState(false);
  const [creditInvoice, setCreditInvoice] = useState<Invoice | null>(null);
  const [creditForm, setCreditForm] = useState<{ type: string; amount: string; reason: string; refundChoice: 'allocate' | 'refund' }>({ type: 'total', amount: '', reason: '', refundChoice: 'allocate' });
  const [savingCredit, setSavingCredit] = useState(false);
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [refundCredit, setRefundCredit] = useState<Invoice | null>(null);
  const [refundForm, setRefundForm] = useState({ amount: '', date: new Date().toISOString().split('T')[0], method: 'Virement bancaire', reference: '' });
  const [savingRefund, setSavingRefund] = useState(false);
  const [failedEvents, setFailedEvents] = useState<Array<{ type: string; invoiceId: string; data: any }>>([]);
  const [metadataCache, setMetadataCache] = useState<Map<string, any>>(new Map());

  // ============================================================
  // 🔧 HELPERS MÉTADONNÉES
  // ============================================================

  const readJson = (raw: unknown): any => {
    if (!raw) return {};
    if (typeof raw === 'object') return raw;
    try { return JSON.parse(raw as string); } catch { return {}; }
  };

  const writeJson = (obj: any): string => JSON.stringify(obj || {});

  const getEventPerms = () => {
    if (user?.secureTeamId) {
      return [
        Permission.read(Role.team(user.secureTeamId)),
        Permission.update(Role.team(user.secureTeamId)),
        Permission.delete(Role.team(user.secureTeamId)),
      ];
    }
    return [
      Permission.read(Role.users()),
      Permission.update(Role.users()),
      Permission.delete(Role.users()),
    ];
  };

  const loadMetadata = async (invoiceIds: string[], teamIdOverride?: string | null): Promise<Map<string, any>> => {
    const tid = teamIdOverride !== undefined ? teamIdOverride : currentTeamId;
    if (invoiceIds.length === 0 || !tid) return new Map();
    try {
      const res = await databases.listDocuments(DATABASE_ID, 'invoice_metadata', [
        Query.equal('teamId', tid),
        Query.equal('invoiceId', invoiceIds),
        Query.limit(1000),
      ]);
      const best: Record<string, any> = {};
      res.documents.forEach((doc: any) => {
        const cur = best[doc.invoiceId];
        if (!cur || (doc.metadataVersion || 0) > (cur.metadataVersion || 0) || ((doc.metadataVersion || 0) === (cur.metadataVersion || 0) && (doc.$updatedAt || '') > (cur.$updatedAt || ''))) {
          best[doc.invoiceId] = doc;
        }
      });
      const map = new Map<string, any>();
      Object.values(best).forEach((doc: any) => {
        map.set(doc.invoiceId, {
          creditData: readJson(doc.creditData),
          archiveData: readJson(doc.archiveData),
          reconciliationData: readJson(doc.reconciliationData),
          metadataVersion: doc.metadataVersion || 0,
        });
      });
      return map;
    } catch (e) {
      console.warn('Erreur chargement metadata:', e);
      return new Map();
    }
  };

  const loadMetadataForInvoice = async (invoiceId: string): Promise<any> => {
    if (!currentTeamId) return { creditData: {}, archiveData: {}, reconciliationData: {}, metadataVersion: 0 };
    try {
      const res = await databases.listDocuments(DATABASE_ID, 'invoice_metadata', [
        Query.equal('teamId', currentTeamId),
        Query.equal('invoiceId', invoiceId),
        Query.limit(10),
      ]);
      if (res.documents.length === 0) return { creditData: {}, archiveData: {}, reconciliationData: {}, metadataVersion: 0 };
      const doc = res.documents.reduce((a: any, b: any) =>
        ((b.metadataVersion || 0) > (a.metadataVersion || 0) || ((b.metadataVersion || 0) === (a.metadataVersion || 0) && (b.$updatedAt || '') > (a.$updatedAt || ''))) ? b : a
      ) as any;
      return {
        creditData: readJson(doc.creditData),
        archiveData: readJson(doc.archiveData),
        reconciliationData: readJson(doc.reconciliationData),
        metadataVersion: doc.metadataVersion || 0,
      };
    } catch (e) {
      console.error('Erreur relecture metadata:', e);
      throw new Error("Impossible de vérifier l'état actuel de l'avoir");
    }
  };

  const saveMetadata = async (
    invoiceId: string,
    patch: { creditData?: any; archiveData?: any; reconciliationData?: any },
    expectedVersion?: number
  ): Promise<{ success: boolean; newVersion: number; conflict?: boolean }> => {
    if (!currentTeamId || !user) return { success: false, newVersion: 0 };
    const perms = getEventPerms();
    try {
      const existing = await databases.listDocuments(DATABASE_ID, 'invoice_metadata', [
        Query.equal('invoiceId', invoiceId),
        Query.limit(1),
      ]);
      if (existing.documents.length > 0) {
        const doc = existing.documents[0] as any;
        const currentVersion = doc.metadataVersion || 0;
        if (expectedVersion !== undefined && currentVersion !== expectedVersion) {
          return { success: false, newVersion: currentVersion, conflict: true };
        }
        const newVersion = currentVersion + 1;
        const update: any = { metadataVersion: newVersion };
        if (patch.creditData !== undefined) update.creditData = writeJson(patch.creditData);
        if (patch.archiveData !== undefined) update.archiveData = writeJson(patch.archiveData);
        if (patch.reconciliationData !== undefined) update.reconciliationData = writeJson(patch.reconciliationData);
        await databases.updateDocument(DATABASE_ID, 'invoice_metadata', doc.$id, update);
        setMetadataCache(prev => {
          const newMap = new Map(prev);
          newMap.set(invoiceId, { ...newMap.get(invoiceId), ...patch, metadataVersion: newVersion });
          return newMap;
        });
        return { success: true, newVersion };
      } else {
        const newVersion = 1;
        await databases.createDocument(DATABASE_ID, 'invoice_metadata', ID.unique(), {
          teamId: currentTeamId,
          invoiceId,
          creditData: patch.creditData ? writeJson(patch.creditData) : '{}',
          archiveData: patch.archiveData ? writeJson(patch.archiveData) : '{}',
          reconciliationData: patch.reconciliationData ? writeJson(patch.reconciliationData) : '{}',
          metadataVersion: newVersion,
        }, perms);
        setMetadataCache(prev => {
          const newMap = new Map(prev);
          newMap.set(invoiceId, {
            creditData: patch.creditData || {},
            archiveData: patch.archiveData || {},
            reconciliationData: patch.reconciliationData || {},
            metadataVersion: newVersion,
          });
          return newMap;
        });
        return { success: true, newVersion };
      }
    } catch (e) {
      console.error('Erreur sauvegarde metadata:', e);
      return { success: false, newVersion: 0 };
    }
  };

  const getMetadata = (inv: Invoice | null | undefined): any => (inv ? metadataCache.get(inv.$id) : null) || { creditData: {}, archiveData: {}, reconciliationData: {}, metadataVersion: 0 };
  const getCreditData = (inv: Invoice | null | undefined): any => getMetadata(inv).creditData;
  const getArchiveData = (inv: Invoice | null | undefined): any => getMetadata(inv).archiveData;

  const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

  const isDocArchived = (inv: Invoice | null | undefined): boolean => {
    if (!inv) return false;
    const archive = getArchiveData(inv);
    return inv.status === 'cancelled' || archive.archived === true;
  };

  const isLegacyCredit = (inv: Invoice | null | undefined): boolean => {
    if (!inv) return false;
    const credit = getCreditData(inv);
    return inv.type === 'credit' && credit.creditStatus === undefined;
  };

  const getCreditAllocatedAmount = (inv: Invoice | null | undefined): number => {
    if (!inv || inv.type !== 'credit') return 0;
    const credit = getCreditData(inv);
    if (isLegacyCredit(inv)) {
      const original = invoices.find(i => i && i.$id === inv.originalInvoiceId);
      const originalPaid = !!original && original.status === 'paid';
      if (inv.status === 'paid' || inv.paidAt || credit.creditStatus === 'refunded') return 0;
      return originalPaid ? 0 : (inv.total || 0);
    }
    return round2(credit.allocatedAmount || 0);
  };

  const getCreditRefundedAmount = (inv: Invoice | null | undefined): number => {
    if (!inv || inv.type !== 'credit') return 0;
    const credit = getCreditData(inv);
    if (isLegacyCredit(inv)) {
      if (inv.status === 'paid' || inv.paidAt) return inv.total || 0;
      return 0;
    }
    let refunds: { amount: number }[] = [];
    try { if (Array.isArray(credit.refundPayments)) refunds = credit.refundPayments; } catch { refunds = []; }
    const sum = refunds.reduce((s, p) => s + (p.amount || 0), 0);
    if (sum === 0 && (credit.refundedAmount || 0) === 0 && credit.creditStatus === 'refunded') return inv.total || 0;
    return round2(sum || credit.refundedAmount || 0);
  };

  const getCreditRefundableAmount = (inv: Invoice | null | undefined): number => {
    if (!inv || inv.type !== 'credit') return 0;
    const total = inv.total || 0;
    const allocated = getCreditAllocatedAmount(inv);
    const refunded = getCreditRefundedAmount(inv);
    return round2(Math.max(0, total - allocated - refunded));
  };

  const getAllocatedCreditsForInvoice = (invoiceId: string): number =>
    round2(invoices
      .filter(inv => inv && inv.type === 'credit' && inv.originalInvoiceId === invoiceId && !isDocArchived(inv))
      .reduce((sum, inv) => sum + getCreditAllocatedAmount(inv), 0));

  const getPaidAmount = (invoice: Invoice | null | undefined): number => {
    if (!invoice) return 0;
    let payments: Payment[] = [];
    try {
      if (typeof invoice.payments === 'string' && invoice.payments.trim()) payments = JSON.parse(invoice.payments);
      else if (Array.isArray(invoice.payments)) payments = invoice.payments;
    } catch (e) { payments = []; }
    return payments.reduce((sum, p) => sum + (p.amount || 0), 0);
  };

  const getEffectivePaidAmount = (invoice: Invoice | null | undefined): number => {
    if (!invoice) return 0;
    const directPayments = getPaidAmount(invoice);
    if ((invoice.type === 'standard' || invoice.type === 'balance') && invoice.originalInvoiceId) {
      const advanceInvoice = invoices.find(i => i && i.$id === invoice.originalInvoiceId && i.type === 'advance');
      if (advanceInvoice && advanceInvoice.status === 'paid') {
        return directPayments + (advanceInvoice.total || 0);
      }
    }
    return directPayments;
  };

  const getNetRemaining = (invoice: Invoice | null | undefined): number => {
    if (!invoice) return 0;
    if (invoice.type === 'credit') return 0;
    const paidAmount = getEffectivePaidAmount(invoice);
    const allocated = getAllocatedCreditsForInvoice(invoice.$id);
    return round2(Math.max(0, (invoice.total || 0) - paidAmount - allocated));
  };

  const getTotalCreditsForInvoice = useMemo(() => {
    return (invoiceId: string): number => {
      if (!invoiceId) return 0;
      return invoices
        .filter(inv => inv && inv.type === 'credit' && inv.originalInvoiceId === invoiceId && !isDocArchived(inv))
        .reduce((sum, inv) => sum + (inv.total || 0), 0);
    };
  }, [invoices]);

  const getCreditsListForInvoice = useMemo(() => {
    return (invoiceId: string): Invoice[] => {
      if (!invoiceId) return [];
      return invoices
        .filter(inv => inv && inv.type === 'credit' && inv.originalInvoiceId === invoiceId && !isDocArchived(inv))
        .sort((a, b) => new Date(b.issueDate || 0).getTime() - new Date(a.issueDate || 0).getTime());
    };
  }, [invoices]);
  // ✅ TÉLÉCHARGEMENT XML FACTUR-X
  const handleDownloadXml = (inv: Invoice) => {
    if (!inv.xmlContent) {
      toast.warning('Cette facture n\'a pas de contenu XML Factur-X.');
      return;
    }
    try {
      const blob = new Blob([inv.xmlContent], { type: 'application/xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `factur-x_${inv.invoiceNumber.replace(/[^a-zA-Z0-9]/g, '_')}.xml`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success('XML Factur-X téléchargé', { description: `Facture ${inv.invoiceNumber}` });
    } catch (e: any) {
      toast.error(`Erreur : ${e.message}`);
    }
  };

  // ============================================================
  // 🔄 EFFETS
  // ============================================================

  useEffect(() => {
    if (!permLoading && !hasPermission('invoices.view')) navigate('/dashboard');
  }, [permLoading, hasPermission, navigate]);

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    loadInvoices();
  }, [user, viewMode]);

  const loadInvoicesRef = useRef<(isBackground?: boolean) => Promise<void>>(async () => { });
  useEffect(() => { loadInvoicesRef.current = loadInvoices; });

  const loadInvoices = async (isBackground = false) => {
    try {
      if (!isBackground) setLoading(true);
      let teamId: string | null = null;
      const teamsRes = await databases.listDocuments(DATABASE_ID, 'teams', [Query.equal('ownerId', user.$id)]);
      if (teamsRes.documents.length > 0) teamId = teamsRes.documents[0].$id;
      else {
        const membersRes = await databases.listDocuments(DATABASE_ID, 'team_members', [Query.equal('userId', user.$id)]);
        if (membersRes.documents.length > 0) teamId = membersRes.documents[0].teamId;
      }
      if (!teamId) { if (!isBackground) setLoading(false); return; }
      setCurrentTeamId(teamId);
      const res = await databases.listDocuments(DATABASE_ID, 'invoices', [
        Query.equal('teamId', teamId), Query.orderDesc('$createdAt'), Query.limit(2000),
      ]);
      const docs = res.documents as unknown as Invoice[];

      // Réparation des factures "stuck" (payées mais statut non mis à jour)
      const stuck = docs.filter(d => d && d.status !== 'paid' && d.status !== 'cancelled' && d.balance === 0 && (d.paidAt || d.receivedAt));
      let repaired = [...docs];
      for (const inv of stuck) {
        try {
          await databases.updateDocument(DATABASE_ID, 'invoices', inv.$id, {
            status: 'paid', balance: 0,
            paidAt: inv.paidAt || new Date().toISOString(),
            receivedAt: inv.receivedAt || new Date().toISOString(),
          });
          const idx = repaired.findIndex(r => r.$id === inv.$id);
          if (idx >= 0) repaired[idx] = { ...repaired[idx], status: 'paid', balance: 0 };
        } catch (e) { console.warn('Réparation ignorée:', e); }
      }
      setInvoices(repaired);

      const ids = repaired.map(d => d.$id);
      const meta = await loadMetadata(ids, teamId);
      setMetadataCache(meta);
    } catch (e) {
      console.error('💥 Erreur loadInvoices:', e);
      toast.error('Impossible de charger les factures');
    } finally {
      if (!isBackground) setLoading(false);
    }
  };

  const getDaysOverdue = (dueDate?: string, status?: string) => {
    if (!dueDate || status === 'paid' || status === 'cancelled') return 0;
    const diffDays = Math.ceil((new Date().getTime() - new Date(dueDate).getTime()) / (1000 * 60 * 60 * 24));
    return diffDays > 0 ? diffDays : 0;
  };

  const handleCopyLink = async (invoice: Invoice) => {
    if (!invoice.clientToken) { toast.warning("Cette facture n'a pas de lien public."); return; }
    const link = `${window.location.origin}/f/${invoice.clientToken}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopiedToken(invoice.clientToken);
      toast.success('Lien copié dans le presse-papiers');
      setTimeout(() => setCopiedToken(null), 2000);
    } catch { toast.info(`Lien : ${link}`, { duration: 5000 }); }
  };

  const handleViewQuote = async (quoteId: string) => {
    setLoadingQuote(true);
    setShowQuoteModal(true);
    setQuoteDetails(null);
    try {
      const doc = await verifyDocumentAccess('quotes', quoteId, currentTeamId!);
      setQuoteDetails(doc as unknown as QuoteDetail);
      if (user) await logAuditAction(user.$id, currentTeamId!, 'read', 'quote', quoteId);
    } catch (e: any) {
      console.error('Erreur chargement devis:', e);
      toast.error(`Impossible de charger le devis : ${e.message}`);
      setShowQuoteModal(false);
    } finally { setLoadingQuote(false); }
  };

  const generateNextNumber = async (prefix: string, collection: string, field: string): Promise<string> => {
    const currentYear = new Date().getFullYear();
    const fullPrefix = `${prefix}-${currentYear}-`;
    const MAX_RETRIES = 5;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      let maxNum = 0;
      try {
        const response = await databases.listDocuments(DATABASE_ID, collection, [
          Query.equal('teamId', currentTeamId!), Query.limit(2000),
        ]);
        response.documents.forEach((doc: any) => {
          const numStr = doc[field];
          if (numStr && numStr.startsWith(fullPrefix)) {
            const num = parseInt(numStr.replace(fullPrefix, ''), 10);
            if (!isNaN(num) && num > maxNum) maxNum = num;
          }
        });
      } catch (e) { console.error('Erreur génération numéro:', e); }
      const nextNum = maxNum + 1;
      const nextNumber = `${fullPrefix}${String(nextNum).padStart(3, '0')}`;
      try {
        const check = await databases.listDocuments(DATABASE_ID, collection, [
          Query.equal('teamId', currentTeamId!), Query.equal(field, nextNumber), Query.limit(1),
        ]);
        if (check.documents.length === 0) return nextNumber;
      } catch (e) { console.warn('Vérification unicité échouée:', e); return nextNumber; }
      await new Promise(r => setTimeout(r, 50 * Math.pow(2, attempt)));
    }
    return `${fullPrefix}${String(Date.now()).slice(-6)}`;
  };

  const createInvoiceWithRetry = async (payload: any, perms: string[], maxRetries = 3): Promise<any> => {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await databases.createDocument(DATABASE_ID, 'invoices', ID.unique(), payload, perms);
      } catch (e: any) {
        if (e?.code === 409 && attempt < maxRetries - 1) {
          const prefix = payload.invoiceNumber.split('-')[0];
          const newNumber = await generateNextNumber(prefix, 'invoices', 'invoiceNumber');
          payload = { ...payload, invoiceNumber: newNumber };
          await new Promise(r => setTimeout(r, 100 * Math.pow(2, attempt)));
          continue;
        }
        throw e;
      }
    }
    throw new Error('Impossible de créer la facture après plusieurs tentatives');
  };

  const generateReceiptPDF = async (inv: Invoice, payment?: Payment) => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const W = 210, M = 20;
    const paymentAmount = payment ? payment.amount : inv.total;
    const paymentDate = payment ? payment.date : new Date().toISOString().split('T')[0];
    const paymentMethod = payment ? payment.method : (inv.paymentMethods || 'Non spécifié');
    const paymentRef = payment?.reference || '';
    const receiptNumber = await generateNextNumber('REC', 'receipts', 'receiptNumber');
    let logoB64: string | null = null;
    if (inv.logoFileId) {
      try {
        const u = getFilePreviewUrl('company_logos', inv.logoFileId);
        const b = await fetch(u).then(r => r.blob());
        logoB64 = await new Promise<string>((rs, rj) => { const rd = new FileReader(); rd.onloadend = () => rs(rd.result as string); rd.onerror = rj; rd.readAsDataURL(b); });
      } catch (e) { }
    }
    let Y = M;
    if (logoB64) { try { doc.addImage(logoB64, logoB64.includes('image/png') ? 'PNG' : 'JPEG', M, Y, 30, 15); } catch (e) { } }
    doc.setFontSize(20); doc.setFont(undefined as any, 'bold'); doc.setTextColor(34, 197, 94);
    doc.text('REÇU DE PAIEMENT', W / 2, Y + 25, { align: 'center' });
    doc.setFontSize(10); doc.setFont(undefined as any, 'normal'); doc.setTextColor(100, 100, 100);
    doc.text(`N° ${receiptNumber}`, W / 2, Y + 32, { align: 'center' });
    doc.setFontSize(9); doc.text(`Date : ${new Date(paymentDate).toLocaleDateString('fr-FR')}`, W - M, Y + 5, { align: 'right' });
    Y = Y + 50;
    doc.setDrawColor(34, 197, 94); doc.setLineWidth(1); doc.rect(M, Y, W - 2 * M, 15);
    doc.setFontSize(16); doc.setFont(undefined as any, 'bold'); doc.setTextColor(34, 197, 94);
    doc.text('ACQUITTÉ', W / 2, Y + 10, { align: 'center' });
    Y += 25;
    doc.setFontSize(11); doc.setFont(undefined as any, 'normal'); doc.setTextColor(0, 0, 0);
    doc.text('Je soussigné(e), représentant de la société :', M, Y); Y += 6;
    doc.setFont(undefined as any, 'bold'); doc.text(inv.companyName || '', M, Y); Y += 5;
    doc.setFont(undefined as any, 'normal'); doc.setFontSize(9);
    if (inv.companyAddress) { doc.text(inv.companyAddress, M, Y); Y += 4; }
    if (inv.companySiret) { doc.text(`SIRET : ${inv.companySiret}`, M, Y); Y += 4; }
    Y += 8; doc.setFontSize(11); doc.text('Reconnais avoir reçu de :', M, Y); Y += 6;
    doc.setFont(undefined as any, 'bold'); doc.text(inv.clientName || '', M, Y); Y += 5;
    doc.setFont(undefined as any, 'normal'); doc.setFontSize(9);
    if (inv.clientAddress) { doc.text(inv.clientAddress.substring(0, 80), M, Y); Y += 4; }
    Y += 8; doc.setFontSize(11); doc.text('La somme de :', M, Y); Y += 6;
    doc.setFontSize(16); doc.setFont(undefined as any, 'bold'); doc.setTextColor(37, 99, 235);
    doc.text(`${paymentAmount.toFixed(2)} ${SYM}`, M, Y);
    Y += 10; doc.setFontSize(11); doc.setTextColor(0, 0, 0); doc.setFont(undefined as any, 'normal');
    doc.text('En règlement de la facture :', M, Y); Y += 6;
    doc.setFont(undefined as any, 'bold'); doc.text(`N° ${inv.invoiceNumber}`, M, Y); Y += 5;
    doc.setFont(undefined as any, 'normal'); doc.setFontSize(9);
    doc.text(`D'un montant total de ${inv.total.toFixed(2)} ${SYM} TTC`, M, Y);
    Y += 10; doc.setFontSize(11); doc.text('Moyen de paiement :', M, Y); Y += 6;
    doc.setFont(undefined as any, 'bold'); doc.text(paymentMethod, M, Y);
    if (paymentRef) { Y += 6; doc.setFont(undefined as any, 'normal'); doc.setFontSize(10); doc.text(`Référence : ${paymentRef}`, M, Y); }
    Y += 15; doc.setFontSize(9); doc.setFont(undefined as any, 'normal'); doc.setTextColor(100, 100, 100);
    doc.text(`Fait à ${inv.companyAddress?.split(',').pop()?.trim() || '...'}, le ${new Date(paymentDate).toLocaleDateString('fr-FR')}`, M, Y);
    Y += 10; doc.text('Signature et cachet :', M, Y); Y += 3;
    doc.setDrawColor(150); doc.setLineWidth(0.3); doc.rect(M, Y, 60, 20);
    doc.setFontSize(7); doc.setTextColor(150, 150, 150);
    doc.text('Ce reçu atteste du paiement effectif de la somme indiquée.', W / 2, 285, { align: 'center' });
    try {
      const pdfBlob = doc.output('blob');
      const file = new File([pdfBlob], `receipts/${receiptNumber}.pdf`, { type: 'application/pdf' });
      const uploadedFile = await storage.createFile(BUCKET_ID, ID.unique(), file);
      const receiptData = {
        teamId: currentTeamId, userId: user.$id, receiptNumber, invoiceId: inv.$id,
        invoiceNumber: inv.invoiceNumber, clientName: inv.clientName || 'Client',
        amount: paymentAmount.toFixed(2), paymentDate, paymentMethod,
        paymentReference: paymentRef, fileId: uploadedFile.$id, status: 'active',
      };
      await databases.createDocument(DATABASE_ID, 'receipts', ID.unique(), receiptData, getEventPerms());
      toast.success(`Reçu ${receiptNumber} généré et stocké !`);
    } catch (e: any) { console.error('Erreur stockage reçu:', e); toast.error(`Erreur : ${e.message}`); }
  };

  const generateDebitReceiptPDF = async (creditInv: Invoice, payment?: Payment) => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const W = 210, M = 20;
    const debitAmount = payment ? payment.amount : (creditInv.total || 0);
    const debitDate = payment ? payment.date : (creditInv.paidAt || creditInv.issueDate || new Date().toISOString().split('T')[0]);
    const debitMethod = payment ? payment.method : 'Avoir';
    const debitRef = payment?.reference || '';
    const originalInvoiceNumber = creditInv.notes?.split('\n').find(l => l.startsWith("Référence facture d'origine : "))?.replace("Référence facture d'origine : ", '') || 'N/A';
    const debitReason = creditInv.notes?.split('\n').find(l => l.startsWith('MOTIF AVOIR : '))?.replace('MOTIF AVOIR : ', '') || 'Non spécifié';
    const debitNumber = await generateNextNumber('DEC', 'receipts', 'receiptNumber');
    let logoB64: string | null = null;
    if (creditInv.logoFileId) {
      try {
        const u = getFilePreviewUrl('company_logos', creditInv.logoFileId);
        const b = await fetch(u).then(r => r.blob());
        logoB64 = await new Promise<string>((rs, rj) => { const rd = new FileReader(); rd.onloadend = () => rs(rd.result as string); rd.onerror = rj; rd.readAsDataURL(b); });
      } catch (e) { }
    }
    let Y = M;
    if (logoB64) { try { doc.addImage(logoB64, logoB64.includes('image/png') ? 'PNG' : 'JPEG', M, Y, 30, 15); } catch (e) { } }
    doc.setFontSize(20); doc.setFont(undefined as any, 'bold'); doc.setTextColor(220, 38, 38);
    doc.text('REÇU DE DÉCAISSEMENT', W / 2, Y + 25, { align: 'center' });
    doc.setFontSize(10); doc.setFont(undefined as any, 'normal'); doc.setTextColor(100, 100, 100);
    doc.text(`N° ${debitNumber}`, W / 2, Y + 32, { align: 'center' });
    doc.setFontSize(9); doc.text(`Date : ${new Date(debitDate).toLocaleDateString('fr-FR')}`, W - M, Y + 5, { align: 'right' });
    Y = Y + 50;
    doc.setDrawColor(220, 38, 38); doc.setLineWidth(1); doc.rect(M, Y, W - 2 * M, 15);
    doc.setFontSize(16); doc.setFont(undefined as any, 'bold'); doc.setTextColor(220, 38, 38);
    doc.text('REMBOURSEMENT', W / 2, Y + 10, { align: 'center' });
    Y += 25;
    doc.setFontSize(11); doc.setFont(undefined as any, 'normal'); doc.setTextColor(0, 0, 0);
    doc.text('Je soussigné(e), représentant de la société :', M, Y); Y += 6;
    doc.setFont(undefined as any, 'bold'); doc.text(creditInv.companyName || '', M, Y); Y += 5;
    doc.setFont(undefined as any, 'normal'); doc.setFontSize(9);
    if (creditInv.companyAddress) { doc.text(creditInv.companyAddress, M, Y); Y += 4; }
    if (creditInv.companySiret) { doc.text(`SIRET : ${creditInv.companySiret}`, M, Y); Y += 4; }
    Y += 8; doc.setFontSize(11); doc.text('Reconnais avoir remboursé à :', M, Y); Y += 6;
    doc.setFont(undefined as any, 'bold'); doc.text(creditInv.clientName || '', M, Y); Y += 5;
    doc.setFont(undefined as any, 'normal'); doc.setFontSize(9);
    if (creditInv.clientAddress) { doc.text(creditInv.clientAddress.substring(0, 80), M, Y); Y += 4; }
    Y += 8; doc.setFontSize(11); doc.text('La somme de :', M, Y); Y += 6;
    doc.setFontSize(16); doc.setFont(undefined as any, 'bold'); doc.setTextColor(220, 38, 38);
    doc.text(`${debitAmount.toFixed(2)} ${SYM}`, M, Y);
    Y += 10; doc.setFontSize(11); doc.setTextColor(0, 0, 0); doc.setFont(undefined as any, 'normal');
    doc.text("Au titre de la facture d'avoir :", M, Y); Y += 6;
    doc.setFont(undefined as any, 'bold'); doc.text(`N° ${creditInv.invoiceNumber}`, M, Y); Y += 5;
    doc.setFont(undefined as any, 'normal'); doc.setFontSize(9);
    doc.text(`D'un montant total de ${creditInv.total.toFixed(2)} ${SYM} TTC`, M, Y);
    Y += 6; doc.text(`Référence facture d'origine : ${originalInvoiceNumber}`, M, Y);
    Y += 6; doc.text(`Motif : ${debitReason}`, M, Y);
    Y += 6; doc.text(`Moyen de remboursement : ${debitMethod}`, M, Y);
    if (debitRef) { Y += 6; doc.text(`Référence : ${debitRef}`, M, Y); }
    Y += 10; doc.setFontSize(9); doc.setFont(undefined as any, 'normal'); doc.setTextColor(100, 100, 100);
    doc.text(`Fait à ${creditInv.companyAddress?.split(',').pop()?.trim() || '...'}, le ${new Date(debitDate).toLocaleDateString('fr-FR')}`, M, Y);
    Y += 10; doc.text('Signature et cachet :', M, Y); Y += 3;
    doc.setDrawColor(150); doc.setLineWidth(0.3); doc.rect(M, Y, 60, 20);
    doc.setFontSize(7); doc.setTextColor(150, 150, 150);
    doc.text('Ce reçu atteste du remboursement effectif de la somme indiquée.', W / 2, 285, { align: 'center' });
    let fileId = '';
    try {
      if (!BUCKET_ID) throw new Error('BUCKET_ID non défini');
      const pdfBlob = doc.output('blob');
      const file = new File([pdfBlob], `receipts/DEC_${debitNumber}.pdf`, { type: 'application/pdf' });
      const uploadedFile = await storage.createFile(BUCKET_ID, ID.unique(), file);
      fileId = uploadedFile.$id;
    } catch (e: any) { console.error('⚠️ Upload Storage du reçu DEC impossible :', e?.message || e); }
    const debitData: any = {
      teamId: currentTeamId, userId: user.$id, receiptNumber: debitNumber,
      invoiceId: creditInv.$id, invoiceNumber: creditInv.invoiceNumber,
      clientName: creditInv.clientName || 'Client',
      amount: debitAmount.toFixed(2), paymentDate: debitDate,
      paymentMethod: debitMethod, paymentReference: debitRef || originalInvoiceNumber,
      status: 'active',
    };
    if (fileId) debitData.fileId = fileId;
    try {
      await databases.createDocument(DATABASE_ID, 'receipts', ID.unique(), debitData, getEventPerms());
    } catch (e: any) {
      if (fileId && /fileId/i.test(e?.message || '')) {
        try {
          const fallbackData = { ...debitData };
          delete fallbackData.fileId;
          await databases.createDocument(DATABASE_ID, 'receipts', ID.unique(), fallbackData, getEventPerms());
          return;
        } catch (e2: any) { console.error('❌ Second échec:', e2); return; }
      }
      console.error('❌ Erreur enregistrement reçu décaissement:', e);
    }
  };

  const handleTogglePaid = async (invoice: Invoice) => {
    if (invoice.teamId !== currentTeamId) { toast.error('⚠️ Accès refusé'); return; }
    try {
      const totalAlreadyPaid = getEffectivePaidAmount(invoice);
      const remainingAmount = Math.max(0, (invoice.total || 0) - totalAlreadyPaid);
      if (remainingAmount <= 0) {
        toast.warning('Facture déjà entièrement payée', { description: `Total : ${fm(invoice.total || 0)} • Déjà payé : ${fm(totalAlreadyPaid)}` });
        return;
      }
      let existingPayments: Payment[] = [];
      try {
        if (typeof invoice.payments === 'string' && invoice.payments.trim()) existingPayments = JSON.parse(invoice.payments);
        else if (Array.isArray(invoice.payments)) existingPayments = invoice.payments;
      } catch (e) { existingPayments = []; }
      const updatedPayments = [...existingPayments];
      const lastPayment: Payment = {
        id: `quick-${Date.now()}`, amount: remainingAmount, date: new Date().toISOString().split('T')[0],
        method: invoice.paymentMethods || 'Autre', reference: 'Paiement rapide', notes: 'Marqué comme payé (bouton rapide)',
      };
      updatedPayments.push(lastPayment);
      await databases.updateDocument(DATABASE_ID, 'invoices', invoice.$id, {
        status: 'paid', paidAt: new Date().toISOString(), receivedAt: new Date().toISOString(),
        balance: 0, payments: JSON.stringify(updatedPayments),
      });
      await loadInvoices(true);
      setLastPaymentData({ invoice, payment: lastPayment });
      setShowReceiptChoiceModal(true);
    } catch (e: any) { toast.error(`Erreur: ${e.message}`); }
  };

  const handleConfirmPaid = async () => {
    if (!invoiceToConfirm) return;
    setShowConfirmPaidModal(false);
    await handleTogglePaid(invoiceToConfirm);
    setInvoiceToConfirm(null);
  };

  const handleOpenPaymentModal = (invoice: Invoice) => {
    const paidAmount = getEffectivePaidAmount(invoice);
    const remaining = Math.max(0, (invoice.total || 0) - paidAmount);
    setSelectedInvoice(invoice);
    setPaymentForm({ amount: remaining > 0 ? remaining.toFixed(2) : '', date: new Date().toISOString().split('T')[0], method: 'Virement bancaire', reference: '', notes: '' });
    setShowPaymentModal(true);
  };

  const handleSavePayment = async () => {
    if (!selectedInvoice || !currentTeamId) return;
    const amount = parseFloat(paymentForm.amount);
    const paidAmount = getEffectivePaidAmount(selectedInvoice);
    const remaining = Math.max(0, (selectedInvoice.total || 0) - paidAmount);
    if (!amount || amount <= 0) { toast.error('Veuillez saisir un montant valide supérieur à 0'); return; }
    if (amount > remaining) { toast.warning('Montant invalide', { description: `Le montant saisi (${fm(amount)}) est supérieur au reste à payer (${fm(remaining)}).` }); return; }
    const newPayment: Payment = { id: Date.now().toString(), amount, date: paymentForm.date, method: paymentForm.method, reference: paymentForm.reference || 'Paiement', notes: paymentForm.notes || '' };
    setShowPaymentModal(false);
    setPaymentToConfirm({ invoice: selectedInvoice, payment: newPayment });
    setShowConfirmPaymentModal(true);
  };

  const handleConfirmPayment = async () => {
    if (!paymentToConfirm || !currentTeamId) return;
    const { invoice, payment } = paymentToConfirm;
    setSavingPayment(true);
    try {
      const freshDoc = await databases.getDocument(DATABASE_ID, 'invoices', invoice.$id) as unknown as Invoice;
      const freshPaid = getEffectivePaidAmount(freshDoc);
      const freshAllocated = getAllocatedCreditsForInvoice(freshDoc.$id);
      const freshRemaining = round2(Math.max(0, (freshDoc.total || 0) - freshPaid - freshAllocated));
      if (payment.amount > freshRemaining + 0.01) {
        toast.warning(`Paiement refusé : solde actuel ${fm(freshRemaining)}`, { description: 'Un autre règlement a peut-être été enregistré entre-temps.' });
        setShowConfirmPaymentModal(false);
        setPaymentToConfirm(null);
        await loadInvoices(true);
        return;
      }
      let existingPayments: Payment[] = [];
      try {
        if (typeof freshDoc.payments === 'string' && freshDoc.payments.trim()) existingPayments = JSON.parse(freshDoc.payments);
        else if (Array.isArray(freshDoc.payments)) existingPayments = freshDoc.payments;
      } catch (e) { existingPayments = []; }
      const updatedPayments = [...existingPayments, payment];
      const totalPaid = updatedPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
      let newBalance = Math.max(0, (freshDoc.total || 0) - totalPaid);
      if ((freshDoc.type === 'standard' || freshDoc.type === 'balance') && freshDoc.originalInvoiceId) {
        const advanceInvoice = invoices.find(i => i && i.$id === freshDoc.originalInvoiceId && i.type === 'advance');
        if (advanceInvoice && advanceInvoice.status === 'paid') {
          newBalance = Math.max(0, newBalance - (advanceInvoice.total || 0));
        }
      }
      const newStatus = newBalance <= 0 ? 'paid' : 'partial';
      await databases.updateDocument(DATABASE_ID, 'invoices', freshDoc.$id, {
        payments: JSON.stringify(updatedPayments), balance: newBalance, status: newStatus,
        paidAt: newBalance <= 0 ? new Date().toISOString() : freshDoc.paidAt,
        receivedAt: newBalance <= 0 ? new Date().toISOString() : freshDoc.receivedAt,
      });
      try {
        await databases.createDocument(DATABASE_ID, 'invoice_payments', ID.unique(), {
          teamId: currentTeamId,
          data: writeJson({
            invoiceId: freshDoc.$id, invoiceNumber: freshDoc.invoiceNumber,
            amount: payment.amount, paymentDate: payment.date, method: payment.method,
            reference: payment.reference || '', status: 'confirmed', createdBy: user.$id,
            createdAt: new Date().toISOString(), tvaExigibleAt: payment.date,
          }),
        }, getEventPerms());
      } catch (eventError) {
        console.error('❌ Événement comptable non enregistré:', eventError);
        setFailedEvents(prev => [...prev, {
          type: 'payment', invoiceId: freshDoc.$id,
          data: { invoiceId: freshDoc.$id, invoiceNumber: freshDoc.invoiceNumber, amount: payment.amount, paymentDate: payment.date, method: payment.method, reference: payment.reference || '' },
        }]);
      }
      setShowConfirmPaymentModal(false);
      setPaymentToConfirm(null);
      await loadInvoices(true);
      setLastPaymentData({ invoice: freshDoc, payment });
      setShowReceiptChoiceModal(true);
    } catch (e: any) { toast.error(`Erreur: ${e.message}`); } finally { setSavingPayment(false); }
  };

  const handleRetryFailedEvents = async () => {
    if (failedEvents.length === 0) { toast.info('Aucun événement en attente.'); return; }
    let successCount = 0; let failCount = 0;
    const successIndexes = new Set<number>();
    for (let i = 0; i < failedEvents.length; i++) {
      const event = failedEvents[i];
      try {
        await databases.createDocument(DATABASE_ID, 'accounting_events', ID.unique(), {
          teamId: currentTeamId,
          data: writeJson({ ...event.data, status: 'confirmed', createdBy: user?.$id, createdAt: new Date().toISOString(), retryAt: new Date().toISOString(), retryCount: (event.data?.retryCount || 0) + 1 }),
        }, getEventPerms());
        successIndexes.add(i); successCount++;
      } catch (e) { console.error(`❌ Retry échoué pour index ${i}:`, e); failCount++; }
    }
    setFailedEvents(prev => prev.filter((_, idx) => !successIndexes.has(idx)));
    if (failCount === 0) toast.success(`${successCount} événement(s) régularisé(s)`);
    else toast.warning(`${successCount} régularisé(s), ${failCount} toujours en échec`);
  };

  const handleArchive = async (id: string, num: string) => {
    try {
      const doc = await databases.getDocument(DATABASE_ID, 'invoices', id) as unknown as Invoice;
      if (doc.teamId !== currentTeamId) { toast.error('⚠️ Accès refusé'); return; }
      if (doc.status === 'draft') {
        if (!confirm(`Annuler le brouillon ${num} ?`)) return;
        const reason = prompt("Motif de l'annulation (obligatoire) :");
        if (!reason || !reason.trim()) { toast.info('Annulation abandonnée : motif requis.'); return; }
        await databases.updateDocument(DATABASE_ID, 'invoices', id, { status: 'cancelled' });
        await saveMetadata(id, { archiveData: { cancelReason: reason.trim(), cancelledAt: new Date().toISOString(), cancelledBy: user.$id } });
      } else {
        const reason = prompt(`Archivage administratif de ${num} (motif obligatoire) :\n⚠️ Une facture émise ne peut pas être annulée : utilisez un avoir référencé pour toute correction.`);
        if (!reason || !reason.trim()) { toast.info('Archivage abandonné : motif requis.'); return; }
        try {
          await databases.createDocument(DATABASE_ID, 'accounting_events', ID.unique(), {
            teamId: currentTeamId,
            data: writeJson({ type: 'invoice_archived', documentType: 'invoice', documentId: id, documentNumber: num, eventDate: new Date().toISOString(), reason: reason.trim(), createdBy: user.$id }),
          }, getEventPerms());
        } catch (e) { console.error('⚠️ Événement archivage non tracé:', e); }
        await saveMetadata(id, { archiveData: { archived: true, archivedAt: new Date().toISOString(), archivedBy: user.$id, archiveReason: reason.trim() } });
      }
      loadInvoices();
    } catch (e: any) { toast.error(`Erreur : ${e.message}`); }
  };

  const handleUnarchive = async (id: string, num: string) => {
    try {
      const doc = await databases.getDocument(DATABASE_ID, 'invoices', id) as unknown as Invoice;
      if (doc.teamId !== currentTeamId) { toast.error('⚠️ Accès refusé'); return; }
      const meta = getArchiveData(doc);
      if (meta.archived === true) {
        await saveMetadata(id, { archiveData: {} });
      } else if (doc.status === 'cancelled') {
        await databases.updateDocument(DATABASE_ID, 'invoices', id, { status: 'draft' });
        await saveMetadata(id, { archiveData: {} });
      }
      loadInvoices();
      setViewMode('active');
      toast.success(`Facture ${num} restaurée`);
    } catch (e: any) { toast.error(`Erreur : ${e.message}`); }
  };

  const handleOpenAdvanceModal = (invoice: Invoice) => {
    if (invoice.deposit <= 0) { toast.warning("Cette facture n'a pas d'acompte défini."); return; }
    const percent = invoice.total > 0 ? ((invoice.deposit / invoice.total) * 100).toFixed(2) : '0.00';
    setAdvanceForm({ percent, invoiceId: invoice.$id });
    setShowAdvanceModal(true);
  };

  const handleGenerateAdvanceInvoice = async () => {
    const invoice = invoices.find(i => i && i.$id === advanceForm.invoiceId);
    if (!invoice || !currentTeamId) return;
    setSavingAdvance(true);
    try {
      const advanceAmount = invoice.deposit;
      const realPercent = invoice.total > 0 ? ((advanceAmount / invoice.total) * 100).toFixed(2) : '0.00';
      const advanceNumber = await generateNextNumber('ACO', 'invoices', 'invoiceNumber');
      const ratio = invoice.total > 0 ? (advanceAmount / invoice.total) : 0;
      let invoiceVatRate = 20;
      if (invoice.vatRate !== null && invoice.vatRate !== undefined && invoice.vatRate !== '') {
        const parsed = parseInt(String(invoice.vatRate), 10);
        if (!isNaN(parsed) && parsed >= 0 && parsed <= 100) invoiceVatRate = parsed;
      }
      if (invoiceVatRate === 20) {
        try {
          const items = JSON.parse(invoice.items || '[]');
          if (Array.isArray(items) && items.length > 0) {
            const rateCounts = new Map<number, number>();
            items.forEach((item: any) => {
              const rate = parseInt(String(item.tvaRate || 0), 10);
              if (!isNaN(rate) && rate >= 0 && rate <= 100) rateCounts.set(rate, (rateCounts.get(rate) || 0) + 1);
            });
            if (rateCounts.size > 0) {
              let maxCount = 0;
              rateCounts.forEach((count, rate) => { if (count > maxCount) { maxCount = count; invoiceVatRate = rate; } });
            }
          }
        } catch { }
      }
      if (typeof invoiceVatRate !== 'number' || !Number.isInteger(invoiceVatRate) || invoiceVatRate < 0 || invoiceVatRate > 100) invoiceVatRate = 20;
      let originalItems: InvoiceItem[] = [];
      try { originalItems = JSON.parse(invoice.items || '[]'); } catch { originalItems = []; }
      let advanceHT = 0; let advanceTVA = 0;
      const advanceItems: InvoiceItem[] = originalItems.map((item, idx) => {
        const itemVatRate = toInt(item.tvaRate, invoiceVatRate);
        const itemTotalTTC = item.quantity * item.unitPrice * (1 - (item.discount || 0) / 100) * (1 + itemVatRate / 100);
        const itemAdvanceTTC = round2(itemTotalTTC * ratio);
        const itemAdvanceHT = round2(itemAdvanceTTC / (1 + itemVatRate / 100));
        const itemAdvanceTVA = round2(itemAdvanceTTC - itemAdvanceHT);
        advanceHT += itemAdvanceHT; advanceTVA += itemAdvanceTVA;
        return {
          id: `advance-${Date.now()}-${idx}`, reference: item.reference || 'ACOMPTE',
          description: `Acompte ${realPercent}% - ${item.description}`, quantity: 1, unit: 'forfait',
          unitPrice: itemAdvanceHT, tvaRate: itemVatRate, total: itemAdvanceHT, discount: 0,
        };
      });
      if (advanceItems.length > 0) {
        const ecart = round2(advanceAmount - round2(advanceHT + advanceTVA));
        if (ecart !== 0) {
          const last = advanceItems[advanceItems.length - 1];
          last.unitPrice = round2(last.unitPrice + ecart);
          last.total = last.unitPrice;
          advanceHT += ecart;
        }
      }
      if (advanceItems.length === 0) {
        advanceHT = Math.round((invoice.subtotal || 0) * ratio * 100) / 100;
        advanceTVA = Math.round((invoice.tax || 0) * ratio * 100) / 100;
      }
      const advanceInvoice = {
        teamId: currentTeamId, userId: user.$id, invoiceNumber: advanceNumber, type: 'advance',
        originalQuoteId: invoice.quoteId || '', originalInvoiceId: invoice.$id, advancePercent: realPercent,
        currencyCode: currency,
        clientToken: Math.random().toString(36).substring(2, 15), status: 'draft',
        issueDate: new Date().toISOString().split('T')[0],
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        subtotal: advanceHT, vatRate: invoiceVatRate, vatAmount: advanceTVA, tax: advanceTVA,
        discount: 0, total: advanceAmount, deposit: 0, balance: advanceAmount,
        companyName: invoice.companyName, companyLegalForm: invoice.companyLegalForm,
        companyAddress: invoice.companyAddress, companySiret: invoice.companySiret,
        companyRcs: invoice.companyRcs, companyTva: invoice.companyTva,
        companyPhone: invoice.companyPhone, companyEmail: invoice.companyEmail,
        logoFileId: invoice.logoFileId, clientName: invoice.clientName,
        clientAddress: invoice.clientAddress, clientBillingAddress: invoice.clientBillingAddress,
        clientEmail: invoice.clientEmail, clientPhone: invoice.clientPhone,
        items: JSON.stringify(advanceItems.length > 0 ? advanceItems : [{
          id: `advance-${Date.now()}`, reference: 'ACOMPTE',
          description: `Acompte de ${realPercent}% sur la facture ${invoice.invoiceNumber}`, quantity: 1, unit: 'forfait',
          unitPrice: advanceHT, tvaRate: invoiceVatRate, total: advanceHT, discount: 0,
        }]),
        paymentMethods: invoice.paymentMethods, paymentConditions: invoice.paymentConditions,
        executionDelay: invoice.executionDelay,
        specialConditions: `Facture d'acompte - Référence facture d'origine : ${invoice.invoiceNumber}`,
        notes: `Acompte de ${realPercent}% sur la facture ${invoice.invoiceNumber}`,
      };
      await createInvoiceWithRetry(advanceInvoice, getEventPerms());
      setShowAdvanceModal(false);
      await loadInvoices(true);
      toast.success(`Facture d'acompte ${advanceNumber} créée !`, { description: `Montant : ${fm(advanceAmount)}` });
    } catch (e: any) { toast.error(`Erreur : ${e.message}`); } finally { setSavingAdvance(false); }
  };

  const handleGenerateFinalFromAdvance = async (advanceInvoice: Invoice) => {
    if (!currentTeamId || !advanceInvoice.originalQuoteId) { toast.error("Impossible de retrouver le devis d'origine."); return; }
    if (!confirm(`Générer la facture finale pour ${advanceInvoice.clientName} ?`)) return;
    setGeneratingFinal(true);
    try {
      const quoteDoc = await verifyDocumentAccess('quotes', advanceInvoice.originalQuoteId, currentTeamId!);
      const quote = quoteDoc as any;
      const finalNumber = await generateNextNumber('FAC', 'invoices', 'invoiceNumber');
      const advanceAmount = advanceInvoice.total || 0;
      const totalAmount = quote.total || 0;
      const remainingAmount = Math.max(0, totalAmount - advanceAmount);
      const quoteVatRate = toInt(quote.vatRate, 20);
      const finalInvoice = {
        teamId: currentTeamId, userId: user.$id, invoiceNumber: finalNumber, type: 'standard',
        originalQuoteId: advanceInvoice.originalQuoteId, originalInvoiceId: advanceInvoice.$id,
        currencyCode: currency,
        clientToken: Math.random().toString(36).substring(2, 15), status: 'draft',
        issueDate: new Date().toISOString().split('T')[0],
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        subtotal: quote.subtotal || 0, vatRate: quoteVatRate, vatAmount: quote.tax || 0,
        tax: quote.tax || 0, discount: quote.discount || 0, total: totalAmount,
        deposit: advanceAmount, balance: remainingAmount,
        companyName: quote.companyName, companyLegalForm: quote.companyLegalForm,
        companyAddress: quote.companyAddress, companySiret: quote.companySiret,
        companyRcs: quote.companyRcs, companyTva: quote.companyTva,
        companyPhone: quote.companyPhone, companyEmail: quote.companyEmail,
        logoFileId: quote.logoFileId, clientName: quote.clientName,
        clientAddress: quote.clientAddress, clientBillingAddress: quote.clientBillingAddress,
        clientEmail: quote.clientEmail, clientPhone: quote.clientPhone,
        items: quote.items, paymentMethods: quote.paymentMethods,
        paymentConditions: quote.paymentConditions, executionDelay: quote.executionDelay,
        specialConditions: quote.specialConditions,
        notes: `Facture finale - Acompte de ${advanceAmount.toFixed(2)} ${SYM} déjà versé via ${advanceInvoice.invoiceNumber}`,
      };
      const createdDoc = await createInvoiceWithRetry(finalInvoice, getEventPerms());
      await saveMetadata(createdDoc.$id, {
        reconciliationData: {
          advanceInvoiceId: advanceInvoice.$id, advanceNumber: advanceInvoice.invoiceNumber,
          advanceAmountTTC: advanceAmount, advanceAmountHT: advanceInvoice.subtotal || 0,
          advanceAmountTVA: advanceInvoice.tax || 0, jobTotalHT: quote.subtotal || 0,
          jobTotalTVA: quote.tax || 0, reconciliation: 'recap',
        },
      });
      await databases.updateDocument(DATABASE_ID, 'quotes', advanceInvoice.originalQuoteId, { status: 'Facturé' });
      await loadInvoices(true);
      toast.success(`Facture finale ${finalNumber} créée !`, { description: `Total : ${fm(totalAmount)} • Acompte : -${fm(advanceAmount)} • Net : ${fm(remainingAmount)}` });
    } catch (e: any) { toast.error(`Erreur : ${e.message}`); } finally { setGeneratingFinal(false); }
  };

  const openCreditModal = (inv: Invoice) => {
    const existingCredits = getTotalCreditsForInvoice(inv.$id);
    const maxCreditAllowed = Math.max(0, (inv.total || 0) - existingCredits);
    if (maxCreditAllowed <= 0) {
      toast.warning('Cette facture a déjà été entièrement couverte par des avoirs.');
      return;
    }
    setCreditInvoice(inv);
    setCreditForm(existingCredits > 0
      ? { type: 'partial', amount: maxCreditAllowed.toFixed(2), reason: '', refundChoice: 'allocate' }
      : { type: 'total', amount: inv.total.toFixed(2), reason: '', refundChoice: 'allocate' });
    setShowCreditModal(true);
  };

  const buildCreditLines = (original: Invoice, creditTTC: number) => {
    let items: InvoiceItem[] = [];
    try { items = JSON.parse(original.items || '[]'); } catch { items = []; }
    const invTTC = original.total || 0;
    const originalVatRate = toInt(original.vatRate, 20);
    const toBreakdown = (lines: { tvaRate: number; ht: number; tva: number }[]) => {
      const map = new Map<number, { rate: number; baseHT: number; taxAmount: number }>();
      lines.forEach(l => {
        const rate = toInt(l.tvaRate, 0);
        const cur = map.get(rate) || { rate, baseHT: 0, taxAmount: 0 };
        cur.baseHT = round2(cur.baseHT + l.ht);
        cur.taxAmount = round2(cur.taxAmount + l.tva);
        map.set(rate, cur);
      });
      return Array.from(map.values());
    };
    if (round2(creditTTC) === round2(invTTC)) {
      const lines = items.map(i => {
        const rate = toInt(i.tvaRate, 0);
        const ht = round2(i.quantity * i.unitPrice * (1 - (i.discount || 0) / 100));
        return { tvaRate: rate, ht, tva: round2(ht * rate / 100) };
      });
      return { items, subtotal: original.subtotal || 0, tax: original.tax || 0, breakdown: toBreakdown(lines) };
    }
    if (items.length === 0 || invTTC <= 0) {
      const ratio = invTTC > 0 ? creditTTC / invTTC : 0;
      const subtotal = round2((original.subtotal || 0) * ratio);
      const tax = round2(creditTTC - subtotal);
      return { items: [], subtotal, tax, breakdown: toBreakdown([{ tvaRate: originalVatRate, ht: subtotal, tva: tax }]) };
    }
    const linesTTC = items.map(i => {
      const ht = i.quantity * i.unitPrice * (1 - (i.discount || 0) / 100);
      return ht * (1 + toInt(i.tvaRate, 0) / 100);
    });
    const sumTTC = linesTTC.reduce((a, b) => a + b, 0);
    let restant = round2(creditTTC);
    const creditLines: { tvaRate: number; ht: number; tva: number }[] = [];
    const creditItems: InvoiceItem[] = items.map((i, idx) => {
      const lineTTC = idx === items.length - 1 ? restant : round2(creditTTC * (linesTTC[idx] / sumTTC));
      restant = round2(restant - lineTTC);
      const rate = toInt(i.tvaRate, 0);
      const ht = round2(lineTTC / (1 + rate / 100));
      const tva = round2(lineTTC - ht);
      creditLines.push({ tvaRate: rate, ht, tva });
      return { ...i, discount: 0, quantity: 1, unitPrice: ht, total: ht, tvaRate: rate };
    });
    let subtotal = round2(creditLines.reduce((s, l) => s + l.ht, 0));
    let tax = round2(creditLines.reduce((s, l) => s + l.tva, 0));
    const ecart = round2(creditTTC - round2(subtotal + tax));
    if (ecart !== 0 && creditItems.length > 0) {
      const last = creditItems.length - 1;
      const lastTTC = round2(creditLines[last].ht + creditLines[last].tva);
      const newHt = round2(creditLines[last].ht + ecart);
      creditLines[last] = { ...creditLines[last], ht: newHt, tva: round2(lastTTC - newHt) };
      creditItems[last] = { ...creditItems[last], unitPrice: newHt, total: newHt };
      subtotal = round2(creditLines.reduce((s, l) => s + l.ht, 0));
      tax = round2(creditLines.reduce((s, l) => s + l.tva, 0));
    }
    return { items: creditItems, subtotal, tax, breakdown: toBreakdown(creditLines) };
  };

  const handleGenerateCreditNote = async () => {
    if (!creditInvoice || !currentTeamId) return;
    const creditAmount = parseFloat(creditForm.amount);
    const existingCreditsTotal = getTotalCreditsForInvoice(creditInvoice.$id);
    const maxCreditAllowed = Math.max(0, (creditInvoice.total || 0) - existingCreditsTotal);
    if (maxCreditAllowed <= 0) { toast.warning('Cette facture est déjà entièrement couverte par des avoirs.'); return; }
    if (creditForm.type === 'total' && existingCreditsTotal > 0) { toast.warning(`Cette facture a déjà ${fm(existingCreditsTotal)} d'avoirs. Utilisez "Avoir Partiel".`); return; }
    if (creditForm.type === 'partial' && (isNaN(creditAmount) || creditAmount <= 0 || creditAmount > maxCreditAllowed)) { toast.warning(`Montant invalide (max : ${fm(maxCreditAllowed)})`); return; }
    if (!creditForm.reason.trim()) { toast.error("Veuillez indiquer un motif pour l'avoir (obligatoire légalement)."); return; }
    setSavingCredit(true);
    try {
      const creditIdStr = (typeof crypto !== 'undefined' && (crypto as any).randomUUID)
        ? (crypto as any).randomUUID()
        : `cred-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const deterministicInvoiceId = ID.custom(creditIdStr);
      const invoiceIdStr = creditIdStr;
      const creditNumber = await generateNextNumber('AV', 'invoices', 'invoiceNumber');
      const creditTotal = creditForm.type === 'total' ? (creditInvoice.total || 0) : creditAmount;
      const { items: creditItems, subtotal: creditSubtotal, tax: creditTax, breakdown } = buildCreditLines(creditInvoice, creditTotal);
      let allocatedAmount: number; let toRefund: number; let initialCreditStatus: string;
      if (creditForm.refundChoice === 'refund') {
        allocatedAmount = 0; toRefund = creditTotal; initialCreditStatus = 'to_refund';
      } else {
        const remainingBefore = getNetRemaining(creditInvoice);
        allocatedAmount = round2(Math.min(creditTotal, remainingBefore));
        toRefund = round2(creditTotal - allocatedAmount);
        initialCreditStatus = allocatedAmount >= creditTotal - 0.001 ? 'allocated' : toRefund >= creditTotal - 0.001 ? 'to_refund' : 'partial_refund';
      }
      const metadataCreated = await saveMetadata(invoiceIdStr, {
        creditData: { creditStatus: initialCreditStatus, allocatedAmount, refundedAmount: 0, refundPayments: [], taxBreakdown: breakdown },
      });
      if (!metadataCreated.success) throw new Error("Impossible de créer les métadonnées de l'avoir");
      const creditVatRate = toInt(creditInvoice.vatRate, 20);
      const creditPayload = {
        teamId: currentTeamId, userId: user.$id, invoiceNumber: creditNumber, type: 'credit',
        originalInvoiceId: creditInvoice.$id, originalQuoteId: creditInvoice.quoteId || '',
        currencyCode: currency,
        clientToken: Math.random().toString(36).substring(2, 15), status: 'sent',
        issueDate: new Date().toISOString().split('T')[0], dueDate: new Date().toISOString().split('T')[0],
        subtotal: creditSubtotal, vatRate: creditVatRate, vatAmount: creditTax, tax: creditTax,
        discount: 0, total: creditTotal, deposit: 0, balance: 0,
        companyName: creditInvoice.companyName, companyLegalForm: creditInvoice.companyLegalForm,
        companyAddress: creditInvoice.companyAddress, companySiret: creditInvoice.companySiret,
        companyRcs: creditInvoice.companyRcs, companyTva: creditInvoice.companyTva,
        companyPhone: creditInvoice.companyPhone, companyEmail: creditInvoice.companyEmail,
        logoFileId: creditInvoice.logoFileId, clientName: creditInvoice.clientName,
        clientAddress: creditInvoice.clientAddress, clientBillingAddress: creditInvoice.clientBillingAddress,
        clientEmail: creditInvoice.clientEmail, clientPhone: creditInvoice.clientPhone,
        items: JSON.stringify(creditItems.length ? creditItems : (() => { try { return JSON.parse(creditInvoice.items || '[]'); } catch { return []; } })()),
        paymentMethods: creditInvoice.paymentMethods, paymentConditions: creditInvoice.paymentConditions,
        executionDelay: creditInvoice.executionDelay, specialConditions: creditInvoice.specialConditions,
        notes: `MOTIF AVOIR : ${creditForm.reason}\nRéférence facture d'origine : ${creditInvoice.invoiceNumber}\nDate facture d'origine : ${creditInvoice.issueDate || '-'}`,
      };
      try {
        await databases.createDocument(DATABASE_ID, 'invoices', deterministicInvoiceId, creditPayload, getEventPerms());
      } catch (invoiceError) {
        console.error('Échec création facture, nettoyage métadonnées:', invoiceError);
        try {
          const metaDocs = await databases.listDocuments(DATABASE_ID, 'invoice_metadata', [Query.equal('invoiceId', invoiceIdStr), Query.limit(1)]);
          if (metaDocs.documents.length > 0) await databases.deleteDocument(DATABASE_ID, 'invoice_metadata', metaDocs.documents[0].$id);
        } catch (cleanupError) { console.error('Erreur nettoyage métadonnée:', cleanupError); }
        throw invoiceError;
      }
      setShowCreditModal(false);
      setCreditInvoice(null);
      await loadInvoices(true);
      const remainingOnInvoice = getNetRemaining(creditInvoice);
      toast.success(`Avoir ${creditNumber} émis : ${fm(creditTotal)}`, {
        description: `HT : ${fm(creditSubtotal)} | TVA : ${fm(creditTax)} • Imputé : ${fm(allocatedAmount)} • À rembourser : ${fm(toRefund)} • Solde restant : ${fm(remainingOnInvoice)}`,
        duration: 6000,
      });
    } catch (e: any) { toast.error(`Erreur : ${e.message}`); } finally { setSavingCredit(false); }
  };

  const acquireRefundLock = async (creditInvoiceId: string, userId: string): Promise<'ok' | 'missing' | 'locked'> => {
    try {
      const metadataDocs = await databases.listDocuments(DATABASE_ID, 'invoice_metadata', [
        Query.equal('invoiceId', creditInvoiceId), Query.limit(1),
      ]);
      if (metadataDocs.documents.length === 0) return 'missing';
      const metadataDoc = metadataDocs.documents[0] as any;
      const creditData = JSON.parse(metadataDoc.creditData || '{}');
      if (creditData.refundLock && creditData.refundLock.expiresAt > Date.now()) {
        if (creditData.refundLock.userId !== userId) return 'locked';
      }
      const lockExpiresAt = Date.now() + 30000;
      await databases.updateDocument(DATABASE_ID, 'invoice_metadata', metadataDoc.$id, {
        creditData: JSON.stringify({ ...creditData, refundLock: { userId, expiresAt: lockExpiresAt } }),
      });
      return 'ok';
    } catch (e) { console.error('Erreur acquisition verrou:', e); return 'missing'; }
  };

  const releaseRefundLock = async (creditInvoiceId: string) => {
    try {
      const metadataDocs = await databases.listDocuments(DATABASE_ID, 'invoice_metadata', [
        Query.equal('invoiceId', creditInvoiceId), Query.limit(1),
      ]);
      if (metadataDocs.documents.length === 0) return;
      const metadataDoc = metadataDocs.documents[0] as any;
      const creditData = JSON.parse(metadataDoc.creditData || '{}');
      await databases.updateDocument(DATABASE_ID, 'invoice_metadata', metadataDoc.$id, {
        creditData: JSON.stringify({ ...creditData, refundLock: null }),
      });
    } catch (e) { console.error('Erreur libération verrou:', e); }
  };

  const handleOpenRefundModal = (credit: Invoice) => {
    const refundable = getCreditRefundableAmount(credit);
    if (refundable <= 0) { toast.info('Cet avoir est déjà entièrement traité.'); return; }
    setRefundCredit(credit);
    setRefundForm({ amount: refundable.toFixed(2), date: new Date().toISOString().split('T')[0], method: 'Virement bancaire', reference: '' });
    setShowRefundModal(true);
  };

  const handleRecordRefund = async () => {
    if (!refundCredit || !currentTeamId || !user) return;
    const amount = parseFloat(refundForm.amount);
    if (!amount || amount <= 0) { toast.error('Montant invalide.'); return; }
    setSavingRefund(true);
    try {
      const lockState = await acquireRefundLock(refundCredit.$id, user.$id);
      if (lockState === 'locked') {
        toast.warning('Un autre utilisateur traite cet avoir. Réessayez dans quelques secondes.');
        setSavingRefund(false);
        return;
      }
      try {
        const freshMetadata = await loadMetadataForInvoice(refundCredit.$id);
        const freshCreditData = freshMetadata.creditData;
        const currentVersion = freshMetadata.metadataVersion || 0;
        let freshRefunds: any[] = [];
        try { if (Array.isArray(freshCreditData.refundPayments)) freshRefunds = freshCreditData.refundPayments; } catch { freshRefunds = []; }
        const freshRefunded = round2(freshRefunds.reduce((s, p) => s + (p.amount || 0), 0));
        const freshAllocated = round2(freshCreditData.allocatedAmount || 0);
        const total = refundCredit.total || 0;
        const freshRefundable = round2(Math.max(0, total - freshAllocated - freshRefunded));
        if (amount > freshRefundable + 0.01) {
          toast.warning(`Montant invalide (remboursable : ${fm(freshRefundable)})`);
          await releaseRefundLock(refundCredit.$id);
          setSavingRefund(false);
          await loadInvoices(true);
          return;
        }
        const payment = { id: `refund-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, amount, date: refundForm.date, method: refundForm.method, reference: refundForm.reference || '' };
        const updatedRefunds = [...freshRefunds, payment];
        const refundedAmount = round2(updatedRefunds.reduce((s, p) => s + p.amount, 0));
        const newStatus = refundedAmount >= total - 0.001 ? 'refunded' : (freshAllocated > 0 ? 'partial_refund' : 'to_refund');
        const saveResult = await saveMetadata(refundCredit.$id, {
          creditData: { ...freshCreditData, refundPayments: updatedRefunds, refundedAmount, creditStatus: newStatus, lastRefundAt: new Date().toISOString(), lastRefundBy: user.$id, refundLock: null },
        }, currentVersion);
        if (saveResult.conflict) {
          toast.warning('Conflit de concurrence détecté. Veuillez réessayer.');
          await releaseRefundLock(refundCredit.$id);
          setSavingRefund(false);
          await loadInvoices(true);
          return;
        }
        if (!saveResult.success) throw new Error("Impossible d'enregistrer le remboursement");
        await databases.updateDocument(DATABASE_ID, 'invoices', refundCredit.$id, {
          paidAt: refundedAmount + freshAllocated >= total - 0.01 ? (refundCredit.paidAt || refundForm.date) : refundCredit.paidAt,
        });
        let eventSuccess = false;
        try {
          await databases.createDocument(DATABASE_ID, 'accounting_events', ID.unique(), {
            teamId: currentTeamId,
            data: writeJson({ type: 'credit_refund', documentType: 'credit', documentId: refundCredit.$id, documentNumber: refundCredit.invoiceNumber, amount, eventDate: refundForm.date, method: refundForm.method, reference: refundForm.reference || '', createdBy: user.$id, createdAt: new Date().toISOString() }),
          }, getEventPerms());
          eventSuccess = true;
        } catch (eventError) {
          console.error('❌ Événement comptable non enregistré:', eventError);
          setFailedEvents(prev => [...prev, {
            type: 'credit_refund', invoiceId: refundCredit.$id,
            data: { type: 'credit_refund', documentType: 'credit', documentId: refundCredit.$id, documentNumber: refundCredit.invoiceNumber, amount, eventDate: refundForm.date, method: refundForm.method, reference: refundForm.reference || '' },
          }]);
        }
        const updatedCredit = { ...refundCredit } as Invoice;
        setShowRefundModal(false);
        await loadInvoices(true);
        if (!eventSuccess) {
          toast.warning('Remboursement enregistré mais NON TRACÉ. Utilisez "Réessayer les événements".');
        } else {
          toast.success(`Remboursement de ${fm(amount)} enregistré`);
          if (confirm(`Remboursement de ${fm(amount)} enregistré.\nGénérer le reçu (DEC) ?`)) {
            await generateDebitReceiptPDF(updatedCredit, payment);
          }
        }
      } finally {
        await releaseRefundLock(refundCredit.$id);
      }
    } catch (e: any) {
      toast.error(`Erreur : ${e.message}`);
      await releaseRefundLock(refundCredit.$id);
    } finally {
      setSavingRefund(false);
      setRefundCredit(null);
    }
  };

  const generatePDF = async (inv: Invoice) => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const W = 210, M = 20;
    let items: InvoiceItem[] = [];
    try { items = JSON.parse(inv.items || '[]'); } catch (e) { }
    const pdfSubtotal = inv.subtotal || 0;
    const pdfDiscount = inv.discount || 0;
    const pdfTax = inv.tax || 0;
    const pdfTotal = inv.total || 0;
    const pdfDeposit = inv.deposit || 0;
    const pdfBalance = inv.balance || 0;
    const pdfDiscountAmount = pdfSubtotal * (pdfDiscount / 100);
    const pdfTaxableAmount = pdfSubtotal - pdfDiscountAmount;
    const pdfIsTvaApplicable = !(inv.companyTva || '').includes('non applicable');
    let logoB64: string | null = null;
    if (inv.logoFileId) {
      try {
        const u = getFilePreviewUrl('company_logos', inv.logoFileId);
        const b = await fetch(u).then(r => r.blob());
        logoB64 = await new Promise<string>((rs, rj) => { const rd = new FileReader(); rd.onloadend = () => rs(rd.result as string); rd.onerror = rj; rd.readAsDataURL(b); });
      } catch (e) { }
    }
    let Y = M;
    if (logoB64) { try { doc.addImage(logoB64, logoB64.includes('image/png') ? 'PNG' : 'JPEG', M, Y, 30, 15); } catch (e) { } }
    doc.setFontSize(14); doc.setFont(undefined as any, 'bold');
    doc.text(inv.companyName || '', M, Y + 22);
    doc.setFontSize(8); doc.setFont(undefined as any, 'normal');
    let infoY = Y + 27;
    if (inv.companyAddress) { doc.text(inv.companyAddress, M, infoY); infoY += 4; }
    if (inv.companyPhone) { doc.text(`Tél: ${inv.companyPhone}`, M, infoY); infoY += 4; }
    if (inv.companyEmail) { doc.text(`Email: ${inv.companyEmail}`, M, infoY); infoY += 4; }
    if (inv.companySiret) { doc.text(`SIRET: ${inv.companySiret}`, M, infoY); infoY += 4; }
    if (inv.companyTva && !inv.companyTva.includes('non')) { doc.text(`TVA: ${inv.companyTva}`, M, infoY); infoY += 4; }
    const rX = W - M;
    const pdfType = inv.type || 'standard';
    const isCredit = pdfType === 'credit';
    const pdfTitle = isCredit ? "FACTURE D'AVOIR" : (pdfType === 'advance' ? "FACTURE D'ACOMPTE" : pdfType === 'balance' ? 'FACTURE DE SOLDE' : 'FACTURE');
    doc.setFontSize(16); doc.setFont(undefined as any, 'bold');
    if (isCredit) doc.setTextColor(220, 38, 38); else doc.setTextColor(0, 0, 0);
    doc.text(`${pdfTitle} N° ${inv.invoiceNumber}`, rX, Y + 5, { align: 'right' });
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(8); doc.setFont(undefined as any, 'normal');
    doc.text(`Date: ${inv.issueDate ? new Date(inv.issueDate).toLocaleDateString('fr-FR') : '-'}`, rX, Y + 10, { align: 'right' });
    if (inv.dueDate && !isCredit) doc.text(`Échéance: ${new Date(inv.dueDate).toLocaleDateString('fr-FR')}`, rX, Y + 14, { align: 'right' });
    const clientBoxX = rX - 60; const clientBoxY = Y + 18;
    doc.setDrawColor(150); doc.setLineWidth(0.3); doc.rect(clientBoxX, clientBoxY, 60, 22);
    doc.setFontSize(8); doc.setFont(undefined as any, 'bold'); doc.text('CLIENT', clientBoxX + 2, clientBoxY + 4);
    doc.setFont(undefined as any, 'normal'); doc.setFontSize(9);
    doc.text(inv.clientName || '', clientBoxX + 2, clientBoxY + 9);
    if (inv.clientAddress) doc.text(inv.clientAddress.substring(0, 50), clientBoxX + 2, clientBoxY + 13);
    if (inv.clientEmail) doc.text(inv.clientEmail, clientBoxX + 2, clientBoxY + 17);
    Y = Math.max(infoY, clientBoxY + 25) + 5;
    const tableData = items.map(i => {
      const ld = i.discount || 0;
      const lt = i.quantity * i.unitPrice * (1 - ld / 100);
      return [i.reference || '-', i.description, i.quantity.toFixed(2), i.unit, `${i.unitPrice.toFixed(2)} ${SYM}`, ld + '%', `${lt.toFixed(2)} ${SYM}`, i.tvaRate + '%'];
    });
    autoTable(doc, {
      startY: Y, head: [['Réf.', 'Désignation', 'Qté', 'Unité', 'Prix U HT', 'Remise', 'Total HT', 'TVA']],
      body: tableData, theme: 'grid', margin: { left: M, right: M },
      headStyles: { fillColor: isCredit ? [220, 38, 38] : [37, 99, 235], textColor: 255, fontSize: 8, fontStyle: 'bold' },
      styles: { fontSize: 8, cellPadding: 2, lineColor: [200, 200, 200], lineWidth: 0.2 },
      columnStyles: { 0: { cellWidth: 15 }, 1: { cellWidth: 60 }, 2: { cellWidth: 12, halign: 'center' }, 3: { cellWidth: 12, halign: 'center' }, 4: { cellWidth: 18, halign: 'right' }, 5: { cellWidth: 12, halign: 'right' }, 6: { cellWidth: 18, halign: 'right', fontStyle: 'bold' }, 7: { cellWidth: 12, halign: 'right' } },
    });
    let ty = (doc as any).lastAutoTable.finalY + 8;
    const totalsX = W - M - 60;
    doc.setFontSize(8); doc.setFont(undefined as any, 'normal'); doc.setTextColor(0, 0, 0);
    const totalLine = (label: string, value: string, bold = false, color: number[] = [0, 0, 0]) => {
      doc.setFont(undefined as any, bold ? 'bold' : 'normal'); doc.setTextColor(color[0], color[1], color[2]);
      doc.text(label, totalsX, ty); doc.text(value, W - M, ty, { align: 'right' });
      doc.setDrawColor(200); doc.setLineWidth(0.2); doc.line(totalsX, ty + 1, W - M, ty + 1); ty += 5;
    };
    totalLine('Total HT', `${pdfSubtotal.toFixed(2)} ${SYM}`);
    if (pdfDiscount > 0) totalLine(`Remise ${pdfDiscount}%`, `- ${pdfDiscountAmount.toFixed(2)} ${SYM}`, false, [220, 38, 38]);
    totalLine('Total HT après remise', `${pdfTaxableAmount.toFixed(2)} ${SYM}`);
    totalLine('Total TVA', `${pdfTax.toFixed(2)} ${SYM}`);
    doc.setFont(undefined as any, 'bold'); doc.setTextColor(0, 0, 0);
    doc.text('Total TTC', totalsX, ty); doc.text(`${pdfTotal.toFixed(2)} ${SYM}`, W - M, ty, { align: 'right' });
    doc.setDrawColor(0); doc.setLineWidth(0.5); doc.line(totalsX, ty + 1.5, W - M, ty + 1.5); ty += 6;
    if (pdfDeposit > 0) {
      ty += 2; doc.setFontSize(9); doc.setFont(undefined as any, 'bold'); doc.setTextColor(37, 99, 235);
      doc.text('ACOMPTE DÉJÀ VERSÉ', totalsX, ty); ty += 5;
      doc.setFontSize(8); doc.setFont(undefined as any, 'normal'); doc.setTextColor(0, 0, 0);
      totalLine("Montant de l'acompte", `- ${pdfDeposit.toFixed(2)} ${SYM}`, false, [37, 99, 235]);
      ty += 2; doc.setDrawColor(37, 99, 235); doc.setLineWidth(0.8); doc.line(totalsX, ty, W - M, ty); ty += 5;
      doc.setFontSize(11); doc.setFont(undefined as any, 'bold'); doc.setTextColor(37, 99, 235);
      doc.text('NET À PAYER', totalsX, ty); doc.text(`${pdfBalance.toFixed(2)} ${SYM}`, W - M, ty, { align: 'right' }); ty += 6;
      doc.setDrawColor(200); doc.setLineWidth(0.2);
    }
    if (inv.paymentMethods || inv.paymentConditions) {
      ty += 5; doc.setFontSize(10); doc.setFont(undefined as any, 'bold'); doc.setTextColor(0, 0, 0);
      doc.text('Conditions de règlement', M, ty);
      doc.setDrawColor(150); doc.setLineWidth(0.3); doc.line(M, ty + 1, W - M, ty + 1); ty += 6;
      doc.setFontSize(8); doc.setFont(undefined as any, 'normal');
      if (inv.paymentMethods) { doc.text(`Mode: ${inv.paymentMethods}`, M, ty); ty += 4; }
      if (inv.paymentConditions) { doc.text(`Conditions: ${inv.paymentConditions}`, M, ty); ty += 4; }
      if (inv.executionDelay) { doc.text(`Délai: ${inv.executionDelay}`, M, ty); ty += 4; }
    }
    if (!pdfIsTvaApplicable && inv.companyTva) {
      doc.setFontSize(7); doc.setFont(undefined as any, 'italic'); doc.setTextColor(100, 100, 100);
      doc.text(inv.companyTva, M, 285);
    }
    doc.save(`${pdfTitle}_${inv.invoiceNumber}.pdf`);
    toast.success('PDF téléchargé');
  };

  // ============================================================
  // 📊 CALCULS KPIs
  // ============================================================

  const isSubjectToVAT = useMemo(() => {
    return invoices.some(inv => inv && inv.companyTva && inv.companyTva.trim() !== '' && !inv.companyTva.toLowerCase().includes('non applicable'));
  }, [invoices]);

  const vatBaseLabel = isSubjectToVAT ? 'HT' : 'TTC';
  const amountOf = (inv: Invoice | null | undefined): number => {
    if (!inv) return 0;
    return isSubjectToVAT ? (inv.subtotal || 0) : (inv.total || 0);
  };

  // ✅ FILTRAGE avec typeTab
   const filtered = invoices.filter(inv => {
    if (!inv) return false;
    const searchStr = `${inv.invoiceNumber} ${inv.clientName} ${inv.status} ${inv.total}`.toLowerCase();
    const matchSearch = search === '' || searchStr.includes(search.toLowerCase());
    const matchStatus = filterStatus === 'all' || inv.status === filterStatus;
    const matchType = filterType === 'all' || inv.type === filterType;
    // ✅ Gestion de l'onglet E-Factures
    const matchTypeTab =
      typeTab === 'all' ? true :
      typeTab === 'einvoice' ? inv.isElectronic === true :
      (inv.type === typeTab && !inv.isElectronic);
    const matchView = viewMode === 'active' ? !isDocArchived(inv) : isDocArchived(inv);
    return matchSearch && matchStatus && matchType && matchTypeTab && matchView;
  });

  // ✅ PAGINATION
  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const paginatedInvoices = filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);
  const startItem = filtered.length === 0 ? 0 : (currentPage - 1) * ITEMS_PER_PAGE + 1;
  const endItem = Math.min(currentPage * ITEMS_PER_PAGE, filtered.length);

  const revenueInvoicesAll = invoices.filter(i => i && (i.type === 'standard' || i.type === 'advance' || i.type === 'balance') && !isDocArchived(i));
  const advancesWithFinal = new Set(
    invoices
      .filter(i => i && (i.type === 'standard' || i.type === 'balance') && i.originalInvoiceId && !isDocArchived(i))
      .filter(i => invoices.some(a => a && a.$id === i.originalInvoiceId && a.type === 'advance'))
      .map(i => i.originalInvoiceId!)
  );
  const originalsWithAdvance = new Set(
    invoices.filter(i => i && i.type === 'advance' && i.originalInvoiceId && !isDocArchived(i)).map(i => i.originalInvoiceId!)
  );
  const revenueInvoices = revenueInvoicesAll.filter(i => {
    if (i.type === 'advance' && advancesWithFinal.has(i.$id)) return false;
    if ((i.type === 'standard' || i.type === 'balance') && originalsWithAdvance.has(i.$id)) return false;
    return true;
  });
  const creditInvoices = invoices.filter(i => i && i.type === 'credit' && !isDocArchived(i));
  const caFacture = revenueInvoices.reduce((sum, i) => sum + amountOf(i), 0);
  const paidFraction = (i: Invoice | null | undefined): number => {
    if (!i) return 0;
    const paid = getEffectivePaidAmount(i);
    return i.total > 0 ? Math.min(1, paid / i.total) : 0;
  };
  const tvaFacturee = revenueInvoices.reduce((sum, i) => sum + (i.tax || 0), 0);
  const tvaExigible = revenueInvoices.reduce((sum, i) => sum + (i.tax || 0) * paidFraction(i), 0);
  const tvaRegulariseeRemboursee = creditInvoices.reduce((sum, i) => {
    const t = i.total || 0;
    const refunded = getCreditRefundedAmount(i);
    return sum + (t > 0 ? (i.tax || 0) * (refunded / t) : 0);
  }, 0);
  const tvaNette = tvaExigible - tvaRegulariseeRemboursee;
  const caEncaisse = revenueInvoices.reduce((sum, i) => sum + Math.min(getEffectivePaidAmount(i), i.total || 0), 0);
  const totalDecaisse = creditInvoices.reduce((sum, i) => sum + getCreditRefundedAmount(i), 0);
  const avoirsARembourser = creditInvoices.reduce((sum, i) => sum + getCreditRefundableAmount(i), 0);
  const caNet = caEncaisse - totalDecaisse;
  const resteAEncaisser = revenueInvoices.reduce((sum, i) => sum + getNetRemaining(i), 0);
  const caEncaisseHT = round2(caEncaisse - tvaExigible);
  const totalDecaisseHT = round2(totalDecaisse - tvaRegulariseeRemboursee);
  const caNetHT = round2(caNet - tvaNette);
  const overdueInvoices = revenueInvoices.filter(i => getDaysOverdue(i.dueDate, i.status) > 0 && getNetRemaining(i) > 0);
  const overdueCount = overdueInvoices.length;
  const overdueAmount = overdueInvoices.reduce((sum, i) => sum + getNetRemaining(i), 0);

  const advanceInvoiceIds = new Set(invoices.filter(i => i && i.type === 'advance').map(i => i.originalInvoiceId));
  const balanceInvoiceIds = new Set(invoices.filter(i => i && i.type === 'standard' && i.originalInvoiceId && invoices.find(a => a && a.$id === i.originalInvoiceId && a.type === 'advance')).map(i => i.originalInvoiceId));
  const finalInvoiceIds = new Set(invoices.filter(i => i && i.type === 'standard' && i.originalInvoiceId && invoices.find(a => a && a.$id === i.originalInvoiceId && a.type === 'advance')).map(i => i.$id));

  // ✅ DÉFINITION DES 4 ONGLETS TypeTabs
    const typeTabs = [
    { key: 'all', label: 'Toutes', count: invoices.filter(i => i && !isDocArchived(i)).length },
    { key: 'standard', label: 'Factures', count: invoices.filter(i => i && i.type === 'standard' && !i.isElectronic && !isDocArchived(i)).length },
    { key: 'advance', label: 'Acomptes', count: invoices.filter(i => i && i.type === 'advance' && !isDocArchived(i)).length },
    { key: 'credit', label: 'Avoirs', count: invoices.filter(i => i && i.type === 'credit' && !isDocArchived(i)).length },
    { key: 'einvoice', label: '⚡ E-Factures', count: invoices.filter(i => i && i.isElectronic === true && !isDocArchived(i)).length },
  ];

  if (permLoading || settingsLoading) {
    return (
      <Sidebar>
        <div className="min-h-full bg-slate-50 dark:bg-slate-900 p-6">
          <div className="max-w-7xl mx-auto space-y-6">
            <div className="h-10 w-48 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
              <table className="w-full">
                <tbody>
                  {[...Array(6)].map((_, i) => <SkeletonRow key={i} />)}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </Sidebar>
    );
  }

  if (!hasPermission('invoices.view')) return null;

  // ✅ MENU KEBAB COMPLET
  const buildRowActions = (inv: Invoice): ReactNode => {
    if (!inv) return null;
    const paidAmountForInvoice = getEffectivePaidAmount(inv);
    const creditsForInvoice = inv.type === 'standard' ? getTotalCreditsForInvoice(inv.$id) : 0;
    const remaining = Math.max(0, (inv.total || 0) - paidAmountForInvoice - creditsForInvoice);
    const maxCreditAllowed = Math.max(0, (inv.total || 0) - creditsForInvoice);
    const hasAdvance = advanceInvoiceIds.has(inv.$id);
    const hasBalance = balanceInvoiceIds.has(inv.$id);
    const isFinal = finalInvoiceIds.has(inv.$id);

    if (viewMode === 'archived') {
      return (
        <ActionMenuItem onClick={() => handleUnarchive(inv.$id, inv.invoiceNumber)} icon={RotateCcw} label="Désarchiver" />
      );
    }

    return (
      <>
        {inv.clientToken && (
          <ActionMenuItem onClick={() => handleCopyLink(inv)} icon={copiedToken === inv.clientToken ? CheckCircle2 : Link2} label={copiedToken === inv.clientToken ? 'Lien copié !' : 'Copier le lien client'} />
        )}
        {hasPermission('invoices.mark_paid') && inv.status !== 'paid' && inv.status !== 'cancelled' && inv.type !== 'credit' && remaining > 0 && (
          <>
            <ActionMenuItem onClick={() => { setInvoiceToConfirm(inv); setShowConfirmPaidModal(true); }} icon={CheckCircle2} label="Marquer payée" />
            <ActionMenuItem onClick={() => handleOpenPaymentModal(inv)} icon={DollarSign} label="Enregistrer paiement" />
          </>
        )}
        {hasPermission('invoices.create') && inv.type === 'standard' && inv.status === 'paid' && maxCreditAllowed > 0 && (
          <ActionMenuItem onClick={() => openCreditModal(inv)} icon={FileMinus} label="Créer un avoir" danger />
        )}
        {hasPermission('invoices.mark_paid') && inv.type === 'credit' && getCreditRefundableAmount(inv) > 0 && (
          <ActionMenuItem onClick={() => handleOpenRefundModal(inv)} icon={Banknote} label="Rembourser" danger />
        )}
        {hasPermission('invoices.create') && inv.type === 'standard' && inv.deposit > 0 && inv.status !== 'paid' && !hasAdvance && !isFinal && (
          <ActionMenuItem onClick={() => handleOpenAdvanceModal(inv)} icon={FileText} label="Facture d'acompte" />
        )}
        {hasPermission('invoices.create') && inv.type === 'advance' && inv.status === 'paid' && !hasBalance && (
          <ActionMenuItem onClick={() => handleGenerateFinalFromAdvance(inv)} icon={FileCheck2} label="Facture finale" disabled={generatingFinal} />
        )}
        {inv.quoteId && (
          <ActionMenuItem onClick={() => handleViewQuote(inv.quoteId!)} icon={Eye} label="Voir le devis" />
        )}
                  <ActionMenuItem onClick={() => generatePDF(inv)} icon={Download} label="Télécharger PDF" />

          {/* ✅ ACTIONS E-FACTURE */}
          {inv.isElectronic && inv.xmlContent && (
            <ActionMenuItem onClick={() => handleDownloadXml(inv)} icon={FileCode} label="Télécharger XML Factur-X" />
          )}
          {inv.isElectronic && inv.transmissionStatus === 'ready' && (
            <ActionMenuItem
              onClick={() => toast.info('La transmission à la plateforme sera disponible dans une prochaine mise à jour.')}
              icon={Send}
              label="⚡ Transmettre à la plateforme"
            />
          )}

          {hasPermission('invoices.delete') && (
            <ActionMenuItem onClick={() => handleArchive(inv.$id, inv.invoiceNumber)} icon={Archive} label="Archiver" danger />
          )}
      </>
    );
  };

  const getEntity = (inv: Invoice): Entity => ({
    type: 'entreprise',
    companyName: inv.clientName || '?',
  });

  return (
    <Sidebar>
      <div className="min-h-full bg-slate-50 dark:bg-slate-900">
        {/* ✅ PageHeader SANS bouton "Nouvelle facture" */}
        <PageHeader
          icon={Receipt}
          title="Factures"
          description={
            <>
              <span className="font-semibold text-slate-700 dark:text-slate-300 tabular-nums">{filtered.length}</span>{' '}
              document(s) {viewMode === 'active' ? 'actif(s)' : 'archivé(s)'}
            </>
          }
          currency={currency || 'EUR'}
          currencySymbol={currencyConfig?.symbol || '€'}
          action={
            failedEvents.length > 0 ? (
              <button onClick={handleRetryFailedEvents} className="flex items-center gap-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:from-amber-600 hover:to-orange-600 transition-all shadow-lg shadow-amber-500/30 active:scale-95">
                <RefreshCw size={16} />
                Réessayer {failedEvents.length} événement{failedEvents.length > 1 ? 's' : ''}
              </button>
            ) : undefined
          }
        />

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {/* ✅ KPI dans KPIGrid (responsive 2 lignes) */}
          <KPIGrid columns={isSubjectToVAT ? 7 : 6}>
            <StatCell label={`Facturé (${vatBaseLabel})`} value={fm(caFacture)} sublabel={`HT : ${fm(caFacture)} • TVA : ${fm(tvaFacturee)}`} trend={0} />
            <StatCell label="Encaissé (TTC)" value={fm(caEncaisse)} sublabel={`HT : ${fm(caEncaisseHT)} • TVA : ${fm(tvaExigible)}`} trend={0} />
            <StatCell label="Décaissé (TTC)" value={`- ${fm(totalDecaisse)}`} sublabel={`HT : ${fm(totalDecaisseHT)} • À rembourser : ${fm(avoirsARembourser)}`} trend={0} />
            <StatCell label="CA Net (TTC)" value={fm(caNet)} sublabel={`HT : ${fm(caNetHT)} • Trésorerie nette`} trend={0} />
            {isSubjectToVAT && (
              <StatCell label="TVA nette" value={fm(tvaNette)} sublabel={tvaNette < 0 ? 'Crédit à reporter' : `Exigible : ${fm(tvaExigible)}`} trend={tvaNette < 0 ? -1 : 0} />
            )}
            <StatCell label="Reste à encaisser" value={fm(resteAEncaisser)} sublabel="Créances en cours" trend={0} />
            <StatCell label="En retard" value={fm(overdueAmount)} sublabel={`${overdueCount} facture${overdueCount > 1 ? 's' : ''}`} trend={overdueCount > 0 ? -1 : 0} />
          </KPIGrid>

          {/* ✅ LES 4 ONGLETS TypeTabs */}
          <TypeTabs
            tabs={typeTabs}
            activeTab={typeTab}
            onTabChange={(key) => setTypeTab(key as any)}
            color="purple"
          />

          {/* Tabs Actives/Archivées */}
          <div className="flex border-b border-slate-200 dark:border-slate-700 mb-6">
            <button onClick={() => setViewMode('active')} className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${viewMode === 'active' ? 'border-purple-600 text-purple-600 dark:text-purple-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}>
              Actives ({invoices.filter(i => i && !isDocArchived(i)).length})
            </button>
            <button onClick={() => setViewMode('archived')} className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${viewMode === 'archived' ? 'border-purple-600 text-purple-600 dark:text-purple-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}>
              Archivées ({invoices.filter(i => i && isDocArchived(i)).length})
            </button>
          </div>

          {/* Filtres + Recherche avec ⌘K */}
          <div className="flex flex-col sm:flex-row gap-3 mb-6">
            <div className="relative flex-1">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                ref={searchInputRef}
                placeholder="Rechercher (N°, client, montant...)"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-10 pr-14 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition"
              />
              <div className="hidden sm:flex absolute right-3 top-1/2 -translate-y-1/2 items-center pointer-events-none">
                <kbd className="h-5 select-none items-center gap-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-1.5 font-mono text-[10px] font-medium text-slate-500 dark:text-slate-400 flex">⌘K</kbd>
              </div>
            </div>
            {viewMode === 'active' && (
              <>
                <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="px-3 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none">
                  <option value="all">Tous statuts</option>
                  {Object.entries(statusLabels).filter(([k]) => k !== 'cancelled' && k !== 'partial').map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
                <select value={filterType} onChange={e => setFilterType(e.target.value)} className="px-3 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none">
                  <option value="all">Tous types</option>
                  {Object.entries(typeLabels).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </>
            )}
          </div>

          {/* Liste */}
          {loading ? (
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
              <table className="w-full">
                <tbody>
                  {[...Array(8)].map((_, i) => <SkeletonRow key={i} />)}
                </tbody>
              </table>
            </div>
          ) : filtered.length === 0 ? (
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-12 text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
                <Receipt size={28} className="text-slate-400 dark:text-slate-500" />
              </div>
              <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-1">Aucune facture {viewMode === 'active' ? 'active' : 'archivée'}</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">Les documents apparaîtront ici une fois créés.</p>
            </div>
          ) : (
            <>
              {/* Desktop */}
              <div className="hidden md:block bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="px-4 py-3 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Facture</th>
                      <th className="px-4 py-3 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Client</th>
                      <th className="px-4 py-3 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Dates</th>
                      <th className="px-4 py-3 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Total</th>
                      <th className="px-4 py-3 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Payé</th>
                      <th className="px-4 py-3 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Reste</th>
                      <th className="px-4 py-3 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Statut</th>
                      <th className="px-4 py-3 w-12"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {paginatedInvoices.map(inv => {
                      if (!inv) return null;
                      const daysOverdue = getDaysOverdue(inv.dueDate, inv.status);
                      const paidAmountForInvoice = getEffectivePaidAmount(inv);
                      const creditsForInvoice = inv.type === 'standard' ? getTotalCreditsForInvoice(inv.$id) : 0;
                      const remaining = Math.max(0, (inv.total || 0) - paidAmountForInvoice - creditsForInvoice);
                      const creditStatus = getCreditData(inv).creditStatus;
                      // ✅ Utilisation de la fonction SharedUI (vrais statuts de facture)
                      const mappedStatus = mapInvoiceStatusToShared(inv.status, inv.type, creditStatus);
                      return (
                        <tr key={inv.$id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors group">
                                                    <td className="px-4 py-3">
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-sm font-semibold text-slate-900 dark:text-white">{inv.invoiceNumber}</span>
                                {inv.isElectronic && (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold bg-gradient-to-r from-blue-500 to-indigo-500 text-white rounded">
                                    <Zap size={10} /> E-Facture
                                  </span>
                                )}
                              </div>
                              <DotLabel label={typeLabels[inv.type || 'standard']} tone={typeToneMap[inv.type || 'standard'] || 'slate'} />
                              {inv.isElectronic && inv.transmissionStatus && (
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-full w-fit ${transmissionStatusColors[inv.transmissionStatus]}`}>
                                  {inv.transmissionStatus === 'accepted' && <CheckCircle2 size={10} />}
                                  {inv.transmissionStatus === 'rejected' && <X size={10} />}
                                  {inv.transmissionStatus === 'transmitted' && <Send size={10} />}
                                  {inv.transmissionStatus === 'ready' && <Clock size={10} />}
                                  {transmissionStatusLabels[inv.transmissionStatus]}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2.5">
                              <Avatar client={getEntity(inv)} />
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{inv.clientName || '-'}</p>
                                {inv.clientEmail && <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{inv.clientEmail}</p>}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-col gap-0.5">
                              <span className="text-sm text-slate-700 dark:text-slate-300">{formatDate(inv.issueDate)}</span>
                              <span className="text-xs text-slate-500 dark:text-slate-400">Échéance : {formatDate(inv.dueDate)}</span>
                              {daysOverdue > 0 && (
                                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600 dark:text-rose-400">
                                  <AlertTriangle size={11} /> +{daysOverdue} j
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="text-sm font-bold text-slate-900 dark:text-white tabular-nums">{fm(inv.total || 0)}</span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">{fm(paidAmountForInvoice)}</span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            {inv.type === 'credit' ? (
                              <div className="flex flex-col items-end">
                                <span className="text-sm font-semibold text-orange-600 dark:text-orange-400 tabular-nums">{fm(getCreditRefundableAmount(inv))}</span>
                                <span className="text-[10px] text-orange-500 dark:text-orange-300">À rembourser</span>
                              </div>
                            ) : (
                              <div className="flex flex-col items-end">
                                <span className={`text-sm font-semibold tabular-nums ${inv.status === 'paid' ? 'text-slate-400 dark:text-slate-500' : 'text-rose-600 dark:text-rose-400'}`}>
                                  {inv.status === 'paid' ? fm(0) : fm(remaining)}
                                </span>
                                {inv.type === 'standard' && creditsForInvoice > 0 && (
                                  <span className="text-[10px] text-orange-600 dark:text-orange-400">Avoirs: {fm(creditsForInvoice)}</span>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <StatusIndicator status={mappedStatus} />
                          </td>
                          <td className="px-2 py-3 w-12">
                            <div className="flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                              <ActionMenu>{buildRowActions(inv)}</ActionMenu>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {/* ✅ Pagination Desktop */}
                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onPageChange={setCurrentPage}
                  startItem={startItem}
                  endItem={endItem}
                  totalItems={filtered.length}
                  itemName="facture"
                />
              </div>

              {/* Mobile */}
              <div className="md:hidden space-y-3">
                {paginatedInvoices.map(inv => {
                  if (!inv) return null;
                  const daysOverdue = getDaysOverdue(inv.dueDate, inv.status);
                  const paidAmountForInvoice = getEffectivePaidAmount(inv);
                  const creditsForInvoice = inv.type === 'standard' ? getTotalCreditsForInvoice(inv.$id) : 0;
                  const remaining = Math.max(0, (inv.total || 0) - paidAmountForInvoice - creditsForInvoice);
                  const creditStatus = getCreditData(inv).creditStatus;
                  const mappedStatus = mapInvoiceStatusToShared(inv.status, inv.type, creditStatus);
                  return (
                    <div key={inv.$id} className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 shadow-sm">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="flex items-start gap-3 min-w-0 flex-1">
                          <Avatar client={getEntity(inv)} />
                                                  <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-xs font-semibold text-slate-900 dark:text-white">{inv.invoiceNumber}</span>
                            {inv.isElectronic && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-bold bg-gradient-to-r from-blue-500 to-indigo-500 text-white rounded">
                                <Zap size={9} /> E-Facture
                              </span>
                            )}
                          </div>
                          <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{inv.clientName || '-'}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <DotLabel label={typeLabels[inv.type || 'standard']} tone={typeToneMap[inv.type || 'standard'] || 'slate'} />
                            <span className="text-[11px] text-slate-500 dark:text-slate-400">{formatDate(inv.issueDate)}</span>
                          </div>
                          {inv.isElectronic && inv.transmissionStatus && (
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-full mt-1.5 ${transmissionStatusColors[inv.transmissionStatus]}`}>
                              {transmissionStatusLabels[inv.transmissionStatus]}
                            </span>
                          )}
                        </div>
                        </div>
                        <div className="flex items-start gap-2">
                          <StatusIndicator status={mappedStatus} />
                          <ActionMenu>{buildRowActions(inv)}</ActionMenu>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2 py-3 border-t border-b border-slate-100 dark:border-slate-700 text-center">
                        <div>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-semibold">Total</p>
                          <p className="text-sm font-bold text-slate-900 dark:text-white tabular-nums">{fm(inv.total || 0)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-semibold">Payé</p>
                          <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">{fm(paidAmountForInvoice)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-semibold">Reste</p>
                          {inv.type === 'credit' ? (
                            <p className="text-sm font-bold text-orange-600 dark:text-orange-400 tabular-nums">{fm(getCreditRefundableAmount(inv))}</p>
                          ) : (
                            <p className={`text-sm font-bold tabular-nums ${inv.status === 'paid' ? 'text-slate-400 dark:text-slate-500' : 'text-rose-600 dark:text-rose-400'}`}>
                              {inv.status === 'paid' ? fm(0) : fm(remaining)}
                            </p>
                          )}
                        </div>
                      </div>
                      {daysOverdue > 0 && (
                        <div className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-rose-600 dark:text-rose-400">
                          <AlertTriangle size={12} />
                          <span>+{daysOverdue} jour{daysOverdue > 1 ? 's' : ''} de retard</span>
                        </div>
                      )}
                    </div>
                  );
                })}
                {/* ✅ Pagination Mobile */}
                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onPageChange={setCurrentPage}
                />
              </div>
            </>
          )}
        </main>

        {/* ============================================================
            MODALES (toutes conservées)
           ============================================================ */}

        <Modal open={showQuoteModal} onClose={() => { setShowQuoteModal(false); setQuoteDetails(null); }} title="Devis d'origine" icon={<FileText className="text-emerald-600" size={20} />}>
          {loadingQuote ? (
            <div className="text-center py-12 text-slate-500 dark:text-slate-400">Chargement du devis...</div>
          ) : quoteDetails ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg p-3">
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-semibold">N° Devis</p>
                  <p className="font-mono font-bold text-emerald-700 dark:text-emerald-400 text-base mt-1">{quoteDetails.quoteNumber}</p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg p-3">
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-semibold">Statut</p>
                  <StatusIndicator status={quoteDetails.status === 'Facturé' ? 'paid' : 'sent'} />
                </div>
                <div className="col-span-2 bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg p-3">
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-semibold">Client</p>
                  <p className="font-semibold text-slate-900 dark:text-white mt-1">{quoteDetails.clientName}</p>
                </div>
              </div>
              {quoteDetails.subject && (
                <div className="bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 rounded-lg p-3">
                  <p className="text-[10px] text-sky-700 dark:text-sky-300 uppercase font-semibold">Objet</p>
                  <p className="text-slate-900 dark:text-white mt-1 text-sm">{quoteDetails.subject}</p>
                </div>
              )}
              <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg p-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="flex justify-between"><span className="text-slate-600 dark:text-slate-400">Total HT</span><span className="font-semibold text-slate-900 dark:text-white">{fm(quoteDetails.subtotal || 0)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-600 dark:text-slate-400">TVA</span><span className="font-semibold text-slate-900 dark:text-white">{fm(quoteDetails.tax || 0)}</span></div>
                  <div className="flex justify-between text-base font-bold border-t border-emerald-200 dark:border-emerald-800 pt-2 col-span-2"><span>Total TTC</span><span>{fm(quoteDetails.total || 0)}</span></div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-slate-500 dark:text-slate-400">Aucune donnée de devis trouvée.</div>
          )}
        </Modal>

        <Modal open={showPaymentModal && !!selectedInvoice} onClose={() => setShowPaymentModal(false)} title="Enregistrer un paiement" icon={<DollarSign className="text-sky-600" size={20} />}>
          {selectedInvoice && (
            <div className="space-y-4">
              <div className="bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg p-3">
                <div className="flex justify-between text-sm"><span className="text-slate-600 dark:text-slate-400">Facture</span><span className="font-semibold text-slate-900 dark:text-white">{selectedInvoice.invoiceNumber}</span></div>
                <div className="flex justify-between text-sm mt-1"><span className="text-slate-600 dark:text-slate-400">Reste</span><span className="font-bold text-rose-600 dark:text-rose-400">{fm(Math.max(0, (selectedInvoice.total || 0) - getEffectivePaidAmount(selectedInvoice)))}</span></div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Montant ({SYM}) *</label>
                <input type="number" step="0.01" min="0.01" value={paymentForm.amount} onChange={e => setPaymentForm({ ...paymentForm, amount: e.target.value })} className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-sky-500 outline-none" placeholder="0.00" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Date *</label>
                  <input type="date" value={paymentForm.date} onChange={e => setPaymentForm({ ...paymentForm, date: e.target.value })} className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-sky-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Moyen *</label>
                  <select value={paymentForm.method} onChange={e => setPaymentForm({ ...paymentForm, method: e.target.value })} className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg p-2.5 text-sm bg-white dark:bg-slate-700 focus:ring-2 focus:ring-sky-500 outline-none">
                    {paymentMethodsList.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Référence</label>
                <input type="text" value={paymentForm.reference} onChange={e => setPaymentForm({ ...paymentForm, reference: e.target.value })} className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-sky-500 outline-none" placeholder="N° chèque, virement..." />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Notes</label>
                <textarea rows={2} value={paymentForm.notes} onChange={e => setPaymentForm({ ...paymentForm, notes: e.target.value })} className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-sky-500 outline-none resize-none" placeholder="Notes internes..." />
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button onClick={() => setShowPaymentModal(false)} className="px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600">Annuler</button>
                <button onClick={handleSavePayment} disabled={savingPayment || !paymentForm.amount || parseFloat(paymentForm.amount) <= 0} className="px-4 py-2.5 text-sm font-bold text-white bg-sky-600 rounded-lg hover:bg-sky-700 disabled:opacity-50 flex items-center gap-2">
                  {savingPayment ? <><span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span> ...</> : <><CheckCircle2 size={14} /> Valider</>}
                </button>
              </div>
            </div>
          )}
        </Modal>

        <Modal open={showAdvanceModal} onClose={() => setShowAdvanceModal(false)} title="Générer une facture d'acompte" icon={<FileText className="text-violet-600" size={20} />}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Pourcentage d'acompte (%) *</label>
              <input type="number" min="1" max="99" step="0.01" value={advanceForm.percent} onChange={e => setAdvanceForm({ ...advanceForm, percent: e.target.value })} className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg p-3 text-sm focus:ring-2 focus:ring-violet-500 outline-none" />
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">Montant : {(() => { const inv = invoices.find(i => i && i.$id === advanceForm.invoiceId); return inv ? fm(inv.deposit || 0) : fm(0); })()}</p>
            </div>
            <div className="bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg p-3 text-sm space-y-1.5">
              <div className="flex justify-between"><span className="text-slate-600 dark:text-slate-400">Facture :</span><span className="font-semibold text-slate-900 dark:text-white">{invoices.find(i => i && i.$id === advanceForm.invoiceId)?.invoiceNumber}</span></div>
              <div className="flex justify-between"><span className="text-slate-600 dark:text-slate-400">Client :</span><span className="font-semibold text-slate-900 dark:text-white">{invoices.find(i => i && i.$id === advanceForm.invoiceId)?.clientName}</span></div>
              <div className="flex justify-between"><span className="text-slate-600 dark:text-slate-400">Total :</span><span className="font-semibold text-slate-900 dark:text-white">{(() => { const inv = invoices.find(i => i && i.$id === advanceForm.invoiceId); return inv ? fm(inv.total || 0) : fm(0); })()}</span></div>
            </div>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button onClick={() => setShowAdvanceModal(false)} className="px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600">Annuler</button>
              <button onClick={handleGenerateAdvanceInvoice} disabled={savingAdvance || !advanceForm.percent || parseFloat(advanceForm.percent) <= 0} className="px-5 py-2.5 text-sm font-bold text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50 flex items-center gap-2">
                {savingAdvance ? <><span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span> ...</> : <><FileText size={14} /> Générer</>}
              </button>
            </div>
          </div>
        </Modal>

        <Modal open={showConfirmPaidModal && !!invoiceToConfirm} onClose={() => { setShowConfirmPaidModal(false); setInvoiceToConfirm(null); }} title="Confirmer le paiement" icon={<CheckCircle2 className="text-emerald-600" size={20} />}>
          {invoiceToConfirm && (
            <div className="space-y-4">
              <div className="bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl p-4 space-y-2">
                <div className="flex justify-between text-sm"><span className="text-slate-600 dark:text-slate-400">Facture</span><span className="font-semibold text-slate-900 dark:text-white">{invoiceToConfirm.invoiceNumber}</span></div>
                <div className="flex justify-between text-sm"><span className="text-slate-600 dark:text-slate-400">Client</span><span className="font-semibold text-slate-900 dark:text-white">{invoiceToConfirm.clientName}</span></div>
                <div className="flex justify-between text-sm"><span className="text-slate-600 dark:text-slate-400">Montant</span><span className="font-bold text-emerald-600 dark:text-emerald-400">{fm(Math.max(0, (invoiceToConfirm.total || 0) - getEffectivePaidAmount(invoiceToConfirm)))}</span></div>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-400 text-center">Voulez-vous marquer cette facture comme <strong>entièrement payée</strong> ?</p>
              <div className="flex gap-3">
                <button onClick={() => { setShowConfirmPaidModal(false); setInvoiceToConfirm(null); }} className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600">Annuler</button>
                <button onClick={handleConfirmPaid} className="flex-1 px-4 py-2.5 text-sm font-bold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 flex items-center justify-center gap-2"><CheckCircle2 size={14} /> Confirmer</button>
              </div>
            </div>
          )}
        </Modal>

        <Modal open={showConfirmPaymentModal && !!paymentToConfirm} onClose={() => { setShowConfirmPaymentModal(false); setPaymentToConfirm(null); }} title="Confirmer le paiement" icon={<DollarSign className="text-sky-600" size={20} />}>
          {paymentToConfirm && (
            <div className="space-y-4">
              <div className="bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl p-4 space-y-2">
                <div className="flex justify-between text-sm"><span className="text-slate-600 dark:text-slate-400">Facture</span><span className="font-semibold text-slate-900 dark:text-white">{paymentToConfirm.invoice.invoiceNumber}</span></div>
                <div className="flex justify-between text-sm"><span className="text-slate-600 dark:text-slate-400">Client</span><span className="font-semibold text-slate-900 dark:text-white">{paymentToConfirm.invoice.clientName}</span></div>
                <div className="flex justify-between text-sm"><span className="text-slate-600 dark:text-slate-400">Montant</span><span className="font-bold text-sky-600 dark:text-sky-400">{fm(paymentToConfirm.payment.amount)}</span></div>
                <div className="flex justify-between text-sm"><span className="text-slate-600 dark:text-slate-400">Date</span><span className="font-semibold text-slate-900 dark:text-white">{new Date(paymentToConfirm.payment.date).toLocaleDateString('fr-FR')}</span></div>
                <div className="flex justify-between text-sm"><span className="text-slate-600 dark:text-slate-400">Moyen</span><span className="font-semibold text-slate-900 dark:text-white">{paymentToConfirm.payment.method}</span></div>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-400 text-center">Voulez-vous <strong>enregistrer définitivement</strong> ce paiement ?</p>
              <div className="flex gap-3">
                <button onClick={() => { setShowConfirmPaymentModal(false); setPaymentToConfirm(null); setSelectedInvoice(paymentToConfirm.invoice); setPaymentForm({ amount: paymentToConfirm.payment.amount.toFixed(2), date: paymentToConfirm.payment.date, method: paymentToConfirm.payment.method, reference: paymentToConfirm.payment.reference || '', notes: paymentToConfirm.payment.notes || '' }); setShowPaymentModal(true); }} className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600">Modifier</button>
                <button onClick={handleConfirmPayment} disabled={savingPayment} className="flex-1 px-4 py-2.5 text-sm font-bold text-white bg-sky-600 rounded-lg hover:bg-sky-700 disabled:opacity-50 flex items-center justify-center gap-2">
                  {savingPayment ? <><span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span> ...</> : <><CheckCircle2 size={14} /> Confirmer</>}
                </button>
              </div>
            </div>
          )}
        </Modal>

        <Modal open={showReceiptChoiceModal && !!lastPaymentData} onClose={() => { setShowReceiptChoiceModal(false); setLastPaymentData(null); }} title="Paiement enregistré !" icon={<CheckCircle2 className="text-emerald-600" size={20} />}>
          {lastPaymentData && (
            <div className="space-y-4">
              <div className="bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl p-4 space-y-2">
                <div className="flex justify-between text-sm"><span className="text-slate-600 dark:text-slate-400">Facture</span><span className="font-semibold text-slate-900 dark:text-white">{lastPaymentData.invoice.invoiceNumber}</span></div>
                <div className="flex justify-between text-sm"><span className="text-slate-600 dark:text-slate-400">Client</span><span className="font-semibold text-slate-900 dark:text-white">{lastPaymentData.invoice.clientName}</span></div>
                <div className="flex justify-between text-sm"><span className="text-slate-600 dark:text-slate-400">Montant</span><span className="font-bold text-emerald-600 dark:text-emerald-400">{fm(lastPaymentData.payment.amount)}</span></div>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-400 text-center">Voulez-vous générer le reçu de paiement ?</p>
              <div className="flex gap-3">
                <button onClick={async () => { setShowReceiptChoiceModal(false); await generateReceiptPDF(lastPaymentData.invoice, lastPaymentData.payment); setLastPaymentData(null); }} className="flex-1 px-4 py-2.5 text-sm font-bold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 flex items-center justify-center gap-2">
                  <Receipt size={14} /> Générer le reçu
                </button>
                <button onClick={() => { setShowReceiptChoiceModal(false); setLastPaymentData(null); }} className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600">Plus tard</button>
              </div>
            </div>
          )}
        </Modal>

        <Modal open={showCreditModal && !!creditInvoice} onClose={() => setShowCreditModal(false)} title="Créer un avoir" icon={<FileMinus className="text-rose-600" size={20} />}>
          {creditInvoice && (() => {
            const existingCreditsTotal = getTotalCreditsForInvoice(creditInvoice.$id);
            const maxCreditAllowed = Math.max(0, (creditInvoice.total || 0) - existingCreditsTotal);
            const linkedCredits = getCreditsListForInvoice(creditInvoice.$id);
            return (
              <div className="space-y-4">
                <div className="bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-lg p-3">
                  <div className="flex justify-between items-center text-sm">
                    <div>
                      <p className="text-[10px] text-rose-700 dark:text-rose-300 font-semibold uppercase">Facture</p>
                      <p className="font-bold text-slate-900 dark:text-white text-sm">{creditInvoice.invoiceNumber}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-rose-700 dark:text-rose-300 font-semibold uppercase">Client</p>
                      <p className="font-semibold text-slate-900 dark:text-white text-sm">{creditInvoice.clientName}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-rose-700 dark:text-rose-300 font-semibold uppercase">Montant</p>
                      <p className="text-lg font-bold text-rose-700 dark:text-rose-300">{fm(creditInvoice.total || 0)}</p>
                    </div>
                  </div>
                </div>
                {existingCreditsTotal > 0 && (
                  <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                    <p className="text-xs font-semibold text-amber-800 dark:text-amber-200 uppercase mb-2">Avoirs déjà émis</p>
                    <div className="space-y-1">
                      {linkedCredits.map(credit => (
                        <div key={credit.$id} className="flex justify-between text-xs text-amber-900 dark:text-amber-100">
                          <span className="font-mono">{credit.invoiceNumber}</span>
                          <span className="font-semibold">- {fm(credit.total || 0)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 pt-2 border-t border-amber-300 dark:border-amber-700 flex justify-between text-sm font-bold">
                      <span className="text-amber-900 dark:text-amber-100">Max autorisé :</span>
                      <span className="text-emerald-700 dark:text-emerald-300">{fm(maxCreditAllowed)}</span>
                    </div>
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">Type d'avoir</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => setCreditForm({ ...creditForm, type: 'total', amount: creditInvoice.total.toFixed(2) })} disabled={existingCreditsTotal > 0}
                      className={`p-2.5 border rounded-lg text-sm font-medium transition-colors ${creditForm.type === 'total' ? 'border-rose-500 bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300' : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300'} ${existingCreditsTotal > 0 ? 'opacity-50 cursor-not-allowed' : ''}`}>
                      Avoir Total
                    </button>
                    <button type="button" onClick={() => setCreditForm({ ...creditForm, type: 'partial', amount: '' })}
                      className={`p-2.5 border rounded-lg text-sm font-medium transition-colors ${creditForm.type === 'partial' ? 'border-rose-500 bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300' : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}>
                      Avoir Partiel
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">Traitement</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => setCreditForm({ ...creditForm, refundChoice: 'allocate' })}
                      className={`p-2.5 border rounded-lg text-sm font-medium transition-colors ${creditForm.refundChoice === 'allocate' ? 'border-sky-500 bg-sky-50 dark:bg-sky-900/20 text-sky-700 dark:text-sky-300' : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}>
                      Imputer sur la créance
                    </button>
                    <button type="button" onClick={() => setCreditForm({ ...creditForm, refundChoice: 'refund' })}
                      className={`p-2.5 border rounded-lg text-sm font-medium transition-colors ${creditForm.refundChoice === 'refund' ? 'border-rose-500 bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300' : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}>
                      Rembourser le client
                    </button>
                  </div>
                </div>
                {creditForm.type === 'partial' && (
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Montant TTC *</label>
                    <input type="number" min="0.01" step="0.01" max={maxCreditAllowed} value={creditForm.amount} onChange={e => setCreditForm({ ...creditForm, amount: e.target.value })} className="w-full px-3 py-2.5 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg focus:ring-2 focus:ring-rose-500 outline-none text-base font-semibold" placeholder="0.00" autoFocus />
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">Max : <span className="font-bold text-rose-600 dark:text-rose-400">{fm(maxCreditAllowed)}</span></p>
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Motif *</label>
                  <textarea rows={2} value={creditForm.reason} onChange={e => setCreditForm({ ...creditForm, reason: e.target.value })} className="w-full px-3 py-2.5 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg focus:ring-2 focus:ring-rose-500 outline-none text-sm resize-none" placeholder="Ex: Retour marchandise, Remise commerciale..." />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button onClick={() => setShowCreditModal(false)} className="px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600">Annuler</button>
                  <button onClick={handleGenerateCreditNote} disabled={savingCredit} className="px-4 py-2.5 text-sm font-bold text-white bg-rose-600 rounded-lg hover:bg-rose-700 disabled:opacity-50 flex items-center gap-2">
                    {savingCredit ? <><span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span> ...</> : <><FileMinus size={14} /> Générer</>}
                  </button>
                </div>
              </div>
            );
          })()}
        </Modal>

        <Modal open={showRefundModal && !!refundCredit} onClose={() => setShowRefundModal(false)} title="Remboursement d'avoir" icon={<Banknote className="text-rose-600" size={20} />}>
          {refundCredit && (
            <div className="space-y-4">
              <div className="bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-lg p-3 text-sm">
                <div className="flex justify-between"><span className="text-slate-600 dark:text-slate-400">Avoir</span><span className="font-mono font-semibold text-slate-900 dark:text-white">{refundCredit.invoiceNumber}</span></div>
                <div className="flex justify-between mt-1"><span className="text-slate-600 dark:text-slate-400">Reste à rembourser</span><span className="font-bold text-rose-600 dark:text-rose-400">{fm(getCreditRefundableAmount(refundCredit))}</span></div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Montant ({SYM}) *</label>
                <input type="number" step="0.01" min="0.01" max={getCreditRefundableAmount(refundCredit)} value={refundForm.amount} onChange={e => setRefundForm({ ...refundForm, amount: e.target.value })} className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-rose-500 outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Date *</label>
                  <input type="date" value={refundForm.date} onChange={e => setRefundForm({ ...refundForm, date: e.target.value })} className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-rose-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Moyen *</label>
                  <select value={refundForm.method} onChange={e => setRefundForm({ ...refundForm, method: e.target.value })} className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg p-2.5 text-sm bg-white dark:bg-slate-700 focus:ring-2 focus:ring-rose-500 outline-none">
                    {paymentMethodsList.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Référence</label>
                <input type="text" value={refundForm.reference} onChange={e => setRefundForm({ ...refundForm, reference: e.target.value })} className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-rose-500 outline-none" placeholder="Justificatif..." />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setShowRefundModal(false)} className="px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600">Annuler</button>
                <button onClick={handleRecordRefund} disabled={savingRefund || !refundForm.amount || parseFloat(refundForm.amount) <= 0} className="px-4 py-2.5 text-sm font-bold text-white bg-rose-600 rounded-lg hover:bg-rose-700 disabled:opacity-50 flex items-center gap-2">
                  {savingRefund ? <><span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span> ...</> : <><Banknote size={14} /> Enregistrer</>}
                </button>
              </div>
            </div>
          )}
        </Modal>
      </div>
    </Sidebar>
  );
}