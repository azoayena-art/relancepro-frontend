import Sidebar from '../components/Sidebar';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { databases, DATABASE_ID } from '../appwrite';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { Query, ID, Permission, Role } from 'appwrite';
import { 
  Users, Shield, Plus, Edit3, UserPlus, CheckSquare, Copy, Check, ExternalLink, Archive, RotateCcw, X
} from 'lucide-react';

// ✅ LISTE COMPLÈTE DE TOUTES LES PERMISSIONS DE L'APPLICATION
const ALL_PERMISSIONS = [
  { category: 'Tableau de bord', items: [
    { key: 'dashboard', label: 'Accéder au tableau de bord' },
  ]},
  { category: 'Prospects', items: [
    { key: 'prospects.view', label: 'Consulter la liste des prospects' },
    { key: 'prospects.create', label: 'Ajouter un prospect' },
    { key: 'prospects.edit', label: 'Modifier un prospect' },
    { key: 'prospects.delete', label: 'Supprimer un prospect' },
    { key: 'prospects.convert', label: 'Convertir en client' },
  ]},
  { category: 'Clients', items: [
    { key: 'clients.view', label: 'Consulter la liste des clients' },
    { key: 'clients.create', label: 'Ajouter un client' },
    { key: 'clients.edit', label: 'Modifier un client' },
    { key: 'clients.delete', label: 'Supprimer un client' },
  ]},
  { category: 'Catalogue', items: [
    { key: 'products.view', label: 'Consulter les produits' },
    { key: 'products.create', label: 'Ajouter un produit' },
    { key: 'products.edit', label: 'Modifier un produit' },
    { key: 'products.delete', label: 'Supprimer un produit' },
    { key: 'products.import', label: 'Importer des produits (CSV/Excel)' },
  ]},
  { category: 'Devis', items: [
    { key: 'quotes.view', label: 'Consulter les devis' },
    { key: 'quotes.create', label: 'Créer un devis' },
    { key: 'quotes.edit', label: 'Modifier un devis' },
    { key: 'quotes.delete', label: 'Supprimer un devis' },
    { key: 'quotes.send', label: 'Envoyer au client (lien public)' },
    { key: 'quotes.download', label: 'Télécharger le PDF' },
  ]},
  { category: 'Factures', items: [
    { key: 'invoices.view', label: 'Consulter les factures' },
    { key: 'invoices.create', label: 'Créer une facture' },
    { key: 'invoices.edit', label: 'Modifier une facture' },
    { key: 'invoices.delete', label: 'Supprimer une facture' },
    { key: 'invoices.mark_paid', label: 'Marquer comme payée' },
    { key: 'invoices.download', label: 'Télécharger le PDF' },
    { key: 'invoices.credit', label: 'Créer un avoir' },
  ]},
  { category: 'Paiements & Trésorerie', items: [
    { key: 'payments.view', label: 'Consulter les flux de trésorerie' },
    { key: 'payments.create', label: 'Enregistrer un paiement' },
    { key: 'payments.export', label: 'Exporter en CSV' },
  ]},
  { category: 'Reçus', items: [
    { key: 'receipts.view', label: 'Consulter les reçus' },
    { key: 'receipts.download', label: 'Télécharger les reçus PDF' },
    { key: 'receipts.archive', label: 'Archiver un reçu' },
  ]},
  { category: 'Relances', items: [
    { key: 'reminders.view', label: 'Consulter les relances à effectuer' },
    { key: 'reminders.send', label: 'Envoyer une relance' },
    { key: 'reminders.history', label: 'Voir l\'historique des relances' },
  ]},
  { category: 'Paramètres entreprise', items: [
    { key: 'settings.view', label: 'Voir les paramètres' },
    { key: 'settings.edit', label: 'Modifier les paramètres' },
    { key: 'settings.logo', label: 'Gérer le logo' },
    { key: 'settings.tva', label: 'Configurer la TVA' },
  ]},
  { category: 'Équipe', items: [
    { key: 'team.view', label: 'Voir les membres' },
    { key: 'team.invite', label: 'Inviter un membre' },
    { key: 'team.manage_roles', label: 'Gérer les rôles et permissions' },
    { key: 'team.remove_member', label: 'Retirer un membre' },
  ]},
  { category: 'Facturation & Abonnement', items: [
    { key: 'billing.view', label: 'Voir la facturation' },
    { key: 'billing.manage', label: 'Gérer l\'abonnement' },
  ]},
  { category: 'Rapports & Analytics', items: [
    { key: 'reports.view', label: 'Consulter les rapports' },
    { key: 'reports.export', label: 'Exporter les rapports' },
  ]},
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
  
  const [loading, setLoading] = useState(true);

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
      navigate('/dashboard');
    }
  }, [permLoading, hasPermission, navigate]);

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    loadData();
  }, [user]);

  const loadData = async () => {
    if (!user) return;
    try {
      const teamsRes = await databases.listDocuments(DATABASE_ID, 'teams', [Query.equal('ownerId', user.$id)]);
      let currentTeamId = null;
      if (teamsRes.documents.length > 0) {
        currentTeamId = teamsRes.documents[0].$id;
        setTeamId(currentTeamId);
      } else {
        const membersRes = await databases.listDocuments(DATABASE_ID, 'team_members', [Query.equal('userId', user.$id)]);
        if (membersRes.documents.length > 0) {
          currentTeamId = membersRes.documents[0].teamId;
          setTeamId(currentTeamId);
        }
      }
      if (!currentTeamId) { setLoading(false); return; }

      const rolesRes = await databases.listDocuments(DATABASE_ID, 'roles', [Query.equal('teamId', currentTeamId)]);
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

  const handleUnarchiveMember = async (memberId: string) => {
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
        status: 'active', invitedAt: new Date().toISOString(), joinedAt: new Date().toISOString(), invitedBy: user.$id
      }, perms);

      const joinLink = `${window.location.origin}/join-team?email=${encodeURIComponent(newMemberEmail)}`;
      setGeneratedLink(joinLink); setGeneratedEmail(newMemberEmail); setShowLinkModal(true);
      setShowMemberModal(false); setNewMemberName(''); setNewMemberEmail(''); setNewMemberRoleId('');
      loadData();
    } catch (e: any) { alert(`Erreur: ${e.message}`); }
  };

  if (permLoading) return <Sidebar><div className="flex items-center justify-center h-full w-full"><div className="text-slate-500 dark:text-slate-400 text-lg animate-pulse">Vérification des droits...</div></div></Sidebar>;
  if (!hasPermission('team.view')) return null;

  const currentMembersList = viewMode === 'active' ? activeMembers : archivedMembers;

  return (
    <Sidebar>
      <div className="min-h-full bg-slate-50 dark:bg-slate-900">
        {/* HEADER STICKY */}
        <header className="bg-white dark:bg-slate-800 shadow-sm border-b border-slate-200 dark:border-slate-700 sticky top-0 z-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex items-center gap-3">
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Users size={24} className="text-purple-600" />
                  Équipe & Rôles
                </h1>
                <p className="text-sm text-slate-500 dark:text-slate-400">Gérez les accès et les permissions de vos collaborateurs</p>
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 sm:space-y-8">
          
          {/* SECTION RÔLES */}
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6">
              <h2 className="text-lg font-semibold flex items-center gap-2 text-slate-900 dark:text-white">
                <Shield size={20} className="text-purple-600 dark:text-purple-400"/>
                Rôles et Permissions
              </h2>
              {hasPermission('team.manage_roles') && (
                <button onClick={() => openRoleModal()} className="w-full sm:w-auto flex items-center justify-center gap-2 bg-purple-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors active:scale-95">
                  <Plus size={16} /> Créer un rôle
                </button>
              )}
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {roles.map(role => (
                <div key={role.$id} className="border border-slate-200 dark:border-slate-700 rounded-xl p-4 hover:shadow-md dark:hover:bg-slate-700/50 transition-all">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-semibold text-slate-900 dark:text-white">{role.name}</h3>
                    {role.isDefault && <span className="text-[10px] font-medium bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-full">Par défaut</span>}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">{role.permissions.length} permissions</p>
                  <div className="flex flex-wrap gap-1.5 mb-4 min-h-[2rem]">
                    {role.permissions.slice(0, 3).map(p => {
                      const allItems = ALL_PERMISSIONS.flatMap(c => c.items);
                      const permObj = allItems.find(item => item.key === p);
                      return <span key={p} className="text-[10px] font-medium bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 px-2 py-0.5 rounded-full">{permObj ? permObj.label : p}</span>;
                    })}
                    {role.permissions.length > 3 && <span className="text-[10px] text-slate-400 dark:text-slate-500 self-center">+{role.permissions.length - 3}</span>}
                  </div>
                  <div className="flex gap-2 pt-3 border-t border-slate-100 dark:border-slate-700">
                    {hasPermission('team.manage_roles') && (
                      <button onClick={() => openRoleModal(role)} className="flex-1 flex items-center justify-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 py-2 rounded-lg transition-colors">
                        <Edit3 size={12} /> Modifier
                      </button>
                    )}
                    {!role.isDefault && hasPermission('team.manage_roles') && (
                      <button onClick={() => handleDeleteRole(role.$id, role.name)} className="flex-1 flex items-center justify-center gap-1 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 py-2 rounded-lg transition-colors">
                        <Archive size={12} /> Supprimer
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* SECTION MEMBRES */}
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6">
              <h2 className="text-lg font-semibold flex items-center gap-2 text-slate-900 dark:text-white">
                <UserPlus size={20} className="text-purple-600 dark:text-purple-400"/>
                {viewMode === 'active' ? 'Membres de l\'équipe' : 'Membres Archivés'}
              </h2>
              {viewMode === 'active' && hasPermission('team.invite') && (
                <button onClick={() => setShowMemberModal(true)} className="w-full sm:w-auto flex items-center justify-center gap-2 bg-purple-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors active:scale-95">
                  <Plus size={16} /> Ajouter un membre
                </button>
              )}
            </div>

            <div className="flex border-b border-slate-200 dark:border-slate-700 mb-4 overflow-x-auto">
              <button onClick={() => setViewMode('active')} className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${viewMode === 'active' ? 'border-purple-600 text-purple-600 dark:text-purple-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}>
                Actifs ({activeMembers.length})
              </button>
              <button onClick={() => setViewMode('archived')} className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${viewMode === 'archived' ? 'border-purple-600 text-purple-600 dark:text-purple-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}>
                Archivés ({archivedMembers.length})
              </button>
            </div>

            <div className="overflow-x-auto -mx-4 sm:mx-0">
              <table className="w-full text-left min-w-[600px]">
                <thead className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Nom</th>
                    <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Email</th>
                    <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Rôle</th>
                    <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Statut</th>
                    <th className="p-4 text-right text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {currentMembersList.length === 0 ? (
                    <tr><td colSpan={5} className="p-8 text-center text-slate-500 dark:text-slate-400 text-sm">{viewMode === 'active' ? 'Aucun membre actif dans l\'équipe.' : 'Aucun membre archivé.'}</td></tr>
                  ) : (
                    currentMembersList.map(member => (
                      <tr key={member.$id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                        <td className="p-4 text-sm font-medium text-slate-900 dark:text-white">{member.name || '-'}</td>
                        <td className="p-4 text-sm text-slate-600 dark:text-slate-300">{member.email}</td>
                        <td className="p-4 text-sm text-slate-600 dark:text-slate-300">{member.role.name}</td>
                        <td className="p-4">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${member.status === 'active' ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}`}>
                            {member.status === 'active' ? 'Actif' : 'Archivé'}
                          </span>
                        </td>
                        <td className="p-4 text-right">
                          <div className="flex justify-end gap-1">
                            {viewMode === 'active' ? (
                              <>
                                {hasPermission('team.invite') && (
                                  <button onClick={() => { const link = `${window.location.origin}/join-team?email=${encodeURIComponent(member.email)}`; copyToClipboard(link, member.$id); }} className={`p-2 rounded-lg transition-colors ${copiedMemberId === member.$id ? 'text-green-600 bg-green-50 dark:bg-green-900/30' : 'text-blue-500 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/30'}`} title="Copier le lien d'inscription">
                                    {copiedMemberId === member.$id ? <Check size={16} /> : <Copy size={16} />}
                                  </button>
                                )}
                                {hasPermission('team.manage_roles') && (
                                  <button onClick={() => openEditRoleModal(member)} className="p-2 text-purple-500 hover:text-purple-700 hover:bg-purple-50 dark:hover:bg-purple-900/30 rounded-lg transition-colors" title="Modifier le rôle"><Edit3 size={16} /></button>
                                )}
                                {hasPermission('team.remove_member') && (
                                  <button onClick={() => handleArchiveMember(member.$id, member.email)} className="p-2 text-orange-500 hover:text-orange-700 hover:bg-orange-50 dark:hover:bg-orange-900/30 rounded-lg transition-colors" title="Archiver ce membre"><Archive size={16} /></button>
                                )}
                              </>
                            ) : (
                              hasPermission('team.remove_member') && (
                                <button onClick={() => handleUnarchiveMember(member.$id)} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/30 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/50 transition-colors active:scale-95" title="Désarchiver">
                                  <RotateCcw size={14} /> Désarchiver
                                </button>
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

        {/* MODAL CRÉATION/MODIFICATION RÔLE */}
        {showRoleModal && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4 animate-fadeIn">
            <div className="bg-white dark:bg-slate-800 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-2xl max-h-[90vh] flex flex-col animate-slideUp">
              <div className="p-4 sm:p-6 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center flex-shrink-0">
                <h3 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">{editingRoleId ? 'Modifier le rôle' : 'Créer un nouveau rôle'}</h3>
                <button onClick={() => setShowRoleModal(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors text-slate-500 dark:text-slate-400">
                  <X size={20} />
                </button>
              </div>
              <div className="p-4 sm:p-6 space-y-6 overflow-y-auto flex-1">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Nom du rôle</label>
                  <input type="text" value={newRoleName} onChange={(e) => setNewRoleName(e.target.value)} placeholder="Ex: Comptable, Commercial..." className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-3 text-sm focus:ring-2 focus:ring-purple-500 outline-none transition-shadow" />
                </div>
                <div>
                  <div className="flex justify-between items-center mb-3">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Permissions ({selectedPermissions.length}/{ALL_PERMISSIONS.flatMap(c => c.items).length})</label>
                    <div className="flex gap-3">
                      <button onClick={selectAll} className="text-xs font-medium text-purple-600 dark:text-purple-400 hover:underline">Tout cocher</button>
                      <button onClick={deselectAll} className="text-xs font-medium text-slate-500 dark:text-slate-400 hover:underline">Tout décocher</button>
                    </div>
                  </div>
                  <div className="space-y-3 border border-slate-200 dark:border-slate-700 rounded-xl p-4 max-h-80 overflow-y-auto bg-slate-50 dark:bg-slate-900/50">
                    {ALL_PERMISSIONS.map(category => (
                      <div key={category.category} className="bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-100 dark:border-slate-700">
                        <h4 className="text-xs font-bold text-purple-700 dark:text-purple-400 uppercase mb-2 border-b border-slate-100 dark:border-slate-700 pb-1.5">{category.category}</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
                          {category.items.map(perm => (
                            <label key={perm.key} className="flex items-center gap-2.5 text-sm text-slate-700 dark:text-slate-300 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50 p-1.5 rounded-md transition-colors">
                              <input type="checkbox" checked={selectedPermissions.includes(perm.key)} onChange={() => togglePermission(perm.key)} className="w-4 h-4 text-purple-600 rounded border-slate-300 dark:border-slate-600 dark:bg-slate-700 focus:ring-purple-500 focus:ring-offset-0" />
                              {perm.label}
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="p-4 sm:p-6 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-3 flex-shrink-0 bg-slate-50 dark:bg-slate-800/90 rounded-b-2xl">
                <button onClick={() => setShowRoleModal(false)} className="flex-1 sm:flex-none px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600 active:scale-95 transition-all">
                  Annuler
                </button>
                <button onClick={handleSaveRole} disabled={!newRoleName.trim() || selectedPermissions.length === 0} className="flex-1 sm:flex-none px-4 py-3 text-sm font-semibold text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center justify-center gap-2 active:scale-95 transition-all">
                  <CheckSquare size={16} /> {editingRoleId ? 'Enregistrer' : 'Créer le rôle'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL MODIFICATION RÔLE MEMBRE */}
        {showEditRoleModal && editingMember && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4 animate-fadeIn">
            <div className="bg-white dark:bg-slate-800 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md animate-slideUp">
              <div className="p-4 sm:p-6 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Modifier le rôle</h3>
                <button onClick={() => setShowEditRoleModal(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors text-slate-500 dark:text-slate-400">
                  <X size={20} />
                </button>
              </div>
              <div className="p-4 sm:p-6 space-y-4">
                <p className="text-sm text-slate-600 dark:text-slate-400">Changer le rôle de <strong className="text-slate-900 dark:text-white">{editingMember.name || editingMember.email}</strong></p>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Nouveau rôle</label>
                  <select value={selectedNewRoleId} onChange={(e) => setSelectedNewRoleId(e.target.value)} className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-3 text-sm bg-white focus:ring-2 focus:ring-purple-500 outline-none">
                    {roles.map(r => <option key={r.$id} value={r.$id}>{r.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="p-4 sm:p-6 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-3 bg-slate-50 dark:bg-slate-800/90 rounded-b-2xl">
                <button onClick={() => setShowEditRoleModal(false)} className="flex-1 px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600 active:scale-95 transition-all">
                  Annuler
                </button>
                <button onClick={handleSaveRoleChange} className="flex-1 px-4 py-3 text-sm font-semibold text-white bg-purple-600 rounded-lg hover:bg-purple-700 flex items-center justify-center gap-2 active:scale-95 transition-all">
                  <CheckSquare size={16} /> Enregistrer
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL AJOUT MEMBRE */}
        {showMemberModal && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4 animate-fadeIn">
            <div className="bg-white dark:bg-slate-800 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md animate-slideUp">
              <div className="p-4 sm:p-6 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Ajouter un membre</h3>
                <button onClick={() => setShowMemberModal(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors text-slate-500 dark:text-slate-400">
                  <X size={20} />
                </button>
              </div>
              <div className="p-4 sm:p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Nom complet</label>
                  <input type="text" value={newMemberName} onChange={(e) => setNewMemberName(e.target.value)} placeholder="Ex: Jean Dupont" className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-3 text-sm focus:ring-2 focus:ring-purple-500 outline-none transition-shadow" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Adresse email</label>
                  <input type="email" value={newMemberEmail} onChange={(e) => setNewMemberEmail(e.target.value)} placeholder="Ex: jean@exemple.com" className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-3 text-sm focus:ring-2 focus:ring-purple-500 outline-none transition-shadow" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Rôle</label>
                  <select value={newMemberRoleId} onChange={(e) => setNewMemberRoleId(e.target.value)} className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-3 text-sm bg-white focus:ring-2 focus:ring-purple-500 outline-none">
                    <option value="">Choisir un rôle...</option>
                    {roles.map(r => <option key={r.$id} value={r.$id}>{r.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="p-4 sm:p-6 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-3 bg-slate-50 dark:bg-slate-800/90 rounded-b-2xl">
                <button onClick={() => setShowMemberModal(false)} className="flex-1 px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600 active:scale-95 transition-all">
                  Annuler
                </button>
                <button onClick={handleAddMember} disabled={!newMemberName.trim() || !newMemberEmail.trim() || !newMemberRoleId} className="flex-1 px-4 py-3 text-sm font-semibold text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center justify-center gap-2 active:scale-95 transition-all">
                  <UserPlus size={16} /> Ajouter
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL LIEN D'INVITATION */}
        {showLinkModal && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4 animate-fadeIn">
            <div className="bg-white dark:bg-slate-800 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md animate-slideUp">
              <div className="p-4 sm:p-6 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Membre ajouté !</h3>
                <button onClick={() => setShowLinkModal(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors text-slate-500 dark:text-slate-400">
                  <X size={20} />
                </button>
              </div>
              <div className="p-4 sm:p-6 space-y-4">
                <p className="text-sm text-slate-600 dark:text-slate-400">Envoyez ce lien à <strong className="text-slate-900 dark:text-white">{generatedEmail}</strong> pour qu'il puisse créer son compte :</p>
                <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 p-3 rounded-lg text-sm text-purple-700 dark:text-purple-300 break-all font-mono">
                  {generatedLink}
                </div>
                <div className="flex flex-col sm:flex-row gap-3">
                  <button onClick={() => copyToClipboard(generatedLink)} className="flex-1 bg-purple-600 text-white px-3 py-3 rounded-lg text-sm font-medium hover:bg-purple-700 flex items-center justify-center gap-2 active:scale-95 transition-all">
                    {linkCopied ? <><Check size={16} /> Copié !</> : <><Copy size={16} /> Copier le lien</>}
                  </button>
                  <button onClick={() => window.open(generatedLink, '_blank')} className="flex-1 bg-blue-600 text-white px-3 py-3 rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center justify-center gap-2 active:scale-95 transition-all">
                    <ExternalLink size={16} /> Ouvrir
                  </button>
                </div>
              </div>
              <div className="p-4 sm:p-6 border-t border-slate-200 dark:border-slate-700 flex justify-end bg-slate-50 dark:bg-slate-800/90 rounded-b-2xl">
                <button onClick={() => setShowLinkModal(false)} className="w-full sm:w-auto px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600 active:scale-95 transition-all">
                  Fermer
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Sidebar>
  );
}