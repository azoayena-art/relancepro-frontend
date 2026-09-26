import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { databases, storage, DATABASE_ID, BUCKET_ID } from '../appwrite';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { getFilePreviewUrl } from '../utils/storage';
import { verifyDocumentAccess, logAuditAction } from '../utils/security';
import Sidebar from '../components/Sidebar'; // ✅ NOUVEAU
import {
  Search, ChevronLeft, Download, Filter, Copy, CheckCircle2, Receipt, DollarSign,
  Archive, RotateCcw, Hash, Eye, X, FileText, FileMinus, AlertTriangle
} from 'lucide-react';
import { Query, ID, Permission, Role } from 'appwrite';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

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
  originalQuoteId?: string; originalInvoiceId?: string; advancePercent?: string;
}

interface QuoteDetail {
  $id: string; quoteNumber: string; clientName: string; subject?: string; status: string;
  total: number; issueDate?: string; validityDate?: string; items?: string; subtotal?: number; discount?: number; tax?: number; deposit?: number; balance?: number;
}

const statusColors: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
  sent: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  near_due: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
  overdue: 'bg-red-200 text-red-900 font-bold dark:bg-red-900/40 dark:text-red-300',
  paid: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  partial: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
  cancelled: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
};

const statusLabels: Record<string, string> = {
  draft: 'Brouillon', sent: 'Envoyée', near_due: 'Bientôt échue',
  overdue: 'En retard', paid: 'Payée', partial: 'Partielle',
  cancelled: 'Archivée / Annulée'
};

const quoteStatusColors: Record<string, string> = {
  Brouillon: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
  Envoyé: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  Accepté: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  Refusé: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  Facturé: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300'
};

const typeLabels: Record<string, string> = {
  standard: 'Facture', advance: 'Facture d\'acompte', balance: 'Facture de solde', credit: 'Facture d\'avoir'
};

const typeColors: Record<string, string> = {
  standard: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
  advance: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  balance: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300',
  credit: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'
};

const paymentMethodsList = ['Virement bancaire', 'Chèque', 'Espèces', 'Carte bancaire', 'Prélèvement SEPA', 'Autre'];

export default function Invoices() {
  const { user } = useAuth();
  const { hasPermission, loading: permLoading } = usePermissions();
  const navigate = useNavigate();

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [currentTeamId, setCurrentTeamId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'active' | 'archived'>('active');

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
  const [lastPaymentData, setLastPaymentData] = useState<{invoice: Invoice; payment: Payment} | null>(null);

  const [showConfirmPaidModal, setShowConfirmPaidModal] = useState(false);
  const [invoiceToConfirm, setInvoiceToConfirm] = useState<Invoice | null>(null);

  const [showConfirmPaymentModal, setShowConfirmPaymentModal] = useState(false);
  const [paymentToConfirm, setPaymentToConfirm] = useState<{invoice: Invoice; payment: Payment} | null>(null);

  const [showCreditModal, setShowCreditModal] = useState(false);
  const [creditInvoice, setCreditInvoice] = useState<Invoice | null>(null);
  const [creditForm, setCreditForm] = useState({ type: 'total', amount: '', reason: '' });
  const [savingCredit, setSavingCredit] = useState(false);

  const getPaidAmount = (invoice: Invoice): number => {
    let payments: Payment[] = [];
    try {
      if (typeof invoice.payments === 'string' && invoice.payments.trim()) payments = JSON.parse(invoice.payments);
      else if (Array.isArray(invoice.payments)) payments = invoice.payments;
    } catch (e) { payments = []; }
    return payments.reduce((sum, p) => sum + (p.amount || 0), 0) + (invoice.deposit || 0);
  };

  // ✅ Calcule le vrai montant restant après paiements ET avoirs
  const getNetRemaining = (invoice: Invoice): number => {
    if (invoice.type === 'credit') return 0;
    const paidAmount = getPaidAmount(invoice);
    const creditsAmount = getTotalCreditsForInvoice(invoice.$id);
    return Math.max(0, (invoice.total || 0) - paidAmount - creditsAmount);
  };

  const getTotalCreditsForInvoice = useMemo(() => {
    return (invoiceId: string): number => {
      if (!invoiceId) return 0;
      return invoices
        .filter(inv => inv.type === 'credit' && inv.originalInvoiceId === invoiceId && inv.status !== 'cancelled')
        .reduce((sum, inv) => sum + (inv.total || 0), 0);
    };
  }, [invoices]);

  const getCreditsListForInvoice = useMemo(() => {
    return (invoiceId: string): Invoice[] => {
      if (!invoiceId) return [];
      return invoices
        .filter(inv => inv.type === 'credit' && inv.originalInvoiceId === invoiceId && inv.status !== 'cancelled')
        .sort((a, b) => new Date(b.issueDate || 0).getTime() - new Date(a.issueDate || 0).getTime());
    };
  }, [invoices]);

  const getDisplayStatus = (inv: Invoice): { status: string; label: string; color: string } => {
    if (inv.type === 'credit') {
      return { status: 'paid', label: 'Décaissée', color: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300' };
    }
    const paidAmount = getPaidAmount(inv);
    if (inv.status !== 'cancelled' && inv.status !== 'paid' && (inv.total || 0) > 0 && paidAmount >= (inv.total || 0) - 0.01) {
      return { status: 'paid', label: 'Payée', color: statusColors.paid };
    }
    if (inv.status === 'sent' && paidAmount > 0 && inv.balance > 0) {
      return { status: 'partial', label: 'Partielle', color: statusColors.partial };
    }
    return { status: inv.status, label: statusLabels[inv.status] || inv.status, color: statusColors[inv.status] || 'bg-gray-100 text-gray-800' };
  };

  const fm = (a: number) => `${a.toFixed(2)} €`;

  useEffect(() => {
    if (!permLoading && !hasPermission('invoices.view')) navigate('/dashboard');
  }, [permLoading, hasPermission, navigate]);

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    loadInvoices();
  }, [user, viewMode]);

  useEffect(() => {
    const interval = setInterval(() => { loadInvoices(true); }, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadInvoices = async (isBackground = false) => {
    try {
      if (!isBackground) setLoading(true);
      let teamId = null;
      const teamsRes = await databases.listDocuments(DATABASE_ID, 'teams', [Query.equal('ownerId', user.$id)]);
      if (teamsRes.documents.length > 0) teamId = teamsRes.documents[0].$id;
      else {
        const membersRes = await databases.listDocuments(DATABASE_ID, 'team_members', [Query.equal('userId', user.$id)]);
        if (membersRes.documents.length > 0) teamId = membersRes.documents[0].teamId;
      }
      if (!teamId) { if (!isBackground) setLoading(false); return; }
      setCurrentTeamId(teamId);
      const res = await databases.listDocuments(DATABASE_ID, 'invoices', [
        Query.equal('teamId', teamId), Query.orderDesc('$createdAt'), Query.limit(2000)
      ]);
      const docs = res.documents as unknown as Invoice[];
      setInvoices(docs);

      const stuck = docs.filter(i =>
        i.type !== 'credit' && i.status === 'sent' && (i.total || 0) > 0 &&
        getPaidAmount(i) >= (i.total || 0) - 0.01
      );
      if (stuck.length > 0) {
        const repaired = [...docs];
        for (const inv of stuck) {
          try {
            await databases.updateDocument(DATABASE_ID, 'invoices', inv.$id, {
              status: 'paid',
              balance: 0,
              paidAt: inv.paidAt || new Date().toISOString(),
              receivedAt: inv.receivedAt || new Date().toISOString()
            });
            const idx = repaired.findIndex(r => r.$id === inv.$id);
            if (idx >= 0) repaired[idx] = { ...repaired[idx], status: 'paid', balance: 0 };
            console.log(`✅ Facture ${inv.invoiceNumber} réparée : statut 'paid' restauré`);
          } catch (e) { console.warn('Réparation ignorée:', e); }
        }
        setInvoices(repaired);
      }
    } catch (e) { console.error("💥 Erreur loadInvoices:", e); }
    finally { if (!isBackground) setLoading(false); }
  };

  const getDaysOverdue = (dueDate?: string, status?: string) => {
    if (!dueDate || status === 'paid' || status === 'cancelled') return 0;
    const diffDays = Math.ceil((new Date().getTime() - new Date(dueDate).getTime()) / (1000 * 60 * 60 * 24));
    return diffDays > 0 ? diffDays : 0;
  };

  const handleCopyLink = async (invoice: Invoice) => {
    if (!invoice.clientToken) { alert('Cette facture n\'a pas de lien public.'); return; }
    const link = `${window.location.origin}/f/${invoice.clientToken}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopiedToken(invoice.clientToken);
      setTimeout(() => setCopiedToken(null), 2000);
    } catch { alert(`Lien :\n${link}`); }
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
      alert(`Impossible de charger le devis : ${e.message}`);
      setShowQuoteModal(false);
    } finally { setLoadingQuote(false); }
  };

  const generateReceiptPDF = async (inv: Invoice, payment?: Payment) => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const W = 210, M = 20;
    const paymentAmount = payment ? payment.amount : inv.total;
    const paymentDate = payment ? payment.date : new Date().toISOString().split('T')[0];
    const paymentMethod = payment ? payment.method : (inv.paymentMethods || 'Non spécifié');
    const paymentRef = payment?.reference || '';
    const currentYear = new Date().getFullYear();
    let receiptNumber = '';
    
    try {
      const lastReceiptsRes = await databases.listDocuments(DATABASE_ID, 'receipts', [
        Query.equal('teamId', currentTeamId), Query.orderDesc('$createdAt'), Query.limit(1)
      ]);
      let nextNumber = 1;
      if (lastReceiptsRes.documents.length > 0) {
        const lastReceipt = lastReceiptsRes.documents[0] as any;
        const match = lastReceipt.receiptNumber?.match(/REC-(\d{4})-(\d+)/);
        if (match && parseInt(match[1]) === currentYear) nextNumber = parseInt(match[2]) + 1;
      }
      receiptNumber = `REC-${currentYear}-${String(nextNumber).padStart(3, '0')}`;
    } catch (e) {
      receiptNumber = `REC-${currentYear}-${String(Date.now()).slice(-6)}`;
    }

    let logoB64: string | null = null;
    if (inv.logoFileId) {
      try {
        const u = getFilePreviewUrl('company_logos', inv.logoFileId);
        const b = await fetch(u).then(r => r.blob());
        logoB64 = await new Promise<string>((rs, rj) => {
          const rd = new FileReader(); rd.onloadend = () => rs(rd.result as string); rd.onerror = rj; rd.readAsDataURL(b);
        });
      } catch(e) {}
    }

    let Y = M;
    if (logoB64) { try { doc.addImage(logoB64, logoB64.includes('image/png') ? 'PNG' : 'JPEG', M, Y, 30, 15); } catch (e) {} }

    doc.setFontSize(20); doc.setFont(undefined, 'bold'); doc.setTextColor(34, 197, 94);
    doc.text('REÇU DE PAIEMENT', W / 2, Y + 25, { align: 'center' });
    doc.setFontSize(10); doc.setFont(undefined, 'normal'); doc.setTextColor(100, 100, 100);
    doc.text(`N° ${receiptNumber}`, W / 2, Y + 32, { align: 'center' });
    doc.setFontSize(9); doc.text(`Date : ${new Date(paymentDate).toLocaleDateString('fr-FR')}`, W - M, Y + 5, { align: 'right' });

    Y = Y + 50;
    doc.setDrawColor(34, 197, 94); doc.setLineWidth(1);
    doc.rect(M, Y, W - 2 * M, 15);
    doc.setFontSize(16); doc.setFont(undefined, 'bold'); doc.setTextColor(34, 197, 94);
    doc.text('ACQUITTÉ', W / 2, Y + 10, { align: 'center' });
    Y += 25;

    doc.setFontSize(11); doc.setFont(undefined, 'normal'); doc.setTextColor(0, 0, 0);
    doc.text(`Je soussigné(e), représentant de la société :`, M, Y); Y += 6;
    doc.setFont(undefined, 'bold'); doc.text(inv.companyName || '', M, Y); Y += 5;
    doc.setFont(undefined, 'normal'); doc.setFontSize(9);
    if (inv.companyAddress) { doc.text(inv.companyAddress, M, Y); Y += 4; }
    if (inv.companySiret) { doc.text(`SIRET : ${inv.companySiret}`, M, Y); Y += 4; }
    Y += 8; doc.setFontSize(11); doc.text(`Reconnais avoir reçu de :`, M, Y); Y += 6;
    doc.setFont(undefined, 'bold'); doc.text(inv.clientName || '', M, Y); Y += 5;
    doc.setFont(undefined, 'normal'); doc.setFontSize(9);
    if (inv.clientAddress) { doc.text(inv.clientAddress.substring(0, 80), M, Y); Y += 4; }
    Y += 8; doc.setFontSize(11); doc.text(`La somme de :`, M, Y); Y += 6;
    doc.setFontSize(16); doc.setFont(undefined, 'bold'); doc.setTextColor(37, 99, 235);
    doc.text(`${paymentAmount.toFixed(2)} €`, M, Y);
    Y += 10; doc.setFontSize(11); doc.setTextColor(0, 0, 0); doc.setFont(undefined, 'normal');
    doc.text(`En règlement de la facture :`, M, Y); Y += 6;
    doc.setFont(undefined, 'bold'); doc.text(`N° ${inv.invoiceNumber}`, M, Y); Y += 5;
    doc.setFont(undefined, 'normal'); doc.setFontSize(9);
    doc.text(`D'un montant total de ${inv.total.toFixed(2)} € TTC`, M, Y);
    Y += 10; doc.setFontSize(11); doc.text(`Moyen de paiement :`, M, Y); Y += 6;
    doc.setFont(undefined, 'bold'); doc.text(paymentMethod, M, Y);
    if (paymentRef) { Y += 6; doc.setFont(undefined, 'normal'); doc.setFontSize(10); doc.text(`Référence : ${paymentRef}`, M, Y); }
    Y += 15; doc.setFontSize(9); doc.setFont(undefined, 'normal'); doc.setTextColor(100, 100, 100);
    doc.text(`Fait à ${inv.companyAddress?.split(',').pop()?.trim() || '...'}, le ${new Date(paymentDate).toLocaleDateString('fr-FR')}`, M, Y);
    Y += 10; doc.text(`Signature et cachet :`, M, Y); Y += 3;
    doc.setDrawColor(150); doc.setLineWidth(0.3); doc.rect(M, Y, 60, 20);
    doc.setFontSize(7); doc.setTextColor(150, 150, 150);
    doc.text('Ce reçu atteste du paiement effectif de la somme indiquée.', W / 2, 285, { align: 'center' });

    try {
      const pdfBlob = doc.output('blob');
      const fileName = `receipts/${receiptNumber}.pdf`;
      const file = new File([pdfBlob], fileName, { type: 'application/pdf' });
      const uploadedFile = await storage.createFile(BUCKET_ID, ID.unique(), file);
      const receiptData = {
        teamId: currentTeamId, userId: user.$id, receiptNumber, invoiceId: inv.$id,
        invoiceNumber: inv.invoiceNumber, clientName: inv.clientName || 'Client',
        amount: paymentAmount.toFixed(2), paymentDate, paymentMethod,
        paymentReference: paymentRef, fileId: uploadedFile.$id, status: 'active'
      };
      let perms = user?.secureTeamId ? [Permission.read(Role.team(user.secureTeamId)), Permission.update(Role.team(user.secureTeamId)), Permission.delete(Role.team(user.secureTeamId))] : [Permission.read(Role.users()), Permission.update(Role.users()), Permission.delete(Role.users())];
      await databases.createDocument(DATABASE_ID, 'receipts', ID.unique(), receiptData, perms);
      alert(`✅ Reçu ${receiptNumber} généré et stocké !`);
    } catch (e: any) { console.error('Erreur stockage reçu:', e); alert(`⚠️ Erreur : ${e.message}`); }
  };

  const generateDebitReceiptPDF = async (creditInv: Invoice) => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const W = 210, M = 20;
    const debitAmount = creditInv.total || 0;
    const debitDate = creditInv.paidAt || creditInv.issueDate || new Date().toISOString().split('T')[0];
    const originalInvoiceNumber = creditInv.notes?.split('\n')[1]?.replace("Référence facture d'origine : ", '') || 'N/A';
    const debitReason = creditInv.notes?.split('\n')[0]?.replace('MOTIF AVOIR : ', '') || 'Non spécifié';
    const currentYear = new Date().getFullYear();
    let debitNumber = '';

    try {
      const recentReceipts = await databases.listDocuments(DATABASE_ID, 'receipts', [
        Query.equal('teamId', currentTeamId),
        Query.orderDesc('$createdAt'),
        Query.limit(200)
      ]);
      let maxNum = 0;
      recentReceipts.documents.forEach((d: any) => {
        const match = (d.receiptNumber || '').match(/^DEC-(\d{4})-(\d+)$/);
        if (match && parseInt(match[1], 10) === currentYear) {
          const n = parseInt(match[2], 10);
          if (n > maxNum) maxNum = n;
        }
      });
      debitNumber = `DEC-${currentYear}-${String(maxNum + 1).padStart(3, '0')}`;
    } catch (e) {
      console.warn('Numérotation DEC repli:', e);
      debitNumber = `DEC-${currentYear}-${String(Date.now()).slice(-6)}`;
    }

    let logoB64: string | null = null;
    if (creditInv.logoFileId) {
      try {
        const u = getFilePreviewUrl('company_logos', creditInv.logoFileId);
        const b = await fetch(u).then(r => r.blob());
        logoB64 = await new Promise<string>((rs, rj) => {
          const rd = new FileReader(); rd.onloadend = () => rs(rd.result as string); rd.onerror = rj; rd.readAsDataURL(b);
        });
      } catch(e) {}
    }

    let Y = M;
    if (logoB64) { try { doc.addImage(logoB64, logoB64.includes('image/png') ? 'PNG' : 'JPEG', M, Y, 30, 15); } catch (e) {} }

    doc.setFontSize(20); doc.setFont(undefined, 'bold'); doc.setTextColor(220, 38, 38);
    doc.text('REÇU DE DÉCAISSEMENT', W / 2, Y + 25, { align: 'center' });
    doc.setFontSize(10); doc.setFont(undefined, 'normal'); doc.setTextColor(100, 100, 100);
    doc.text(`N° ${debitNumber}`, W / 2, Y + 32, { align: 'center' });
    doc.setFontSize(9); doc.text(`Date : ${new Date(debitDate).toLocaleDateString('fr-FR')}`, W - M, Y + 5, { align: 'right' });

    Y = Y + 50;
    doc.setDrawColor(220, 38, 38); doc.setLineWidth(1);
    doc.rect(M, Y, W - 2 * M, 15);
    doc.setFontSize(16); doc.setFont(undefined, 'bold'); doc.setTextColor(220, 38, 38);
    doc.text('DÉCAISSEMENT', W / 2, Y + 10, { align: 'center' });
    Y += 25;

    doc.setFontSize(11); doc.setFont(undefined, 'normal'); doc.setTextColor(0, 0, 0);
    doc.text(`Je soussigné(e), représentant de la société :`, M, Y); Y += 6;
    doc.setFont(undefined, 'bold'); doc.text(creditInv.companyName || '', M, Y); Y += 5;
    doc.setFont(undefined, 'normal'); doc.setFontSize(9);
    if (creditInv.companyAddress) { doc.text(creditInv.companyAddress, M, Y); Y += 4; }
    if (creditInv.companySiret) { doc.text(`SIRET : ${creditInv.companySiret}`, M, Y); Y += 4; }
    Y += 8; doc.setFontSize(11); doc.text(`Reconnais devoir restituer à :`, M, Y); Y += 6;
    doc.setFont(undefined, 'bold'); doc.text(creditInv.clientName || '', M, Y); Y += 5;
    doc.setFont(undefined, 'normal'); doc.setFontSize(9);
    if (creditInv.clientAddress) { doc.text(creditInv.clientAddress.substring(0, 80), M, Y); Y += 4; }
    Y += 8; doc.setFontSize(11); doc.text(`La somme de :`, M, Y); Y += 6;
    doc.setFontSize(16); doc.setFont(undefined, 'bold'); doc.setTextColor(220, 38, 38);
    doc.text(`${debitAmount.toFixed(2)} €`, M, Y);
    Y += 10; doc.setFontSize(11); doc.setTextColor(0, 0, 0); doc.setFont(undefined, 'normal');
    doc.text(`Au titre de la facture d'avoir :`, M, Y); Y += 6;
    doc.setFont(undefined, 'bold'); doc.text(`N° ${creditInv.invoiceNumber}`, M, Y); Y += 5;
    doc.setFont(undefined, 'normal'); doc.setFontSize(9);
    doc.text(`D'un montant total de ${creditInv.total.toFixed(2)} € TTC`, M, Y);
    Y += 6; doc.text(`Référence facture d'origine : ${originalInvoiceNumber}`, M, Y);
    Y += 6; doc.text(`Motif : ${debitReason}`, M, Y);
    Y += 15; doc.setFontSize(9); doc.setFont(undefined, 'normal'); doc.setTextColor(100, 100, 100);
    doc.text(`Fait à ${creditInv.companyAddress?.split(',').pop()?.trim() || '...'}, le ${new Date(debitDate).toLocaleDateString('fr-FR')}`, M, Y);
    Y += 10; doc.text(`Signature et cachet :`, M, Y); Y += 3;
    doc.setDrawColor(150); doc.setLineWidth(0.3); doc.rect(M, Y, 60, 20);
    doc.setFontSize(7); doc.setTextColor(150, 150, 150);
    doc.text('Ce reçu atteste du décaissement effectué au titre de la facture d\'avoir.', W / 2, 285, { align: 'center' });

    let fileId = '';
    try {
      if (!BUCKET_ID) throw new Error('BUCKET_ID non défini dans appwrite.ts');
      const pdfBlob = doc.output('blob');
      const fileName = `receipts/DEC_${debitNumber}.pdf`;
      const file = new File([pdfBlob], fileName, { type: 'application/pdf' });
      const uploadedFile = await storage.createFile(BUCKET_ID, ID.unique(), file);
      fileId = uploadedFile.$id;
      console.log(`✅ PDF du reçu ${debitNumber} uploadé (fileId: ${fileId})`);
    } catch (e: any) {
      console.error('⚠️ Upload Storage du reçu DEC impossible (reçu enregistré sans fichier PDF) :', e?.message || e);
    }

    const perms = user?.secureTeamId
      ? [Permission.read(Role.team(user.secureTeamId)), Permission.update(Role.team(user.secureTeamId)), Permission.delete(Role.team(user.secureTeamId))]
      : [Permission.read(Role.users()), Permission.update(Role.users()), Permission.delete(Role.users())];

    const debitData: any = {
      teamId: currentTeamId,
      userId: user.$id,
      receiptNumber: debitNumber,
      invoiceId: creditInv.$id,
      invoiceNumber: creditInv.invoiceNumber,
      clientName: creditInv.clientName || 'Client',
      amount: debitAmount.toFixed(2),
      paymentDate: debitDate,
      paymentMethod: 'Avoir',
      paymentReference: originalInvoiceNumber,
      status: 'active'
    };
    if (fileId) debitData.fileId = fileId;

    try {
      await databases.createDocument(DATABASE_ID, 'receipts', ID.unique(), debitData, perms);
      console.log(`✅ Reçu de décaissement ${debitNumber} enregistré en base`);
    } catch (e: any) {
      if (fileId && /fileId/i.test(e?.message || '')) {
        try {
          const fallbackData = { ...debitData };
          delete fallbackData.fileId;
          await databases.createDocument(DATABASE_ID, 'receipts', ID.unique(), fallbackData, perms);
          console.warn(`✅ Reçu ${debitNumber} enregistré SANS fileId (attribut absent de la collection)`);
          return;
        } catch (e2: any) {
          console.error('❌ Second échec enregistrement reçu DEC:', e2);
          alert(`⚠️ L'avoir a été créé mais le reçu DEC n'a pas pu être enregistré :\n${e2?.message || e2}`);
          return;
        }
      }
      console.error('❌ Erreur enregistrement reçu décaissement:', e);
      alert(`⚠️ L'avoir a été créé mais le reçu de décaissement n'a pas pu être enregistré :\n${e?.message || e}`);
    }
  };

  const handleDownloadReceipt = async (fileId: string, receiptNumber: string) => {
    try {
      const downloadUrl = storage.getFileDownload(BUCKET_ID, fileId);
      const response = await fetch(downloadUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${receiptNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (e) {
      console.error('Erreur téléchargement:', e);
      alert('Impossible de télécharger le reçu.');
    }
  };

  const handleTogglePaid = async (invoice: Invoice) => {
    if (invoice.teamId !== currentTeamId) { alert('⚠️ Accès refusé'); return; }
    try {
      const totalAlreadyPaid = getPaidAmount(invoice);
      const remainingAmount = Math.max(0, (invoice.total || 0) - totalAlreadyPaid);
      if (remainingAmount <= 0) { alert(`⚠️ Cette facture est déjà entièrement payée !\n\nTotal : ${fm(invoice.total || 0)}\nDéjà payé : ${fm(totalAlreadyPaid)}`); return; }
      let existingPayments: Payment[] = [];
      try { if (typeof invoice.payments === 'string' && invoice.payments.trim()) existingPayments = JSON.parse(invoice.payments); else if (Array.isArray(invoice.payments)) existingPayments = invoice.payments; } catch (e) { existingPayments = []; }
      let updatedPayments = [...existingPayments];
      const lastPayment: Payment = { id: `quick-${Date.now()}`, amount: remainingAmount, date: new Date().toISOString().split('T')[0], method: invoice.paymentMethods || 'Autre', reference: 'Paiement rapide', notes: 'Marqué comme payé (bouton rapide)' };
      updatedPayments.push(lastPayment);
      await databases.updateDocument(DATABASE_ID, 'invoices', invoice.$id, { status: 'paid', paidAt: new Date().toISOString(), receivedAt: new Date().toISOString(), balance: 0, payments: JSON.stringify(updatedPayments) });
      await loadInvoices(true);
      setLastPaymentData({ invoice, payment: lastPayment });
      setShowReceiptChoiceModal(true);
    } catch (e: any) { alert(`Erreur: ${e.message}`); }
  };

  const handleConfirmPaid = async () => {
    if (!invoiceToConfirm) return;
    setShowConfirmPaidModal(false);
    await handleTogglePaid(invoiceToConfirm);
    setInvoiceToConfirm(null);
  };

  const handleOpenPaymentModal = (invoice: Invoice) => {
    const paidAmount = getPaidAmount(invoice);
    const remaining = Math.max(0, (invoice.total || 0) - paidAmount);
    setSelectedInvoice(invoice);
    setPaymentForm({ amount: remaining > 0 ? remaining.toFixed(2) : '', date: new Date().toISOString().split('T')[0], method: invoice.paymentMethods || 'Virement bancaire', reference: '', notes: '' });
    setShowPaymentModal(true);
  };

  const handleSavePayment = async () => {
    if (!selectedInvoice || !currentTeamId) return;
    const amount = parseFloat(paymentForm.amount);
    const paidAmount = getPaidAmount(selectedInvoice);
    const remaining = Math.max(0, (selectedInvoice.total || 0) - paidAmount);
    if (!amount || amount <= 0) { alert('Veuillez saisir un montant valide supérieur à 0'); return; }
    if (amount > remaining) { alert(`⚠️ Montant invalide !\n\nLe montant saisi (${amount.toFixed(2)} €) est supérieur au reste à payer (${remaining.toFixed(2)} €).`); return; }
    const newPayment: Payment = { id: Date.now().toString(), amount: amount, date: paymentForm.date, method: paymentForm.method, reference: paymentForm.reference || 'Paiement', notes: paymentForm.notes || '' };
    setShowPaymentModal(false);
    setPaymentToConfirm({ invoice: selectedInvoice, payment: newPayment });
    setShowConfirmPaymentModal(true);
  };

  const handleConfirmPayment = async () => {
    if (!paymentToConfirm || !currentTeamId) return;
    const { invoice, payment } = paymentToConfirm;
    setSavingPayment(true);
    try {
      let existingPayments: Payment[] = [];
      try { if (typeof invoice.payments === 'string' && invoice.payments.trim()) existingPayments = JSON.parse(invoice.payments); else if (Array.isArray(invoice.payments)) existingPayments = invoice.payments; } catch (e) { existingPayments = []; }
      const updatedPayments = [...existingPayments, payment];
      const totalPaid = updatedPayments.reduce((sum, p) => sum + (p.amount || 0), 0) + (invoice.deposit || 0);
      const newBalance = Math.max(0, (invoice.total || 0) - totalPaid);
      const newStatus = newBalance <= 0 ? 'paid' : 'sent';
      await databases.updateDocument(DATABASE_ID, 'invoices', invoice.$id, { payments: JSON.stringify(updatedPayments), balance: newBalance, status: newStatus, paidAt: newBalance <= 0 ? new Date().toISOString() : invoice.paidAt, receivedAt: newBalance <= 0 ? new Date().toISOString() : invoice.receivedAt });
      setShowConfirmPaymentModal(false);
      setPaymentToConfirm(null);
      await loadInvoices(true);
      setLastPaymentData({ invoice, payment });
      setShowReceiptChoiceModal(true);
    } catch (e: any) { alert(`Erreur: ${e.message}`); } finally { setSavingPayment(false); }
  };

  const handleArchive = async (id: string, num: string) => {
    if (!confirm(`Archiver/Annuler la facture ${num} ?`)) return;
    try {
      const doc = await databases.getDocument(DATABASE_ID, 'invoices', id);
      if (doc.teamId !== currentTeamId) { alert('⚠️ Accès refusé'); return; }
      await databases.updateDocument(DATABASE_ID, 'invoices', id, { status: 'cancelled' });
      loadInvoices();
    } catch (e: any) { alert(`Erreur: ${e.message}`); }
  };

  const handleUnarchive = async (id: string, num: string) => {
    try {
      const doc = await databases.getDocument(DATABASE_ID, 'invoices', id);
      if (doc.teamId !== currentTeamId) { alert('⚠️ Accès refusé'); return; }
      await databases.updateDocument(DATABASE_ID, 'invoices', id, { status: 'sent' });
      loadInvoices();
      setViewMode('active');
    } catch (e: any) { alert(`Erreur: ${e.message}`); }
  };

  const handleOpenAdvanceModal = (invoice: Invoice) => {
    if (invoice.deposit <= 0) { alert('Cette facture n\'a pas d\'acompte défini.'); return; }
    const percent = invoice.total > 0 ? ((invoice.deposit / invoice.total) * 100).toFixed(2) : '0.00';
    setAdvanceForm({ percent, invoiceId: invoice.$id });
    setShowAdvanceModal(true);
  };

  const handleGenerateAdvanceInvoice = async () => {
    const invoice = invoices.find(i => i.$id === advanceForm.invoiceId);
    if (!invoice || !currentTeamId) return;
    setSavingAdvance(true);
    try {
      const advanceAmount = invoice.deposit; 
      const realPercent = invoice.total > 0 ? ((advanceAmount / invoice.total) * 100).toFixed(2) : '0.00';
      const currentYear = new Date().getFullYear();
      const prefix = `ACO-${currentYear}-`;
      let maxNum = 0;
      const existingInvoices = await databases.listDocuments(DATABASE_ID, 'invoices', [Query.equal('teamId', currentTeamId), Query.limit(2000)]);
      existingInvoices.documents.forEach((doc: any) => {
        if (doc.invoiceNumber && doc.invoiceNumber.startsWith(prefix)) {
          const num = parseInt(doc.invoiceNumber.replace(prefix, ''), 10);
          if (!isNaN(num) && num > maxNum) maxNum = num;
        }
      });
      const advanceNumber = `${prefix}${String(maxNum + 1).padStart(3, '0')}`;
      const ratio = invoice.total > 0 ? (advanceAmount / invoice.total) : 0;
      const advanceHT = Math.round((invoice.subtotal || 0) * ratio * 100) / 100;
      const advanceTVA = Math.round((invoice.tax || 0) * ratio * 100) / 100;
      const advanceInvoice = {
        teamId: currentTeamId, userId: user.$id, invoiceNumber: advanceNumber, type: 'advance',
        originalQuoteId: invoice.quoteId || '', originalInvoiceId: invoice.$id, advancePercent: realPercent,
        clientToken: Math.random().toString(36).substring(2, 15), status: 'draft',
        issueDate: new Date().toISOString().split('T')[0],
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        subtotal: advanceHT, vatRate: invoice.vatRate || 20, vatAmount: advanceTVA, tax: advanceTVA,
        discount: 0, total: advanceAmount, deposit: 0, balance: advanceAmount,
        companyName: invoice.companyName, companyLegalForm: invoice.companyLegalForm,
        companyAddress: invoice.companyAddress, companySiret: invoice.companySiret,
        companyRcs: invoice.companyRcs, companyTva: invoice.companyTva,
        companyPhone: invoice.companyPhone, companyEmail: invoice.companyEmail,
        logoFileId: invoice.logoFileId, clientName: invoice.clientName,
        clientAddress: invoice.clientAddress, clientBillingAddress: invoice.clientBillingAddress,
        clientEmail: invoice.clientEmail, clientPhone: invoice.clientPhone,
        items: JSON.stringify([{ id: `advance-${Date.now()}`, reference: 'ACOMPTE', description: `Acompte de ${realPercent}% sur la facture ${invoice.invoiceNumber}`, quantity: 1, unit: 'forfait', unitPrice: advanceHT, tvaRate: invoice.vatRate || 20, total: advanceHT, discount: 0 }]),
        paymentMethods: invoice.paymentMethods, paymentConditions: invoice.paymentConditions,
        executionDelay: invoice.executionDelay,
        specialConditions: `Facture d'acompte - Référence facture d'origine : ${invoice.invoiceNumber}`,
        notes: `Acompte de ${realPercent}% sur la facture ${invoice.invoiceNumber}`
      };
      let perms = user?.secureTeamId ? [Permission.read(Role.team(user.secureTeamId)), Permission.update(Role.team(user.secureTeamId)), Permission.delete(Role.team(user.secureTeamId))] : [Permission.read(Role.users()), Permission.update(Role.users()), Permission.delete(Role.users())];
      await databases.createDocument(DATABASE_ID, 'invoices', ID.unique(), advanceInvoice, perms);
      setShowAdvanceModal(false);
      await loadInvoices(true);
      alert(`✅ Facture d'acompte ${advanceNumber} créée !\nMontant : ${advanceAmount.toFixed(2)} €`);
    } catch (e: any) { alert(`Erreur : ${e.message}`); } finally { setSavingAdvance(false); }
  };

  const handleGenerateFinalFromAdvance = async (advanceInvoice: Invoice) => {
    if (!currentTeamId || !advanceInvoice.originalQuoteId) { alert('Impossible de retrouver le devis d\'origine.'); return; }
    if (!confirm(`Générer la facture finale pour ${advanceInvoice.clientName} ?`)) return;
    setGeneratingFinal(true);
    try {
      const quoteDoc = await verifyDocumentAccess('quotes', advanceInvoice.originalQuoteId, currentTeamId!);
      const quote = quoteDoc as any;
      const currentYear = new Date().getFullYear();
      const prefix = `FAC-${currentYear}-`;
      let maxNum = 0;
      const existingInvoices = await databases.listDocuments(DATABASE_ID, 'invoices', [Query.equal('teamId', currentTeamId), Query.limit(2000)]);
      existingInvoices.documents.forEach((doc: any) => {
        if (doc.invoiceNumber && doc.invoiceNumber.startsWith(prefix)) {
          const num = parseInt(doc.invoiceNumber.replace(prefix, ''), 10);
          if (!isNaN(num) && num > maxNum) maxNum = num;
        }
      });
      const finalNumber = `${prefix}${String(maxNum + 1).padStart(3, '0')}`;
      const advanceAmount = advanceInvoice.total || 0;
      const totalAmount = quote.total || 0;
      const remainingAmount = Math.max(0, totalAmount - advanceAmount);
      const finalInvoice = {
        teamId: currentTeamId, userId: user.$id, invoiceNumber: finalNumber, type: 'standard',
        originalQuoteId: advanceInvoice.originalQuoteId, originalInvoiceId: advanceInvoice.$id,
        clientToken: Math.random().toString(36).substring(2, 15), status: 'draft',
        issueDate: new Date().toISOString().split('T')[0],
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        subtotal: quote.subtotal || 0, vatRate: quote.vatRate || 20, vatAmount: quote.tax || 0,
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
        notes: `Facture finale - Acompte de ${advanceAmount.toFixed(2)} € déjà versé via ${advanceInvoice.invoiceNumber}`
      };
      let perms = user?.secureTeamId ? [Permission.read(Role.team(user.secureTeamId)), Permission.update(Role.team(user.secureTeamId)), Permission.delete(Role.team(user.secureTeamId))] : [Permission.read(Role.users()), Permission.update(Role.users()), Permission.delete(Role.users())];
      await databases.createDocument(DATABASE_ID, 'invoices', ID.unique(), finalInvoice, perms);
      await databases.updateDocument(DATABASE_ID, 'quotes', advanceInvoice.originalQuoteId, { status: 'Facturé' });
      await loadInvoices(true);
      alert(`✅ Facture finale ${finalNumber} créée !\nTotal : ${totalAmount.toFixed(2)} €\nAcompte : -${advanceAmount.toFixed(2)} €\nNet : ${remainingAmount.toFixed(2)} €`);
    } catch (e: any) { alert(`Erreur : ${e.message}`); } finally { setGeneratingFinal(false); }
  };

  const openCreditModal = (inv: Invoice) => {
    const existingCredits = getTotalCreditsForInvoice(inv.$id);
    const maxCreditAllowed = Math.max(0, (inv.total || 0) - existingCredits);
    
    if (maxCreditAllowed <= 0) {
      alert('⚠️ Cette facture a déjà été entièrement couverte par des avoirs.\nAucun nouvel avoir ne peut être émis.');
      return;
    }
    
    setCreditInvoice(inv);
    setCreditForm(
      existingCredits > 0
        ? { type: 'partial', amount: maxCreditAllowed.toFixed(2), reason: '' }
        : { type: 'total', amount: inv.total.toFixed(2), reason: '' }
    );
    setShowCreditModal(true);
  };

  const handleGenerateCreditNote = async () => {
    if (!creditInvoice || !currentTeamId) return;
    const creditAmount = parseFloat(creditForm.amount);
    
    const existingCreditsTotal = getTotalCreditsForInvoice(creditInvoice.$id);
    const maxCreditAllowed = Math.max(0, (creditInvoice.total || 0) - existingCreditsTotal);
    
    if (maxCreditAllowed <= 0) {
      alert('⚠️ Cette facture est déjà entièrement couverte par des avoirs.\nAucun nouvel avoir ne peut être émis.');
      return;
    }
    
    if (creditForm.type === 'total') {
      if (existingCreditsTotal > 0) {
        alert(`⚠️ Cette facture a déjà ${existingCreditsTotal.toFixed(2)} € d'avoirs émis.\nUtilisez plutôt "Avoir Partiel" pour le montant restant.`);
        return;
      }
    }
    
    if (creditForm.type === 'partial' && (isNaN(creditAmount) || creditAmount <= 0 || creditAmount > maxCreditAllowed)) {
      alert(`⚠️ Montant invalide !\n\nMontant saisi : ${creditAmount.toFixed(2)} €\nMax autorisé (total facture - avoirs déjà émis) : ${maxCreditAllowed.toFixed(2)} €`);
      return;
    }
    
    if (!creditForm.reason.trim()) {
      alert('Veuillez indiquer un motif pour l\'avoir (obligatoire légalement).');
      return;
    }

    setSavingCredit(true);
    try {
      const currentYear = new Date().getFullYear();
      const prefix = `AV-${currentYear}-`;
      let maxNum = 0;
      const existingInvoices = await databases.listDocuments(DATABASE_ID, 'invoices', [Query.equal('teamId', currentTeamId), Query.limit(2000)]);
      existingInvoices.documents.forEach((doc: any) => {
        if (doc.invoiceNumber && doc.invoiceNumber.startsWith(prefix)) {
          const num = parseInt(doc.invoiceNumber.replace(prefix, ''), 10);
          if (!isNaN(num) && num > maxNum) maxNum = num;
        }
      });
      const creditNumber = `${prefix}${String(maxNum + 1).padStart(3, '0')}`;
      
      const ratio = creditForm.type === 'total' ? 1 : (creditAmount / creditInvoice.total);
      const creditSubtotal = Math.round((creditInvoice.subtotal || 0) * ratio * 100) / 100;
      const creditTax = Math.round((creditInvoice.tax || 0) * ratio * 100) / 100;
      const creditTotal = creditForm.type === 'total' ? creditInvoice.total : creditAmount;

      const creditPayload = {
        teamId: currentTeamId, userId: user.$id, invoiceNumber: creditNumber, type: 'credit',
        originalInvoiceId: creditInvoice.$id, originalQuoteId: creditInvoice.quoteId || '',
        clientToken: Math.random().toString(36).substring(2, 15), 
        status: 'paid',
        paidAt: new Date().toISOString(),
        issueDate: new Date().toISOString().split('T')[0], dueDate: new Date().toISOString().split('T')[0],
        subtotal: creditSubtotal, vatRate: creditInvoice.vatRate || 20, vatAmount: creditTax, tax: creditTax,
        discount: 0, total: creditTotal, deposit: 0, balance: 0,
        companyName: creditInvoice.companyName, companyLegalForm: creditInvoice.companyLegalForm,
        companyAddress: creditInvoice.companyAddress, companySiret: creditInvoice.companySiret,
        companyRcs: creditInvoice.companyRcs, companyTva: creditInvoice.companyTva,
        companyPhone: creditInvoice.companyPhone, companyEmail: creditInvoice.companyEmail,
        logoFileId: creditInvoice.logoFileId, clientName: creditInvoice.clientName,
        clientAddress: creditInvoice.clientAddress, clientBillingAddress: creditInvoice.clientBillingAddress,
        clientEmail: creditInvoice.clientEmail, clientPhone: creditInvoice.clientPhone,
        items: creditInvoice.items,
        paymentMethods: creditInvoice.paymentMethods, paymentConditions: creditInvoice.paymentConditions,
        executionDelay: creditInvoice.executionDelay, specialConditions: creditInvoice.specialConditions,
        notes: `MOTIF AVOIR : ${creditForm.reason}\nRéférence facture d'origine : ${creditInvoice.invoiceNumber}`
      };

      let perms = user?.secureTeamId ? [Permission.read(Role.team(user.secureTeamId)), Permission.update(Role.team(user.secureTeamId)), Permission.delete(Role.team(user.secureTeamId))] : [Permission.read(Role.users()), Permission.update(Role.users()), Permission.delete(Role.users())];
      const createdCredit = await databases.createDocument(DATABASE_ID, 'invoices', ID.unique(), creditPayload, perms);
      
      await generateDebitReceiptPDF(createdCredit as unknown as Invoice);
      
      setShowCreditModal(false);
      setCreditInvoice(null);
      await loadInvoices(true);
      
      const newTotalCredits = existingCreditsTotal + creditTotal;
      const remainingOnInvoice = Math.max(0, (creditInvoice.total || 0) - newTotalCredits);
      
      alert(`✅ Facture d'avoir ${creditNumber} créée !\n💰 Montant de cet avoir : ${creditTotal.toFixed(2)} €\n📊 Total des avoirs sur la facture : ${newTotalCredits.toFixed(2)} €\n💵 Net restant sur la facture : ${remainingOnInvoice.toFixed(2)} €`);
    } catch (e: any) { alert(`Erreur : ${e.message}`); } finally { setSavingCredit(false); }
  };

  const generatePDF = async (inv: Invoice) => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const W = 210, M = 20;
    let items: InvoiceItem[] = [];
    try { items = JSON.parse(inv.items || '[]'); } catch(e) {}
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
      } catch(e) {}
    }
    let Y = M;
    if (logoB64) { try { doc.addImage(logoB64, logoB64.includes('image/png') ? 'PNG' : 'JPEG', M, Y, 30, 15); } catch (e) {} }
    doc.setFontSize(14); doc.setFont(undefined, 'bold');
    doc.text(inv.companyName || '', M, Y + 22);
    doc.setFontSize(8); doc.setFont(undefined, 'normal');
    let infoY = Y + 27;
    if (inv.companyAddress) { doc.text(inv.companyAddress, M, infoY); infoY += 4; }
    if (inv.companyPhone) { doc.text(`Tél: ${inv.companyPhone}`, M, infoY); infoY += 4; }
    if (inv.companyEmail) { doc.text(`Email: ${inv.companyEmail}`, M, infoY); infoY += 4; }
    if (inv.companySiret) { doc.text(`SIRET: ${inv.companySiret}`, M, infoY); infoY += 4; }
    if (inv.companyTva && !inv.companyTva.includes('non')) { doc.text(`TVA: ${inv.companyTva}`, M, infoY); infoY += 4; }
    const rX = W - M;
    
    const pdfType = inv.type || 'standard';
    const isCredit = pdfType === 'credit';
    const pdfTitle = isCredit ? 'FACTURE D\'AVOIR' : (pdfType === 'advance' ? 'FACTURE D\'ACOMPTE' : pdfType === 'balance' ? 'FACTURE DE SOLDE' : 'FACTURE');
    
    doc.setFontSize(16); doc.setFont(undefined, 'bold');
    if (isCredit) doc.setTextColor(220, 38, 38);
    else doc.setTextColor(0, 0, 0);
    doc.text(`${pdfTitle} N° ${inv.invoiceNumber}`, rX, Y + 5, { align: 'right' });
    doc.setTextColor(0, 0, 0);
    
    if (isCredit) {
      doc.setFontSize(8); doc.setTextColor(100, 100, 100);
      const originalInv = invoices.find(i => i.$id === inv.originalInvoiceId);
      doc.text(`Réf. origine : ${originalInv?.invoiceNumber || 'N/A'}`, rX, Y + 12, { align: 'right' });
      doc.text(`Motif : ${inv.notes?.split('\n')[0]?.replace('MOTIF AVOIR : ', '') || 'Non spécifié'}`, rX, Y + 16, { align: 'right' });
      doc.setTextColor(0, 0, 0);
    }

    doc.setFontSize(8); doc.setFont(undefined, 'normal');
    doc.text(`Date: ${inv.issueDate ? new Date(inv.issueDate).toLocaleDateString('fr-FR') : '-'}`, rX, isCredit ? Y + 22 : Y + 10, { align: 'right' });
    if (inv.dueDate && !isCredit) doc.text(`Échéance: ${new Date(inv.dueDate).toLocaleDateString('fr-FR')}`, rX, Y + 14, { align: 'right' });
    const clientBoxX = rX - 60; const clientBoxY = Y + (isCredit ? 26 : 18);
    doc.setDrawColor(150); doc.setLineWidth(0.3);
    doc.rect(clientBoxX, clientBoxY, 60, 22);
    doc.setFontSize(8); doc.setFont(undefined, 'bold');
    doc.text('CLIENT', clientBoxX + 2, clientBoxY + 4);
    doc.setFont(undefined, 'normal'); doc.setFontSize(9);
    doc.text(inv.clientName || '', clientBoxX + 2, clientBoxY + 9);
    if (inv.clientAddress) doc.text(inv.clientAddress.substring(0, 50), clientBoxX + 2, clientBoxY + 13);
    if (inv.clientEmail) doc.text(inv.clientEmail, clientBoxX + 2, clientBoxY + 17);
    Y = Math.max(infoY, clientBoxY + 25) + 5;
    const tableData = items.map(i => {
      const ld = i.discount || 0;
      const lt = i.quantity * i.unitPrice * (1 - ld / 100);
      return [i.reference || '-', i.description, i.quantity.toFixed(2), i.unit, i.unitPrice.toFixed(2) + ' €', ld + '%', lt.toFixed(2) + ' €', i.tvaRate + '%'];
    });
    autoTable(doc, {
      startY: Y, head: [['Réf.', 'Désignation', 'Qté', 'Unité', 'Prix U HT', 'Remise', 'Total HT', 'TVA']],
      body: tableData, theme: 'grid', margin: { left: M, right: M },
      headStyles: { fillColor: isCredit ? [220, 38, 38] : [37, 99, 235], textColor: 255, fontSize: 8, fontStyle: 'bold' },
      styles: { fontSize: 8, cellPadding: 2, lineColor: [200, 200, 200], lineWidth: 0.2 },
      columnStyles: { 0: { cellWidth: 15 }, 1: { cellWidth: 60 }, 2: { cellWidth: 12, halign: 'center' }, 3: { cellWidth: 12, halign: 'center' }, 4: { cellWidth: 18, halign: 'right' }, 5: { cellWidth: 12, halign: 'right' }, 6: { cellWidth: 18, halign: 'right', fontStyle: 'bold' }, 7: { cellWidth: 12, halign: 'right' } }
    });
    let ty = (doc as any).lastAutoTable.finalY + 8;
    const totalsX = W - M - 60;
    doc.setFontSize(8); doc.setFont(undefined, 'normal'); doc.setTextColor(0, 0, 0);
    const totalLine = (label: string, value: string, bold = false, color: number[] = [0, 0, 0]) => {
      doc.setFont(undefined, bold ? 'bold' : 'normal'); doc.setTextColor(color[0], color[1], color[2]);
      doc.text(label, totalsX, ty); doc.text(value, W - M, ty, { align: 'right' });
      doc.setDrawColor(200); doc.setLineWidth(0.2); doc.line(totalsX, ty + 1, W - M, ty + 1); ty += 5;
    };
    totalLine('Total HT', `${pdfSubtotal.toFixed(2)} €`);
    if (pdfDiscount > 0) totalLine(`Remise ${pdfDiscount}%`, `- ${pdfDiscountAmount.toFixed(2)} €`, false, [220, 38, 38]);
    totalLine('Total HT après remise', `${pdfTaxableAmount.toFixed(2)} €`);
    totalLine('Total TVA', `${pdfTax.toFixed(2)} €`);
    doc.setFont(undefined, 'bold'); doc.setTextColor(0, 0, 0);
    doc.text('Total TTC', totalsX, ty); doc.text(`${pdfTotal.toFixed(2)} €`, W - M, ty, { align: 'right' });
    doc.setDrawColor(0); doc.setLineWidth(0.5); doc.line(totalsX, ty + 1.5, W - M, ty + 1.5); ty += 6;
    
    if (!isCredit && pdfType === 'standard') {
      const linkedCredits = getCreditsListForInvoice(inv.$id);
      if (linkedCredits.length > 0) {
        const totalCredits = linkedCredits.reduce((sum, c) => sum + (c.total || 0), 0);
        ty += 4;
        doc.setDrawColor(220, 38, 38); doc.setLineWidth(0.5);
        doc.line(totalsX, ty, W - M, ty); ty += 5;
        doc.setFontSize(9); doc.setFont(undefined, 'bold'); doc.setTextColor(220, 38, 38);
        doc.text('AVOIRS LIÉS À CETTE FACTURE', totalsX, ty); ty += 5;
        doc.setFontSize(7); doc.setFont(undefined, 'normal'); doc.setTextColor(100, 100, 100);
        linkedCredits.forEach(credit => {
          const reason = credit.notes?.split('\n')[0]?.replace('MOTIF AVOIR : ', '') || 'Sans motif';
          doc.text(`${credit.invoiceNumber} - ${new Date(credit.issueDate || 0).toLocaleDateString('fr-FR')} - ${reason}`, totalsX, ty);
          doc.text(`- ${credit.total.toFixed(2)} €`, W - M, ty, { align: 'right' });
          ty += 4;
        });
        doc.setFontSize(8); doc.setFont(undefined, 'bold'); doc.setTextColor(220, 38, 38);
        doc.text('Total des avoirs', totalsX, ty); doc.text(`- ${totalCredits.toFixed(2)} €`, W - M, ty, { align: 'right' });
        ty += 5;
        doc.setDrawColor(220, 38, 38); doc.setLineWidth(0.8);
        doc.line(totalsX, ty, W - M, ty); ty += 5;
        doc.setFontSize(11); doc.setFont(undefined, 'bold'); doc.setTextColor(0, 100, 0);
        const netTTC = Math.max(0, pdfTotal - totalCredits);
        doc.text('NET APRÈS AVOIRS', totalsX, ty); doc.text(`${netTTC.toFixed(2)} €`, W - M, ty, { align: 'right' });
        ty += 6;
      }
    }
    
    if (pdfDeposit > 0) {
      ty += 2; doc.setFontSize(9); doc.setFont(undefined, 'bold'); doc.setTextColor(37, 99, 235);
      doc.text('ACOMPTE DÉJÀ VERSÉ', totalsX, ty); ty += 5;
      doc.setFontSize(8); doc.setFont(undefined, 'normal'); doc.setTextColor(0, 0, 0);
      if (inv.originalInvoiceId) {
        const advanceInvoice = invoices.find(i => i.$id === inv.originalInvoiceId);
        if (advanceInvoice) {
          doc.text(`Référence : ${advanceInvoice.invoiceNumber}`, totalsX, ty);
          doc.text(`Date : ${advanceInvoice.issueDate ? new Date(advanceInvoice.issueDate).toLocaleDateString('fr-FR') : '-'}`, W - M, ty, { align: 'right' });
          ty += 4;
        }
      }
      totalLine('Montant de l\'acompte', `- ${pdfDeposit.toFixed(2)} €`, false, [37, 99, 235]);
      ty += 2; doc.setDrawColor(37, 99, 235); doc.setLineWidth(0.8);
      doc.line(totalsX, ty, W - M, ty); ty += 5;
      doc.setFontSize(11); doc.setFont(undefined, 'bold'); doc.setTextColor(37, 99, 235);
      doc.text('NET À PAYER', totalsX, ty); doc.text(`${pdfBalance.toFixed(2)} €`, W - M, ty, { align: 'right' }); ty += 6;
      doc.setDrawColor(200); doc.setLineWidth(0.2);
    }
    if (inv.paymentMethods || inv.paymentConditions) {
      ty += 5; doc.setFontSize(10); doc.setFont(undefined, 'bold'); doc.setTextColor(0, 0, 0);
      doc.text('Conditions de règlement', M, ty);
      doc.setDrawColor(150); doc.setLineWidth(0.3); doc.line(M, ty + 1, W - M, ty + 1); ty += 6;
      doc.setFontSize(8); doc.setFont(undefined, 'normal');
      if (inv.paymentMethods) { doc.text(`Mode: ${inv.paymentMethods}`, M, ty); ty += 4; }
      if (inv.paymentConditions) { doc.text(`Conditions: ${inv.paymentConditions}`, M, ty); ty += 4; }
      if (inv.executionDelay) { doc.text(`Délai: ${inv.executionDelay}`, M, ty); ty += 4; }
    }
    if (!pdfIsTvaApplicable && inv.companyTva) {
      doc.setFontSize(7); doc.setFont(undefined, 'italic'); doc.setTextColor(100, 100, 100);
      doc.text(inv.companyTva, M, 285);
    }
    doc.save(`${pdfTitle}_${inv.invoiceNumber}.pdf`);
  };

  // ========================================================================
  // ✅ KPIs BASE ENCAISSEMENT (règle micro-entreprise) + détection régime TVA
  // ========================================================================
  const isSubjectToVAT = useMemo(() => {
    return invoices.some(inv => 
      inv.companyTva && 
      inv.companyTva.trim() !== '' && 
      !inv.companyTva.toLowerCase().includes('non applicable')
    );
  }, [invoices]);

  const vatBaseLabel = isSubjectToVAT ? 'HT' : 'TTC';
  const amountOf = (inv: Invoice): number => isSubjectToVAT ? (inv.subtotal || 0) : (inv.total || 0);

  const filtered = invoices.filter(inv => {
    const searchStr = `${inv.invoiceNumber} ${inv.clientName} ${inv.status} ${inv.total}`.toLowerCase();
    const matchSearch = search === '' || searchStr.includes(search.toLowerCase());
    const matchStatus = filterStatus === 'all' || inv.status === filterStatus;
    const matchType = filterType === 'all' || inv.type === filterType;
    const matchView = viewMode === 'active' ? inv.status !== 'cancelled' : inv.status === 'cancelled';
    return matchSearch && matchStatus && matchType && matchView;
  });

  const revenueInvoices = invoices.filter(i => 
    (i.type === 'standard' || i.type === 'advance' || i.type === 'balance') && i.status !== 'cancelled'
  );

  const creditInvoices = invoices.filter(i => i.type === 'credit' && i.status !== 'cancelled');

  const caFacture = revenueInvoices.reduce((sum, i) => sum + amountOf(i), 0);

  const tvaCollectee = revenueInvoices.reduce((sum, i) => sum + (i.tax || 0), 0);
  const tvaSurAvoirs = creditInvoices.reduce((sum, i) => sum + (i.tax || 0), 0);
  const tvaNette = Math.max(0, tvaCollectee - tvaSurAvoirs);

  const paidFraction = (i: Invoice): number =>
    i.total > 0 ? Math.min(1, getPaidAmount(i) / i.total) : 0;

  const caEncaisse = revenueInvoices.reduce((sum, i) => sum + amountOf(i) * paidFraction(i), 0);

  const totalDecaisse = creditInvoices.reduce((sum, i) => sum + amountOf(i), 0);

  const caNet = Math.max(0, caEncaisse - totalDecaisse);

  // ✅ RESTE À ENCAISSER basé sur getNetRemaining (après paiements ET avoirs)
  const resteAEncaisser = revenueInvoices.reduce((sum, i) => sum + getNetRemaining(i), 0);

  // ✅ EN RETARD basé sur getNetRemaining (exclut les factures totalement couvertes)
  const overdueInvoices = revenueInvoices.filter(i => 
    getDaysOverdue(i.dueDate, i.status) > 0 && getNetRemaining(i) > 0
  );
  const overdueCount = overdueInvoices.length;
  const overdueAmount = overdueInvoices.reduce((sum, i) => sum + (i.balance || 0), 0);

  const advanceInvoiceIds = new Set(invoices.filter(i => i.type === 'advance').map(i => i.originalInvoiceId));
  const balanceInvoiceIds = new Set(invoices.filter(i => i.type === 'standard' && i.originalInvoiceId && invoices.find(a => a.$id === i.originalInvoiceId && a.type === 'advance')).map(i => i.originalInvoiceId));
  const finalInvoiceIds = new Set(invoices.filter(i => i.type === 'standard' && i.originalInvoiceId && invoices.find(a => a.$id === i.originalInvoiceId && a.type === 'advance')).map(i => i.$id));

  const formatDate = (d?: string) => d ? new Date(d).toLocaleDateString('fr-FR') : '-';

  // ✅ Guard wrappé dans le Sidebar
  if (permLoading) return <Sidebar><div className="flex items-center justify-center h-full w-full"><div className="text-slate-500 dark:text-slate-400 text-lg animate-pulse">Vérification des droits...</div></div></Sidebar>;
  if (!hasPermission('invoices.view')) return null;

  return (
    <Sidebar>
      <div className="min-h-full bg-slate-50 dark:bg-slate-900">
        <header className="bg-white dark:bg-slate-800 shadow-sm border-b border-slate-200 dark:border-slate-700 sticky top-0 z-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-3">
                <div>
                  <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Receipt size={24} className="text-purple-600" />
                    Factures
                  </h1>
                  <p className="text-sm text-slate-500 dark:text-slate-400">{filtered.length} document(s) {viewMode === 'active' ? 'actif(s)' : 'archivé(s)'}</p>
                </div>
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {/* ✅ KPIs BASE ENCAISSEMENT */}
          <div className={`grid gap-3 sm:gap-4 mb-6 ${isSubjectToVAT ? 'grid-cols-2 md:grid-cols-4 lg:grid-cols-7' : 'grid-cols-2 md:grid-cols-3 lg:grid-cols-6'}`}>
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-4 border-l-4 border-l-blue-500">
              <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-semibold">Facturé ({vatBaseLabel})</p>
              <p className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white mt-1">{fm(caFacture)}</p>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">Émis, non encaissé</p>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-4 border-l-4 border-l-teal-500">
              <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-semibold">Encaissé ({vatBaseLabel})</p>
              <p className="text-lg sm:text-xl font-bold text-teal-600 dark:text-teal-400 mt-1">{fm(caEncaisse)}</p>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">Entré en banque</p>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-4 border-l-4 border-l-orange-500">
              <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-semibold">Décaissé ({vatBaseLabel})</p>
              <p className="text-lg sm:text-xl font-bold text-orange-600 dark:text-orange-400 mt-1">- {fm(totalDecaisse)}</p>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">{creditInvoices.length} avoir(s)</p>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-4 border-l-4 border-l-green-500">
              <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-semibold">CA Net ({vatBaseLabel})</p>
              <p className="text-lg sm:text-xl font-bold text-green-600 dark:text-green-400 mt-1">{fm(caNet)}</p>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">Encaissé − Décaissé</p>
            </div>
            {isSubjectToVAT && (
              <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-4 border-l-4 border-l-cyan-500">
                <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-semibold">TVA collectée nette</p>
                <p className="text-lg sm:text-xl font-bold text-cyan-600 dark:text-cyan-400 mt-1">{fm(tvaNette)}</p>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">À reverser à l'État</p>
              </div>
            )}
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-4 border-l-4 border-l-purple-500">
              <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-semibold">Reste à encaisser ({vatBaseLabel})</p>
              <p className="text-lg sm:text-xl font-bold text-purple-600 dark:text-purple-400 mt-1">{fm(resteAEncaisser)}</p>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">Non payé (après avoirs)</p>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-4 border-l-4 border-l-amber-500">
              <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-semibold">En retard (TTC)</p>
              <p className="text-lg sm:text-xl font-bold text-amber-600 dark:text-amber-400 mt-1">{fm(overdueAmount)}</p>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">{overdueCount} facture(s)</p>
            </div>
          </div>

          <div className="flex border-b border-slate-200 dark:border-slate-700 mb-6">
            <button onClick={() => setViewMode('active')} className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${viewMode === 'active' ? 'border-purple-600 text-purple-600 dark:text-purple-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}>
              Actives ({invoices.filter(i => i.status !== 'cancelled').length})
            </button>
            <button onClick={() => setViewMode('archived')} className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${viewMode === 'archived' ? 'border-purple-600 text-purple-600 dark:text-purple-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}>
              Archivées ({invoices.filter(i => i.status === 'cancelled').length})
            </button>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 mb-6">
            <div className="relative flex-1">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input placeholder="Rechercher (N°, client, montant...)" value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-3 border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white rounded-lg focus:ring-2 focus:ring-purple-500 outline-none text-sm transition-shadow" />
            </div>
            {viewMode === 'active' && (
              <div className="flex gap-3">
                <div className="relative sm:w-48 flex-1">
                  <Filter size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="w-full pl-10 pr-4 py-3 border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white rounded-lg focus:ring-2 focus:ring-purple-500 outline-none text-sm bg-white dark:bg-slate-800 appearance-none">
                    <option value="all">Tous statuts</option>
                    {Object.entries(statusLabels).filter(([k]) => k !== 'cancelled' && k !== 'partial').map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                </div>
                <div className="relative sm:w-48 flex-1">
                  <Filter size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <select value={filterType} onChange={e => setFilterType(e.target.value)} className="w-full pl-10 pr-4 py-3 border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white rounded-lg focus:ring-2 focus:ring-purple-500 outline-none text-sm bg-white dark:bg-slate-800 appearance-none">
                    <option value="all">Tous types</option>
                    {Object.entries(typeLabels).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                </div>
              </div>
            )}
          </div>

          {loading ? (
            <div className="text-center py-12 text-slate-500 dark:text-slate-400 animate-pulse">Chargement...</div>
          ) : filtered.length === 0 ? (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-12 text-center shadow-sm">
              <Receipt size={48} className="mx-auto text-slate-300 dark:text-slate-600 mb-4" />
              <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-2">Aucune facture {viewMode === 'active' ? 'active' : 'archivée'}</h3>
            </div>
          ) : (
            <>
              <div className="hidden md:block bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">N° Facture</th>
                      <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Client</th>
                      <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Date</th>
                      <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Échéance</th>
                      <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Total TTC</th>
                      <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Payé</th>
                      <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Reste</th>
                      <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Statut</th>
                      <th className="p-4 text-right text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {filtered.map(inv => {
                      const daysOverdue = getDaysOverdue(inv.dueDate, inv.status);
                      const hasAdvance = advanceInvoiceIds.has(inv.$id);
                      const hasBalance = balanceInvoiceIds.has(inv.$id);
                      const isFinal = finalInvoiceIds.has(inv.$id);
                      const paidAmountForInvoice = getPaidAmount(inv);
                      const creditsForInvoice = inv.type === 'standard' ? getTotalCreditsForInvoice(inv.$id) : 0;
                      const remaining = Math.max(0, (inv.total || 0) - paidAmountForInvoice - creditsForInvoice);
                      const maxCreditAllowed = Math.max(0, (inv.total || 0) - creditsForInvoice);
                      const displayStatus = getDisplayStatus(inv);

                      return (
                        <tr key={inv.$id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                          <td className="p-4">
                            <div className="flex flex-col gap-1">
                              <span className={`inline-flex items-center gap-1 text-xs font-mono font-semibold px-2 py-1 rounded w-fit ${typeColors[inv.type || 'standard']}`}>
                                <Hash size={12} />{inv.invoiceNumber}
                              </span>
                              {(inv.type === 'advance' || inv.type === 'balance' || inv.type === 'credit') && (
                                <span className="text-[10px] text-slate-500 dark:text-slate-400 italic">{typeLabels[inv.type]}</span>
                              )}
                            </div>
                          </td>
                          <td className="p-4 text-sm font-medium text-slate-900 dark:text-white">{inv.clientName || '-'}</td>
                          <td className="p-4 text-sm text-slate-600 dark:text-slate-300">{formatDate(inv.issueDate)}</td>
                          <td className="p-4 text-sm text-slate-600 dark:text-slate-300">
                            {formatDate(inv.dueDate)}
                            {daysOverdue > 0 && <span className="block text-xs text-red-600 dark:text-red-400 font-semibold mt-1">+{daysOverdue} j</span>}
                          </td>
                          <td className="p-4 text-sm font-semibold text-slate-900 dark:text-white">{fm(inv.total || 0)}</td>
                          <td className="p-4 text-sm font-medium text-green-600 dark:text-green-400">{fm(paidAmountForInvoice)}</td>
                          <td className="p-4 text-sm font-medium text-red-600 dark:text-red-400">
                            {inv.status === 'paid' || inv.type === 'credit' ? '0,00 €' : fm(remaining)}
                            {inv.type === 'standard' && creditsForInvoice > 0 && (
                              <span className="block text-[10px] text-orange-600 dark:text-orange-400 mt-0.5">
                                (Avoirs: {fm(creditsForInvoice)})
                              </span>
                            )}
                          </td>
                          <td className="p-4">
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${displayStatus.color}`}>
                              {displayStatus.label}
                            </span>
                          </td>
                          <td className="p-4 text-right">
                            <div className="flex justify-end gap-1">
                              {viewMode === 'active' ? (
                                <>
                                  {inv.clientToken && (
                                    <button onClick={() => handleCopyLink(inv)} className={`p-2 rounded-lg transition-colors ${copiedToken === inv.clientToken ? 'text-green-600 bg-green-50 dark:bg-green-900/30' : 'text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30'}`} title="Copier le lien">
                                      {copiedToken === inv.clientToken ? <CheckCircle2 size={16} /> : <Copy size={16} />}
                                    </button>
                                  )}
                                  {hasPermission('invoices.create') && inv.type === 'standard' && inv.status === 'paid' && maxCreditAllowed > 0 && (
                                    <button onClick={() => openCreditModal(inv)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors" title="Créer un avoir">
                                      <FileMinus size={16} />
                                    </button>
                                  )}
                                  {hasPermission('invoices.create') && inv.type === 'standard' && inv.deposit > 0 && inv.status !== 'paid' && !hasAdvance && !isFinal && (
                                    <button onClick={() => handleOpenAdvanceModal(inv)} className="p-2 text-blue-500 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors" title="Générer facture d'acompte">
                                      <FileText size={16} />
                                    </button>
                                  )}
                                  {hasPermission('invoices.create') && inv.type === 'advance' && inv.status === 'paid' && !hasBalance && (
                                    <button onClick={() => handleGenerateFinalFromAdvance(inv)} disabled={generatingFinal} className="p-2 text-purple-500 hover:text-purple-700 hover:bg-purple-50 dark:hover:bg-purple-900/30 rounded-lg transition-colors disabled:opacity-50" title="Générer la facture finale">
                                      <Receipt size={16} />
                                    </button>
                                  )}
                                  {hasPermission('invoices.mark_paid') && inv.status !== 'paid' && inv.status !== 'cancelled' && inv.type !== 'credit' && remaining > 0 && (
                                    <>
                                      <button onClick={() => { setInvoiceToConfirm(inv); setShowConfirmPaidModal(true); }} className="p-2 text-green-500 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-900/30 rounded-lg transition-colors" title="Marquer payée">
                                        <CheckCircle2 size={16} />
                                      </button>
                                      <button onClick={() => handleOpenPaymentModal(inv)} className="p-2 text-blue-500 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors" title="Enregistrer paiement">
                                        <DollarSign size={16} />
                                      </button>
                                    </>
                                  )}
                                  <button onClick={() => generatePDF(inv)} className="p-2 text-slate-400 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/30 rounded-lg" title="PDF">
                                    <Download size={16} />
                                  </button>
                                  {hasPermission('invoices.delete') && (
                                    <button onClick={() => handleArchive(inv.$id, inv.invoiceNumber)} className="p-2 text-slate-400 hover:text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/30 rounded-lg" title="Archiver">
                                      <Archive size={16} />
                                    </button>
                                  )}
                                </>
                              ) : (
                                <button onClick={() => handleUnarchive(inv.$id, inv.invoiceNumber)} className="inline-flex items-center space-x-1 px-3 py-1.5 text-sm font-medium text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/30 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/50 transition-colors">
                                  <RotateCcw size={14} /><span>Désarchiver</span>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="md:hidden space-y-4">
                {filtered.map(inv => {
                  const daysOverdue = getDaysOverdue(inv.dueDate, inv.status);
                  const paidAmountForInvoice = getPaidAmount(inv);
                  const creditsForInvoice = inv.type === 'standard' ? getTotalCreditsForInvoice(inv.$id) : 0;
                  const remaining = Math.max(0, (inv.total || 0) - paidAmountForInvoice - creditsForInvoice);
                  const maxCreditAllowed = Math.max(0, (inv.total || 0) - creditsForInvoice);
                  const hasAdvance = advanceInvoiceIds.has(inv.$id);
                  const hasBalance = balanceInvoiceIds.has(inv.$id);
                  const isFinal = finalInvoiceIds.has(inv.$id);
                  const displayStatus = getDisplayStatus(inv);

                  return (
                    <div key={inv.$id} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 shadow-sm">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <span className={`inline-flex items-center gap-1 text-xs font-mono font-semibold px-2 py-1 rounded mb-1 ${typeColors[inv.type || 'standard']}`}>
                            <Hash size={12} /> {inv.invoiceNumber}
                          </span>
                          <h3 className="font-semibold text-slate-900 dark:text-white">{inv.clientName || 'Client inconnu'}</h3>
                          <p className="text-xs text-slate-500 dark:text-slate-400">Émise le {formatDate(inv.issueDate)} • Échéance: {formatDate(inv.dueDate)}</p>
                          {daysOverdue > 0 && <p className="text-xs text-red-600 dark:text-red-400 font-semibold mt-1">+{daysOverdue} j de retard</p>}
                        </div>
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${displayStatus.color}`}>
                          {displayStatus.label}
                        </span>
                      </div>
                      
                      <div className="grid grid-cols-3 gap-2 py-3 border-t border-b border-slate-100 dark:border-slate-700 mb-3 text-center">
                        <div>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">Total</p>
                          <p className="text-sm font-bold text-slate-900 dark:text-white">{fm(inv.total || 0)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">Payé</p>
                          <p className="text-sm font-bold text-green-600 dark:text-green-400">{fm(paidAmountForInvoice)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">Reste</p>
                          <p className="text-sm font-bold text-red-600 dark:text-red-400">{inv.status === 'paid' || inv.type === 'credit' ? '0,00 €' : fm(remaining)}</p>
                          {inv.type === 'standard' && creditsForInvoice > 0 && (
                            <p className="text-[9px] text-orange-600 dark:text-orange-400">Avoirs: {fm(creditsForInvoice)}</p>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-4 gap-2">
                        <button onClick={() => generatePDF(inv)} className="flex flex-col items-center justify-center p-2 text-purple-600 bg-purple-50 dark:bg-purple-900/30 rounded-lg active:scale-95 transition-transform">
                          <Download size={18} />
                          <span className="text-[10px] mt-1 font-medium">PDF</span>
                        </button>
                        
                        {viewMode === 'active' && hasPermission('invoices.create') && inv.type === 'standard' && inv.status === 'paid' && maxCreditAllowed > 0 && (
                          <button onClick={() => openCreditModal(inv)} className="flex flex-col items-center justify-center p-2 text-red-600 bg-red-50 dark:bg-red-900/30 rounded-lg active:scale-95 transition-transform">
                            <FileMinus size={18} />
                            <span className="text-[10px] mt-1 font-medium">Avoir</span>
                          </button>
                        )}

                        {viewMode === 'active' && inv.status !== 'paid' && inv.status !== 'cancelled' && inv.type !== 'credit' && remaining > 0 && (
                          <>
                            <button onClick={() => { setInvoiceToConfirm(inv); setShowConfirmPaidModal(true); }} className="flex flex-col items-center justify-center p-2 text-green-600 bg-green-50 dark:bg-green-900/30 rounded-lg active:scale-95 transition-transform">
                              <CheckCircle2 size={18} />
                              <span className="text-[10px] mt-1 font-medium">Payé</span>
                            </button>
                            <button onClick={() => handleOpenPaymentModal(inv)} className="flex flex-col items-center justify-center p-2 text-blue-600 bg-blue-50 dark:bg-blue-900/30 rounded-lg active:scale-95 transition-transform">
                              <DollarSign size={18} />
                              <span className="text-[10px] mt-1 font-medium">Paiement</span>
                            </button>
                          </>
                        )}

                        {viewMode === 'active' && inv.type === 'standard' && inv.deposit > 0 && inv.status !== 'paid' && !hasAdvance && !isFinal && (
                          <button onClick={() => handleOpenAdvanceModal(inv)} className="flex flex-col items-center justify-center p-2 text-indigo-600 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg active:scale-95 transition-transform">
                            <FileText size={18} />
                            <span className="text-[10px] mt-1 font-medium">Acompte</span>
                          </button>
                        )}

                        {viewMode === 'active' && inv.type === 'advance' && inv.status === 'paid' && !hasBalance && (
                          <button onClick={() => handleGenerateFinalFromAdvance(inv)} className="flex flex-col items-center justify-center p-2 text-purple-600 bg-purple-50 dark:bg-purple-900/30 rounded-lg active:scale-95 transition-transform">
                            <Receipt size={18} />
                            <span className="text-[10px] mt-1 font-medium">Finale</span>
                          </button>
                        )}

                        {viewMode === 'active' && hasPermission('invoices.delete') && (
                          <button onClick={() => handleArchive(inv.$id, inv.invoiceNumber)} className="flex flex-col items-center justify-center p-2 text-orange-600 bg-orange-50 dark:bg-orange-900/30 rounded-lg active:scale-95 transition-transform">
                            <Archive size={18} />
                            <span className="text-[10px] mt-1 font-medium">Archiver</span>
                          </button>
                        )}

                        {viewMode === 'archived' && (
                          <button onClick={() => handleUnarchive(inv.$id, inv.invoiceNumber)} className="col-span-4 flex items-center justify-center gap-2 p-3 text-sm font-medium text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/30 rounded-lg active:scale-95 transition-transform">
                            <RotateCcw size={16} /><span>Désarchiver</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </main>

        {/* MODAL DEVIS D'ORIGINE */}
        {showQuoteModal && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4 animate-fadeIn">
            <div className="bg-white dark:bg-slate-800 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-2xl max-h-[85vh] flex flex-col animate-slideUp">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
                <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <FileText className="text-green-600" size={22} /> Devis d'origine
                </h2>
                <button onClick={() => { setShowQuoteModal(false); setQuoteDetails(null); }} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors">
                  <X size={20} className="text-slate-500 dark:text-slate-400" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-6">
                {loadingQuote ? (
                  <div className="text-center py-12 text-slate-500 dark:text-slate-400">Chargement du devis...</div>
                ) : quoteDetails ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg p-3">
                        <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-semibold">N° Devis</p>
                        <p className="font-mono font-bold text-green-700 dark:text-green-400 text-lg mt-1">{quoteDetails.quoteNumber}</p>
                      </div>
                      <div className="bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg p-3">
                        <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-semibold">Statut</p>
                        <span className={`inline-block mt-1 px-2.5 py-1 rounded-full text-xs font-medium ${quoteStatusColors[quoteDetails.status] || 'bg-gray-100 text-gray-800'}`}>{quoteDetails.status}</span>
                      </div>
                      <div className="bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg p-3">
                        <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-semibold">Client</p>
                        <p className="font-semibold text-slate-900 dark:text-white mt-1">{quoteDetails.clientName}</p>
                      </div>
                      <div className="bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg p-3">
                        <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-semibold">Date</p>
                        <p className="text-slate-900 dark:text-white mt-1">{formatDate(quoteDetails.issueDate)}</p>
                      </div>
                    </div>
                    {quoteDetails.subject && (
                      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                        <p className="text-xs text-blue-700 dark:text-blue-300 uppercase font-semibold">Objet</p>
                        <p className="text-slate-900 dark:text-white mt-1">{quoteDetails.subject}</p>
                      </div>
                    )}
                    {quoteDetails.items && (
                      <div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-semibold mb-2">Lignes du devis</p>
                        <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                          <table className="w-full text-sm">
                            <thead className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700">
                              <tr>
                                <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 dark:text-slate-400">Désignation</th>
                                <th className="px-3 py-2 text-center text-xs font-semibold text-slate-500 dark:text-slate-400">Qté</th>
                                <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500 dark:text-slate-400">Prix U.</th>
                                <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500 dark:text-slate-400">Total</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                              {(() => {
                                try {
                                  const items = JSON.parse(quoteDetails.items);
                                  return items.map((item: any, idx: number) => (
                                    <tr key={idx}>
                                      <td className="px-3 py-2 text-slate-900 dark:text-white">{item.description}</td>
                                      <td className="px-3 py-2 text-center text-slate-600 dark:text-slate-300">{item.quantity}</td>
                                      <td className="px-3 py-2 text-right text-slate-600 dark:text-slate-300">{item.unitPrice?.toFixed(2)} €</td>
                                      <td className="px-3 py-2 text-right font-semibold text-slate-900 dark:text-white">{item.total?.toFixed(2)} €</td>
                                    </tr>
                                  ));
                                } catch { return null; }
                              })()}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                    <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div className="flex justify-between"><span className="text-slate-600 dark:text-slate-400">Total HT</span><span className="font-semibold text-slate-900 dark:text-white">{fm(quoteDetails.subtotal || 0)}</span></div>
                        <div className="flex justify-between"><span className="text-slate-600 dark:text-slate-400">TVA</span><span className="font-semibold text-slate-900 dark:text-white">{fm(quoteDetails.tax || 0)}</span></div>
                        {quoteDetails.discount ? <div className="flex justify-between text-red-600 dark:text-red-400"><span>Remise</span><span>-{fm(quoteDetails.discount)}</span></div> : null}
                        <div className="flex justify-between text-lg font-bold border-t border-green-200 dark:border-green-800 pt-2 col-span-2"><span>Total TTC</span><span>{fm(quoteDetails.total || 0)}</span></div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-12 text-slate-500 dark:text-slate-400">Aucune donnée de devis trouvée.</div>
                )}
              </div>
              <div className="flex justify-end px-6 py-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/90 flex-shrink-0 rounded-b-2xl">
                <button onClick={() => { setShowQuoteModal(false); setQuoteDetails(null); }} className="px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600 active:scale-95 transition-all">
                  Fermer
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL PAIEMENT COMPACT */}
        {showPaymentModal && selectedInvoice && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4 animate-fadeIn">
            <div className="bg-white dark:bg-slate-800 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md max-h-[90vh] flex flex-col animate-slideUp">
              <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
                <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <DollarSign className="text-blue-600" size={20} /> Paiement
                </h2>
                <button onClick={() => setShowPaymentModal(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors">
                  <X size={20} className="text-slate-500 dark:text-slate-400" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-3">
                <div className="bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg p-3">
                  <div className="flex justify-between text-sm"><span className="text-slate-600 dark:text-slate-400">Facture</span><span className="font-semibold text-slate-900 dark:text-white text-sm">{selectedInvoice.invoiceNumber}</span></div>
                  <div className="flex justify-between text-sm mt-1"><span className="text-slate-600 dark:text-slate-400">Reste</span><span className="font-bold text-red-600 dark:text-red-400 text-sm">{fm(Math.max(0, (selectedInvoice.total || 0) - getPaidAmount(selectedInvoice)))}</span></div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Montant (€) *</label>
                  <input type="number" step="0.01" min="0.01" max={Math.max(0, (selectedInvoice.total || 0) - getPaidAmount(selectedInvoice))} value={paymentForm.amount} onChange={e => setPaymentForm({ ...paymentForm, amount: e.target.value })} className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none" placeholder="0.00" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Date *</label>
                    <input type="date" value={paymentForm.date} onChange={e => setPaymentForm({ ...paymentForm, date: e.target.value })} className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Moyen *</label>
                    <select value={paymentForm.method} onChange={e => setPaymentForm({ ...paymentForm, method: e.target.value })} className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg p-2.5 text-sm bg-white dark:bg-slate-700 focus:ring-2 focus:ring-blue-500 outline-none">
                      {paymentMethodsList.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Référence</label>
                  <input type="text" value={paymentForm.reference} onChange={e => setPaymentForm({ ...paymentForm, reference: e.target.value })} className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none" placeholder="N° chèque, virement..." />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Notes</label>
                  <textarea rows={2} value={paymentForm.notes} onChange={e => setPaymentForm({ ...paymentForm, notes: e.target.value })} className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none" placeholder="Notes internes..." />
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 px-4 sm:px-6 py-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/90 rounded-b-2xl flex-shrink-0">
                <button onClick={() => setShowPaymentModal(false)} className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600 active:scale-95 transition-all">Annuler</button>
                <button onClick={handleSavePayment} disabled={savingPayment || !paymentForm.amount || parseFloat(paymentForm.amount) <= 0} className="flex-1 px-4 py-2.5 text-sm font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2 active:scale-95 transition-all">
                  {savingPayment ? (<><span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span> ...</>) : (<><CheckCircle2 size={14} /> Valider</>)}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL ACOMPTE */}
        {showAdvanceModal && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4 animate-fadeIn">
            <div className="bg-white dark:bg-slate-800 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md border border-slate-100 dark:border-slate-700 animate-slideUp">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <FileText className="text-blue-600" size={22} /> Générer une facture d'acompte
                </h2>
                <button onClick={() => setShowAdvanceModal(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors">
                  <X size={20} className="text-slate-500 dark:text-slate-400" />
                </button>
              </div>
              <div className="px-6 py-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Pourcentage d'acompte (%) *</label>
                  <input type="number" min="1" max="99" step="0.01" value={advanceForm.percent} onChange={e => setAdvanceForm({ ...advanceForm, percent: e.target.value })} className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">Montant de l'acompte : {(() => { const inv = invoices.find(i => i.$id === advanceForm.invoiceId); return inv ? (inv.deposit || 0).toFixed(2) : '0.00'; })()} € TTC</p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg p-3 text-sm space-y-1.5">
                  <div className="flex justify-between"><span className="text-slate-600 dark:text-slate-400">Facture d'origine :</span><span className="font-semibold text-slate-900 dark:text-white">{invoices.find(i => i.$id === advanceForm.invoiceId)?.invoiceNumber}</span></div>
                  <div className="flex justify-between"><span className="text-slate-600 dark:text-slate-400">Client :</span><span className="font-semibold text-slate-900 dark:text-white">{invoices.find(i => i.$id === advanceForm.invoiceId)?.clientName}</span></div>
                  <div className="flex justify-between"><span className="text-slate-600 dark:text-slate-400">Total facture :</span><span className="font-semibold text-slate-900 dark:text-white">{(() => { const inv = invoices.find(i => i.$id === advanceForm.invoiceId); return inv ? (inv.total || 0).toFixed(2) : '0.00'; })()} € TTC</span></div>
                </div>
              </div>
              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/90 rounded-b-2xl">
                <button onClick={() => setShowAdvanceModal(false)} className="flex-1 sm:flex-none px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600 active:scale-95 transition-all">Annuler</button>
                <button onClick={handleGenerateAdvanceInvoice} disabled={savingAdvance || !advanceForm.percent || parseFloat(advanceForm.percent) <= 0} className="flex-1 sm:flex-none px-5 py-3 text-sm font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 active:scale-95 transition-all">
                  {savingAdvance ? (<><span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span> Génération...</>) : (<><FileText size={16} /> Générer la facture d'acompte</>)}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL CONFIRMATION PAIEMENT RAPIDE */}
        {showConfirmPaidModal && invoiceToConfirm && (
          <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4 animate-fadeIn">
            <div className="bg-white dark:bg-slate-800 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md border border-slate-100 dark:border-slate-700 animate-slideUp">
              <div className="p-6">
                <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 size={32} className="text-green-600 dark:text-green-400" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white text-center mb-2">Confirmer le paiement</h3>
                <div className="bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl p-4 my-4 space-y-2">
                  <div className="flex justify-between text-sm"><span className="text-slate-600 dark:text-slate-400">Facture</span><span className="font-semibold text-slate-900 dark:text-white">{invoiceToConfirm.invoiceNumber}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-slate-600 dark:text-slate-400">Client</span><span className="font-semibold text-slate-900 dark:text-white">{invoiceToConfirm.clientName}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-slate-600 dark:text-slate-400">Montant à payer</span><span className="font-bold text-green-600 dark:text-green-400">{fm(Math.max(0, (invoiceToConfirm.total || 0) - getPaidAmount(invoiceToConfirm)))}</span></div>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400 text-center mb-6">Voulez-vous marquer cette facture comme <strong>entièrement payée</strong> ?</p>
                <div className="flex gap-3">
                  <button onClick={() => { setShowConfirmPaidModal(false); setInvoiceToConfirm(null); }} className="flex-1 px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-600 active:scale-95 transition-all">Annuler</button>
                  <button onClick={handleConfirmPaid} className="flex-1 px-4 py-3 text-sm font-bold text-white bg-green-600 rounded-xl hover:bg-green-700 active:scale-95 transition-all shadow-lg shadow-green-600/20 flex items-center justify-center gap-2"><CheckCircle2 size={16} /> Confirmer</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* MODAL CONFIRMATION PAIEMENT DÉTAILLÉ */}
        {showConfirmPaymentModal && paymentToConfirm && (
          <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4 animate-fadeIn">
            <div className="bg-white dark:bg-slate-800 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md border border-slate-100 dark:border-slate-700 animate-slideUp">
              <div className="p-6">
                <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                  <DollarSign size={32} className="text-blue-600 dark:text-blue-400" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white text-center mb-2">Confirmer le paiement</h3>
                <div className="bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl p-4 my-4 space-y-2">
                  <div className="flex justify-between text-sm"><span className="text-slate-600 dark:text-slate-400">Facture</span><span className="font-semibold text-slate-900 dark:text-white">{paymentToConfirm.invoice.invoiceNumber}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-slate-600 dark:text-slate-400">Client</span><span className="font-semibold text-slate-900 dark:text-white">{paymentToConfirm.invoice.clientName}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-slate-600 dark:text-slate-400">Montant</span><span className="font-bold text-blue-600 dark:text-blue-400">{fm(paymentToConfirm.payment.amount)}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-slate-600 dark:text-slate-400">Date</span><span className="font-semibold text-slate-900 dark:text-white">{new Date(paymentToConfirm.payment.date).toLocaleDateString('fr-FR')}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-slate-600 dark:text-slate-400">Moyen</span><span className="font-semibold text-slate-900 dark:text-white">{paymentToConfirm.payment.method}</span></div>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400 text-center mb-6">Voulez-vous <strong>enregistrer définitivement</strong> ce paiement ?</p>
                <div className="flex gap-3">
                  <button onClick={() => { setShowConfirmPaymentModal(false); setPaymentToConfirm(null); setSelectedInvoice(paymentToConfirm.invoice); setPaymentForm({ amount: paymentToConfirm.payment.amount.toFixed(2), date: paymentToConfirm.payment.date, method: paymentToConfirm.payment.method, reference: paymentToConfirm.payment.reference || '', notes: paymentToConfirm.payment.notes || '' }); setShowPaymentModal(true); }} className="flex-1 px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-600 active:scale-95 transition-all">Modifier</button>
                  <button onClick={handleConfirmPayment} disabled={savingPayment} className="flex-1 px-4 py-3 text-sm font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-700 active:scale-95 transition-all shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2 disabled:opacity-50">
                    {savingPayment ? (<><span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span> ...</>) : (<><CheckCircle2 size={16} /> Confirmer</>)}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* MODAL CHOIX REÇU */}
        {showReceiptChoiceModal && lastPaymentData && (
          <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4 animate-fadeIn">
            <div className="bg-white dark:bg-slate-800 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md border border-slate-100 dark:border-slate-700 animate-slideUp">
              <div className="p-6">
                <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 size={32} className="text-green-600 dark:text-green-400" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white text-center mb-2">Paiement enregistré !</h3>
                <div className="bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl p-4 my-4 space-y-2">
                  <div className="flex justify-between text-sm"><span className="text-slate-600 dark:text-slate-400">Facture</span><span className="font-semibold text-slate-900 dark:text-white">{lastPaymentData.invoice.invoiceNumber}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-slate-600 dark:text-slate-400">Client</span><span className="font-semibold text-slate-900 dark:text-white">{lastPaymentData.invoice.clientName}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-slate-600 dark:text-slate-400">Montant payé</span><span className="font-bold text-green-600 dark:text-green-400">{fm(lastPaymentData.payment.amount)}</span></div>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400 text-center mb-6">Voulez-vous générer le reçu de paiement ?</p>
                <div className="flex gap-3">
                  <button onClick={async () => { setShowReceiptChoiceModal(false); await generateReceiptPDF(lastPaymentData.invoice, lastPaymentData.payment); setLastPaymentData(null); }} className="flex-1 px-4 py-3 text-sm font-bold text-white bg-green-600 rounded-xl hover:bg-green-700 active:scale-95 transition-all shadow-lg shadow-green-600/20 flex items-center justify-center gap-2">
                    <Receipt size={16} /> Générer le reçu
                  </button>
                  <button onClick={() => { setShowReceiptChoiceModal(false); setLastPaymentData(null); }} className="flex-1 px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-600 active:scale-95 transition-all">Plus tard</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* MODAL AVOIR */}
        {showCreditModal && creditInvoice && (() => {
          const existingCreditsTotal = getTotalCreditsForInvoice(creditInvoice.$id);
          const maxCreditAllowed = Math.max(0, (creditInvoice.total || 0) - existingCreditsTotal);
          const linkedCredits = getCreditsListForInvoice(creditInvoice.$id);
          
          return (
            <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4 animate-fadeIn">
              <div className="bg-white dark:bg-slate-800 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md max-h-[90vh] flex flex-col animate-slideUp">
                <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
                  <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <FileMinus className="text-red-600" size={20} /> Créer un avoir
                  </h2>
                  <button onClick={() => setShowCreditModal(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors">
                    <X size={20} className="text-slate-500 dark:text-slate-400" />
                  </button>
                </div>
                
                <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3">
                  <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
                    <div className="flex justify-between items-center text-sm">
                      <div>
                        <p className="text-[10px] text-red-700 dark:text-red-300 font-semibold uppercase">Facture</p>
                        <p className="font-bold text-slate-900 dark:text-white text-sm">{creditInvoice.invoiceNumber}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] text-red-700 dark:text-red-300 font-semibold uppercase">Client</p>
                        <p className="font-semibold text-slate-900 dark:text-white text-sm">{creditInvoice.clientName}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] text-red-700 dark:text-red-300 font-semibold uppercase">Montant</p>
                        <p className="text-lg font-bold text-red-700 dark:text-red-300">{fm(creditInvoice.total || 0)}</p>
                      </div>
                    </div>
                  </div>

                  {existingCreditsTotal > 0 && (
                    <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-3">
                      <p className="text-xs font-semibold text-orange-800 dark:text-orange-200 uppercase mb-2">
                        Avoirs déjà émis sur cette facture
                      </p>
                      <div className="space-y-1">
                        {linkedCredits.map(credit => (
                          <div key={credit.$id} className="flex justify-between text-xs text-orange-900 dark:text-orange-100">
                            <span className="font-mono">{credit.invoiceNumber}</span>
                            <span className="font-semibold">- {fm(credit.total || 0)}</span>
                          </div>
                        ))}
                      </div>
                      <div className="mt-2 pt-2 border-t border-orange-300 dark:border-orange-700 flex justify-between text-sm font-bold">
                        <span className="text-orange-900 dark:text-orange-100">Total déjà en avoir :</span>
                        <span className="text-orange-800 dark:text-orange-200">{fm(existingCreditsTotal)}</span>
                      </div>
                      <div className="flex justify-between text-sm font-bold mt-1">
                        <span className="text-green-800 dark:text-green-200">Max autorisé :</span>
                        <span className="text-green-700 dark:text-green-300">{fm(maxCreditAllowed)}</span>
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">Type d'avoir</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button 
                        type="button" 
                        onClick={() => setCreditForm({ ...creditForm, type: 'total', amount: creditInvoice.total.toFixed(2) })} 
                        disabled={existingCreditsTotal > 0}
                        className={`p-2.5 border rounded-lg text-sm font-medium transition-colors ${
                          creditForm.type === 'total' 
                            ? 'border-red-500 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300' 
                            : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                        } ${existingCreditsTotal > 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        Avoir Total
                        {existingCreditsTotal > 0 && <span className="block text-[9px] mt-0.5">(déjà partiel)</span>}
                      </button>
                      <button 
                        type="button" 
                        onClick={() => setCreditForm({ ...creditForm, type: 'partial', amount: '' })} 
                        className={`p-2.5 border rounded-lg text-sm font-medium transition-colors ${
                          creditForm.type === 'partial' 
                            ? 'border-red-500 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300' 
                            : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        Avoir Partiel
                      </button>
                    </div>
                  </div>

                  {creditForm.type === 'partial' && (
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Montant TTC *</label>
                      <input 
                        type="number" 
                        min="0.01" 
                        step="0.01" 
                        max={maxCreditAllowed} 
                        value={creditForm.amount} 
                        onChange={e => setCreditForm({ ...creditForm, amount: e.target.value })} 
                        className="w-full px-3 py-2.5 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg focus:ring-2 focus:ring-red-500 outline-none text-base font-semibold" 
                        placeholder="0.00" 
                        autoFocus 
                      />
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                        Max autorisé : <span className="font-bold text-red-600 dark:text-red-400">{fm(maxCreditAllowed)}</span>
                      </p>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Motif *</label>
                    <textarea 
                      rows={2} 
                      value={creditForm.reason} 
                      onChange={e => setCreditForm({ ...creditForm, reason: e.target.value })} 
                      className="w-full px-3 py-2.5 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg focus:ring-2 focus:ring-red-500 outline-none text-sm resize-none" 
                      placeholder="Ex: Retour marchandise, Remise commerciale, Erreur..." 
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 px-4 sm:px-6 py-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/90 rounded-b-2xl flex-shrink-0">
                  <button onClick={() => setShowCreditModal(false)} className="flex-1 sm:flex-none px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600 active:scale-95 transition-all">Annuler</button>
                  <button onClick={handleGenerateCreditNote} disabled={savingCredit} className="flex-1 sm:flex-none px-4 py-2.5 text-sm font-bold text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2 active:scale-95 transition-all">
                    {savingCredit ? (<><span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span> ...</>) : (<><FileMinus size={14} /> Générer</>)}
                  </button>
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    </Sidebar>
  );
}