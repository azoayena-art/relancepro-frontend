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
  Brouillon: 'bg-gray-100 text-gray-800',
  Envoyé: 'bg-blue-100 text-blue-800',
  Accepté: 'bg-green-100 text-green-800',
  Refusé: 'bg-red-100 text-red-800',
  Facturé: 'bg-purple-100 text-purple-800',
  paid: 'bg-green-100 text-green-800',
  unpaid: 'bg-red-100 text-red-800',
  draft: 'bg-gray-100 text-gray-800'
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

  // ✅ SÉCURITÉ : Redirection si pas de permission
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

      // 1. Trouver le teamId de l'utilisateur
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

      // 2. Charger le client
      const clientDoc = await databases.getDocument(DATABASE_ID, 'clients', id!);
      
      // ✅ SÉCURITÉ MULTI-TENANT : Vérifier que le client appartient à l'équipe
      if (clientDoc.teamId !== teamId) {
        alert('⚠️ Accès refusé : Ce client n\'appartient pas à votre équipe.');
        setLoading(false);
        navigate('/clients');
        return;
      }

      setClient(clientDoc as unknown as Client);

      // 3. Charger les devis liés au client
      // On cherche par clientName ou prospectId (selon comment le client a été créé)
      const clientName = `${clientDoc.firstName || ''} ${clientDoc.lastName || ''}`.trim() || clientDoc.companyName || '';
      
      try {
        const quotesRes = await databases.listDocuments(DATABASE_ID, 'quotes', [
          Query.equal('teamId', teamId),
          Query.orderDesc('$createdAt'),
          Query.limit(500)
        ]);
        
        // Filtrer côté client les devis qui correspondent à ce client
        const clientQuotes = quotesRes.documents.filter((q: any) => {
          // Cas 1 : Le client vient d'un prospect
          if (clientDoc.prospectId && q.prospectId === clientDoc.prospectId) return true;
          // Cas 2 : Le nom du client correspond
          if (q.clientName && clientName && q.clientName === clientName) return true;
          // Cas 3 : Le clientId est directement lié (pour le futur)
          if (q.clientId === clientDoc.$id) return true;
          return false;
        });
        
        setQuotes(clientQuotes as unknown as Quote[]);
      } catch (e) {
        console.warn('Erreur chargement devis:', e);
      }

      // 4. Charger les factures liées au client
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
      } catch (e) {
        console.warn('Erreur chargement factures:', e);
      }

    } catch (error: any) {
      console.error('Erreur chargement client:', error);
      alert(`Erreur : ${error.message}`);
      navigate('/clients');
    } finally {
      setLoading(false);
    }
  };

  // ✅ CALCUL DES KPIs
  const totalInvoiced = invoices.reduce((sum, inv) => sum + (inv.total || 0), 0);
  const totalPaid = invoices
    .filter(inv => inv.status === 'paid')
    .reduce((sum, inv) => sum + (inv.total || 0), 0);
  const totalRemaining = totalInvoiced - totalPaid;
  const acceptedQuotes = quotes.filter(q => q.status === 'Accepté' || q.status === 'Facturé').length;

  const handleArchive = async () => {
    if (!client) return;
    if (!confirm(`Archiver le client "${client.firstName} ${client.lastName}" ?`)) return;
    
    try {
      // ✅ SÉCURITÉ : Vérification teamId
      const doc = await databases.getDocument(DATABASE_ID, 'clients', client.$id);
      if (doc.teamId !== currentTeamId) {
        alert('⚠️ Accès refusé');
        return;
      }
      
      await databases.updateDocument(DATABASE_ID, 'clients', client.$id, { status: 'archived' });
      alert('✅ Client archivé');
      navigate('/clients');
    } catch (error: any) {
      alert(`Erreur : ${error.message}`);
    }
  };

  const handleUnarchive = async () => {
    if (!client) return;
    try {
      const doc = await databases.getDocument(DATABASE_ID, 'clients', client.$id);
      if (doc.teamId !== currentTeamId) {
        alert('⚠️ Accès refusé');
        return;
      }
      
      await databases.updateDocument(DATABASE_ID, 'clients', client.$id, { status: 'active' });
      setClient({ ...client, status: 'active' });
      alert('✅ Client désarchivé');
    } catch (error: any) {
      alert(`Erreur : ${error.message}`);
    }
  };

  const fm = (a: number) => `${a.toFixed(2)} €`;

  // ✅ Construction de l'historique combiné (devis + factures)
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
    
    // Trier par date décroissante
    items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return items;
  };

  if (permLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-slate-500 text-lg">Chargement...</div>
      </div>
    );
  }

  if (!client) return null;

  const clientName = `${client.firstName || ''} ${client.lastName || ''}`.trim() || client.companyName || 'Client sans nom';
  const history = buildHistory();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* HEADER */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button onClick={() => navigate('/clients')} className="text-slate-400 hover:text-slate-600">
                <ChevronLeft size={24} />
              </button>
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 bg-cyan-100 rounded-full flex items-center justify-center">
                  {client.type === 'entreprise' ? (
                    <Building size={24} className="text-cyan-600" />
                  ) : (
                    <User size={24} className="text-cyan-600" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-2xl font-bold text-slate-900">{clientName}</h1>
                    {client.clientId && (
                      <span className="inline-flex items-center gap-1 text-xs font-mono font-semibold text-cyan-700 bg-cyan-50 px-2 py-1 rounded">
                        <Hash size={12} />
                        {client.clientId}
                      </span>
                    )}
                    <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium ${
                      client.status === 'active' ? 'bg-green-100 text-green-800' : 
                      client.status === 'archived' ? 'bg-slate-100 text-slate-600' : 
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {client.status === 'active' ? 'Actif' : client.status === 'archived' ? 'Archivé' : 'Inactif'}
                    </span>
                  </div>
                  {client.companyName && client.type === 'particulier' && (
                    <p className="text-sm text-slate-500">{client.companyName}</p>
                  )}
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              {hasPermission('quotes.create') && client.status !== 'archived' && (
                <button
                  onClick={() => navigate(`/quotes?clientId=${client.$id}`)}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700"
                >
                  <FileText size={16} />
                  Nouveau devis
                </button>
              )}
                           {hasPermission('clients.edit') && client.status !== 'archived' && (
                <button
                  onClick={() => navigate(`/clients?edit=${client.$id}`)}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
                >
                  <Edit2 size={16} />
                  Modifier
                </button>
                 )}
              {hasPermission('clients.delete') && client.status !== 'archived' ? (
                <button
                  onClick={handleArchive}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-orange-700 bg-orange-50 border border-orange-200 rounded-lg hover:bg-orange-100"
                >
                  <Archive size={16} />
                  Archiver
                </button>
              ) : hasPermission('clients.delete') && client.status === 'archived' ? (
                <button
                  onClick={handleUnarchive}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100"
                >
                  <RotateCcw size={16} />
                  Désarchiver
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow p-4 border-l-4 border-blue-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 uppercase font-semibold">Total facturé</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">{fm(totalInvoiced)}</p>
              </div>
              <Receipt size={24} className="text-blue-500" />
            </div>
            <p className="text-xs text-slate-500 mt-2">{invoices.length} facture(s)</p>
          </div>

          <div className="bg-white rounded-lg shadow p-4 border-l-4 border-green-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 uppercase font-semibold">Encaissé</p>
                <p className="text-2xl font-bold text-green-600 mt-1">{fm(totalPaid)}</p>
              </div>
              <CheckCircle2 size={24} className="text-green-500" />
            </div>
            <p className="text-xs text-slate-500 mt-2">
              {invoices.filter(i => i.status === 'paid').length} facture(s) payée(s)
            </p>
          </div>

          <div className="bg-white rounded-lg shadow p-4 border-l-4 border-red-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 uppercase font-semibold">Reste à payer</p>
                <p className="text-2xl font-bold text-red-600 mt-1">{fm(totalRemaining)}</p>
              </div>
              <AlertCircle size={24} className="text-red-500" />
            </div>
            <p className="text-xs text-slate-500 mt-2">
              {invoices.filter(i => i.status !== 'paid').length} facture(s) en attente
            </p>
          </div>

          <div className="bg-white rounded-lg shadow p-4 border-l-4 border-purple-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 uppercase font-semibold">Devis acceptés</p>
                <p className="text-2xl font-bold text-purple-600 mt-1">{acceptedQuotes}</p>
              </div>
              <TrendingUp size={24} className="text-purple-500" />
            </div>
            <p className="text-xs text-slate-500 mt-2">
              sur {quotes.length} devis total
            </p>
          </div>
        </div>

        {/* ONGLETS */}
        <div className="bg-white rounded-lg shadow">
          <div className="border-b border-slate-200">
            <nav className="flex -mb-px">
              <button
                onClick={() => setActiveTab('info')}
                className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'info' ? 'border-cyan-600 text-cyan-600' : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                <User className="inline mr-2" size={16} />
                Informations
              </button>
              <button
                onClick={() => setActiveTab('quotes')}
                className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'quotes' ? 'border-cyan-600 text-cyan-600' : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                <FileText className="inline mr-2" size={16} />
                Devis ({quotes.length})
              </button>
              <button
                onClick={() => setActiveTab('invoices')}
                className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'invoices' ? 'border-cyan-600 text-cyan-600' : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                <Receipt className="inline mr-2" size={16} />
                Factures ({invoices.length})
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'history' ? 'border-cyan-600 text-cyan-600' : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                <Clock className="inline mr-2" size={16} />
                Historique ({history.length})
              </button>
            </nav>
          </div>

          <div className="p-6">
            {/* ONGLET INFOS */}
            {activeTab === 'info' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-sm font-semibold text-slate-500 uppercase mb-3">Coordonnées</h3>
                  <div className="space-y-3">
                    {client.email && (
                      <div className="flex items-center gap-3 text-sm">
                        <Mail size={16} className="text-slate-400" />
                        <a href={`mailto:${client.email}`} className="text-cyan-600 hover:underline">{client.email}</a>
                      </div>
                    )}
                    {client.phone && (
                      <div className="flex items-center gap-3 text-sm">
                        <Phone size={16} className="text-slate-400" />
                        <a href={`tel:${client.phone}`} className="text-cyan-600 hover:underline">{client.phone}</a>
                      </div>
                    )}
                    {client.address && (
                      <div className="flex items-start gap-3 text-sm">
                        <MapPin size={16} className="text-slate-400 mt-0.5" />
                        <span className="text-slate-700">{client.address}</span>
                      </div>
                    )}
                    {client.billingAddress && client.billingAddress !== client.address && (
                      <div className="flex items-start gap-3 text-sm">
                        <Building size={16} className="text-slate-400 mt-0.5" />
                        <div>
                          <p className="text-xs text-slate-500 font-medium">Adresse de facturation</p>
                          <p className="text-slate-700">{client.billingAddress}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-slate-500 uppercase mb-3">Informations légales</h3>
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Type</span>
                      <span className="text-slate-900 font-medium">{client.type === 'entreprise' ? 'Entreprise' : 'Particulier'}</span>
                    </div>
                    {client.companyName && (
                      <div className="flex justify-between">
                        <span className="text-slate-500">Entreprise</span>
                        <span className="text-slate-900 font-medium">{client.companyName}</span>
                      </div>
                    )}
                    {client.taxNumber && (
                      <div className="flex justify-between">
                        <span className="text-slate-500">N° Fiscal / TVA</span>
                        <span className="text-slate-900 font-mono text-xs">{client.taxNumber}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-slate-500">Client depuis</span>
                      <span className="text-slate-900">
                        {client.$createdAt ? new Date(client.$createdAt).toLocaleDateString('fr-FR') : '-'}
                      </span>
                    </div>
                  </div>
                </div>

                {client.notes && (
                  <div className="md:col-span-2">
                    <h3 className="text-sm font-semibold text-slate-500 uppercase mb-3">Notes internes</h3>
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-sm text-slate-700 whitespace-pre-wrap">
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
                    <FileText size={48} className="mx-auto text-slate-300 mb-4" />
                    <p className="text-slate-500">Aucun devis pour ce client</p>
                    {hasPermission('quotes.create') && client.status !== 'archived' && (
                      <button
                        onClick={() => navigate(`/quotes?clientId=${client.$id}`)}
                        className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700"
                      >
                        <FileText size={16} />
                        Créer un devis
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-slate-50 border-b">
                        <tr>
                          <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500 uppercase">N°</th>
                          <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500 uppercase">Objet</th>
                          <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500 uppercase">Date</th>
                          <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500 uppercase">Total</th>
                          <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500 uppercase">Statut</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {quotes.map(q => (
                          <tr key={q.$id} className="hover:bg-slate-50">
                            <td className="px-4 py-3 text-sm font-medium text-slate-900">{q.quoteNumber}</td>
                            <td className="px-4 py-3 text-sm text-slate-600">{q.subject || '-'}</td>
                            <td className="px-4 py-3 text-sm text-slate-600">{q.issueDate || '-'}</td>
                            <td className="px-4 py-3 text-sm font-semibold">{fm(q.total)}</td>
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
                    <Receipt size={48} className="mx-auto text-slate-300 mb-4" />
                    <p className="text-slate-500">Aucune facture pour ce client</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-slate-50 border-b">
                        <tr>
                          <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500 uppercase">N°</th>
                          <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500 uppercase">Date</th>
                          <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500 uppercase">Échéance</th>
                          <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500 uppercase">Total</th>
                          <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500 uppercase">Statut</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {invoices.map(inv => (
                          <tr key={inv.$id} className="hover:bg-slate-50">
                            <td className="px-4 py-3 text-sm font-medium text-slate-900">{inv.invoiceNumber}</td>
                            <td className="px-4 py-3 text-sm text-slate-600">{inv.issueDate || '-'}</td>
                            <td className="px-4 py-3 text-sm text-slate-600">{inv.dueDate || '-'}</td>
                            <td className="px-4 py-3 text-sm font-semibold">{fm(inv.total)}</td>
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
                    <Clock size={48} className="mx-auto text-slate-300 mb-4" />
                    <p className="text-slate-500">Aucun historique pour ce client</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {history.map((item, idx) => (
                      <div key={idx} className="flex items-start gap-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                          item.type === 'quote' ? 'bg-green-100' : 'bg-purple-100'
                        }`}>
                          {item.type === 'quote' ? (
                            <FileText size={18} className="text-green-600" />
                          ) : (
                            <Receipt size={18} className="text-purple-600" />
                          )}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <p className="font-medium text-slate-900">{item.title}</p>
                            <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium ${statusColors[item.status] || 'bg-gray-100 text-gray-800'}`}>
                              {item.type === 'quote' ? (quoteStatusLabels[item.status] || item.status) : (invoiceStatusLabels[item.status] || item.status)}
                            </span>
                          </div>
                          {item.subtitle && <p className="text-sm text-slate-600 mt-1">{item.subtitle}</p>}
                          <div className="flex items-center justify-between mt-2">
                            <p className="text-xs text-slate-500 flex items-center gap-1">
                              <Calendar size={12} />
                              {item.date ? new Date(item.date).toLocaleDateString('fr-FR') : '-'}
                            </p>
                            <p className="text-sm font-semibold text-slate-900">{fm(item.amount)}</p>
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