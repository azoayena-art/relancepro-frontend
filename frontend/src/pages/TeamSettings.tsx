import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { databases, DATABASE_ID } from '../appwrite';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { Query, ID, Permission, Role } from 'appwrite';
import { 
  Users, Shield, Plus, Edit3, ChevronLeft, UserPlus, CheckSquare, Copy, Check, ExternalLink, Archive, RotateCcw
} from 'lucide-react';

const ALL_PERMISSIONS = [
  { category: 'Prospects', items: [
    { key: 'prospects.view', label: 'Consulter la liste' }, { key: 'prospects.create', label: 'Ajouter un prospect' },
    { key: 'prospects.edit', label: 'Modifier un prospect' }, { key: 'prospects.delete', label: 'Supprimer un prospect' },
  ]},
  { category: 'Clients', items: [
    { key: 'clients.view', label: 'Consulter la liste' }, { key: 'clients.create', label: 'Ajouter un client' },
    { key: 'clients.edit', label: 'Modifier un client' }, { key: 'clients.delete', label: 'Supprimer un client' },
  ]},
  { category: 'Catalogue', items: [
    { key: 'products.view', label: 'Consulter les produits' }, { key: 'products.create', label: 'Ajouter un produit' },
    { key: 'products.edit', label: 'Modifier un produit' }, { key: 'products.delete', label: 'Supprimer un produit' },
  ]},
  { category: 'Devis', items: [
    { key: 'quotes.view', label: 'Consulter les devis' }, { key: 'quotes.create', label: 'Créer un devis' },
    { key: 'quotes.edit', label: 'Modifier un devis' }, { key: 'quotes.delete', label: 'Supprimer un devis' },
    { key: 'quotes.send', label: 'Envoyer au client' },
  ]},
  { category: 'Factures', items: [
    { key: 'invoices.view', label: 'Consulter les factures' }, { key: 'invoices.create', label: 'Créer une facture' },
    { key: 'invoices.edit', label: 'Modifier une facture' }, { key: 'invoices.delete', label: 'Supprimer une facture' },
    { key: 'invoices.mark_paid', label: 'Marquer comme payée' },
  ]},
  { category: 'Paramètres', items: [
    { key: 'settings.view', label: 'Voir les paramètres' }, { key: 'settings.edit', label: 'Modifier les paramètres' },
  ]},
  { category: 'Équipe', items: [
    { key: 'team.view', label: 'Voir les membres' }, { key: 'team.invite', label: 'Inviter un membre' },
    { key: 'team.manage_roles', label: 'Gérer les rôles' }, { key: 'team.remove_member', label: 'Retirer un membre' },
  ]},
  { category: 'Facturation', items: [
    { key: 'billing.view', label: 'Voir la facturation' }, { key: 'billing.manage', label: 'Gérer l\'abonnement' },
  ]},
  { category: 'Rapports', items: [
    { key: 'reports.view', label: 'Consulter les rapports' },
  ]}
];

interface RoleType { $id: string; name: string; permissions: string[]; isDefault: boolean; teamId: string; }
interface Member { $id: string; userId: string; roleId: string; name?: string; email: string; status: string; role: RoleType; teamId: string; }

export default function TeamSettings() {
  const { user } = useAuth();
  const { hasPermission, loading: permLoading } = usePermissions();
  const navigate = useNavigate();
  
  const [teamId, setTeamId] = useState<string | null>(null);
  const [roles, setRoles] = useState<RoleType[]>([]);
  
  const [activeMembers, setActiveMembers] = useState<Member[]>([]);
  const [archivedMembers, setArchivedMembers] = useState<Member[]>([]);
  const [viewMode, setViewMode] = useState<'active' | 'archived'>('active');
  
  const [_loading, setLoading] = useState(true); // ✅ CORRECTION TS6133

  const [showRoleModal, setShowRoleModal] = useState(false);
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [newRoleName, setNewRoleName] = useState('');
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);

  const [showMemberModal, setShowMemberModal] = useState(false);
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberRoleId, setNewMemberRoleId] = useState('');

  const [showEditRoleModal, setShowEditRoleModal] = useState(false);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [selectedNewRoleId, setSelectedNewRoleId] = useState('');

  const [showLinkModal, setShowLinkModal] = useState(false);
  const [generatedLink, setGeneratedLink] = useState('');
  const [generatedEmail, setGeneratedEmail] = useState('');
  
  const [copiedMemberId, setCopiedMemberId] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  useEffect(() => {
    if (!permLoading && !hasPermission('team.view')) {
      console.warn("⛔ Accès refusé : L'utilisateur n'a pas la permission 'team.view'");
      navigate('/dashboard');
    }
  }, [permLoading, hasPermission, navigate]);

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    console.log("🔍 DEBUG TeamSettings - secureTeamId:", user?.secureTeamId);
    loadData();
  }, [user]);

  const loadData = async () => {
    if (!user) return; // ✅ CORRECTION TS18047
    try {
      const teamsRes = await databases.listDocuments(DATABASE_ID, 'teams', [Query.equal('ownerId', user?.$id)]);
      let currentTeamId = null;
      if (teamsRes.documents.length > 0) {
        currentTeamId = teamsRes.documents[0].$id;
        setTeamId(currentTeamId);
      } else {
        const membersRes = await databases.listDocuments(DATABASE_ID, 'team_members', [Query.equal('userId', user?.$id)]);
        if (membersRes.documents.length > 0) {
          currentTeamId = membersRes.documents[0].teamId;
          setTeamId(currentTeamId);
        }
      }
      if (!currentTeamId) { setLoading(false); return; }

      const rolesRes = await databases.listDocuments(DATABASE_ID, 'roles', [Query.equal('teamId', currentTeamId)]);
      // ✅ CORRECTION TS2352
      const parsedRoles = rolesRes.documents.map(doc => ({ ...doc, permissions: JSON.parse(doc.permissions || '[]') })) as unknown as RoleType[];
      setRoles(parsedRoles);

      const membersRes = await databases.listDocuments(DATABASE_ID, 'team_members', [Query.equal('teamId', currentTeamId)]);
      const parsedMembers = await Promise.all(membersRes.documents.map(async (doc: any) => {
        const role = parsedRoles.find(r => r.$id === doc.roleId) || { name: 'Inconnu', permissions: [], $id: '', teamId: currentTeamId, isDefault: false };
        return { ...doc, role };
      }));

      setActiveMembers(parsedMembers.filter(m => m.status !== 'archived') as Member[]);
      setArchivedMembers(parsedMembers.filter(m => m.status === 'archived') as Member[]);
    } catch (e) { console.error('Erreur chargement équipe:', e); } 
    finally { setLoading(false); }
  };

  const togglePermission = (key: string) => setSelectedPermissions(prev => prev.includes(key) ? prev.filter(p => p !== key) : [...prev, key]);
  const selectAll = () => setSelectedPermissions(ALL_PERMISSIONS.flatMap(cat => cat.items.map(i => i.key)));
  const deselectAll = () => setSelectedPermissions([]);

  const openRoleModal = (role?: RoleType) => {
    if (role) { 
      if (role.teamId !== teamId) { alert('⚠️ Accès refusé : Ce rôle n\'appartient pas à votre équipe.'); return; }
      setEditingRoleId(role.$id); setNewRoleName(role.name); setSelectedPermissions(role.permissions); 
    } else { 
      setEditingRoleId(null); setNewRoleName(''); setSelectedPermissions([]); 
    }
    setShowRoleModal(true);
  };

  const handleSaveRole = async () => {
    if (!newRoleName.trim() || !teamId) { alert("Veuillez donner un nom au rôle."); return; }
    if (selectedPermissions.length === 0) { alert("Veuillez cocher au moins une permission."); return; }
    
    try {
      let perms: string[] = [];
      if (user?.secureTeamId) {
        perms = [Permission.read(Role.team(user.secureTeamId)), Permission.update(Role.team(user.secureTeamId)), Permission.delete(Role.team(user.secureTeamId))];
      } else {
        perms = [Permission.read(Role.users()), Permission.update(Role.users()), Permission.delete(Role.users())];
      }

      if (editingRoleId) {
        const existingRole = roles.find(r => r.$id === editingRoleId);
        if (!existingRole || existingRole.teamId !== teamId) throw new Error('Accès refusé : Ce rôle n\'appartient pas à votre équipe');
        await databases.updateDocument(DATABASE_ID, 'roles', editingRoleId, { name: newRoleName, permissions: JSON.stringify(selectedPermissions) });
      } else {
        await databases.createDocument(DATABASE_ID, 'roles', ID.unique(), { name: newRoleName, teamId: teamId, permissions: JSON.stringify(selectedPermissions), isDefault: false, createdAt: new Date().toISOString() }, perms);
      }
      setShowRoleModal(false); setNewRoleName(''); setSelectedPermissions([]); setEditingRoleId(null); loadData();
    } catch (e: any) { alert(`Erreur: ${e.message}`); }
  };

  const handleDeleteRole = async (roleId: string, roleName: string) => {
    const roleToDelete = roles.find(r => r.$id === roleId);
    if (!roleToDelete || roleToDelete.teamId !== teamId) { alert('⚠️ Accès refusé : Ce rôle n\'appartient pas à votre équipe.'); return; }
    if (!confirm(`Supprimer le rôle "${roleName}" ?`)) return;
    try { await databases.deleteDocument(DATABASE_ID, 'roles', roleId); loadData(); } 
    catch (e: any) { alert(`Erreur: ${e.message}`); }
  };

  const handleArchiveMember = async (memberId: string, email: string) => {
    const memberToArchive = activeMembers.find(m => m.$id === memberId);
    if (!memberToArchive || memberToArchive.teamId !== teamId) { alert('⚠️ Accès refusé : Ce membre n\'appartient pas à votre équipe.'); return; }
    if (!confirm(`Archiver ${email} ?`)) return;
    try { await databases.updateDocument(DATABASE_ID, 'team_members', memberId, { status: 'archived' }); loadData(); } 
    catch (e: any) { alert(`Erreur: ${e.message}`); }
  };

  const handleUnarchiveMember = async (memberId: string, _email: string) => { // ✅ CORRECTION TS6133
    const memberToUnarchive = archivedMembers.find(m => m.$id === memberId);
    if (!memberToUnarchive || memberToUnarchive.teamId !== teamId) { alert('⚠️ Accès refusé : Ce membre n\'appartient pas à votre équipe.'); return; }
    try { await databases.updateDocument(DATABASE_ID, 'team_members', memberId, { status: 'active' }); loadData(); } 
    catch (e: any) { alert(`Erreur: ${e.message}`); }
  };

  const openEditRoleModal = (member: Member) => {
    if (member.teamId !== teamId) { alert('⚠️ Accès refusé : Ce membre n\'appartient pas à votre équipe.'); return; }
    setEditingMember(member); setSelectedNewRoleId(member.roleId); setShowEditRoleModal(true);
  };

  const handleSaveRoleChange = async () => {
    if (!editingMember || !selectedNewRoleId) return;
    if (editingMember.teamId !== teamId) { alert('⚠️ Accès refusé : Ce membre n\'appartient pas à votre équipe.'); return; }
    const newRole = roles.find(r => r.$id === selectedNewRoleId);
    if (!newRole || newRole.teamId !== teamId) { alert('⚠️ Accès refusé : Ce rôle n\'appartient pas à votre équipe.'); return; }
    try {
      await databases.updateDocument(DATABASE_ID, 'team_members', editingMember.$id, { roleId: selectedNewRoleId });
      setShowEditRoleModal(false); setEditingMember(null); loadData();
    } catch (e: any) { alert(`Erreur: ${e.message}`); }
  };

  const copyToClipboard = (text: string, memberId?: string) => {
    navigator.clipboard.writeText(text);
    if (memberId) { setCopiedMemberId(memberId); setTimeout(() => setCopiedMemberId(null), 2000); } 
    else { setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2000); }
  };

  const handleAddMember = async () => {
    if (!newMemberName.trim() || !newMemberEmail.trim() || !newMemberRoleId || !teamId) { alert("Veuillez remplir le nom, l'email et choisir un rôle."); return; }
    const selectedRole = roles.find(r => r.$id === newMemberRoleId);
    if (!selectedRole || selectedRole.teamId !== teamId) { alert('⚠️ Accès refusé : Ce rôle n\'appartient pas à votre équipe.'); return; }
    
    const normalizedEmail = newMemberEmail.toLowerCase().trim();
    if (activeMembers.some(m => m.email.toLowerCase().trim() === normalizedEmail)) { alert("Cet email est déjà utilisé par un membre actif."); return; }
    if (archivedMembers.some(m => m.email.toLowerCase().trim() === normalizedEmail)) { alert("Cet email appartient à un membre archivé. Désarchivez-le plutôt."); return; }

    try {
      let perms: string[] = [];
      if (user?.secureTeamId) {
        perms = [Permission.read(Role.team(user.secureTeamId)), Permission.update(Role.team(user.secureTeamId)), Permission.delete(Role.team(user.secureTeamId))];
      } else {
        perms = [Permission.read(Role.users()), Permission.update(Role.users()), Permission.delete(Role.users())];
      }

      await databases.createDocument(DATABASE_ID, 'team_members', ID.unique(), {
        userId: 'pending', teamId: teamId, roleId: newMemberRoleId, email: newMemberEmail, name: newMemberName, 
        status: 'active', invitedAt: new Date().toISOString(), joinedAt: new Date().toISOString(), invitedBy: user?.$id // ✅ CORRECTION TS18047
      }, perms);

      const joinLink = `${window.location.origin}/join-team?email=${encodeURIComponent(newMemberEmail)}`;
      setGeneratedLink(joinLink); setGeneratedEmail(newMemberEmail); setShowLinkModal(true);
      setShowMemberModal(false); setNewMemberName(''); setNewMemberEmail(''); setNewMemberRoleId('');
      loadData();
    } catch (e: any) { alert(`Erreur: ${e.message}`); }
  };

  if (permLoading) return <div className="min-h-screen flex items-center justify-center bg-gray-50">Vérification des droits...</div>;
  if (!hasPermission('team.view')) return null;

  const currentMembersList = viewMode === 'active' ? activeMembers : archivedMembers;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b p-4 flex justify-between items-center max-w-7xl mx-auto">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/dashboard')}><ChevronLeft size={24} /></button>
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2"><Users className="text-purple-600" />Équipe & Rôles</h1>
            <p className="text-xs text-slate-500">Gérez les accès et les permissions de vos collaborateurs</p>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 space-y-8">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-semibold flex items-center gap-2"><Shield size={20} className="text-purple-600"/>Rôles et Permissions</h2>
            {hasPermission('team.manage_roles') && (
              <button onClick={() => openRoleModal()} className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 flex items-center gap-2">
                <Plus size={16} /> Créer un rôle
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {roles.map(role => (
              <div key={role.$id} className="border border-slate-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-semibold text-slate-900">{role.name}</h3>
                  {role.isDefault && <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded">Par défaut</span>}
                </div>
                <p className="text-xs text-slate-500 mb-3">{role.permissions.length} permissions</p>
                <div className="flex flex-wrap gap-1 mb-3">
                  {role.permissions.slice(0, 3).map(p => {
                    const allItems = ALL_PERMISSIONS.flatMap(c => c.items);
                    const permObj = allItems.find(item => item.key === p);
                    return <span key={p} className="text-[10px] bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded">{permObj ? permObj.label : p}</span>;
                  })}
                  {role.permissions.length > 3 && <span className="text-[10px] text-slate-400">+{role.permissions.length - 3}</span>}
                </div>
                <div className="flex gap-2 pt-2 border-t border-slate-100">
                  {hasPermission('team.manage_roles') && (
                    <button onClick={() => openRoleModal(role)} className="flex-1 flex items-center justify-center gap-1 text-xs text-blue-600 hover:bg-blue-50 py-1.5 rounded transition-colors">
                      <Edit3 size={12} /> Modifier
                    </button>
                  )}
                  {!role.isDefault && hasPermission('team.manage_roles') && (
                    <button onClick={() => handleDeleteRole(role.$id, role.name)} className="flex-1 flex items-center justify-center gap-1 text-xs text-red-600 hover:bg-red-50 py-1.5 rounded transition-colors">
                      <Archive size={12} /> Supprimer
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-semibold flex items-center gap-2"><UserPlus size={20} className="text-purple-600"/>
              {viewMode === 'active' ? 'Membres de l\'équipe' : 'Membres Archivés'}
            </h2>
            <div className="flex gap-2">
              {viewMode === 'active' && hasPermission('team.invite') && (
                <button onClick={() => setShowMemberModal(true)} className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 flex items-center gap-2">
                  <Plus size={16} /> Ajouter un membre
                </button>
              )}
            </div>
          </div>

          <div className="flex border-b border-slate-200 mb-4">
            <button onClick={() => setViewMode('active')} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${viewMode === 'active' ? 'border-purple-600 text-purple-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
              Actifs ({activeMembers.length})
            </button>
            <button onClick={() => setViewMode('archived')} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${viewMode === 'archived' ? 'border-purple-600 text-purple-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
              Archivés ({archivedMembers.length})
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50 border-b">
                <tr>
                  <th className="p-4 text-xs font-semibold text-slate-500 uppercase">Nom</th>
                  <th className="p-4 text-xs font-semibold text-slate-500 uppercase">Email</th>
                  <th className="p-4 text-xs font-semibold text-slate-500 uppercase">Rôle</th>
                  <th className="p-4 text-xs font-semibold text-slate-500 uppercase">Statut</th>
                  <th className="p-4 text-right text-xs font-semibold text-slate-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {currentMembersList.length === 0 ? (
                  <tr><td colSpan={5} className="p-8 text-center text-slate-500 text-sm">{viewMode === 'active' ? 'Aucun membre actif dans l\'équipe.' : 'Aucun membre archivé.'}</td></tr>
                ) : (
                  currentMembersList.map(member => (
                    <tr key={member.$id} className="hover:bg-slate-50">
                      <td className="p-4 text-sm font-medium text-slate-900">{member.name || '-'}</td>
                      <td className="p-4 text-sm text-slate-600">{member.email}</td>
                      <td className="p-4 text-sm text-slate-600">{member.role.name}</td>
                      <td className="p-4">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${member.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-600'}`}>
                          {member.status === 'active' ? 'Actif' : 'Archivé'}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex justify-end gap-1">
                          {viewMode === 'active' ? (
                            <>
                              {hasPermission('team.invite') && (
                                <button onClick={() => { const link = `${window.location.origin}/join-team?email=${encodeURIComponent(member.email)}`; copyToClipboard(link, member.$id); }} className={`p-1.5 rounded transition-colors ${copiedMemberId === member.$id ? 'text-green-600 bg-green-50' : 'text-blue-500 hover:text-blue-700 hover:bg-blue-50'}`} title="Copier le lien d'inscription">
                                  {copiedMemberId === member.$id ? <Check size={14} /> : <Copy size={14} />}
                                </button>
                              )}
                              {hasPermission('team.manage_roles') && (
                                <button onClick={() => openEditRoleModal(member)} className="text-purple-500 hover:text-purple-700 hover:bg-purple-50 p-1.5 rounded transition-colors" title="Modifier le rôle"><Edit3 size={14} /></button>
                              )}
                              {hasPermission('team.remove_member') && (
                                <button onClick={() => handleArchiveMember(member.$id, member.email)} className="text-orange-500 hover:text-orange-700 hover:bg-orange-50 p-1.5 rounded transition-colors" title="Archiver ce membre"><Archive size={14} /></button>
                              )}
                            </>
                          ) : (
                            hasPermission('team.remove_member') && (
                              <button onClick={() => handleUnarchiveMember(member.$id, member.email)} className="text-green-600 hover:text-green-800 hover:bg-green-50 p-1.5 rounded transition-colors flex items-center gap-1 text-xs font-medium" title="Désarchiver"><RotateCcw size={14} /> Désarchiver</button>
                            )
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {showRoleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200 flex justify-between items-center sticky top-0 bg-white z-10">
              <h3 className="text-xl font-bold text-slate-900">{editingRoleId ? 'Modifier le rôle' : 'Créer un nouveau rôle'}</h3>
              <button onClick={() => setShowRoleModal(false)} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
            </div>
            <div className="p-6 space-y-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nom du rôle</label>
                <input type="text" value={newRoleName} onChange={(e) => setNewRoleName(e.target.value)} placeholder="Ex: Comptable, Commercial..." className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 outline-none" />
              </div>
              <div>
                <div className="flex justify-between items-center mb-3">
                  <label className="block text-sm font-medium text-slate-700">Permissions</label>
                  <div className="flex gap-2">
                    <button onClick={selectAll} className="text-xs text-purple-600 hover:underline">Tout cocher</button>
                    <button onClick={deselectAll} className="text-xs text-slate-500 hover:underline">Tout décocher</button>
                  </div>
                </div>
                <div className="space-y-4 border border-slate-200 rounded-lg p-4 max-h-96 overflow-y-auto bg-slate-50">
                  {ALL_PERMISSIONS.map(category => (
                    <div key={category.category} className="bg-white p-3 rounded border border-slate-100">
                      <h4 className="text-xs font-bold text-purple-700 uppercase mb-2 border-b pb-1">{category.category}</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {category.items.map(perm => (
                          <label key={perm.key} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer hover:bg-slate-50 p-1 rounded">
                            <input type="checkbox" checked={selectedPermissions.includes(perm.key)} onChange={() => togglePermission(perm.key)} className="w-4 h-4 text-purple-600 rounded border-slate-300 focus:ring-purple-500" />
                            {perm.label}
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="p-6 border-t border-slate-200 flex justify-end gap-3 sticky bottom-0 bg-white z-10">
              <button onClick={() => setShowRoleModal(false)} className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50">Annuler</button>
              <button onClick={handleSaveRole} disabled={!newRoleName.trim() || selectedPermissions.length === 0} className="px-4 py-2 text-sm font-semibold text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2">
                <CheckSquare size={16} /> {editingRoleId ? 'Enregistrer' : 'Créer le rôle'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showEditRoleModal && editingMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="p-6 border-b border-slate-200 flex justify-between items-center">
              <h3 className="text-xl font-bold text-slate-900">Modifier le rôle</h3>
              <button onClick={() => setShowEditRoleModal(false)} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-600">Changer le rôle de <strong>{editingMember.name || editingMember.email}</strong></p>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nouveau rôle</label>
                <select value={selectedNewRoleId} onChange={(e) => setSelectedNewRoleId(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-purple-500 outline-none">
                  {roles.map(r => <option key={r.$id} value={r.$id}>{r.name}</option>)}
                </select>
              </div>
            </div>
            <div className="p-6 border-t border-slate-200 flex justify-end gap-3">
              <button onClick={() => setShowEditRoleModal(false)} className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50">Annuler</button>
              <button onClick={handleSaveRoleChange} className="px-4 py-2 text-sm font-semibold text-white bg-purple-600 rounded-lg hover:bg-purple-700 flex items-center gap-2">
                <CheckSquare size={16} /> Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}

      {showMemberModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="p-6 border-b border-slate-200 flex justify-between items-center">
              <h3 className="text-xl font-bold text-slate-900">Ajouter un membre</h3>
              <button onClick={() => setShowMemberModal(false)} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nom complet</label>
                <input type="text" value={newMemberName} onChange={(e) => setNewMemberName(e.target.value)} placeholder="Ex: Jean Dupont" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Adresse email</label>
                <input type="email" value={newMemberEmail} onChange={(e) => setNewMemberEmail(e.target.value)} placeholder="Ex: jean@exemple.com" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Rôle</label>
                <select value={newMemberRoleId} onChange={(e) => setNewMemberRoleId(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-purple-500 outline-none">
                  <option value="">Choisir un rôle...</option>
                  {roles.map(r => <option key={r.$id} value={r.$id}>{r.name}</option>)}
                </select>
              </div>
            </div>
            <div className="p-6 border-t border-slate-200 flex justify-end gap-3">
              <button onClick={() => setShowMemberModal(false)} className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50">Annuler</button>
              <button onClick={handleAddMember} disabled={!newMemberName.trim() || !newMemberEmail.trim() || !newMemberRoleId} className="px-4 py-2 text-sm font-semibold text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2">
                <UserPlus size={16} /> Ajouter
              </button>
            </div>
          </div>
        </div>
      )}

      {showLinkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="p-6 border-b border-slate-200 flex justify-between items-center">
              <h3 className="text-xl font-bold text-slate-900">Membre ajouté !</h3>
              <button onClick={() => setShowLinkModal(false)} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-600">Envoyez ce lien à <strong>{generatedEmail}</strong> pour qu'il puisse créer son compte :</p>
              <a href={generatedLink} target="_blank" rel="noopener noreferrer" className="block bg-purple-50 border border-purple-200 p-3 rounded-lg text-sm text-purple-700 hover:bg-purple-100 transition-colors break-all">
                {generatedLink}
              </a>
              <div className="flex gap-2">
                <button onClick={() => copyToClipboard(generatedLink)} className="flex-1 bg-purple-600 text-white px-3 py-2 rounded-md text-sm font-medium hover:bg-purple-700 flex items-center justify-center gap-2">
                  {linkCopied ? <><Check size={14} /> Copié !</> : <><Copy size={14} /> Copier le lien</>}
                </button>
                <button onClick={() => window.open(generatedLink, '_blank')} className="flex-1 bg-blue-600 text-white px-3 py-2 rounded-md text-sm font-medium hover:bg-blue-700 flex items-center justify-center gap-2">
                  <ExternalLink size={14} /> Ouvrir
                </button>
              </div>
            </div>
            <div className="p-6 border-t border-slate-200 flex justify-end">
              <button onClick={() => setShowLinkModal(false)} className="px-4 py-2 text-sm font-medium text-white bg-slate-600 rounded-lg hover:bg-slate-700">Fermer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}