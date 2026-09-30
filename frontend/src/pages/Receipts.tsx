import Sidebar from '../components/Sidebar';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { databases, DATABASE_ID } from '../appwrite';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { useCompanySettings } from '../hooks/useCompanySettings';
import { toast } from 'sonner';
import Modal from '../components/ui/Modal';
import ActionMenu, { ActionMenuItem } from '../components/ui/ActionMenu';
import {
  PageHeader,
  KPIGrid,
  StatCell,
  EmptyState,
  StatusIndicator,
  SkeletonCard,
  Pagination,
  ViewTabs,
  SearchFilter,
  MobileCard,
  DataTable,
  Card,
  SectionTitle,
  Badge,
} from '../components/ui/SharedUI';
import {
  Download, FileText, Calendar,
  Eye, Archive, RotateCcw, Receipt as ReceiptIcon,
  TrendingUp, TrendingDown, AlertCircle, CheckCircle2
} from 'lucide-react';
import { Query } from 'appwrite';
import { jsPDF } from 'jspdf';

// ============================================================
// 📋 INTERFACES
// ============================================================

interface Receipt {
  $id: string;
  teamId: string;
  status?: string;
  receiptNumber: string;
  invoiceId: string;
  invoiceNumber: string;
  clientName: string;
  amount: string;
  paymentDate: string;
  paymentMethod: string;
  paymentReference: string;
  pdfBase64: string;
  type?: string;
  $createdAt: string;
  companyName?: string;
  companyAddress?: string;
  companySiret?: string;
  companyPhone?: string;
  companyEmail?: string;
  clientAddress?: string;
  invoiceTotal?: string;
  debitReason?: string;
  originalInvoiceNumber?: string;
}

// Mapping des statuts de remboursement vers les statuts partagés
const refundStatusToShared: Record<string, string> = {
  refunded: 'refunded',
  partial_refund: 'partial_refund',
  to_refund: 'to_refund',
  allocated: 'allocated',
  emitted: 'draft'
};

const refundStatusLabels: Record<string, { label: string; tone: 'slate' | 'red' | 'orange' | 'amber' | 'green' | 'blue' | 'purple' }> = {
  refunded: { label: 'Remboursé', tone: 'red' },
  partial_refund: { label: 'Remb. partiel', tone: 'orange' },
  to_refund: { label: 'À rembourser', tone: 'amber' },
  allocated: { label: 'Imputé', tone: 'green' },
  emitted: { label: 'Émis', tone: 'slate' },
};

// ⚙️ Pagination
const ITEMS_PER_PAGE = 10;

// ============================================================
// 🎯 COMPOSANT PRINCIPAL
// ============================================================

export default function Receipts() {
  const { user } = useAuth();
  const { hasPermission, loading: permLoading } = usePermissions();
  const navigate = useNavigate();
  const { fm, currency, currencyConfig, loading: settingsLoading } = useCompanySettings();
  const SYM = currencyConfig?.symbol || '€';

  const [loading, setLoading] = useState(true);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'active' | 'archived'>('active');
  const [previewReceipt, setPreviewReceipt] = useState<Receipt | null>(null);
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string>('');
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [currentTeamId, setCurrentTeamId] = useState<string | null>(null);
  const [metadataMap, setMetadataMap] = useState<Map<string, any>>(new Map());

  // ✅ Pagination
  const [currentPage, setCurrentPage] = useState(1);

  // ============================================================
  // ✅ HELPERS
  // ============================================================

  const readJson = (raw: unknown): any => {
    if (!raw) return {};
    if (typeof raw === 'object') return raw;
    try { return JSON.parse(raw); } catch { return {}; }
  };

  const isDebitReceipt = (r: Receipt): boolean => {
    if (r.type === 'debit') return true;
    if ((r.receiptNumber || '').toUpperCase().startsWith('DEC')) return true;
    if ((r.paymentMethod || '').trim().toLowerCase() === 'avoir') return true;
    return false;
  };

  const getRefundStatus = (r: Receipt): string => {
    if (!isDebitReceipt(r)) return 'paid';
    const meta = metadataMap.get(r.invoiceId);
    if (!meta) return 'emitted';
    const creditData = meta.creditData || {};
    return creditData.creditStatus || 'emitted';
  };

  const isEffectiveRefund = (r: Receipt): boolean => {
    if (!isDebitReceipt(r)) return true;
    const status = getRefundStatus(r);
    return status === 'refunded' || status === 'partial_refund';
  };

  const formatDate = (d: string) => {
    try { return new Date(d).toLocaleDateString('fr-FR'); } catch { return d; }
  };

  // ============================================================
  // 📥 CHARGEMENT DES DONNÉES
  // ============================================================

  useEffect(() => {
    if (!permLoading && !hasPermission('invoices.view')) {
      navigate('/dashboard');
    }
  }, [permLoading, hasPermission, navigate]);

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    loadReceipts();
  }, [user, viewMode]);

  // ✅ Reset pagination quand les filtres changent
  useEffect(() => {
    setCurrentPage(1);
  }, [search, viewMode]);

  const loadReceipts = async () => {
    if (!user) return;
    try {
      setLoading(true);
      let teamId = null;
      const teamsRes = await databases.listDocuments(DATABASE_ID, 'teams', [Query.equal('ownerId', user.$id)]);
      if (teamsRes.documents.length > 0) teamId = teamsRes.documents[0].$id;
      else {
        const membersRes = await databases.listDocuments(DATABASE_ID, 'team_members', [Query.equal('userId', user.$id)]);
        if (membersRes.documents.length > 0) teamId = membersRes.documents[0].teamId;
      }
      if (!teamId) { setLoading(false); return; }
      setCurrentTeamId(teamId);

      const res = await databases.listDocuments(
        DATABASE_ID, 'receipts',
        [Query.equal('teamId', teamId), Query.orderDesc('$createdAt'), Query.limit(2000)]
      );
      setReceipts(res.documents as unknown as Receipt[]);

      try {
        const metaRes = await databases.listDocuments(DATABASE_ID, 'invoice_metadata', [
          Query.equal('teamId', teamId),
          Query.limit(2000)
        ]);
        const map = new Map<string, any>();
        metaRes.documents.forEach((doc: any) => {
          map.set(doc.invoiceId, {
            creditData: readJson(doc.creditData),
            archiveData: readJson(doc.archiveData),
            reconciliationData: readJson(doc.reconciliationData),
          });
        });
        setMetadataMap(map);
      } catch (e) {
        console.warn('invoice_metadata non disponible');
        setMetadataMap(new Map());
      }
    } catch (error) {
      console.error('Erreur chargement reçus:', error);
      toast.error('Erreur lors du chargement des reçus');
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // 📄 GÉNÉRATION PDF
  // ============================================================

  const regenerateReceiptPDF = async (receipt: Receipt): Promise<string> => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const W = 210, M = 20;
    const isDebit = isDebitReceipt(receipt);
    const amount = parseFloat(receipt.amount || '0');
    const paymentDate = receipt.paymentDate || new Date().toISOString().split('T')[0];
    const paymentMethod = receipt.paymentMethod || 'Non spécifié';
    const paymentRef = receipt.paymentReference || '';
    let Y = M;

    doc.setFontSize(20);
    doc.setFont(undefined, 'bold');
    if (isDebit) {
      doc.setTextColor(220, 38, 38);
      doc.text('REÇU DE DÉCAISSEMENT', W / 2, Y + 25, { align: 'center' });
    } else {
      doc.setTextColor(34, 197, 94);
      doc.text('REÇU DE PAIEMENT', W / 2, Y + 25, { align: 'center' });
    }
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text(`N° ${receipt.receiptNumber}`, W / 2, Y + 32, { align: 'center' });
    doc.setFontSize(9);
    doc.text(`Date : ${new Date(paymentDate).toLocaleDateString('fr-FR')}`, W - M, Y + 5, { align: 'right' });
    Y = Y + 50;

    if (isDebit) {
      doc.setDrawColor(220, 38, 38);
      doc.setFillColor(254, 226, 226);
    } else {
      doc.setDrawColor(34, 197, 94);
      doc.setFillColor(220, 252, 231);
    }
    doc.setLineWidth(0.5);
    doc.rect(M, Y, W - 2 * M, 15, 'FD');
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    if (isDebit) {
      doc.setTextColor(220, 38, 38);
      doc.text('DÉCAISSEMENT', W / 2, Y + 10, { align: 'center' });
    } else {
      doc.setTextColor(34, 197, 94);
      doc.text('ACQUITTÉ', W / 2, Y + 10, { align: 'center' });
    }
    Y += 25;

    doc.setFontSize(11);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(0, 0, 0);
    doc.text(`Je soussigné(e), représentant de la société :`, M, Y); Y += 6;
    doc.setFont(undefined, 'bold');
    doc.text(receipt.companyName || '', M, Y); Y += 5;
    doc.setFont(undefined, 'normal');
    doc.setFontSize(9);
    if (receipt.companyAddress) { doc.text(receipt.companyAddress, M, Y); Y += 4; }
    if (receipt.companySiret) { doc.text(`SIRET : ${receipt.companySiret}`, M, Y); Y += 4; }
    Y += 8;

    doc.setFontSize(11);
    doc.text(isDebit ? `Reconnais devoir restituer à :` : `Reconnais avoir reçu de :`, M, Y); Y += 6;
    doc.setFont(undefined, 'bold');
    doc.text(receipt.clientName || '', M, Y); Y += 5;
    doc.setFont(undefined, 'normal');
    doc.setFontSize(9);
    if (receipt.clientAddress) { doc.text(receipt.clientAddress.substring(0, 80), M, Y); Y += 4; }
    Y += 8;

    doc.setFontSize(11);
    doc.text(`La somme de :`, M, Y); Y += 6;
    doc.setFontSize(16);
    doc.setFont(undefined, 'bold');
    if (isDebit) {
      doc.setTextColor(220, 38, 38);
      doc.text(`- ${amount.toFixed(2)} ${SYM}`, M, Y);
    } else {
      doc.setTextColor(34, 197, 94);
      doc.text(`+ ${amount.toFixed(2)} ${SYM}`, M, Y);
    }
    Y += 10;

    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
    doc.setFont(undefined, 'normal');
    doc.text(isDebit ? `Au titre de la facture d'avoir :` : `En règlement de la facture :`, M, Y); Y += 6;
    doc.setFont(undefined, 'bold');
    doc.text(`N° ${receipt.invoiceNumber}`, M, Y); Y += 5;
    doc.setFont(undefined, 'normal');
    doc.setFontSize(9);
    doc.text(`D'un montant total de ${receipt.invoiceTotal || receipt.amount} ${SYM} TTC`, M, Y);

    if (isDebit && receipt.debitReason) {
      Y += 6;
      doc.text(`Motif : ${receipt.debitReason}`, M, Y);
    }
    if (isDebit && receipt.originalInvoiceNumber) {
      Y += 6;
      doc.text(`Référence facture d'origine : ${receipt.originalInvoiceNumber}`, M, Y);
    }
    Y += 10;

    doc.setFontSize(11);
    doc.text(`Moyen de paiement :`, M, Y); Y += 6;
    doc.setFont(undefined, 'bold');
    doc.text(paymentMethod, M, Y);
    if (paymentRef) {
      Y += 6;
      doc.setFont(undefined, 'normal');
      doc.setFontSize(10);
      doc.text(`Référence : ${paymentRef}`, M, Y);
    }
    Y += 15;

    doc.setFontSize(9);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text(`Fait à ${receipt.companyAddress?.split(',').pop()?.trim() || '...'}, le ${new Date(paymentDate).toLocaleDateString('fr-FR')}`, M, Y);
    Y += 10;
    doc.text(`Signature et cachet :`, M, Y); Y += 3;
    doc.setDrawColor(150);
    doc.setLineWidth(0.3);
    doc.rect(M, Y, 60, 20);

    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.text(
      isDebit
        ? 'Ce reçu atteste du décaissement effectué au titre de la facture d\'avoir.'
        : 'Ce reçu atteste du paiement effectif de la somme indiquée.',
      W / 2, 285, { align: 'center' }
    );

    return doc.output('datauristring');
  };

  const handlePreview = async (receipt: Receipt) => {
    setPreviewReceipt(receipt);
    setGeneratingPdf(true);
    try {
      if (receipt.pdfBase64 && receipt.pdfBase64.length > 100) {
        setPreviewPdfUrl(receipt.pdfBase64);
      } else {
        const pdfUrl = await regenerateReceiptPDF(receipt);
        setPreviewPdfUrl(pdfUrl);
      }
    } catch (e) {
      console.error('Erreur génération PDF:', e);
      toast.error('Erreur lors de la génération du PDF');
    } finally {
      setGeneratingPdf(false);
    }
  };

  const handleDownload = async (receipt: Receipt) => {
    try {
      let pdfBase64 = receipt.pdfBase64;
      if (!pdfBase64 || pdfBase64.length < 100) {
        pdfBase64 = await regenerateReceiptPDF(receipt);
      }
      const base64Data = pdfBase64.includes('base64,')
        ? pdfBase64.split('base64,')[1]
        : pdfBase64;
      const byteCharacters = atob(base64Data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const prefix = isDebitReceipt(receipt) ? 'Decaissement' : 'Recu';
      link.download = `${prefix}_${receipt.receiptNumber}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success('PDF téléchargé');
    } catch (e) {
      console.error('Erreur téléchargement:', e);
      toast.error('Erreur lors du téléchargement du PDF');
    }
  };

  const handleArchive = async (receipt: Receipt) => {
    if (receipt.teamId !== currentTeamId) {
      toast.error('⚠️ Accès refusé : Ce reçu n\'appartient pas à votre équipe.');
      return;
    }
    if (!confirm(`Archiver le reçu ${receipt.receiptNumber} ?\nIl sera masqué de la liste principale mais conservé pour la comptabilité.`)) return;
    try {
      await databases.updateDocument(DATABASE_ID, 'receipts', receipt.$id, { status: 'archived' });
      setReceipts(receipts.map(r => r.$id === receipt.$id ? { ...r, status: 'archived' } : r));
      toast.success(`Reçu ${receipt.receiptNumber} archivé`);
    } catch (e: any) {
      toast.error(`Erreur : ${e.message}`);
    }
  };

  const handleUnarchive = async (receipt: Receipt) => {
    if (receipt.teamId !== currentTeamId) {
      toast.error('⚠️ Accès refusé : Ce reçu n\'appartient pas à votre équipe.');
      return;
    }
    try {
      await databases.updateDocument(DATABASE_ID, 'receipts', receipt.$id, { status: 'active' });
      setReceipts(receipts.map(r => r.$id === receipt.$id ? { ...r, status: 'active' } : r));
      setViewMode('active');
      toast.success(`Reçu ${receipt.receiptNumber} désarchivé`);
    } catch (e: any) {
      toast.error(`Erreur : ${e.message}`);
    }
  };

  // ============================================================
  // ✅ CALCULS
  // ============================================================

  const filtered = receipts.filter(r => {
    const searchStr = `${r.receiptNumber} ${r.invoiceNumber} ${r.clientName} ${r.paymentMethod} ${r.originalInvoiceNumber || ''}`.toLowerCase();
    const matchSearch = search === '' || searchStr.includes(search.toLowerCase());
    const matchView = viewMode === 'active' ? r.status !== 'archived' : r.status === 'archived';
    return matchSearch && matchView;
  });

  // KPIs filtrés
  const filteredPaymentReceipts = filtered.filter(r => !isDebitReceipt(r));
  const filteredDebitReceipts = filtered.filter(r => isDebitReceipt(r) && isEffectiveRefund(r));
  const filteredPendingReceipts = filtered.filter(r => isDebitReceipt(r) && !isEffectiveRefund(r));
  const totalInflows = filteredPaymentReceipts.reduce((sum, r) => sum + parseFloat(r.amount || '0'), 0);
  const totalOutflows = filteredDebitReceipts.reduce((sum, r) => sum + parseFloat(r.amount || '0'), 0);
  const totalPending = filteredPendingReceipts.reduce((sum, r) => sum + parseFloat(r.amount || '0'), 0);
  const netBalance = totalInflows - totalOutflows;

  // KPIs globaux
  const allPaymentReceipts = receipts.filter(r => !isDebitReceipt(r) && r.status !== 'archived');
  const allDebitReceipts = receipts.filter(r => isDebitReceipt(r) && isEffectiveRefund(r) && r.status !== 'archived');
  const allPendingReceipts = receipts.filter(r => isDebitReceipt(r) && !isEffectiveRefund(r) && r.status !== 'archived');
  const globalInflows = allPaymentReceipts.reduce((sum, r) => sum + parseFloat(r.amount || '0'), 0);
  const globalOutflows = allDebitReceipts.reduce((sum, r) => sum + parseFloat(r.amount || '0'), 0);
  const globalPending = allPendingReceipts.reduce((sum, r) => sum + parseFloat(r.amount || '0'), 0);
  const globalNet = globalInflows - globalOutflows;

  // ✅ Calculs de pagination
  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedReceipts = filtered.slice(startIndex, endIndex);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // ============================================================
  // 🎨 RENDU
  // ============================================================

  if (permLoading || settingsLoading) {
    return (
      <Sidebar>
        <div className="flex items-center justify-center h-full w-full">
          <div className="text-slate-500 dark:text-slate-400 text-lg animate-pulse">Vérification des droits...</div>
        </div>
      </Sidebar>
    );
  }

  return (
    <Sidebar>
      <div className="min-h-full bg-slate-50 dark:bg-slate-900">
        <PageHeader
          icon={ReceiptIcon}
          iconColor="purple"
          title="Reçus de Paiement"
          description={
            <>
              <span className="font-semibold text-slate-700 dark:text-slate-300 tabular-nums">{filtered.length}</span>{' '}
              reçu(s) {viewMode === 'active' ? 'actif(s)' : 'archivé(s)'} • {SYM} {currency}
            </>
          }
        />

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {/* KPIs GLOBAUX */}
          <KPIGrid columns={4}>
            <StatCell
              value={`+ ${fm(globalInflows)}`}
              label="Encaissé"
              sublabel={`${allPaymentReceipts.length} reçu(s) paiement`}
              trend={undefined}
            />
            <StatCell
              value={`- ${fm(globalOutflows)}`}
              label="Décaissé"
              sublabel="Remboursements effectifs"
              trend={undefined}
            />
            <StatCell
              value={fm(globalPending)}
              label="À rembourser"
              sublabel={`${allPendingReceipts.length} reçu(s) en attente/imputé`}
              trend={undefined}
            />
            <StatCell
              value={`${globalNet >= 0 ? '+' : ''}${fm(globalNet)}`}
              label="Trésorerie nette"
              sublabel="Encaissé − Décaissé"
              trend={undefined}
            />
          </KPIGrid>

          {/* KPIs FILTRÉS */}
          <Card className="mb-6">
            <SectionTitle>Sur la liste affichée</SectionTitle>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase font-semibold">Entrants</p>
                <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400 mt-1">+ {fm(totalInflows)}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase font-semibold">Sortants</p>
                <p className="text-sm font-bold text-red-600 dark:text-red-400 mt-1">- {fm(totalOutflows)}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase font-semibold">
                  {viewMode === 'active' ? 'À rembourser' : 'Net affiché'}
                </p>
                <p className={`text-sm font-bold mt-1 ${viewMode === 'active' ? 'text-amber-600 dark:text-amber-400' : (netBalance >= 0 ? 'text-slate-900 dark:text-white' : 'text-orange-600 dark:text-orange-400')}`}>
                  {viewMode === 'active' ? fm(totalPending) : (netBalance >= 0 ? '+' : '- ') + fm(Math.abs(netBalance))}
                </p>
              </div>
            </div>
          </Card>

          {/* ONGLETS ACTIFS / ARCHIVÉS */}
          <ViewTabs
            active={viewMode}
            onChange={setViewMode}
            counts={{
              active: receipts.filter(r => r.status !== 'archived').length,
              archived: receipts.filter(r => r.status === 'archived').length
            }}
            color="purple"
          />

          {/* BARRE DE RECHERCHE */}
          <div className="flex gap-3 mb-6">
            <SearchFilter
              value={search}
              onChange={setSearch}
              placeholder="Rechercher (n° reçu, facture, client...)"
              shortcut="⌘K"
            />
          </div>

          {/* CONTENU */}
          {loading ? (
            <>
              <DataTable loading={true} headers={[
                { label: 'N° Reçu', align: 'left' },
                { label: 'Type', align: 'left' },
                { label: 'Facture', align: 'left' },
                { label: 'Client', align: 'left' },
                { label: 'Date', align: 'left' },
                { label: 'Statut', align: 'left' },
                { label: 'Montant', align: 'right' },
                { label: '', align: 'right', width: 'w-12' }
              ]} />
              <div className="md:hidden space-y-4 mt-4">
                <SkeletonCard /><SkeletonCard /><SkeletonCard />
              </div>
            </>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={ReceiptIcon}
              title={`Aucun reçu ${viewMode === 'active' ? 'actif' : 'archivé'}`}
              description={
                viewMode === 'active'
                  ? "Les reçus sont générés automatiquement à chaque paiement ou remboursement enregistré depuis la page Factures."
                  : "Aucun reçu n'a été archivé."
              }
              tone="indigo"
            />
          ) : (
            <>
              {/* TABLEAU DESKTOP */}
              <DataTable headers={[
                { label: 'N° Reçu', align: 'left' },
                { label: 'Type', align: 'left' },
                { label: 'Facture', align: 'left' },
                { label: 'Client', align: 'left' },
                { label: 'Date', align: 'left' },
                { label: 'Statut', align: 'left' },
                { label: 'Montant', align: 'right' },
                { label: '', align: 'right', width: 'w-12' }
              ]}>
                {paginatedReceipts.map(r => {
                  const isDebit = isDebitReceipt(r);
                  const amount = parseFloat(r.amount || '0');
                  const status = getRefundStatus(r);
                  const sharedStatus = isDebit ? refundStatusToShared[status] || 'draft' : 'paid';
                  const statusInfo = refundStatusLabels[status] || refundStatusLabels.emitted;

                  return (
                    <tr key={r.$id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-1 text-xs font-mono font-semibold text-purple-700 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/30 px-2 py-1 rounded">
                          {r.receiptNumber}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <Badge tone={isDebit ? 'red' : 'green'}>
                          {isDebit ? <TrendingDown size={12} className="mr-1" /> : <TrendingUp size={12} className="mr-1" />}
                          {isDebit ? 'Décaissement' : 'Encaissement'}
                        </Badge>
                      </td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => navigate('/invoices')}
                          className="inline-flex items-center gap-1 text-sm font-mono font-semibold text-purple-700 dark:text-purple-400 hover:text-purple-900 dark:hover:text-purple-300 hover:underline"
                        >
                          <FileText size={14} />
                          {r.invoiceNumber}
                        </button>
                        {isDebit && r.originalInvoiceNumber && (
                          <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                            Sur {r.originalInvoiceNumber}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm font-medium text-slate-900 dark:text-white">{r.clientName || '-'}</td>
                      <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-300">
                        <div className="flex items-center gap-2">
                          <Calendar size={14} className="text-slate-400" />
                          {formatDate(r.paymentDate)}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {isDebit ? (
                          <Badge tone={statusInfo.tone}>{statusInfo.label}</Badge>
                        ) : (
                          <StatusIndicator status="paid" />
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className={`text-sm font-bold ${isDebit ? 'text-red-700 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400'}`}>
                          {isDebit ? '- ' : '+ '}{fm(amount)}
                        </span>
                      </td>
                      <td className="px-2 py-4 text-right w-12">
                        <ActionMenu>
                          <ActionMenuItem onClick={() => handlePreview(r)} icon={Eye} label="Aperçu" />
                          <ActionMenuItem onClick={() => handleDownload(r)} icon={Download} label="Télécharger PDF" />
                          {viewMode === 'active' ? (
                            <ActionMenuItem onClick={() => handleArchive(r)} icon={Archive} label="Archiver" danger />
                          ) : (
                            <ActionMenuItem onClick={() => handleUnarchive(r)} icon={RotateCcw} label="Désarchiver" />
                          )}
                        </ActionMenu>
                      </td>
                    </tr>
                  );
                })}
              </DataTable>

              {/* CARTES MOBILE */}
              <div className="md:hidden space-y-4 mt-4">
                {paginatedReceipts.map(r => {
                  const isDebit = isDebitReceipt(r);
                  const amount = parseFloat(r.amount || '0');
                  const status = getRefundStatus(r);
                  const statusInfo = refundStatusLabels[status] || refundStatusLabels.emitted;

                  return (
                    <MobileCard key={r.$id}>
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="inline-flex items-center gap-1 text-xs font-mono font-semibold text-purple-700 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/30 px-2 py-1 rounded">
                              {r.receiptNumber}
                            </span>
                            <Badge tone={isDebit ? 'red' : 'green'}>
                              {isDebit ? <TrendingDown size={10} className="mr-1" /> : <TrendingUp size={10} className="mr-1" />}
                              {isDebit ? 'Sortie' : 'Entrée'}
                            </Badge>
                            {isDebit && (
                              <Badge tone={statusInfo.tone}>{statusInfo.label}</Badge>
                            )}
                          </div>
                          <h3 className="font-semibold text-slate-900 dark:text-white truncate">{r.clientName || 'Client inconnu'}</h3>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Facture : {r.invoiceNumber}</p>
                          {isDebit && r.originalInvoiceNumber && (
                            <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                              Sur facture {r.originalInvoiceNumber}
                            </p>
                          )}
                        </div>
                        <div className="text-right flex-shrink-0 ml-3">
                          <p className={`text-lg font-bold ${isDebit ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                            {isDebit ? '- ' : '+ '}{fm(amount)}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center justify-end gap-1 mt-1">
                            <Calendar size={12} /> {formatDate(r.paymentDate)}
                          </p>
                        </div>
                      </div>
                      <div className="py-3 border-t border-b border-slate-100 dark:border-slate-700 mb-3 text-sm">
                        <div className="flex justify-between">
                          <span className="text-slate-500 dark:text-slate-400">Moyen de paiement</span>
                          <span className="font-medium text-slate-900 dark:text-white">{r.paymentMethod || '-'}</span>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <button onClick={() => handlePreview(r)} className="flex flex-col items-center justify-center p-2 text-blue-600 bg-blue-50 dark:bg-blue-900/30 rounded-lg active:scale-95 transition-transform">
                          <Eye size={18} />
                          <span className="text-[10px] mt-1 font-medium">Aperçu</span>
                        </button>
                        <button onClick={() => handleDownload(r)} className="flex flex-col items-center justify-center p-2 text-purple-600 bg-purple-50 dark:bg-purple-900/30 rounded-lg active:scale-95 transition-transform">
                          <Download size={18} />
                          <span className="text-[10px] mt-1 font-medium">PDF</span>
                        </button>
                        {viewMode === 'active' ? (
                          <button onClick={() => handleArchive(r)} className="flex flex-col items-center justify-center p-2 text-orange-600 bg-orange-50 dark:bg-orange-900/30 rounded-lg active:scale-95 transition-transform">
                            <Archive size={18} />
                            <span className="text-[10px] mt-1 font-medium">Archiver</span>
                          </button>
                        ) : (
                          <button onClick={() => handleUnarchive(r)} className="flex flex-col items-center justify-center p-2 text-green-600 bg-green-50 dark:bg-green-900/30 rounded-lg active:scale-95 transition-transform">
                            <RotateCcw size={18} />
                            <span className="text-[10px] mt-1 font-medium">Désarchiver</span>
                          </button>
                        )}
                      </div>
                    </MobileCard>
                  );
                })}
              </div>

              {/* ✅ PAGINATION */}
              {totalPages > 1 && (
                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onPageChange={handlePageChange}
                  startItem={startIndex + 1}
                  endItem={Math.min(endIndex, filtered.length)}
                  totalItems={filtered.length}
                  itemName="reçu"
                />
              )}
            </>
          )}
        </main>

        {/* MODAL APERÇU */}
        <Modal
          open={!!previewReceipt}
          onClose={() => { setPreviewReceipt(null); setPreviewPdfUrl(''); }}
          title={`Aperçu - ${previewReceipt?.receiptNumber || ''}`}
          icon={
            previewReceipt && (
              <Badge tone={isDebitReceipt(previewReceipt) ? 'red' : 'green'}>
                {isDebitReceipt(previewReceipt) ? <TrendingDown size={12} className="mr-1" /> : <TrendingUp size={12} className="mr-1" />}
                {isDebitReceipt(previewReceipt) ? 'Décaissement' : 'Encaissement'}
              </Badge>
            )
          }
          maxWidth="sm:max-w-4xl"
          footer={
            <button
              onClick={() => previewReceipt && handleDownload(previewReceipt)}
              disabled={generatingPdf}
              className="flex-1 sm:flex-none px-4 py-2.5 text-sm font-semibold text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center justify-center gap-2 active:scale-95 transition-all"
            >
              <Download size={16} /> {generatingPdf ? 'Génération...' : 'Télécharger le PDF'}
            </button>
          }
        >
          <div className="h-[70vh] bg-slate-100 dark:bg-slate-900 rounded-lg overflow-hidden">
            {generatingPdf ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
                  <p className="text-slate-600 dark:text-slate-400">Génération du PDF...</p>
                </div>
              </div>
            ) : previewPdfUrl ? (
              <iframe src={previewPdfUrl} className="w-full h-full border-0" title="Aperçu du reçu" />
            ) : (
              <div className="flex items-center justify-center h-full text-slate-500 dark:text-slate-400">
                PDF non disponible pour ce reçu.
              </div>
            )}
          </div>
        </Modal>
      </div>
    </Sidebar>
  );
}