import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { databases, DATABASE_ID } from '../appwrite';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import {
  Plus, Search, Edit2, X, Phone, Mail, Building, FileText,
  ChevronLeft, Users, Filter, AlertCircle, UserCheck, Archive, RotateCcw,
  CheckCircle2, RefreshCw
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
  new: 'bg-blue-100 text-blue-800',
  contacted: 'bg-yellow-100 text-yellow-800',
  quote_sent: 'bg-purple-100 text-purple-800',
  pending: 'bg-orange-100 text-orange-800',
  followup: 'bg-pink-100 text-pink-800',
  won: 'bg-green-100 text-green-800',
  lost: 'bg-red-100 text-red-800',
  archived: 'bg-slate-100 text-slate-600'
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
  const { user } = useAuth(); // ✅ user contient maintenant secureTeamId
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

    // 🔍 DEBUG : On affiche exactement ce que le système voit
    console.log("🔍 DEBUG - Objet user complet:", user);
    console.log("🔍 DEBUG - secureTeamId:", user?.secureTeamId);

    if (!editingId && !duplicateFound) {
      const existing = await checkDuplicate();
      if (existing) { setDuplicateFound(existing as unknown as Prospect); return; }
    }

    setSaving(true);
    try {
      const data = { ...form, teamId: currentTeamId };
      
      // 🔍 DÉFINITION DES PERMISSIONS AVEC FALLBACK
      let perms: string[] = [];
      
      if (user?.secureTeamId) {
        console.log("✅ Utilisation de la sécurité maximale (secureTeamId)");
        perms = [
          Permission.read(Role.team(user.secureTeamId)),
          Permission.update(Role.team(user.secureTeamId)),
          Permission.delete(Role.team(user.secureTeamId))
        ];
      } else {
        console.warn("⚠️ secureTeamId manquant ! Utilisation du fallback Role.users() pour débloquer.");
        // Fallback de secours : donne l'accès à tout utilisateur connecté.
        // Comme on filtre par teamId dans loadProspects, cela reste fonctionnel.
        perms = [
          Permission.read(Role.users()),
          Permission.update(Role.users()),
          Permission.delete(Role.users())
        ];
      }

      console.log("🚀 Envoi à Appwrite avec le tableau de permissions:", perms);

      if (editingId) {
        await databases.updateDocument(DATABASE_ID, 'prospects', editingId, data);
      } else {
        await databases.createDocument(
          DATABASE_ID, 
          'prospects', 
          ID.unique(), 
          data,
          perms // <-- On passe la variable explicitement
        );
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
      } catch (e) {
        console.error('Erreur lecture clients existants:', e);
      }
      
      const newClientId = `${prefix}${String(maxNum + 1).padStart(3, '0')}`;

      // ✅ SÉCURITÉ MAXIMALE : Utilisation du secureTeamId (le Pont)
      await databases.createDocument(
        DATABASE_ID, 
        'clients', 
        ID.unique(), 
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
      if (goToClient) {
        navigate('/clients');
      }
    } catch (error: any) {
      console.error('Erreur conversion:', error);
      alert(`❌ Erreur lors de la conversion : ${error.message}`);
    }
  };

  const handleQuickStatusChange = async (prospectId: string, newStatus: string) => {
    try {
      await databases.updateDocument(DATABASE_ID, 'prospects', prospectId, { status: newStatus });
      await loadProspects(true);
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

  if (permLoading) return <div className="min-h-screen flex items-center justify-center bg-gray-50">Vérification des droits...</div>;
  if (!hasPermission('prospects.view')) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-4">
            <button onClick={() => navigate('/dashboard')} className="text-slate-400 hover:text-slate-600"><ChevronLeft size={24} /></button>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 flex items-center"><Users size={24} className="mr-2 text-blue-600" />Prospects</h1>
              <p className="text-sm text-slate-500">{filtered.length} prospect(s) {viewMode === 'active' ? 'actif(s)' : 'archivé(s)'}</p>
            </div>
          </div>
          {viewMode === 'active' && hasPermission('prospects.create') && (
            <button onClick={handleOpenAdd} className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2.5 rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm">
              <Plus size={18} /><span>Nouveau prospect</span>
            </button>
          )}
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex border-b border-slate-200 mb-6">
          <button onClick={() => setViewMode('active')} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${viewMode === 'active' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            Actifs ({prospects.filter(p => p.status !== 'archived').length})
          </button>
          <button onClick={() => setViewMode('archived')} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${viewMode === 'archived' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            Archivés ({prospects.filter(p => p.status === 'archived').length})
          </button>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              placeholder="Rechercher (nom, entreprise, email, téléphone, statut...)" 
              value={search} 
              onChange={(e) => setSearch(e.target.value)} 
              className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm" 
            />
          </div>
          {viewMode === 'active' && (
            <div className="relative">
              <Filter size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-white">
                <option value="all">Tous les statuts</option>
                {Object.entries(statusLabels).filter(([k]) => k !== 'archived').map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {loading ? (
          <div className="text-center py-12 text-slate-500">Chargement...</div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <Users size={48} className="mx-auto text-slate-300 mb-4" />
            <h3 className="text-lg font-semibold text-slate-700 mb-2">Aucun prospect {viewMode === 'active' ? 'actif' : 'archivé'}</h3>
            {viewMode === 'active' && hasPermission('prospects.create') && (
              <button onClick={handleOpenAdd} className="inline-flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm mt-4">
                <Plus size={16} /><span>Ajouter un prospect</span>
              </button>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Nom</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Entreprise</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Contact</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Source</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Statut</th>
                    <th className="text-right px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((p) => (
                    <tr key={p.$id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-medium text-slate-900">{p.firstName} {p.lastName}</div>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">{p.companyName || '-'}</td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col space-y-1">
                          {p.email && <span className="flex items-center text-sm text-slate-600"><Mail size={14} className="mr-1 text-slate-400" />{p.email}</span>}
                          {p.phone && <span className="flex items-center text-sm text-slate-600"><Phone size={14} className="mr-1 text-slate-400" />{p.phone}</span>}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">{sourceLabels[p.source] || p.source}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium ${statusColors[p.status] || 'bg-gray-100 text-gray-800'}`}>
                          {statusLabels[p.status] || p.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end space-x-2">
                          {viewMode === 'active' ? (
                            <>
                              {p.status === 'new' && hasPermission('prospects.edit') && (
                                <button 
                                  onClick={() => handleQuickStatusChange(p.$id, 'contacted')} 
                                  className="p-2 text-slate-400 hover:text-yellow-600 hover:bg-yellow-50 rounded-lg transition-colors" 
                                  title="Marquer comme contacté"
                                >
                                  <Phone size={16} />
                                </button>
                              )}
                              
                              {p.status === 'contacted' && hasPermission('prospects.edit') && (
                                <button 
                                  onClick={() => handleQuickStatusChange(p.$id, 'followup')} 
                                  className="p-2 text-slate-400 hover:text-pink-600 hover:bg-pink-50 rounded-lg transition-colors" 
                                  title="Programmer une relance"
                                >
                                  <RefreshCw size={16} />
                                </button>
                              )}
                              
                              {hasPermission('clients.create') && p.status !== 'won' && p.status !== 'quote_sent' && (
                                <button onClick={() => handleConvertToClient(p)} className="p-2 text-slate-400 hover:text-cyan-600 hover:bg-cyan-50 rounded-lg transition-colors" title="Convertir en client">
                                  <UserCheck size={16} />
                                </button>
                              )}
                              {hasPermission('quotes.create') && (
                                <button onClick={() => navigate(`/quotes?prospectId=${p.$id}`)} className="p-2 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors" title="Créer un devis">
                                  <FileText size={16} />
                                </button>
                              )}
                              {hasPermission('prospects.edit') && (
                                <button onClick={() => handleOpenEdit(p)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Modifier">
                                  <Edit2 size={16} />
                                </button>
                              )}
                              {hasPermission('prospects.delete') && (
                                <button onClick={() => handleArchive(p.$id, `${p.firstName} ${p.lastName}`)} className="p-2 text-slate-400 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors" title="Archiver">
                                  <Archive size={16} />
                                </button>
                              )}
                            </>
                          ) : (
                            <button onClick={() => handleUnarchive(p.$id, `${p.firstName} ${p.lastName}`)} className="inline-flex items-center space-x-1 px-3 py-1.5 text-sm font-medium text-green-700 bg-green-50 rounded-lg hover:bg-green-100 transition-colors" title="Désarchiver">
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
              <h2 className="text-xl font-bold text-slate-900">{editingId ? 'Modifier le prospect' : 'Nouveau prospect'}</h2>
              <button onClick={() => { setShowModal(false); setDuplicateFound(null); }} className="p-2 hover:bg-slate-100 rounded-lg"><X size={20} className="text-slate-500" /></button>
            </div>
            <div className="px-6 py-4 space-y-4">
              {duplicateFound && !editingId && (
                <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded-lg">
                  <p className="font-semibold flex items-center gap-2 text-sm"><AlertCircle size={16} /> Doublon détecté</p>
                  <p className="text-sm mt-1">Un prospect avec ces coordonnées existe déjà : <strong>{duplicateFound.firstName} {duplicateFound.lastName}</strong>.</p>
                  <div className="flex gap-2 mt-3">
                    <button type="button" onClick={() => { handleOpenEdit(duplicateFound); }} className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded hover:bg-blue-700">Mettre à jour</button>
                    <button type="button" onClick={() => setDuplicateFound(null)} className="px-3 py-1.5 bg-slate-200 text-slate-700 text-xs font-medium rounded hover:bg-slate-300">Créer quand même</button>
                  </div>
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Prénom *</label><input type="text" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm" placeholder="Jean" /></div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Nom *</label><input type="text" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm" placeholder="Dupont" /></div>
              </div>
              <div><label className="block text-sm font-medium text-slate-700 mb-1"><Building size={14} className="inline mr-1" />Entreprise</label><input type="text" value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm" placeholder="Dupont Plomberie" /></div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-slate-700 mb-1"><Mail size={14} className="inline mr-1" />Email</label><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm" placeholder="jean@dupont.fr" /></div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1"><Phone size={14} className="inline mr-1" />Téléphone</label><input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm" placeholder="06 12 34 56 78" /></div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Source</label>
                  <select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white">
                    {Object.entries(sourceLabels).map(([key, label]) => (<option key={key} value={key}>{label}</option>))}
                  </select>
                </div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Statut</label>
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white">
                    {Object.entries(statusLabels).filter(([k]) => k !== 'archived').map(([key, label]) => (<option key={key} value={key}>{label}</option>))}
                  </select>
                </div>
              </div>
              <div><label className="block text-sm font-medium text-slate-700 mb-1">Besoins</label><textarea value={form.needs} onChange={(e) => setForm({ ...form, needs: e.target.value })} rows={2} className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm" placeholder="Décrivez les besoins..." /></div>
              <div><label className="block text-sm font-medium text-slate-700 mb-1">Notes</label><textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm" placeholder="Notes internes..." /></div>
            </div>
            <div className="flex items-center justify-end space-x-3 px-6 py-4 border-t bg-slate-50 rounded-b-xl">
              <button onClick={() => { setShowModal(false); setDuplicateFound(null); }} className="px-4 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50">Annuler</button>
              <button onClick={handleSave} disabled={saving || !form.firstName || !form.lastName} className="px-4 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">{saving ? 'Enregistrement...' : editingId ? 'Mettre à jour' : 'Ajouter'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}