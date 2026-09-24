import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { databases, DATABASE_ID } from '../appwrite';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import {
  ChevronLeft, DollarSign, Calendar, Search, Filter, Download,
  TrendingUp, CreditCard, Receipt
} from 'lucide-react';
import { Query } from 'appwrite';

interface Payment {
  id: string;
  amount: number;
  date: string;
  method: string;
  reference?: string;
  notes?: string;
}

interface ParsedPayment extends Payment {
  invoiceId: string;
  invoiceNumber: string;
  clientName: string;
  teamId: string;
}

interface Invoice {
  $id: string;
  invoiceNumber: string;
  clientName: string;
  teamId: string;
  total: number;
  payments?: string | Payment[];
  $createdAt?: string;
}

const methodLabels: Record<string, string> = {
  'Virement bancaire': '🏦 Virement',
  'Chèque': '📝 Chèque',
  'Espèces': '💵 Espèces',
  'Carte bancaire': '💳 Carte',
  'Prélèvement SEPA': '🔄 SEPA',
  'Autre': '📦 Autre'
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
        console.warn('⚠️ Aucun teamId trouvé');
        setLoading(false); 
        return; 
      }

      const invoicesRes = await databases.listDocuments(
        DATABASE_ID, 'invoices',
        [Query.equal('teamId', teamId), Query.limit(2000)]
      );

      const allPayments: ParsedPayment[] = [];

      (invoicesRes.documents as unknown as Invoice[]).forEach(invoice => {
        console.log(`🔍 Facture: ${invoice.invoiceNumber} | Champ payments:`, invoice.payments, '| Type:', typeof invoice.payments);

        let parsedPayments: Payment[] = [];
        
        if (invoice.payments) {
          try {
            if (typeof invoice.payments === 'string') {
              const trimmed = invoice.payments.trim();
              if (trimmed && trimmed !== '[]' && trimmed !== 'null' && trimmed !== '""') {
                parsedPayments = JSON.parse(trimmed);
              }
            } else if (Array.isArray(invoice.payments)) {
              parsedPayments = invoice.payments;
            }
          } catch (e) {
            console.warn(`⚠️ Erreur parsing JSON pour la facture ${invoice.invoiceNumber}:`, e);
            parsedPayments = [];
          }
        }

        console.log(`  ↳ Résultat du parsing pour ${invoice.invoiceNumber}:`, parsedPayments);

        if (Array.isArray(parsedPayments) && parsedPayments.length > 0) {
          parsedPayments.forEach(payment => {
            if (payment.amount && payment.amount > 0) {
              allPayments.push({
                id: payment.id || String(Math.random()),
                amount: payment.amount,
                date: payment.date || invoice.$createdAt || new Date().toISOString(),
                method: payment.method || 'Autre',
                reference: payment.reference || '',
                notes: payment.notes || '',
                invoiceId: invoice.$id,
                invoiceNumber: invoice.invoiceNumber,
                clientName: invoice.clientName || 'Client inconnu',
                teamId: invoice.teamId
              });
            }
          });
        }
      });

      console.log('✅ Total paiements trouvés et prêts à l\'affichage:', allPayments.length, allPayments);

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

  const totalAmount = payments.reduce((sum, p) => sum + p.amount, 0);
  const thisMonthAmount = payments.filter(p => {
    const d = new Date(p.date);
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
  }).reduce((sum, p) => sum + p.amount, 0);
  const thisYearAmount = payments.filter(p => {
    const d = new Date(p.date);
    return d.getFullYear() === currentYear;
  }).reduce((sum, p) => sum + p.amount, 0);

  const filteredPayments = payments.filter(p => {
    const searchStr = `${p.invoiceNumber} ${p.clientName} ${p.reference || ''} ${p.method}`.toLowerCase();
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
  const uniqueMethods = Array.from(new Set(payments.map(p => p.method)));

  const fm = (a: number) => `${a.toFixed(2)} €`;
  const formatDate = (d: string) => {
    try { return new Date(d).toLocaleDateString('fr-FR'); } catch { return d; }
  };

  const handleExportCSV = () => {
    if (filteredPayments.length === 0) { alert('Aucun paiement à exporter'); return; }
    const headers = ['Date', 'Facture', 'Client', 'Montant', 'Moyen', 'Référence', 'Notes'];
    const rows = filteredPayments.map(p => [
      formatDate(p.date), p.invoiceNumber, p.clientName,
      p.amount.toFixed(2), p.method, p.reference || '', (p.notes || '').replace(/[\n\r]/g, ' ')
    ]);
    const csv = [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Paiements_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
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
                <DollarSign className="text-emerald-600" />
                Historique des Paiements
              </h1>
              <p className="text-sm text-slate-500">{payments.length} paiement(s) enregistré(s)</p>
            </div>
          </div>
          <button onClick={handleExportCSV} className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors">
            <Download size={16} /> Exporter CSV
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow p-4 border-l-4 border-emerald-500">
            <p className="text-xs text-slate-500 uppercase font-semibold flex items-center gap-1">
              <TrendingUp size={12} /> Total encaissé
            </p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{fm(totalAmount)}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4 border-l-4 border-blue-500">
            <p className="text-xs text-slate-500 uppercase font-semibold">Ce mois</p>
            <p className="text-2xl font-bold text-blue-600 mt-1">{fm(thisMonthAmount)}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4 border-l-4 border-purple-500">
            <p className="text-xs text-slate-500 uppercase font-semibold">Cette année</p>
            <p className="text-2xl font-bold text-purple-600 mt-1">{fm(thisYearAmount)}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4 border-l-4 border-orange-500">
            <p className="text-xs text-slate-500 uppercase font-semibold">Nb paiements</p>
            <p className="text-2xl font-bold text-orange-600 mt-1">{payments.length}</p>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="text" placeholder="Rechercher (facture, client, référence...)" value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm" />
          </div>
          <div className="relative">
            <Filter size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <select value={filterPeriod} onChange={e => setFilterPeriod(e.target.value)} className="pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm bg-white">
              <option value="all">Toutes les périodes</option>
              <option value="month">Ce mois</option>
              <option value="quarter">Ce trimestre</option>
              <option value="year">Cette année</option>
            </select>
          </div>
          <div className="relative">
            <CreditCard size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <select value={filterMethod} onChange={e => setFilterMethod(e.target.value)} className="pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm bg-white">
              <option value="all">Tous les moyens</option>
              {uniqueMethods.map(m => <option key={m} value={m}>{methodLabels[m] || m}</option>)}
            </select>
          </div>
        </div>

        {filteredPayments.length > 0 && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 mb-4 flex justify-between items-center">
            <span className="text-sm font-medium text-emerald-800">{filteredPayments.length} paiement(s) affiché(s)</span>
            <span className="text-lg font-bold text-emerald-700">Total : {fm(filteredAmount)}</span>
          </div>
        )}

        {loading ? (
          <div className="text-center py-12 text-slate-500">Chargement...</div>
        ) : filteredPayments.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <DollarSign size={48} className="mx-auto text-slate-300 mb-4" />
            <h3 className="text-lg font-semibold text-slate-700 mb-2">Aucun paiement trouvé</h3>
            <p className="text-slate-500 text-sm">
              {payments.length === 0
                ? "Aucun paiement n'a encore été enregistré. Enregistrez un paiement depuis la page Factures."
                : "Aucun paiement ne correspond à vos filtres."}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Date</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Facture</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Client</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Moyen</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Référence</th>
                    <th className="text-right px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Montant</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredPayments.map((p, idx) => (
                    <tr key={`${p.invoiceId}-${p.id}-${idx}`} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 text-sm text-slate-600">
                        <div className="flex items-center gap-2">
                          <Calendar size={14} className="text-slate-400" />
                          {formatDate(p.date)}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <button onClick={() => navigate('/invoices')} className="inline-flex items-center gap-1 text-sm font-mono font-semibold text-purple-700 hover:text-purple-900 hover:underline" title="Voir la facture">
                          <Receipt size={14} />
                          {p.invoiceNumber}
                        </button>
                      </td>
                      <td className="px-6 py-4 text-sm font-medium text-slate-900">{p.clientName}</td>
                      <td className="px-6 py-4 text-sm text-slate-600">{methodLabels[p.method] || p.method}</td>
                      <td className="px-6 py-4 text-sm text-slate-600 font-mono">{p.reference || '-'}</td>
                      <td className="px-6 py-4 text-right">
                        <span className="text-sm font-bold text-emerald-700">+ {fm(p.amount)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}