import Sidebar from '../components/Sidebar';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { databases, DATABASE_ID } from '../appwrite';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import {
  Download, Search, FileText, Calendar,
  Eye, Archive, RotateCcw, Receipt as ReceiptIcon, X,
  TrendingUp, TrendingDown
} from 'lucide-react';
import { Query } from 'appwrite';
import { jsPDF } from 'jspdf';

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

export default function Receipts() {
  const { user } = useAuth();
  const { hasPermission, loading: permLoading } = usePermissions();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'active' | 'archived'>('active');
  const [previewReceipt, setPreviewReceipt] = useState<Receipt | null>(null);
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string>('');
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [currentTeamId, setCurrentTeamId] = useState<string | null>(null);

  // ✅ DÉTECTION ROBUSTE des reçus de décaissement (avoirs)
  const isDebitReceipt = (r: Receipt): boolean => {
    if (r.type === 'debit') return true;
    if ((r.receiptNumber || '').toUpperCase().startsWith('DEC')) return true;
    if ((r.paymentMethod || '').trim().toLowerCase() === 'avoir') return true;
    return false;
  };

  useEffect(() => {
    if (!permLoading && !hasPermission('invoices.view')) {
      navigate('/dashboard');
    }
  }, [permLoading, hasPermission, navigate]);

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    loadReceipts();
  }, [user, viewMode]);

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
    } catch (error) {
      console.error('Erreur chargement reçus:', error);
    } finally {
      setLoading(false);
    }
  };

  const regenerateReceiptPDF = async (receipt: Receipt): Promise<string> => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const W = 210, M = 20;
    const isDebit = isDebitReceipt(receipt);
    const amount = parseFloat(receipt.amount || '0');
    const paymentDate = receipt.paymentDate || new Date().toISOString().split('T')[0];
    const paymentMethod = receipt.paymentMethod || 'Non spécifié';
    const paymentRef = receipt.paymentReference || '';

    let Y = M;
    let logoB64: string | null = null;

    if (logoB64) { 
      try { doc.addImage(logoB64, logoB64.includes('image/png') ? 'PNG' : 'JPEG', M, Y, 30, 15); } catch (e) {} 
    }

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
      doc.text(`- ${amount.toFixed(2)} €`, M, Y);
    } else {
      doc.setTextColor(34, 197, 94);
      doc.text(`+ ${amount.toFixed(2)} €`, M, Y);
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
    doc.text(`D'un montant total de ${receipt.invoiceTotal || receipt.amount} € TTC`, M, Y);
    
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
      alert('Erreur lors de la génération du PDF');
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
    } catch (e) {
      console.error('Erreur téléchargement:', e);
      alert('Erreur lors du téléchargement du PDF.');
    }
  };

  const handleArchive = async (receipt: Receipt) => {
    if (receipt.teamId !== currentTeamId) {
      alert('⚠️ Accès refusé : Ce reçu n\'appartient pas à votre équipe.');
      return;
    }
    if (!confirm(`Archiver le reçu ${receipt.receiptNumber} ?\nIl sera masqué de la liste principale mais conservé pour la comptabilité.`)) return;
    try {
      await databases.updateDocument(DATABASE_ID, 'receipts', receipt.$id, { status: 'archived' });
      setReceipts(receipts.map(r => r.$id === receipt.$id ? { ...r, status: 'archived' } : r));
    } catch (e: any) {
      alert(`Erreur : ${e.message}`);
    }
  };

  const handleUnarchive = async (receipt: Receipt) => {
    if (receipt.teamId !== currentTeamId) {
      alert('⚠️ Accès refusé : Ce reçu n\'appartient pas à votre équipe.');
      return;
    }
    try {
      await databases.updateDocument(DATABASE_ID, 'receipts', receipt.$id, { status: 'active' });
      setReceipts(receipts.map(r => r.$id === receipt.$id ? { ...r, status: 'active' } : r));
      setViewMode('active');
    } catch (e: any) {
      alert(`Erreur : ${e.message}`);
    }
  };

  const filtered = receipts.filter(r => {
    const searchStr = `${r.receiptNumber} ${r.invoiceNumber} ${r.clientName} ${r.paymentMethod} ${r.originalInvoiceNumber || ''}`.toLowerCase();
    const matchSearch = search === '' || searchStr.includes(search.toLowerCase());
    const matchView = viewMode === 'active' ? r.status !== 'archived' : r.status === 'archived';
    return matchSearch && matchView;
  });

  // ✅ CALCULS FILTRÉS (sur la liste affichée)
  const paymentReceipts = filtered.filter(r => !isDebitReceipt(r));
  const debitReceipts = filtered.filter(r => isDebitReceipt(r));
  const totalInflows = paymentReceipts.reduce((sum, r) => sum + parseFloat(r.amount || '0'), 0);
  const totalOutflows = debitReceipts.reduce((sum, r) => sum + parseFloat(r.amount || '0'), 0);
  const netBalance = totalInflows - totalOutflows;

  // ✅ CALCULS GLOBAUX (indépendants du filtre, comme dans Invoices)
  const allPaymentReceipts = receipts.filter(r => !isDebitReceipt(r) && r.status !== 'archived');
  const allDebitReceipts = receipts.filter(r => isDebitReceipt(r) && r.status !== 'archived');
  const globalInflows = allPaymentReceipts.reduce((sum, r) => sum + parseFloat(r.amount || '0'), 0);
  const globalOutflows = allDebitReceipts.reduce((sum, r) => sum + parseFloat(r.amount || '0'), 0);
  const globalNet = Math.max(0, globalInflows - globalOutflows);

  const fm = (a: number) => `${a.toFixed(2)} €`;
  const formatDate = (d: string) => {
    try { return new Date(d).toLocaleDateString('fr-FR'); } catch { return d; }
  };

  if (permLoading) return <Sidebar><div className="flex items-center justify-center h-full w-full"><div className="text-slate-500 dark:text-slate-400 text-lg animate-pulse">Vérification des droits...</div></div></Sidebar>;

  return (
    <Sidebar>
      <div className="min-h-full bg-slate-50 dark:bg-slate-900">
        <header className="bg-white dark:bg-slate-800 shadow-sm border-b border-slate-200 dark:border-slate-700 sticky top-0 z-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-3">
                <div>
                  <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <ReceiptIcon size={24} className="text-purple-600" />
                    Reçus de Paiement
                  </h1>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {filtered.length} reçu(s) {viewMode === 'active' ? 'actif(s)' : 'archivé(s)'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {/* ✅ KPIs GLOBAUX (libellés alignés avec Invoices) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-4">
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-4 border-l-4 border-l-emerald-500">
              <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-semibold flex items-center gap-1">
                <TrendingUp size={12} /> Encaissé
              </p>
              <p className="text-lg sm:text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">+ {fm(globalInflows)}</p>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">{allPaymentReceipts.length} reçu(s) paiement</p>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-4 border-l-4 border-l-red-500">
              <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-semibold flex items-center gap-1">
                <TrendingDown size={12} /> Décaissé
              </p>
              <p className="text-lg sm:text-xl font-bold text-red-600 dark:text-red-400 mt-1">- {fm(globalOutflows)}</p>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">{allDebitReceipts.length} reçu(s) avoir</p>
            </div>
            <div className={`bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-4 border-l-4 ${globalNet >= 0 ? 'border-l-green-500' : 'border-l-orange-500'}`}>
              <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-semibold">CA Net</p>
              <p className={`text-lg sm:text-xl font-bold mt-1 ${globalNet >= 0 ? 'text-green-600 dark:text-green-400' : 'text-orange-600 dark:text-orange-400'}`}>
                {fm(globalNet)}
              </p>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">Encaissé − Décaissé</p>
            </div>
          </div>

          {/* ✅ KPIs FILTRÉS (sur la liste affichée) */}
          <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 mb-6 border border-slate-200 dark:border-slate-700">
            <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-semibold mb-2">Sur la liste affichée</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase">Entrants</p>
                <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">+ {fm(totalInflows)}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase">Sortants</p>
                <p className="text-sm font-bold text-red-600 dark:text-red-400">- {fm(totalOutflows)}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase">Net affiché</p>
                <p className={`text-sm font-bold ${netBalance >= 0 ? 'text-slate-900 dark:text-white' : 'text-orange-600 dark:text-orange-400'}`}>
                  {netBalance >= 0 ? '' : '- '}{fm(Math.abs(netBalance))}
                </p>
              </div>
            </div>
          </div>

          {/* ✅ Onglets Actifs/Archivés */}
          <div className="flex border-b border-slate-200 dark:border-slate-700 mb-6">
            <button onClick={() => setViewMode('active')} className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${viewMode === 'active' ? 'border-purple-600 text-purple-600 dark:text-purple-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}>
              Actifs ({receipts.filter(r => r.status !== 'archived').length})
            </button>
            <button onClick={() => setViewMode('archived')} className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${viewMode === 'archived' ? 'border-purple-600 text-purple-600 dark:text-purple-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}>
              Archivés ({receipts.filter(r => r.status === 'archived').length})
            </button>
          </div>

          {/* ✅ Barre de recherche */}
          <div className="flex gap-3 mb-6">
            <div className="relative flex-1">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Rechercher (n° reçu, facture, client...)"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white rounded-lg focus:ring-2 focus:ring-purple-500 outline-none text-sm transition-shadow"
              />
            </div>
          </div>

          {loading ? (
            <div className="text-center py-12 text-slate-500 dark:text-slate-400 animate-pulse">Chargement...</div>
          ) : filtered.length === 0 ? (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-12 text-center shadow-sm">
              <ReceiptIcon size={48} className="mx-auto text-slate-300 dark:text-slate-600 mb-4" />
              <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-2">
                Aucun reçu {viewMode === 'active' ? 'actif' : 'archivé'}
              </h3>
              <p className="text-slate-500 dark:text-slate-400 text-sm">
                {viewMode === 'active' 
                  ? "Les reçus seront générés automatiquement à chaque paiement ou avoir enregistré."
                  : "Aucun reçu n'a été archivé."}
              </p>
            </div>
          ) : (
            <>
              {/* ✅ Tableau Desktop */}
              <div className="hidden md:block bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700">
                      <tr>
                        <th className="text-left px-6 py-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">N° Reçu</th>
                        <th className="text-left px-6 py-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Type</th>
                        <th className="text-left px-6 py-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Facture</th>
                        <th className="text-left px-6 py-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Client</th>
                        <th className="text-left px-6 py-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Date</th>
                        <th className="text-left px-6 py-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Moyen</th>
                        <th className="text-right px-6 py-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Montant</th>
                        <th className="text-right px-6 py-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                      {filtered.map(r => {
                        const isDebit = isDebitReceipt(r);
                        const amount = parseFloat(r.amount || '0');
                        return (
                          <tr key={r.$id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                            <td className="px-6 py-4">
                              <span className="inline-flex items-center gap-1 text-xs font-mono font-semibold text-purple-700 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/30 px-2 py-1 rounded">
                                {r.receiptNumber}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
                                isDebit
                                  ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                                  : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300'
                              }`}>
                                {isDebit ? <TrendingDown size={12} /> : <TrendingUp size={12} />}
                                {isDebit ? 'Décaissement' : 'Encaissement'}
                              </span>
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
                            <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-300">{r.paymentMethod || '-'}</td>
                            <td className="px-6 py-4 text-right">
                              <span className={`text-sm font-bold ${isDebit ? 'text-red-700 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400'}`}>
                                {isDebit ? '- ' : '+ '}{fm(amount)}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <div className="flex justify-end gap-1">
                                <button onClick={() => handlePreview(r)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors" title="Aperçu">
                                  <Eye size={16} />
                                </button>
                                <button onClick={() => handleDownload(r)} className="p-2 text-slate-400 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/30 rounded-lg transition-colors" title="Télécharger PDF">
                                  <Download size={16} />
                                </button>
                                {viewMode === 'active' ? (
                                  <button onClick={() => handleArchive(r)} className="p-2 text-slate-400 hover:text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/30 rounded-lg transition-colors" title="Archiver">
                                    <Archive size={16} />
                                  </button>
                                ) : (
                                  <button onClick={() => handleUnarchive(r)} className="p-2 text-slate-400 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30 rounded-lg transition-colors" title="Désarchiver">
                                    <RotateCcw size={16} />
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
              </div>

              {/* ✅ Version mobile */}
              <div className="md:hidden space-y-3">
                {filtered.map(r => {
                  const isDebit = isDebitReceipt(r);
                  const amount = parseFloat(r.amount || '0');
                  return (
                    <div key={r.$id} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 shadow-sm">
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="inline-flex items-center gap-1 text-xs font-mono font-semibold text-purple-700 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/30 px-2 py-1 rounded">
                              {r.receiptNumber}
                            </span>
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium ${
                              isDebit
                                ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                                : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300'
                            }`}>
                              {isDebit ? <TrendingDown size={10} /> : <TrendingUp size={10} />}
                              {isDebit ? 'Sortie' : 'Entrée'}
                            </span>
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
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </main>

        {/* ✅ Modal aperçu */}
        {previewReceipt && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4 animate-fadeIn">
            <div className="bg-white dark:bg-slate-800 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-4xl h-[90vh] sm:h-auto flex flex-col animate-slideUp">
              <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
                <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <ReceiptIcon className="text-purple-600" size={22} />
                  Aperçu - {previewReceipt.receiptNumber}
                  <span className={`ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
                    isDebitReceipt(previewReceipt)
                      ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                      : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300'
                  }`}>
                    {isDebitReceipt(previewReceipt) ? <TrendingDown size={12} /> : <TrendingUp size={12} />}
                    {isDebitReceipt(previewReceipt) ? 'Décaissement' : 'Encaissement'}
                  </span>
                </h2>
                <div className="flex gap-2">
                  <button 
                    onClick={() => handleDownload(previewReceipt)} 
                    disabled={generatingPdf}
                    className="hidden sm:flex px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 items-center gap-2 active:scale-95 transition-transform disabled:opacity-50"
                  >
                    <Download size={16} /> {generatingPdf ? 'Génération...' : 'Télécharger'}
                  </button>
                  <button onClick={() => { setPreviewReceipt(null); setPreviewPdfUrl(''); }} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors">
                    <X size={20} className="text-slate-500 dark:text-slate-400" />
                  </button>
                </div>
              </div>
              <div className="flex-1 p-2 sm:p-4 overflow-hidden bg-slate-100 dark:bg-slate-900">
                {generatingPdf ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center">
                      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
                      <p className="text-slate-600 dark:text-slate-400">Génération du PDF...</p>
                    </div>
                  </div>
                ) : previewPdfUrl ? (
                  <iframe src={previewPdfUrl} className="w-full h-full border-0 rounded-lg bg-white" title="Aperçu du reçu" />
                ) : (
                  <div className="text-center py-12 text-slate-500 dark:text-slate-400">PDF non disponible pour ce reçu.</div>
                )}
              </div>
              <div className="sm:hidden p-4 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-b-2xl">
                <button 
                  onClick={() => handleDownload(previewReceipt)} 
                  disabled={generatingPdf}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium text-white bg-purple-600 rounded-xl hover:bg-purple-700 active:scale-95 transition-transform disabled:opacity-50"
                >
                  <Download size={16} /> {generatingPdf ? 'Génération...' : 'Télécharger le PDF'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Sidebar>
  );
}