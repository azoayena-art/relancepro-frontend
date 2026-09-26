import Sidebar from '../components/Sidebar';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { databases, DATABASE_ID } from '../appwrite';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import {
  Plus, Search, Edit2, X, Phone, Mail, Building, FileText,
  Users, Filter, AlertCircle, UserCheck, Archive, RotateCcw,
  CheckCircle2, RefreshCw, MoreVertical
} from 'lucide-react';
import { Query, ID, Permission, Role } from 'appwrite';

interface Prospect {
  $id: string;
  firstName: string;
  lastName: string;
  companyName?: string;
  phone?: string;
  email?: string;
  address?: string;
  source: string;
  status: string;
  needs?: string;
  notes?: string;
  firstContactDate?: string;
  lastContactDate?: string;
  teamId?: string;
}

const statusColors: Record<string, string> = {
  new: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  contacted: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
  quote_sent: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
  pending: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
  followup: 'bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-300',
  won: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  lost: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  archived: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
};

const statusLabels: Record<string, string> = {
  new: 'Nouveau',
  contacted: 'Contacté',
  quote_sent: 'Devis envoyé',
  pending: 'En attente',
  followup: 'Relance',
  won: 'Gagné',
  lost: 'Perdu',
  archived: 'Archivé'
};

const sourceLabels: Record<string, string> = {
  website: 'Site web',
  phone: 'Téléphone',
  referral: 'Recommandation',
  other: 'Autre'
};

const emptyForm = {
  firstName: '',
  lastName: '',
  companyName: '',
  phone: '',
  email: '',
  address: '',
  source: 'other',
  status: 'new',
  needs: '',
  notes: ''
};

export default function Prospects() {
  const { user } = useAuth();
  const { hasPermission, loading: permLoading } = usePermissions();
  const navigate = useNavigate();
  
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [saving, setSaving] = useState(false);
  const [duplicateFound, setDuplicateFound] = useState<Prospect | null>(null);
  const [currentTeamId, setCurrentTeamId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'active' | 'archived'>('active');
  const [mobileActionMenu, setMobileActionMenu] = useState<string | null>(null);

  useEffect(() => {
    if (!permLoading && !hasPermission('prospects.view')) {
      navigate('/dashboard');
    }
  }, [permLoading, hasPermission, navigate]);

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    loadProspects();
  }, [user, viewMode]);

  const loadProspects = async (background = false) => {
    if (!background) setLoading(true);
    try {
      let teamId = null;
      const teamsRes = await databases.listDocuments(DATABASE_ID, 'teams', [Query.equal('ownerId', user.$id)]);
      if (teamsRes.documents.length > 0) teamId = teamsRes.documents[0].$id;
      else {
        const membersRes = await databases.listDocuments(DATABASE_ID, 'team_members', [Query.equal('userId', user.$id)]);
        if (membersRes.documents.length > 0) teamId = membersRes.documents[0].teamId;
      }

      if (!teamId) { if (!background) setLoading(false); return; }
      setCurrentTeamId(teamId);

      const response = await databases.listDocuments(
        DATABASE_ID, 'prospects',
        [Query.equal('teamId', teamId), Query.orderDesc('$createdAt'), Query.limit(2000)]
      );
      setProspects(response.documents as unknown as Prospect[]);
    } catch (error) {
      console.error('❌ Erreur chargement prospects:', error);
    } finally {
      if (!background) setLoading(false);
    }
  };

  const checkDuplicate = async () => {
    if (!form.email && !form.phone) return null;
    if (!currentTeamId) return null;
    try {
      const response = await databases.listDocuments(DATABASE_ID, 'prospects', [Query.equal('teamId', currentTeamId)]);
      return response.documents.find((p: any) => (form.email && p.email === form.email) || (form.phone && p.phone === form.phone)) || null;
    } catch (error) {
      return null;
    }
  };

  const handleOpenAdd = () => {
    setEditingId(null);
    setDuplicateFound(null);
    setForm({ ...emptyForm });
    setShowModal(true);
  };

  const handleOpenEdit = (prospect: Prospect) => {
    setEditingId(prospect.$id);
    setDuplicateFound(null);
    setForm({
      firstName: prospect.firstName || '',
      lastName: prospect.lastName || '',
      companyName: prospect.companyName || '',
      phone: prospect.phone || '',
      email: prospect.email || '',
      address: prospect.address || '',
      source: prospect.source || 'other',
      status: prospect.status === 'archived' ? 'new' : prospect.status,
      needs: prospect.needs || '',
      notes: prospect.notes || ''
    });
    setShowModal(true);
    setMobileActionMenu(null);
  };

  const handleSave = async () => {
    if (!form.firstName || !form.lastName) {
      alert('Veuillez remplir le prénom et le nom.');
      return;
    }
    if (!currentTeamId) { 
      alert('Erreur : Aucune équipe trouvée'); 
      return; 
    }

    if (!editingId && !duplicateFound) {
      const existing = await checkDuplicate();
      if (existing) { setDuplicateFound(existing as unknown as Prospect); return; }
    }

    setSaving(true);
    try {
      const data = { ...form, teamId: currentTeamId };
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

      if (editingId) {
        await databases.updateDocument(DATABASE_ID, 'prospects', editingId, data);
      } else {
        await databases.createDocument(DATABASE_ID, 'prospects', ID.unique(), data, perms);
      }
      
      setShowModal(false);
      setDuplicateFound(null);
      setEditingId(null);
      setForm({ ...emptyForm });
      setSearch('');
      await loadProspects();
    } catch (error: any) {
      console.error("❌ ERREUR APPWRITE:", error);
      alert(`Erreur lors de l'enregistrement : ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleConvertToClient = async (prospect: Prospect) => {
    if (!confirm(`Convertir "${prospect.firstName} ${prospect.lastName}" en client ?\n\nCela créera une fiche client et marquera ce prospect comme "Gagné".`)) return;
    if (!user?.secureTeamId) { alert('Erreur de sécurité : Équipe native non chargée.'); return; }

    try {
      const currentYear = new Date().getFullYear();
      const prefix = `CLI-${currentYear}-`;
      let maxNum = 0;
      
      try {
        const existingClients = await databases.listDocuments(DATABASE_ID, 'clients', [
          Query.equal('teamId', currentTeamId),
          Query.limit(2000)
        ]);
        existingClients.documents.forEach((doc: any) => {
          if (doc.clientId && doc.clientId.startsWith(prefix)) {
            const num = parseInt(doc.clientId.replace(prefix, ''), 10);
            if (!isNaN(num) && num > maxNum) maxNum = num;
          }
        });
      } catch (e) { console.error('Erreur lecture clients existants:', e); }
      
      const newClientId = `${prefix}${String(maxNum + 1).padStart(3, '0')}`;

      await databases.createDocument(
        DATABASE_ID, 'clients', ID.unique(), 
        {
          teamId: currentTeamId,
          userId: user.$id,
          clientId: newClientId,
          type: prospect.companyName ? 'entreprise' : 'particulier',
          firstName: prospect.firstName,
          lastName: prospect.lastName,
          companyName: prospect.companyName || '',
          email: prospect.email || '',
          phone: prospect.phone || '',
          address: prospect.address || '',
          notes: prospect.notes ? `Converti depuis le prospect.\nNotes d'origine: ${prospect.notes}` : 'Converti depuis un prospect',
          status: 'active',
          prospectId: prospect.$id
        },
        [
          Permission.read(Role.team(user.secureTeamId)),
          Permission.update(Role.team(user.secureTeamId)),
          Permission.delete(Role.team(user.secureTeamId))
        ]
      );

      await databases.updateDocument(DATABASE_ID, 'prospects', prospect.$id, { status: 'won' });
      await loadProspects(true);
      
      const goToClient = confirm(`✅ Prospect converti avec succès !\nNuméro client : ${newClientId}\n\nVoulez-vous voir la fiche client maintenant ?`);
      if (goToClient) navigate('/clients');
    } catch (error: any) {
      console.error('Erreur conversion:', error);
      alert(`❌ Erreur lors de la conversion : ${error.message}`);
    }
  };

  const handleQuickStatusChange = async (prospectId: string, newStatus: string) => {
    try {
      await databases.updateDocument(DATABASE_ID, 'prospects', prospectId, { status: newStatus });
      await loadProspects(true);
      setMobileActionMenu(null);
    } catch (error: any) {
      alert(`Erreur : ${error.message}`);
    }
  };

  const handleArchive = async (id: string, name: string) => {
    if (!confirm(`Archiver le prospect "${name}" ?\nIl sera masqué de la liste principale.`)) return;
    try {
      const doc = await databases.getDocument(DATABASE_ID, 'prospects', id);
      if (doc.teamId !== currentTeamId) { alert('⚠️ Accès refusé'); return; }
      await databases.updateDocument(DATABASE_ID, 'prospects', id, { status: 'archived' });
      await loadProspects(true);
      setMobileActionMenu(null);
    } catch (error: any) {
      alert(`Erreur : ${error.message}`);
    }
  };

  const handleUnarchive = async (id: string, name: string) => {
    try {
      const doc = await databases.getDocument(DATABASE_ID, 'prospects', id);
      if (doc.teamId !== currentTeamId) { alert('⚠️ Accès refusé'); return; }
      await databases.updateDocument(DATABASE_ID, 'prospects', id, { status: 'new' });
      await loadProspects(true);
      setViewMode('active');
    } catch (error: any) {
      alert(`Erreur : ${error.message}`);
    }
  };

  const filtered = prospects.filter(p => {
    const searchStr = `${p.firstName} ${p.lastName} ${p.companyName} ${p.email} ${p.phone} ${statusLabels[p.status]}`.toLowerCase();
    const matchSearch = search === '' || searchStr.includes(search.toLowerCase());
    const matchStatus = filterStatus === 'all' || p.status === filterStatus;
    const matchView = viewMode === 'active' ? p.status !== 'archived' : p.status === 'archived';
    return matchSearch && matchStatus && matchView;
  });

  if (permLoading) return <Sidebar><div className="flex items-center justify-center h-full w-full"><div className="text-slate-500 dark:text-slate-400 text-lg animate-pulse">Vérification des droits...</div></div></Sidebar>;
  if (!hasPermission('prospects.view')) return null;

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
                    <Users size={24} className="text-purple-600" />
                    Prospects
                  </h1>
                  <p className="text-sm text-slate-500 dark:text-slate-400">{filtered.length} résultat(s) {viewMode === 'active' ? 'actif(s)' : 'archivé(s)'}</p>
                </div>
              </div>
              {viewMode === 'active' && hasPermission('prospects.create') && (
                <button onClick={handleOpenAdd} className="w-full sm:w-auto flex items-center justify-center gap-2 bg-purple-600 text-white px-4 py-2.5 rounded-lg hover:bg-purple-700 transition-colors font-medium text-sm shadow-sm active:scale-95">
                  <Plus size={18} /><span>Nouveau prospect</span>
                </button>
              )}
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {/* ONGLETS */}
          <div className="flex border-b border-slate-200 dark:border-slate-700 mb-6">
            <button onClick={() => setViewMode('active')} className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${viewMode === 'active' ? 'border-purple-600 text-purple-600 dark:text-purple-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}>
              Actifs ({prospects.filter(p => p.status !== 'archived').length})
            </button>
            <button onClick={() => setViewMode('archived')} className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${viewMode === 'archived' ? 'border-purple-600 text-purple-600 dark:text-purple-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}>
              Archivés ({prospects.filter(p => p.status === 'archived').length})
            </button>
          </div>

          {/* BARRE DE RECHERCHE ET FILTRES */}
          <div className="flex flex-col sm:flex-row gap-3 mb-6">
            <div className="relative flex-1">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input 
                type="text" 
                placeholder="Rechercher (nom, entreprise, email...)" 
                value={search} 
                onChange={(e) => setSearch(e.target.value)} 
                className="w-full pl-10 pr-4 py-3 border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white rounded-lg focus:ring-2 focus:ring-purple-500 outline-none text-sm transition-shadow" 
              />
            </div>
            {viewMode === 'active' && (
              <div className="relative sm:w-64">
                <Filter size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="w-full pl-10 pr-4 py-3 border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white rounded-lg focus:ring-2 focus:ring-purple-500 outline-none text-sm bg-white dark:bg-slate-800 appearance-none">
                  <option value="all">Tous les statuts</option>
                  {Object.entries(statusLabels).filter(([k]) => k !== 'archived').map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* CONTENU : TABLEAU DESKTOP / CARTES MOBILE */}
          {loading ? (
            <div className="text-center py-12 text-slate-500 dark:text-slate-400 animate-pulse">Chargement des données...</div>
          ) : filtered.length === 0 ? (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-12 text-center shadow-sm">
              <Users size={48} className="mx-auto text-slate-300 dark:text-slate-600 mb-4" />
              <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-2">Aucun prospect {viewMode === 'active' ? 'actif' : 'archivé'}</h3>
              {viewMode === 'active' && hasPermission('prospects.create') && (
                <button onClick={handleOpenAdd} className="inline-flex items-center gap-2 bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 text-sm mt-4 active:scale-95 transition-transform">
                  <Plus size={16} /><span>Ajouter un prospect</span>
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
                        <th className="text-left px-6 py-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Nom</th>
                        <th className="text-left px-6 py-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Entreprise</th>
                        <th className="text-left px-6 py-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Contact</th>
                        <th className="text-left px-6 py-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Source</th>
                        <th className="text-left px-6 py-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Statut</th>
                        <th className="text-right px-6 py-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                      {filtered.map((p) => (
                        <tr key={p.$id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                          <td className="px-6 py-4">
                            <div className="font-medium text-slate-900 dark:text-white">{p.firstName} {p.lastName}</div>
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-300">{p.companyName || '-'}</td>
                          <td className="px-6 py-4">
                            <div className="flex flex-col space-y-1.5">
                              {p.email && <span className="flex items-center text-sm text-slate-600 dark:text-slate-300"><Mail size={14} className="mr-2 text-slate-400" />{p.email}</span>}
                              {p.phone && <span className="flex items-center text-sm text-slate-600 dark:text-slate-300"><Phone size={14} className="mr-2 text-slate-400" />{p.phone}</span>}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-300">{sourceLabels[p.source] || p.source}</td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${statusColors[p.status] || 'bg-gray-100 text-gray-800'}`}>
                              {statusLabels[p.status] || p.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              {viewMode === 'active' ? (
                                <>
                                  {p.status === 'new' && hasPermission('prospects.edit') && (
                                    <button onClick={() => handleQuickStatusChange(p.$id, 'contacted')} className="p-2 text-slate-400 hover:text-yellow-600 hover:bg-yellow-50 dark:hover:bg-yellow-900/30 rounded-lg transition-colors" title="Marquer comme contacté"><Phone size={16} /></button>
                                  )}
                                  {hasPermission('clients.create') && p.status !== 'won' && (
                                    <button onClick={() => handleConvertToClient(p)} className="p-2 text-slate-400 hover:text-cyan-600 hover:bg-cyan-50 dark:hover:bg-cyan-900/30 rounded-lg transition-colors" title="Convertir en client"><UserCheck size={16} /></button>
                                  )}
                                  {hasPermission('quotes.create') && (
                                    <button onClick={() => navigate(`/quotes?prospectId=${p.$id}`)} className="p-2 text-slate-400 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30 rounded-lg transition-colors" title="Créer un devis"><FileText size={16} /></button>
                                  )}
                                  {hasPermission('prospects.edit') && (
                                    <button onClick={() => handleOpenEdit(p)} className="p-2 text-slate-400 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/30 rounded-lg transition-colors" title="Modifier"><Edit2 size={16} /></button>
                                  )}
                                  {hasPermission('prospects.delete') && (
                                    <button onClick={() => handleArchive(p.$id, `${p.firstName} ${p.lastName}`)} className="p-2 text-slate-400 hover:text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/30 rounded-lg transition-colors" title="Archiver"><Archive size={16} /></button>
                                  )}
                                </>
                              ) : (
                                <button onClick={() => handleUnarchive(p.$id, `${p.firstName} ${p.lastName}`)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/30 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/50 transition-colors">
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
                {filtered.map((p) => (
                  <div key={p.$id} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 shadow-sm">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h3 className="font-semibold text-slate-900 dark:text-white">{p.firstName} {p.lastName}</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400">{p.companyName || 'Particulier'}</p>
                      </div>
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusColors[p.status]}`}>
                        {statusLabels[p.status]}
                      </span>
                    </div>
                    
                    <div className="space-y-2 mb-4 text-sm">
                      {p.phone && <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300"><Phone size={14} className="text-slate-400" /> {p.phone}</div>}
                      {p.email && <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300"><Mail size={14} className="text-slate-400" /> {p.email}</div>}
                      <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                        <Building size={14} className="text-slate-400" /> {sourceLabels[p.source] || p.source}
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-100 dark:border-slate-700">
                      {viewMode === 'active' ? (
                        <div className="grid grid-cols-4 gap-2">
                          {hasPermission('prospects.edit') && (
                            <button onClick={() => handleOpenEdit(p)} className="flex flex-col items-center justify-center p-2 text-purple-600 bg-purple-50 dark:bg-purple-900/30 rounded-lg active:scale-95 transition-transform">
                              <Edit2 size={18} />
                              <span className="text-[10px] mt-1 font-medium">Modifier</span>
                            </button>
                          )}
                          {hasPermission('clients.create') && p.status !== 'won' && (
                            <button onClick={() => handleConvertToClient(p)} className="flex flex-col items-center justify-center p-2 text-cyan-600 bg-cyan-50 dark:bg-cyan-900/30 rounded-lg active:scale-95 transition-transform">
                              <UserCheck size={18} />
                              <span className="text-[10px] mt-1 font-medium">Client</span>
                            </button>
                          )}
                          {hasPermission('quotes.create') && (
                            <button onClick={() => navigate(`/quotes?prospectId=${p.$id}`)} className="flex flex-col items-center justify-center p-2 text-green-600 bg-green-50 dark:bg-green-900/30 rounded-lg active:scale-95 transition-transform">
                              <FileText size={18} />
                              <span className="text-[10px] mt-1 font-medium">Devis</span>
                            </button>
                          )}
                          {hasPermission('prospects.delete') && (
                            <button onClick={() => handleArchive(p.$id, `${p.firstName} ${p.lastName}`)} className="flex flex-col items-center justify-center p-2 text-orange-600 bg-orange-50 dark:bg-orange-900/30 rounded-lg active:scale-95 transition-transform">
                              <Archive size={18} />
                              <span className="text-[10px] mt-1 font-medium">Archiver</span>
                            </button>
                          )}
                        </div>
                      ) : (
                        <button onClick={() => handleUnarchive(p.$id, `${p.firstName} ${p.lastName}`)} className="w-full flex items-center justify-center gap-2 p-3 text-sm font-medium text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/30 rounded-lg active:scale-95 transition-transform">
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

        {/* MODAL */}
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4 animate-fadeIn">
            <div className="bg-white dark:bg-slate-800 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto animate-slideUp">
              <div className="sticky top-0 bg-white dark:bg-slate-800 z-10 flex items-center justify-between px-4 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-700">
                <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">{editingId ? 'Modifier le prospect' : 'Nouveau prospect'}</h2>
                <button onClick={() => { setShowModal(false); setDuplicateFound(null); }} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors">
                  <X size={20} className="text-slate-500 dark:text-slate-400" />
                </button>
              </div>
              
              <div className="px-4 sm:px-6 py-4 space-y-4">
                {duplicateFound && !editingId && (
                  <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 text-yellow-800 dark:text-yellow-200 px-4 py-3 rounded-lg">
                    <p className="font-semibold flex items-center gap-2 text-sm"><AlertCircle size={16} /> Doublon détecté</p>
                    <p className="text-sm mt-1">Un prospect avec ces coordonnées existe déjà : <strong>{duplicateFound.firstName} {duplicateFound.lastName}</strong>.</p>
                    <div className="flex gap-2 mt-3">
                      <button type="button" onClick={() => { handleOpenEdit(duplicateFound); }} className="px-3 py-2 bg-purple-600 text-white text-xs font-medium rounded hover:bg-purple-700 active:scale-95 transition-transform">Mettre à jour</button>
                      <button type="button" onClick={() => setDuplicateFound(null)} className="px-3 py-2 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-medium rounded hover:bg-slate-300 dark:hover:bg-slate-600 active:scale-95 transition-transform">Créer quand même</button>
                    </div>
                  </div>
                )}
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Prénom *</label>
                    <input type="text" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} className="w-full px-3 py-3 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none" placeholder="Jean" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Nom *</label>
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

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Source</label>
                    <select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} className="w-full px-3 py-3 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none bg-white dark:bg-slate-700">
                      {Object.entries(sourceLabels).map(([key, label]) => (<option key={key} value={key}>{label}</option>))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Statut</label>
                    <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-full px-3 py-3 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none bg-white dark:bg-slate-700">
                      {Object.entries(statusLabels).filter(([k]) => k !== 'archived').map(([key, label]) => (<option key={key} value={key}>{label}</option>))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Besoins</label>
                  <textarea value={form.needs} onChange={(e) => setForm({ ...form, needs: e.target.value })} rows={2} className="w-full px-3 py-3 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none resize-none" placeholder="Décrivez les besoins..." />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Notes</label>
                  <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full px-3 py-3 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none resize-none" placeholder="Notes internes..." />
                </div>
              </div>

              <div className="sticky bottom-0 bg-slate-50 dark:bg-slate-800/90 backdrop-blur-sm flex items-center justify-end gap-3 px-4 sm:px-6 py-4 border-t border-slate-200 dark:border-slate-700 rounded-b-2xl">
                <button onClick={() => { setShowModal(false); setDuplicateFound(null); }} className="flex-1 sm:flex-none px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600 active:scale-95 transition-all">Annuler</button>
                <button onClick={handleSave} disabled={saving || !form.firstName || !form.lastName} className="flex-1 sm:flex-none px-4 py-3 text-sm font-semibold text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 transition-all">
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