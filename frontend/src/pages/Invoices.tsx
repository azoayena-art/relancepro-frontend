import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { databases, DATABASE_ID } from '../appwrite';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { getFilePreviewUrl } from '../utils/storage';
import { verifyDocumentAccess, logAuditAction } from '../utils/security';
import {
  Search, ChevronLeft, Download, Filter, Copy, CheckCircle2, Receipt, DollarSign,
  Archive, RotateCcw, Hash, Eye, X, FileText
} from 'lucide-react';
import { Query, ID, Permission, Role } from 'appwrite';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

interface InvoiceItem {
  id: string; reference: string; description: string; quantity: number;
  unit: string; unitPrice: number; tvaRate: number; total: number; discount: number;
}

interface Payment {
  id: string;
  amount: number;
  date: string;
  method: string;
  reference?: string;
  notes?: string;
}

interface Invoice {
  $id: string;
  invoiceNumber: string;
  quoteId?: string;
  userId: string;
  teamId?: string;
  clientToken?: string;
  status: string;
  issueDate: string;
  dueDate?: string;
  paidAt?: string;
  receivedAt?: string;
  subtotal: number;
  vatRate: number;
  vatAmount: number;
  total: number;
  discount: number;
  tax: number;
  deposit: number;
  balance: number;
  companyName?: string;
  companyLegalForm?: string;
  companyAddress?: string;
  companySiret?: string;
  companyRcs?: string;
  companyTva?: string;
  companyPhone?: string;
  companyEmail?: string;
  logoFileId?: string;
  clientName?: string;
  clientAddress?: string;
  clientBillingAddress?: string;
  clientEmail?: string;
  clientPhone?: string;
  items?: string;
  paymentMethods?: string;
  paymentConditions?: string;
  executionDelay?: string;
  specialConditions?: string;
  tradeType?: string;
  insuranceName?: string;
  insuranceAddress?: string;
  insurancePolicy?: string;
  notes?: string;
  payments?: string | Payment[];
  createdAt?: string;
  type?: string;
  originalQuoteId?: string;
  originalInvoiceId?: string;
  advancePercent?: string;
}

interface QuoteDetail {
  $id: string;
  quoteNumber: string;
  clientName: string;
  subject?: string;
  status: string;
  total: number;
  issueDate?: string;
  validityDate?: string;
  items?: string;
  subtotal?: number;
  discount?: number;
  tax?: number;
  deposit?: number;
  balance?: number;
}

const statusColors: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-800',
  sent: 'bg-blue-100 text-blue-800',
  near_due: 'bg-yellow-100 text-yellow-800',
  overdue: 'bg-red-200 text-red-900 font-bold',
  paid: 'bg-green-100 text-green-800',
  cancelled: 'bg-slate-100 text-slate-600'
};

const statusLabels: Record<string, string> = {
  draft: 'Brouillon',
  sent: 'Envoyée',
  near_due: 'Bientôt échue',
  overdue: 'En retard',
  paid: 'Payée',
  cancelled: 'Archivée / Annulée'
};

const quoteStatusColors: Record<string, string> = {
  Brouillon: 'bg-gray-100 text-gray-800',
  Envoyé: 'bg-blue-100 text-blue-800',
  Accepté: 'bg-green-100 text-green-800',
  Refusé: 'bg-red-100 text-red-800',
  Facturé: 'bg-purple-100 text-purple-800'
};

const typeLabels: Record<string, string> = {
  standard: 'Facture',
  advance: 'Facture d\'acompte',
  balance: 'Facture de solde',
  credit: 'Facture d\'avoir'
};

const typeColors: Record<string, string> = {
  standard: 'bg-purple-100 text-purple-800',
  advance: 'bg-blue-100 text-blue-800',
  balance: 'bg-indigo-100 text-indigo-800',
  credit: 'bg-red-100 text-red-800'
};

const paymentMethodsList = [
  'Virement bancaire', 'Chèque', 'Espèces', 'Carte bancaire', 'Prélèvement SEPA', 'Autre'
];

export default function Invoices() {
  const { user } = useAuth();
  const { hasPermission, loading: permLoading } = usePermissions();
  const navigate = useNavigate();

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [currentTeamId, setCurrentTeamId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'active' | 'archived'>('active');

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    date: new Date().toISOString().split('T')[0],
    method: 'Virement bancaire',
    reference: '',
    notes: ''
  });
  const [savingPayment, setSavingPayment] = useState(false);

  const [showQuoteModal, setShowQuoteModal] = useState(false);
  const [quoteDetails, setQuoteDetails] = useState<QuoteDetail | null>(null);
  const [loadingQuote, setLoadingQuote] = useState(false);

  const [showAdvanceModal, setShowAdvanceModal] = useState(false);
  const [advanceForm, setAdvanceForm] = useState({
    percent: '30',
    invoiceId: ''
  });
  const [savingAdvance, setSavingAdvance] = useState(false);
  const [generatingFinal, setGeneratingFinal] = useState(false);

  const [showReceiptChoiceModal, setShowReceiptChoiceModal] = useState(false);
  const [lastPaymentData, setLastPaymentData] = useState<{invoice: Invoice; payment: Payment} | null>(null);

  const [showConfirmPaidModal, setShowConfirmPaidModal] = useState(false);
  const [invoiceToConfirm, setInvoiceToConfirm] = useState<Invoice | null>(null);

  const [showConfirmPaymentModal, setShowConfirmPaymentModal] = useState(false);
  const [paymentToConfirm, setPaymentToConfirm] = useState<{invoice: Invoice; payment: Payment} | null>(null);

  const getPaidAmount = (invoice: Invoice): number => {
    let payments: Payment[] = [];
    try {
      if (typeof invoice.payments === 'string' && invoice.payments.trim()) {
        payments = JSON.parse(invoice.payments);
      } else if (Array.isArray(invoice.payments)) {
        payments = invoice.payments;
      }
    } catch (e) {
      payments = [];
    }
    const paymentsTotal = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
    const deposit = invoice.deposit || 0;
    return paymentsTotal + deposit;
  };

  const fm = (a: number) => `${a.toFixed(2)} €`;

  useEffect(() => {
    if (!permLoading && !hasPermission('invoices.view')) {
      navigate('/dashboard');
    }
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
      setInvoices(res.documents as unknown as Invoice[]);
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
      
      if (user) {
        await logAuditAction(user.$id, currentTeamId!, 'read', 'quote', quoteId);
      }
    } catch (e: any) {
      console.error('Erreur chargement devis:', e);
      alert(`Impossible de charger le devis : ${e.message}`);
      setShowQuoteModal(false);
    } finally {
      setLoadingQuote(false);
    }
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
        Query.equal('teamId', currentTeamId),
        Query.orderDesc('$createdAt'),
        Query.limit(1)
      ]);

      let nextNumber = 1;
      if (lastReceiptsRes.documents.length > 0) {
        const lastReceipt = lastReceiptsRes.documents[0] as any;
        const match = lastReceipt.receiptNumber?.match(/REC-(\d{4})-(\d+)/);
        if (match && parseInt(match[1]) === currentYear) {
          nextNumber = parseInt(match[2]) + 1;
        }
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
    doc.setFontSize(9);
    doc.text(`Date : ${new Date(paymentDate).toLocaleDateString('fr-FR')}`, W - M, Y + 5, { align: 'right' });

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
    
    Y += 8; doc.setFontSize(11);
    doc.text(`Reconnais avoir reçu de :`, M, Y); Y += 6;
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
    doc.text('Document à conserver par le client comme preuve de paiement.', W / 2, 289, { align: 'center' });

    try {
      const pdfBase64 = doc.output('datauristring');
      const receiptData = {
        teamId: currentTeamId,
        userId: user.$id,
        receiptNumber: receiptNumber,
        invoiceId: inv.$id,
        invoiceNumber: inv.invoiceNumber,
        clientName: inv.clientName || 'Client',
        amount: paymentAmount.toFixed(2),
        paymentDate: paymentDate,
        paymentMethod: paymentMethod,
        paymentReference: paymentRef,
        pdfBase64: pdfBase64,
        status: 'active'
      };

      // ✅ SÉCURITÉ MAXIMALE : Utilisation du secureTeamId avec fallback
      let perms: string[] = [];
      
      if (user?.secureTeamId) {
        console.log("✅ Invoices generateReceiptPDF: Utilisation de la sécurité maximale (secureTeamId)");
        perms = [
          Permission.read(Role.team(user.secureTeamId)),
          Permission.update(Role.team(user.secureTeamId)),
          Permission.delete(Role.team(user.secureTeamId))
        ];
      } else {
        console.warn("⚠️ Invoices generateReceiptPDF: secureTeamId manquant, fallback Role.users()");
        perms = [
          Permission.read(Role.users()),
          Permission.update(Role.users()),
          Permission.delete(Role.users())
        ];
      }

      console.log("🚀 Invoices generateReceiptPDF: Envoi avec permissions:", perms);

      await databases.createDocument(DATABASE_ID, 'receipts', ID.unique(), receiptData, perms);
      alert(`✅ Reçu ${receiptNumber} généré et enregistré avec succès !`);
    } catch (e: any) {
      console.error('❌ Erreur critique stockage reçu:', e);
      alert(`⚠️ Le paiement a été enregistré, mais le reçu n'a pas pu être sauvegardé :\n${e.message}`);
    }
  };

  const handleTogglePaid = async (invoice: Invoice) => {
    if (invoice.teamId !== currentTeamId) { alert('⚠️ Accès refusé'); return; }
    try {
      const totalAlreadyPaid = getPaidAmount(invoice);
      const remainingAmount = Math.max(0, (invoice.total || 0) - totalAlreadyPaid);

      if (remainingAmount <= 0) {
        alert(`⚠️ Cette facture est déjà entièrement payée !\n\nTotal : ${fm(invoice.total || 0)}\nDéjà payé : ${fm(totalAlreadyPaid)}`);
        return;
      }

      let existingPayments: Payment[] = [];
      try {
        if (typeof invoice.payments === 'string' && invoice.payments.trim()) {
          existingPayments = JSON.parse(invoice.payments);
        } else if (Array.isArray(invoice.payments)) {
          existingPayments = invoice.payments;
        }
      } catch (e) { existingPayments = []; }

      let updatedPayments = [...existingPayments];
      const lastPayment: Payment = {
        id: `quick-${Date.now()}`,
        amount: remainingAmount,
        date: new Date().toISOString().split('T')[0],
        method: invoice.paymentMethods || 'Autre',
        reference: 'Paiement rapide',
        notes: 'Marqué comme payé (bouton rapide)'
      };
      updatedPayments.push(lastPayment);

      await databases.updateDocument(DATABASE_ID, 'invoices', invoice.$id, {
        status: 'paid',
        paidAt: new Date().toISOString(),
        receivedAt: new Date().toISOString(),
        balance: 0,
        payments: JSON.stringify(updatedPayments)
      });

      await loadInvoices(true);

      setLastPaymentData({ invoice, payment: lastPayment });
      setShowReceiptChoiceModal(true);
    } catch (e: any) {
      console.error('❌ Erreur paiement rapide:', e);
      alert(`Erreur: ${e.message}`);
    }
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
    setPaymentForm({
      amount: remaining > 0 ? remaining.toFixed(2) : '',
      date: new Date().toISOString().split('T')[0],
      method: invoice.paymentMethods || 'Virement bancaire',
      reference: '',
      notes: ''
    });
    setShowPaymentModal(true);
  };

  const handleSavePayment = async () => {
    if (!selectedInvoice || !currentTeamId) return;
    const amount = parseFloat(paymentForm.amount);
    
    const paidAmount = getPaidAmount(selectedInvoice);
    const remaining = Math.max(0, (selectedInvoice.total || 0) - paidAmount);

    if (!amount || amount <= 0) { 
      alert('Veuillez saisir un montant valide supérieur à 0'); 
      return; 
    }
    
    if (amount > remaining) {
      alert(`⚠️ Montant invalide !\n\nLe montant saisi (${amount.toFixed(2)} €) est supérieur au reste à payer (${remaining.toFixed(2)} €).\n\nVeuillez corriger le montant.`);
      return;
    }

    const newPayment: Payment = {
      id: Date.now().toString(),
      amount: amount,
      date: paymentForm.date,
      method: paymentForm.method,
      reference: paymentForm.reference || 'Paiement',
      notes: paymentForm.notes || ''
    };

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
      try {
        if (typeof invoice.payments === 'string' && invoice.payments.trim()) {
          existingPayments = JSON.parse(invoice.payments);
        } else if (Array.isArray(invoice.payments)) {
          existingPayments = invoice.payments;
        }
      } catch (e) { existingPayments = []; }

      const updatedPayments = [...existingPayments, payment];
      const totalPaid = updatedPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
      const newBalance = Math.max(0, (invoice.total || 0) - totalPaid);
      const newStatus = newBalance <= 0 ? 'paid' : 'sent';

      await databases.updateDocument(DATABASE_ID, 'invoices', invoice.$id, {
        payments: JSON.stringify(updatedPayments),
        balance: newBalance,
        status: newStatus,
        paidAt: newBalance <= 0 ? new Date().toISOString() : invoice.paidAt,
        receivedAt: newBalance <= 0 ? new Date().toISOString() : invoice.receivedAt
      });

      setShowConfirmPaymentModal(false);
      setPaymentToConfirm(null);
      await loadInvoices(true);
      
      setLastPaymentData({ invoice, payment });
      setShowReceiptChoiceModal(true);
    } catch (e: any) {
      console.error('❌ Erreur sauvegarde paiement:', e);
      alert(`Erreur: ${e.message}`);
    } finally {
      setSavingPayment(false);
    }
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
    if (invoice.deposit <= 0) {
      alert('Cette facture n\'a pas d\'acompte défini. Veuillez d\'abord définir un acompte.');
      return;
    }
    const percent = invoice.total > 0 ? ((invoice.deposit / invoice.total) * 100).toFixed(2) : '0.00';
    setAdvanceForm({ percent, invoiceId: invoice.$id });
    setShowAdvanceModal(true);
  };

  const handleGenerateAdvanceInvoice = async () => {
    const invoice = invoices.find(i => i.$id === advanceForm.invoiceId);
    if (!invoice || !currentTeamId) return;

    // ✅ VÉRIFICATION DE SÉCURITÉ
    console.log("🔍 DEBUG Invoices handleGenerateAdvanceInvoice - secureTeamId:", user?.secureTeamId);

    setSavingAdvance(true);
    try {
      const advanceAmount = invoice.deposit; 
      const realPercent = invoice.total > 0 ? ((advanceAmount / invoice.total) * 100).toFixed(2) : '0.00';

      const currentYear = new Date().getFullYear();
      const prefix = `ACO-${currentYear}-`;
      let maxNum = 0;

      const existingInvoices = await databases.listDocuments(DATABASE_ID, 'invoices', [
        Query.equal('teamId', currentTeamId), Query.limit(2000)
      ]);

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
        teamId: currentTeamId,
        userId: user.$id,
        invoiceNumber: advanceNumber,
        type: 'advance',
        originalQuoteId: invoice.quoteId || '',
        originalInvoiceId: invoice.$id,
        advancePercent: realPercent,
        clientToken: Math.random().toString(36).substring(2, 15),
        status: 'draft',
        issueDate: new Date().toISOString().split('T')[0],
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        subtotal: advanceHT,
        vatRate: invoice.vatRate || 20,
        vatAmount: advanceTVA,
        tax: advanceTVA,
        discount: 0,
        total: advanceAmount,
        deposit: 0,
        balance: advanceAmount,
        companyName: invoice.companyName,
        companyLegalForm: invoice.companyLegalForm,
        companyAddress: invoice.companyAddress,
        companySiret: invoice.companySiret,
        companyRcs: invoice.companyRcs,
        companyTva: invoice.companyTva,
        companyPhone: invoice.companyPhone,
        companyEmail: invoice.companyEmail,
        logoFileId: invoice.logoFileId,
        clientName: invoice.clientName,
        clientAddress: invoice.clientAddress,
        clientBillingAddress: invoice.clientBillingAddress,
        clientEmail: invoice.clientEmail,
        clientPhone: invoice.clientPhone,
        items: JSON.stringify([{
          id: `advance-${Date.now()}`,
          reference: 'ACOMPTE',
          description: `Acompte de ${realPercent}% sur la facture ${invoice.invoiceNumber}`,
          quantity: 1,
          unit: 'forfait',
          unitPrice: advanceHT,
          tvaRate: invoice.vatRate || 20,
          total: advanceHT,
          discount: 0
        }]),
        paymentMethods: invoice.paymentMethods,
        paymentConditions: invoice.paymentConditions,
        executionDelay: invoice.executionDelay,
        specialConditions: `Facture d'acompte - Référence facture d'origine : ${invoice.invoiceNumber}`,
        notes: `Acompte de ${realPercent}% sur la facture ${invoice.invoiceNumber}`
      };

      // ✅ SÉCURITÉ MAXIMALE : Utilisation du secureTeamId avec fallback
      let perms: string[] = [];
      
      if (user?.secureTeamId) {
        console.log("✅ Invoices handleGenerateAdvanceInvoice: Utilisation de la sécurité maximale (secureTeamId)");
        perms = [
          Permission.read(Role.team(user.secureTeamId)),
          Permission.update(Role.team(user.secureTeamId)),
          Permission.delete(Role.team(user.secureTeamId))
        ];
      } else {
        console.warn("⚠️ Invoices handleGenerateAdvanceInvoice: secureTeamId manquant, fallback Role.users()");
        perms = [
          Permission.read(Role.users()),
          Permission.update(Role.users()),
          Permission.delete(Role.users())
        ];
      }

      console.log("🚀 Invoices handleGenerateAdvanceInvoice: Envoi avec permissions:", perms);

      await databases.createDocument(DATABASE_ID, 'invoices', ID.unique(), advanceInvoice, perms);
      setShowAdvanceModal(false);
      await loadInvoices(true);
      alert(`✅ Facture d'acompte ${advanceNumber} créée avec succès !\nMontant exact : ${advanceAmount.toFixed(2)} €`);
    } catch (e: any) {
      console.error('Erreur génération acompte:', e);
      alert(`Erreur : ${e.message}`);
    } finally {
      setSavingAdvance(false);
    }
  };

  const handleGenerateFinalFromAdvance = async (advanceInvoice: Invoice) => {
    if (!currentTeamId || !advanceInvoice.originalQuoteId) {
      alert('Impossible de retrouver le devis d\'origine.');
      return;
    }
    
    if (!confirm(`Générer la facture finale pour ${advanceInvoice.clientName} ?\n\nLa facture reprendra le montant total du devis avec déduction de l'acompte déjà payé (${advanceInvoice.total.toFixed(2)} €).`)) return;

    // ✅ VÉRIFICATION DE SÉCURITÉ
    console.log("🔍 DEBUG Invoices handleGenerateFinalFromAdvance - secureTeamId:", user?.secureTeamId);

    setGeneratingFinal(true);
    try {
      const quoteDoc = await verifyDocumentAccess('quotes', advanceInvoice.originalQuoteId, currentTeamId!);
      const quote = quoteDoc as any;
      
      const currentYear = new Date().getFullYear();
      const prefix = `FAC-${currentYear}-`;
      let maxNum = 0;

      const existingInvoices = await databases.listDocuments(DATABASE_ID, 'invoices', [
        Query.equal('teamId', currentTeamId), Query.limit(2000)
      ]);

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
        teamId: currentTeamId,
        userId: user.$id,
        invoiceNumber: finalNumber,
        type: 'standard',
        originalQuoteId: advanceInvoice.originalQuoteId,
        originalInvoiceId: advanceInvoice.$id,
        clientToken: Math.random().toString(36).substring(2, 15),
        status: 'draft',
        issueDate: new Date().toISOString().split('T')[0],
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        subtotal: quote.subtotal || 0,
        vatRate: quote.vatRate || 20,
        vatAmount: quote.tax || 0,
        tax: quote.tax || 0,
        discount: quote.discount || 0,
        total: totalAmount,
        deposit: advanceAmount,
        balance: remainingAmount,
        companyName: quote.companyName,
        companyLegalForm: quote.companyLegalForm,
        companyAddress: quote.companyAddress,
        companySiret: quote.companySiret,
        companyRcs: quote.companyRcs,
        companyTva: quote.companyTva,
        companyPhone: quote.companyPhone,
        companyEmail: quote.companyEmail,
        logoFileId: quote.logoFileId,
        clientName: quote.clientName,
        clientAddress: quote.clientAddress,
        clientBillingAddress: quote.clientBillingAddress,
        clientEmail: quote.clientEmail,
        clientPhone: quote.clientPhone,
        items: quote.items,
        paymentMethods: quote.paymentMethods,
        paymentConditions: quote.paymentConditions,
        executionDelay: quote.executionDelay,
        specialConditions: quote.specialConditions,
        notes: `Facture finale - Acompte de ${advanceAmount.toFixed(2)} € déjà versé via ${advanceInvoice.invoiceNumber}`
      };

      // ✅ SÉCURITÉ MAXIMALE : Utilisation du secureTeamId avec fallback
      let perms: string[] = [];
      
      if (user?.secureTeamId) {
        console.log("✅ Invoices handleGenerateFinalFromAdvance: Utilisation de la sécurité maximale (secureTeamId)");
        perms = [
          Permission.read(Role.team(user.secureTeamId)),
          Permission.update(Role.team(user.secureTeamId)),
          Permission.delete(Role.team(user.secureTeamId))
        ];
      } else {
        console.warn("⚠️ Invoices handleGenerateFinalFromAdvance: secureTeamId manquant, fallback Role.users()");
        perms = [
          Permission.read(Role.users()),
          Permission.update(Role.users()),
          Permission.delete(Role.users())
        ];
      }

      console.log("🚀 Invoices handleGenerateFinalFromAdvance: Envoi avec permissions:", perms);

      await databases.createDocument(
        DATABASE_ID, 
        'invoices', 
        ID.unique(), 
        finalInvoice,
        perms
      );
      
      await databases.updateDocument(DATABASE_ID, 'quotes', advanceInvoice.originalQuoteId, {
        status: 'Facturé'
      });
      
      await loadInvoices(true);
      alert(`✅ Facture finale ${finalNumber} créée avec succès !\n\nTotal : ${totalAmount.toFixed(2)} €\nAcompte versé : -${advanceAmount.toFixed(2)} €\nNet à payer : ${remainingAmount.toFixed(2)} €`);
    } catch (e: any) {
      console.error('Erreur génération facture finale:', e);
      alert(`Erreur : ${e.message}`);
    } finally {
      setGeneratingFinal(false);
    }
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
        logoB64 = await new Promise<string>((rs, rj) => {
          const rd = new FileReader(); rd.onloadend = () => rs(rd.result as string); rd.onerror = rj; rd.readAsDataURL(b);
        });
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
    const pdfTitle = pdfType === 'advance' ? 'FACTURE D\'ACOMPTE' : 
                     pdfType === 'balance' ? 'FACTURE DE SOLDE' :
                     pdfType === 'credit' ? 'FACTURE D\'AVOIR' : 'FACTURE';
    doc.text(`${pdfTitle} N° ${inv.invoiceNumber}`, rX, Y + 5, { align: 'right' });
    
    if (pdfType === 'advance') {
      doc.setFontSize(8); doc.setTextColor(100, 100, 100);
      doc.text('Référence : Acompte sur facture', rX, Y + 18, { align: 'right' });
    }

    doc.setFontSize(8); doc.setFont(undefined, 'normal');
    doc.text(`Date: ${inv.issueDate ? new Date(inv.issueDate).toLocaleDateString('fr-FR') : '-'}`, rX, Y + 10, { align: 'right' });
    if (inv.dueDate) doc.text(`Échéance: ${new Date(inv.dueDate).toLocaleDateString('fr-FR')}`, rX, Y + 14, { align: 'right' });
    const clientBoxX = rX - 60; const clientBoxY = Y + 18;
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
      headStyles: { fillColor: [37, 99, 235], textColor: 255, fontSize: 8, fontStyle: 'bold' },
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
    if (pdfDeposit > 0) {
      ty += 2;
      doc.setFontSize(9); doc.setFont(undefined, 'bold'); doc.setTextColor(37, 99, 235);
      doc.text('ACOMPTE DÉJÀ VERSÉ', totalsX, ty);
      ty += 5;
      
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
      
      ty += 2;
      doc.setDrawColor(37, 99, 235); doc.setLineWidth(0.8);
      doc.line(totalsX, ty, W - M, ty);
      ty += 5;
      
      doc.setFontSize(11); doc.setFont(undefined, 'bold'); doc.setTextColor(37, 99, 235);
      doc.text('NET À PAYER', totalsX, ty);
      doc.text(`${pdfBalance.toFixed(2)} €`, W - M, ty, { align: 'right' });
      ty += 6;
      
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

  const filtered = invoices.filter(inv => {
    const searchStr = `${inv.invoiceNumber} ${inv.clientName} ${inv.status} ${inv.total}`.toLowerCase();
    const matchSearch = search === '' || searchStr.includes(search.toLowerCase());
    const matchStatus = filterStatus === 'all' || inv.status === filterStatus;
    const matchView = viewMode === 'active' ? inv.status !== 'cancelled' : inv.status === 'cancelled';
    return matchSearch && matchStatus && matchView;
  });

  const advanceInvoiceIds = new Set(invoices.filter(i => i.type === 'advance').map(i => i.originalInvoiceId));
  const balanceInvoiceIds = new Set(invoices.filter(i => i.type === 'standard' && i.originalInvoiceId && invoices.find(a => a.$id === i.originalInvoiceId && a.type === 'advance')).map(i => i.originalInvoiceId));
  const finalInvoiceIds = new Set(invoices.filter(i => i.type === 'standard' && i.originalInvoiceId && invoices.find(a => a.$id === i.originalInvoiceId && a.type === 'advance')).map(i => i.$id));

  const formatDate = (d?: string) => d ? new Date(d).toLocaleDateString('fr-FR') : '-';

  const totalAmount = filtered.reduce((s, i) => s + (i.total || 0), 0);
  const paidAmount = filtered.filter(i => i.status === 'paid').reduce((s, i) => s + (i.total || 0), 0);
  const unpaidAmount = filtered.filter(i => i.status !== 'paid' && i.status !== 'cancelled').reduce((s, i) => s + (i.balance || i.total || 0), 0);
  const overdueInvoices = filtered.filter(i => getDaysOverdue(i.dueDate, i.status) > 0);
  const overdueCount = overdueInvoices.length;
  const overdueAmount = overdueInvoices.reduce((s, i) => s + (i.balance || i.total || 0), 0);

  if (permLoading) return <div className="min-h-screen flex items-center justify-center bg-gray-50">Vérification des droits...</div>;
  if (!hasPermission('invoices.view')) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate('/dashboard')} className="text-slate-400 hover:text-slate-600"><ChevronLeft size={24} /></button>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2"><Receipt className="text-purple-600" />Factures</h1>
              <p className="text-sm text-slate-500">{filtered.length} facture(s) {viewMode === 'active' ? 'active(s)' : 'archivée(s)'}</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow p-4 border-l-4 border-blue-500">
            <p className="text-xs text-slate-500 uppercase font-semibold">Total facturé</p>
            <p className="text-xl font-bold text-slate-900 mt-1">{fm(totalAmount)}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4 border-l-4 border-green-500">
            <p className="text-xs text-slate-500 uppercase font-semibold">Encaissé</p>
            <p className="text-xl font-bold text-green-600 mt-1">{fm(paidAmount)}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4 border-l-4 border-red-500">
            <p className="text-xs text-slate-500 uppercase font-semibold">À encaisser</p>
            <p className="text-xl font-bold text-red-600 mt-1">{fm(unpaidAmount)}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4 border-l-4 border-orange-500">
            <p className="text-xs text-slate-500 uppercase font-semibold">En retard</p>
            <p className="text-xl font-bold text-orange-600 mt-1">{overdueCount}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4 border-l-4 border-purple-500">
            <p className="text-xs text-slate-500 uppercase font-semibold">Montant retard</p>
            <p className="text-xl font-bold text-purple-600 mt-1">{fm(overdueAmount)}</p>
          </div>
        </div>

        <div className="flex border-b border-slate-200 mb-6">
          <button onClick={() => setViewMode('active')} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${viewMode === 'active' ? 'border-purple-600 text-purple-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            Actives ({invoices.filter(i => i.status !== 'cancelled').length})
          </button>
          <button onClick={() => setViewMode('archived')} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${viewMode === 'archived' ? 'border-purple-600 text-purple-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            Archivées ({invoices.filter(i => i.status === 'cancelled').length})
          </button>
        </div>

        <div className="flex gap-4 mb-6">
          <div className="relative flex-1">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input placeholder="Rechercher (N°, client, montant...)" value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none text-sm" />
          </div>
          {viewMode === 'active' && (
            <div className="relative">
              <Filter size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none text-sm bg-white">
                <option value="all">Tous les statuts</option>
                {Object.entries(statusLabels).filter(([k]) => k !== 'cancelled').map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </div>
          )}
        </div>

        {loading ? <div className="text-center py-12 text-slate-500">Chargement...</div> : filtered.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <Receipt size={48} className="mx-auto text-slate-300 mb-4" />
            <h3 className="font-semibold text-slate-700">Aucune facture {viewMode === 'active' ? 'active' : 'archivée'}</h3>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50 border-b">
                <tr>
                  <th className="p-4 text-xs font-semibold text-slate-500 uppercase">N° Facture</th>
                  <th className="p-4 text-xs font-semibold text-slate-500 uppercase">Client</th>
                  <th className="p-4 text-xs font-semibold text-slate-500 uppercase">Date</th>
                  <th className="p-4 text-xs font-semibold text-slate-500 uppercase">Échéance</th>
                  <th className="p-4 text-xs font-semibold text-slate-500 uppercase">Total TTC</th>
                  <th className="p-4 text-xs font-semibold text-slate-500 uppercase">Payé</th>
                  <th className="p-4 text-xs font-semibold text-slate-500 uppercase">Reste</th>
                  <th className="p-4 text-xs font-semibold text-slate-500 uppercase">Statut</th>
                  <th className="p-4 text-right text-xs font-semibold text-slate-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map(inv => {
                  const daysOverdue = getDaysOverdue(inv.dueDate, inv.status);
                  const hasAdvance = advanceInvoiceIds.has(inv.$id);
                  const hasBalance = balanceInvoiceIds.has(inv.$id);
                  const paidAmountForInvoice = getPaidAmount(inv);

                  return (
                    <tr key={inv.$id} className="hover:bg-slate-50">
                      <td className="p-4">
                        <div className="flex flex-col gap-1">
                          <span className={`inline-flex items-center gap-1 text-xs font-mono font-semibold px-2 py-1 rounded w-fit ${typeColors[inv.type || 'standard']}`}>
                            <Hash size={12} />{inv.invoiceNumber}
                          </span>
                          {(inv.type === 'advance' || inv.type === 'balance' || inv.type === 'credit') && (
                            <span className="text-[10px] text-slate-500 italic">{typeLabels[inv.type]}</span>
                          )}
                        </div>
                      </td>
                      <td className="p-4 text-sm font-medium text-slate-900">{inv.clientName || '-'}</td>
                      <td className="p-4 text-sm text-slate-600">{formatDate(inv.issueDate)}</td>
                      <td className="p-4 text-sm text-slate-600">
                        {formatDate(inv.dueDate)}
                        {daysOverdue > 0 && <span className="block text-xs text-red-600 font-semibold mt-1">+{daysOverdue} j de retard</span>}
                      </td>
                      <td className="p-4 text-sm font-semibold text-slate-900">{fm(inv.total || 0)}</td>
                      <td className="p-4 text-sm font-medium text-green-600">{fm(paidAmountForInvoice)}</td>
                      <td className="p-4 text-sm font-medium text-red-600">
                        {inv.status === 'paid' ? '0,00 €' : fm(Math.max(0, (inv.total || 0) - getPaidAmount(inv)))}
                      </td>
                      <td className="p-4">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${statusColors[inv.status] || 'bg-gray-100 text-gray-800'}`}>
                          {statusLabels[inv.status] || inv.status}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex justify-end gap-1">
                          {viewMode === 'active' ? (
                            <>
                              {inv.clientToken && (
                                <button onClick={() => handleCopyLink(inv)} className={`p-2 rounded-lg transition-colors ${copiedToken === inv.clientToken ? 'text-green-600 bg-green-50' : 'text-slate-400 hover:text-blue-600 hover:bg-blue-50'}`} title="Copier le lien">
                                  {copiedToken === inv.clientToken ? <CheckCircle2 size={16} /> : <Copy size={16} />}
                                </button>
                              )}
                              
                              {hasPermission('invoices.create') && inv.type === 'standard' && inv.deposit > 0 && inv.status !== 'paid' && !hasAdvance && !finalInvoiceIds.has(inv.$id) && (
                                <button onClick={() => handleOpenAdvanceModal(inv)} className="p-2 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors" title="Générer facture d'acompte">
                                  <FileText size={16} />
                                </button>
                              )}

                              {hasPermission('invoices.create') && inv.type === 'advance' && inv.status === 'paid' && !hasBalance && (
                                <button 
                                  onClick={() => handleGenerateFinalFromAdvance(inv)} 
                                  disabled={generatingFinal}
                                  className="p-2 text-purple-500 hover:text-purple-700 hover:bg-purple-50 rounded-lg transition-colors disabled:opacity-50" 
                                  title="Générer la facture finale (travaux terminés)"
                                >
                                  <Receipt size={16} />
                                </button>
                              )}

                              {hasPermission('invoices.mark_paid') && inv.status !== 'paid' && inv.status !== 'cancelled' && (inv.balance || 0) > 0 && (
                                <>
                                  <button 
                                    onClick={() => {
                                      setInvoiceToConfirm(inv);
                                      setShowConfirmPaidModal(true);
                                    }} 
                                    className="p-2 text-green-500 hover:text-green-700 hover:bg-green-50 rounded-lg transition-colors" 
                                    title="Marquer payée (rapide)"
                                  >
                                    <CheckCircle2 size={16} />
                                  </button>
                                  <button onClick={() => handleOpenPaymentModal(inv)} className="p-2 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors" title="Enregistrer un paiement">
                                    <DollarSign size={16} />
                                  </button>
                                </>
                              )}
                              <button onClick={() => generatePDF(inv)} className="p-2 text-slate-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg" title="PDF">
                                <Download size={16} />
                              </button>
                              {hasPermission('invoices.delete') && (
                                <button onClick={() => handleArchive(inv.$id, inv.invoiceNumber)} className="p-2 text-slate-400 hover:text-orange-600 hover:bg-orange-50 rounded-lg" title="Archiver">
                                  <Archive size={16} />
                                </button>
                              )}
                            </>
                          ) : (
                            <button onClick={() => handleUnarchive(inv.$id, inv.invoiceNumber)} className="inline-flex items-center space-x-1 px-3 py-1.5 text-sm font-medium text-green-700 bg-green-50 rounded-lg hover:bg-green-100 transition-colors">
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
        )}
      </main>

      {showQuoteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0">
              <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <FileText className="text-green-600" size={22} />
                Devis d'origine
              </h2>
              <button onClick={() => { setShowQuoteModal(false); setQuoteDetails(null); }} className="p-2 hover:bg-slate-100 rounded-lg">
                <X size={20} className="text-slate-500" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {loadingQuote ? (
                <div className="text-center py-12 text-slate-500">Chargement du devis...</div>
              ) : quoteDetails ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-slate-50 border rounded-lg p-3">
                      <p className="text-xs text-slate-500 uppercase font-semibold">N° Devis</p>
                      <p className="font-mono font-bold text-green-700 text-lg mt-1">{quoteDetails.quoteNumber}</p>
                    </div>
                    <div className="bg-slate-50 border rounded-lg p-3">
                      <p className="text-xs text-slate-500 uppercase font-semibold">Statut</p>
                      <span className={`inline-block mt-1 px-2.5 py-1 rounded-full text-xs font-medium ${quoteStatusColors[quoteDetails.status] || 'bg-gray-100 text-gray-800'}`}>
                        {quoteDetails.status}
                      </span>
                    </div>
                    <div className="bg-slate-50 border rounded-lg p-3">
                      <p className="text-xs text-slate-500 uppercase font-semibold">Client</p>
                      <p className="font-semibold text-slate-900 mt-1">{quoteDetails.clientName}</p>
                    </div>
                    <div className="bg-slate-50 border rounded-lg p-3">
                      <p className="text-xs text-slate-500 uppercase font-semibold">Date</p>
                      <p className="text-slate-900 mt-1">{formatDate(quoteDetails.issueDate)}</p>
                    </div>
                  </div>
                  {quoteDetails.subject && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <p className="text-xs text-blue-700 uppercase font-semibold">Objet</p>
                      <p className="text-slate-900 mt-1">{quoteDetails.subject}</p>
                    </div>
                  )}
                  {quoteDetails.items && (
                    <div>
                      <p className="text-xs text-slate-500 uppercase font-semibold mb-2">Lignes du devis</p>
                      <div className="border rounded-lg overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-slate-50 border-b">
                            <tr>
                              <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500">Désignation</th>
                              <th className="px-3 py-2 text-center text-xs font-semibold text-slate-500">Qté</th>
                              <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500">Prix U.</th>
                              <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500">Total</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {(() => {
                              try {
                                const items = JSON.parse(quoteDetails.items);
                                return items.map((item: any, idx: number) => (
                                  <tr key={idx}>
                                    <td className="px-3 py-2 text-slate-900">{item.description}</td>
                                    <td className="px-3 py-2 text-center text-slate-600">{item.quantity}</td>
                                    <td className="px-3 py-2 text-right text-slate-600">{item.unitPrice?.toFixed(2)} €</td>
                                    <td className="px-3 py-2 text-right font-semibold">{item.total?.toFixed(2)} €</td>
                                  </tr>
                                ));
                              } catch { return null; }
                            })()}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="flex justify-between"><span className="text-slate-600">Total HT</span><span className="font-semibold">{fm(quoteDetails.subtotal || 0)}</span></div>
                      <div className="flex justify-between"><span className="text-slate-600">TVA</span><span className="font-semibold">{fm(quoteDetails.tax || 0)}</span></div>
                      {quoteDetails.discount ? <div className="flex justify-between text-red-600"><span>Remise</span><span>-{fm(quoteDetails.discount)}</span></div> : null}
                      <div className="flex justify-between text-lg font-bold border-t pt-2 col-span-2"><span>Total TTC</span><span>{fm(quoteDetails.total || 0)}</span></div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 text-slate-500">Aucune donnée de devis trouvée.</div>
              )}
            </div>
            <div className="flex justify-end px-6 py-4 border-t bg-slate-50 flex-shrink-0 rounded-b-xl">
              <button onClick={() => { setShowQuoteModal(false); setQuoteDetails(null); }} className="px-4 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50">
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {showPaymentModal && selectedInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <DollarSign className="text-blue-600" size={22} />
                Enregistrer un paiement
              </h2>
              <button onClick={() => setShowPaymentModal(false)} className="p-2 hover:bg-slate-100 rounded-lg">
                <X size={20} className="text-slate-500" />
              </button>
            </div>
            <div className="px-6 py-4 space-y-3">
              <div className="bg-slate-50 border rounded-lg p-3">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Facture</span>
                  <span className="font-semibold">{selectedInvoice.invoiceNumber}</span>
                </div>
                <div className="flex justify-between text-sm mt-1">
                  <span className="text-slate-600">Client</span>
                  <span className="font-semibold">{selectedInvoice.clientName}</span>
                </div>
                <div className="flex justify-between text-sm mt-1">
                  <span className="text-slate-600">Reste à payer</span>
                  <span className="font-bold text-red-600">
                    {fm(Math.max(0, (selectedInvoice.total || 0) - getPaidAmount(selectedInvoice)))}
                  </span>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Montant payé (€) *</label>
                <input 
                  type="number" 
                  step="0.01" 
                  min="0.01" 
                  max={Math.max(0, (selectedInvoice.total || 0) - getPaidAmount(selectedInvoice))}
                  value={paymentForm.amount} 
                  onChange={e => setPaymentForm({ ...paymentForm, amount: e.target.value })} 
                  className="w-full border border-slate-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none" 
                  placeholder="0.00" 
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Date du paiement *</label>
                <input type="date" value={paymentForm.date} onChange={e => setPaymentForm({ ...paymentForm, date: e.target.value })} className="w-full border border-slate-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Moyen de paiement *</label>
                <select value={paymentForm.method} onChange={e => setPaymentForm({ ...paymentForm, method: e.target.value })} className="w-full border border-slate-300 rounded-lg p-2.5 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none">
                  {paymentMethodsList.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Référence</label>
                <input type="text" value={paymentForm.reference} onChange={e => setPaymentForm({ ...paymentForm, reference: e.target.value })} className="w-full border border-slate-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none" placeholder="N° chèque, virement..." />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
                <textarea rows={2} value={paymentForm.notes} onChange={e => setPaymentForm({ ...paymentForm, notes: e.target.value })} className="w-full border border-slate-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Notes internes..." />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t bg-slate-50 rounded-b-xl">
              <button onClick={() => setShowPaymentModal(false)} className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50">
                Annuler
              </button>
              <button onClick={handleSavePayment} disabled={savingPayment || !paymentForm.amount || parseFloat(paymentForm.amount) <= 0} className="px-5 py-2.5 text-sm font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
                {savingPayment ? (
                  <><span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span> Enregistrement...</>
                ) : (
                  <><CheckCircle2 size={16} /> Valider le paiement</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {showAdvanceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <FileText className="text-blue-600" size={22} />
                Générer une facture d'acompte
              </h2>
              <button onClick={() => setShowAdvanceModal(false)} className="p-2 hover:bg-slate-100 rounded-lg">
                <X size={20} className="text-slate-500" />
              </button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-sm text-blue-900">
                  <strong>Rappel légal :</strong> Selon l'article 289 nonies du CGI, tout acompte encaissé doit faire l'objet d'une facture d'acompte distincte avec TVA exigible dès l'encaissement.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Pourcentage d'acompte (%) *</label>
                <input 
                  type="number" 
                  min="1" 
                  max="99" 
                  step="0.01"
                  value={advanceForm.percent} 
                  onChange={e => setAdvanceForm({ ...advanceForm, percent: e.target.value })} 
                  className="w-full border border-slate-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none" 
                />
                <p className="text-xs text-slate-500 mt-1">
                  Montant de l'acompte : {(() => {
                    const inv = invoices.find(i => i.$id === advanceForm.invoiceId);
                    return inv ? (inv.deposit || 0).toFixed(2) : '0.00';
                  })()} € TTC
                </p>
              </div>
              <div className="bg-slate-50 border rounded-lg p-3 text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-600">Facture d'origine :</span>
                  <span className="font-semibold">{invoices.find(i => i.$id === advanceForm.invoiceId)?.invoiceNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Client :</span>
                  <span className="font-semibold">{invoices.find(i => i.$id === advanceForm.invoiceId)?.clientName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Total facture :</span>
                  <span className="font-semibold">{(() => {
                    const inv = invoices.find(i => i.$id === advanceForm.invoiceId);
                    return inv ? (inv.total || 0).toFixed(2) : '0.00';
                  })()} € TTC</span>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t bg-slate-50 rounded-b-xl">
              <button onClick={() => setShowAdvanceModal(false)} className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50">
                Annuler
              </button>
              <button 
                onClick={handleGenerateAdvanceInvoice} 
                disabled={savingAdvance || !advanceForm.percent || parseFloat(advanceForm.percent) <= 0}
                className="px-5 py-2.5 text-sm font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {savingAdvance ? (
                  <><span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span> Génération...</>
                ) : (
                  <><FileText size={16} /> Générer la facture d'acompte</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {showConfirmPaidModal && invoiceToConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-100">
            <div className="p-6">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 size={32} className="text-green-600" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 text-center mb-2">
                Confirmer le paiement
              </h3>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 my-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Facture</span>
                  <span className="font-semibold text-slate-900">{invoiceToConfirm.invoiceNumber}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Client</span>
                  <span className="font-semibold text-slate-900">{invoiceToConfirm.clientName}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Montant à payer</span>
                  <span className="font-bold text-green-600">
                    {fm(Math.max(0, (invoiceToConfirm.total || 0) - getPaidAmount(invoiceToConfirm)))}
                  </span>
                </div>
              </div>
              <p className="text-sm text-slate-600 text-center mb-6">
                Voulez-vous marquer cette facture comme <strong>entièrement payée</strong> ?
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowConfirmPaidModal(false);
                    setInvoiceToConfirm(null);
                  }}
                  className="flex-1 px-4 py-3 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 transition-all"
                >
                  Annuler
                </button>
                <button
                  onClick={handleConfirmPaid}
                  className="flex-1 px-4 py-3 text-sm font-bold text-white bg-green-600 rounded-xl hover:bg-green-700 transition-all shadow-lg shadow-green-600/20 flex items-center justify-center gap-2"
                >
                  <CheckCircle2 size={16} /> Confirmer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showConfirmPaymentModal && paymentToConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-100">
            <div className="p-6">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <DollarSign size={32} className="text-blue-600" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 text-center mb-2">
                Confirmer le paiement
              </h3>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 my-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Facture</span>
                  <span className="font-semibold text-slate-900">{paymentToConfirm.invoice.invoiceNumber}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Client</span>
                  <span className="font-semibold text-slate-900">{paymentToConfirm.invoice.clientName}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Montant</span>
                  <span className="font-bold text-blue-600">{fm(paymentToConfirm.payment.amount)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Date</span>
                  <span className="font-semibold text-slate-900">{new Date(paymentToConfirm.payment.date).toLocaleDateString('fr-FR')}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Moyen</span>
                  <span className="font-semibold text-slate-900">{paymentToConfirm.payment.method}</span>
                </div>
                {paymentToConfirm.payment.reference && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">Référence</span>
                    <span className="font-semibold text-slate-900">{paymentToConfirm.payment.reference}</span>
                  </div>
                )}
              </div>
              <p className="text-sm text-slate-600 text-center mb-6">
                Voulez-vous <strong>enregistrer définitivement</strong> ce paiement ?
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowConfirmPaymentModal(false);
                    setPaymentToConfirm(null);
                    setSelectedInvoice(paymentToConfirm.invoice);
                    setPaymentForm({
                      amount: paymentToConfirm.payment.amount.toFixed(2),
                      date: paymentToConfirm.payment.date,
                      method: paymentToConfirm.payment.method,
                      reference: paymentToConfirm.payment.reference || '',
                      notes: paymentToConfirm.payment.notes || ''
                    });
                    setShowPaymentModal(true);
                  }}
                  className="flex-1 px-4 py-3 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 transition-all"
                >
                  Modifier
                </button>
                <button
                  onClick={handleConfirmPayment}
                  disabled={savingPayment}
                  className="flex-1 px-4 py-3 text-sm font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {savingPayment ? (
                    <><span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span> Enregistrement...</>
                  ) : (
                    <><CheckCircle2 size={16} /> Confirmer</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showReceiptChoiceModal && lastPaymentData && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-100">
            <div className="p-6">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 size={32} className="text-green-600" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 text-center mb-2">
                Paiement enregistré !
              </h3>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 my-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Facture</span>
                  <span className="font-semibold text-slate-900">{lastPaymentData.invoice.invoiceNumber}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Client</span>
                  <span className="font-semibold text-slate-900">{lastPaymentData.invoice.clientName}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Montant payé</span>
                  <span className="font-bold text-green-600">{fm(lastPaymentData.payment.amount)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Moyen</span>
                  <span className="font-semibold text-slate-900">{lastPaymentData.payment.method}</span>
                </div>
              </div>
              <p className="text-sm text-slate-600 text-center mb-6">
                Voulez-vous générer le reçu de paiement pour le client ?
              </p>
              <div className="flex gap-3">
                <button
                  onClick={async () => {
                    setShowReceiptChoiceModal(false);
                    await generateReceiptPDF(lastPaymentData.invoice, lastPaymentData.payment);
                    setLastPaymentData(null);
                  }}
                  className="flex-1 px-4 py-3 text-sm font-bold text-white bg-green-600 rounded-xl hover:bg-green-700 transition-all shadow-lg shadow-green-600/20 flex items-center justify-center gap-2"
                >
                  <Receipt size={16} /> Générer le reçu
                </button>
                <button
                  onClick={() => {
                    setShowReceiptChoiceModal(false);
                    setLastPaymentData(null);
                  }}
                  className="flex-1 px-4 py-3 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 transition-all"
                >
                  Plus tard
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}