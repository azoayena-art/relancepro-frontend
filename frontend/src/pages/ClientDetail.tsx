import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { databases, DATABASE_ID } from '../appwrite';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import {
  ChevronLeft, UserCheck, Mail, Phone, Building, MapPin, FileText,
  Receipt, Edit2, Archive, RotateCcw, Hash, Calendar, TrendingUp,
  DollarSign, AlertCircle, Clock, CheckCircle2, User
} from 'lucide-react';
import { Query, ID } from 'appwrite';

interface Client {
  $id: string;
  teamId: string;
  userId: string;
  clientId?: string;
  type: string;
  firstName?: string;
  lastName?: string;
  companyName?: string;
  email?: string;
  phone?: string;
  address?: string;
  billingAddress?: string;
  taxNumber?: string;
  notes?: string;
  status: string;
  prospectId?: string;
  $createdAt?: string;
}

interface Quote {
  $id: string;
  quoteNumber: string;
  clientName: string;
  subject?: string;
  status: string;
  total: number;
  issueDate?: string;
  $createdAt?: string;
}

interface Invoice {
  $id: string;
  invoiceNumber: string;
  clientName?: string;
  status: string;
  total: number;
  balance?: number;
  issueDate?: string;
  dueDate?: string;
  paidAt?: string;
  $createdAt?: string;
}

const statusColors: Record<string, string> = {
  Brouillon: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
  Envoyé: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  Accepté: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  Refusé: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  Facturé: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
  paid: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  unpaid: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  draft: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300'
};

const quoteStatusLabels: Record<string, string> = {
  Brouillon: 'Brouillon',
  Envoyé: 'Envoyé',
  Accepté: 'Accepté',
  Refusé: 'Refusé',
  Facturé: 'Facturé'
};

const invoiceStatusLabels: Record<string, string> = {
  paid: 'Payée',
  unpaid: 'Non payée',
  draft: 'Brouillon'
};

export default function ClientDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { hasPermission, loading: permLoading } = usePermissions();
  const navigate = useNavigate();

  const [client, setClient] = useState<Client | null>(null);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentTeamId, setCurrentTeamId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'info' | 'quotes' | 'invoices' | 'history'>('info');

  useEffect(() => {
    if (!permLoading && !hasPermission('clients.view')) {
      navigate('/dashboard');
    }
  }, [permLoading, hasPermission, navigate]);

  useEffect(() => {
    if (!user || !id) return;
    loadClientData();
  }, [user, id]);

  const loadClientData = async () => {
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
        alert('⚠️ Aucune équipe trouvée');
        setLoading(false);
        navigate('/clients');
        return;
      }
      setCurrentTeamId(teamId);

      const clientDoc = await databases.getDocument(DATABASE_ID, 'clients', id!);
      
      if (clientDoc.teamId !== teamId) {
        alert('⚠️ Accès refusé : Ce client n\'appartient pas à votre équipe.');
        setLoading(false);
        navigate('/clients');
        return;
      }

      setClient(clientDoc as unknown as Client);

      const clientName = `${clientDoc.firstName || ''} ${clientDoc.lastName || ''}`.trim() || clientDoc.companyName || '';
      
      try {
        const quotesRes = await databases.listDocuments(DATABASE_ID, 'quotes', [
          Query.equal('teamId', teamId),
          Query.orderDesc('$createdAt'),
          Query.limit(500)
        ]);
        const clientQuotes = quotesRes.documents.filter((q: any) => {
          if (clientDoc.prospectId && q.prospectId === clientDoc.prospectId) return true;
          if (q.clientName && clientName && q.clientName === clientName) return true;
          if (q.clientId === clientDoc.$id) return true;
          return false;
        });
        setQuotes(clientQuotes as unknown as Quote[]);
      } catch (e) { console.warn('Erreur chargement devis:', e); }

      try {
        const invoicesRes = await databases.listDocuments(DATABASE_ID, 'invoices', [
          Query.equal('teamId', teamId),
          Query.orderDesc('$createdAt'),
          Query.limit(500)
        ]);
        const clientInvoices = invoicesRes.documents.filter((inv: any) => {
          if (inv.clientName && clientName && inv.clientName === clientName) return true;
          if (inv.clientId === clientDoc.$id) return true;
          return false;
        });
        setInvoices(clientInvoices as unknown as Invoice[]);
      } catch (e) { console.warn('Erreur chargement factures:', e); }

    } catch (error: any) {
      console.error('Erreur chargement client:', error);
      alert(`Erreur : ${error.message}`);
      navigate('/clients');
    } finally {
      setLoading(false);
    }
  };

  const totalInvoiced = invoices.reduce((sum, inv) => sum + (inv.total || 0), 0);
  const totalPaid = invoices.filter(inv => inv.status === 'paid').reduce((sum, inv) => sum + (inv.total || 0), 0);
  const totalRemaining = totalInvoiced - totalPaid;
  const acceptedQuotes = quotes.filter(q => q.status === 'Accepté' || q.status === 'Facturé').length;

  const handleArchive = async () => {
    if (!client) return;
    if (!confirm(`Archiver le client "${client.firstName} ${client.lastName}" ?`)) return;
    try {
      const doc = await databases.getDocument(DATABASE_ID, 'clients', client.$id);
      if (doc.teamId !== currentTeamId) { alert('⚠️ Accès refusé'); return; }
      await databases.updateDocument(DATABASE_ID, 'clients', client.$id, { status: 'archived' });
      alert('✅ Client archivé');
      navigate('/clients');
    } catch (error: any) { alert(`Erreur : ${error.message}`); }
  };

  const handleUnarchive = async () => {
    if (!client) return;
    try {
      const doc = await databases.getDocument(DATABASE_ID, 'clients', client.$id);
      if (doc.teamId !== currentTeamId) { alert('⚠️ Accès refusé'); return; }
      await databases.updateDocument(DATABASE_ID, 'clients', client.$id, { status: 'active' });
      setClient({ ...client, status: 'active' });
      alert('✅ Client désarchivé');
    } catch (error: any) { alert(`Erreur : ${error.message}`); }
  };

  const fm = (a: number) => `${a.toFixed(2)} €`;

  const buildHistory = () => {
    const items: any[] = [];
    quotes.forEach(q => {
      items.push({
        type: 'quote',
        date: q.issueDate || q.$createdAt || '',
        title: `Devis ${q.quoteNumber}`,
        subtitle: q.subject || q.clientName,
        amount: q.total,
        status: q.status,
        id: q.$id
      });
    });
    invoices.forEach(inv => {
      items.push({
        type: 'invoice',
        date: inv.issueDate || inv.$createdAt || '',
        title: `Facture ${inv.invoiceNumber}`,
        subtitle: inv.clientName || '',
        amount: inv.total,
        status: inv.status,
        id: inv.$id
      });
    });
    items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return items;
  };

  if (permLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-900">
        <div className="text-slate-500 dark:text-slate-400 text-lg animate-pulse">Chargement...</div>
      </div>
    );
  }

  if (!client) return null;

  const clientName = `${client.firstName || ''} ${client.lastName || ''}`.trim() || client.companyName || 'Client sans nom';
  const history = buildHistory();

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      {/* HEADER STICKY OPTIMISÉ MOBILE */}
      <header className="bg-white dark:bg-slate-800 shadow-sm border-b border-slate-200 dark:border-slate-700 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <button onClick={() => navigate('/clients')} className="p-2 -ml-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                <ChevronLeft size={20} />
              </button>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 sm:w-12 sm:h-12 bg-cyan-100 dark:bg-cyan-900/40 rounded-full flex items-center justify-center flex-shrink-0">
                  {client.type === 'entreprise' ? (
                    <Building size={20} className="sm:w-6 sm:h-6 text-cyan-600 dark:text-cyan-400" />
                  ) : (
                    <User size={20} className="sm:w-6 sm:h-6 text-cyan-600 dark:text-cyan-400" />
                  )}
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-lg sm:text-2xl font-bold text-slate-900 dark:text-white">{clientName}</h1>
                    {client.clientId && (
                      <span className="inline-flex items-center gap-1 text-xs font-mono font-semibold text-cyan-700 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-900/30 px-2 py-0.5 rounded">
                        <Hash size={12} />
                        {client.clientId}
                      </span>
                    )}
                    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      client.status === 'active' ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' : 
                      client.status === 'archived' ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400' : 
                      'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300'
                    }`}>
                      {client.status === 'active' ? 'Actif' : client.status === 'archived' ? 'Archivé' : 'Inactif'}
                    </span>
                  </div>
                  {client.companyName && client.type === 'particulier' && (
                    <p className="text-sm text-slate-500 dark:text-slate-400">{client.companyName}</p>
                  )}
                </div>
              </div>
            </div>
            
            <div className="flex flex-wrap items-center gap-2">
              {hasPermission('quotes.create') && client.status !== 'archived' && (
                <button onClick={() => navigate(`/quotes?clientId=${client.$id}`)} className="flex-1 sm:flex-none items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors flex active:scale-95">
                  <FileText size={16} />
                  <span className="hidden sm:inline">Nouveau devis</span>
                  <span className="sm:hidden">Devis</span>
                </button>
              )}
              {hasPermission('clients.edit') && client.status !== 'archived' && (
                <button onClick={() => navigate(`/clients?edit=${client.$id}`)} className="flex-1 sm:flex-none items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors flex active:scale-95">
                  <Edit2 size={16} />
                  <span className="hidden sm:inline">Modifier</span>
                </button>
              )}
              {hasPermission('clients.delete') && client.status !== 'archived' ? (
                <button onClick={handleArchive} className="flex-1 sm:flex-none items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-orange-700 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/30 border border-orange-200 dark:border-orange-800 rounded-lg hover:bg-orange-100 dark:hover:bg-orange-900/50 transition-colors flex active:scale-95">
                  <Archive size={16} />
                  <span className="hidden sm:inline">Archiver</span>
                </button>
              ) : hasPermission('clients.delete') && client.status === 'archived' ? (
                <button onClick={handleUnarchive} className="flex-1 sm:flex-none items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/50 transition-colors flex active:scale-95">
                  <RotateCcw size={16} />
                  <span className="hidden sm:inline">Désarchiver</span>
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-6">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-4 border-l-4 border-l-blue-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-semibold">Total facturé</p>
                <p className="text-lg sm:text-2xl font-bold text-slate-900 dark:text-white mt-1">{fm(totalInvoiced)}</p>
              </div>
              <Receipt size={24} className="text-blue-500 dark:text-blue-400 hidden sm:block" />
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">{invoices.length} facture(s)</p>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-4 border-l-4 border-l-green-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-semibold">Encaissé</p>
                <p className="text-lg sm:text-2xl font-bold text-green-600 dark:text-green-400 mt-1">{fm(totalPaid)}</p>
              </div>
              <CheckCircle2 size={24} className="text-green-500 dark:text-green-400 hidden sm:block" />
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
              {invoices.filter(i => i.status === 'paid').length} payée(s)
            </p>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-4 border-l-4 border-l-red-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-semibold">Reste à payer</p>
                <p className="text-lg sm:text-2xl font-bold text-red-600 dark:text-red-400 mt-1">{fm(totalRemaining)}</p>
              </div>
              <AlertCircle size={24} className="text-red-500 dark:text-red-400 hidden sm:block" />
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
              {invoices.filter(i => i.status !== 'paid').length} en attente
            </p>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-4 border-l-4 border-l-purple-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-semibold">Devis acceptés</p>
                <p className="text-lg sm:text-2xl font-bold text-purple-600 dark:text-purple-400 mt-1">{acceptedQuotes}</p>
              </div>
              <TrendingUp size={24} className="text-purple-500 dark:text-purple-400 hidden sm:block" />
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
              sur {quotes.length} devis total
            </p>
          </div>
        </div>

        {/* CONTENU PRINCIPAL AVEC ONGLETS */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
          {/* Navigation des onglets (scrollable sur mobile) */}
          <div className="border-b border-slate-200 dark:border-slate-700 overflow-x-auto">
            <nav className="flex min-w-max">
              <button onClick={() => setActiveTab('info')} className={`px-4 sm:px-6 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'info' ? 'border-cyan-600 text-cyan-600 dark:text-cyan-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}>
                <User className="inline mr-2" size={16} />
                Informations
              </button>
              <button onClick={() => setActiveTab('quotes')} className={`px-4 sm:px-6 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'quotes' ? 'border-cyan-600 text-cyan-600 dark:text-cyan-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}>
                <FileText className="inline mr-2" size={16} />
                Devis ({quotes.length})
              </button>
              <button onClick={() => setActiveTab('invoices')} className={`px-4 sm:px-6 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'invoices' ? 'border-cyan-600 text-cyan-600 dark:text-cyan-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}>
                <Receipt className="inline mr-2" size={16} />
                Factures ({invoices.length})
              </button>
              <button onClick={() => setActiveTab('history')} className={`px-4 sm:px-6 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'history' ? 'border-cyan-600 text-cyan-600 dark:text-cyan-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}>
                <Clock className="inline mr-2" size={16} />
                Historique ({history.length})
              </button>
            </nav>
          </div>

          <div className="p-4 sm:p-6">
            {/* ONGLET INFOS */}
            {activeTab === 'info' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase mb-3">Coordonnées</h3>
                  <div className="space-y-3">
                    {client.email && (
                      <div className="flex items-center gap-3 text-sm">
                        <Mail size={16} className="text-slate-400 dark:text-slate-500 flex-shrink-0" />
                        <a href={`mailto:${client.email}`} className="text-cyan-600 dark:text-cyan-400 hover:underline truncate">{client.email}</a>
                      </div>
                    )}
                    {client.phone && (
                      <div className="flex items-center gap-3 text-sm">
                        <Phone size={16} className="text-slate-400 dark:text-slate-500 flex-shrink-0" />
                        <a href={`tel:${client.phone}`} className="text-cyan-600 dark:text-cyan-400 hover:underline">{client.phone}</a>
                      </div>
                    )}
                    {client.address && (
                      <div className="flex items-start gap-3 text-sm">
                        <MapPin size={16} className="text-slate-400 dark:text-slate-500 mt-0.5 flex-shrink-0" />
                        <span className="text-slate-700 dark:text-slate-300">{client.address}</span>
                      </div>
                    )}
                    {client.billingAddress && client.billingAddress !== client.address && (
                      <div className="flex items-start gap-3 text-sm">
                        <Building size={16} className="text-slate-400 dark:text-slate-500 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Adresse de facturation</p>
                          <p className="text-slate-700 dark:text-slate-300">{client.billingAddress}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase mb-3">Informations légales</h3>
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-500 dark:text-slate-400">Type</span>
                      <span className="text-slate-900 dark:text-white font-medium">{client.type === 'entreprise' ? 'Entreprise' : 'Particulier'}</span>
                    </div>
                    {client.companyName && (
                      <div className="flex justify-between">
                        <span className="text-slate-500 dark:text-slate-400">Entreprise</span>
                        <span className="text-slate-900 dark:text-white font-medium">{client.companyName}</span>
                      </div>
                    )}
                    {client.taxNumber && (
                      <div className="flex justify-between">
                        <span className="text-slate-500 dark:text-slate-400">N° Fiscal / TVA</span>
                        <span className="text-slate-900 dark:text-white font-mono text-xs">{client.taxNumber}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-slate-500 dark:text-slate-400">Client depuis</span>
                      <span className="text-slate-900 dark:text-white">
                        {client.$createdAt ? new Date(client.$createdAt).toLocaleDateString('fr-FR') : '-'}
                      </span>
                    </div>
                  </div>
                </div>

                {client.notes && (
                  <div className="md:col-span-2">
                    <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase mb-3">Notes internes</h3>
                    <div className="bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg p-4 text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                      {client.notes}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ONGLET DEVIS */}
            {activeTab === 'quotes' && (
              <div>
                {quotes.length === 0 ? (
                  <div className="text-center py-12">
                    <FileText size={48} className="mx-auto text-slate-300 dark:text-slate-600 mb-4" />
                    <p className="text-slate-500 dark:text-slate-400">Aucun devis pour ce client</p>
                    {hasPermission('quotes.create') && client.status !== 'archived' && (
                      <button onClick={() => navigate(`/quotes?clientId=${client.$id}`)} className="mt-4 inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 active:scale-95 transition-transform">
                        <FileText size={16} />
                        Créer un devis
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[600px]">
                      <thead className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700">
                        <tr>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">N°</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Objet</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Date</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Total</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Statut</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                        {quotes.map(q => (
                          <tr key={q.$id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                            <td className="px-4 py-3 text-sm font-medium text-slate-900 dark:text-white">{q.quoteNumber}</td>
                            <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">{q.subject || '-'}</td>
                            <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">{q.issueDate || '-'}</td>
                            <td className="px-4 py-3 text-sm font-semibold text-slate-900 dark:text-white">{fm(q.total)}</td>
                            <td className="px-4 py-3">
                              <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium ${statusColors[q.status] || 'bg-gray-100 text-gray-800'}`}>
                                {quoteStatusLabels[q.status] || q.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ONGLET FACTURES */}
            {activeTab === 'invoices' && (
              <div>
                {invoices.length === 0 ? (
                  <div className="text-center py-12">
                    <Receipt size={48} className="mx-auto text-slate-300 dark:text-slate-600 mb-4" />
                    <p className="text-slate-500 dark:text-slate-400">Aucune facture pour ce client</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[600px]">
                      <thead className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700">
                        <tr>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">N°</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Date</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Échéance</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Total</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Statut</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                        {invoices.map(inv => (
                          <tr key={inv.$id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                            <td className="px-4 py-3 text-sm font-medium text-slate-900 dark:text-white">{inv.invoiceNumber}</td>
                            <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">{inv.issueDate || '-'}</td>
                            <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">{inv.dueDate || '-'}</td>
                            <td className="px-4 py-3 text-sm font-semibold text-slate-900 dark:text-white">{fm(inv.total)}</td>
                            <td className="px-4 py-3">
                              <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium ${statusColors[inv.status] || 'bg-gray-100 text-gray-800'}`}>
                                {invoiceStatusLabels[inv.status] || inv.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ONGLET HISTORIQUE */}
            {activeTab === 'history' && (
              <div>
                {history.length === 0 ? (
                  <div className="text-center py-12">
                    <Clock size={48} className="mx-auto text-slate-300 dark:text-slate-600 mb-4" />
                    <p className="text-slate-500 dark:text-slate-400">Aucun historique pour ce client</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {history.map((item, idx) => (
                      <div key={idx} className="flex items-start gap-4 p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg border border-slate-200 dark:border-slate-600">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                          item.type === 'quote' ? 'bg-green-100 dark:bg-green-900/40' : 'bg-purple-100 dark:bg-purple-900/40'
                        }`}>
                          {item.type === 'quote' ? (
                            <FileText size={18} className="text-green-600 dark:text-green-400" />
                          ) : (
                            <Receipt size={18} className="text-purple-600 dark:text-purple-400" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                            <p className="font-medium text-slate-900 dark:text-white truncate">{item.title}</p>
                            <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium w-fit ${statusColors[item.status] || 'bg-gray-100 text-gray-800'}`}>
                              {item.type === 'quote' ? (quoteStatusLabels[item.status] || item.status) : (invoiceStatusLabels[item.status] || item.status)}
                            </span>
                          </div>
                          {item.subtitle && <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 truncate">{item.subtitle}</p>}
                          <div className="flex items-center justify-between mt-2">
                            <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                              <Calendar size={12} />
                              {item.date ? new Date(item.date).toLocaleDateString('fr-FR') : '-'}
                            </p>
                            <p className="text-sm font-semibold text-slate-900 dark:text-white">{fm(item.amount)}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}