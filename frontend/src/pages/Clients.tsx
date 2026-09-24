import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { databases, DATABASE_ID } from '../appwrite';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import {
  Plus, Search, Edit2, X, Phone, Mail, Building, ChevronLeft,
  UserCheck, Filter, FileText, AlertCircle, Archive, RotateCcw, Hash, Eye
} from 'lucide-react';
import { Query, ID, Permission, Role } from 'appwrite'; // ✅ Permission et Role ajoutés

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
  active: 'bg-green-100 text-green-800',
  inactive: 'bg-gray-100 text-gray-800',
  archived: 'bg-slate-100 text-slate-600'
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

    // ✅ VÉRIFICATION DE SÉCURITÉ
    console.log("🔍 DEBUG Clients - secureTeamId:", user?.secureTeamId);
    
    if (!editingId && !duplicateFound) {
      const existing = await checkDuplicate();
      if (existing) { setDuplicateFound(existing as unknown as Client); return; }
    }

    setSaving(true);
    try {
      const data: any = { ...form, teamId: currentTeamId, userId: user.$id };
      
      if (!editingId) {
        data.clientId = await getNextClientNumber();
        console.log('✅ Numéro client généré:', data.clientId);
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
        // ✅ SÉCURITÉ MAXIMALE : Utilisation du secureTeamId avec fallback
        let perms: string[] = [];
        
        if (user?.secureTeamId) {
          console.log("✅ Clients: Utilisation de la sécurité maximale (secureTeamId)");
          perms = [
            Permission.read(Role.team(user.secureTeamId)),
            Permission.update(Role.team(user.secureTeamId)),
            Permission.delete(Role.team(user.secureTeamId))
          ];
        } else {
          console.warn("⚠️ Clients: secureTeamId manquant, fallback Role.users()");
          perms = [
            Permission.read(Role.users()),
            Permission.update(Role.users()),
            Permission.delete(Role.users())
          ];
        }

        console.log("🚀 Clients: Envoi avec permissions:", perms);

        await databases.createDocument(
          DATABASE_ID, 
          'clients', 
          ID.unique(), 
          data,
          perms
        );
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
    if (!confirm(`Archiver le client "${name}" ?\nIl sera masqué de la liste principale mais son historique (devis, factures) sera conservé.`)) return;
    
    try {
      const doc = await databases.getDocument(DATABASE_ID, 'clients', id);
      if (doc.teamId !== currentTeamId) {
        alert('⚠️ Accès refusé : Ce client n\'appartient pas à votre équipe.');
        return;
      }
      
      await databases.updateDocument(DATABASE_ID, 'clients', id, { status: 'archived' });
      await loadClients();
    } catch (error: any) {
      alert(`Erreur : ${error.message}`);
    }
  };

  const handleUnarchive = async (id: string, name: string) => {
    try {
      const doc = await databases.getDocument(DATABASE_ID, 'clients', id);
      if (doc.teamId !== currentTeamId) {
        alert('⚠️ Accès refusé : Ce client n\'appartient pas à votre équipe.');
        return;
      }
      
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

  if (permLoading) return <div className="min-h-screen flex items-center justify-center bg-gray-50">Vérification des droits...</div>;
  if (!hasPermission('clients.view')) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-4">
            <button onClick={() => navigate('/dashboard')} className="text-slate-400 hover:text-slate-600"><ChevronLeft size={24} /></button>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 flex items-center"><UserCheck size={24} className="mr-2 text-cyan-600" />Clients</h1>
              <p className="text-sm text-slate-500">{filtered.length} client(s) {viewMode === 'active' ? 'actif(s)' : 'archivé(s)'}</p>
            </div>
          </div>
          {viewMode === 'active' && hasPermission('clients.create') && (
            <button onClick={handleOpenAdd} className="flex items-center space-x-2 bg-cyan-600 text-white px-4 py-2.5 rounded-lg hover:bg-cyan-700 transition-colors font-medium text-sm">
              <Plus size={18} /><span>Nouveau client</span>
            </button>
          )}
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex border-b border-slate-200 mb-6">
          <button onClick={() => setViewMode('active')} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${viewMode === 'active' ? 'border-cyan-600 text-cyan-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            Actifs ({clients.filter(c => c.status !== 'archived').length})
          </button>
          <button onClick={() => setViewMode('archived')} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${viewMode === 'archived' ? 'border-cyan-600 text-cyan-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            Archivés ({clients.filter(c => c.status === 'archived').length})
          </button>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="text" placeholder="Rechercher un client (nom, email, n° client...)" value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-cyan-500 outline-none text-sm" />
          </div>
          {viewMode === 'active' && (
            <>
              <div className="relative">
                <Filter size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-cyan-500 outline-none text-sm bg-white">
                  <option value="all">Tous les statuts</option>
                  <option value="active">Actif</option>
                  <option value="inactive">Inactif</option>
                </select>
              </div>
              <div className="relative">
                <Filter size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-cyan-500 outline-none text-sm bg-white">
                  <option value="all">Tous les types</option>
                  <option value="particulier">Particulier</option>
                  <option value="entreprise">Entreprise</option>
                </select>
              </div>
            </>
          )}
        </div>

        {loading ? (
          <div className="text-center py-12 text-slate-500">Chargement...</div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <UserCheck size={48} className="mx-auto text-slate-300 mb-4" />
            <h3 className="text-lg font-semibold text-slate-700 mb-2">Aucun client {viewMode === 'active' ? 'actif' : 'archivé'}</h3>
            {viewMode === 'active' && hasPermission('clients.create') && (
              <button onClick={handleOpenAdd} className="inline-flex items-center space-x-2 bg-cyan-600 text-white px-4 py-2 rounded-lg hover:bg-cyan-700 text-sm mt-4">
                <Plus size={16} /><span>Ajouter un client</span>
              </button>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase">N° Client</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Nom / Entreprise</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Contact</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Type</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Statut</th>
                    <th className="text-right px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((c) => (
                    <tr key={c.$id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-1 text-xs font-mono font-semibold text-cyan-700 bg-cyan-50 px-2 py-1 rounded">
                          <Hash size={12} />
                          {c.clientId || '—'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-medium text-slate-900">{c.firstName} {c.lastName}</div>
                        {c.companyName && <div className="text-sm text-slate-500 flex items-center gap-1"><Building size={12} /> {c.companyName}</div>}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col space-y-1">
                          {c.email && <span className="flex items-center text-sm text-slate-600"><Mail size={14} className="mr-1 text-slate-400" />{c.email}</span>}
                          {c.phone && <span className="flex items-center text-sm text-slate-600"><Phone size={14} className="mr-1 text-slate-400" />{c.phone}</span>}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">{typeLabels[c.type] || c.type}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium ${statusColors[c.status] || 'bg-gray-100 text-gray-800'}`}>{statusLabels[c.status] || c.status}</span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end space-x-2">
                          {viewMode === 'active' ? (
                            <>
                              <button 
                                onClick={() => navigate(`/clients/${c.$id}`)} 
                                className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" 
                                title="Voir la fiche détaillée"
                              >
                                <Eye size={16} />
                              </button>
                              
                              {hasPermission('quotes.create') && (
                                <button onClick={() => navigate(`/quotes?clientId=${c.$id}`)} className="p-2 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors" title="Créer un devis">
                                  <FileText size={16} />
                                </button>
                              )}
                              {hasPermission('clients.edit') && (
                                <button onClick={() => handleOpenEdit(c)} className="p-2 text-slate-400 hover:text-cyan-600 hover:bg-cyan-50 rounded-lg transition-colors" title="Modifier">
                                  <Edit2 size={16} />
                                </button>
                              )}
                              {hasPermission('clients.delete') && (
                                <button onClick={() => handleArchive(c.$id, `${c.firstName} ${c.lastName}`)} className="p-2 text-slate-400 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors" title="Archiver">
                                  <Archive size={16} />
                                </button>
                              )}
                            </>
                          ) : (
                            <button onClick={() => handleUnarchive(c.$id, `${c.firstName} ${c.lastName}`)} className="inline-flex items-center space-x-1 px-3 py-1.5 text-sm font-medium text-green-700 bg-green-50 rounded-lg hover:bg-green-100 transition-colors" title="Désarchiver">
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
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-xl font-bold text-slate-900">{editingId ? 'Modifier le client' : 'Nouveau client'}</h2>
              <button onClick={() => { setShowModal(false); setDuplicateFound(null); }} className="p-2 hover:bg-slate-100 rounded-lg"><X size={20} className="text-slate-500" /></button>
            </div>
            <div className="px-6 py-4 space-y-4">
              {duplicateFound && !editingId && (
                <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded-lg">
                  <p className="font-semibold flex items-center gap-2 text-sm"><AlertCircle size={16} /> Doublon détecté</p>
                  <p className="text-sm mt-1">Un client avec ces coordonnées existe déjà.</p>
                  <div className="flex gap-2 mt-3">
                    <button type="button" onClick={() => { handleOpenEdit(duplicateFound); }} className="px-3 py-1.5 bg-cyan-600 text-white text-xs font-medium rounded hover:bg-cyan-700">Mettre à jour</button>
                    <button type="button" onClick={() => setDuplicateFound(null)} className="px-3 py-1.5 bg-slate-200 text-slate-700 text-xs font-medium rounded hover:bg-slate-300">Créer quand même</button>
                  </div>
                </div>
              )}

              {!editingId && (
                <div className="bg-cyan-50 border border-cyan-200 rounded-lg p-3 flex items-center gap-2">
                  <Hash size={16} className="text-cyan-600" />
                  <div>
                    <p className="text-xs text-cyan-700 font-medium">Numéro client</p>
                    <p className="text-sm font-mono font-semibold text-cyan-900">Attribué automatiquement à l'enregistrement</p>
                  </div>
                </div>
              )}
              {editingId && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Hash size={16} className="text-slate-500" />
                    <div>
                      <p className="text-xs text-slate-500 font-medium">Numéro client</p>
                      <p className="text-sm font-mono font-semibold text-slate-900">
                        {clients.find(c => c.$id === editingId)?.clientId || 'Non attribué'}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Type</label>
                  <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white">
                    <option value="particulier">Particulier</option><option value="entreprise">Entreprise</option>
                  </select>
                </div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Statut</label>
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white">
                    {Object.entries(statusLabels).filter(([k]) => k !== 'archived').map(([key, label]) => (<option key={key} value={key}>{label}</option>))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Prénom</label><input type="text" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm" placeholder="Jean" /></div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Nom</label><input type="text" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm" placeholder="Dupont" /></div>
              </div>
              <div><label className="block text-sm font-medium text-slate-700 mb-1">Entreprise</label><input type="text" value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm" placeholder="Dupont Plomberie" /></div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Email</label><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm" placeholder="jean@dupont.fr" /></div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Téléphone</label><input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm" placeholder="06 12 34 56 78" /></div>
              </div>
              <div><label className="block text-sm font-medium text-slate-700 mb-1">Adresse</label><input type="text" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm" placeholder="123 rue de la Paix, 75000 Paris" /></div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Adresse de facturation</label><input type="text" value={form.billingAddress} onChange={(e) => setForm({ ...form, billingAddress: e.target.value })} className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm" placeholder="Adresse de facturation" /></div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Numéro fiscal / TVA</label><input type="text" value={form.taxNumber} onChange={(e) => setForm({ ...form, taxNumber: e.target.value })} className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm" placeholder="FR12345678901" /></div>
              </div>
              <div><label className="block text-sm font-medium text-slate-700 mb-1">Notes</label><textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm" placeholder="Notes internes..." /></div>
            </div>
            <div className="flex items-center justify-end space-x-3 px-6 py-4 border-t bg-slate-50 rounded-b-xl">
              <button onClick={() => { setShowModal(false); setDuplicateFound(null); }} className="px-4 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50">Annuler</button>
              <button onClick={handleSave} disabled={saving || (!form.firstName && !form.lastName && !form.companyName)} className="px-4 py-2.5 text-sm font-semibold text-white bg-cyan-600 rounded-lg hover:bg-cyan-700 disabled:opacity-50">{saving ? 'Enregistrement...' : editingId ? 'Mettre à jour' : 'Ajouter'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}