import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { databases, DATABASE_ID } from '../appwrite';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import {
  ChevronLeft, Download, Search, FileText, Calendar,
  DollarSign, Eye, Archive, RotateCcw
} from 'lucide-react';
import { Query, Permission, Role } from 'appwrite';

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
  $createdAt: string;
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
  const [currentTeamId, setCurrentTeamId] = useState<string | null>(null);

  useEffect(() => {
    if (!permLoading && !hasPermission('invoices.view')) {
      navigate('/dashboard');
    }
  }, [permLoading, hasPermission, navigate]);

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    
    // ✅ DEBUG : Vérifier que secureTeamId est disponible
    console.log("🔍 DEBUG Receipts - secureTeamId:", user?.secureTeamId);
    
    loadReceipts();
  }, [user, viewMode]);

  const loadReceipts = async () => {
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

  const handleDownload = (receipt: Receipt) => {
    if (!receipt.pdfBase64) {
      alert('Le PDF de ce reçu n\'est pas disponible.');
      return;
    }
    
    // ✅ VÉRIFICATION DE SÉCURITÉ : Le reçu appartient à l'équipe
    if (receipt.teamId !== currentTeamId) {
      alert('⚠️ Accès refusé : Ce reçu n\'appartient pas à votre équipe.');
      return;
    }
    
    try {
      const base64Data = receipt.pdfBase64.includes('base64,') 
        ? receipt.pdfBase64.split('base64,')[1] 
        : receipt.pdfBase64;
        
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
      link.download = `Recu_${receipt.receiptNumber}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Erreur téléchargement:', e);
      alert('Erreur lors du téléchargement du PDF.');
    }
  };

  const handleArchive = async (receipt: Receipt) => {
    // ✅ VÉRIFICATION DE SÉCURITÉ
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
    // ✅ VÉRIFICATION DE SÉCURITÉ
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
    const searchStr = `${r.receiptNumber} ${r.invoiceNumber} ${r.clientName} ${r.paymentMethod}`.toLowerCase();
    const matchSearch = search === '' || searchStr.includes(search.toLowerCase());
    const matchView = viewMode === 'active' ? r.status !== 'archived' : r.status === 'archived';
    return matchSearch && matchView;
  });

  const totalAmount = filtered.reduce((sum, r) => sum + parseFloat(r.amount || '0'), 0);
  const fm = (a: number) => `${a.toFixed(2)} €`;
  const formatDate = (d: string) => {
    try { return new Date(d).toLocaleDateString('fr-FR'); } catch { return d; }
  };

  if (permLoading) return <div className="min-h-screen flex items-center justify-center bg-gray-50">Vérification des droits...</div>;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate('/dashboard')} className="text-slate-400 hover:text-slate-600">
              <ChevronLeft size={24} />
            </button>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <FileText className="text-teal-600" />
                Reçus de Paiement
              </h1>
              <p className="text-sm text-slate-500">{filtered.length} reçu(s) {viewMode === 'active' ? 'actif(s)' : 'archivé(s)'}</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex border-b border-slate-200 mb-6">
          <button onClick={() => setViewMode('active')} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${viewMode === 'active' ? 'border-teal-600 text-teal-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            Actifs ({receipts.filter(r => r.status !== 'archived').length})
          </button>
          <button onClick={() => setViewMode('archived')} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${viewMode === 'archived' ? 'border-teal-600 text-teal-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            Archivés ({receipts.filter(r => r.status === 'archived').length})
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow p-4 border-l-4 border-teal-500">
            <p className="text-xs text-slate-500 uppercase font-semibold">Total des reçus affichés</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{fm(totalAmount)}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4 border-l-4 border-blue-500">
            <p className="text-xs text-slate-500 uppercase font-semibold">Nombre de reçus</p>
            <p className="text-2xl font-bold text-blue-600 mt-1">{filtered.length}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4 border-l-4 border-purple-500">
            <p className="text-xs text-slate-500 uppercase font-semibold">Montant moyen</p>
            <p className="text-2xl font-bold text-purple-600 mt-1">
              {filtered.length > 0 ? fm(totalAmount / filtered.length) : '0,00 €'}
            </p>
          </div>
        </div>

        <div className="flex gap-4 mb-6">
          <div className="relative flex-1">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Rechercher (n° reçu, facture, client...)"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none text-sm"
            />
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12 text-slate-500">Chargement...</div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <FileText size={48} className="mx-auto text-slate-300 mb-4" />
            <h3 className="text-lg font-semibold text-slate-700 mb-2">Aucun reçu {viewMode === 'active' ? 'actif' : 'archivé'}</h3>
            <p className="text-slate-500 text-sm">
              {viewMode === 'active' 
                ? "Les reçus de paiement seront automatiquement générés à chaque paiement enregistré."
                : "Aucun reçu n'a été archivé."}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase">N° Reçu</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Facture</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Client</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Date paiement</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Moyen</th>
                    <th className="text-right px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Montant</th>
                    <th className="text-right px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map(r => (
                    <tr key={r.$id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-1 text-xs font-mono font-semibold text-teal-700 bg-teal-50 px-2 py-1 rounded">
                          {r.receiptNumber}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm font-medium text-purple-700">{r.invoiceNumber}</td>
                      <td className="px-6 py-4 text-sm text-slate-900">{r.clientName || '-'}</td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        <div className="flex items-center gap-2">
                          <Calendar size={14} className="text-slate-400" />
                          {formatDate(r.paymentDate)}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">{r.paymentMethod || '-'}</td>
                      <td className="px-6 py-4 text-right">
                        <span className="text-sm font-bold text-teal-700">{fm(parseFloat(r.amount || '0'))}</span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() => setPreviewReceipt(r)}
                            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                            title="Aperçu"
                          >
                            <Eye size={16} />
                          </button>
                          <button
                            onClick={() => handleDownload(r)}
                            className="p-2 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg"
                            title="Télécharger PDF"
                          >
                            <Download size={16} />
                          </button>
                          {viewMode === 'active' ? (
                            <button
                              onClick={() => handleArchive(r)}
                              className="p-2 text-slate-400 hover:text-orange-600 hover:bg-orange-50 rounded-lg"
                              title="Archiver"
                            >
                              <Archive size={16} />
                            </button>
                          ) : (
                            <button
                              onClick={() => handleUnarchive(r)}
                              className="p-2 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded-lg"
                              title="Désarchiver"
                            >
                              <RotateCcw size={16} />
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

      {previewReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0">
              <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <FileText className="text-teal-600" size={22} />
                Aperçu - {previewReceipt.receiptNumber}
              </h2>
              <div className="flex gap-2">
                <button
                  onClick={() => handleDownload(previewReceipt)}
                  className="px-4 py-2 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 flex items-center gap-2"
                >
                  <Download size={16} /> Télécharger
                </button>
                <button
                  onClick={() => setPreviewReceipt(null)}
                  className="p-2 hover:bg-slate-100 rounded-lg"
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="flex-1 p-4 overflow-hidden">
              {previewReceipt.pdfBase64 ? (
                <iframe
                  src={previewReceipt.pdfBase64}
                  className="w-full h-full border rounded-lg"
                  title="Aperçu du reçu"
                />
              ) : (
                <div className="text-center py-12 text-slate-500">
                  PDF non disponible pour ce reçu.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}