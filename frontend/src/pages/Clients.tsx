import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { databases, DATABASE_ID } from '../appwrite';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import Sidebar from '../components/Sidebar';
import {
  Plus, Search, Edit2, X, Phone, Mail, Building,
  UserCheck, Filter, FileText, AlertCircle, Archive, RotateCcw, Hash, Eye
} from 'lucide-react';
import { Query, ID, Permission, Role } from 'appwrite';

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

const statusColors: Record<string, string> = {
  active: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  inactive: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
  archived: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
};

const statusLabels: Record<string, string> = {
  active: 'Actif',
  inactive: 'Inactif',
  archived: 'Archivé'
};

const typeLabels: Record<string, string> = {
  particulier: 'Particulier',
  entreprise: 'Entreprise'
};

const emptyForm = {
  type: 'particulier',
  firstName: '',
  lastName: '',
  companyName: '',
  email: '',
  phone: '',
  address: '',
  billingAddress: '',
  taxNumber: '',
  notes: '',
  status: 'active'
};

export default function Clients() {
  const { user } = useAuth();
  const { hasPermission, loading: permLoading } = usePermissions();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [saving, setSaving] = useState(false);
  const [duplicateFound, setDuplicateFound] = useState<Client | null>(null);
  const [currentTeamId, setCurrentTeamId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'active' | 'archived'>('active');

  useEffect(() => {
    if (!permLoading && !hasPermission('clients.view')) {
      navigate('/dashboard');
    }
  }, [permLoading, hasPermission, navigate]);

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    loadClients();
  }, [user, viewMode]);

  useEffect(() => {
    const editId = searchParams.get('edit');
    if (editId && clients.length > 0 && !showModal) {
      const clientToEdit = clients.find(c => c.$id === editId);
      if (clientToEdit) {
        if (clientToEdit.teamId !== currentTeamId) {
          alert('⚠️ Accès refusé : Ce client n\'appartient pas à votre équipe.');
          setSearchParams({}, { replace: true });
          return;
        }
        setEditingId(clientToEdit.$id);
        setDuplicateFound(null);
        setForm({
          type: clientToEdit.type || 'particulier',
          firstName: clientToEdit.firstName || '',
          lastName: clientToEdit.lastName || '',
          companyName: clientToEdit.companyName || '',
          email: clientToEdit.email || '',
          phone: clientToEdit.phone || '',
          address: clientToEdit.address || '',
          billingAddress: clientToEdit.billingAddress || '',
          taxNumber: clientToEdit.taxNumber || '',
          notes: clientToEdit.notes || '',
          status: clientToEdit.status || 'active'
        });
        setShowModal(true);
        setSearchParams({}, { replace: true });
      }
    }
  }, [searchParams, clients, showModal, currentTeamId]);

  const loadClients = async () => {
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

      const response = await databases.listDocuments(
        DATABASE_ID, 'clients',
        [Query.equal('teamId', teamId), Query.orderDesc('$createdAt'), Query.limit(2000)]
      );
      setClients(response.documents as unknown as Client[]);
    } catch (error) {
      console.error('Erreur chargement clients:', error);
    } finally {
      setLoading(false);
    }
  };

  const getNextClientNumber = async (): Promise<string> => {
    if (!currentTeamId) return `CLI-${new Date().getFullYear()}-001`;
    const currentYear = new Date().getFullYear();
    const prefix = `CLI-${currentYear}-`;
    let maxNum = 0;
    try {
      const response = await databases.listDocuments(
        DATABASE_ID, 'clients',
        [Query.equal('teamId', currentTeamId), Query.limit(2000)]
      );
      response.documents.forEach((doc: any) => {
        if (doc.clientId && doc.clientId.startsWith(prefix)) {
          const num = parseInt(doc.clientId.replace(prefix, ''), 10);
          if (!isNaN(num) && num > maxNum) maxNum = num;
        }
      });
    } catch (e) {
      console.error('Erreur génération numéro client:', e);
    }
    return `${prefix}${String(maxNum + 1).padStart(3, '0')}`;
  };

  const checkDuplicate = async () => {
    if (!form.email && !form.phone) return null;
    if (!currentTeamId) return null;
    try {
      const response = await databases.listDocuments(DATABASE_ID, 'clients', [Query.equal('teamId', currentTeamId)]);
      return response.documents.find((p: any) => (form.email && p.email === form.email) || (form.phone && p.phone === form.phone)) || null;
    } catch (error) {
      return null;
    }
  };

  const handleOpenAdd = () => {
    setEditingId(null);
    setDuplicateFound(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const handleOpenEdit = (client: Client) => {
    if (client.teamId !== currentTeamId) {
      alert('⚠️ Accès refusé : Ce client n\'appartient pas à votre équipe.');
      return;
    }
    setEditingId(client.$id);
    setDuplicateFound(null);
    setForm({
      type: client.type || 'particulier',
      firstName: client.firstName || '',
      lastName: client.lastName || '',
      companyName: client.companyName || '',
      email: client.email || '',
      phone: client.phone || '',
      address: client.address || '',
      billingAddress: client.billingAddress || '',
      taxNumber: client.taxNumber || '',
      notes: client.notes || '',
      status: client.status || 'active'
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.firstName && !form.lastName && !form.companyName) {
      alert('Veuillez remplir au moins le nom, le prénom ou le nom de l\'entreprise.');
      return;
    }
    if (!currentTeamId) return;

    if (!editingId && !duplicateFound) {
      const existing = await checkDuplicate();
      if (existing) { setDuplicateFound(existing as unknown as Client); return; }
    }

    setSaving(true);
    try {
      const data: any = { ...form, teamId: currentTeamId, userId: user.$id };
      
      if (!editingId) {
        data.clientId = await getNextClientNumber();
      } else {
        const existingDoc = await databases.getDocument(DATABASE_ID, 'clients', editingId);
        if (existingDoc.teamId !== currentTeamId) {
          alert('⚠️ Accès refusé : Ce client n\'appartient pas à votre équipe.');
          setSaving(false);
          return;
        }
      }
      
      if (editingId) {
        await databases.updateDocument(DATABASE_ID, 'clients', editingId, data);
      } else {
        let perms: string[] = [];
        if (user?.secureTeamId) {
          perms = [
            Permission.read(Role.team(user.secureTeamId)),
            Permission.update(Role.team(user.secureTeamId)),
            Permission.delete(Role.team(user.secureTeamId))
          ];
        } else {
          perms = [
            Permission.read(Role.users()),
            Permission.update(Role.users()),
            Permission.delete(Role.users())
          ];
        }
        await databases.createDocument(DATABASE_ID, 'clients', ID.unique(), data, perms);
      }
      setShowModal(false);
      setDuplicateFound(null);
      await loadClients();
    } catch (error: any) {
      alert(`Erreur : ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async (id: string, name: string) => {
    if (!confirm(`Archiver le client "${name}" ?\nIl sera masqué de la liste principale mais son historique sera conservé.`)) return;
    try {
      const doc = await databases.getDocument(DATABASE_ID, 'clients', id);
      if (doc.teamId !== currentTeamId) { alert('⚠️ Accès refusé'); return; }
      await databases.updateDocument(DATABASE_ID, 'clients', id, { status: 'archived' });
      await loadClients();
    } catch (error: any) {
      alert(`Erreur : ${error.message}`);
    }
  };

  const handleUnarchive = async (id: string, name: string) => {
    try {
      const doc = await databases.getDocument(DATABASE_ID, 'clients', id);
      if (doc.teamId !== currentTeamId) { alert('⚠️ Accès refusé'); return; }
      await databases.updateDocument(DATABASE_ID, 'clients', id, { status: 'active' });
      await loadClients();
      setViewMode('active');
    } catch (error: any) {
      alert(`Erreur : ${error.message}`);
    }
  };

  const filtered = clients.filter(c => {
    const matchSearch = search === '' || `${c.firstName} ${c.lastName} ${c.companyName} ${c.email} ${c.phone} ${c.clientId || ''}`.toLowerCase().includes(search.toLowerCase());
    const matchType = filterType === 'all' || c.type === filterType;
    const matchStatus = viewMode === 'archived' || filterStatus === 'all' || c.status === filterStatus;
    const matchView = viewMode === 'active' ? c.status !== 'archived' : c.status === 'archived';
    return matchSearch && matchType && matchStatus && matchView;
  });

  if (permLoading) return <Sidebar><div className="flex items-center justify-center h-full w-full"><div className="text-slate-500 dark:text-slate-400 text-lg animate-pulse">Vérification des droits...</div></div></Sidebar>;
  if (!hasPermission('clients.view')) return null;

  return (
    <Sidebar>
      <div className="min-h-full bg-slate-50 dark:bg-slate-900">
        {/* HEADER STICKY */}
        <header className="bg-white dark:bg-slate-800 shadow-sm border-b border-slate-200 dark:border-slate-700 sticky top-0 z-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-3">
                <div>
                  <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <UserCheck size={24} className="text-purple-600" />
                    Clients
                  </h1>
                  <p className="text-sm text-slate-500 dark:text-slate-400">{filtered.length} résultat(s) {viewMode === 'active' ? 'actif(s)' : 'archivé(s)'}</p>
                </div>
              </div>
              {viewMode === 'active' && hasPermission('clients.create') && (
                <button onClick={handleOpenAdd} className="w-full sm:w-auto flex items-center justify-center gap-2 bg-purple-600 text-white px-4 py-2.5 rounded-lg hover:bg-purple-700 transition-colors font-medium text-sm shadow-sm active:scale-95">
                  <Plus size={18} /><span>Nouveau client</span>
                </button>
              )}
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {/* ONGLETS */}
          <div className="flex border-b border-slate-200 dark:border-slate-700 mb-6">
            <button onClick={() => setViewMode('active')} className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${viewMode === 'active' ? 'border-purple-600 text-purple-600 dark:text-purple-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}>
              Actifs ({clients.filter(c => c.status !== 'archived').length})
            </button>
            <button onClick={() => setViewMode('archived')} className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${viewMode === 'archived' ? 'border-purple-600 text-purple-600 dark:text-purple-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}>
              Archivés ({clients.filter(c => c.status === 'archived').length})
            </button>
          </div>

          {/* BARRE DE RECHERCHE ET FILTRES */}
          <div className="flex flex-col sm:flex-row gap-3 mb-6">
            <div className="relative flex-1">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="text" placeholder="Rechercher (nom, entreprise, n° client...)" value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-3 border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white rounded-lg focus:ring-2 focus:ring-purple-500 outline-none text-sm transition-shadow" />
            </div>
            {viewMode === 'active' && (
              <div className="flex gap-3">
                <div className="relative sm:w-40 flex-1">
                  <Filter size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="w-full pl-10 pr-4 py-3 border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white rounded-lg focus:ring-2 focus:ring-purple-500 outline-none text-sm bg-white dark:bg-slate-800 appearance-none">
                    <option value="all">Tous statuts</option>
                    <option value="active">Actif</option>
                    <option value="inactive">Inactif</option>
                  </select>
                </div>
                <div className="relative sm:w-40 flex-1">
                  <Filter size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="w-full pl-10 pr-4 py-3 border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white rounded-lg focus:ring-2 focus:ring-purple-500 outline-none text-sm bg-white dark:bg-slate-800 appearance-none">
                    <option value="all">Tous types</option>
                    <option value="particulier">Particulier</option>
                    <option value="entreprise">Entreprise</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* CONTENU : TABLEAU DESKTOP / CARTES MOBILE */}
          {loading ? (
            <div className="text-center py-12 text-slate-500 dark:text-slate-400 animate-pulse">Chargement des données...</div>
          ) : filtered.length === 0 ? (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-12 text-center shadow-sm">
              <UserCheck size={48} className="mx-auto text-slate-300 dark:text-slate-600 mb-4" />
              <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-2">Aucun client {viewMode === 'active' ? 'actif' : 'archivé'}</h3>
              {viewMode === 'active' && hasPermission('clients.create') && (
                <button onClick={handleOpenAdd} className="inline-flex items-center gap-2 bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 text-sm mt-4 active:scale-95 transition-transform">
                  <Plus size={16} /><span>Ajouter un client</span>
                </button>
              )}
            </div>
          ) : (
            <>
              {/* VERSION DESKTOP (Tableau) */}
              <div className="hidden md:block bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700">
                      <tr>
                        <th className="text-left px-6 py-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">N° Client</th>
                        <th className="text-left px-6 py-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Nom / Entreprise</th>
                        <th className="text-left px-6 py-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Contact</th>
                        <th className="text-left px-6 py-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Type</th>
                        <th className="text-left px-6 py-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Statut</th>
                        <th className="text-right px-6 py-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                      {filtered.map((c) => (
                        <tr key={c.$id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                          <td className="px-6 py-4">
                            <span className="inline-flex items-center gap-1 text-xs font-mono font-semibold text-purple-700 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/30 px-2 py-1 rounded">
                              <Hash size={12} />
                              {c.clientId || '—'}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="font-medium text-slate-900 dark:text-white">{c.firstName} {c.lastName}</div>
                            {c.companyName && <div className="text-sm text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-1"><Building size={12} /> {c.companyName}</div>}
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-col space-y-1.5">
                              {c.email && <span className="flex items-center text-sm text-slate-600 dark:text-slate-300"><Mail size={14} className="mr-2 text-slate-400" />{c.email}</span>}
                              {c.phone && <span className="flex items-center text-sm text-slate-600 dark:text-slate-300"><Phone size={14} className="mr-2 text-slate-400" />{c.phone}</span>}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-300">{typeLabels[c.type] || c.type}</td>
                          <td className="px-6 py-4">
                            <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium ${statusColors[c.status]}`}>{statusLabels[c.status] || c.status}</span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              {viewMode === 'active' ? (
                                <>
                                  <button onClick={() => navigate(`/clients/${c.$id}`)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors" title="Voir la fiche"><Eye size={16} /></button>
                                  {hasPermission('quotes.create') && (
                                    <button onClick={() => navigate(`/quotes?clientId=${c.$id}`)} className="p-2 text-slate-400 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30 rounded-lg transition-colors" title="Créer un devis"><FileText size={16} /></button>
                                  )}
                                  {hasPermission('clients.edit') && (
                                    <button onClick={() => handleOpenEdit(c)} className="p-2 text-slate-400 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/30 rounded-lg transition-colors" title="Modifier"><Edit2 size={16} /></button>
                                  )}
                                  {hasPermission('clients.delete') && (
                                    <button onClick={() => handleArchive(c.$id, `${c.firstName} ${c.lastName}`)} className="p-2 text-slate-400 hover:text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/30 rounded-lg transition-colors" title="Archiver"><Archive size={16} /></button>
                                  )}
                                </>
                              ) : (
                                <button onClick={() => handleUnarchive(c.$id, `${c.firstName} ${c.lastName}`)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/30 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/50 transition-colors">
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

              {/* VERSION MOBILE (Cartes) */}
              <div className="md:hidden space-y-4">
                {filtered.map((c) => (
                  <div key={c.$id} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 shadow-sm">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h3 className="font-semibold text-slate-900 dark:text-white">{c.firstName} {c.lastName}</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400">{c.companyName || 'Particulier'}</p>
                        <span className="inline-flex items-center gap-1 text-[10px] font-mono font-semibold text-purple-700 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/30 px-1.5 py-0.5 rounded mt-1">
                          <Hash size={10} /> {c.clientId || 'N/A'}
                        </span>
                      </div>
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusColors[c.status]}`}>
                        {statusLabels[c.status]}
                      </span>
                    </div>
                    
                    <div className="space-y-2 mb-4 text-sm">
                      {c.phone && <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300"><Phone size={14} className="text-slate-400" /> {c.phone}</div>}
                      {c.email && <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300"><Mail size={14} className="text-slate-400" /> {c.email}</div>}
                      <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                        <Building size={14} className="text-slate-400" /> {typeLabels[c.type] || c.type}
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-100 dark:border-slate-700">
                      {viewMode === 'active' ? (
                        <div className="grid grid-cols-4 gap-2">
                          <button onClick={() => navigate(`/clients/${c.$id}`)} className="flex flex-col items-center justify-center p-2 text-blue-600 bg-blue-50 dark:bg-blue-900/30 rounded-lg active:scale-95 transition-transform">
                            <Eye size={18} />
                            <span className="text-[10px] mt-1 font-medium">Voir</span>
                          </button>
                          {hasPermission('quotes.create') && (
                            <button onClick={() => navigate(`/quotes?clientId=${c.$id}`)} className="flex flex-col items-center justify-center p-2 text-green-600 bg-green-50 dark:bg-green-900/30 rounded-lg active:scale-95 transition-transform">
                              <FileText size={18} />
                              <span className="text-[10px] mt-1 font-medium">Devis</span>
                            </button>
                          )}
                          {hasPermission('clients.edit') && (
                            <button onClick={() => handleOpenEdit(c)} className="flex flex-col items-center justify-center p-2 text-purple-600 bg-purple-50 dark:bg-purple-900/30 rounded-lg active:scale-95 transition-transform">
                              <Edit2 size={18} />
                              <span className="text-[10px] mt-1 font-medium">Modifier</span>
                            </button>
                          )}
                          {hasPermission('clients.delete') && (
                            <button onClick={() => handleArchive(c.$id, `${c.firstName} ${c.lastName}`)} className="flex flex-col items-center justify-center p-2 text-orange-600 bg-orange-50 dark:bg-orange-900/30 rounded-lg active:scale-95 transition-transform">
                              <Archive size={18} />
                              <span className="text-[10px] mt-1 font-medium">Archiver</span>
                            </button>
                          )}
                        </div>
                      ) : (
                        <button onClick={() => handleUnarchive(c.$id, `${c.firstName} ${c.lastName}`)} className="w-full flex items-center justify-center gap-2 p-3 text-sm font-medium text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/30 rounded-lg active:scale-95 transition-transform">
                          <RotateCcw size={16} /><span>Désarchiver</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </main>

        {/* MODAL OPTIMISÉE MOBILE */}
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4 animate-fadeIn">
            <div className="bg-white dark:bg-slate-800 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto animate-slideUp">
              <div className="sticky top-0 bg-white dark:bg-slate-800 z-10 flex items-center justify-between px-4 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-700">
                <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">{editingId ? 'Modifier le client' : 'Nouveau client'}</h2>
                <button onClick={() => { setShowModal(false); setDuplicateFound(null); }} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors">
                  <X size={20} className="text-slate-500 dark:text-slate-400" />
                </button>
              </div>
              
              <div className="px-4 sm:px-6 py-4 space-y-4">
                {duplicateFound && !editingId && (
                  <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 text-yellow-800 dark:text-yellow-200 px-4 py-3 rounded-lg">
                    <p className="font-semibold flex items-center gap-2 text-sm"><AlertCircle size={16} /> Doublon détecté</p>
                    <p className="text-sm mt-1">Un client avec ces coordonnées existe déjà.</p>
                    <div className="flex gap-2 mt-3">
                      <button type="button" onClick={() => { handleOpenEdit(duplicateFound); }} className="px-3 py-2 bg-purple-600 text-white text-xs font-medium rounded hover:bg-purple-700 active:scale-95 transition-transform">Mettre à jour</button>
                      <button type="button" onClick={() => setDuplicateFound(null)} className="px-3 py-2 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-medium rounded hover:bg-slate-300 dark:hover:bg-slate-600 active:scale-95 transition-transform">Créer quand même</button>
                    </div>
                  </div>
                )}

                {!editingId && (
                  <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-3 flex items-center gap-2">
                    <Hash size={16} className="text-purple-600 dark:text-purple-400" />
                    <div>
                      <p className="text-xs text-purple-700 dark:text-purple-300 font-medium">Numéro client</p>
                      <p className="text-sm font-mono font-semibold text-purple-900 dark:text-purple-100">Attribué automatiquement à l'enregistrement</p>
                    </div>
                  </div>
                )}
                {editingId && (
                  <div className="bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg p-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Hash size={16} className="text-slate-500 dark:text-slate-400" />
                      <div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Numéro client</p>
                        <p className="text-sm font-mono font-semibold text-slate-900 dark:text-white">
                          {clients.find(c => c.$id === editingId)?.clientId || 'Non attribué'}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Type</label>
                    <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="w-full px-3 py-3 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none bg-white dark:bg-slate-700">
                      <option value="particulier">Particulier</option>
                      <option value="entreprise">Entreprise</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Statut</label>
                    <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-full px-3 py-3 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none bg-white dark:bg-slate-700">
                      {Object.entries(statusLabels).filter(([k]) => k !== 'archived').map(([key, label]) => (<option key={key} value={key}>{label}</option>))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Prénom</label>
                    <input type="text" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} className="w-full px-3 py-3 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none" placeholder="Jean" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Nom</label>
                    <input type="text" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} className="w-full px-3 py-3 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none" placeholder="Dupont" />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5"><Building size={14} />Entreprise</label>
                  <input type="text" value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} className="w-full px-3 py-3 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none" placeholder="Dupont Plomberie" />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5"><Mail size={14} />Email</label>
                    <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full px-3 py-3 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none" placeholder="jean@dupont.fr" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5"><Phone size={14} />Téléphone</label>
                    <input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full px-3 py-3 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none" placeholder="06 12 34 56 78" />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Adresse</label>
                  <input type="text" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="w-full px-3 py-3 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none" placeholder="123 rue de la Paix, 75000 Paris" />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Adresse de facturation</label>
                    <input type="text" value={form.billingAddress} onChange={(e) => setForm({ ...form, billingAddress: e.target.value })} className="w-full px-3 py-3 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none" placeholder="Adresse de facturation" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Numéro fiscal / TVA</label>
                    <input type="text" value={form.taxNumber} onChange={(e) => setForm({ ...form, taxNumber: e.target.value })} className="w-full px-3 py-3 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none" placeholder="FR12345678901" />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Notes</label>
                  <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} className="w-full px-3 py-3 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none resize-none" placeholder="Notes internes..." />
                </div>
              </div>

              <div className="sticky bottom-0 bg-slate-50 dark:bg-slate-800/90 backdrop-blur-sm flex items-center justify-end gap-3 px-4 sm:px-6 py-4 border-t border-slate-200 dark:border-slate-700 rounded-b-2xl">
                <button onClick={() => { setShowModal(false); setDuplicateFound(null); }} className="flex-1 sm:flex-none px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600 active:scale-95 transition-all">Annuler</button>
                <button onClick={handleSave} disabled={saving || (!form.firstName && !form.lastName && !form.companyName)} className="flex-1 sm:flex-none px-4 py-3 text-sm font-semibold text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 transition-all">
                  {saving ? 'Enregistrement...' : (editingId ? 'Mettre à jour' : 'Ajouter')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Sidebar>
  );
}