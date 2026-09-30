import Sidebar from '../components/Sidebar';
import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { databases, DATABASE_ID } from '../appwrite';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { useCompanySettings } from '../hooks/useCompanySettings';
import { toast } from 'sonner';
import Modal from '../components/ui/Modal';
import ActionMenu, { ActionMenuItem } from '../components/ui/ActionMenu';
import {
  PageHeader,
  TypeTabs,
  KPIGrid,
  StatCell,
  EmptyState,
  SkeletonCard,
  FormField,
  Textarea,
  Alert,
  Pagination,
  SearchFilter,
  SelectFilter,
  MobileCard,
  DataTable,
  Card,
  SectionTitle,
  Badge,
  type DotTone,
} from '../components/ui/SharedUI';
import {
  Bell, FileText, Receipt, AlertCircle, Clock, Send,
  CheckCircle2, Mail, Phone, MessageSquare, MailPlus,
  Calendar, Hash
} from 'lucide-react';
import { Query, ID, Permission, Role } from 'appwrite';

// ============================================================
// 📋 INTERFACES
// ============================================================

interface Quote {
  $id: string;
  quoteNumber: string;
  clientName: string;
  status: string;
  total: number;
  issueDate?: string;
  validityDate?: string;
  clientEmail?: string;
  clientToken?: string;
  teamId?: string;
}

interface Invoice {
  $id: string;
  invoiceNumber: string;
  clientName: string;
  status: string;
  total: number;
  balance: number;
  issueDate?: string;
  dueDate?: string;
  clientEmail?: string;
  clientToken?: string;
  teamId?: string;
  type?: string;
  payments?: any;
  originalInvoiceId?: string;
}

interface Reminder {
  $id: string;
  teamId: string;
  userId: string;
  type: 'quote' | 'invoice';
  relatedId: string;
  relatedNumber: string;
  clientName: string;
  level: number;
  method: string;
  message: string;
  sentAt: string;
}

interface ReminderItem {
  id: string;
  type: 'quote' | 'invoice';
  number: string;
  clientName: string;
  amount: number;
  days: number;
  level: number;
  urgency: 'info' | 'warning' | 'danger' | 'critical';
  label: string;
  email?: string;
  token?: string;
}

// ============================================================
// 🎨 CONFIGURATION VISUELLE
// ============================================================

const urgencyConfig: Record<string, { label: string; tone: 'blue' | 'amber' | 'orange' | 'red'; iconTone: DotTone }> = {
  info:     { label: '🔵 Information',    tone: 'blue',   iconTone: 'sky' },
  warning:  { label: '🟡 À surveiller',   tone: 'amber',  iconTone: 'amber' },
  danger:   { label: '🟠 Urgent',         tone: 'orange', iconTone: 'orange' },
  critical: { label: '🔴 Critique',       tone: 'red',    iconTone: 'red' },
};

const methodConfig: Record<string, { label: string; icon: any; tone: DotTone }> = {
  email: { label: '📧 Email',      icon: Mail,         tone: 'sky' },
  phone: { label: '📞 Téléphone',  icon: Phone,        tone: 'teal' },
  sms:   { label: '💬 SMS',        icon: MessageSquare, tone: 'violet' },
  mail:  { label: '✉️ Courrier',   icon: MailPlus,     tone: 'indigo' },
};

const levelConfig: Record<number, { label: string; tone: 'amber' | 'orange' | 'red' }> = {
  1: { label: 'Niveau 1 — Relance douce',     tone: 'amber' },
  2: { label: 'Niveau 2 — Relance ferme',     tone: 'orange' },
  3: { label: 'Niveau 3 — Mise en demeure',   tone: 'red' },
};

const quoteTemplates: Record<number, string> = {
  1: `Bonjour {clientName},\n\nJe me permets de revenir vers vous concernant le devis n°{number} que je vous ai transmis le {date} pour un montant de {amount}.\n\nAvez-vous pu en prendre connaissance ? Je reste à votre entière disposition pour répondre à vos questions ou ajuster l'offre selon vos besoins.\n\nVous pouvez consulter et accepter le devis en ligne via ce lien :\n{link}\n\nCordialement,\n{companyName}`,
  2: `Bonjour {clientName},\n\nJe fais suite à mon précédent message concernant le devis n°{number} d'un montant de {amount}, transmis le {date}.\n\nJe n'ai pas reçu de retour de votre part et je souhaitais m'assurer que vous aviez bien reçu notre proposition.\n\nVous pouvez consulter et accepter le devis en ligne via ce lien :\n{link}\n\nCordialement,\n{companyName}`,
  3: `Bonjour {clientName},\n\nJe me permets de vous recontacter une dernière fois concernant le devis n°{number} d'un montant de {amount}.\n\nNotre offre arrive à expiration prochainement. Sans retour de votre part sous 7 jours, nous considérerons cette offre comme caduque.\n\nVous pouvez consulter et accepter le devis en ligne via ce lien :\n{link}\n\nCordialement,\n{companyName}`,
};

const invoiceTemplates: Record<number, string> = {
  1: `Bonjour {clientName},\n\nSauf erreur ou omission de notre part, la facture n°{number} d'un montant de {amount}, arrivée à échéance le {date}, n'a pas encore été réglée.\n\nNous vous remercions de bien vouloir procéder au règlement dans les meilleurs délais.\n\nVous pouvez consulter et régler la facture en ligne via ce lien :\n{link}\n\nCordialement,\n{companyName}`,
  2: `Bonjour {clientName},\n\nMalgré notre précédente relance, nous constatons que la facture n°{number} d'un montant de {amount}, échue le {date}, n'a toujours pas été réglée.\n\nNous vous prions de bien vouloir procéder au règlement sous 8 jours.\n\nVous pouvez consulter et régler la facture en ligne via ce lien :\n{link}\n\nCordialement,\n{companyName}`,
  3: `MISE EN DEMEURE DE PAYER\n\n{clientName},\n\nMalgré nos multiples relances, la facture n°{number} d'un montant de {amount}, échue le {date}, demeure impayée à ce jour.\n\nPar la présente, nous vous mettons en demeure de procéder au règlement intégral de cette somme sous 8 jours.\n\nVous pouvez consulter et régler la facture en ligne via ce lien :\n{link}\n\n{companyName}`,
};

// ⚙️ Pagination
const ITEMS_PER_PAGE = 10;

// ============================================================
// 🎯 COMPOSANT PRINCIPAL
// ============================================================

export default function Reminders() {
  const { user } = useAuth();
  const { hasPermission, loading: permLoading } = usePermissions();
  const navigate = useNavigate();
  const { fm, loading: settingsLoading, companyName } = useCompanySettings();

  const [loading, setLoading] = useState(true);
  const [currentTeamId, setCurrentTeamId] = useState<string | null>(null);
  const [reminders, setReminders] = useState<ReminderItem[]>([]);
  const [history, setHistory] = useState<Reminder[]>([]);
  const [filterType, setFilterType] = useState<'all' | 'quote' | 'invoice'>('all');
  const [filterUrgency, setFilterUrgency] = useState<'all' | 'info' | 'warning' | 'danger' | 'critical'>('all');
  const [activeTab, setActiveTab] = useState<'todo' | 'history'>('todo');
  const [showSendModal, setShowSendModal] = useState(false);
  const [selectedReminder, setSelectedReminder] = useState<ReminderItem | null>(null);
  const [sendForm, setSendForm] = useState({ method: 'email', message: '' });
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState('');

  // ✅ Pagination
  const [remindersPage, setRemindersPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);

  // ============================================================
  // ✅ HELPERS COMPTABLES (alignés avec Invoices.tsx)
  // ============================================================

  const readJson = (raw: unknown): any => {
    if (!raw) return {};
    if (typeof raw === 'object') return raw;
    try { return JSON.parse(raw); } catch { return {}; }
  };

  const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

  const getPaidAmount = (invoice: Invoice, journalPayments: any[]): number => {
    const journalSum = journalPayments
      .filter(jp => jp.invoiceId === invoice.$id && jp.status === 'confirmed')
      .reduce((sum, jp) => sum + Number(jp.amount || 0), 0);
    if (journalSum > 0) return round2(journalSum);
    let payments: any[] = [];
    try {
      if (typeof invoice.payments === 'string' && invoice.payments.trim()) {
        payments = JSON.parse(invoice.payments);
      } else if (Array.isArray(invoice.payments)) {
        payments = invoice.payments;
      }
    } catch { payments = []; }
    return round2(payments.reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0));
  };

  const getNetRemaining = (
    invoice: Invoice,
    allInvoices: Invoice[],
    metadataMap: Map<string, any>,
    journalPayments: any[]
  ): number => {
    if (invoice.type === 'credit') return 0;
    let paidAmount = getPaidAmount(invoice, journalPayments);
    if ((invoice.type === 'standard' || invoice.type === 'balance') && invoice.originalInvoiceId) {
      const advanceInvoice = allInvoices.find(i => i.$id === invoice.originalInvoiceId && i.type === 'advance');
      if (advanceInvoice && advanceInvoice.status === 'paid') {
        paidAmount += (advanceInvoice.total || 0);
      }
    }
    const allocatedCredits = allInvoices
      .filter(inv => inv.type === 'credit' && inv.originalInvoiceId === invoice.$id && inv.status !== 'cancelled')
      .reduce((sum, inv) => {
        const meta = metadataMap.get(inv.$id);
        if (!meta) {
          const original = allInvoices.find(i => i.$id === inv.originalInvoiceId);
          const originalPaid = !!original && original.status === 'paid';
          return sum + (originalPaid ? 0 : (inv.total || 0));
        }
        const creditData = meta.creditData || {};
        const status = creditData.creditStatus;
        if (status === 'allocated') return sum + (creditData.allocatedAmount || inv.total || 0);
        if (status === 'partial_refund') return sum + (creditData.allocatedAmount || 0);
        return sum;
      }, 0);
    return round2(Math.max(0, (invoice.total || 0) - paidAmount - allocatedCredits));
  };

  // ============================================================
  // 📥 CHARGEMENT DES DONNÉES
  // ============================================================

  useEffect(() => {
    if (!permLoading && !hasPermission('invoices.view')) navigate('/dashboard');
  }, [permLoading, hasPermission, navigate]);

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    loadReminders();
  }, [user]);

  const loadReminders = async () => {
    if (!user) return;
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

      const [quotesRes, invoicesRes, historyRes, metadataRes, journalRes] = await Promise.all([
        databases.listDocuments(DATABASE_ID, 'quotes', [Query.equal('teamId', teamId), Query.limit(2000)]),
        databases.listDocuments(DATABASE_ID, 'invoices', [Query.equal('teamId', teamId), Query.limit(2000)]),
        databases.listDocuments(DATABASE_ID, 'reminders', [
          Query.equal('teamId', teamId), Query.orderDesc('$createdAt'), Query.limit(2000)
        ]).catch(() => ({ documents: [] })),
        databases.listDocuments(DATABASE_ID, 'invoice_metadata', [
          Query.equal('teamId', teamId), Query.limit(2000)
        ]).catch(() => ({ documents: [] })),
        databases.listDocuments(DATABASE_ID, 'invoice_payments', [
          Query.equal('teamId', teamId), Query.limit(2000)
        ]).catch(() => ({ documents: [] })),
      ]);

      setHistory(historyRes.documents as unknown as Reminder[]);

      const metadataMap = new Map<string, any>();
      metadataRes.documents.forEach((doc: any) => {
        metadataMap.set(doc.invoiceId, {
          creditData: readJson(doc.creditData),
          archiveData: readJson(doc.archiveData),
          reconciliationData: readJson(doc.reconciliationData),
        });
      });

      const journalPayments = journalRes.documents.map((d: any) => ({ ...readJson(d.data), $id: d.$id }));
      const items: ReminderItem[] = [];
      const today = new Date();
      const allInvoices = invoicesRes.documents as unknown as Invoice[];

      (quotesRes.documents as unknown as Quote[]).forEach(quote => {
        if (quote.status !== 'Envoyé') return;
        const issueDate = new Date(quote.issueDate || '');
        const daysSinceSent = Math.floor((today.getTime() - issueDate.getTime()) / (1000 * 60 * 60 * 24));
        const validityDate = quote.validityDate ? new Date(quote.validityDate) : null;
        const daysUntilExpiry = validityDate ? Math.floor((validityDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) : null;

        if (daysUntilExpiry !== null && daysUntilExpiry < 0) {
          items.push({ id: quote.$id, type: 'quote', number: quote.quoteNumber, clientName: quote.clientName, amount: Number(quote.total || 0), days: Math.abs(daysUntilExpiry), level: 3, urgency: 'critical', label: 'Devis expiré', email: quote.clientEmail, token: quote.clientToken });
        } else if (daysUntilExpiry !== null && daysUntilExpiry <= 3) {
          items.push({ id: quote.$id, type: 'quote', number: quote.quoteNumber, clientName: quote.clientName, amount: Number(quote.total || 0), days: daysUntilExpiry, level: 2, urgency: 'danger', label: `Expire dans ${daysUntilExpiry} jour(s)`, email: quote.clientEmail, token: quote.clientToken });
        } else if (daysSinceSent >= 15) {
          items.push({ id: quote.$id, type: 'quote', number: quote.quoteNumber, clientName: quote.clientName, amount: Number(quote.total || 0), days: daysSinceSent, level: 3, urgency: 'critical', label: `Sans réponse depuis ${daysSinceSent} jours`, email: quote.clientEmail, token: quote.clientToken });
        } else if (daysSinceSent >= 7) {
          items.push({ id: quote.$id, type: 'quote', number: quote.quoteNumber, clientName: quote.clientName, amount: Number(quote.total || 0), days: daysSinceSent, level: 2, urgency: 'danger', label: `Sans réponse depuis ${daysSinceSent} jours`, email: quote.clientEmail, token: quote.clientToken });
        } else if (daysSinceSent >= 3) {
          items.push({ id: quote.$id, type: 'quote', number: quote.quoteNumber, clientName: quote.clientName, amount: Number(quote.total || 0), days: daysSinceSent, level: 1, urgency: 'warning', label: `Sans réponse depuis ${daysSinceSent} jours`, email: quote.clientEmail, token: quote.clientToken });
        }
      });

      allInvoices.forEach(invoice => {
        if (invoice.status === 'paid' || invoice.status === 'cancelled' || invoice.type === 'credit') return;
        const netRemaining = getNetRemaining(invoice, allInvoices, metadataMap, journalPayments);
        if (netRemaining <= 0) return;
        const dueDate = invoice.dueDate ? new Date(invoice.dueDate) : null;
        if (!dueDate) return;
        const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
        const daysUntilDue = Math.floor((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

        if (daysOverdue >= 30) {
          items.push({ id: invoice.$id, type: 'invoice', number: invoice.invoiceNumber, clientName: invoice.clientName, amount: netRemaining, days: daysOverdue, level: 3, urgency: 'critical', label: `En retard de ${daysOverdue} jours`, email: invoice.clientEmail, token: invoice.clientToken });
        } else if (daysOverdue >= 15) {
          items.push({ id: invoice.$id, type: 'invoice', number: invoice.invoiceNumber, clientName: invoice.clientName, amount: netRemaining, days: daysOverdue, level: 2, urgency: 'danger', label: `En retard de ${daysOverdue} jours`, email: invoice.clientEmail, token: invoice.clientToken });
        } else if (daysOverdue > 0) {
          items.push({ id: invoice.$id, type: 'invoice', number: invoice.invoiceNumber, clientName: invoice.clientName, amount: netRemaining, days: daysOverdue, level: 1, urgency: 'warning', label: `En retard de ${daysOverdue} jours`, email: invoice.clientEmail, token: invoice.clientToken });
        } else if (daysUntilDue <= 3 && daysUntilDue >= 0) {
          items.push({ id: invoice.$id, type: 'invoice', number: invoice.invoiceNumber, clientName: invoice.clientName, amount: netRemaining, days: -daysUntilDue, level: 1, urgency: 'info', label: `Échéance dans ${daysUntilDue} jour(s)`, email: invoice.clientEmail, token: invoice.clientToken });
        }
      });

      const urgencyOrder = { critical: 0, danger: 1, warning: 2, info: 3 };
      items.sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency]);
      setReminders(items);
    } catch (error) {
      console.error('Erreur chargement relances:', error);
      toast.error('Erreur lors du chargement des relances');
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // ⚙️ ACTIONS
  // ============================================================

  const openSendModal = (item: ReminderItem) => {
    setSelectedReminder(item);
    const template = item.type === 'quote' ? quoteTemplates[item.level] : invoiceTemplates[item.level];
    const message = template
      .replace(/{clientName}/g, item.clientName)
      .replace(/{number}/g, item.number)
      .replace(/{amount}/g, fm(item.amount))
      .replace(/{date}/g, new Date().toLocaleDateString('fr-FR'))
      .replace(/{link}/g, item.token ? `${window.location.origin}/${item.type === 'quote' ? 'v' : 'f'}/${item.token}` : '[Lien non disponible]')
      .replace(/{companyName}/g, companyName || 'Votre entreprise')
      .replace(/{lastReminderDate}/g, new Date().toLocaleDateString('fr-FR'));
    setSendForm({ method: 'email', message });
    setShowSendModal(true);
  };

  const handleSendReminder = async () => {
    if (!selectedReminder || !currentTeamId || !user) return;
    setSending(true);
    try {
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

      await databases.createDocument(DATABASE_ID, 'reminders', ID.unique(), {
        teamId: currentTeamId,
        userId: user.$id,
        type: selectedReminder.type,
        relatedId: selectedReminder.id,
        relatedNumber: selectedReminder.number,
        clientName: selectedReminder.clientName,
        level: selectedReminder.level,
        method: sendForm.method,
        message: sendForm.message,
        sentAt: new Date().toISOString(),
      }, perms);

      if (sendForm.method === 'email' && selectedReminder.email) {
        const subject = encodeURIComponent(`Relance - ${selectedReminder.type === 'quote' ? 'Devis' : 'Facture'} n°${selectedReminder.number}`);
        const body = encodeURIComponent(sendForm.message);
        window.open(`mailto:${selectedReminder.email}?subject=${subject}&body=${body}`);
      }

      setShowSendModal(false);
      setSelectedReminder(null);
      await loadReminders();
      toast.success('Relance enregistrée avec succès !', {
        description: `${selectedReminder.clientName} — ${selectedReminder.number}`
      });
    } catch (error: any) {
      toast.error(`Erreur : ${error.message}`);
    } finally {
      setSending(false);
    }
  };

  // ============================================================
  // ✅ CALCULS & FILTRAGE
  // ============================================================

  const filteredReminders = useMemo(() => reminders.filter(r => {
    const matchType = filterType === 'all' || r.type === filterType;
    const matchUrgency = filterUrgency === 'all' || r.urgency === filterUrgency;
    const searchStr = `${r.number} ${r.clientName} ${r.label}`.toLowerCase();
    const matchSearch = search === '' || searchStr.includes(search.toLowerCase());
    return matchType && matchUrgency && matchSearch;
  }), [reminders, filterType, filterUrgency, search]);

  const filteredHistory = useMemo(() => {
    const searchStr = search.toLowerCase();
    return history.filter(h => {
      if (search === '') return true;
      return `${h.relatedNumber} ${h.clientName}`.toLowerCase().includes(searchStr);
    });
  }, [history, search]);

  const quoteReminders = filteredReminders.filter(r => r.type === 'quote');
  const invoiceReminders = filteredReminders.filter(r => r.type === 'invoice');
  const totalQuoteAmount = quoteReminders.reduce((s, r) => s + Number(r.amount || 0), 0);
  const totalInvoiceAmount = invoiceReminders.reduce((s, r) => s + Number(r.amount || 0), 0);

  // ✅ Calculs de pagination
  const remindersTotalPages = Math.max(1, Math.ceil(filteredReminders.length / ITEMS_PER_PAGE));
  const remindersStartIndex = (remindersPage - 1) * ITEMS_PER_PAGE;
  const remindersEndIndex = remindersStartIndex + ITEMS_PER_PAGE;
  const paginatedReminders = filteredReminders.slice(remindersStartIndex, remindersEndIndex);

  const historyTotalPages = Math.max(1, Math.ceil(filteredHistory.length / ITEMS_PER_PAGE));
  const historyStartIndex = (historyPage - 1) * ITEMS_PER_PAGE;
  const historyEndIndex = historyStartIndex + ITEMS_PER_PAGE;
  const paginatedHistory = filteredHistory.slice(historyStartIndex, historyEndIndex);

  const handleRemindersPageChange = (page: number) => {
    setRemindersPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleHistoryPageChange = (page: number) => {
    setHistoryPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // ✅ Reset pagination quand les filtres changent
  useEffect(() => {
    setRemindersPage(1);
    setHistoryPage(1);
  }, [search, filterType, filterUrgency, activeTab]);

  const tabs = [
    { key: 'todo', label: '📋 À relancer', count: reminders.length },
    { key: 'history', label: '📜 Historique', count: history.length },
  ];

  const typeOptions = [
    { value: 'all', label: 'Tous les types' },
    { value: 'quote', label: '📄 Devis uniquement' },
    { value: 'invoice', label: '🧾 Factures uniquement' },
  ];

  const urgencyOptions = [
    { value: 'all', label: 'Toutes les urgences' },
    { value: 'critical', label: '🔴 Critique' },
    { value: 'danger', label: '🟠 Urgent' },
    { value: 'warning', label: '🟡 À surveiller' },
    { value: 'info', label: '🔵 Information' },
  ];

  // ============================================================
  // 🎨 RENDU
  // ============================================================

  if (permLoading || settingsLoading) {
    return (
      <Sidebar>
        <div className="flex items-center justify-center h-full w-full">
          <div className="text-slate-500 dark:text-slate-400 text-lg animate-pulse">Vérification des droits...</div>
        </div>
      </Sidebar>
    );
  }

  return (
    <Sidebar>
      <div className="min-h-full bg-slate-50 dark:bg-slate-900">
        <PageHeader
          icon={Bell}
          iconColor="amber"
          title="Relances"
          description={
            <>
              <span className="font-semibold text-slate-700 dark:text-slate-300 tabular-nums">{reminders.length}</span>{' '}
              élément(s) à traiter
            </>
          }
        />

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {/* ONGLETS PRINCIPAUX */}
          <TypeTabs
            tabs={tabs}
            activeTab={activeTab}
            onTabChange={(key) => setActiveTab(key as 'todo' | 'history')}
            color="purple"
          />

          {activeTab === 'todo' ? (
            <>
              {/* KPIs FILTRÉS */}
              <KPIGrid columns={4}>
                <StatCell
                  value={quoteReminders.length}
                  label="Devis à relancer"
                  sublabel="En attente de réponse"
                />
                <StatCell
                  value={fm(totalQuoteAmount)}
                  label="Montant devis"
                  sublabel={`${quoteReminders.length} devis concerné(s)`}
                />
                <StatCell
                  value={invoiceReminders.length}
                  label="Factures à relancer"
                  sublabel="Impayées ou échues"
                />
                <StatCell
                  value={fm(totalInvoiceAmount)}
                  label="Montant factures"
                  sublabel={`${invoiceReminders.length} facture(s) concernée(s)`}
                />
              </KPIGrid>

              {/* FILTRES */}
              <div className="flex flex-col sm:flex-row gap-3 mb-6">
                <SearchFilter
                  value={search}
                  onChange={setSearch}
                  placeholder="Rechercher (n°, client...)"
                  shortcut="⌘K"
                />
                <SelectFilter
                  value={filterType}
                  onChange={(v) => setFilterType(v as any)}
                  options={typeOptions}
                  placeholder="Type"
                />
                <SelectFilter
                  value={filterUrgency}
                  onChange={(v) => setFilterUrgency(v as any)}
                  options={urgencyOptions}
                  placeholder="Urgence"
                />
              </div>

              {/* LISTE DES RELANCES */}
              {loading ? (
                <div className="space-y-4">
                  <SkeletonCard /><SkeletonCard /><SkeletonCard />
                </div>
              ) : filteredReminders.length === 0 ? (
                <EmptyState
                  icon={CheckCircle2}
                  title="Aucune relance à effectuer"
                  description="Tous vos devis et factures sont à jour. Excellent travail ! 🎉"
                  tone="emerald"
                />
              ) : (
                <div className="space-y-6">
                  {/* SECTION DEVIS */}
                  {quoteReminders.length > 0 && (
                    <Card>
                      <SectionTitle icon={FileText} action={
                        <Badge tone="blue">{fm(totalQuoteAmount)}</Badge>
                      }>
                        Devis sans réponse ({quoteReminders.length})
                      </SectionTitle>
                      <div className="space-y-3">
                        {paginatedReminders.filter(r => r.type === 'quote').map(item => {
                          const urgInfo = urgencyConfig[item.urgency];
                          return (
                            <MobileCard key={item.id}>
                              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
                                <div className="flex-1 min-w-0">
                                  <div className="flex flex-wrap items-center gap-2 mb-1.5">
                                    <span className="inline-flex items-center gap-1 text-xs font-mono font-semibold text-purple-700 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/30 px-2 py-1 rounded">
                                      <Hash size={11} /> {item.number}
                                    </span>
                                    <Badge tone={urgInfo.tone}>{urgInfo.label}</Badge>
                                    <Badge tone="slate">Niveau {item.level}</Badge>
                                  </div>
                                  <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{item.clientName}</p>
                                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1.5 flex-wrap">
                                    <Clock size={12} className="flex-shrink-0" />
                                    <span>{item.label}</span>
                                    <span className="text-slate-300 dark:text-slate-600">•</span>
                                    <span className="font-semibold text-slate-700 dark:text-slate-300">{fm(item.amount)}</span>
                                  </p>
                                </div>
                                <button
                                  onClick={() => openSendModal(item)}
                                  className="w-full sm:w-auto flex items-center justify-center gap-2 bg-gradient-to-r from-amber-600 to-orange-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:from-amber-700 hover:to-orange-700 transition-all active:scale-95 shadow-sm shadow-amber-500/20"
                                >
                                  <Send size={14} /> Relancer
                                </button>
                              </div>
                            </MobileCard>
                          );
                        })}
                      </div>
                    </Card>
                  )}

                  {/* SECTION FACTURES */}
                  {invoiceReminders.length > 0 && (
                    <Card>
                      <SectionTitle icon={Receipt} action={
                        <Badge tone="red">{fm(totalInvoiceAmount)}</Badge>
                      }>
                        Factures impayées ({invoiceReminders.length})
                      </SectionTitle>
                      <div className="space-y-3">
                        {paginatedReminders.filter(r => r.type === 'invoice').map(item => {
                          const urgInfo = urgencyConfig[item.urgency];
                          return (
                            <MobileCard key={item.id}>
                              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
                                <div className="flex-1 min-w-0">
                                  <div className="flex flex-wrap items-center gap-2 mb-1.5">
                                    <span className="inline-flex items-center gap-1 text-xs font-mono font-semibold text-purple-700 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/30 px-2 py-1 rounded">
                                      <Hash size={11} /> {item.number}
                                    </span>
                                    <Badge tone={urgInfo.tone}>{urgInfo.label}</Badge>
                                    <Badge tone="slate">Niveau {item.level}</Badge>
                                  </div>
                                  <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{item.clientName}</p>
                                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1.5 flex-wrap">
                                    <AlertCircle size={12} className="flex-shrink-0" />
                                    <span>{item.label}</span>
                                    <span className="text-slate-300 dark:text-slate-600">•</span>
                                    <span className="font-semibold text-slate-700 dark:text-slate-300">Reste : {fm(item.amount)}</span>
                                  </p>
                                </div>
                                <button
                                  onClick={() => openSendModal(item)}
                                  className="w-full sm:w-auto flex items-center justify-center gap-2 bg-gradient-to-r from-orange-600 to-red-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:from-orange-700 hover:to-red-700 transition-all active:scale-95 shadow-sm shadow-orange-500/20"
                                >
                                  <Send size={14} /> Relancer
                                </button>
                              </div>
                            </MobileCard>
                          );
                        })}
                      </div>
                    </Card>
                  )}

                  {/* ✅ PAGINATION RELANCES */}
                  {remindersTotalPages > 1 && (
                    <Pagination
                      currentPage={remindersPage}
                      totalPages={remindersTotalPages}
                      onPageChange={handleRemindersPageChange}
                      startItem={remindersStartIndex + 1}
                      endItem={Math.min(remindersEndIndex, filteredReminders.length)}
                      totalItems={filteredReminders.length}
                      itemName="relance"
                    />
                  )}
                </div>
              )}
            </>
          ) : (
            /* HISTORIQUE */
            <Card>
              <SectionTitle icon={Clock}>Historique des relances</SectionTitle>
              
              {/* ✅ Recherche dans l'historique */}
              <div className="mb-4">
                <SearchFilter
                  value={search}
                  onChange={setSearch}
                  placeholder="Rechercher dans l'historique..."
                  shortcut="⌘K"
                />
              </div>

              {filteredHistory.length === 0 ? (
                <EmptyState
                  icon={Clock}
                  title="Aucun historique"
                  description="Aucune relance n'a encore été envoyée."
                  tone="slate"
                />
              ) : (
                <>
                  <DataTable headers={[
                    { label: 'Date', align: 'left' },
                    { label: 'Type', align: 'left' },
                    { label: 'Document', align: 'left' },
                    { label: 'Client', align: 'left' },
                    { label: 'Niveau', align: 'left' },
                    { label: 'Moyen', align: 'left' },
                  ]}>
                    {paginatedHistory.map(h => {
                      const lvl = levelConfig[h.level] || levelConfig[1];
                      const mth = methodConfig[h.method] || methodConfig.email;
                      return (
                        <tr key={h.$id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                          <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-300">
                            <div className="flex items-center gap-2">
                              <Calendar size={14} className="text-slate-400" />
                              {new Date(h.sentAt).toLocaleDateString('fr-FR')}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <Badge tone={h.type === 'quote' ? 'blue' : 'purple'}>
                              {h.type === 'quote' ? '📄 Devis' : '🧾 Facture'}
                            </Badge>
                          </td>
                          <td className="px-6 py-4">
                            <span className="inline-flex items-center gap-1 text-sm font-mono font-semibold text-purple-700 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/30 px-2 py-1 rounded">
                              <Hash size={12} /> {h.relatedNumber}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm font-medium text-slate-900 dark:text-white">{h.clientName}</td>
                          <td className="px-6 py-4">
                            <Badge tone={lvl.tone}>Niveau {h.level}</Badge>
                          </td>
                          <td className="px-6 py-4">
                            <Badge tone={mth.tone}>{mth.label}</Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </DataTable>

                  {/* ✅ PAGINATION HISTORIQUE */}
                  {historyTotalPages > 1 && (
                    <Pagination
                      currentPage={historyPage}
                      totalPages={historyTotalPages}
                      onPageChange={handleHistoryPageChange}
                      startItem={historyStartIndex + 1}
                      endItem={Math.min(historyEndIndex, filteredHistory.length)}
                      totalItems={filteredHistory.length}
                      itemName="relance"
                    />
                  )}
                </>
              )}
            </Card>
          )}
        </main>

        {/* MODAL ENVOI RELANCE */}
        <Modal
          open={showSendModal && !!selectedReminder}
          onClose={() => { setShowSendModal(false); setSelectedReminder(null); }}
          title="Envoyer une relance"
          icon={<Send className="text-orange-600" size={20} />}
          maxWidth="sm:max-w-2xl"
          footer={
            <>
              <button
                onClick={() => { setShowSendModal(false); setSelectedReminder(null); }}
                className="flex-1 sm:flex-none px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600 active:scale-95 transition-all"
              >
                Annuler
              </button>
              <button
                onClick={handleSendReminder}
                disabled={sending || !sendForm.message.trim()}
                className="flex-1 sm:flex-none px-4 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-orange-600 to-red-600 rounded-lg hover:from-orange-700 hover:to-red-700 disabled:opacity-50 flex items-center justify-center gap-2 active:scale-95 transition-all shadow-lg shadow-orange-500/20"
              >
                {sending ? (
                  <><span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span> Envoi...</>
                ) : (
                  <><Send size={16} /> Enregistrer la relance</>
                )}
              </button>
            </>
          }
        >
          {selectedReminder && (
            <div className="space-y-5">
              {/* RÉCAPITULATIF */}
              <Card padding={false} className="bg-slate-50 dark:bg-slate-700/30 border-slate-200 dark:border-slate-600 p-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Document :</span>
                    <strong className="text-slate-900 dark:text-white font-mono">{selectedReminder.number}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Client :</span>
                    <strong className="text-slate-900 dark:text-white">{selectedReminder.clientName}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Montant :</span>
                    <strong className="text-slate-900 dark:text-white">{fm(selectedReminder.amount)}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Situation :</span>
                    <strong className="text-slate-900 dark:text-white text-right">{selectedReminder.label}</strong>
                  </div>
                </div>
              </Card>

              {/* MOYEN DE CONTACT */}
              <FormField label="Moyen de contact" required>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {Object.entries(methodConfig).map(([key, config]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSendForm({ ...sendForm, method: key })}
                      className={`p-3 border rounded-lg text-sm font-medium transition-all active:scale-95 flex flex-col items-center gap-1.5 ${
                        sendForm.method === key
                          ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 ring-2 ring-orange-500/20'
                          : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-600'
                      }`}
                    >
                      <span>{config.label}</span>
                    </button>
                  ))}
                </div>
              </FormField>

              {/* MESSAGE */}
              <FormField label="Message" required hint="Personnalisez le message avant envoi">
                <Textarea
                  rows={10}
                  value={sendForm.message}
                  onChange={e => setSendForm({ ...sendForm, message: e.target.value })}
                  placeholder="Votre message..."
                />
              </FormField>

              <Alert tone="info" icon={AlertCircle}>
                <p className="text-xs">
                  <strong>💡 Astuce :</strong> Le lien de paiement/consultation a été automatiquement inséré.
                  {sendForm.method === 'email' && selectedReminder.email && (
                    <> L'email sera ouvert dans votre client de messagerie avec l'objet et le corps pré-remplis.</>
                  )}
                </p>
              </Alert>
            </div>
          )}
        </Modal>
      </div>
    </Sidebar>
  );
}