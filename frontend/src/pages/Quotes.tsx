import Sidebar from '../components/Sidebar';
import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { databases, DATABASE_ID } from '../appwrite';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { useCompanySettings } from '../hooks/useCompanySettings';
import { getFilePreviewUrl } from '../utils/storage';
import { verifyDocumentAccess, logAuditAction } from '../utils/security';
import { toast } from 'sonner';
import Modal from '../components/ui/Modal';
import ActionMenu, { ActionMenuItem } from '../components/ui/ActionMenu';
import {
  PageHeader,
  TypeTabs,
  KPIGrid,
  StatCell,
  EmptyState,
  Avatar,
  StatusIndicator,
  TypeLabel,
  SkeletonRow,
  SkeletonCard,
  ConfirmDialog,
  FormField,
  Input,
  Select,
  Textarea,
  Alert,
  Pagination,
  ViewTabs,
  SearchFilter,
  SelectFilter,
  MobileCard,
  DataTable,
  Card,
  Badge,
  type Entity,
} from '../components/ui/SharedUI';
import {
  Plus, Search, FileText, Download, Filter, Edit2, Copy,
  CheckCircle2, Receipt, X, Archive, RotateCcw, Send,
  AlertCircle, Eye, Send as SendIcon
} from 'lucide-react';
import { Query, ID as AppwriteID, Permission, Role } from 'appwrite';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import QuoteModal from '../components/QuoteModal';

interface QuoteItem {
  id: string; reference: string; description: string; quantity: number;
  unit: string; unitPrice: number; tvaRate: number; total: number; discount: number;
}

interface Quote {
  $id: string; quoteNumber: string; clientName: string; subject?: string; status: string;
  total: number; issueDate?: string; validityDate?: string; items?: string;
  subtotal?: number; discount?: number; tax?: number; deposit?: number; balance?: number;
  companyName?: string; companyLegalForm?: string; companyAddress?: string;
  companySiret?: string; companyRcs?: string; companyTva?: string;
  companyPhone?: string; companyEmail?: string; logoFileId?: string;
  clientAddress?: string; clientBillingAddress?: string; clientEmail?: string;
  clientPhone?: string; executionDelay?: string; paymentConditions?: string;
  paymentMethods?: string; specialConditions?: string; acceptanceMention?: string;
  bonPourAccord?: boolean; tradeType?: string; insuranceName?: string;
  insuranceAddress?: string; insurancePolicy?: string; tvaMention?: string;
  clientId?: string;
  clientSignature?: string; clientToken?: string; clientComment?: string;
  teamId?: string;
}

interface CompanySettings {
  name: string; legalForm: string; address: string; siret: string; rcs: string;
  tvaNumber: string; phone: string; email: string; defaultTvaRate: string; logoFileId?: string;
}

const statusColors: Record<string, string> = {
  Brouillon: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
  Envoyé: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  Accepté: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  Refusé: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  Facturé: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
  Archivé: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
};

const statusLabels: Record<string, string> = {
  Brouillon: 'Brouillon', Envoyé: 'Envoyé', Accepté: 'Accepté', Refusé: 'Refusé',
  Facturé: 'Facturé', Archivé: 'Archivé'
};

export default function Quotes() {
  const { user } = useAuth();
  const { hasPermission, permissions, loading: permLoading } = usePermissions();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    fm,
    currency,
    currencyConfig,
    loading: settingsLoading
  } = useCompanySettings();
  const SYM = currencyConfig?.symbol || '€';

  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);
  const [editingQuote, setEditingQuote] = useState<Quote | null>(null);
  const [preselectedClientId, setPreselectedClientId] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [currentTeamId, setCurrentTeamId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'active' | 'archived'>('active');
  const [showChoiceModal, setShowChoiceModal] = useState(false);
  const [selectedQuoteForInvoice, setSelectedQuoteForInvoice] = useState<Quote | null>(null);
  const [generating, setGenerating] = useState(false);
  const [showAdvanceModal, setShowAdvanceModal] = useState(false);
  const [advanceForm, setAdvanceForm] = useState({ amount: '', quoteId: '' });

  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!permLoading && !hasPermission('quotes.view')) {
      navigate('/dashboard');
    }
  }, [permLoading, hasPermission, navigate]);

  useEffect(() => {
    if (!user || !user.$id) return;
    const safetyTimer = setTimeout(() => setLoading(false), 4000);
    const initializePage = async () => {
      try {
        await loadCompanySettings();
        await loadData();
      } catch (error) {
        console.error("⚠️ Erreur initialisation :", error);
      } finally {
        clearTimeout(safetyTimer);
        setLoading(false);
      }
    };
    initializePage();
    return () => clearTimeout(safetyTimer);
  }, [user, viewMode]);

  useEffect(() => {
    const clientId = searchParams.get('clientId');
    if (clientId && clients.length > 0) {
      const c = clients.find((x: any) => x.$id === clientId);
      if (c) {
        setPreselectedClientId(c.$id);
        setEditingQuote(null);
        setShowModal(true);
        setSearchParams({});
      }
    }
  }, [clients, searchParams]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (quotes.some(q => q.status === 'Envoyé' || q.status === 'Accepté')) loadData(true);
    }, 10000);
    return () => clearInterval(interval);
  }, [quotes]);

  const loadCompanySettings = async () => {
    if (!user) return;
    try {
      const res = await databases.listDocuments(DATABASE_ID, 'company_settings', [Query.equal('userId', user.$id)]);
      if (res.documents.length > 0) setCompanySettings(res.documents[0] as unknown as CompanySettings);
    } catch (e) { console.log('Settings not found'); }
  };

  const loadData = async (isBackground = false) => {
    if (!user) return;
    if (!isBackground) setLoading(true);
    try {
      let teamId = null;
      const teamsRes = await databases.listDocuments(DATABASE_ID, 'teams', [Query.equal('ownerId', user.$id)]);
      if (teamsRes.documents.length > 0) teamId = teamsRes.documents[0].$id;
      else {
        const membersRes = await databases.listDocuments(DATABASE_ID, 'team_members', [Query.equal('userId', user.$id)]);
        if (membersRes.documents.length > 0) teamId = membersRes.documents[0].teamId;
      }
      if (!teamId) { if (!isBackground) setLoading(false); return; }
      setCurrentTeamId(teamId);
      const [qRes, cRes, iRes] = await Promise.all([
        databases.listDocuments(DATABASE_ID, 'quotes', [Query.equal('teamId', teamId), Query.orderDesc('$createdAt'), Query.limit(2000)]),
        databases.listDocuments(DATABASE_ID, 'clients', [Query.equal('teamId', teamId), Query.orderDesc('$createdAt'), Query.limit(2000)]),
        databases.listDocuments(DATABASE_ID, 'invoices', [Query.equal('teamId', teamId), Query.limit(2000)])
      ]);
      setQuotes(qRes.documents as unknown as Quote[]);
      setClients(cRes.documents);
      setInvoices(iRes.documents);
    } catch (e: any) { console.error("💥 Erreur loadData :", e.message); }
    finally { if (!isBackground) setLoading(false); }
  };

  const getNextQuoteNumber = async () => {
    if (!currentTeamId) return `DEV-${new Date().getFullYear()}-001`;
    const currentYear = new Date().getFullYear();
    const prefix = `DEV-${currentYear}-`;
    let maxNum = 0;
    try {
      const response = await databases.listDocuments(DATABASE_ID, 'quotes', [Query.equal('teamId', currentTeamId), Query.limit(2000)]);
      response.documents.forEach((doc: any) => {
        if (doc.quoteNumber && doc.quoteNumber.startsWith(prefix)) {
          const num = parseInt(doc.quoteNumber.replace(prefix, ''), 10);
          if (!isNaN(num) && num > maxNum) maxNum = num;
        }
      });
    } catch (e) { console.error('Erreur génération numéro:', e); }
    return `${prefix}${String(maxNum + 1).padStart(3, '0')}`;
  };

  const getNextInvoiceNumber = async (prefix: string = 'FAC') => {
    if (!currentTeamId) return `${prefix}-${new Date().getFullYear()}-001`;
    const currentYear = new Date().getFullYear();
    const fullPrefix = `${prefix}-${currentYear}-`;
    let maxNum = 0;
    try {
      const response = await databases.listDocuments(DATABASE_ID, 'invoices', [Query.equal('teamId', currentTeamId), Query.limit(2000)]);
      response.documents.forEach((doc: any) => {
        if (doc.invoiceNumber && doc.invoiceNumber.startsWith(fullPrefix)) {
          const num = parseInt(doc.invoiceNumber.replace(fullPrefix, ''), 10);
          if (!isNaN(num) && num > maxNum) maxNum = num;
        }
      });
    } catch (e) { console.error('Erreur génération numéro facture:', e); }
    return `${fullPrefix}${String(maxNum + 1).padStart(3, '0')}`;
  };

  const handleOpenAdd = async () => {
    await loadCompanySettings();
    setEditingQuote(null);
    setPreselectedClientId(null);
    setShowModal(true);
  };

  const handleEditQuote = async (quote: Quote) => {
    if (quote.status === 'Accepté' || quote.status === 'Facturé' || quote.status === 'Archivé') {
      toast.error('Ce devis ne peut plus être modifié.');
      return;
    }
    await loadCompanySettings();
    setEditingQuote(quote);
    setPreselectedClientId(null);
    setShowModal(true);
  };

  const handleCopyLink = async (quote: Quote) => {
    if (!quote.clientToken) { toast.warning("Ce devis n'a pas encore été envoyé au client."); return; }
    if (quote.teamId && quote.teamId !== currentTeamId) {
      toast.error('⚠️ Accès refusé');
      return;
    }
    const link = `${window.location.origin}/v/${quote.clientToken}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopiedToken(quote.clientToken);
      if (user && user.$id && currentTeamId) {
        await logAuditAction(user.$id, currentTeamId, 'read', 'quote', quote.$id, { action: 'share_link' });
      }
      toast.success('Lien copié dans le presse-papiers');
      setTimeout(() => setCopiedToken(null), 2000);
    } catch { toast.info(`Lien : ${link}`, { duration: 5000 }); }
  };

  const handleArchive = async (id: string, num: string) => {
    if (!confirm(`Archiver le devis ${num} ?`)) return;
    try {
      await verifyDocumentAccess('quotes', id, currentTeamId!);
      await databases.updateDocument(DATABASE_ID, 'quotes', id, { status: 'Archivé' });
      if (user && user.$id && currentTeamId) {
        await logAuditAction(user.$id, currentTeamId, 'update', 'quote', id, { action: 'archive' });
      }
      toast.success(`Devis ${num} archivé`);
      await loadData();
    } catch (error: any) {
      toast.error(`Erreur : ${error.message}`);
    }
  };

  const handleUnarchive = async (id: string, num: string) => {
    try {
      await verifyDocumentAccess('quotes', id, currentTeamId!);
      await databases.updateDocument(DATABASE_ID, 'quotes', id, { status: 'Brouillon' });
      if (user && user.$id && currentTeamId) {
        await logAuditAction(user.$id, currentTeamId, 'update', 'quote', id, { action: 'unarchive' });
      }
      toast.success(`Devis ${num} désarchivé`);
      await loadData();
      setViewMode('active');
    } catch (error: any) {
      toast.error(`Erreur : ${error.message}`);
    }
  };

  const handleOpenChoiceModal = (quote: Quote) => {
    setSelectedQuoteForInvoice(quote);
    setShowChoiceModal(true);
  };

  const handleChooseAdvance = () => {
    if (!selectedQuoteForInvoice) return;
    setAdvanceForm({
      amount: (selectedQuoteForInvoice.deposit || 0).toString() || '',
      quoteId: selectedQuoteForInvoice.$id
    });
    setShowChoiceModal(false);
    setShowAdvanceModal(true);
  };

  const handleChooseFinal = async () => {
    if (!selectedQuoteForInvoice || !currentTeamId || !user || !user.$id) return;
    setGenerating(true);
    try {
      const quote = selectedQuoteForInvoice;
      const invoiceNumber = await getNextInvoiceNumber('FAC');
      const today = new Date().toISOString().split('T')[0];
      const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const vatRate = parseFloat(companySettings?.defaultTvaRate || '20');
      const payload = {
        invoiceNumber, quoteId: quote.$id, userId: user.$id, teamId: currentTeamId,
        type: 'standard', originalQuoteId: quote.$id,
        currencyCode: currency,
        clientToken: Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15),
        status: 'draft', issueDate: today, dueDate: dueDate,
        subtotal: Math.round((quote.subtotal || 0) * 100) / 100,
        vatRate: Math.round(vatRate), vatAmount: Math.round((quote.tax || 0) * 100) / 100,
        total: Math.round((quote.total || 0) * 100) / 100, discount: quote.discount || 0,
        tax: Math.round((quote.tax || 0) * 100) / 100, deposit: 0,
        balance: Math.round((quote.total || 0) * 100) / 100,
        companyName: quote.companyName || '', companyLegalForm: quote.companyLegalForm || '',
        companyAddress: quote.companyAddress || '', companySiret: quote.companySiret || '',
        companyRcs: quote.companyRcs || '', companyTva: quote.companyTva || '',
        companyPhone: quote.companyPhone || '', companyEmail: quote.companyEmail || '',
        logoFileId: quote.logoFileId || '', clientName: quote.clientName || '',
        clientAddress: quote.clientAddress || '', clientBillingAddress: quote.clientBillingAddress || '',
        clientEmail: quote.clientEmail || '', clientPhone: quote.clientPhone || '',
        items: quote.items || '[]', paymentMethods: quote.paymentMethods || '',
        paymentConditions: quote.paymentConditions || '', executionDelay: quote.executionDelay || '',
        specialConditions: '', tradeType: quote.tradeType || '',
        insuranceName: quote.insuranceName || '', insuranceAddress: quote.insuranceAddress || '',
        insurancePolicy: quote.insurancePolicy || '',
        notes: `Facture finale générée depuis le devis ${quote.quoteNumber}`
      };
      let perms: string[] = [];
      if (user?.secureTeamId) {
        perms = [Permission.read(Role.team(user.secureTeamId)), Permission.update(Role.team(user.secureTeamId)), Permission.delete(Role.team(user.secureTeamId))];
      } else {
        perms = [Permission.read(Role.users()), Permission.update(Role.users()), Permission.delete(Role.users())];
      }
      await databases.createDocument(DATABASE_ID, 'invoices', AppwriteID.unique(), payload, perms);
      if (user.$id && currentTeamId) {
        await logAuditAction(user.$id, currentTeamId, 'create', 'invoice', '', { fromQuote: quote.$id });
      }
      await databases.updateDocument(DATABASE_ID, 'quotes', quote.$id, { status: 'Facturé' });
      setShowChoiceModal(false);
      setSelectedQuoteForInvoice(null);
      await loadData();
      toast.success(`Facture finale ${invoiceNumber} créée avec succès !`, { description: `Montant : ${fm(quote.total || 0)}` });
      navigate('/invoices');
    } catch (e: any) {
      console.error('Erreur génération facture finale:', e);
      toast.error(`Erreur : ${e.message}`);
    } finally {
      setGenerating(false);
    }
  };

  const handleGenerateAdvanceInvoice = async () => {
    if (!selectedQuoteForInvoice || !currentTeamId || !user || !user.$id) return;
    const amount = parseFloat(advanceForm.amount);
    if (!amount || amount <= 0) {
      toast.error('Veuillez saisir un montant d\'acompte valide.');
      return;
    }
    setGenerating(true);
    try {
      const quote = selectedQuoteForInvoice;
      const invoiceNumber = await getNextInvoiceNumber('ACO');
      const today = new Date().toISOString().split('T')[0];
      const dueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const ratio = (quote.total || 0) > 0 ? (amount / (quote.total || 0)) : 0;
      const advanceHT = Math.round((quote.subtotal || 0) * ratio * 100) / 100;
      const advanceTVA = Math.round((quote.tax || 0) * ratio * 100) / 100;
      const payload = {
        invoiceNumber, quoteId: quote.$id, userId: user.$id, teamId: currentTeamId,
        type: 'advance', originalQuoteId: quote.$id,
        currencyCode: currency,
        advancePercent: ((amount / (quote.total || 0)) * 100).toFixed(2),
        clientToken: Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15),
        status: 'draft', issueDate: today, dueDate: dueDate,
        subtotal: advanceHT, vatRate: parseFloat(companySettings?.defaultTvaRate || '20'),
        vatAmount: advanceTVA, total: amount, discount: 0, tax: advanceTVA, deposit: 0, balance: amount,
        companyName: quote.companyName || '', companyLegalForm: quote.companyLegalForm || '',
        companyAddress: quote.companyAddress || '', companySiret: quote.companySiret || '',
        companyRcs: quote.companyRcs || '', companyTva: quote.companyTva || '',
        companyPhone: quote.companyPhone || '', companyEmail: quote.companyEmail || '',
        logoFileId: quote.logoFileId || '', clientName: quote.clientName || '',
        clientAddress: quote.clientAddress || '', clientBillingAddress: quote.clientBillingAddress || '',
        clientEmail: quote.clientEmail || '', clientPhone: quote.clientPhone || '',
        items: JSON.stringify([{
          id: `advance-${Date.now()}`, reference: 'ACOMPTE',
          description: `Acompte sur devis ${quote.quoteNumber}`, quantity: 1, unit: 'forfait',
          unitPrice: advanceHT, tvaRate: parseFloat(companySettings?.defaultTvaRate || '20'),
          total: advanceHT, discount: 0
        }]),
        paymentMethods: quote.paymentMethods || '', paymentConditions: quote.paymentConditions || '',
        executionDelay: quote.executionDelay || '',
        specialConditions: `Facture d'acompte - Référence devis : ${quote.quoteNumber}`,
        notes: `Acompte sur devis ${quote.quoteNumber}`
      };
      let perms: string[] = [];
      if (user?.secureTeamId) {
        perms = [Permission.read(Role.team(user.secureTeamId)), Permission.update(Role.team(user.secureTeamId)), Permission.delete(Role.team(user.secureTeamId))];
      } else {
        perms = [Permission.read(Role.users()), Permission.update(Role.users()), Permission.delete(Role.users())];
      }
      await databases.createDocument(DATABASE_ID, 'invoices', AppwriteID.unique(), payload, perms);
      setShowAdvanceModal(false);
      setSelectedQuoteForInvoice(null);
      await loadData();
      toast.success(`Facture d'acompte ${invoiceNumber} créée avec succès !`, { description: `Montant : ${fm(amount)}` });
      navigate('/invoices');
    } catch (e: any) {
      console.error('Erreur génération acompte:', e);
      toast.error(`Erreur : ${e.message}`);
    } finally {
      setGenerating(false);
    }
  };

  const hasInvoiceForQuote = (quoteId: string): boolean => {
    return invoices.some((inv: any) => inv.originalQuoteId === quoteId || inv.quoteId === quoteId);
  };

  const handleCloseModal = () => {
    setShowModal(false); setEditingQuote(null); setPreselectedClientId(null);
  };

  const handleSaveModal = async () => { handleCloseModal(); await loadData(); };

  const generatePDF = async (qd: Quote) => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const W = 210, M = 20;
    let items: QuoteItem[] = [];
    try { items = JSON.parse(qd.items || '[]'); } catch (e) { }
    const companyName: string = String(qd.companyName || '');
    const companyAddress: string = String(qd.companyAddress || '');
    const companyPhone: string = String(qd.companyPhone || '');
    const companyEmail: string = String(qd.companyEmail || '');
    const companySiret: string = String(qd.companySiret || '');
    const companyTva: string = String(qd.companyTva || '');
    const quoteNumber: string = String(qd.quoteNumber || '');
    const clientName: string = String(qd.clientName || '');
    const clientAddress: string = String(qd.clientAddress || '');
    const clientEmail: string = String(qd.clientEmail || '');
    const subject: string = String(qd.subject || '');
    const paymentMethods: string = String(qd.paymentMethods || '');
    const paymentConditions: string = String(qd.paymentConditions || '');
    const executionDelay: string = String(qd.executionDelay || '');
    const issueDateStr: string = qd.issueDate ? new Date(qd.issueDate).toLocaleDateString('fr-FR') : '-';
    const validityDateStr: string = qd.validityDate ? new Date(qd.validityDate).toLocaleDateString('fr-FR') : '';
    const pdfSubtotal = qd.subtotal || 0;
    const pdfDiscount = qd.discount || 0;
    const pdfTax = qd.tax || 0;
    const pdfTotal = qd.total || 0;
    const pdfDeposit = qd.deposit || 0;
    const pdfBalance = qd.balance || 0;
    const pdfDiscountAmount = pdfSubtotal * (pdfDiscount / 100);
    const pdfTaxableAmount = pdfSubtotal - pdfDiscountAmount;
    const pdfIsTvaApplicable = !companyTva.includes('non applicable');
    const symbol = currencyConfig.symbol;
    let logoB64: string | null = null;
    if (qd.logoFileId) {
      try {
        const u = getFilePreviewUrl('company_logos', qd.logoFileId);
        const b = await fetch(u).then(r => r.blob());
        logoB64 = await new Promise<string>((rs, rj) => {
          const rd = new FileReader(); rd.onloadend = () => rs(rd.result as string); rd.onerror = rj; rd.readAsDataURL(b);
        });
      } catch (e) { console.warn('Logo PDF fail', e); }
    }
    let Y = M;
    if (logoB64) {
      try { doc.addImage(logoB64, logoB64.includes('image/png') ? 'PNG' : 'JPEG', M, Y, 30, 15); } catch (e) { }
    }
    doc.setFontSize(14); doc.setFont(undefined, 'bold');
    doc.text(companyName, M, Y + 22);
    doc.setFontSize(8); doc.setFont(undefined, 'normal');
    let infoY = Y + 27;
    if (companyAddress) { doc.text(companyAddress, M, infoY); infoY += 4; }
    if (companyPhone) { doc.text(`Tél: ${companyPhone}`, M, infoY); infoY += 4; }
    if (companyEmail) { doc.text(`Email: ${companyEmail}`, M, infoY); infoY += 4; }
    if (companySiret) { doc.text(`SIRET: ${companySiret}`, M, infoY); infoY += 4; }
    if (companyTva && !companyTva.includes('non')) { doc.text(`TVA: ${companyTva}`, M, infoY); infoY += 4; }
    const rX = W - M;
    doc.setFontSize(16); doc.setFont(undefined, 'bold');
    doc.text(`DEVIS N° ${quoteNumber}`, rX, Y + 5, { align: 'right' });
    doc.setFontSize(8); doc.setFont(undefined, 'normal');
    doc.text(`Date: ${issueDateStr}`, rX, Y + 10, { align: 'right' });
    if (validityDateStr) doc.text(`Valable jusqu'au: ${validityDateStr}`, rX, Y + 14, { align: 'right' });
    const clientBoxX = rX - 60;
    const clientBoxY = Y + 18;
    doc.setDrawColor(150); doc.setLineWidth(0.3);
    doc.rect(clientBoxX, clientBoxY, 60, 22);
    doc.setFontSize(8); doc.setFont(undefined, 'bold');
    doc.text('CLIENT', clientBoxX + 2, clientBoxY + 4);
    doc.setFont(undefined, 'normal'); doc.setFontSize(9);
    doc.text(clientName, clientBoxX + 2, clientBoxY + 9);
    if (clientAddress) doc.text(clientAddress.substring(0, 50), clientBoxX + 2, clientBoxY + 13);
    if (clientEmail) doc.text(clientEmail, clientBoxX + 2, clientBoxY + 17);
    Y = Math.max(infoY, clientBoxY + 25) + 5;
    if (subject) {
      doc.setFontSize(11); doc.setFont(undefined, 'bold');
      doc.text(`Objet: ${subject}`, W / 2, Y, { align: 'center' });
      Y += 8;
    }
    const tableData = items.map(i => {
      const lineDiscount = i.discount || 0;
      const lineTotal = i.quantity * i.unitPrice * (1 - lineDiscount / 100);
      return [
        i.reference || '-', i.description, i.quantity.toFixed(2), i.unit,
        `${i.unitPrice.toFixed(2)} ${symbol}`, lineDiscount + '%', `${lineTotal.toFixed(2)} ${symbol}`, i.tvaRate + '%'
      ];
    });
    autoTable(doc, {
      startY: Y,
      head: [['Réf.', 'Désignation', 'Qté', 'Unité', 'Prix U HT', 'Remise', 'Total HT', 'TVA']],
      body: tableData, theme: 'grid', margin: { left: M, right: M },
      headStyles: { fillColor: [147, 51, 234], textColor: 255, fontSize: 8, fontStyle: 'bold' },
      styles: { fontSize: 8, cellPadding: 2, lineColor: [200, 200, 200], lineWidth: 0.2 },
      columnStyles: {
        0: { cellWidth: 15, fontStyle: 'normal' }, 1: { cellWidth: 60 },
        2: { cellWidth: 12, halign: 'center' }, 3: { cellWidth: 12, halign: 'center' },
        4: { cellWidth: 18, halign: 'right' }, 5: { cellWidth: 12, halign: 'right' },
        6: { cellWidth: 18, halign: 'right', fontStyle: 'bold' }, 7: { cellWidth: 12, halign: 'right' }
      }
    });
    let ty = (doc as any).lastAutoTable.finalY + 8;
    const totalsX = W - M - 60;
    doc.setFontSize(8); doc.setFont(undefined, 'normal'); doc.setTextColor(0, 0, 0);
    const totalLine = (label: string, value: string, bold = false, color: number[] = [0, 0, 0]) => {
      doc.setFont(undefined, bold ? 'bold' : 'normal');
      doc.setTextColor(color[0], color[1], color[2]);
      doc.text(label, totalsX, ty);
      doc.text(value, W - M, ty, { align: 'right' });
      doc.setDrawColor(200); doc.setLineWidth(0.2);
      doc.line(totalsX, ty + 1, W - M, ty + 1);
      ty += 5;
    };
    totalLine('Total HT', `${pdfSubtotal.toFixed(2)} ${symbol}`);
    if (pdfDiscount > 0) totalLine(`Remise globale ${pdfDiscount}%`, `- ${pdfDiscountAmount.toFixed(2)} ${symbol}`, false, [220, 38, 38]);
    totalLine('Total HT après remise', `${pdfTaxableAmount.toFixed(2)} ${symbol}`);
    totalLine('Total TVA', `${pdfTax.toFixed(2)} ${symbol}`);
    doc.setFont(undefined, 'bold'); doc.setTextColor(0, 0, 0);
    doc.text('Total TTC', totalsX, ty);
    doc.text(`${pdfTotal.toFixed(2)} ${symbol}`, W - M, ty, { align: 'right' });
    doc.setDrawColor(0); doc.setLineWidth(0.5);
    doc.line(totalsX, ty + 1.5, W - M, ty + 1.5);
    ty += 6;
    if (pdfDeposit > 0) {
      totalLine('Acompte', `- ${pdfDeposit.toFixed(2)} ${symbol}`);
      doc.setTextColor(147, 51, 234); doc.setFont(undefined, 'bold');
      doc.text('NET À PAYER', totalsX, ty);
      doc.text(`${pdfBalance.toFixed(2)} ${symbol}`, W - M, ty, { align: 'right' });
      ty += 6;
    }
    if (paymentMethods || paymentConditions || executionDelay) {
      ty += 5; doc.setFontSize(10); doc.setFont(undefined, 'bold'); doc.setTextColor(0, 0, 0);
      doc.text('Conditions de règlement', M, ty);
      doc.setDrawColor(150); doc.setLineWidth(0.3); doc.line(M, ty + 1, W - M, ty + 1);
      ty += 6; doc.setFontSize(8); doc.setFont(undefined, 'normal');
      if (paymentMethods) { doc.text(`Mode: ${paymentMethods}`, M, ty); ty += 4; }
      if (paymentConditions) { doc.text(`Conditions: ${paymentConditions}`, M, ty); ty += 4; }
      if (executionDelay) { doc.text(`Délai: ${executionDelay}`, M, ty); ty += 4; }
      ty += 2; doc.setFont(undefined, 'italic'); doc.setTextColor(100, 100, 100);
      doc.text('Pénalités de retard : 3x le taux d\'intérêt légal (loi 2008-776).', M, ty);
      ty += 4; doc.text('Indemnité forfaitaire pour frais de recouvrement : 40€ (art D.441-5).', M, ty);
      ty += 4;
    }
    if (!pdfIsTvaApplicable && companyTva) {
      doc.setFontSize(7); doc.setFont(undefined, 'italic'); doc.setTextColor(100, 100, 100);
      doc.text(companyTva, M, 285);
    }
    doc.save(`Devis_${quoteNumber}.pdf`);
    toast.success('PDF téléchargé');
  };

  const filtered = quotes.filter(q => {
    const searchStr = `${q.quoteNumber} ${q.clientName} ${q.subject || ''} ${q.status}`.toLowerCase();
    const matchSearch = search === '' || searchStr.includes(search.toLowerCase());
    const matchStatus = filterStatus === 'all' || q.status === filterStatus;
    const matchView = viewMode === 'active' ? q.status !== 'Archivé' : q.status === 'Archivé';
    return matchSearch && matchStatus && matchView;
  });

  const formatDate = (dateStr?: string) => dateStr ? new Date(dateStr).toLocaleDateString('fr-FR') : '-';

  if (permLoading || settingsLoading) return <Sidebar><div className="flex items-center justify-center h-full w-full"><div className="text-slate-500 dark:text-slate-400 text-lg animate-pulse">Vérification des droits...</div></div></Sidebar>;
  if (!hasPermission('quotes.view')) return null;

  return (
    <Sidebar>
      <div className="min-h-full bg-slate-50 dark:bg-slate-900">
        <PageHeader
          icon={FileText}
          iconColor="purple"
          title="Devis"
          description={
            <>
              <span className="font-semibold text-slate-700 dark:text-slate-300 tabular-nums">{filtered.length}</span>{' '}
              devis {viewMode === 'active' ? 'actif(s)' : 'archivé(s)'} • {SYM} {currency}
            </>
          }
          action={
            viewMode === 'active' && hasPermission('quotes.create') ? (
              <button onClick={handleOpenAdd} className="w-full sm:w-auto flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-4 py-2.5 rounded-lg hover:from-purple-700 hover:to-indigo-700 transition-all font-medium text-sm shadow-lg shadow-purple-500/30 active:scale-95">
                <Plus size={18} /> <span>Nouveau devis</span>
              </button>
            ) : null
          }
        />

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <ViewTabs
            active={viewMode}
            onChange={setViewMode}
            counts={{
              active: quotes.filter(q => q.status !== 'Archivé').length,
              archived: quotes.filter(q => q.status === 'Archivé').length
            }}
            color="purple"
          />

          <div className="flex flex-col sm:flex-row gap-3 mb-6">
            <SearchFilter
              value={search}
              onChange={setSearch}
              placeholder="Rechercher (N°, client, objet...)"
              shortcut="⌘K"
              inputRef={searchInputRef}
            />
            {viewMode === 'active' && (
              <SelectFilter
                value={filterStatus}
                onChange={setFilterStatus}
                options={Object.entries(statusLabels).filter(([k]) => k !== 'Archivé').map(([value, label]) => ({ value, label }))}
                placeholder="Tous les statuts"
              />
            )}
          </div>

          {loading ? (
            <>
              <div className="hidden md:block bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-visible">
                <div className="overflow-visible">
                  <table className="w-full">
                    <thead className="bg-slate-50/80 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700 [&>tr>th:first-child]:rounded-tl-xl [&>tr>th:last-child]:rounded-tr-xl">
                      <tr>
                        <th className="text-left px-6 py-4 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">N° Devis</th>
                        <th className="text-left px-6 py-4 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Client</th>
                        <th className="text-left px-6 py-4 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Objet</th>
                        <th className="text-left px-6 py-4 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Date</th>
                        <th className="text-left px-6 py-4 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Total TTC ({currency})</th>
                        <th className="text-left px-6 py-4 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Statut</th>
                        <th className="text-right px-2 py-4 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-12"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                      {[1, 2, 3, 4, 5].map(i => <SkeletonRow key={i} />)}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="md:hidden space-y-4">
                {[1, 2, 3].map(i => <SkeletonCard key={i} />)}
              </div>
            </>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={FileText}
              title={`Aucun devis ${viewMode === 'active' ? 'actif' : 'archivé'}`}
              description="Commencez par créer un nouveau devis pour vos clients."
              tone="indigo"
              action={
                viewMode === 'active' && hasPermission('quotes.create') ? (
                  <button onClick={handleOpenAdd} className="inline-flex items-center gap-2 bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 text-sm mt-4 active:scale-95 transition-transform">
                    <Plus size={16} /><span>Créer un devis</span>
                  </button>
                ) : null
              }
            />
          ) : (
            <>
              <div className="hidden md:block bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-visible">
                <div className="overflow-visible">
                  <table className="w-full">
                    <thead className="bg-slate-50/80 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700 [&>tr>th:first-child]:rounded-tl-xl [&>tr>th:last-child]:rounded-tr-xl">
                      <tr>
                        <th className="text-left px-6 py-4 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">N° Devis</th>
                        <th className="text-left px-6 py-4 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Client</th>
                        <th className="text-left px-6 py-4 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Objet</th>
                        <th className="text-left px-6 py-4 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Date</th>
                        <th className="text-left px-6 py-4 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Total TTC ({currency})</th>
                        <th className="text-left px-6 py-4 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Statut</th>
                        <th className="text-right px-2 py-4 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-12"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                      {filtered.map(q => (
                        <tr key={q.$id} className="group hover:bg-purple-50/50 dark:hover:bg-slate-700/30 transition-colors duration-200 last:[&>td:first-child]:rounded-bl-xl last:[&>td:last-child]:rounded-br-xl">
                          <td className="px-6 py-4">
                            <span className="inline-flex items-center gap-1 text-xs font-mono font-semibold text-purple-700 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/30 px-2 py-1 rounded w-fit">
                              {q.quoteNumber}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm font-medium text-slate-900 dark:text-white">{q.clientName || '-'}</td>
                          <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-300">{q.subject || '-'}</td>
                          <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-300">{formatDate(q.issueDate)}</td>
                          <td className="px-6 py-4 text-sm font-semibold text-slate-900 dark:text-white">{fm(q.total || 0)}</td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${statusColors[q.status] || 'bg-gray-100 text-gray-800'}`}>
                              {statusLabels[q.status] || q.status}
                            </span>
                          </td>
                          <td className="px-2 py-4 text-right w-12">
                            <div className="flex justify-end opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                              <ActionMenu>
                                {viewMode === 'active' ? (
                                  <>
                                    {hasPermission('quotes.send') && q.clientToken && (
                                      <ActionMenuItem onClick={() => handleCopyLink(q)} icon={copiedToken === q.clientToken ? CheckCircle2 : Copy} label={copiedToken === q.clientToken ? 'Copié !' : 'Copier le lien'} />
                                    )}
                                    {hasPermission('invoices.create') && q.status === 'Accepté' && !hasInvoiceForQuote(q.$id) && (
                                      <ActionMenuItem onClick={() => handleOpenChoiceModal(q)} icon={Send} label="Générer facture" />
                                    )}
                                    {hasPermission('quotes.edit') && (q.status === 'Brouillon' || q.status === 'Refusé' || q.status === 'Envoyé') && (
                                      <ActionMenuItem onClick={() => handleEditQuote(q)} icon={Edit2} label="Modifier" />
                                    )}
                                    <ActionMenuItem onClick={() => generatePDF(q)} icon={Download} label="Télécharger PDF" />
                                    {hasPermission('quotes.delete') && (
                                      <ActionMenuItem onClick={() => handleArchive(q.$id, q.quoteNumber)} icon={Archive} label="Archiver" danger />
                                    )}
                                  </>
                                ) : (
                                  <ActionMenuItem onClick={() => handleUnarchive(q.$id, q.quoteNumber)} icon={RotateCcw} label="Désarchiver" />
                                )}
                              </ActionMenu>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="md:hidden space-y-4">
                {filtered.map(q => (
                  <MobileCard key={q.$id}>
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <span className="inline-flex items-center gap-1 text-xs font-mono font-semibold text-purple-700 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/30 px-2 py-1 rounded mb-1 w-fit">
                           {q.quoteNumber}
                        </span>
                        <h3 className="font-semibold text-slate-900 dark:text-white">{q.clientName || 'Client inconnu'}</h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{q.subject || 'Sans objet'}</p>
                      </div>
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusColors[q.status]}`}>
                        {statusLabels[q.status]}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 py-3 border-t border-b border-slate-100 dark:border-slate-700 mb-3 text-center">
                      <div>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">Date</p>
                        <p className="text-sm font-bold text-slate-900 dark:text-white">{formatDate(q.issueDate)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">Total</p>
                        <p className="text-sm font-bold text-purple-600 dark:text-purple-400">{fm(q.total || 0)}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      {viewMode === 'active' ? (
                        <>
                          <button onClick={() => generatePDF(q)} className="flex flex-col items-center justify-center p-2 text-blue-600 bg-blue-50 dark:bg-blue-900/30 rounded-lg active:scale-95 transition-transform">
                            <Download size={18} /> <span className="text-[10px] mt-1 font-medium">PDF</span>
                          </button>
                          {hasPermission('quotes.edit') && (q.status === 'Brouillon' || q.status === 'Refusé' || q.status === 'Envoyé') && (
                            <button onClick={() => handleEditQuote(q)} className="flex flex-col items-center justify-center p-2 text-purple-600 bg-purple-50 dark:bg-purple-900/30 rounded-lg active:scale-95 transition-transform">
                              <Edit2 size={18} /> <span className="text-[10px] mt-1 font-medium">Modifier</span>
                            </button>
                          )}
                          {hasPermission('invoices.create') && q.status === 'Accepté' && !hasInvoiceForQuote(q.$id) && (
                            <button onClick={() => handleOpenChoiceModal(q)} className="flex flex-col items-center justify-center p-2 text-indigo-600 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg active:scale-95 transition-transform">
                              <Send size={18} /> <span className="text-[10px] mt-1 font-medium">Facture</span>
                            </button>
                          )}
                          {hasPermission('quotes.delete') && (
                            <button onClick={() => handleArchive(q.$id, q.quoteNumber)} className="flex flex-col items-center justify-center p-2 text-orange-600 bg-orange-50 dark:bg-orange-900/30 rounded-lg active:scale-95 transition-transform">
                              <Archive size={18} /> <span className="text-[10px] mt-1 font-medium">Archiver</span>
                            </button>
                          )}
                        </>
                      ) : (
                        <button onClick={() => handleUnarchive(q.$id, q.quoteNumber)} className="col-span-4 flex items-center justify-center gap-2 p-3 text-sm font-medium text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/30 rounded-lg active:scale-95 transition-transform">
                          <RotateCcw size={16} /> <span>Désarchiver</span>
                        </button>
                      )}
                    </div>
                  </MobileCard>
                ))}
              </div>
            </>
          )}
        </main>

        <QuoteModal
          isOpen={showModal}
          onClose={handleCloseModal}
          onSave={handleSaveModal}
          clients={clients}
          companySettings={companySettings}
          editingQuote={editingQuote}
          preselectedClientId={preselectedClientId}
          getNextQuoteNumber={getNextQuoteNumber}
          currentTeamId={currentTeamId}
          userPermissions={permissions}
        />

        <Modal
          open={showChoiceModal && !!selectedQuoteForInvoice}
          onClose={() => { setShowChoiceModal(false); setSelectedQuoteForInvoice(null); }}
          title="Générer une facture"
          icon={<Send className="text-purple-600" size={20} />}
          maxWidth="sm:max-w-md"
        >
          {selectedQuoteForInvoice && (
            <div className="space-y-4">
              <Card padding={false} className="bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800 p-3">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600 dark:text-slate-400">Devis</span>
                  <span className="font-semibold text-slate-900 dark:text-white">{selectedQuoteForInvoice.quoteNumber}</span>
                </div>
                <div className="flex justify-between text-sm mt-1">
                  <span className="text-slate-600 dark:text-slate-400">Client</span>
                  <span className="font-semibold text-slate-900 dark:text-white">{selectedQuoteForInvoice.clientName}</span>
                </div>
                <div className="flex justify-between text-sm mt-1">
                  <span className="text-slate-600 dark:text-slate-400">Montant</span>
                  <span className="font-bold text-purple-600 dark:text-purple-400">{fm(selectedQuoteForInvoice.total || 0)}</span>
                </div>
              </Card>

              <button onClick={handleChooseAdvance} className="w-full text-left p-4 border border-blue-200 dark:border-blue-800 rounded-xl hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all group">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/40 rounded-lg flex items-center justify-center flex-shrink-0">
                    <FileText size={20} className="text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-bold text-slate-900 dark:text-white text-sm">Facture d'acompte</h3>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">Demander un acompte avant de commencer.</p>
                    {(selectedQuoteForInvoice.deposit || 0) > 0 && (
                      <p className="text-xs text-blue-600 dark:text-blue-400 mt-2 font-medium">💡 Suggéré : {fm(selectedQuoteForInvoice.deposit || 0)}</p>
                    )}
                  </div>
                </div>
              </button>

              <button onClick={handleChooseFinal} disabled={generating} className="w-full text-left p-4 border border-purple-200 dark:border-purple-800 rounded-xl hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-all group disabled:opacity-50">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/40 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Receipt size={20} className="text-purple-600 dark:text-purple-400" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-bold text-slate-900 dark:text-white text-sm">{generating ? 'Génération...' : 'Facture finale'}</h3>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">Pour le montant total, travaux terminés.</p>
                  </div>
                </div>
              </button>
            </div>
          )}
        </Modal>

        <Modal
          open={showAdvanceModal && !!selectedQuoteForInvoice}
          onClose={() => { setShowAdvanceModal(false); setSelectedQuoteForInvoice(null); }}
          title="Facture d'acompte"
          icon={<FileText className="text-blue-600" size={20} />}
          maxWidth="sm:max-w-md"
          footer={
            <>
              <button onClick={() => setShowAdvanceModal(false)} className="flex-1 sm:flex-none px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600 active:scale-95 transition-all">
                Annuler
              </button>
              <button onClick={handleGenerateAdvanceInvoice} disabled={generating || !advanceForm.amount || parseFloat(advanceForm.amount) <= 0} className="flex-1 sm:flex-none px-4 py-2.5 text-sm font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2 active:scale-95 transition-all">
                {generating ? (<><span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span> ...</>) : (<><FileText size={14} /> Générer</>)}
              </button>
            </>
          }
        >
          {selectedQuoteForInvoice && (
            <div className="space-y-4">
              <Alert tone="info" icon={AlertCircle}>
                <strong>Rappel légal :</strong> Tout acompte encaissé doit faire l'objet d'une facture d'acompte distincte.
              </Alert>
              <FormField label={`Montant (${SYM})`} required>
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  max={(selectedQuoteForInvoice.total || 0) - 0.01}
                  value={advanceForm.amount}
                  onChange={e => setAdvanceForm({ ...advanceForm, amount: e.target.value })}
                  placeholder="0.00"
                  autoFocus
                />
                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1.5">
                  Total : {fm(selectedQuoteForInvoice.total || 0)} • Reste : {fm((selectedQuoteForInvoice.total || 0) - (parseFloat(advanceForm.amount) || 0))}
                </p>
              </FormField>
            </div>
          )}
        </Modal>
      </div>
    </Sidebar>
  );
}