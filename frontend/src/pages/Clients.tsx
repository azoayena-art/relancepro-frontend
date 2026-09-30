import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { databases, DATABASE_ID } from '../appwrite';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { useCompanySettings } from '../hooks/useCompanySettings';
import Sidebar from '../components/Sidebar';
import { toast } from 'sonner';
import Modal from '../components/ui/Modal';
import ActionMenu, { ActionMenuItem } from '../components/ui/ActionMenu';
import {
  PageHeader,
  TypeTabs,
  KPIGrid,
  StatCell,
  EmptyState,
  Avatar,
  StatusIndicator,
  TypeLabel,
  SkeletonRow,
  SkeletonCard,
  ConfirmDialog,
  FormField,
  Input,
  Select,
  Textarea,
  Alert,
  Pagination,
  ViewTabs,
  SearchFilter,
  SelectFilter,
  MobileCard,
  DataTable,
  type Entity,
} from '../components/ui/SharedUI';
import {
  Plus, Edit2, Phone, Mail, Building,
  UserCheck, FileText, AlertCircle, Archive, RotateCcw, Hash, Eye, User
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

const statusLabels: Record<string, string> = {
  active: 'Actif',
  inactive: 'Inactif',
  archived: 'Archivé'
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
  const { currency, currencyConfig, loading: settingsLoading } = useCompanySettings();

  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [saving, setSaving] = useState(false);
  const [duplicateFound, setDuplicateFound] = useState<Client | null>(null);
  const [currentTeamId, setCurrentTeamId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'active' | 'archived'>('active');
  const [clientToArchive, setClientToArchive] = useState<Client | null>(null);
  const [activeStat, setActiveStat] = useState(0);
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  
  const searchInputRef = useRef<HTMLInputElement>(null);

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
    if (!permLoading && !hasPermission('clients.view')) navigate('/dashboard');
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
          toast.error('Accès refusé', { description: "Ce client n'appartient pas à votre équipe." });
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

  // Reset pagination quand les filtres changent
  useEffect(() => {
    setCurrentPage(1);
  }, [search, filterStatus, filterType, viewMode]);

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
      toast.error('Erreur de chargement des clients');
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
      toast.error('Accès refusé', { description: "Ce client n'appartient pas à votre équipe." });
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
      toast.error('Champs requis', { description: 'Veuillez remplir au moins le nom, le prénom ou le nom de l\'entreprise.' });
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
          toast.error('Accès refusé');
          setSaving(false);
          return;
        }
      }
      if (editingId) {
        await databases.updateDocument(DATABASE_ID, 'clients', editingId, data);
        toast.success('Client mis à jour', { description: `${form.firstName} ${form.lastName}`.trim() });
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
        toast.success('Client ajouté', { description: `N° ${data.clientId}` });
      }
      setShowModal(false);
      setDuplicateFound(null);
      await loadClients();
    } catch (error: any) {
      toast.error('Erreur', { description: error.message });
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async () => {
    if (!clientToArchive) return;
    try {
      const doc = await databases.getDocument(DATABASE_ID, 'clients', clientToArchive.$id);
      if (doc.teamId !== currentTeamId) { toast.error('Accès refusé'); return; }
      await databases.updateDocument(DATABASE_ID, 'clients', clientToArchive.$id, { status: 'archived' });
      toast.success('Client archivé', { description: `${clientToArchive.firstName} ${clientToArchive.lastName}`.trim() });
      setClientToArchive(null);
      await loadClients();
    } catch (error: any) {
      toast.error('Erreur', { description: error.message });
    }
  };

  const handleUnarchive = async (id: string, name: string) => {
    try {
      const doc = await databases.getDocument(DATABASE_ID, 'clients', id);
      if (doc.teamId !== currentTeamId) { toast.error('Accès refusé'); return; }
      await databases.updateDocument(DATABASE_ID, 'clients', id, { status: 'active' });
      toast.success('Client désarchivé', { description: name });
      await loadClients();
      setViewMode('active');
    } catch (error: any) {
      toast.error('Erreur', { description: error.message });
    }
  };

  const filtered = clients.filter(c => {
    const matchSearch = search === '' || `${c.firstName} ${c.lastName} ${c.companyName} ${c.email} ${c.phone} ${c.clientId || ''}`.toLowerCase().includes(search.toLowerCase());
    const matchType = filterType === 'all' || c.type === filterType;
    const matchStatus = viewMode === 'archived' || filterStatus === 'all' || c.status === filterStatus;
    const matchView = viewMode === 'active' ? c.status !== 'archived' : c.status === 'archived';
    return matchSearch && matchType && matchStatus && matchView;
  });

  // Calculs de pagination
  const totalPages = Math.ceil(filtered.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedClients = filtered.slice(startIndex, endIndex);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const typeTabs = [
    { key: 'all', label: 'Tous', count: filtered.length },
    { key: 'particulier', label: 'Particuliers', count: clients.filter(c => c.status !== 'archived' && c.type === 'particulier').length },
    { key: 'entreprise', label: 'Entreprises', count: clients.filter(c => c.status !== 'archived' && c.type === 'entreprise').length },
  ];

  const totalClients = clients.filter(c => c.status !== 'archived').length;
  const totalEntreprises = clients.filter(c => c.status !== 'archived' && c.type === 'entreprise').length;
  const totalParticuliers = clients.filter(c => c.status !== 'archived' && c.type === 'particulier').length;
  const totalArchives = clients.filter(c => c.status === 'archived').length;

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
  const calcTrend = (pred: (c: Client) => boolean) => {
    const cur = clients.filter(c => pred(c) && isThisMonth(c.$createdAt)).length;
    const prev = clients.filter(c => pred(c) && isPrevMonth(c.$createdAt)).length;
    if (prev === 0) return cur > 0 ? 100 : 0;
    return Math.round(((cur - prev) / prev) * 1000) / 10;
  };

  const trendTotal = calcTrend(c => c.status !== 'archived');
  const trendEntreprises = calcTrend(c => c.status !== 'archived' && c.type === 'entreprise');
  const trendParticuliers = calcTrend(c => c.status !== 'archived' && c.type === 'particulier');
  const trendArchives = calcTrend(c => c.status === 'archived');

  const getEntity = (c: Client): Entity => ({
    type: c.type === 'entreprise' ? 'entreprise' : 'particulier',
    firstName: c.firstName,
    lastName: c.lastName,
    companyName: c.companyName,
    email: c.email,
    phone: c.phone
  });

  const statusOptions = [
    { value: 'all', label: 'Tous statuts' },
    { value: 'active', label: 'Actif' },
    { value: 'inactive', label: 'Inactif' }
  ];

  if (permLoading || settingsLoading) return <Sidebar><div className="flex items-center justify-center h-full w-full"><div className="text-slate-500 dark:text-slate-400 text-lg animate-pulse">Vérification des droits...</div></div></Sidebar>;
  if (!hasPermission('clients.view')) return null;

  return (
    <Sidebar>
      <div className="min-h-full bg-slate-50 dark:bg-slate-900">
        <PageHeader
          icon={UserCheck}
          title="Clients"
          description={
            <>
              <span className="font-semibold text-slate-700 dark:text-slate-300 tabular-nums">
                {filtered.length}
              </span>{' '}
              résultat(s) {viewMode === 'active' ? 'actif(s)' : 'archivé(s)'}
            </>
          }
          currency={currency || 'EUR'}
          currencySymbol={currencyConfig?.symbol || '€'}
          action={
            viewMode === 'active' && hasPermission('clients.create') ? (
              <button
                onClick={handleOpenAdd}
                className="w-full sm:w-auto flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-4 py-2.5 rounded-lg hover:from-purple-700 hover:to-indigo-700 transition-all font-medium text-sm shadow-lg shadow-purple-500/30 active:scale-95"
              >
                <Plus size={18} />
                <span>Nouveau client</span>
              </button>
            ) : null
          }
        />

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <KPIGrid columns={4}>
            <StatCell value={totalClients} trend={trendTotal} label="Clients actifs" active={activeStat === 0} onClick={() => setActiveStat(0)} />
            <StatCell value={totalEntreprises} trend={trendEntreprises} label="Entreprises" active={activeStat === 1} onClick={() => setActiveStat(1)} />
            <StatCell value={totalParticuliers} trend={trendParticuliers} label="Particuliers" active={activeStat === 2} onClick={() => setActiveStat(2)} />
            <StatCell value={totalArchives} trend={trendArchives} label="Archivés" active={activeStat === 3} onClick={() => setActiveStat(3)} />
          </KPIGrid>

          {viewMode === 'active' && (
            <TypeTabs
              tabs={typeTabs}
              activeTab={filterType}
              onTabChange={setFilterType}
              color="purple"
            />
          )}

          <ViewTabs
            active={viewMode}
            onChange={setViewMode}
            counts={{
              active: clients.filter(c => c.status !== 'archived').length,
              archived: totalArchives
            }}
            color="purple"
          />

          <div className="flex flex-col sm:flex-row gap-3 mb-6">
            <SearchFilter
              value={search}
              onChange={setSearch}
              placeholder="Rechercher (nom, entreprise, n° client...)"
              shortcut="⌘K"
              inputRef={searchInputRef}
            />
            {viewMode === 'active' && (
              <SelectFilter
                value={filterStatus}
                onChange={setFilterStatus}
                options={statusOptions}
                placeholder="Tous statuts"
              />
            )}
          </div>

          {loading ? (
            <>
              <DataTable loading={true} headers={[
                { label: 'N° Client', align: 'left' },
                { label: 'Client', align: 'left' },
                { label: 'Contact', align: 'left' },
                { label: 'Type', align: 'left' },
                { label: 'Statut', align: 'left' },
                { label: '', align: 'right', width: 'w-12' }
              ]} />
              <div className="md:hidden space-y-4 mt-4">
                <SkeletonCard /><SkeletonCard /><SkeletonCard />
              </div>
            </>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={UserCheck}
              title={`Aucun client ${viewMode === 'active' ? 'actif' : 'archivé'}`}
              description="Commencez par ajouter un nouveau client."
              tone="indigo"
              action={
                viewMode === 'active' && hasPermission('clients.create') ? (
                  <button onClick={handleOpenAdd} className="inline-flex items-center gap-2 bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 text-sm mt-4 active:scale-95 transition-transform">
                    <Plus size={16} /><span>Ajouter un client</span>
                  </button>
                ) : null
              }
            />
          ) : (
            <>
              {/* Desktop */}
              <DataTable headers={[
                { label: 'N° Client', align: 'left' },
                { label: 'Client', align: 'left' },
                { label: 'Contact', align: 'left' },
                { label: 'Type', align: 'left' },
                { label: 'Statut', align: 'left' },
                { label: '', align: 'right', width: 'w-12' }
              ]}>
                {paginatedClients.map((c) => (
                  <tr key={c.$id} className="group hover:bg-purple-50/50 dark:hover:bg-slate-700/30 transition-colors duration-200">
                    <td className="px-6 py-4">
                      <span className="text-xs font-mono font-medium text-slate-500 dark:text-slate-400 tabular-nums">
                        {c.clientId || '—'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <Avatar client={getEntity(c)} />
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-900 dark:text-white text-sm truncate">
                            {c.type === 'entreprise' ? c.companyName : `${c.firstName} ${c.lastName}`.trim()}
                          </div>
                          {c.type === 'entreprise' && c.firstName && (
                            <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-0.5 truncate">
                              <User size={11} /> {c.firstName} {c.lastName}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col space-y-1">
                        {c.email && <span className="flex items-center text-xs text-slate-600 dark:text-slate-300 truncate max-w-[200px]"><Mail size={13} className="mr-1.5 text-slate-400 flex-shrink-0" />{c.email}</span>}
                        {c.phone && <span className="flex items-center text-xs text-slate-600 dark:text-slate-300 tabular-nums"><Phone size={13} className="mr-1.5 text-slate-400" />{c.phone}</span>}
                        {!c.email && !c.phone && <span className="text-xs text-slate-400 italic">Non renseigné</span>}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <TypeLabel type={c.type} />
                    </td>
                    <td className="px-6 py-4">
                      <StatusIndicator status={c.status} />
                    </td>
                    <td className="px-2 py-4 text-right w-12">
                      <div className="flex justify-end opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                        <ActionMenu>
                          {viewMode === 'active' ? (
                            <>
                              <ActionMenuItem onClick={() => navigate(`/clients/${c.$id}`)} icon={Eye} label="Voir la fiche" />
                              {hasPermission('quotes.create') && (
                                <ActionMenuItem onClick={() => navigate(`/quotes?clientId=${c.$id}`)} icon={FileText} label="Créer un devis" />
                              )}
                              {hasPermission('clients.edit') && (
                                <ActionMenuItem onClick={() => handleOpenEdit(c)} icon={Edit2} label="Modifier" />
                              )}
                              {hasPermission('clients.delete') && (
                                <ActionMenuItem onClick={() => setClientToArchive(c)} icon={Archive} label="Archiver" danger />
                              )}
                            </>
                          ) : (
                            <ActionMenuItem onClick={() => handleUnarchive(c.$id, `${c.firstName} ${c.lastName}`.trim())} icon={RotateCcw} label="Désarchiver" />
                          )}
                        </ActionMenu>
                      </div>
                    </td>
                  </tr>
                ))}
              </DataTable>

              {/* Mobile */}
              <div className="md:hidden space-y-4 mt-4">
                {paginatedClients.map((c) => (
                  <MobileCard key={c.$id}>
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <Avatar client={getEntity(c)} size="lg" />
                        <div className="min-w-0">
                          <h3 className="font-bold text-slate-900 dark:text-white truncate text-base">{c.type === 'entreprise' ? c.companyName : `${c.firstName} ${c.lastName}`.trim()}</h3>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[11px] font-mono font-medium text-slate-500 dark:text-slate-400 tabular-nums">{c.clientId || 'N/A'}</span>
                            <span className="text-slate-300 dark:text-slate-600">•</span>
                            <TypeLabel type={c.type} />
                          </div>
                        </div>
                      </div>
                      <StatusIndicator status={c.status} />
                    </div>
                    <div className="space-y-2 mb-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl p-3 border border-slate-100 dark:border-slate-700/50">
                      {c.phone && <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300 text-sm tabular-nums"><Phone size={14} className="text-slate-400" /> {c.phone}</div>}
                      {c.email && <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300 text-sm truncate"><Mail size={14} className="text-slate-400 flex-shrink-0" /> <span className="truncate">{c.email}</span></div>}
                      {!c.phone && !c.email && <div className="text-xs text-slate-400 italic text-center py-1">Aucun contact renseigné</div>}
                    </div>
                    <div className="pt-3 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between gap-2">
                      {viewMode === 'active' ? (
                        <div className="flex items-center gap-2 flex-1">
                          <button onClick={() => navigate(`/clients/${c.$id}`)} className="flex-1 flex items-center justify-center gap-1.5 p-2.5 text-blue-600 bg-blue-50 dark:bg-blue-900/30 rounded-lg active:scale-95 transition-transform text-xs font-medium">
                            <Eye size={16} /> Voir
                          </button>
                          {hasPermission('quotes.create') && (
                            <button onClick={() => navigate(`/quotes?clientId=${c.$id}`)} className="flex-1 flex items-center justify-center gap-1.5 p-2.5 text-green-600 bg-green-50 dark:bg-green-900/30 rounded-lg active:scale-95 transition-transform text-xs font-medium">
                              <FileText size={16} /> Devis
                            </button>
                          )}
                        </div>
                      ) : (
                        <button onClick={() => handleUnarchive(c.$id, `${c.firstName} ${c.lastName}`.trim())} className="w-full flex items-center justify-center gap-2 p-3 text-sm font-medium text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/30 rounded-lg active:scale-95 transition-transform">
                          <RotateCcw size={16} /><span>Désarchiver</span>
                        </button>
                      )}
                      {viewMode === 'active' && (
                        <ActionMenu>
                          {hasPermission('clients.edit') && (
                            <ActionMenuItem onClick={() => handleOpenEdit(c)} icon={Edit2} label="Modifier" />
                          )}
                          {hasPermission('clients.delete') && (
                            <ActionMenuItem onClick={() => setClientToArchive(c)} icon={Archive} label="Archiver" danger />
                          )}
                        </ActionMenu>
                      )}
                    </div>
                  </MobileCard>
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onPageChange={handlePageChange}
                  startItem={startIndex + 1}
                  endItem={Math.min(endIndex, filtered.length)}
                  totalItems={filtered.length}
                  itemName="client"
                />
              )}
            </>
          )}
        </main>

        <Modal
          open={showModal}
          onClose={() => { setShowModal(false); setDuplicateFound(null); }}
          title={editingId ? 'Modifier le client' : 'Nouveau client'}
          icon={<UserCheck size={20} className="text-purple-600" />}
          maxWidth="sm:max-w-2xl"
          footer={
            <>
              <button onClick={() => { setShowModal(false); setDuplicateFound(null); }} className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600 active:scale-95 transition-all">Annuler</button>
              <button onClick={handleSave} disabled={saving || (!form.firstName && !form.lastName && !form.companyName)} className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-purple-600 to-indigo-600 rounded-lg hover:from-purple-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 transition-all flex items-center justify-center gap-2 shadow-lg shadow-purple-500/20">
                {saving ? <><span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span> Enregistrement...</> : (editingId ? 'Mettre à jour' : 'Ajouter')}
              </button>
            </>
          }
        >
          <div className="space-y-5">
            {duplicateFound && !editingId && (
              <Alert tone="warning" icon={AlertCircle} title="Doublon détecté">
                <p className="text-sm mt-1">Un client avec ces coordonnées existe déjà.</p>
                <div className="flex gap-2 mt-3">
                  <button type="button" onClick={() => { handleOpenEdit(duplicateFound); }} className="px-3 py-2 bg-purple-600 text-white text-xs font-medium rounded-lg hover:bg-purple-700 active:scale-95 transition-transform shadow-sm">Mettre à jour</button>
                  <button type="button" onClick={() => setDuplicateFound(null)} className="px-3 py-2 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-medium rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600 active:scale-95 transition-transform">Créer quand même</button>
                </div>
              </Alert>
            )}

            {!editingId && (
              <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-4 flex items-center gap-3">
                <div className="flex-shrink-0 w-9 h-9 bg-purple-50 dark:bg-purple-500/10 ring-1 ring-inset ring-purple-100 dark:ring-purple-500/20 rounded-lg flex items-center justify-center">
                  <Hash size={15} className="text-purple-600 dark:text-purple-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Numéro client</p>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200 mt-0.5">Attribué automatiquement à l'enregistrement</p>
                </div>
                <span className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-700 rounded-full">Auto</span>
              </div>
            )}

            {editingId && (
              <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-slate-100 dark:bg-slate-700/60 rounded-lg flex items-center justify-center">
                    <Hash size={15} className="text-slate-500 dark:text-slate-400" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Numéro client</p>
                    <p className="text-base font-mono font-semibold text-slate-800 dark:text-slate-100 tabular-nums mt-0.5">
                      {clients.find(c => c.$id === editingId)?.clientId || 'Non attribué'}
                    </p>
                  </div>
                </div>
                <span className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-700 rounded-full">Existant</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <FormField label="Type">
                <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  <option value="particulier">Particulier</option>
                  <option value="entreprise">Entreprise</option>
                </Select>
              </FormField>
              <FormField label="Statut">
                <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  {Object.entries(statusLabels).filter(([k]) => k !== 'archived').map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </Select>
              </FormField>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <FormField label="Prénom">
                <Input type="text" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} placeholder="Jean" />
              </FormField>
              <FormField label="Nom">
                <Input type="text" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} placeholder="Dupont" />
              </FormField>
            </div>

            <FormField label="Entreprise" hint="Laisser vide si particulier">
              <div className="relative">
                <Building size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <Input type="text" value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} className="pl-9" placeholder="Dupont Plomberie" />
              </div>
            </FormField>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <FormField label="Email">
                <div className="relative">
                  <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="pl-9" placeholder="jean@dupont.fr" />
                </div>
              </FormField>
              <FormField label="Téléphone">
                <div className="relative">
                  <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <Input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="pl-9" placeholder="06 12 34 56 78" />
                </div>
              </FormField>
            </div>

            <FormField label="Adresse">
              <Input type="text" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="123 rue de la Paix, 75000 Paris" />
            </FormField>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <FormField label="Adresse de facturation">
                <Input type="text" value={form.billingAddress} onChange={(e) => setForm({ ...form, billingAddress: e.target.value })} placeholder="Adresse de facturation" />
              </FormField>
              <FormField label="Numéro fiscal / TVA">
                <Input type="text" value={form.taxNumber} onChange={(e) => setForm({ ...form, taxNumber: e.target.value })} placeholder="FR12345678901" />
              </FormField>
            </div>

            <FormField label="Notes">
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} placeholder="Notes internes..." />
            </FormField>
          </div>
        </Modal>

        <ConfirmDialog
          open={!!clientToArchive}
          onClose={() => setClientToArchive(null)}
          onConfirm={handleArchive}
          title="Archiver ce client ?"
          description={
            clientToArchive ? (
              <>
                Le client <strong className="text-slate-700 dark:text-slate-200">{clientToArchive.firstName} {clientToArchive.lastName}</strong> sera masqué de la liste principale. Son historique et ses documents seront conservés.
              </>
            ) : null
          }
          confirmLabel="Confirmer"
          cancelLabel="Annuler"
          tone="danger"
        />
      </div>
    </Sidebar>
  );
}