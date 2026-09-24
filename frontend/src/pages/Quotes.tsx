import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { databases, DATABASE_ID } from '../appwrite';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { getFilePreviewUrl } from '../utils/storage';
import { verifyDocumentAccess, logAuditAction } from '../utils/security';
import {
  Plus, Search, FileText, ChevronLeft, Download, Filter, Edit2, Copy, 
  CheckCircle2, Receipt, X, Archive, RotateCcw, Hash, Send
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
  Brouillon: 'bg-gray-100 text-gray-800', 
  Envoyé: 'bg-blue-100 text-blue-800',
  Accepté: 'bg-green-100 text-green-800', 
  Refusé: 'bg-red-100 text-red-800',
  Facturé: 'bg-purple-100 text-purple-800',
  Archivé: 'bg-slate-100 text-slate-600'
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
      alert('Ce devis ne peut plus être modifié.'); 
      return; 
    }
    await loadCompanySettings();
    setEditingQuote(quote);
    setPreselectedClientId(null);
    setShowModal(true);
  };

  const handleCopyLink = async (quote: Quote) => {
    if (!quote.clientToken) { alert('Ce devis n\'a pas encore été envoyé au client.'); return; }
    if (quote.teamId && quote.teamId !== currentTeamId) {
      alert('⚠️ Accès refusé');
      return;
    }
    const link = `${window.location.origin}/v/${quote.clientToken}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopiedToken(quote.clientToken);
      if (user && user.$id && currentTeamId) {
        await logAuditAction(user.$id, currentTeamId, 'read', 'quote', quote.$id, { action: 'share_link' });
      }
      setTimeout(() => setCopiedToken(null), 2000);
    } catch { alert(`Lien :\n${link}`); }
  };

  const handleArchive = async (id: string, num: string) => {
    if (!confirm(`Archiver le devis ${num} ?`)) return;
    try {
      await verifyDocumentAccess('quotes', id, currentTeamId!);
      await databases.updateDocument(DATABASE_ID, 'quotes', id, { status: 'Archivé' });
      if (user && user.$id && currentTeamId) {
        await logAuditAction(user.$id, currentTeamId, 'update', 'quote', id, { action: 'archive' });
      }
      await loadData();
    } catch (error: any) { 
      alert(`Erreur : ${error.message}`); 
    }
  };

  const handleUnarchive = async (id: string, num: string) => {
    try {
      await verifyDocumentAccess('quotes', id, currentTeamId!);
      await databases.updateDocument(DATABASE_ID, 'quotes', id, { status: 'Brouillon' });
      if (user && user.$id && currentTeamId) {
        await logAuditAction(user.$id, currentTeamId, 'update', 'quote', id, { action: 'unarchive' });
      }
      await loadData();
      setViewMode('active');
    } catch (error: any) { 
      alert(`Erreur : ${error.message}`); 
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
    
    console.log("🔍 DEBUG Quotes handleChooseFinal - secureTeamId:", user?.secureTeamId);
    setGenerating(true);
    
    try {
      const quote = selectedQuoteForInvoice;
      const invoiceNumber = await getNextInvoiceNumber('FAC');
      const today = new Date().toISOString().split('T')[0];
      const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const vatRate = parseFloat(companySettings?.defaultTvaRate || '20');

      const payload = {
        invoiceNumber,
        quoteId: quote.$id,
        userId: user.$id,
        teamId: currentTeamId,
        type: 'standard',
        originalQuoteId: quote.$id,
        clientToken: Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15),
        status: 'draft',
        issueDate: today,
        dueDate: dueDate,
        subtotal: Math.round((quote.subtotal || 0) * 100) / 100,
        vatRate: Math.round(vatRate),
        vatAmount: Math.round((quote.tax || 0) * 100) / 100,
        total: Math.round((quote.total || 0) * 100) / 100,
        discount: quote.discount || 0,
        tax: Math.round((quote.tax || 0) * 100) / 100,
        deposit: 0,
        balance: Math.round((quote.total || 0) * 100) / 100,
        companyName: quote.companyName || '',
        companyLegalForm: quote.companyLegalForm || '',
        companyAddress: quote.companyAddress || '',
        companySiret: quote.companySiret || '',
        companyRcs: quote.companyRcs || '',
        companyTva: quote.companyTva || '',
        companyPhone: quote.companyPhone || '',
        companyEmail: quote.companyEmail || '',
        logoFileId: quote.logoFileId || '',
        clientName: quote.clientName || '',
        clientAddress: quote.clientAddress || '',
        clientBillingAddress: quote.clientBillingAddress || '',
        clientEmail: quote.clientEmail || '',
        clientPhone: quote.clientPhone || '',
        items: quote.items || '[]',
        paymentMethods: quote.paymentMethods || '',
        paymentConditions: quote.paymentConditions || '',
        executionDelay: quote.executionDelay || '',
        specialConditions: '',
        tradeType: quote.tradeType || '',
        insuranceName: quote.insuranceName || '',
        insuranceAddress: quote.insuranceAddress || '',
        insurancePolicy: quote.insurancePolicy || '',
        notes: `Facture finale générée depuis le devis ${quote.quoteNumber}`
      };

      let perms: string[] = [];
      if (user?.secureTeamId) {
        console.log("✅ Quotes: Utilisation de la sécurité maximale (secureTeamId)");
        perms = [
          Permission.read(Role.team(user.secureTeamId)),
          Permission.update(Role.team(user.secureTeamId)),
          Permission.delete(Role.team(user.secureTeamId))
        ];
      } else {
        console.warn("⚠️ Quotes: secureTeamId manquant, fallback Role.users()");
        perms = [
          Permission.read(Role.users()),
          Permission.update(Role.users()),
          Permission.delete(Role.users())
        ];
      }

      console.log("🚀 Quotes handleChooseFinal: Envoi avec permissions:", perms);

      await databases.createDocument(DATABASE_ID, 'invoices', AppwriteID.unique(), payload, perms);
      
      if (user.$id && currentTeamId) {
        await logAuditAction(user.$id, currentTeamId, 'create', 'invoice', '', { fromQuote: quote.$id });
      }

      await databases.updateDocument(DATABASE_ID, 'quotes', quote.$id, { status: 'Facturé' });

      setShowChoiceModal(false);
      setSelectedQuoteForInvoice(null);
      await loadData();
      alert(`✅ Facture finale ${invoiceNumber} créée avec succès !\nMontant : ${(quote.total || 0).toFixed(2)} €`);
      navigate('/invoices');
    } catch (e: any) {
      console.error('Erreur génération facture finale:', e);
      alert(`Erreur : ${e.message}`);
    } finally {
      setGenerating(false);
    }
  };

  const handleGenerateAdvanceInvoice = async () => {
    if (!selectedQuoteForInvoice || !currentTeamId || !user || !user.$id) return;
    const amount = parseFloat(advanceForm.amount);
    if (!amount || amount <= 0) {
      alert('Veuillez saisir un montant d\'acompte valide.');
      return;
    }

    console.log("🔍 DEBUG Quotes handleGenerateAdvanceInvoice - secureTeamId:", user?.secureTeamId);
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
        invoiceNumber,
        quoteId: quote.$id,
        userId: user.$id,
        teamId: currentTeamId,
        type: 'advance',
        originalQuoteId: quote.$id,
        advancePercent: ((amount / (quote.total || 0)) * 100).toFixed(2),
        clientToken: Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15),
        status: 'draft',
        issueDate: today,
        dueDate: dueDate,
        subtotal: advanceHT,
        vatRate: parseFloat(companySettings?.defaultTvaRate || '20'),
        vatAmount: advanceTVA,
        total: amount,
        discount: 0,
        tax: advanceTVA,
        deposit: 0,
        balance: amount,
        companyName: quote.companyName || '',
        companyLegalForm: quote.companyLegalForm || '',
        companyAddress: quote.companyAddress || '',
        companySiret: quote.companySiret || '',
        companyRcs: quote.companyRcs || '',
        companyTva: quote.companyTva || '',
        companyPhone: quote.companyPhone || '',
        companyEmail: quote.companyEmail || '',
        logoFileId: quote.logoFileId || '',
        clientName: quote.clientName || '',
        clientAddress: quote.clientAddress || '',
        clientBillingAddress: quote.clientBillingAddress || '',
        clientEmail: quote.clientEmail || '',
        clientPhone: quote.clientPhone || '',
        items: JSON.stringify([{
          id: `advance-${Date.now()}`,
          reference: 'ACOMPTE',
          description: `Acompte sur devis ${quote.quoteNumber}`,
          quantity: 1,
          unit: 'forfait',
          unitPrice: advanceHT,
          tvaRate: parseFloat(companySettings?.defaultTvaRate || '20'),
          total: advanceHT,
          discount: 0
        }]),
        paymentMethods: quote.paymentMethods || '',
        paymentConditions: quote.paymentConditions || '',
        executionDelay: quote.executionDelay || '',
        specialConditions: `Facture d'acompte - Référence devis : ${quote.quoteNumber}`,
        notes: `Acompte sur devis ${quote.quoteNumber}`
      };

      let perms: string[] = [];
      if (user?.secureTeamId) {
        console.log("✅ Quotes: Utilisation de la sécurité maximale (secureTeamId)");
        perms = [
          Permission.read(Role.team(user.secureTeamId)),
          Permission.update(Role.team(user.secureTeamId)),
          Permission.delete(Role.team(user.secureTeamId))
        ];
      } else {
        console.warn("⚠️ Quotes: secureTeamId manquant, fallback Role.users()");
        perms = [
          Permission.read(Role.users()),
          Permission.update(Role.users()),
          Permission.delete(Role.users())
        ];
      }

      console.log("🚀 Quotes handleGenerateAdvanceInvoice: Envoi avec permissions:", perms);

      await databases.createDocument(DATABASE_ID, 'invoices', AppwriteID.unique(), payload, perms);

      setShowAdvanceModal(false);
      setSelectedQuoteForInvoice(null);
      await loadData();
      alert(`✅ Facture d'acompte ${invoiceNumber} créée avec succès !\nMontant : ${amount.toFixed(2)} €`);
      navigate('/invoices');
    } catch (e: any) {
      console.error('Erreur génération acompte:', e);
      alert(`Erreur : ${e.message}`);
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

  // ✅ SOLUTION RADICALE : Utiliser 'any' pour contourner le typage strict de jsPDF
  const generatePDF = async (qd: Quote) => {
    const doc: any = new jsPDF({ unit: 'mm', format: 'a4' });
    const W = 210, M = 20;
    let items: QuoteItem[] = []; 
    try { items = JSON.parse(qd.items || '[]'); } catch(e) {}
    
    const pdfSubtotal = qd.subtotal || 0;
    const pdfDiscount = qd.discount || 0;
    const pdfTax = qd.tax || 0;
    const pdfTotal = qd.total || 0;
    const pdfDeposit = qd.deposit || 0;
    const pdfBalance = qd.balance || 0;
    const pdfDiscountAmount = pdfSubtotal * (pdfDiscount / 100);
    const pdfTaxableAmount = pdfSubtotal - pdfDiscountAmount;
    const pdfIsTvaApplicable = !(qd.companyTva || '').includes('non applicable');

    let logoB64: string | null = null;
    if (qd.logoFileId) {
      try {
        const u = getFilePreviewUrl('company_logos', qd.logoFileId);
        const b = await fetch(u).then(r => r.blob());
        logoB64 = await new Promise<string>((rs, rj) => { 
          const rd = new FileReader(); rd.onloadend = () => rs(rd.result as string); rd.onerror = rj; rd.readAsDataURL(b); 
        });
      } catch(e) { console.warn('Logo PDF fail', e); }
    }

    let Y = M;
    if (logoB64) {
      try { doc.addImage(logoB64, logoB64.includes('image/png') ? 'PNG' : 'JPEG', M, Y, 30, 15); } catch (e) {}
    }

    doc.setFontSize(14); doc.setFont(undefined, 'bold');
    doc.text(qd.companyName || '', M, Y + 22);
    doc.setFontSize(8); doc.setFont(undefined, 'normal');
    let infoY = Y + 27;
    if (qd.companyAddress) { doc.text(qd.companyAddress, M, infoY); infoY += 4; }
    if (qd.companyPhone) { doc.text(`Tél: ${qd.companyPhone}`, M, infoY); infoY += 4; }
    if (qd.companyEmail) { doc.text(`Email: ${qd.companyEmail}`, M, infoY); infoY += 4; }
    if (qd.companySiret) { doc.text(`SIRET: ${qd.companySiret}`, M, infoY); infoY += 4; }
    if (qd.companyTva && !qd.companyTva.includes('non')) { doc.text(`TVA: ${qd.companyTva}`, M, infoY); infoY += 4; }

    const rX = W - M;
    doc.setFontSize(16); doc.setFont(undefined, 'bold');
    doc.text(`DEVIS N° ${qd.quoteNumber}`, rX, Y + 5, { align: 'right' });
    doc.setFontSize(8); doc.setFont(undefined, 'normal');
    doc.text(`Date: ${qd.issueDate ? new Date(qd.issueDate).toLocaleDateString('fr-FR') : '-'}`, rX, Y + 10, { align: 'right' });
    if (qd.validityDate) doc.text(`Valable jusqu'au: ${new Date(qd.validityDate).toLocaleDateString('fr-FR')}`, rX, Y + 14, { align: 'right' });

    const clientBoxX = rX - 60;
    const clientBoxY = Y + 18;
    doc.setDrawColor(150); doc.setLineWidth(0.3);
    doc.rect(clientBoxX, clientBoxY, 60, 22);
    doc.setFontSize(8); doc.setFont(undefined, 'bold');
    doc.text('CLIENT', clientBoxX + 2, clientBoxY + 4);
    doc.setFont(undefined, 'normal'); doc.setFontSize(9);
    doc.text(qd.clientName || '', clientBoxX + 2, clientBoxY + 9);
    if (qd.clientAddress) doc.text(qd.clientAddress.substring(0, 50), clientBoxX + 2, clientBoxY + 13);
    if (qd.clientEmail) doc.text(qd.clientEmail, clientBoxX + 2, clientBoxY + 17);

    Y = Math.max(infoY, clientBoxY + 25) + 5;
    if (qd.subject) {
      doc.setFontSize(11); doc.setFont(undefined, 'bold');
      doc.text(`Objet: ${qd.subject}`, W / 2, Y, { align: 'center' });
      Y += 8;
    }

    const tableData = items.map(i => {
      const lineDiscount = i.discount || 0;
      const lineTotal = i.quantity * i.unitPrice * (1 - lineDiscount / 100);
      return [
        i.reference || '-', i.description, i.quantity.toFixed(2), i.unit,
        i.unitPrice.toFixed(2) + ' €', lineDiscount + '%', lineTotal.toFixed(2) + ' €', i.tvaRate + '%'
      ];
    });

    autoTable(doc, {
      startY: Y,
      head: [['Réf.', 'Désignation', 'Qté', 'Unité', 'Prix U HT', 'Remise', 'Total HT', 'TVA']],
      body: tableData, theme: 'grid', margin: { left: M, right: M },
      headStyles: { fillColor: [37, 99, 235], textColor: 255, fontSize: 8, fontStyle: 'bold' },
      styles: { fontSize: 8, cellPadding: 2, lineColor: [200, 200, 200], lineWidth: 0.2 },
      columnStyles: {
        0: { cellWidth: 15, fontStyle: 'normal' }, 1: { cellWidth: 60 },
        2: { cellWidth: 12, halign: 'center' }, 3: { cellWidth: 12, halign: 'center' },
        4: { cellWidth: 18, halign: 'right' }, 5: { cellWidth: 12, halign: 'right' },
        6: { cellWidth: 18, halign: 'right', fontStyle: 'bold' }, 7: { cellWidth: 12, halign: 'right' }
      }
    });

    let ty = doc.lastAutoTable.finalY + 8;
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

    totalLine('Total HT', `${pdfSubtotal.toFixed(2)} €`);
    if (pdfDiscount > 0) totalLine(`Remise globale ${pdfDiscount}%`, `- ${pdfDiscountAmount.toFixed(2)} €`, false, [220, 38, 38]);
    totalLine('Total HT après remise', `${pdfTaxableAmount.toFixed(2)} €`);
    totalLine('Total TVA', `${pdfTax.toFixed(2)} €`);
    doc.setFont(undefined, 'bold'); doc.setTextColor(0, 0, 0);
    doc.text('Total TTC', totalsX, ty);
    doc.text(`${pdfTotal.toFixed(2)} €`, W - M, ty, { align: 'right' });
    doc.setDrawColor(0); doc.setLineWidth(0.5);
    doc.line(totalsX, ty + 1.5, W - M, ty + 1.5);
    ty += 6;
    
    if (pdfDeposit > 0) {
      totalLine('Acompte', `- ${pdfDeposit.toFixed(2)} €`);
      doc.setTextColor(37, 99, 235); doc.setFont(undefined, 'bold');
      doc.text('NET À PAYER', totalsX, ty);
      doc.text(`${pdfBalance.toFixed(2)} €`, W - M, ty, { align: 'right' });
      ty += 6;
    }

    if (qd.paymentMethods || qd.paymentConditions || qd.executionDelay) {
      ty += 5; doc.setFontSize(10); doc.setFont(undefined, 'bold'); doc.setTextColor(0, 0, 0);
      doc.text('Conditions de règlement', M, ty);
      doc.setDrawColor(150); doc.setLineWidth(0.3); doc.line(M, ty + 1, W - M, ty + 1);
      ty += 6; doc.setFontSize(8); doc.setFont(undefined, 'normal');
      if (qd.paymentMethods) { doc.text(`Mode: ${qd.paymentMethods}`, M, ty); ty += 4; }
      if (qd.paymentConditions) { doc.text(`Conditions: ${qd.paymentConditions}`, M, ty); ty += 4; }
      if (qd.executionDelay) { doc.text(`Délai: ${qd.executionDelay}`, M, ty); ty += 4; }
      ty += 2; doc.setFont(undefined, 'italic'); doc.setTextColor(100, 100, 100);
      doc.text('Pénalités de retard : 3x le taux d\'intérêt légal (loi 2008-776).', M, ty);
      ty += 4; doc.text('Indemnité forfaitaire pour frais de recouvrement : 40€ (art D.441-5).', M, ty);
      ty += 4;
    }

    if (!pdfIsTvaApplicable && qd.companyTva) {
      doc.setFontSize(7); doc.setFont(undefined, 'italic'); doc.setTextColor(100, 100, 100);
      doc.text(qd.companyTva, M, 285);
    }

    doc.save(`Devis_${qd.quoteNumber}.pdf`);
  };

  const filtered = quotes.filter(q => {
    const searchStr = `${q.quoteNumber} ${q.clientName} ${q.subject || ''} ${q.status}`.toLowerCase();
    const matchSearch = search === '' || searchStr.includes(search.toLowerCase());
    const matchStatus = filterStatus === 'all' || q.status === filterStatus;
    const matchView = viewMode === 'active' ? q.status !== 'Archivé' : q.status === 'Archivé';
    return matchSearch && matchStatus && matchView;
  });

  const fm = (a: number) => `${a.toFixed(2)} €`;
  const formatDate = (dateStr?: string) => dateStr ? new Date(dateStr).toLocaleDateString('fr-FR') : '-';

  if (permLoading) return <div className="min-h-screen flex items-center justify-center bg-gray-50">Vérification des droits...</div>;
  if (!hasPermission('quotes.view')) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate('/dashboard')} className="text-slate-400 hover:text-slate-600"><ChevronLeft size={24} /></button>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2"><FileText className="text-green-600" />Devis</h1>
              <p className="text-sm text-slate-500">{filtered.length} devis {viewMode === 'active' ? 'actif(s)' : 'archivé(s)'}</p>
            </div>
          </div>
          {viewMode === 'active' && hasPermission('quotes.create') && (
            <button onClick={handleOpenAdd} className="bg-green-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-green-700 flex items-center gap-2">
              <Plus size={16} /> Nouveau devis
            </button>
          )}
        </div>
      </header>
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex border-b border-slate-200 mb-6">
          <button 
            onClick={() => setViewMode('active')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${viewMode === 'active' ? 'border-green-600 text-green-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            Actifs ({quotes.filter(q => q.status !== 'Archivé').length})
          </button>
          <button 
            onClick={() => setViewMode('archived')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${viewMode === 'archived' ? 'border-green-600 text-green-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            Archivés ({quotes.filter(q => q.status === 'Archivé').length})
          </button>
        </div>

        <div className="flex gap-4 mb-6">
          <div className="relative flex-1">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              placeholder="Rechercher (N°, client, objet...)" 
              value={search} 
              onChange={e => setSearch(e.target.value)} 
              className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none text-sm"
            />
          </div>
          {viewMode === 'active' && (
            <div className="relative">
              <Filter size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <select 
                value={filterStatus} 
                onChange={e => setFilterStatus(e.target.value)} 
                className="pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none text-sm bg-white"
              >
                <option value="all">Tous les statuts</option>
                {Object.entries(statusLabels).filter(([k]) => k !== 'Archivé').map(([k, l]) => (
                  <option key={k} value={k}>{l}</option>
                ))}
              </select>
            </div>
          )}
        </div>
        
        {loading ? <div className="text-center py-12 text-slate-500">Chargement...</div> : filtered.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <FileText size={48} className="mx-auto text-slate-300 mb-4" />
            <h3 className="font-semibold text-slate-700">Aucun devis {viewMode === 'active' ? 'actif' : 'archivé'}</h3>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    <th className="p-4 text-xs font-semibold text-slate-500 uppercase">N° Devis</th>
                    <th className="p-4 text-xs font-semibold text-slate-500 uppercase">Client</th>
                    <th className="p-4 text-xs font-semibold text-slate-500 uppercase">Objet</th>
                    <th className="p-4 text-xs font-semibold text-slate-500 uppercase">Date</th>
                    <th className="p-4 text-xs font-semibold text-slate-500 uppercase">Total TTC</th>
                    <th className="p-4 text-xs font-semibold text-slate-500 uppercase">Statut</th>
                    <th className="p-4 text-right text-xs font-semibold text-slate-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map(q => (
                    <tr key={q.$id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-4">
                        <span className="inline-flex items-center gap-1 text-xs font-mono font-semibold text-green-700 bg-green-50 px-2 py-1 rounded">
                          <Hash size={12} />
                          {q.quoteNumber}
                        </span>
                      </td>
                      <td className="p-4 text-sm font-medium text-slate-900">{q.clientName || '-'}</td>
                      <td className="p-4 text-sm text-slate-600">{q.subject || '-'}</td>
                      <td className="p-4 text-sm text-slate-600">{formatDate(q.issueDate)}</td>
                      <td className="p-4 text-sm font-semibold text-slate-900">{fm(q.total)}</td>
                      <td className="p-4">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${statusColors[q.status] || 'bg-gray-100 text-gray-800'}`}>
                          {statusLabels[q.status] || q.status}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex justify-end gap-1">
                          {viewMode === 'active' ? (
                            <>
                              {hasPermission('quotes.send') && (
                                <button onClick={() => handleCopyLink(q)} className={`p-2 rounded-lg transition-colors ${copiedToken === q.clientToken ? 'text-green-600 bg-green-50' : 'text-slate-400 hover:text-blue-600 hover:bg-blue-50'}`} title="Copier le lien">
                                  {copiedToken === q.clientToken ? <CheckCircle2 size={16} /> : <Copy size={16} />}
                                </button>
                              )}
                              
                              {hasPermission('invoices.create') && q.status === 'Accepté' && !hasInvoiceForQuote(q.$id) && (
                                <button 
                                  onClick={() => handleOpenChoiceModal(q)} 
                                  className="p-2 text-purple-500 hover:text-purple-700 hover:bg-purple-50 rounded-lg transition-colors" 
                                  title="Générer une facture (acompte ou finale)"
                                >
                                  <Send size={16} />
                                </button>
                              )}

                              {hasPermission('quotes.edit') && (q.status === 'Brouillon' || q.status === 'Refusé' || q.status === 'Envoyé') && (
                                <button onClick={() => handleEditQuote(q)} className="p-2 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded-lg" title="Modifier">
                                  <Edit2 size={16} />
                                </button>
                              )}
                              <button onClick={() => generatePDF(q)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg" title="Télécharger PDF">
                                <Download size={16} />
                              </button>
                              {hasPermission('quotes.delete') && (
                                <button onClick={() => handleArchive(q.$id, q.quoteNumber)} className="p-2 text-slate-400 hover:text-orange-600 hover:bg-orange-50 rounded-lg" title="Archiver">
                                  <Archive size={16} />
                                </button>
                              )}
                            </>
                          ) : (
                            <button onClick={() => handleUnarchive(q.$id, q.quoteNumber)} className="inline-flex items-center space-x-1 px-3 py-1.5 text-sm font-medium text-green-700 bg-green-50 rounded-lg hover:bg-green-100 transition-colors">
                              <RotateCcw size={14} /><span>Désarchiver</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
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

      {showChoiceModal && selectedQuoteForInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg border border-slate-100">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Send className="text-purple-600" size={22} />
                Générer une facture
              </h2>
              <button onClick={() => { setShowChoiceModal(false); setSelectedQuoteForInvoice(null); }} className="p-2 hover:bg-slate-100 rounded-lg">
                <X size={20} className="text-slate-500" />
              </button>
            </div>
            
            <div className="p-6">
              <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 mb-5">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-purple-700 font-semibold uppercase">Devis</p>
                    <p className="font-bold text-slate-900">{selectedQuoteForInvoice.quoteNumber}</p>
                  </div>
                  <div>
                    <p className="text-xs text-purple-700 font-semibold uppercase">Client</p>
                    <p className="font-semibold text-slate-900">{selectedQuoteForInvoice.clientName}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-xs text-purple-700 font-semibold uppercase">Montant total</p>
                    <p className="text-2xl font-bold text-purple-700">{fm(selectedQuoteForInvoice.total || 0)}</p>
                  </div>
                </div>
              </div>
              
              <p className="text-sm text-slate-600 mb-4 font-medium">
                Choisissez le type de facture à générer :
              </p>
              
              <div className="space-y-3">
                <button
                  onClick={handleChooseAdvance}
                  className="w-full text-left p-4 border-2 border-blue-200 rounded-xl hover:bg-blue-50 hover:border-blue-400 transition-all group"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-11 h-11 bg-blue-100 group-hover:bg-blue-200 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors">
                      <FileText size={20} className="text-blue-600" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-bold text-slate-900">Facture d'acompte</h3>
                      <p className="text-sm text-slate-600 mt-1">
                        Pour les chantiers longs. Demandez un acompte au client avant de commencer les travaux.
                      </p>
                      {(selectedQuoteForInvoice.deposit || 0) > 0 && (
                        <p className="text-xs text-blue-600 mt-2 font-medium">
                          💡 Acompte suggéré : {fm(selectedQuoteForInvoice.deposit || 0)}
                        </p>
                      )}
                    </div>
                  </div>
                </button>
                
                <button
                  onClick={handleChooseFinal}
                  disabled={generating}
                  className="w-full text-left p-4 border-2 border-purple-200 rounded-xl hover:bg-purple-50 hover:border-purple-400 transition-all group disabled:opacity-50"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-11 h-11 bg-purple-100 group-hover:bg-purple-200 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors">
                      <Receipt size={20} className="text-purple-600" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-bold text-slate-900">
                        {generating ? 'Génération en cours...' : 'Facture finale'}
                      </h3>
                      <p className="text-sm text-slate-600 mt-1">
                        Travaux terminés. Générez directement la facture pour le montant total.
                      </p>
                    </div>
                  </div>
                </button>
              </div>
            </div>
            
            <div className="flex justify-end px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl">
              <button 
                onClick={() => { setShowChoiceModal(false); setSelectedQuoteForInvoice(null); }} 
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {showAdvanceModal && selectedQuoteForInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-100">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <FileText className="text-blue-600" size={22} />
                Facture d'acompte
              </h2>
              <button onClick={() => { setShowAdvanceModal(false); setSelectedQuoteForInvoice(null); }} className="p-2 hover:bg-slate-100 rounded-lg">
                <X size={20} className="text-slate-500" />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                <p className="text-sm text-blue-900">
                  <strong>Rappel légal :</strong> Selon l'article 289 nonies du CGI, tout acompte encaissé doit faire l'objet d'une facture d'acompte distincte.
                </p>
              </div>
              
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Montant de l'acompte (€) *
                </label>
                <input 
                  type="number" 
                  min="0.01"
                  step="0.01"
                  max={(selectedQuoteForInvoice.total || 0) - 0.01}
                  value={advanceForm.amount} 
                  onChange={e => setAdvanceForm({ ...advanceForm, amount: e.target.value })} 
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none text-lg font-semibold"
                  placeholder="0.00"
                  autoFocus
                />
                <p className="text-xs text-slate-500 mt-2">
                  Total du devis : {fm(selectedQuoteForInvoice.total || 0)} • 
                  Reste après acompte : {fm((selectedQuoteForInvoice.total || 0) - (parseFloat(advanceForm.amount) || 0))}
                </p>
              </div>
            </div>
            
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl">
              <button 
                onClick={() => setShowAdvanceModal(false)} 
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                Annuler
              </button>
              <button 
                onClick={handleGenerateAdvanceInvoice} 
                disabled={generating || !advanceForm.amount || parseFloat(advanceForm.amount) <= 0}
                className="px-5 py-2.5 text-sm font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {generating ? (
                  <><span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span> Génération...</>
                ) : (
                  <><FileText size={16} /> Générer l'acompte</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}