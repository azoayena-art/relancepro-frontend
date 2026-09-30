import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { databases, DATABASE_ID } from '../appwrite';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { useCompanySettings } from '../hooks/useCompanySettings';
import { Query } from 'appwrite';
import { toast } from 'sonner';
import ActionMenu, { ActionMenuItem } from '../components/ui/ActionMenu';
import {
  PageHeader,
  TypeTabs,
  KPIGrid,
  StatCell,
  EmptyState,
  StatusIndicator,
  SkeletonRow,
  SkeletonCard,
  Alert,
  Pagination,
  Card,
  SectionTitle,
  Badge,
  SearchFilter,
  SelectFilter,
  MobileCard,
  DataTable,
  formatDate,
  statusLabels,
  type DotTone,
} from '../components/ui/SharedUI';
import {
  DollarSign,
  Calendar,
  Download,
  TrendingUp,
  TrendingDown,
  CreditCard,
  Receipt,
  FileText,
  Eye,
  FileMinus,
} from 'lucide-react';
import Sidebar from '../components/Sidebar';

// ============================================================
// INTERFACES
// ============================================================

interface Payment {
  id: string;
  amount: number | string;
  date: string;
  method: string;
  reference?: string;
  notes?: string;
}

interface ParsedPayment {
  id: string;
  amount: number;
  date: string;
  method: string;
  reference: string;
  notes: string;
  invoiceId: string;
  invoiceNumber: string;
  clientName: string;
  teamId: string;
  invoiceType?: string;
  flowType: 'credit' | 'debit';
  reason?: string;
  originalInvoiceNumber?: string;
  originalInvoiceId?: string;
  refundStatus?: 'refunded' | 'partial_refund' | 'to_refund' | 'allocated' | 'emitted';
}

interface Invoice {
  $id: string;
  invoiceNumber: string;
  clientName: string;
  teamId: string;
  total: number;
  type?: string;
  status?: string;
  payments?: any;
  $createdAt?: string;
  paidAt?: string;
  notes?: string;
  originalInvoiceId?: string;
  originalInvoiceNumber?: string;
}

// ============================================================
// CONFIGURATION METHODES DE PAIEMENT
// ============================================================

const methodLabels: Record<string, string> = {
  'Virement bancaire': 'Virement',
  'Chèque': 'Chèque',
  'Espèces': 'Espèces',
  'Carte bancaire': 'Carte',
  'Prélèvement SEPA': 'SEPA',
  'Avoir': 'Avoir',
  'Autre': 'Autre',
};

const methodTones: Record<string, DotTone> = {
  'Virement bancaire': 'sky',
  'Chèque': 'violet',
  'Espèces': 'emerald',
  'Carte bancaire': 'indigo',
  'Prélèvement SEPA': 'amber',
  'Avoir': 'rose',
  'Autre': 'slate',
};

const refundStatusToShared: Record<string, string> = {
  refunded: 'refunded',
  partial_refund: 'partial_refund',
  to_refund: 'to_refund',
  allocated: 'allocated',
  emitted: 'draft',
};

const ITEMS_PER_PAGE = 15;

// ============================================================
// COMPOSANT PRINCIPAL
// ============================================================

export default function Payments() {
  const { user } = useAuth();
  const { hasPermission, loading: permLoading } = usePermissions();
  const navigate = useNavigate();
  const { fm, currencyConfig, loading: settingsLoading } = useCompanySettings();
  const SYM = currencyConfig?.symbol || '€';

  const [loading, setLoading] = useState(true);
  const [payments, setPayments] = useState<ParsedPayment[]>([]);
  const [search, setSearch] = useState('');
  const [filterMethod, setFilterMethod] = useState('all');
  const [filterPeriod, setFilterPeriod] = useState('all');
  const [activeTab, setActiveTab] = useState<'credit' | 'debit'>('credit');
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    if (!permLoading && !hasPermission('invoices.view')) {
      navigate('/dashboard');
    }
  }, [permLoading, hasPermission, navigate]);

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }

    loadPayments();
  }, [user]);

  // ============================================================
  // HELPERS JSON
  // ============================================================

  const readJson = (raw: unknown): any => {
    if (!raw) return {};
    if (typeof raw === 'object') return raw;

    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  };

  // ============================================================
  // NAVIGATION SECURISEE VERS FACTURE
  // ============================================================

  const goToInvoice = (invoiceId?: string) => {
    console.log('goToInvoice - ID facture:', invoiceId);

    if (!invoiceId) {
      toast.error('ID de facture manquant', {
        description: 'Impossible d’ouvrir la facture car son ID est absent.',
      });
      return;
    }

    navigate(`/invoices/${invoiceId}`);
  };

  // ============================================================
  // CHARGEMENT DES DONNEES
  // ============================================================

  const loadPayments = async () => {
    try {
      setLoading(true);

      let teamId = null;

      const teamsRes = await databases.listDocuments(DATABASE_ID, 'teams', [
        Query.equal('ownerId', user.$id),
      ]);

      if (teamsRes.documents.length > 0) {
        teamId = teamsRes.documents[0].$id;
      } else {
        const membersRes = await databases.listDocuments(DATABASE_ID, 'team_members', [
          Query.equal('userId', user.$id),
        ]);

        if (membersRes.documents.length > 0) {
          teamId = membersRes.documents[0].teamId;
        }
      }

      if (!teamId) {
        setLoading(false);
        return;
      }

      const invoicesRes = await databases.listDocuments(DATABASE_ID, 'invoices', [
        Query.equal('teamId', teamId),
        Query.limit(2000),
      ]);

      const allInvoices = invoicesRes.documents as unknown as Invoice[];

      let metadataMap = new Map<string, any>();

      try {
        const metaRes = await databases.listDocuments(DATABASE_ID, 'invoice_metadata', [
          Query.equal('teamId', teamId),
          Query.limit(2000),
        ]);

        metaRes.documents.forEach((doc: any) => {
          metadataMap.set(doc.invoiceId, {
            creditData: readJson(doc.creditData),
            archiveData: readJson(doc.archiveData),
            reconciliationData: readJson(doc.reconciliationData),
          });
        });
      } catch {
        console.warn('invoice_metadata non disponible');
      }

      let journalPayments: any[] = [];

      try {
        const journalRes = await databases.listDocuments(DATABASE_ID, 'invoice_payments', [
          Query.equal('teamId', teamId),
          Query.limit(2000),
        ]);

        journalPayments = journalRes.documents.map((d: any) => ({
          ...readJson(d.data),
          $id: d.$id,
        }));
      } catch {
        console.warn('invoice_payments non disponible');
      }

      const allPayments: ParsedPayment[] = [];

      // ============================================================
      // ENCAISSEMENTS
      // ============================================================

      if (journalPayments.length > 0) {
        journalPayments.forEach((jp) => {
          if (jp.status !== 'confirmed') return;

          const inv = allInvoices.find((i) => i.$id === jp.invoiceId);
          if (!inv) return;

          const amountNum = Number(jp.amount);

          if (!isNaN(amountNum) && amountNum > 0) {
            allPayments.push({
              id: `journal-${jp.$id || jp.invoiceId}-${jp.paymentDate}`,
              amount: amountNum,
              date: jp.paymentDate || jp.createdAt || new Date().toISOString(),
              method: jp.method || 'Autre',
              reference: jp.reference || '',
              notes: jp.notes || '',
              invoiceId: inv.$id,
              invoiceNumber: inv.invoiceNumber,
              clientName: inv.clientName || 'Client inconnu',
              teamId: inv.teamId,
              invoiceType: inv.type,
              flowType: 'credit',
            });
          }
        });
      } else {
        allInvoices.forEach((invoice) => {
          if (invoice.type === 'credit') return;

          let parsedPayments: Payment[] = [];

          if (invoice.payments) {
            try {
              if (typeof invoice.payments === 'string') {
                const trimmed = invoice.payments.trim();

                if (trimmed && trimmed !== 'null' && trimmed !== '[]') {
                  parsedPayments = JSON.parse(trimmed);
                }
              } else if (Array.isArray(invoice.payments)) {
                parsedPayments = invoice.payments;
              }
            } catch {
              parsedPayments = [];
            }
          }

          if (Array.isArray(parsedPayments)) {
            parsedPayments.forEach((payment) => {
              const amountNum = Number(payment.amount);

              if (!isNaN(amountNum) && amountNum > 0) {
                allPayments.push({
                  id: payment.id || `gen-${Math.random().toString(36).substr(2, 9)}`,
                  amount: amountNum,
                  date: payment.date || invoice.$createdAt || new Date().toISOString(),
                  method: payment.method || 'Autre',
                  reference: payment.reference || '',
                  notes: payment.notes || '',
                  invoiceId: invoice.$id,
                  invoiceNumber: invoice.invoiceNumber,
                  clientName: invoice.clientName || 'Client inconnu',
                  teamId: invoice.teamId,
                  invoiceType: invoice.type,
                  flowType: 'credit',
                });
              }
            });
          }
        });
      }

      // ============================================================
      // DECAISSEMENTS / REMBOURSEMENTS / AVOIRS
      // ============================================================

      const resolveOriginalInvoice = (invoice: Invoice) => {
        let originalInvoice = allInvoices.find((inv) => inv.$id === invoice.originalInvoiceId);

        if (!originalInvoice && invoice.originalInvoiceNumber) {
          originalInvoice = allInvoices.find(
            (inv) => inv.invoiceNumber === invoice.originalInvoiceNumber
          );
        }

        return originalInvoice;
      };

      allInvoices.forEach((invoice) => {
        if (invoice.type !== 'credit' || invoice.status === 'cancelled') return;

        const meta = metadataMap.get(invoice.$id) || { creditData: {} };
        const creditData = meta.creditData || {};
        const creditStatus = creditData.creditStatus;

        const originalInvoice = resolveOriginalInvoice(invoice);
        const originalInvoiceNumber =
          originalInvoice?.invoiceNumber || invoice.originalInvoiceNumber || '';
        const originalInvoiceId = originalInvoice?.$id || invoice.originalInvoiceId || '';

        const reasonLine = (invoice.notes || '')
          .split('\n')
          .find((l) => l.startsWith('MOTIF AVOIR : '));

        const reason = reasonLine ? reasonLine.replace('MOTIF AVOIR : ', '') : 'Avoir émis';

        // Avoir legacy sans statut de remboursement
        if (creditStatus === undefined) {
          const amountNum = Number(invoice.total);

          if (!isNaN(amountNum) && amountNum > 0) {
            allPayments.push({
              id: `credit-legacy-${invoice.$id}`,
              amount: amountNum,
              date: invoice.paidAt || invoice.$createdAt || new Date().toISOString(),
              method: 'Avoir',
              reference: invoice.invoiceNumber,
              notes: reason,
              invoiceId: invoice.$id,
              invoiceNumber: invoice.invoiceNumber,
              clientName: invoice.clientName || 'Client inconnu',
              teamId: invoice.teamId,
              invoiceType: 'credit',
              flowType: 'debit',
              reason,
              originalInvoiceNumber,
              originalInvoiceId,
              refundStatus: 'emitted',
            });
          }

          return;
        }

        // Avoir imputé sur une facture
        if (creditStatus === 'allocated') {
          allPayments.push({
            id: `credit-allocated-${invoice.$id}`,
            amount: Number(invoice.total),
            date: invoice.$createdAt || new Date().toISOString(),
            method: 'Avoir',
            reference: invoice.invoiceNumber,
            notes: `${reason} (imputé sur facture)`,
            invoiceId: invoice.$id,
            invoiceNumber: invoice.invoiceNumber,
            clientName: invoice.clientName || 'Client inconnu',
            teamId: invoice.teamId,
            invoiceType: 'credit',
            flowType: 'debit',
            reason,
            originalInvoiceNumber,
            originalInvoiceId,
            refundStatus: 'allocated',
          });

          return;
        }

        let refunds: any[] = [];

        try {
          if (Array.isArray(creditData.refundPayments)) {
            refunds = creditData.refundPayments;
          }
        } catch {
          refunds = [];
        }

        const refundedSum = refunds.reduce((sum, r) => sum + Number(r.amount || 0), 0);
        const totalAmount = Number(invoice.total) || 0;
        const refundableAmount = Math.max(0, totalAmount - refundedSum);

        if (refunds.length > 0) {
          refunds.forEach((refund: any, idx: number) => {
            const amountNum = Number(refund.amount);

            if (!isNaN(amountNum) && amountNum > 0) {
              allPayments.push({
                id: `refund-${invoice.$id}-${idx}`,
                amount: amountNum,
                date: refund.date || invoice.$createdAt || new Date().toISOString(),
                method: refund.method || 'Virement bancaire',
                reference: refund.reference || invoice.invoiceNumber,
                notes: `${reason} (remboursement)`,
                invoiceId: invoice.$id,
                invoiceNumber: invoice.invoiceNumber,
                clientName: invoice.clientName || 'Client inconnu',
                teamId: invoice.teamId,
                invoiceType: 'credit',
                flowType: 'debit',
                reason,
                originalInvoiceNumber,
                originalInvoiceId,
                refundStatus: creditStatus,
              });
            }
          });
        }

        if (
          refundableAmount > 0.01 &&
          (creditStatus === 'to_refund' || creditStatus === 'partial_refund')
        ) {
          allPayments.push({
            id: `credit-pending-${invoice.$id}`,
            amount: refundableAmount,
            date: invoice.$createdAt || new Date().toISOString(),
            method: 'Avoir',
            reference: invoice.invoiceNumber,
            notes: `${reason} - EN ATTENTE de remboursement`,
            invoiceId: invoice.$id,
            invoiceNumber: invoice.invoiceNumber,
            clientName: invoice.clientName || 'Client inconnu',
            teamId: invoice.teamId,
            invoiceType: 'credit',
            flowType: 'debit',
            reason,
            originalInvoiceNumber,
            originalInvoiceId,
            refundStatus: creditStatus,
          });
        }
      });

      allPayments.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      setPayments(allPayments);
    } catch (error) {
      console.error('Erreur critique chargement paiements:', error);
      toast.error('Erreur lors du chargement des paiements');
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // CALCULS
  // ============================================================

  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const creditPayments = payments.filter((p) => p.flowType === 'credit');

  const debitPayments = payments.filter(
    (p) =>
      p.flowType === 'debit' &&
      (p.refundStatus === 'refunded' ||
        p.refundStatus === 'partial_refund' ||
        p.refundStatus === undefined)
  );

  const pendingCredits = payments.filter(
    (p) =>
      p.flowType === 'debit' &&
      (p.refundStatus === 'to_refund' || p.refundStatus === 'partial_refund')
  );

  const globalInflows = creditPayments.reduce((sum, p) => sum + Number(p.amount), 0);
  const globalOutflows = debitPayments.reduce((sum, p) => sum + Number(p.amount), 0);
  const pendingAmount = pendingCredits.reduce((sum, p) => sum + Number(p.amount), 0);
  const globalNet = globalInflows - globalOutflows;

  const thisMonthInflows = creditPayments
    .filter((p) => {
      const d = new Date(p.date);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    })
    .reduce((sum, p) => sum + Number(p.amount), 0);

  const thisMonthOutflows = debitPayments
    .filter((p) => {
      const d = new Date(p.date);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    })
    .reduce((sum, p) => sum + Number(p.amount), 0);

  const thisYearInflows = creditPayments
    .filter((p) => {
      const d = new Date(p.date);
      return d.getFullYear() === currentYear;
    })
    .reduce((sum, p) => sum + Number(p.amount), 0);

  const thisYearOutflows = debitPayments
    .filter((p) => {
      const d = new Date(p.date);
      return d.getFullYear() === currentYear;
    })
    .reduce((sum, p) => sum + Number(p.amount), 0);

  const activeList =
    activeTab === 'credit' ? creditPayments : payments.filter((p) => p.flowType === 'debit');

  const filteredPayments = activeList.filter((p) => {
    const searchStr = `${p.invoiceNumber} ${p.clientName} ${p.reference || ''} ${p.method} ${
      p.notes || ''
    } ${p.originalInvoiceNumber || ''}`.toLowerCase();

    const matchSearch = search === '' || searchStr.includes(search.toLowerCase());
    const matchMethod = filterMethod === 'all' || p.method === filterMethod;

    let matchPeriod = true;

    if (filterPeriod !== 'all') {
      const d = new Date(p.date);

      if (filterPeriod === 'month') {
        matchPeriod = d.getMonth() === currentMonth && d.getFullYear() === currentYear;
      } else if (filterPeriod === 'quarter') {
        const cq = Math.floor(currentMonth / 3);
        matchPeriod = Math.floor(d.getMonth() / 3) === cq && d.getFullYear() === currentYear;
      } else if (filterPeriod === 'year') {
        matchPeriod = d.getFullYear() === currentYear;
      }
    }

    return matchSearch && matchMethod && matchPeriod;
  });

  const filteredInflowAmount =
    activeTab === 'credit'
      ? filteredPayments.reduce((sum, p) => sum + Number(p.amount), 0)
      : 0;

  const filteredOutflowAmount =
    activeTab === 'debit'
      ? filteredPayments
          .filter(
            (p) =>
              p.refundStatus === 'refunded' ||
              p.refundStatus === 'partial_refund' ||
              p.refundStatus === undefined
          )
          .reduce((sum, p) => sum + Number(p.amount), 0)
      : 0;

  const filteredPendingAmount =
    activeTab === 'debit'
      ? filteredPayments
          .filter(
            (p) =>
              p.method === 'Avoir' &&
              (p.refundStatus === 'to_refund' || p.refundStatus === 'partial_refund')
          )
          .reduce((sum, p) => sum + Number(p.amount), 0)
      : 0;

  const uniqueMethods = Array.from(new Set(activeList.map((p) => p.method)));

  const totalPages = Math.max(1, Math.ceil(filteredPayments.length / ITEMS_PER_PAGE));
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedPayments = filteredPayments.slice(startIndex, endIndex);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const tabs = [
    { key: 'credit', label: 'Encaissements', count: creditPayments.length },
    { key: 'debit', label: 'Décaissements', count: payments.filter((p) => p.flowType === 'debit').length },
  ];

  const methodOptions = uniqueMethods.map((m) => ({
    value: m,
    label: methodLabels[m] || m,
  }));

  const periodOptions = [
    { value: 'all', label: 'Toutes périodes' },
    { value: 'month', label: 'Ce mois' },
    { value: 'quarter', label: 'Ce trimestre' },
    { value: 'year', label: 'Cette année' },
  ];

  // ============================================================
  // ACTIONS
  // ============================================================

  const handleExportCSV = () => {
    if (filteredPayments.length === 0) {
      toast.warning('Aucune transaction à exporter');
      return;
    }

    const headers = [
      'Date',
      'Type',
      'N° Document',
      'Client',
      'Montant',
      'Moyen',
      'Référence',
      'Sur facture',
      'Statut',
      'Notes',
    ];

    const rows = filteredPayments.map((p) => {
      let docType = '';

      if (p.flowType === 'debit') {
        docType = 'Avoir';
      } else if (p.invoiceType === 'advance') {
        docType = 'Acompte';
      } else {
        docType = 'Facture';
      }

      const signedAmount =
        p.flowType === 'debit' ? `-${Number(p.amount).toFixed(2)}` : Number(p.amount).toFixed(2);

      const sharedStatus = refundStatusToShared[p.refundStatus || 'emitted'] || '';
      const statusLabel = p.flowType === 'debit' ? statusLabels[sharedStatus] || '-' : 'Encaissé';

      return [
        formatDate(p.date),
        docType,
        p.invoiceNumber,
        p.clientName,
        signedAmount,
        p.method,
        p.reference || '',
        p.originalInvoiceNumber || '',
        statusLabel,
        (p.notes || '').replace(/[\n\r]/g, ' '),
      ];
    });

    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = `${
      activeTab === 'credit' ? 'Encaissements' : 'Decaissements'
    }_${new Date().toISOString().split('T')[0]}.csv`;

    link.click();
    URL.revokeObjectURL(url);

    toast.success('Export CSV téléchargé');
  };

  const handleCopyDetails = (p: ParsedPayment) => {
    const prefix = p.flowType === 'debit' ? 'Remboursement' : 'Paiement';
    const sign = p.flowType === 'debit' ? '-' : '';
    const originalRef =
      p.flowType === 'debit' && p.originalInvoiceNumber
        ? ` - Sur facture ${p.originalInvoiceNumber}`
        : '';

    const text = `${prefix} de ${sign}${fm(Number(p.amount))} - ${p.invoiceNumber} - ${
      p.clientName
    }${originalRef}${p.reference && p.flowType === 'credit' ? ` - Réf: ${p.reference}` : ''}${
      p.notes ? ` - ${p.notes}` : ''
    }`;

    navigator.clipboard.writeText(text);
    toast.success('Détails copiés dans le presse-papiers');
  };

  // ============================================================
  // RESET FILTRES / PAGINATION
  // ============================================================

  useEffect(() => {
    setFilterMethod('all');
    setCurrentPage(1);
  }, [activeTab]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, filterMethod, filterPeriod]);

  // ============================================================
  // RENDU
  // ============================================================

  if (permLoading || settingsLoading) {
    return (
      <Sidebar>
        <div className="flex items-center justify-center h-full w-full">
          <div className="text-slate-500 dark:text-slate-400 text-lg animate-pulse">
            Vérification des droits et paramètres...
          </div>
        </div>
      </Sidebar>
    );
  }

  const isCreditTab = activeTab === 'credit';

  return (
    <Sidebar>
      <div className="min-h-full bg-slate-50 dark:bg-slate-900">
        <PageHeader
          icon={DollarSign}
          iconColor="purple"
          title="Flux de trésorerie"
          description="Encaissements réels et remboursements effectifs"
          currency={currencyConfig?.code || 'EUR'}
          currencySymbol={SYM}
          action={
            <button
              onClick={handleExportCSV}
              className={`flex items-center justify-center gap-2 ${
                isCreditTab
                  ? 'bg-emerald-600 hover:bg-emerald-700'
                  : 'bg-red-600 hover:bg-red-700'
              } text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors shadow-sm active:scale-95`}
            >
              <Download size={16} />
              <span className="hidden sm:inline">
                Exporter {isCreditTab ? 'Encaissements' : 'Décaissements'}
              </span>
              <span className="sm:hidden">Export</span>
            </button>
          }
        />

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <KPIGrid columns={4}>
            <StatCell
              value={`+ ${fm(globalInflows)}`}
              label="Encaissé"
              sublabel={`${creditPayments.length} paiement(s)`}
              trend={undefined}
            />
            <StatCell
              value={`- ${fm(globalOutflows)}`}
              label="Décaissé"
              sublabel="Remboursements effectifs"
              trend={undefined}
            />
            <StatCell
              value={fm(pendingAmount)}
              label="À rembourser"
              sublabel={`${pendingCredits.length} avoir(s) en attente`}
              trend={undefined}
            />
            <StatCell
              value={`${globalNet >= 0 ? '+' : ''}${fm(globalNet)}`}
              label="Trésorerie nette"
              sublabel="Encaissé - Décaissé"
              trend={undefined}
            />
          </KPIGrid>

          <Card className="mb-6">
            <SectionTitle>Sur la liste affichée</SectionTitle>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase font-semibold">
                  Encaissé
                </p>
                <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                  + {fm(isCreditTab ? filteredInflowAmount : 0)}
                </p>
              </div>

              <div>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase font-semibold">
                  Décaissé
                </p>
                <p className="text-sm font-bold text-red-600 dark:text-red-400 mt-1">
                  - {fm(isCreditTab ? 0 : filteredOutflowAmount)}
                </p>
              </div>

              <div>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase font-semibold">
                  {isCreditTab ? 'Transactions' : 'À rembourser'}
                </p>
                <p
                  className={`text-sm font-bold mt-1 ${
                    isCreditTab
                      ? 'text-slate-900 dark:text-white'
                      : 'text-amber-600 dark:text-amber-400'
                  }`}
                >
                  {isCreditTab ? filteredPayments.length : fm(filteredPendingAmount)}
                </p>
              </div>
            </div>
          </Card>

          <TypeTabs
            tabs={tabs}
            activeTab={activeTab}
            onTabChange={(key) => setActiveTab(key as 'credit' | 'debit')}
            color={isCreditTab ? 'emerald' : 'rose'}
          />

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4 mb-6">
            {isCreditTab ? (
              <>
                <Card className="border-l-4 border-l-emerald-500">
                  <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-semibold">
                    Ce mois
                  </p>
                  <p className="text-lg sm:text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                    + {fm(thisMonthInflows)}
                  </p>
                </Card>

                <Card className="border-l-4 border-l-blue-500">
                  <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-semibold">
                    Cette année
                  </p>
                  <p className="text-lg sm:text-xl font-bold text-blue-600 dark:text-blue-400 mt-1">
                    + {fm(thisYearInflows)}
                  </p>
                </Card>
              </>
            ) : (
              <>
                <Card className="border-l-4 border-l-red-500">
                  <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-semibold">
                    Décaissé ce mois
                  </p>
                  <p className="text-lg sm:text-xl font-bold text-red-600 dark:text-red-400 mt-1">
                    - {fm(thisMonthOutflows)}
                  </p>
                </Card>

                <Card className="border-l-4 border-l-orange-500">
                  <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-semibold">
                    Décaissé cette année
                  </p>
                  <p className="text-lg sm:text-xl font-bold text-orange-600 dark:text-orange-400 mt-1">
                    - {fm(thisYearOutflows)}
                  </p>
                </Card>
              </>
            )}

            <Card className="border-l-4 border-l-purple-500 col-span-2 md:col-span-1">
              <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-semibold">
                Nb {isCreditTab ? 'paiements' : 'opérations'}
              </p>
              <p className="text-lg sm:text-xl font-bold text-purple-600 dark:text-purple-400 mt-1">
                {activeList.length}
              </p>
            </Card>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 mb-6">
            <SearchFilter
              value={search}
              onChange={setSearch}
              placeholder={`Rechercher (${
                isCreditTab ? 'facture, client, référence...' : 'avoir, client, motif...'
              })`}
            />

            <div className="flex gap-3">
              <SelectFilter
                value={filterPeriod}
                onChange={setFilterPeriod}
                options={periodOptions}
                placeholder="Période"
                icon={Calendar}
              />

              <SelectFilter
                value={filterMethod}
                onChange={setFilterMethod}
                options={methodOptions}
                placeholder="Moyen"
                icon={CreditCard}
              />
            </div>
          </div>

          {filteredPayments.length > 0 && (
            <Alert
              tone={isCreditTab ? 'success' : 'warning'}
              icon={isCreditTab ? TrendingUp : TrendingDown}
              className="mb-4"
            >
              <div className="flex justify-between items-center w-full">
                <span className="font-medium">
                  {filteredPayments.length} {isCreditTab ? 'paiement(s)' : 'opération(s)'} affiché(s)
                </span>
                <span className="text-lg font-bold">
                  {isCreditTab ? '+ ' : '- '}
                  {fm(isCreditTab ? filteredInflowAmount : filteredOutflowAmount)}
                </span>
              </div>
            </Alert>
          )}

          {loading ? (
            <>
              <DataTable
                loading={true}
                headers={[
                  { label: 'Date', align: 'left' },
                  { label: isCreditTab ? 'Facture' : 'Avoir', align: 'left' },
                  { label: 'Client', align: 'left' },
                  { label: isCreditTab ? 'Moyen' : 'Statut', align: 'left' },
                  { label: 'Référence', align: 'left' },
                  { label: 'Montant', align: 'right' },
                  { label: '', align: 'right', width: 'w-12' },
                ]}
              />

              <div className="md:hidden space-y-4 mt-4">
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
              </div>
            </>
          ) : filteredPayments.length === 0 ? (
            <EmptyState
              icon={isCreditTab ? DollarSign : FileMinus}
              title={isCreditTab ? 'Aucun encaissement' : 'Aucun décaissement'}
              description={
                activeList.length === 0
                  ? isCreditTab
                    ? "Aucun paiement n'a encore été enregistré."
                    : "Aucun remboursement n'a encore été effectué."
                  : 'Aucune transaction ne correspond à vos filtres.'
              }
              tone={isCreditTab ? 'emerald' : 'rose'}
            />
          ) : (
            <>
              <DataTable
                headers={[
                  { label: 'Date', align: 'left' },
                  { label: isCreditTab ? 'Facture' : 'Avoir', align: 'left' },
                  { label: 'Client', align: 'left' },
                  { label: isCreditTab ? 'Moyen' : 'Statut', align: 'left' },
                  { label: 'Référence', align: 'left' },
                  { label: 'Montant', align: 'right' },
                  { label: '', align: 'right', width: 'w-12' },
                ]}
              >
                {paginatedPayments.map((p, idx) => {
                  const sharedStatus =
                    p.flowType === 'debit'
                      ? refundStatusToShared[p.refundStatus || 'emitted']
                      : 'paid';

                  return (
                    <tr
                      key={`${p.invoiceId}-${p.id}-${idx}`}
                      className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                    >
                      <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-300">
                        <div className="flex items-center gap-2">
                          <Calendar size={14} className="text-slate-400" />
                          {formatDate(p.date)}
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1">
                          <button
                            onClick={() => goToInvoice(p.invoiceId)}
                            className="inline-flex items-center gap-1 text-sm font-mono font-semibold text-purple-700 dark:text-purple-400 hover:text-purple-900 dark:hover:text-purple-300 hover:underline"
                            title="Voir la facture"
                          >
                            {p.flowType === 'debit' ? <FileMinus size={14} /> : <Receipt size={14} />}
                            {p.invoiceNumber}
                          </button>

                          {p.flowType === 'credit' && p.invoiceType === 'advance' && (
                            <Badge tone="blue">Acompte</Badge>
                          )}
                        </div>
                      </td>

                      <td className="px-6 py-4 text-sm font-medium text-slate-900 dark:text-white">
                        {p.clientName}
                      </td>

                      <td className="px-6 py-4">
                        {p.flowType === 'credit' ? (
                          <Badge tone={methodTones[p.method] || 'slate'}>
                            {methodLabels[p.method] || p.method}
                          </Badge>
                        ) : (
                          <StatusIndicator status={sharedStatus} />
                        )}
                      </td>

                      <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-400">
                        {p.flowType === 'debit' ? (
                          p.originalInvoiceNumber ? (
                            <div className="flex flex-col">
                              <span className="text-[10px] text-slate-400 dark:text-slate-500 uppercase">
                                Sur facture
                              </span>

                              <button
                                onClick={() => goToInvoice(p.originalInvoiceId)}
                                className="font-mono font-semibold text-purple-700 dark:text-purple-400 hover:text-purple-900 dark:hover:text-purple-300 hover:underline text-xs"
                                title="Voir la facture d'origine"
                              >
                                {p.originalInvoiceNumber}
                              </button>
                            </div>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )
                        ) : (
                          <span className="font-mono">{p.reference || '-'}</span>
                        )}
                      </td>

                      <td className="px-6 py-4 text-right">
                        <span
                          className={`text-sm font-bold ${
                            p.flowType === 'credit'
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-red-700 dark:text-red-400'
                          }`}
                        >
                          {p.flowType === 'credit' ? '+ ' : '- '}
                          {fm(Number(p.amount))}
                        </span>
                      </td>

                      <td className="px-2 py-4 text-right w-12">
                        <ActionMenu>
                          <ActionMenuItem
                            onClick={() => goToInvoice(p.invoiceId)}
                            icon={Eye}
                            label="Voir facture"
                          />
                          <ActionMenuItem
                            onClick={() => handleCopyDetails(p)}
                            icon={FileText}
                            label="Copier détails"
                          />
                        </ActionMenu>
                      </td>
                    </tr>
                  );
                })}
              </DataTable>

              <div className="md:hidden space-y-3 mt-4">
                {paginatedPayments.map((p, idx) => {
                  const sharedStatus =
                    p.flowType === 'debit'
                      ? refundStatusToShared[p.refundStatus || 'emitted']
                      : 'paid';

                  return (
                    <MobileCard key={`${p.invoiceId}-${p.id}-${idx}`}>
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <Badge
                              tone={
                                p.flowType === 'debit'
                                  ? 'red'
                                  : p.invoiceType === 'advance'
                                  ? 'blue'
                                  : 'purple'
                              }
                            >
                              {p.flowType === 'debit' ? (
                                <FileMinus size={12} className="mr-1" />
                              ) : (
                                <Receipt size={12} className="mr-1" />
                              )}
                              {p.invoiceNumber}
                            </Badge>

                            {p.flowType === 'credit' && p.invoiceType === 'advance' && (
                              <Badge tone="blue">Acompte</Badge>
                            )}
                          </div>

                          <h3 className="font-semibold text-slate-900 dark:text-white truncate">
                            {p.clientName}
                          </h3>

                          <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-0.5">
                            <Calendar size={10} />
                            {formatDate(p.date)}
                          </p>
                        </div>

                        <div className="text-right flex-shrink-0 ml-3">
                          <p
                            className={`text-lg font-bold ${
                              p.flowType === 'credit'
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-red-600 dark:text-red-400'
                            }`}
                          >
                            {p.flowType === 'credit' ? '+ ' : '- '}
                            {fm(Number(p.amount))}
                          </p>

                          {p.flowType === 'credit' ? (
                            <Badge tone={methodTones[p.method] || 'slate'}>
                              {methodLabels[p.method] || p.method}
                            </Badge>
                          ) : (
                            <StatusIndicator status={sharedStatus} />
                          )}
                        </div>
                      </div>

                      {(p.reference || p.notes || p.originalInvoiceNumber) && (
                        <div className="grid grid-cols-1 gap-2 py-3 border-t border-b border-slate-100 dark:border-slate-700 mb-3 text-xs">
                          {p.flowType === 'debit' && (
                            <>
                              {p.notes && (
                                <div className="flex justify-between gap-2">
                                  <span className="text-slate-500 dark:text-slate-400 flex-shrink-0">
                                    Motif
                                  </span>
                                  <span className="text-slate-700 dark:text-slate-300 text-right">
                                    {p.notes}
                                  </span>
                                </div>
                              )}

                              {p.originalInvoiceNumber && (
                                <div className="flex justify-between gap-2">
                                  <span className="text-slate-500 dark:text-slate-400 flex-shrink-0">
                                    Sur facture
                                  </span>

                                  <button
                                    onClick={() => goToInvoice(p.originalInvoiceId)}
                                    className="font-mono font-semibold text-purple-700 dark:text-purple-400 hover:text-purple-900 dark:hover:text-purple-300 text-right"
                                  >
                                    {p.originalInvoiceNumber}
                                  </button>
                                </div>
                              )}
                            </>
                          )}

                          {p.flowType === 'credit' && p.reference && (
                            <div className="flex justify-between">
                              <span className="text-slate-500 dark:text-slate-400">Référence</span>
                              <span className="font-mono font-medium text-slate-900 dark:text-white">
                                {p.reference}
                              </span>
                            </div>
                          )}

                          {p.flowType === 'credit' && p.notes && (
                            <div className="flex justify-between">
                              <span className="text-slate-500 dark:text-slate-400">Notes</span>
                              <span className="text-slate-700 dark:text-slate-300 text-right max-w-[60%] truncate">
                                {p.notes}
                              </span>
                            </div>
                          )}
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => goToInvoice(p.invoiceId)}
                          className="flex items-center justify-center gap-2 p-2.5 text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/30 rounded-lg active:scale-95 transition-transform"
                        >
                          <Eye size={16} />
                          <span className="text-xs font-medium">Voir facture</span>
                        </button>

                        <button
                          onClick={() => handleCopyDetails(p)}
                          className={`flex items-center justify-center gap-2 p-2.5 ${
                            isCreditTab
                              ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30'
                              : 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30'
                          } rounded-lg active:scale-95 transition-transform`}
                        >
                          <FileText size={16} />
                          <span className="text-xs font-medium">Copier</span>
                        </button>
                      </div>
                    </MobileCard>
                  );
                })}
              </div>

              {totalPages > 1 && (
                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onPageChange={handlePageChange}
                  startItem={startIndex + 1}
                  endItem={Math.min(endIndex, filteredPayments.length)}
                  totalItems={filteredPayments.length}
                  itemName={isCreditTab ? 'paiement' : 'opération'}
                />
              )}
            </>
          )}
        </main>
      </div>
    </Sidebar>
  );
}