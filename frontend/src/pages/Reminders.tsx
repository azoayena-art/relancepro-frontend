import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { databases, DATABASE_ID } from '../appwrite';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import {
  ChevronLeft, Bell, FileText, Receipt, AlertCircle, Clock, Send,
  X, CheckCircle2, Filter
} from 'lucide-react';
import { Query, ID } from 'appwrite';

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

const urgencyColors: Record<string, string> = {
  info: 'bg-blue-50 border-blue-200 text-blue-800',
  warning: 'bg-yellow-50 border-yellow-200 text-yellow-800',
  danger: 'bg-orange-50 border-orange-200 text-orange-800',
  critical: 'bg-red-50 border-red-200 text-red-800'
};

const urgencyLabels: Record<string, string> = {
  info: '🔵 Information',
  warning: '🟡 À surveiller',
  danger: '🟠 Urgent',
  critical: '🔴 Critique'
};

const methodLabels: Record<string, string> = {
  email: '📧 Email',
  phone: '📞 Téléphone',
  sms: '💬 SMS',
  mail: '✉️ Courrier'
};

const quoteTemplates: Record<number, string> = {
  1: `Bonjour {clientName},\n\nJe me permets de revenir vers vous concernant le devis n°{number} que je vous ai transmis le {date} pour un montant de {amount}.\n\nAvez-vous pu en prendre connaissance ? Je reste à votre entière disposition pour répondre à vos questions ou ajuster l'offre selon vos besoins.\n\nVous pouvez consulter et accepter le devis en ligne via ce lien :\n{link}\n\nCordialement,\n{companyName}`,
  2: `Bonjour {clientName},\n\nJe fais suite à mon précédent message concernant le devis n°{number} d'un montant de {amount}, transmis le {date}.\n\nJe n'ai pas reçu de retour de votre part et je souhaitais m'assurer que vous aviez bien reçu notre proposition.\n\nVous pouvez consulter et accepter le devis en ligne via ce lien :\n{link}\n\nCordialement,\n{companyName}`,
  3: `Bonjour {clientName},\n\nJe me permets de vous recontacter une dernière fois concernant le devis n°{number} d'un montant de {amount}.\n\nNotre offre arrive à expiration prochainement. Sans retour de votre part sous 7 jours, nous considérerons cette offre comme caduque.\n\nVous pouvez consulter et accepter le devis en ligne via ce lien :\n{link}\n\nCordialement,\n{companyName}`
};

const invoiceTemplates: Record<number, string> = {
  1: `Bonjour {clientName},\n\nSauf erreur ou omission de notre part, la facture n°{number} d'un montant de {amount}, arrivée à échéance le {date}, n'a pas encore été réglée.\n\nNous vous remercions de bien vouloir procéder au règlement dans les meilleurs délais.\n\nVous pouvez consulter et régler la facture en ligne via ce lien :\n{link}\n\nCordialement,\n{companyName}`,
  2: `Bonjour {clientName},\n\nMalgré notre précédente relance, nous constatons que la facture n°{number} d'un montant de {amount}, échue le {date}, n'a toujours pas été réglée.\n\nNous vous prions de bien vouloir procéder au règlement sous 8 jours.\n\nVous pouvez consulter et régler la facture en ligne via ce lien :\n{link}\n\nCordialement,\n{companyName}`,
  3: `MISE EN DEMEURE DE PAYER\n\n{clientName},\n\nMalgré nos multiples relances, la facture n°{number} d'un montant de {amount}, échue le {date}, demeure impayée à ce jour.\n\nPar la présente, nous vous mettons en demeure de procéder au règlement intégral de cette somme sous 8 jours.\n\nVous pouvez consulter et régler la facture en ligne via ce lien :\n{link}\n\n{companyName}`
};

export default function Reminders() {
  const { user } = useAuth();
  const { hasPermission, loading: permLoading } = usePermissions();
  const navigate = useNavigate();

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

  useEffect(() => {
    if (!permLoading && !hasPermission('invoices.view')) {
      navigate('/dashboard');
    }
  }, [permLoading, hasPermission, navigate]);

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    loadReminders();
  }, [user]);

  const loadReminders = async () => {
    // ✅ CORRECTION TS18047 : Guard clause pour s'assurer que user n'est pas null
    if (!user) return; 

    try {
      setLoading(true);
      let teamId = null;
      const teamsRes = await databases.listDocuments(DATABASE_ID, 'teams', [Query.equal('ownerId', user?.$id)]);
      if (teamsRes.documents.length > 0) teamId = teamsRes.documents[0].$id;
      else {
        const membersRes = await databases.listDocuments(DATABASE_ID, 'team_members', [Query.equal('userId', user?.$id)]);
        if (membersRes.documents.length > 0) teamId = membersRes.documents[0].teamId;
      }
      if (!teamId) { setLoading(false); return; }
      setCurrentTeamId(teamId);

      const [quotesRes, invoicesRes, historyRes] = await Promise.all([
        databases.listDocuments(DATABASE_ID, 'quotes', [Query.equal('teamId', teamId), Query.limit(2000)]),
        databases.listDocuments(DATABASE_ID, 'invoices', [Query.equal('teamId', teamId), Query.limit(2000)]),
        databases.listDocuments(DATABASE_ID, 'reminders', [Query.equal('teamId', teamId), Query.orderDesc('$createdAt'), Query.limit(2000)])
      ]);

      setHistory(historyRes.documents as unknown as Reminder[]);

      const items: ReminderItem[] = [];
      const today = new Date();

      (quotesRes.documents as unknown as Quote[]).forEach(quote => {
        if (quote.status !== 'Envoyé') return;
        const issueDate = new Date(quote.issueDate || '');
        const daysSinceSent = Math.floor((today.getTime() - issueDate.getTime()) / (1000 * 60 * 60 * 24));
        const validityDate = quote.validityDate ? new Date(quote.validityDate) : null;
        const daysUntilExpiry = validityDate ? Math.floor((validityDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) : null;

        if (daysUntilExpiry !== null && daysUntilExpiry < 0) {
          items.push({ id: quote.$id, type: 'quote', number: quote.quoteNumber, clientName: quote.clientName, amount: quote.total, days: Math.abs(daysUntilExpiry), level: 3, urgency: 'critical', label: 'Devis expiré', email: quote.clientEmail, token: quote.clientToken });
        } else if (daysUntilExpiry !== null && daysUntilExpiry <= 3) {
          items.push({ id: quote.$id, type: 'quote', number: quote.quoteNumber, clientName: quote.clientName, amount: quote.total, days: daysUntilExpiry, level: 2, urgency: 'danger', label: `Expire dans ${daysUntilExpiry} jour(s)`, email: quote.clientEmail, token: quote.clientToken });
        } else if (daysSinceSent >= 15) {
          items.push({ id: quote.$id, type: 'quote', number: quote.quoteNumber, clientName: quote.clientName, amount: quote.total, days: daysSinceSent, level: 3, urgency: 'critical', label: `Sans réponse depuis ${daysSinceSent} jours`, email: quote.clientEmail, token: quote.clientToken });
        } else if (daysSinceSent >= 7) {
          items.push({ id: quote.$id, type: 'quote', number: quote.quoteNumber, clientName: quote.clientName, amount: quote.total, days: daysSinceSent, level: 2, urgency: 'danger', label: `Sans réponse depuis ${daysSinceSent} jours`, email: quote.clientEmail, token: quote.clientToken });
        } else if (daysSinceSent >= 3) {
          items.push({ id: quote.$id, type: 'quote', number: quote.quoteNumber, clientName: quote.clientName, amount: quote.total, days: daysSinceSent, level: 1, urgency: 'warning', label: `Sans réponse depuis ${daysSinceSent} jours`, email: quote.clientEmail, token: quote.clientToken });
        }
      });

      (invoicesRes.documents as unknown as Invoice[]).forEach(invoice => {
        if (invoice.status === 'paid' || invoice.status === 'cancelled') return;
        const dueDate = invoice.dueDate ? new Date(invoice.dueDate) : null;
        if (!dueDate) return;
        const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
        const daysUntilDue = Math.floor((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

        if (daysOverdue >= 30) {
          items.push({ id: invoice.$id, type: 'invoice', number: invoice.invoiceNumber, clientName: invoice.clientName, amount: invoice.balance || invoice.total, days: daysOverdue, level: 3, urgency: 'critical', label: `En retard de ${daysOverdue} jours`, email: invoice.clientEmail, token: invoice.clientToken });
        } else if (daysOverdue >= 15) {
          items.push({ id: invoice.$id, type: 'invoice', number: invoice.invoiceNumber, clientName: invoice.clientName, amount: invoice.balance || invoice.total, days: daysOverdue, level: 2, urgency: 'danger', label: `En retard de ${daysOverdue} jours`, email: invoice.clientEmail, token: invoice.clientToken });
        } else if (daysOverdue > 0) {
          items.push({ id: invoice.$id, type: 'invoice', number: invoice.invoiceNumber, clientName: invoice.clientName, amount: invoice.balance || invoice.total, days: daysOverdue, level: 1, urgency: 'warning', label: `En retard de ${daysOverdue} jours`, email: invoice.clientEmail, token: invoice.clientToken });
        } else if (daysUntilDue <= 3 && daysUntilDue >= 0) {
          items.push({ id: invoice.$id, type: 'invoice', number: invoice.invoiceNumber, clientName: invoice.clientName, amount: invoice.balance || invoice.total, days: -daysUntilDue, level: 1, urgency: 'info', label: `Échéance dans ${daysUntilDue} jour(s)`, email: invoice.clientEmail, token: invoice.clientToken });
        }
      });

      const urgencyOrder = { critical: 0, danger: 1, warning: 2, info: 3 };
      items.sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency]);
      setReminders(items);
    } catch (error) {
      console.error('Erreur chargement relances:', error);
    } finally {
      setLoading(false);
    }
  };

  const openSendModal = (item: ReminderItem) => {
    setSelectedReminder(item);
    const template = item.type === 'quote' ? quoteTemplates[item.level] : invoiceTemplates[item.level];
    const message = template
      .replace(/{clientName}/g, item.clientName)
      .replace(/{number}/g, item.number)
      .replace(/{amount}/g, `${item.amount.toFixed(2)} €`)
      .replace(/{date}/g, new Date().toLocaleDateString('fr-FR'))
      .replace(/{link}/g, item.token ? `${window.location.origin}/${item.type === 'quote' ? 'v' : 'f'}/${item.token}` : '[Lien non disponible]')
      .replace(/{companyName}/g, 'Votre entreprise')
      .replace(/{lastReminderDate}/g, new Date().toLocaleDateString('fr-FR'));
    
    setSendForm({ method: 'email', message });
    setShowSendModal(true);
  };

  const handleSendReminder = async () => {
    if (!selectedReminder || !currentTeamId || !user) return;
    
    setSending(true);
    try {
      await databases.createDocument(DATABASE_ID, 'reminders', ID.unique(), {
        teamId: currentTeamId,
        userId: user?.$id, // ✅ CORRECTION TS18047
        type: selectedReminder.type,
        relatedId: selectedReminder.id,
        relatedNumber: selectedReminder.number,
        clientName: selectedReminder.clientName,
        level: selectedReminder.level,
        method: sendForm.method,
        message: sendForm.message,
        sentAt: new Date().toISOString()
      });

      if (sendForm.method === 'email' && selectedReminder.email) {
        const subject = encodeURIComponent(`Relance - ${selectedReminder.type === 'quote' ? 'Devis' : 'Facture'} n°${selectedReminder.number}`);
        const body = encodeURIComponent(sendForm.message);
        window.open(`mailto:${selectedReminder.email}?subject=${subject}&body=${body}`);
      }

      setShowSendModal(false);
      setSelectedReminder(null);
      await loadReminders();
      alert('✅ Relance enregistrée avec succès !');
    } catch (error: any) {
      alert(`Erreur : ${error.message}`);
    } finally {
      setSending(false);
    }
  };

  const filteredReminders = reminders.filter(r => {
    const matchType = filterType === 'all' || r.type === filterType;
    const matchUrgency = filterUrgency === 'all' || r.urgency === filterUrgency;
    return matchType && matchUrgency;
  });

  const quoteReminders = filteredReminders.filter(r => r.type === 'quote');
  const invoiceReminders = filteredReminders.filter(r => r.type === 'invoice');
  const totalQuoteAmount = quoteReminders.reduce((s, r) => s + r.amount, 0);
  const totalInvoiceAmount = invoiceReminders.reduce((s, r) => s + r.amount, 0);

  if (permLoading) return <div className="min-h-screen flex items-center justify-center bg-gray-50">Vérification des droits...</div>;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-4">
            <button onClick={() => navigate('/dashboard')} className="text-slate-400 hover:text-slate-600"><ChevronLeft size={24} /></button>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 flex items-center"><Bell size={24} className="mr-2 text-orange-600" />Relances</h1>
              <p className="text-sm text-slate-500">{reminders.length} élément(s) à traiter</p>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex border-b border-slate-200 mb-6">
          <button onClick={() => setActiveTab('todo')} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'todo' ? 'border-orange-600 text-orange-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            📋 À relancer ({reminders.length})
          </button>
          <button onClick={() => setActiveTab('history')} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'history' ? 'border-orange-600 text-orange-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            📜 Historique ({history.length})
          </button>
        </div>

        {activeTab === 'todo' ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-white rounded-lg shadow p-4 border-l-4 border-blue-500">
                <p className="text-xs text-slate-500 uppercase font-semibold">Devis à relancer</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">{quoteReminders.length}</p>
              </div>
              <div className="bg-white rounded-lg shadow p-4 border-l-4 border-purple-500">
                <p className="text-xs text-slate-500 uppercase font-semibold">Montant devis</p>
                <p className="text-xl font-bold text-purple-600 mt-1">{totalQuoteAmount.toFixed(2)} €</p>
              </div>
              <div className="bg-white rounded-lg shadow p-4 border-l-4 border-orange-500">
                <p className="text-xs text-slate-500 uppercase font-semibold">Factures à relancer</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">{invoiceReminders.length}</p>
              </div>
              <div className="bg-white rounded-lg shadow p-4 border-l-4 border-red-500">
                <p className="text-xs text-slate-500 uppercase font-semibold">Montant factures</p>
                <p className="text-xl font-bold text-red-600 mt-1">{totalInvoiceAmount.toFixed(2)} €</p>
              </div>
            </div>

            <div className="flex gap-4 mb-6">
              <div className="relative">
                <Filter size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <select value={filterType} onChange={e => setFilterType(e.target.value as any)} className="pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none text-sm bg-white">
                  <option value="all">Tous les types</option>
                  <option value="quote">📄 Devis uniquement</option>
                  <option value="invoice">🧾 Factures uniquement</option>
                </select>
              </div>
              <div className="relative">
                <Filter size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <select value={filterUrgency} onChange={e => setFilterUrgency(e.target.value as any)} className="pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none text-sm bg-white">
                  <option value="all">Toutes les urgences</option>
                  <option value="critical">🔴 Critique</option>
                  <option value="danger">🟠 Urgent</option>
                  <option value="warning">🟡 À surveiller</option>
                  <option value="info">🔵 Information</option>
                </select>
              </div>
            </div>

            {loading ? (
              <div className="text-center py-12 text-slate-500">Chargement...</div>
            ) : filteredReminders.length === 0 ? (
              <div className="bg-white rounded-lg shadow p-12 text-center">
                <CheckCircle2 size={48} className="mx-auto text-green-500 mb-4" />
                <h3 className="text-lg font-semibold text-slate-700 mb-2">Aucune relance à effectuer</h3>
                <p className="text-slate-500">Tous vos devis et factures sont à jour. Excellent travail ! 🎉</p>
              </div>
            ) : (
              <div className="space-y-6">
                {quoteReminders.length > 0 && (
                  <div className="bg-white rounded-lg shadow overflow-hidden">
                    <div className="px-6 py-4 bg-blue-50 border-b border-blue-200 flex justify-between items-center">
                      <h3 className="font-semibold text-blue-900 flex items-center gap-2"><FileText size={18} /> Devis sans réponse ({quoteReminders.length})</h3>
                      <span className="text-sm font-bold text-blue-700">{totalQuoteAmount.toFixed(2)} €</span>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {quoteReminders.map(item => (
                        <div key={item.id} className={`px-6 py-4 border-l-4 ${urgencyColors[item.urgency].split(' ')[0]} hover:bg-slate-50 transition-colors`}>
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-1">
                                <span className="font-mono font-semibold text-slate-900">{item.number}</span>
                                <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${urgencyColors[item.urgency]}`}>{urgencyLabels[item.urgency]}</span>
                              </div>
                              <p className="text-sm font-medium text-slate-700">{item.clientName}</p>
                              <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                                <Clock size={12} /> {item.label} • Montant : {item.amount.toFixed(2)} €
                              </p>
                            </div>
                            <button onClick={() => openSendModal(item)} className="flex items-center gap-2 bg-orange-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-orange-700 transition-colors">
                              <Send size={14} /> Relancer
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {invoiceReminders.length > 0 && (
                  <div className="bg-white rounded-lg shadow overflow-hidden">
                    <div className="px-6 py-4 bg-orange-50 border-b border-orange-200 flex justify-between items-center">
                      <h3 className="font-semibold text-orange-900 flex items-center gap-2"><Receipt size={18} /> Factures impayées ({invoiceReminders.length})</h3>
                      <span className="text-sm font-bold text-orange-700">{totalInvoiceAmount.toFixed(2)} €</span>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {invoiceReminders.map(item => (
                        <div key={item.id} className={`px-6 py-4 border-l-4 ${urgencyColors[item.urgency].split(' ')[0]} hover:bg-slate-50 transition-colors`}>
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-1">
                                <span className="font-mono font-semibold text-slate-900">{item.number}</span>
                                <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${urgencyColors[item.urgency]}`}>{urgencyLabels[item.urgency]}</span>
                              </div>
                              <p className="text-sm font-medium text-slate-700">{item.clientName}</p>
                              <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                                <AlertCircle size={12} /> {item.label} • Reste à payer : {item.amount.toFixed(2)} €
                              </p>
                            </div>
                            <button onClick={() => openSendModal(item)} className="flex items-center gap-2 bg-orange-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-orange-700 transition-colors">
                              <Send size={14} /> Relancer
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Date</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Type</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Document</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Client</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Niveau</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Moyen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {history.length === 0 ? (
                    <tr><td colSpan={6} className="px-6 py-12 text-center text-slate-500">Aucune relance envoyée pour le moment.</td></tr>
                  ) : (
                    history.map(h => (
                      <tr key={h.$id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4 text-sm text-slate-600">{new Date(h.sentAt).toLocaleDateString('fr-FR')}</td>
                        <td className="px-6 py-4 text-sm">{h.type === 'quote' ? '📄 Devis' : '🧾 Facture'}</td>
                        <td className="px-6 py-4 text-sm font-mono font-semibold text-slate-900">{h.relatedNumber}</td>
                        <td className="px-6 py-4 text-sm text-slate-600">{h.clientName}</td>
                        <td className="px-6 py-4 text-sm">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${h.level === 1 ? 'bg-yellow-100 text-yellow-800' : h.level === 2 ? 'bg-orange-100 text-orange-800' : 'bg-red-100 text-red-800'}`}>
                            Niveau {h.level}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600">{methodLabels[h.method] || h.method}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {showSendModal && selectedReminder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0">
              <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <Send className="text-orange-600" size={22} /> Envoyer une relance
              </h2>
              <button onClick={() => setShowSendModal(false)} className="p-2 hover:bg-slate-100 rounded-lg">
                <X size={20} className="text-slate-500" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              <div className="bg-slate-50 border rounded-lg p-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><span className="text-slate-500">Document :</span> <strong>{selectedReminder.number}</strong></div>
                  <div><span className="text-slate-500">Client :</span> <strong>{selectedReminder.clientName}</strong></div>
                  <div><span className="text-slate-500">Montant :</span> <strong>{selectedReminder.amount.toFixed(2)} €</strong></div>
                  <div><span className="text-slate-500">Situation :</span> <strong>{selectedReminder.label}</strong></div>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Moyen de contact *</label>
                <div className="grid grid-cols-4 gap-2">
                  {Object.entries(methodLabels).map(([key, label]) => (
                    <button key={key} type="button" onClick={() => setSendForm({ ...sendForm, method: key })} className={`p-3 border rounded-lg text-sm font-medium transition-colors ${sendForm.method === key ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Message *</label>
                <textarea rows={10} value={sendForm.message} onChange={e => setSendForm({ ...sendForm, message: e.target.value })} className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 outline-none" />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t bg-slate-50 flex-shrink-0 rounded-b-xl">
              <button onClick={() => setShowSendModal(false)} className="px-4 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50">Annuler</button>
              <button onClick={handleSendReminder} disabled={sending || !sendForm.message.trim()} className="px-4 py-2.5 text-sm font-semibold text-white bg-orange-600 rounded-lg hover:bg-orange-700 disabled:opacity-50 flex items-center gap-2">
                {sending ? <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span> : <Send size={16} />} Enregistrer la relance
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}