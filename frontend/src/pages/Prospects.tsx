import Sidebar from '../components/Sidebar';
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { databases, DATABASE_ID } from '../appwrite';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { useCompanySettings } from '../hooks/useCompanySettings';
import { toast } from 'sonner';
import {
  PageHeader, Modal, ActionMenu, ActionMenuItem, StatCell, StatusIndicator,
  DotLabel, Avatar, SkeletonRow, SkeletonCard, TypeTabs, KPIGrid, Pagination,
  mapInvoiceStatusToShared, toEntity, formatDate,
  type Entity, type DotTone,
} from '../components/ui/SharedUI';
import {
  Plus, Search, Edit2, Phone, Mail, Building, FileText,
  Users, Filter, AlertCircle, UserCheck, Archive, RotateCcw
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
  $createdAt?: string;
}

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

const sourceTones: Record<string, DotTone> = {
  website: 'sky',
  phone: 'teal',
  referral: 'violet',
  other: 'slate'
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
  const { currency, currencyConfig, loading: settingsLoading } = useCompanySettings();

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
  const [prospectToArchive, setProspectToArchive] = useState<Prospect | null>(null);
  const [prospectToConvert, setProspectToConvert] = useState<Prospect | null>(null);
  const [converting, setConverting] = useState(false);
  const [activeStat, setActiveStat] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const ITEMS_PER_PAGE = 20;

  // ⌘K / Ctrl+K : focus recherche
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (!permLoading && !hasPermission('prospects.view')) navigate('/dashboard');
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
      
      // ✅ AJOUTEZ CES LOGS POUR VÉRIFIER L'INCOHÉRENCE
      console.log("🔍 DEBUG Prospects.tsx - teamId résolu pour la recherche:", teamId);
      console.log("🔍 DEBUG Prospects.tsx - user.$id:", user.$id);

      if (!teamId) { if (!background) setLoading(false); return; }
      setCurrentTeamId(teamId);
      
      const response = await databases.listDocuments(
        DATABASE_ID, 'prospects',
        [Query.equal('teamId', teamId), Query.orderDesc('$createdAt'), Query.limit(2000)]
      );
      
      console.log("🔍 DEBUG Prospects.tsx - Nombre de documents trouvés:", response.documents.length);
      if (response.documents.length > 0) {
        console.log("🔍 DEBUG Prospects.tsx - teamId du premier prospect trouvé:", response.documents[0].teamId);
      }
      
      setProspects(response.documents as unknown as Prospect[]);
    } catch (error) {
      console.error('❌ Erreur chargement prospects:', error);
      toast.error('Erreur de chargement des prospects');
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
      toast.error('Champs requis', { description: 'Veuillez remplir le prénom et le nom.' });
      return;
    }
    if (!currentTeamId) {
      toast.error('Erreur', { description: 'Aucune équipe trouvée' });
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
        toast.success('Prospect mis à jour', { description: `${form.firstName} ${form.lastName}`.trim() });
      } else {
        await databases.createDocument(DATABASE_ID, 'prospects', ID.unique(), data, perms);
        toast.success('Prospect ajouté', { description: `${form.firstName} ${form.lastName}`.trim() });
      }
      setShowModal(false);
      setDuplicateFound(null);
      setEditingId(null);
      setForm({ ...emptyForm });
      setSearch('');
      await loadProspects();
    } catch (error: any) {
      console.error("❌ ERREUR APPWRITE:", error);
      toast.error('Erreur lors de l\'enregistrement', { description: error.message });
    } finally {
      setSaving(false);
    }
  };

  const handleConvertToClient = async () => {
    const prospect = prospectToConvert;
    if (!prospect) return;
    if (!user?.secureTeamId) {
      toast.error('Erreur de sécurité', { description: 'Équipe native non chargée.' });
      return;
    }
    setConverting(true);
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
      setProspectToConvert(null);
      await loadProspects(true);
      toast.success('Prospect converti en client', {
        description: `Numéro client : ${newClientId}`,
        action: { label: 'Voir les clients', onClick: () => navigate('/clients') },
      });
    } catch (error: any) {
      console.error('Erreur conversion:', error);
      toast.error('Erreur lors de la conversion', { description: error.message });
    } finally {
      setConverting(false);
    }
  };

  const handleQuickStatusChange = async (prospectId: string, newStatus: string) => {
    try {
      await databases.updateDocument(DATABASE_ID, 'prospects', prospectId, { status: newStatus });
      toast.success('Statut mis à jour', { description: statusLabels[newStatus] || newStatus });
      await loadProspects(true);
    } catch (error: any) {
      toast.error('Erreur', { description: error.message });
    }
  };

  const handleArchive = async () => {
    if (!prospectToArchive) return;
    try {
      const doc = await databases.getDocument(DATABASE_ID, 'prospects', prospectToArchive.$id);
      if (doc.teamId !== currentTeamId) { toast.error('Accès refusé'); return; }
      await databases.updateDocument(DATABASE_ID, 'prospects', prospectToArchive.$id, { status: 'archived' });
      toast.success('Prospect archivé', { description: `${prospectToArchive.firstName} ${prospectToArchive.lastName}`.trim() });
      setProspectToArchive(null);
      await loadProspects(true);
    } catch (error: any) {
      toast.error('Erreur', { description: error.message });
    }
  };

  const handleUnarchive = async (id: string, name: string) => {
    try {
      const doc = await databases.getDocument(DATABASE_ID, 'prospects', id);
      if (doc.teamId !== currentTeamId) { toast.error('Accès refusé'); return; }
      await databases.updateDocument(DATABASE_ID, 'prospects', id, { status: 'new' });
      toast.success('Prospect désarchivé', { description: name });
      await loadProspects(true);
      setViewMode('active');
    } catch (error: any) {
      toast.error('Erreur', { description: error.message });
    }
  };

  const filtered = prospects.filter(p => {
    const searchStr = `${p.firstName} ${p.lastName} ${p.companyName} ${p.email} ${p.phone} ${statusLabels[p.status]}`.toLowerCase();
    const matchSearch = search === '' || searchStr.includes(search.toLowerCase());
    const matchStatus = filterStatus === 'all' || p.status === filterStatus;
    const matchView = viewMode === 'active' ? p.status !== 'archived' : p.status === 'archived';
    return matchSearch && matchStatus && matchView;
  });

  const totalActive = prospects.filter(p => p.status !== 'archived').length;
  const totalNew = prospects.filter(p => p.status !== 'archived' && p.status === 'new').length;
  const totalQuoteSent = prospects.filter(p => p.status !== 'archived' && p.status === 'quote_sent').length;
  const totalWon = prospects.filter(p => p.status === 'won').length;
  const totalArchived = prospects.filter(p => p.status === 'archived').length;

  const now = new Date();
  const prevMonthRef = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const isThisMonth = (d?: string) => {
    if (!d) return false;
    const dt = new Date(d);
    return dt.getMonth() === now.getMonth() && dt.getFullYear() === now.getFullYear();
  };
  const isPrevMonth = (d?: string) => {
    if (!d) return false;
    const dt = new Date(d);
    return dt.getMonth() === prevMonthRef.getMonth() && dt.getFullYear() === prevMonthRef.getFullYear();
  };
  const calcTrend = (pred: (p: Prospect) => boolean) => {
    const cur = prospects.filter(p => pred(p) && isThisMonth(p.$createdAt)).length;
    const prev = prospects.filter(p => pred(p) && isPrevMonth(p.$createdAt)).length;
    if (prev === 0) return cur > 0 ? 100 : 0;
    return Math.round(((cur - prev) / prev) * 1000) / 10;
  };

  const trendActive = calcTrend(p => p.status !== 'archived');
  const trendNew = calcTrend(p => p.status !== 'archived' && p.status === 'new');
  const trendQuote = calcTrend(p => p.status !== 'archived' && p.status === 'quote_sent');
  const trendWon = calcTrend(p => p.status === 'won');

  // ✅ Onglets migrés vers TypeTabs
  const viewTabs = [
    { key: 'active', label: 'Actifs', count: totalActive },
    { key: 'archived', label: 'Archivés', count: totalArchived },
  ];

  // Pagination
  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const paginatedProspects = filtered.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [search, filterStatus, viewMode]);

  if (permLoading || settingsLoading) return (
    <Sidebar>
      <div className="flex items-center justify-center h-full w-full">
        <div className="text-slate-500 dark:text-slate-400 text-lg animate-pulse">Vérification des droits...</div>
      </div>
    </Sidebar>
  );
  if (!hasPermission('prospects.view')) return null;

  return (
    <Sidebar>
      <div className="min-h-full bg-slate-50 dark:bg-slate-900">
        {/* ✅ EN-TÊTE migré vers PageHeader */}
        <PageHeader
          icon={Users}
          iconColor="purple"
          title="Prospects"
          description={
            <>
              <span className="font-semibold text-slate-700 dark:text-slate-300 tabular-nums">{filtered.length}</span> résultat(s) {viewMode === 'active' ? 'actif(s)' : 'archivé(s)'}
            </>
          }
          currency={currency || 'EUR'}
          currencySymbol={currencyConfig?.symbol || '€'}
          action={
            viewMode === 'active' && hasPermission('prospects.create') ? (
              <button onClick={handleOpenAdd} className="w-full sm:w-auto flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-4 py-2.5 rounded-lg hover:from-purple-700 hover:to-indigo-700 transition-all font-medium text-sm shadow-lg shadow-purple-500/30 active:scale-95">
                <Plus size={18} /> <span>Nouveau prospect</span>
              </button>
            ) : null
          }
        />

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {/* ✅ KPIs migrés vers KPIGrid + StatCell */}
          <KPIGrid columns={4}>
            <StatCell value={totalActive} trend={trendActive} label="Prospects actifs" active={activeStat === 0} onClick={() => setActiveStat(0)} />
            <StatCell value={totalNew} trend={trendNew} label="Nouveaux" active={activeStat === 1} onClick={() => setActiveStat(1)} />
            <StatCell value={totalQuoteSent} trend={trendQuote} label="Devis envoyés" active={activeStat === 2} onClick={() => setActiveStat(2)} />
            <StatCell value={totalWon} trend={trendWon} label="Gagnés" active={activeStat === 3} onClick={() => setActiveStat(3)} />
          </KPIGrid>

          {/* ✅ ONGLETS migrés vers TypeTabs */}
          <TypeTabs
            tabs={viewTabs}
            activeTab={viewMode}
            onTabChange={(key) => setViewMode(key as 'active' | 'archived')}
            color="purple"
          />

          {/* RECHERCHE + FILTRES */}
          <div className="flex flex-col sm:flex-row gap-3 mb-6">
            <div className="relative flex-1">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Rechercher (nom, entreprise, email...)"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-16 py-3 border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white rounded-lg focus:ring-2 focus:ring-purple-500 outline-none text-sm transition-shadow"
              />
              <div className="hidden sm:flex absolute right-3 top-1/2 -translate-y-1/2 items-center gap-1 pointer-events-none">
                <kbd className="h-5 select-none items-center gap-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-1.5 font-mono text-[10px] font-medium text-slate-500 dark:text-slate-400 flex">⌘K</kbd>
              </div>
            </div>
            {viewMode === 'active' && (
              <div className="relative sm:w-64">
                <Filter size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="w-full pl-10 pr-4 py-3 border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white rounded-lg focus:ring-2 focus:ring-purple-500 outline-none text-sm bg-white dark:bg-slate-800 appearance-none cursor-pointer">
                  <option value="all">Tous les statuts</option>
                  {Object.entries(statusLabels).filter(([k]) => k !== 'archived').map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {loading ? (
            <>
              <div className="hidden md:block bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-visible">
                <table className="w-full">
                  <thead className="bg-slate-50/80 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700 [&>tr>th:first-child]:rounded-tl-xl [&>tr>th:last-child]:rounded-tr-xl">
                    <tr>
                      <th className="text-left px-6 py-4 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Prospect</th>
                      <th className="text-left px-6 py-4 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Contact</th>
                      <th className="text-left px-6 py-4 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Source</th>
                      <th className="text-left px-6 py-4 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Statut</th>
                      <th className="text-right px-2 py-4 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-12"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                    {[1, 2, 3, 4, 5].map(i => <SkeletonRow key={i} />)}
                  </tbody>
                </table>
              </div>
              <div className="md:hidden space-y-4">
                {[1, 2, 3].map(i => <SkeletonCard key={i} />)}
              </div>
            </>
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
              {/* TABLEAU DESKTOP */}
              <div className="hidden md:block bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-visible">
                <div className="overflow-visible">
                  <table className="w-full">
                    <thead className="bg-slate-50/80 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700 [&>tr>th:first-child]:rounded-tl-xl [&>tr>th:last-child]:rounded-tr-xl">
                      <tr>
                        <th className="text-left px-6 py-4 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Prospect</th>
                        <th className="text-left px-6 py-4 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Contact</th>
                        <th className="text-left px-6 py-4 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Source</th>
                        <th className="text-left px-6 py-4 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Statut</th>
                        <th className="text-right px-2 py-4 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-12"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                      {paginatedProspects.map((p) => (
                        <tr key={p.$id} className="group hover:bg-purple-50/50 dark:hover:bg-slate-700/30 transition-colors duration-200 last:[&>td:first-child]:rounded-bl-xl last:[&>td:last-child]:rounded-br-xl">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <Avatar client={toEntity(p)} />
                              <div className="min-w-0">
                                <div className="font-semibold text-slate-900 dark:text-white text-sm truncate">{p.firstName} {p.lastName}</div>
                                {p.companyName && (
                                  <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-0.5 truncate">
                                    <Building size={11} /> {p.companyName}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-col space-y-1">
                              {p.email && <span className="flex items-center text-xs text-slate-600 dark:text-slate-300 truncate max-w-[200px]"><Mail size={13} className="mr-1.5 text-slate-400 flex-shrink-0" />{p.email}</span>}
                              {p.phone && <span className="flex items-center text-xs text-slate-600 dark:text-slate-300 tabular-nums"><Phone size={13} className="mr-1.5 text-slate-400" />{p.phone}</span>}
                              {!p.email && !p.phone && <span className="text-xs text-slate-400 italic">Non renseigné</span>}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <DotLabel label={sourceLabels[p.source] || p.source} tone={sourceTones[p.source] || 'slate'} />
                          </td>
                          <td className="px-6 py-4">
                            <StatusIndicator status={p.status} />
                          </td>
                          <td className="px-2 py-4 text-right w-12">
                            <div className="flex justify-end opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                              <ActionMenu>
                                {viewMode === 'active' ? (
                                  <>
                                    {p.status === 'new' && hasPermission('prospects.edit') && (
                                      <ActionMenuItem onClick={() => handleQuickStatusChange(p.$id, 'contacted')} icon={Phone} label="Marquer contacté" />
                                    )}
                                    {hasPermission('clients.create') && p.status !== 'won' && (
                                      <ActionMenuItem onClick={() => setProspectToConvert(p)} icon={UserCheck} label="Convertir en client" />
                                    )}
                                    {hasPermission('quotes.create') && (
                                      <ActionMenuItem onClick={() => navigate(`/quotes?prospectId=${p.$id}`)} icon={FileText} label="Créer un devis" />
                                    )}
                                    {hasPermission('prospects.edit') && (
                                      <ActionMenuItem onClick={() => handleOpenEdit(p)} icon={Edit2} label="Modifier" />
                                    )}
                                    {hasPermission('prospects.delete') && (
                                      <ActionMenuItem onClick={() => setProspectToArchive(p)} icon={Archive} label="Archiver" danger />
                                    )}
                                  </>
                                ) : (
                                  <ActionMenuItem onClick={() => handleUnarchive(p.$id, `${p.firstName} ${p.lastName}`.trim())} icon={RotateCcw} label="Désarchiver" />
                                )}
                              </ActionMenu>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* CARTES MOBILE */}
              <div className="md:hidden space-y-4">
                {paginatedProspects.map((p) => (
                  <div key={p.$id} className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5">
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <Avatar client={toEntity(p)} size="lg" />
                        <div className="min-w-0">
                          <h3 className="font-bold text-slate-900 dark:text-white truncate text-base">{p.firstName} {p.lastName}</h3>
                          <div className="flex items-center gap-2 mt-0.5">
                            {p.companyName
                              ? <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate">{p.companyName}</span>
                              : <DotLabel label={sourceLabels[p.source] || p.source} tone={sourceTones[p.source] || 'slate'} />
                            }
                            {p.companyName && (
                              <>
                                <span className="text-slate-300 dark:text-slate-600">•</span>
                                <DotLabel label={sourceLabels[p.source] || p.source} tone={sourceTones[p.source] || 'slate'} />
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      <StatusIndicator status={p.status} />
                    </div>
                    <div className="space-y-2 mb-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl p-3 border border-slate-100 dark:border-slate-700/50">
                      {p.phone && <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300 text-sm tabular-nums"><Phone size={14} className="text-slate-400" /> {p.phone}</div>}
                      {p.email && <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300 text-sm truncate"><Mail size={14} className="text-slate-400 flex-shrink-0" /> <span className="truncate">{p.email}</span></div>}
                      {!p.phone && !p.email && <div className="text-xs text-slate-400 italic text-center py-1">Aucun contact renseigné</div>}
                    </div>
                    <div className="pt-3 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between gap-2">
                      {viewMode === 'active' ? (
                        <div className="flex items-center gap-2 flex-1">
                          {hasPermission('quotes.create') && (
                            <button onClick={() => navigate(`/quotes?prospectId=${p.$id}`)} className="flex-1 flex items-center justify-center gap-1.5 p-2.5 text-green-600 bg-green-50 dark:bg-green-900/30 rounded-lg active:scale-95 transition-transform text-xs font-medium">
                              <FileText size={16} /> Devis
                            </button>
                          )}
                          {hasPermission('clients.create') && p.status !== 'won' && (
                            <button onClick={() => setProspectToConvert(p)} className="flex-1 flex items-center justify-center gap-1.5 p-2.5 text-blue-600 bg-blue-50 dark:bg-blue-900/30 rounded-lg active:scale-95 transition-transform text-xs font-medium">
                              <UserCheck size={16} /> Client
                            </button>
                          )}
                        </div>
                      ) : (
                        <button onClick={() => handleUnarchive(p.$id, `${p.firstName} ${p.lastName}`.trim())} className="w-full flex items-center justify-center gap-2 p-3 text-sm font-medium text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/30 rounded-lg active:scale-95 transition-transform">
                          <RotateCcw size={16} /><span>Désarchiver</span>
                        </button>
                      )}
                      {viewMode === 'active' && (
                        <ActionMenu>
                          {p.status === 'new' && hasPermission('prospects.edit') && (
                            <ActionMenuItem onClick={() => handleQuickStatusChange(p.$id, 'contacted')} icon={Phone} label="Marquer contacté" />
                          )}
                          {hasPermission('prospects.edit') && (
                            <ActionMenuItem onClick={() => handleOpenEdit(p)} icon={Edit2} label="Modifier" />
                          )}
                          {hasPermission('prospects.delete') && (
                            <ActionMenuItem onClick={() => setProspectToArchive(p)} icon={Archive} label="Archiver" danger />
                          )}
                        </ActionMenu>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* ✅ PAGINATION ajoutée */}
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
                startItem={(currentPage - 1) * ITEMS_PER_PAGE + 1}
                endItem={Math.min(currentPage * ITEMS_PER_PAGE, filtered.length)}
                totalItems={filtered.length}
                itemName="prospect"
              />
            </>
          )}
        </main>

        {/* MODAL Création / Édition - migré vers Modal */}
        <Modal
          open={showModal}
          onClose={() => { setShowModal(false); setDuplicateFound(null); }}
          title={editingId ? 'Modifier le prospect' : 'Nouveau prospect'}
          icon={<Users size={20} className="text-purple-600" />}
          maxWidth="sm:max-w-2xl"
          footer={
            <>
              <button onClick={() => { setShowModal(false); setDuplicateFound(null); }} className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600 active:scale-95 transition-all">Annuler</button>
              <button onClick={handleSave} disabled={saving || !form.firstName || !form.lastName} className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-purple-600 to-indigo-600 rounded-lg hover:from-purple-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 transition-all flex items-center justify-center gap-2 shadow-lg shadow-purple-500/20">
                {saving ? <><span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span> Enregistrement...</> : (editingId ? 'Mettre à jour' : 'Ajouter')}
              </button>
            </>
          }
        >
          <div className="space-y-5">
            {duplicateFound && !editingId && (
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 text-yellow-800 dark:text-yellow-200 px-4 py-3 rounded-xl shadow-sm">
                <p className="font-semibold flex items-center gap-2 text-sm"><AlertCircle size={16} /> Doublon détecté</p>
                <p className="text-sm mt-1">Un prospect avec ces coordonnées existe déjà : <strong>{duplicateFound.firstName} {duplicateFound.lastName}</strong>.</p>
                <div className="flex gap-2 mt-3">
                  <button type="button" onClick={() => { handleOpenEdit(duplicateFound); }} className="px-3 py-2 bg-purple-600 text-white text-xs font-medium rounded-lg hover:bg-purple-700 active:scale-95 transition-transform shadow-sm">Mettre à jour</button>
                  <button type="button" onClick={() => setDuplicateFound(null)} className="px-3 py-2 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-medium rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600 active:scale-95 transition-transform">Créer quand même</button>
                </div>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">Prénom *</label>
                <input type="text" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} className="w-full px-4 py-2.5 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none shadow-sm" placeholder="Jean" />
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">Nom *</label>
                <input type="text" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} className="w-full px-4 py-2.5 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none shadow-sm" placeholder="Dupont" />
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5 flex items-center gap-1.5"><Building size={12} />Entreprise</label>
              <input type="text" value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} className="w-full px-4 py-2.5 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none shadow-sm" placeholder="Dupont Plomberie" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5 flex items-center gap-1.5"><Mail size={12} />Email</label>
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full px-4 py-2.5 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none shadow-sm" placeholder="jean@dupont.fr" />
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5 flex items-center gap-1.5"><Phone size={12} />Téléphone</label>
                <input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full px-4 py-2.5 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none shadow-sm" placeholder="06 12 34 56 78" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">Source</label>
                <select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} className="w-full px-4 py-2.5 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none bg-white dark:bg-slate-700 shadow-sm">
                  {Object.entries(sourceLabels).map(([key, label]) => (<option key={key} value={key}>{label}</option>))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">Statut</label>
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-full px-4 py-2.5 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none bg-white dark:bg-slate-700 shadow-sm">
                  {Object.entries(statusLabels).filter(([k]) => k !== 'archived').map(([key, label]) => (<option key={key} value={key}>{label}</option>))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">Adresse</label>
              <input type="text" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="w-full px-4 py-2.5 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none shadow-sm" placeholder="123 rue de la Paix, 75000 Paris" />
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">Besoins</label>
              <textarea value={form.needs} onChange={(e) => setForm({ ...form, needs: e.target.value })} rows={2} className="w-full px-4 py-2.5 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none resize-none shadow-sm" placeholder="Décrivez les besoins..." />
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">Notes</label>
              <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full px-4 py-2.5 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none resize-none shadow-sm" placeholder="Notes internes..." />
            </div>
          </div>
        </Modal>

        {/* MODAL Confirmation conversion en client - migré vers Modal */}
        {prospectToConvert && (
          <Modal
            open={!!prospectToConvert}
            onClose={() => setProspectToConvert(null)}
            title="Convertir en client ?"
            icon={<UserCheck size={20} className="text-purple-600" />}
            maxWidth="sm:max-w-md"
            footer={
              <>
                <button onClick={() => setProspectToConvert(null)} className="flex-1 px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-600 active:scale-95 transition-all">
                  Annuler
                </button>
                <button onClick={handleConvertToClient} disabled={converting} className="flex-1 px-4 py-3 text-sm font-bold text-white bg-gradient-to-r from-purple-600 to-indigo-600 rounded-xl hover:from-purple-700 hover:to-indigo-700 active:scale-95 transition-all shadow-lg shadow-purple-500/20 flex items-center justify-center gap-2 disabled:opacity-50">
                  {converting
                    ? <><span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span> Conversion...</>
                    : <><UserCheck size={16} /> Convertir</>
                  }
                </button>
              </>
            }
          >
            <p className="text-sm text-slate-500 dark:text-slate-400 text-center">
              <strong className="text-slate-700 dark:text-slate-200">{prospectToConvert.firstName} {prospectToConvert.lastName}</strong> deviendra un client actif (fiche créée automatiquement) et ce prospect sera marqué comme <strong className="text-slate-700 dark:text-slate-200">Gagné</strong>.
            </p>
          </Modal>
        )}

        {/* MODAL Confirmation archivage - migré vers Modal */}
        {prospectToArchive && (
          <Modal
            open={!!prospectToArchive}
            onClose={() => setProspectToArchive(null)}
            title="Archiver ce prospect ?"
            icon={<Archive size={20} className="text-red-600" />}
            maxWidth="sm:max-w-md"
            footer={
              <>
                <button onClick={() => setProspectToArchive(null)} className="flex-1 px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-600 active:scale-95 transition-all">
                  Annuler
                </button>
                <button onClick={handleArchive} className="flex-1 px-4 py-3 text-sm font-bold text-white bg-gradient-to-r from-red-500 to-red-600 rounded-xl hover:from-red-600 hover:to-red-700 active:scale-95 transition-all shadow-lg shadow-red-500/20 flex items-center justify-center gap-2">
                  <Archive size={16} /> Confirmer
                </button>
              </>
            }
          >
            <p className="text-sm text-slate-500 dark:text-slate-400 text-center">
              Le prospect <strong className="text-slate-700 dark:text-slate-200">{prospectToArchive.firstName} {prospectToArchive.lastName}</strong> sera masqué de la liste principale. Son historique sera conservé.
            </p>
          </Modal>
        )}
      </div>
    </Sidebar>
  );
}