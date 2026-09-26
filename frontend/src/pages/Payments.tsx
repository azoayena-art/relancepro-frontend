import Sidebar from '../components/Sidebar';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { databases, DATABASE_ID } from '../appwrite';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import {
  DollarSign, Calendar, Search, Filter, Download,
  TrendingUp, CreditCard, Receipt, FileText, Eye, TrendingDown, FileMinus
} from 'lucide-react';
import { Query } from 'appwrite';

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
}

const methodLabels: Record<string, string> = {
  'Virement bancaire': '🏦 Virement',
  'Chèque': '📝 Chèque',
  'Espèces': '💵 Espèces',
  'Carte bancaire': '💳 Carte',
  'Prélèvement SEPA': '🔄 SEPA',
  'Avoir': '📉 Avoir',
  'Autre': '📦 Autre'
};

const methodColors: Record<string, string> = {
  'Virement bancaire': 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  'Chèque': 'bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  'Espèces': 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  'Carte bancaire': 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
  'Prélèvement SEPA': 'bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  'Avoir': 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  'Autre': 'bg-slate-50 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
};

export default function Payments() {
  const { user } = useAuth();
  const { hasPermission, loading: permLoading } = usePermissions();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [payments, setPayments] = useState<ParsedPayment[]>([]);
  const [search, setSearch] = useState('');
  const [filterMethod, setFilterMethod] = useState('all');
  const [filterPeriod, setFilterPeriod] = useState('all');
  const [activeTab, setActiveTab] = useState<'credit' | 'debit'>('credit');

  useEffect(() => {
    if (!permLoading && !hasPermission('invoices.view')) {
      navigate('/dashboard');
    }
  }, [permLoading, hasPermission, navigate]);

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    loadPayments();
  }, [user]);

  const loadPayments = async () => {
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
        setLoading(false); 
        return; 
      }

      const invoicesRes = await databases.listDocuments(
        DATABASE_ID, 'invoices',
        [Query.equal('teamId', teamId), Query.limit(2000)]
      );

      const allInvoices = invoicesRes.documents as unknown as Invoice[];
      const allPayments: ParsedPayment[] = [];

      allInvoices.forEach(invoice => {
        // ✅ CAS 1 : FACTURE D'AVOIR → Décaissement
        if (invoice.type === 'credit' && invoice.status !== 'cancelled') {
          const amountNum = Number(invoice.total);
          if (!isNaN(amountNum) && amountNum > 0) {
            const reasonLine = (invoice.notes || '').split('\n').find(l => l.startsWith('MOTIF AVOIR : '));
            const reason = reasonLine ? reasonLine.replace('MOTIF AVOIR : ', '') : '';
            
            const originalInvoice = allInvoices.find(inv => inv.$id === invoice.originalInvoiceId);
            const originalInvoiceNumber = originalInvoice?.invoiceNumber || '';
            
            allPayments.push({
              id: `credit-${invoice.$id}`,
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
              originalInvoiceNumber
            });
          }
          return;
        }

        // ✅ CAS 2 : FACTURES NORMALES → Encaissements
        let parsedPayments: Payment[] = [];
        
        if (invoice.payments) {
          try {
            if (typeof invoice.payments === 'string') {
              const trimmed = invoice.payments.trim();
              if (trimmed && trimmed !== 'null' && trimmed !== '[]' && trimmed !== '""') {
                parsedPayments = JSON.parse(trimmed);
              }
            } else if (Array.isArray(invoice.payments)) {
              parsedPayments = invoice.payments;
            } else if (typeof invoice.payments === 'object') {
              parsedPayments = [invoice.payments as unknown as Payment];
            }
          } catch (e) {
            console.warn(`⚠️ Erreur parsing JSON pour la facture ${invoice.invoiceNumber}:`, e);
            parsedPayments = [];
          }
        }

        if (Array.isArray(parsedPayments) && parsedPayments.length > 0) {
          parsedPayments.forEach(payment => {
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
                flowType: 'credit'
              });
            }
          });
        }
      });

      allPayments.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setPayments(allPayments);
      
    } catch (error) {
      console.error('❌ Erreur critique chargement paiements:', error);
    } finally {
      setLoading(false);
    }
  };

  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  // ✅ SÉPARATION GLOBALE DES FLUX (tous les paiements, indépendamment de l'onglet)
  const creditPayments = payments.filter(p => p.flowType === 'credit');
  const debitPayments = payments.filter(p => p.flowType === 'debit');

  const globalInflows = creditPayments.reduce((sum, p) => sum + p.amount, 0);
  const globalOutflows = debitPayments.reduce((sum, p) => sum + p.amount, 0);
  const globalNet = Math.max(0, globalInflows - globalOutflows);

  // KPIs de l'onglet actif
  const activeList = activeTab === 'credit' ? creditPayments : debitPayments;
  const thisMonthAmount = activeList.filter(p => {
    const d = new Date(p.date);
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
  }).reduce((sum, p) => sum + p.amount, 0);
  
  const thisYearAmount = activeList.filter(p => {
    const d = new Date(p.date);
    return d.getFullYear() === currentYear;
  }).reduce((sum, p) => sum + p.amount, 0);

  // ✅ FILTRAGE appliqué à l'onglet actif
  const filteredPayments = activeList.filter(p => {
    const searchStr = `${p.invoiceNumber} ${p.clientName} ${p.reference || ''} ${p.method} ${p.notes || ''} ${p.originalInvoiceNumber || ''}`.toLowerCase();
    const matchSearch = search === '' || searchStr.includes(search.toLowerCase());
    const matchMethod = filterMethod === 'all' || p.method === filterMethod;
    
    let matchPeriod = true;
    if (filterPeriod !== 'all') {
      const d = new Date(p.date);
      if (filterPeriod === 'month') matchPeriod = d.getMonth() === currentMonth && d.getFullYear() === currentYear;
      else if (filterPeriod === 'quarter') {
        const cq = Math.floor(currentMonth / 3);
        matchPeriod = Math.floor(d.getMonth() / 3) === cq && d.getFullYear() === currentYear;
      }
      else if (filterPeriod === 'year') matchPeriod = d.getFullYear() === currentYear;
    }
    
    return matchSearch && matchMethod && matchPeriod;
  });

  const filteredAmount = filteredPayments.reduce((sum, p) => sum + p.amount, 0);
  const uniqueMethods = Array.from(new Set(activeList.map(p => p.method)));

  const fm = (a: number) => `${a.toFixed(2)} €`;
  const formatDate = (d: string) => {
    try { return new Date(d).toLocaleDateString('fr-FR'); } catch { return d; }
  };

  const formatShortDate = (d: string) => {
    try { return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }); } catch { return d; }
  };

  const handleExportCSV = () => {
    if (filteredPayments.length === 0) { alert('Aucune transaction à exporter'); return; }
    const headers = ['Date', 'Type', 'N° Document', 'Client', 'Montant', 'Moyen', 'Référence', 'Sur facture', 'Notes'];
    const rows = filteredPayments.map(p => {
      let docType = '';
      if (p.flowType === 'debit') docType = 'Avoir';
      else if (p.invoiceType === 'advance') docType = 'Acompte';
      else docType = 'Facture';
      
      const signedAmount = p.flowType === 'debit' ? `-${p.amount.toFixed(2)}` : p.amount.toFixed(2);
      
      return [
        formatDate(p.date), 
        docType,
        p.invoiceNumber, 
        p.clientName,
        signedAmount, 
        p.method, 
        p.reference || '', 
        p.originalInvoiceNumber || '',
        (p.notes || '').replace(/[\n\r]/g, ' ')
      ];
    });
    const csv = [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${activeTab === 'credit' ? 'Encaissements' : 'Decaissements'}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Reset filtre moyen quand on change d'onglet
  useEffect(() => {
    setFilterMethod('all');
  }, [activeTab]);

  if (permLoading) return <Sidebar><div className="flex items-center justify-center h-full w-full"><div className="text-slate-500 dark:text-slate-400 text-lg animate-pulse">Vérification des droits...</div></div></Sidebar>;

  const isCreditTab = activeTab === 'credit';

  return (
    <Sidebar>
      <div className="min-h-full bg-slate-50 dark:bg-slate-900">
        {/* ✅ HEADER */}
        <header className="bg-white dark:bg-slate-800 shadow-sm border-b border-slate-200 dark:border-slate-700 sticky top-0 z-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-3">
                <div>
                  <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <DollarSign size={24} className="text-purple-600" />
                    Flux de trésorerie
                  </h1>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Encaissements et décaissements
                  </p>
                </div>
              </div>
              <button 
                onClick={handleExportCSV} 
                className={`flex items-center justify-center gap-2 ${isCreditTab ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'} text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors shadow-sm`}
              >
                <Download size={16} /> Exporter {isCreditTab ? 'Encaissements' : 'Décaissements'}
              </button>
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
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">{creditPayments.length} paiement(s)</p>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-4 border-l-4 border-l-red-500">
              <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-semibold flex items-center gap-1">
                <TrendingDown size={12} /> Décaissé
              </p>
              <p className="text-lg sm:text-xl font-bold text-red-600 dark:text-red-400 mt-1">- {fm(globalOutflows)}</p>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">{debitPayments.length} avoir(s)</p>
            </div>
            <div className={`bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-4 border-l-4 ${globalNet >= 0 ? 'border-l-green-500' : 'border-l-orange-500'}`}>
              <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-semibold">CA Net</p>
              <p className={`text-lg sm:text-xl font-bold mt-1 ${globalNet >= 0 ? 'text-green-600 dark:text-green-400' : 'text-orange-600 dark:text-orange-400'}`}>
                {fm(globalNet)}
              </p>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">Encaissé − Décaissé</p>
            </div>
          </div>

          {/* ✅ KPIs FILTRÉS (sur la liste affichée - onglet + filtres) */}
          <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 mb-6 border border-slate-200 dark:border-slate-700">
            <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-semibold mb-2">Sur la liste affichée</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase">Encaissé</p>
                <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                  + {fm(isCreditTab ? filteredAmount : 0)}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase">Décaissé</p>
                <p className="text-sm font-bold text-red-600 dark:text-red-400">
                  - {fm(isCreditTab ? 0 : filteredAmount)}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase">Transactions</p>
                <p className="text-sm font-bold text-slate-900 dark:text-white">{filteredPayments.length}</p>
              </div>
            </div>
          </div>

          {/* ✅ ONGLETS */}
          <div className="flex border-b border-slate-200 dark:border-slate-700 mb-6">
            <button 
              onClick={() => setActiveTab('credit')} 
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'credit' 
                  ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400' 
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              <TrendingUp size={16} />
              Encaissements
              <span className={`ml-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                activeTab === 'credit' 
                  ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300' 
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
              }`}>
                {creditPayments.length}
              </span>
            </button>
            <button 
              onClick={() => setActiveTab('debit')} 
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'debit' 
                  ? 'border-red-600 text-red-600 dark:text-red-400' 
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              <TrendingDown size={16} />
              Décaissements
              <span className={`ml-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                activeTab === 'debit' 
                  ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300' 
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
              }`}>
                {debitPayments.length}
              </span>
            </button>
          </div>

          {/* ✅ KPIs DE L'ONGLET ACTIF (temporels) */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4 mb-6">
            <div className={`bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-4 border-l-4 ${isCreditTab ? 'border-l-emerald-500' : 'border-l-red-500'}`}>
              <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-semibold">Ce mois</p>
              <p className={`text-lg sm:text-xl font-bold mt-1 ${isCreditTab ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                {isCreditTab ? '+ ' : '- '}{fm(thisMonthAmount)}
              </p>
            </div>
            <div className={`bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-4 border-l-4 ${isCreditTab ? 'border-l-blue-500' : 'border-l-orange-500'}`}>
              <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-semibold">Cette année</p>
              <p className={`text-lg sm:text-xl font-bold mt-1 ${isCreditTab ? 'text-blue-600 dark:text-blue-400' : 'text-orange-600 dark:text-orange-400'}`}>
                {isCreditTab ? '+ ' : '- '}{fm(thisYearAmount)}
              </p>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-4 border-l-4 border-l-purple-500 col-span-2 md:col-span-1">
              <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-semibold">Nb {isCreditTab ? 'paiements' : 'avoirs'}</p>
              <p className="text-lg sm:text-xl font-bold text-purple-600 dark:text-purple-400 mt-1">{activeList.length}</p>
            </div>
          </div>

          {/* ✅ FILTRES */}
          <div className="flex flex-col sm:flex-row gap-3 mb-6">
            <div className="relative flex-1">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input 
                type="text" 
                placeholder={`Rechercher (${isCreditTab ? 'facture, client, référence...' : 'avoir, client, motif, facture d\'origine...'})`} 
                value={search} 
                onChange={e => setSearch(e.target.value)} 
                className={`w-full pl-10 pr-4 py-3 border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white rounded-lg focus:ring-2 ${isCreditTab ? 'focus:ring-emerald-500' : 'focus:ring-red-500'} outline-none text-sm transition-shadow`} 
              />
            </div>
            <div className="flex gap-3">
              <div className="relative sm:w-48 flex-1">
                <Filter size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <select 
                  value={filterPeriod} 
                  onChange={e => setFilterPeriod(e.target.value)} 
                  className="w-full pl-10 pr-4 py-3 border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white rounded-lg focus:ring-2 focus:ring-purple-500 outline-none text-sm bg-white dark:bg-slate-800 appearance-none"
                >
                  <option value="all">Toutes périodes</option>
                  <option value="month">Ce mois</option>
                  <option value="quarter">Ce trimestre</option>
                  <option value="year">Cette année</option>
                </select>
              </div>
              <div className="relative sm:w-48 flex-1">
                <CreditCard size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <select 
                  value={filterMethod} 
                  onChange={e => setFilterMethod(e.target.value)} 
                  className="w-full pl-10 pr-4 py-3 border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white rounded-lg focus:ring-2 focus:ring-purple-500 outline-none text-sm bg-white dark:bg-slate-800 appearance-none"
                >
                  <option value="all">Tous moyens</option>
                  {uniqueMethods.map(m => <option key={m} value={m}>{methodLabels[m] || m}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* ✅ BANNIÈRE DE RÉSUMÉ */}
          {filteredPayments.length > 0 && (
            <div className={`${isCreditTab ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800' : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'} border rounded-lg p-3 mb-4 flex justify-between items-center`}>
              <span className={`text-sm font-medium ${isCreditTab ? 'text-emerald-800 dark:text-emerald-200' : 'text-red-800 dark:text-red-200'}`}>
                {filteredPayments.length} {isCreditTab ? 'paiement(s)' : 'avoir(s)'} affiché(s)
              </span>
              <span className={`text-lg font-bold ${isCreditTab ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}`}>
                {isCreditTab ? '+ ' : '- '}{fm(filteredAmount)}
              </span>
            </div>
          )}

          {/* ✅ CONTENU */}
          {loading ? (
            <div className="text-center py-12 text-slate-500 dark:text-slate-400 animate-pulse">Chargement...</div>
          ) : filteredPayments.length === 0 ? (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-12 text-center shadow-sm">
              {isCreditTab ? <DollarSign size={48} className="mx-auto text-slate-300 dark:text-slate-600 mb-4" /> : <FileMinus size={48} className="mx-auto text-slate-300 dark:text-slate-600 mb-4" />}
              <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-2">
                {isCreditTab ? 'Aucun encaissement' : 'Aucun décaissement'}
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {activeList.length === 0
                  ? (isCreditTab 
                      ? "Aucun paiement n'a encore été enregistré. Enregistrez un paiement depuis la page Factures." 
                      : "Aucun avoir n'a encore été émis. Créez un avoir depuis la page Factures.")
                  : "Aucune transaction ne correspond à vos filtres."}
              </p>
            </div>
          ) : (
            <>
              {/* ✅ TABLEAU DESKTOP */}
              <div className="hidden md:block bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700">
                      <tr>
                        <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Date</th>
                        <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">{isCreditTab ? 'Facture' : 'Avoir'}</th>
                        <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Client</th>
                        <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">{isCreditTab ? 'Moyen' : 'Motif'}</th>
                        <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Référence</th>
                        <th className="text-right px-6 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Montant</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                      {filteredPayments.map((p, idx) => (
                        <tr key={`${p.invoiceId}-${p.id}-${idx}`} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                          <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-300">
                            <div className="flex items-center gap-2">
                              <Calendar size={14} className="text-slate-400" />
                              {formatDate(p.date)}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-col gap-1">
                              <button onClick={() => navigate('/invoices')} className="inline-flex items-center gap-1 text-sm font-mono font-semibold text-purple-700 dark:text-purple-400 hover:text-purple-900 dark:hover:text-purple-300 hover:underline" title="Voir la facture">
                                {p.flowType === 'debit' ? <FileMinus size={14} /> : <Receipt size={14} />}
                                {p.invoiceNumber}
                              </button>
                              {p.flowType === 'credit' && p.invoiceType === 'advance' && (
                                <span className="text-[10px] text-blue-600 dark:text-blue-400 font-medium italic">Facture d'acompte</span>
                              )}
                              {p.flowType === 'debit' && (
                                <span className="text-[10px] text-red-600 dark:text-red-400 font-medium italic">Avoir émis</span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm font-medium text-slate-900 dark:text-white">{p.clientName}</td>
                          <td className="px-6 py-4">
                            {p.flowType === 'credit' ? (
                              <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${methodColors[p.method] || 'bg-slate-100 text-slate-700'}`}>
                                {methodLabels[p.method] || p.method}
                              </span>
                            ) : (
                              <span className="text-sm text-slate-700 dark:text-slate-300" title={p.notes || ''}>
                                {p.notes ? (p.notes.length > 30 ? p.notes.substring(0, 30) + '...' : p.notes) : '-'}
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-400">
                            {p.flowType === 'debit' ? (
                              p.originalInvoiceNumber ? (
                                <div className="flex flex-col">
                                  <span className="text-[10px] text-slate-400 dark:text-slate-500 uppercase">Sur facture</span>
                                  <button 
                                    onClick={() => navigate('/invoices')} 
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
                            <span className={`text-sm font-bold ${p.flowType === 'credit' ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}`}>
                              {p.flowType === 'credit' ? '+ ' : '- '}{fm(p.amount)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* ✅ VERSION MOBILE */}
              <div className="md:hidden space-y-3">
                {filteredPayments.map((p, idx) => (
                  <div key={`${p.invoiceId}-${p.id}-${idx}`} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 shadow-sm">
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`inline-flex items-center gap-1 text-xs font-mono font-semibold px-2 py-1 rounded ${
                            p.flowType === 'debit' 
                              ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'
                              : p.invoiceType === 'advance' 
                                ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' 
                                : 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300'
                          }`}>
                            {p.flowType === 'debit' ? <FileMinus size={12} /> : <Receipt size={12} />}
                            {p.invoiceNumber}
                          </span>
                          {p.flowType === 'credit' && p.invoiceType === 'advance' && (
                            <span className="text-[10px] text-blue-600 dark:text-blue-400 font-medium">Acompte</span>
                          )}
                          {p.flowType === 'debit' && (
                            <span className="text-[10px] text-red-600 dark:text-red-400 font-medium">Avoir</span>
                          )}
                        </div>
                        <h3 className="font-semibold text-slate-900 dark:text-white truncate">{p.clientName}</h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-0.5">
                          <Calendar size={10} />
                          {formatShortDate(p.date)}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0 ml-3">
                        <p className={`text-lg font-bold ${p.flowType === 'credit' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                          {p.flowType === 'credit' ? '+ ' : '- '}{fm(p.amount)}
                        </p>
                        {p.flowType === 'credit' ? (
                          <span className={`inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-medium ${methodColors[p.method] || 'bg-slate-100 text-slate-700'}`}>
                            {methodLabels[p.method] || p.method}
                          </span>
                        ) : (
                          <span className="inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-medium bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300">
                            Avoir
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Détails */}
                    {(p.reference || p.notes || p.originalInvoiceNumber) && (
                      <div className="grid grid-cols-1 gap-2 py-3 border-t border-b border-slate-100 dark:border-slate-700 mb-3 text-xs">
                        {p.flowType === 'debit' && (
                          <>
                            {p.notes && (
                              <div className="flex justify-between gap-2">
                                <span className="text-slate-500 dark:text-slate-400 flex-shrink-0">Motif</span>
                                <span className="text-slate-700 dark:text-slate-300 text-right">{p.notes}</span>
                              </div>
                            )}
                            {p.originalInvoiceNumber && (
                              <div className="flex justify-between gap-2">
                                <span className="text-slate-500 dark:text-slate-400 flex-shrink-0">Sur facture</span>
                                <button 
                                  onClick={() => navigate('/invoices')} 
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
                            <span className="font-mono font-medium text-slate-900 dark:text-white">{p.reference}</span>
                          </div>
                        )}
                        {p.flowType === 'credit' && p.notes && (
                          <div className="flex justify-between">
                            <span className="text-slate-500 dark:text-slate-400">Notes</span>
                            <span className="text-slate-700 dark:text-slate-300 text-right max-w-[60%] truncate">{p.notes}</span>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                      <button 
                        onClick={() => navigate('/invoices')} 
                        className="flex items-center justify-center gap-2 p-2.5 text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/30 rounded-lg active:scale-95 transition-transform"
                      >
                        <Eye size={16} />
                        <span className="text-xs font-medium">Voir facture</span>
                      </button>
                      <button 
                        onClick={() => {
                          const prefix = p.flowType === 'debit' ? 'Avoir' : 'Paiement';
                          const sign = p.flowType === 'debit' ? '-' : '';
                          const originalRef = p.flowType === 'debit' && p.originalInvoiceNumber ? ` - Sur facture ${p.originalInvoiceNumber}` : '';
                          const text = `${prefix} de ${sign}${fm(p.amount)} - ${p.invoiceNumber} - ${p.clientName}${originalRef}${p.reference && p.flowType === 'credit' ? ` - Réf: ${p.reference}` : ''}${p.notes ? ` - ${p.notes}` : ''}`;
                          navigator.clipboard.writeText(text);
                          alert('✅ Détails copiés !');
                        }}
                        className={`flex items-center justify-center gap-2 p-2.5 ${isCreditTab ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30' : 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30'} rounded-lg active:scale-95 transition-transform`}
                      >
                        <FileText size={16} />
                        <span className="text-xs font-medium">Copier</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </main>
      </div>
    </Sidebar>
  );
}