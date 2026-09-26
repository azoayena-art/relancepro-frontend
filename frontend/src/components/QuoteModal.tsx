import { useState, useEffect, useRef } from 'react';
import { databases, DATABASE_ID } from '../appwrite';
import { useAuth } from '../context/AuthContext';
import SignatureCanvas from 'react-signature-canvas';
import {
  X, Calculator, Plus, Minus, Building2, User,
  Wrench, DollarSign, FileSignature, Shield, Upload,
  FileText, Package, Search, Check, Send
} from 'lucide-react';
import { Query, ID as AppwriteID, Permission, Role } from 'appwrite';

interface QuoteItem {
  id: string; reference: string; description: string; quantity: number;
  unit: string; unitPrice: number; tvaRate: number; total: number; discount: number;
}

interface Quote {
  $id: string; quoteNumber: string; clientName: string; subject?: string; status: string;
  total: number; issueDate?: string; validityDate?: string; items?: string;
  subtotal?: number; discount?: number; tax?: number; deposit?: number; balance?: number;
  companyName?: string; companyLegalForm?: string; companyAddress?: string;
  companySiret?: string; companyRcs?: string; companyTva?: string;
  companyPhone?: string; companyEmail?: string; logoFileId?: string;
  clientAddress?: string; clientBillingAddress?: string; clientEmail?: string;
  clientPhone?: string; executionDelay?: string; paymentConditions?: string;
  paymentMethods?: string; specialConditions?: string; acceptanceMention?: string;
  bonPourAccord?: boolean; tradeType?: string; insuranceName?: string;
  insuranceAddress?: string; insurancePolicy?: string; tvaMention?: string; 
  prospectId?: string;
  clientId?: string;
  clientSignature?: string; clientToken?: string; clientComment?: string;
}

interface CompanySettings {
  name: string; legalForm: string; address: string; siret: string; rcs: string;
  tvaNumber: string; phone: string; email: string; defaultTvaRate: string; logoFileId?: string;
}

interface CatalogProduct {
  $id: string; reference?: string; name: string; description?: string;
  unit: string; unitPrice: string; tvaRate: string;
}

interface QuoteFormData {
  prospectId: string;
  clientId: string;
  quoteNumber: string; status: string; issueDate: string;
  validityDate: string; subject: string; workAddress: string; companyName: string;
  companyLegalForm: string; companyAddress: string; companySiret: string; companyRcs: string;
  companyTva: string; companyPhone: string; companyEmail: string; logoFileId: string;
  clientName: string; clientAddress: string; clientBillingAddress: string;
  clientEmail: string; clientPhone: string; items: QuoteItem[]; discount: number;
  deposit: number; executionDelay: string; paymentConditions: string; paymentMethods: string;
  specialConditions: string; acceptanceMention: string; bonPourAccord: boolean;
  tradeType: string; insuranceName: string; insuranceAddress: string; insurancePolicy: string;
  clientSignature: string; clientToken: string; clientComment: string;
}

const PAYMENT_METHODS = ["Virement bancaire", "Chèque", "Espèces", "Carte bancaire", "Prélèvement SEPA"];
const EXECUTION_DELAYS = ["Immédiat", "Selon planning", "Sous 1 semaine", "Sous 2 semaines", "Sous 1 mois", "À convenir"];
const INSURANCE_TYPES = ["Décennale (BTP)", "Responsabilité Civile Pro", "Multirisque Pro", "Garantie Parfaite Achèvement", "Non applicable"];
const UNIT_OPTIONS = ['Forfait', 'Heure', 'Jour', 'm²', 'ml', 'Unité', 'kg', 'Intervention'];
const TVA_OPTIONS = ['20', '10', '5.5', '0'];

interface QuoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  clients: any[];
  companySettings: CompanySettings | null;
  editingQuote?: Quote | null;
  preselectedClientId?: string | null;
  getNextQuoteNumber: () => Promise<string>;
  currentTeamId: string | null;
  userPermissions?: string[];
}

const emptyFormData = (): QuoteFormData => ({
  prospectId: '',
  clientId: '', quoteNumber: `DEV-${new Date().getFullYear()}-000`,
  status: 'Brouillon', issueDate: new Date().toISOString().split('T')[0],
  validityDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  subject: '', workAddress: '', companyName: '', companyLegalForm: 'Entreprise Individuelle',
  companyAddress: '', companySiret: '', companyRcs: '',
  companyTva: 'TVA non applicable, art. 293 B du CGI', companyPhone: '', companyEmail: '', logoFileId: '',
  clientName: '', clientAddress: '', clientBillingAddress: '', clientEmail: '', clientPhone: '',
  items: [{ id: '1', reference: '', description: '', quantity: 1, unit: 'Forfait', unitPrice: 0, tvaRate: 20, total: 0, discount: 0 }],
  discount: 0, deposit: 0, executionDelay: 'Selon planning', paymentConditions: 'Paiement à 30 jours',
  paymentMethods: 'Virement bancaire', specialConditions: '', acceptanceMention: 'Lu et approuvé, bon pour accord',
  bonPourAccord: true, tradeType: '', insuranceName: '', insuranceAddress: '', insurancePolicy: '',
  clientSignature: '', clientToken: '', clientComment: ''
});

export default function QuoteModal({ 
  isOpen, onClose, onSave, clients = [], companySettings, 
  editingQuote, preselectedClientId = null, getNextQuoteNumber, currentTeamId, userPermissions = []
}: QuoteModalProps) {

  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [sendingToClient, setSendingToClient] = useState(false);
  const [formData, setFormData] = useState<QuoteFormData>(emptyFormData());
  
  const [catalogProducts, setCatalogProducts] = useState<CatalogProduct[]>([]);
  const [showCatalogModal, setShowCatalogModal] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState('');
  
  const [clientSearch, setClientSearch] = useState('');
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  
  const sigCanvas = useRef<SignatureCanvas>(null);
  const [sigTab, setSigTab] = useState<'draw' | 'upload'>('draw');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      wasOpenRef.current = true;
      initForm();
      loadCatalogProducts();
    }
    if (!isOpen) {
      wasOpenRef.current = false;
      setClientSearch('');
      setShowClientDropdown(false);
    }
  }, [isOpen]);

  const loadCatalogProducts = async () => {
    if (!currentTeamId) return;
    try {
      const res = await databases.listDocuments(DATABASE_ID, 'products', [
        Query.equal('teamId', currentTeamId),
        Query.equal('status', 'active'),
        Query.orderDesc('$createdAt'),
        Query.limit(500)
      ]);
      setCatalogProducts(res.documents as unknown as CatalogProduct[]);
    } catch (e) { console.error('Erreur chargement catalogue:', e); }
  };

  const initForm = async () => {
    let freshSettings = companySettings;
    try {
      const res = await databases.listDocuments(DATABASE_ID, 'company_settings', [Query.equal('userId', user.$id)]);
      if (res.documents.length > 0) freshSettings = res.documents[0] as unknown as CompanySettings;
    } catch (e) { console.log('Settings non trouvés'); }

    if (editingQuote) {
      let parsedItems: QuoteItem[] = [];
      try { 
        parsedItems = editingQuote.items ? JSON.parse(editingQuote.items) : emptyFormData().items;
        parsedItems = parsedItems.map(item => ({ ...item, discount: item.discount || 0 }));
      } catch(e){ parsedItems = emptyFormData().items; }
      
      setFormData({
        prospectId: editingQuote.prospectId || '',
        clientId: editingQuote.clientId || '',
        quoteNumber: editingQuote.quoteNumber || '', 
        status: editingQuote.status === 'Refusé' ? 'Brouillon' : editingQuote.status || 'Brouillon',
        issueDate: editingQuote.issueDate || new Date().toISOString().split('T')[0], 
        validityDate: editingQuote.validityDate || '',
        subject: editingQuote.subject || '', workAddress: '', 
        companyName: editingQuote.companyName || '', companyLegalForm: editingQuote.companyLegalForm || '',
        companyAddress: editingQuote.companyAddress || '', companySiret: editingQuote.companySiret || '',
        companyRcs: editingQuote.companyRcs || '', companyTva: editingQuote.companyTva || '',
        companyPhone: editingQuote.companyPhone || '', companyEmail: editingQuote.companyEmail || '',
        logoFileId: editingQuote.logoFileId || '', clientName: editingQuote.clientName || '',
        clientAddress: editingQuote.clientAddress || '', clientBillingAddress: editingQuote.clientBillingAddress || '',
        clientEmail: editingQuote.clientEmail || '', clientPhone: editingQuote.clientPhone || '',
        items: parsedItems, discount: editingQuote.discount || 0, deposit: editingQuote.deposit || 0,
        executionDelay: editingQuote.executionDelay || '', paymentConditions: editingQuote.paymentConditions || '',
        paymentMethods: editingQuote.paymentMethods || '', specialConditions: editingQuote.specialConditions || '',
        acceptanceMention: editingQuote.acceptanceMention || '', bonPourAccord: editingQuote.bonPourAccord || false,
        tradeType: editingQuote.tradeType || '', insuranceName: editingQuote.insuranceName || '',
        insuranceAddress: editingQuote.insuranceAddress || '', insurancePolicy: editingQuote.insurancePolicy || '',
        clientSignature: editingQuote.clientSignature || '', clientToken: editingQuote.clientToken || '', 
        clientComment: editingQuote.clientComment || ''
      });
      setClientSearch(editingQuote.clientName || '');
    } else {
      const newQuoteNumber = await getNextQuoteNumber();
      const defaultTvaRate = parseFloat(freshSettings?.defaultTvaRate || '20');
      const def = freshSettings ? {
        ...emptyFormData(), 
        quoteNumber: newQuoteNumber,
        companyName: freshSettings.name || '', companyLegalForm: freshSettings.legalForm || 'Entreprise Individuelle',
        companyAddress: freshSettings.address || '', companySiret: freshSettings.siret || '',
        companyRcs: freshSettings.rcs || '', companyTva: freshSettings.tvaNumber || 'TVA non applicable, art. 293 B du CGI',
        companyPhone: freshSettings.phone || '', companyEmail: freshSettings.email || '',
        logoFileId: freshSettings.logoFileId || '',
        items: [{ id: '1', reference: '', description: '', quantity: 1, unit: 'Forfait', unitPrice: 0, tvaRate: defaultTvaRate, total: 0, discount: 0 }]
      } : { ...emptyFormData(), quoteNumber: newQuoteNumber };
      
      if (preselectedClientId) {
        const c = clients.find((x: any) => x.$id === preselectedClientId);
        if (c) {
          def.clientId = c.$id;
          def.clientName = `${c.firstName||''} ${c.lastName||''}`.trim() || c.companyName || '';
          def.clientAddress = c.address || '';
          def.clientBillingAddress = c.billingAddress || c.address || '';
          def.clientEmail = c.email || '';
          def.clientPhone = c.phone || '';
          setClientSearch(`${def.clientName} ${c.companyName ? `(${c.companyName})` : ''}`);
        }
      }
      setFormData(def);
    }
    if (sigCanvas.current) sigCanvas.current.clear();
    setSigTab('draw');
  };

  const handleClientSelect = (client: any) => {
    setFormData(prev => ({
      ...prev,
      clientId: client.$id,
      prospectId: '',
      clientName: `${client.firstName||''} ${client.lastName||''}`.trim() || client.companyName || '',
      clientAddress: client.address || '',
      clientBillingAddress: client.billingAddress || client.address || '',
      clientEmail: client.email || '',
      clientPhone: client.phone || ''
    }));
    setClientSearch(`${client.firstName} ${client.lastName} ${client.companyName ? `(${client.companyName})` : ''}`);
    setShowClientDropdown(false);
  };

  const subtotal = formData.items.reduce((s, i) => s + (i.quantity * i.unitPrice * (1 - (i.discount || 0) / 100)), 0);
  const discountAmount = subtotal * (formData.discount / 100);
  const taxableAmount = subtotal - discountAmount;
  const isTvaApplicable = !formData.companyTva.includes('non applicable');
  const tax = isTvaApplicable ? formData.items.reduce((a, i) => a + ((i.quantity * i.unitPrice * (1 - (i.discount || 0) / 100) * (1 - formData.discount / 100)) * (i.tvaRate / 100)), 0) : 0;
  const total = taxableAmount + tax; 
  const balance = total - formData.deposit;

  const handleItemChange = (idx: number, field: keyof QuoteItem, val: any) => {
    setFormData(prev => {
      const n = [...prev.items];
      const updated = { ...n[idx], [field]: val };
      if (field === 'quantity' || field === 'unitPrice' || field === 'discount') {
        updated.total = Number((updated.quantity * updated.unitPrice * (1 - (updated.discount || 0) / 100)).toFixed(2));
      }
      n[idx] = updated;
      return { ...prev, items: n };
    });
  };

  const addItem = () => {
    const defaultTvaRate = parseFloat(companySettings?.defaultTvaRate || '20');
    setFormData(prev => ({
      ...prev, 
      items: [...prev.items, { id: Date.now().toString(), reference: '', description: '', quantity: 1, unit: 'Forfait', unitPrice: 0, tvaRate: defaultTvaRate, total: 0, discount: 0 }]
    }));
  };

  const addCatalogItem = (product: CatalogProduct) => {
    const defaultTvaRate = parseFloat(companySettings?.defaultTvaRate || '20');
    const newItem: QuoteItem = {
      id: Date.now().toString(),
      reference: product.reference || '',
      description: product.name + (product.description ? ` - ${product.description}` : ''),
      quantity: 1, unit: product.unit || 'Forfait',
      unitPrice: parseFloat(product.unitPrice) || 0,
      tvaRate: parseFloat(product.tvaRate) || defaultTvaRate,
      total: parseFloat(product.unitPrice) || 0, discount: 0
    };
    setFormData(prev => ({ ...prev, items: [...prev.items, newItem] }));
    setShowCatalogModal(false);
    setCatalogSearch('');
  };

  const removeItem = (i: number) => { 
    if (formData.items.length === 1) return; 
    setFormData(prev => ({ ...prev, items: prev.items.filter((_, x) => x !== i) })); 
  };

  const handleSigUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setFormData(prev => ({ ...prev, clientSignature: reader.result as string }));
      setSigTab('upload');
    };
    reader.readAsDataURL(file);
  };

  const saveSignature = () => {
    if (sigCanvas.current && !sigCanvas.current.isEmpty()) {
      setFormData(prev => ({ ...prev, clientSignature: sigCanvas.current!.toDataURL('image/png') }));
    }
  };

  const clearSignature = () => {
    setFormData(prev => ({ ...prev, clientSignature: '' }));
    if (sigCanvas.current) sigCanvas.current.clear();
  };

  const buildPayload = (status: string, clientToken?: string) => ({
    ...formData, userId: user?.$id, teamId: currentTeamId, status,
    clientToken: clientToken || formData.clientToken,
    items: JSON.stringify(formData.items), subtotal, discount: formData.discount, 
    tax: Number(tax.toFixed(2)), total: Number(total.toFixed(2)),
    deposit: formData.deposit, balance: Number(balance.toFixed(2)), 
    tvaMention: formData.companyTva, createdAt: new Date().toISOString() 
  });

  const getPermissions = (isPublic: boolean) => {
    const secureTeamId = user?.secureTeamId;
    if (secureTeamId) {
      if (isPublic) {
        return [
          Permission.read(Role.team(secureTeamId)),
          Permission.read(Role.any()),
          Permission.update(Role.team(secureTeamId)),
          Permission.delete(Role.team(secureTeamId))
        ];
      } else {
        return [
          Permission.read(Role.team(secureTeamId)),
          Permission.update(Role.team(secureTeamId)),
          Permission.delete(Role.team(secureTeamId))
        ];
      }
    } else {
      if (isPublic) {
        return [
          Permission.read(Role.users()),
          Permission.read(Role.any()),
          Permission.update(Role.users()),
          Permission.delete(Role.users())
        ];
      } else {
        return [
          Permission.read(Role.users()),
          Permission.update(Role.users()),
          Permission.delete(Role.users())
        ];
      }
    }
  };

  const saveDocument = async (payload: any, permissions: any[]) => {
    if (editingQuote) {
      if (editingQuote.teamId && editingQuote.teamId !== currentTeamId) {
        throw new Error('Accès refusé : Ce devis n\'appartient pas à votre équipe');
      }
      await databases.updateDocument(DATABASE_ID, 'quotes', editingQuote.$id, payload, permissions);
    } else {
      await databases.createDocument(DATABASE_ID, 'quotes', AppwriteID.unique(), payload, permissions);
    }
  };

  const handleSubmit = async () => {
    if (!formData.clientId) { alert('Veuillez sélectionner un client.'); return; }
    if (formData.items.some(i => !i.description)) { alert('La description est requise pour chaque ligne.'); return; }
    
    setSaving(true);
    try {
      await saveDocument(buildPayload('Brouillon'), getPermissions(false));
      onSave();
    } catch (e: any) { 
      console.error('Erreur handleSubmit:', e);
      alert(`Erreur: ${e.message}`); 
    } finally { 
      setSaving(false); 
    }
  };

  const handleSendToClient = async () => {
    if (!formData.clientId) { alert('Veuillez sélectionner un client.'); return; }
    if (formData.items.some(i => !i.description)) { alert('La description est requise pour chaque ligne.'); return; }
    
    setSendingToClient(true);
    try {
      const token = formData.clientToken || Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      await saveDocument(buildPayload('Envoyé', token), getPermissions(true));
      const link = `${window.location.origin}/v/${token}`;
      try {
        await navigator.clipboard.writeText(link);
        alert(`Devis envoyé !\n\nLien copié :\n${link}`);
      } catch { alert(`Devis envoyé !\n\nLien :\n${link}`); }
      onSave();
    } catch (e: any) { 
      console.error('Erreur handleSendToClient:', e);
      alert(`Erreur: ${e.message}`); 
    } finally { 
      setSendingToClient(false); 
    }
  };

  const fm = (a: number) => `${a.toFixed(2)} €`;
  const filteredCatalogProducts = catalogProducts.filter(p => 
    catalogSearch === '' || p.name.toLowerCase().includes(catalogSearch.toLowerCase()) || (p.reference && p.reference.toLowerCase().includes(catalogSearch.toLowerCase()))
  );
  
  const filteredClients = clients.filter((c: any) => 
    clientSearch === '' || `${c.firstName} ${c.lastName} ${c.companyName}`.toLowerCase().includes(clientSearch.toLowerCase())
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-5xl my-8 border border-slate-100 dark:border-slate-700 flex flex-col max-h-[90vh]">
        
        {/* HEADER */}
        <div className="flex items-center justify-between px-4 sm:px-8 py-5 border-b border-slate-100 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/80 rounded-t-2xl shrink-0">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Calculator className="text-blue-600" size={24} />
              {editingQuote ? (formData.status === 'Refusé' ? 'Modifier (Refusé)' : 'Modifier le devis') : 'Nouveau Devis'}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {editingQuote ? `Devis n° ${editingQuote.quoteNumber}` : 'Créez un devis professionnel en quelques clics'}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">
            <X size={20} />
          </button>
        </div>
        
        {/* BODY */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 space-y-6 sm:space-y-8">
          
          {formData.clientComment && formData.status === 'Refusé' && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200 px-4 py-3 rounded-xl flex items-start gap-3">
              <X size={20} className="mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-semibold text-sm">Motif du refus du client :</p>
                <p className="text-sm mt-1 whitespace-pre-wrap">{formData.clientComment}</p>
              </div>
            </div>
          )}

          {/* CLIENT */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <User size={14} className="text-blue-600" /> Client destinataire
            </h3>
            <div className="relative">
              <div className="relative group">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={18} />
                <input
                  type="text"
                  placeholder="Rechercher un client par nom ou entreprise..."
                  value={clientSearch}
                  onChange={(e) => { setClientSearch(e.target.value); setShowClientDropdown(true); }}
                  onFocus={() => setShowClientDropdown(true)}
                  className="w-full pl-11 pr-4 py-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-sm font-medium text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500"
                />
              </div>
              
              {showClientDropdown && (
                <div className="absolute z-20 w-full mt-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl max-h-64 overflow-y-auto ring-1 ring-black/5">
                  {filteredClients.length === 0 ? (
                    <div className="p-4 text-sm text-slate-500 dark:text-slate-400 text-center">Aucun client trouvé</div>
                  ) : (
                    filteredClients.map((client: any) => (
                      <button
                        key={client.$id}
                        onClick={() => handleClientSelect(client)}
                        className="w-full text-left px-4 py-3 hover:bg-blue-50 dark:hover:bg-slate-700 transition-colors border-b border-slate-50 dark:border-slate-700 last:border-0 flex items-center gap-3"
                      >
                        <div className="w-9 h-9 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 flex items-center justify-center font-bold text-xs shrink-0">
                          {(client.firstName?.[0] || '') + (client.lastName?.[0] || '')}
                        </div>
                        <div>
                          <div className="font-semibold text-slate-900 dark:text-white text-sm">{client.firstName} {client.lastName}</div>
                          {client.companyName && <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{client.companyName}</div>}
                        </div>
                        {formData.clientId === client.$id && <Check size={16} className="text-blue-600 dark:text-blue-400 ml-auto" />}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          {/* INFOS DEVIS & ENTREPRISE */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-4">
              <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-2">
                <FileText size={14} className="text-blue-600" /> Informations du devis
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">N° Devis</label>
                  <input readOnly value={formData.quoteNumber} className="w-full px-3 py-3 bg-slate-100 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg text-sm font-semibold text-blue-700 dark:text-blue-400" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">Objet</label>
                  <input type="text" value={formData.subject} onChange={e => setFormData({...formData, subject: e.target.value})} className="w-full px-3 py-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none text-sm text-slate-900 dark:text-white" placeholder="Ex: Rénovation..." />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">Date d'émission</label>
                  <input type="date" value={formData.issueDate} onChange={e => setFormData({...formData, issueDate: e.target.value})} className="w-full px-3 py-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none text-sm text-slate-900 dark:text-white" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">Date de validité</label>
                  <input type="date" value={formData.validityDate} onChange={e => setFormData({...formData, validityDate: e.target.value})} className="w-full px-3 py-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none text-sm text-slate-900 dark:text-white" />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-2">
                <Building2 size={14} className="text-blue-600" /> Mon Entreprise
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2 space-y-1.5">
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">Nom de l'entreprise</label>
                  <input placeholder="Nom entreprise" value={formData.companyName} onChange={e => setFormData({...formData, companyName: e.target.value})} className="w-full px-3 py-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none text-sm text-slate-900 dark:text-white" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">Forme juridique</label>
                  <input placeholder="Ex: SARL, EI..." value={formData.companyLegalForm} onChange={e => setFormData({...formData, companyLegalForm: e.target.value})} className="w-full px-3 py-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none text-sm text-slate-900 dark:text-white" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">Adresse</label>
                  <input placeholder="Adresse complète" value={formData.companyAddress} onChange={e => setFormData({...formData, companyAddress: e.target.value})} className="w-full px-3 py-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none text-sm text-slate-900 dark:text-white" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">SIRET</label>
                  <input placeholder="SIRET" value={formData.companySiret} onChange={e => setFormData({...formData, companySiret: e.target.value})} className="w-full px-3 py-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none text-sm text-slate-900 dark:text-white" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">RCS / RM</label>
                  <input placeholder="RCS/RM" value={formData.companyRcs} onChange={e => setFormData({...formData, companyRcs: e.target.value})} className="w-full px-3 py-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none text-sm text-slate-900 dark:text-white" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">Téléphone</label>
                  <input placeholder="Téléphone" value={formData.companyPhone} onChange={e => setFormData({...formData, companyPhone: e.target.value})} className="w-full px-3 py-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none text-sm text-slate-900 dark:text-white" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">Email</label>
                  <input placeholder="Email" value={formData.companyEmail} onChange={e => setFormData({...formData, companyEmail: e.target.value})} className="w-full px-3 py-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none text-sm text-slate-900 dark:text-white" />
                </div>
                <div className="sm:col-span-2 space-y-1.5">
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">TVA</label>
                  <select value={formData.companyTva} onChange={e => setFormData({...formData, companyTva: e.target.value})} className="w-full px-3 py-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none text-sm text-slate-900 dark:text-white">
                    <option value="TVA non applicable, art. 293 B du CGI">TVA non applicable, art. 293 B du CGI</option>
                    <option value="FRXX123456789">Assujetti à la TVA (FR...)</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* PRESTATIONS */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-2">
                <Wrench size={14} className="text-blue-600" /> Prestations & Produits
              </h3>
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowCatalogModal(true)} className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 flex items-center gap-1 bg-indigo-50 dark:bg-indigo-900/30 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 px-3 py-2 rounded-lg transition-colors">
                  <Package size={14}/> Catalogue
                </button>
                <button type="button" onClick={addItem} className="text-xs font-semibold text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 flex items-center gap-1 bg-green-50 dark:bg-green-900/30 hover:bg-green-100 dark:hover:bg-green-900/50 px-3 py-2 rounded-lg transition-colors">
                  <Plus size={14}/> Ligne libre
                </button>
              </div>
            </div>
            
            <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden overflow-x-auto">
              <table className="w-full text-sm min-w-[800px]">
                <thead className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 w-24">Réf.</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400">Description</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 w-16">Qté</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 w-24">Unité</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 dark:text-slate-400 w-24">Prix U. HT</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 w-20">Remise %</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 w-20">TVA %</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 dark:text-slate-400 w-28">Total HT</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 w-12"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700 bg-white dark:bg-slate-800">
                  {formData.items.map((item, idx) => (
                    <tr key={item.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-700/50 transition-colors">
                      <td className="px-4 py-2"><input type="text" value={item.reference} onChange={e => handleItemChange(idx, 'reference', e.target.value)} className="w-full bg-transparent border-none focus:ring-0 text-xs p-1 text-slate-900 dark:text-white placeholder-slate-400" placeholder="REF" /></td>
                      <td className="px-4 py-2"><input type="text" value={item.description} onChange={e => handleItemChange(idx, 'description', e.target.value)} className="w-full bg-transparent border-none focus:ring-0 text-sm p-1 font-medium text-slate-900 dark:text-white placeholder-slate-400" placeholder="Description" /></td>
                      <td className="px-4 py-2"><input type="number" min="0" step="0.01" value={item.quantity} onChange={e => handleItemChange(idx, 'quantity', parseFloat(e.target.value) || 0)} className="w-full text-center bg-transparent border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-xs p-1" /></td>
                      <td className="px-4 py-2">
                        <select value={item.unit} onChange={e => handleItemChange(idx, 'unit', e.target.value)} className="w-full text-center bg-transparent border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-xs p-1">
                          {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-2"><input type="number" min="0" step="0.01" value={item.unitPrice} onChange={e => handleItemChange(idx, 'unitPrice', parseFloat(e.target.value) || 0)} className="w-full text-right bg-transparent border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-xs p-1" /></td>
                      <td className="px-4 py-2"><input type="number" min="0" max="100" step="0.01" value={item.discount || 0} onChange={e => handleItemChange(idx, 'discount', parseFloat(e.target.value) || 0)} className="w-full text-center bg-transparent border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-xs p-1" title="Remise en %" /></td>
                      <td className="px-4 py-2">
                        <select value={item.tvaRate} onChange={e => handleItemChange(idx, 'tvaRate', parseFloat(e.target.value))} className="w-full text-center bg-transparent border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-xs p-1">
                          {TVA_OPTIONS.map(t => <option key={t} value={t}>{t}%</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-2 text-right font-semibold text-slate-900 dark:text-white text-xs">{item.total.toFixed(2)} €</td>
                      <td className="px-4 py-2 text-center">
                        <button onClick={() => removeItem(idx)} className="text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 p-1.5 rounded transition-colors"><Minus size={14} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* CONDITIONS & RÉCAP */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">
            <div className="space-y-4">
              <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-2">
                <DollarSign size={14} className="text-blue-600" /> Conditions & Modalités
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">Remise globale (%)</label>
                  <input type="number" min="0" max="100" value={formData.discount} onChange={e => setFormData({...formData, discount: parseFloat(e.target.value) || 0})} className="w-full px-3 py-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none text-sm text-slate-900 dark:text-white" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">Acompte (€)</label>
                  <input type="number" min="0" step="0.01" value={formData.deposit} onChange={e => setFormData({...formData, deposit: parseFloat(e.target.value) || 0})} className="w-full px-3 py-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none text-sm text-slate-900 dark:text-white" />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">Modalités de paiement</label>
                <input list="dl-pm" value={formData.paymentMethods} onChange={e => setFormData({...formData, paymentMethods: e.target.value})} className="w-full px-3 py-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none text-sm text-slate-900 dark:text-white" placeholder="Ex: Virement..." />
                <datalist id="dl-pm">{PAYMENT_METHODS.map(m => <option key={m} value={m}/>)}</datalist>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">Délai d'exécution</label>
                <input list="dl-ed" value={formData.executionDelay} onChange={e => setFormData({...formData, executionDelay: e.target.value})} className="w-full px-3 py-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none text-sm text-slate-900 dark:text-white" />
                <datalist id="dl-ed">{EXECUTION_DELAYS.map(d => <option key={d} value={d}/>)}</datalist>
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-6 border border-slate-200 dark:border-slate-600 space-y-3 h-fit">
              <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-4">Récapitulatif financier</h3>
              <div className="flex justify-between text-sm">
                <span className="text-slate-600 dark:text-slate-400">Total HT</span>
                <span className="font-semibold text-slate-900 dark:text-white">{subtotal.toFixed(2)} €</span>
              </div>
              {formData.discount > 0 && (
                <div className="flex justify-between text-sm text-red-600 dark:text-red-400">
                  <span>Remise globale</span>
                  <span className="font-semibold">- {discountAmount.toFixed(2)} €</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-slate-600 dark:text-slate-400">Total TVA</span>
                <span className="font-semibold text-slate-900 dark:text-white">{tax.toFixed(2)} €</span>
              </div>
              <div className="border-t border-slate-200 dark:border-slate-600 my-3"></div>
              <div className="flex justify-between text-base">
                <span className="font-bold text-slate-900 dark:text-white">Total TTC</span>
                <span className="font-bold text-blue-600 dark:text-blue-400">{total.toFixed(2)} €</span>
              </div>
              {formData.deposit > 0 && (
                <>
                  <div className="flex justify-between text-sm text-red-600 dark:text-red-400">
                    <span>Acompte à verser</span>
                    <span className="font-semibold">- {formData.deposit.toFixed(2)} €</span>
                  </div>
                  <div className="border-t border-slate-300 dark:border-slate-500 my-3"></div>
                  <div className="flex justify-between text-lg">
                    <span className="font-bold text-slate-900 dark:text-white">Net à payer</span>
                    <span className="font-bold text-slate-900 dark:text-white">{balance.toFixed(2)} €</span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* SIGNATURE & ASSURANCES */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-xl p-5">
              <h3 className="text-xs font-bold text-purple-900 dark:text-purple-200 uppercase tracking-wider mb-3 flex items-center gap-2"><FileSignature size={14} className="text-purple-600 dark:text-purple-400"/>Signature Client</h3>
              <div className="space-y-3">
                <div className="flex gap-2">
                  <button type="button" onClick={() => setSigTab('draw')} className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${sigTab === 'draw' ? 'bg-purple-600 text-white' : 'bg-white dark:bg-slate-800 text-purple-600 dark:text-purple-400 border border-purple-200 dark:border-purple-800'}`}>Dessiner</button>
                  <button type="button" onClick={() => setSigTab('upload')} className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${sigTab === 'upload' ? 'bg-purple-600 text-white' : 'bg-white dark:bg-slate-800 text-purple-600 dark:text-purple-400 border border-purple-200 dark:border-purple-800'}`}>Importer</button>
                </div>
                {sigTab === 'draw' ? (
                  <div className="border border-purple-300 dark:border-purple-700 rounded-lg bg-white dark:bg-slate-800 overflow-hidden relative" style={{width: '100%', height: '120px'}}>
                    <SignatureCanvas ref={sigCanvas} penColor='black' canvasProps={{ width: 350, height: 120, className: 'block' }} onEnd={saveSignature} />
                  </div>
                ) : (
                  <div className="border border-purple-300 dark:border-purple-700 rounded-lg bg-white dark:bg-slate-800 p-6 text-center border-dashed">
                    <input ref={fileInputRef} type="file" accept="image/png,image/jpeg" onChange={handleSigUpload} className="hidden" id="sig-up-modal"/>
                    <label htmlFor="sig-up-modal" className="cursor-pointer text-sm text-purple-600 dark:text-purple-400 font-medium flex items-center justify-center gap-2 hover:text-purple-800 dark:hover:text-purple-300 transition-colors"><Upload size={16}/>Choisir une image de signature</label>
                  </div>
                )}
                {formData.clientSignature && (
                  <div className="mt-2 p-2 bg-white dark:bg-slate-800 border border-purple-200 dark:border-purple-700 rounded-lg flex justify-between items-center">
                    <img src={formData.clientSignature} alt="Sig" className="h-10"/>
                    <button type="button" onClick={clearSignature} className="text-xs text-red-500 font-medium hover:text-red-700 dark:hover:text-red-400">Supprimer</button>
                  </div>
                )}
                <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
                  <input type="checkbox" checked={formData.bonPourAccord} onChange={e => setFormData(prev => ({...prev, bonPourAccord: e.target.checked}))} className="rounded text-purple-600 focus:ring-purple-500"/> 
                  Inclure la signature sur le PDF généré
                </label>
              </div>
            </div>

            <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-xl p-5">
              <h3 className="text-xs font-bold text-orange-900 dark:text-orange-200 uppercase tracking-wider mb-3 flex items-center gap-2"><Shield size={14} className="text-orange-600 dark:text-orange-400"/>Assurances</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <input list="dl-ins" value={formData.tradeType} onChange={e => setFormData(prev => ({...prev, tradeType: e.target.value}))} className="w-full px-3 py-3 bg-white dark:bg-slate-700 border border-orange-200 dark:border-orange-800 rounded-lg focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none text-sm text-slate-900 dark:text-white" placeholder="Type de garantie..."/>
                  <datalist id="dl-ins">{INSURANCE_TYPES.map(t => <option key={t} value={t}/>)}</datalist>
                </div>
                <input placeholder="Nom assureur" value={formData.insuranceName} onChange={e => setFormData(prev => ({...prev, insuranceName: e.target.value}))} className="w-full px-3 py-3 bg-white dark:bg-slate-700 border border-orange-200 dark:border-orange-800 rounded-lg focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none text-sm text-slate-900 dark:text-white" />
                <input placeholder="N° police" value={formData.insurancePolicy} onChange={e => setFormData(prev => ({...prev, insurancePolicy: e.target.value}))} className="w-full px-3 py-3 bg-white dark:bg-slate-700 border border-orange-200 dark:border-orange-800 rounded-lg focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none text-sm text-slate-900 dark:text-white" />
                <input placeholder="Adresse assureur" value={formData.insuranceAddress} onChange={e => setFormData(prev => ({...prev, insuranceAddress: e.target.value}))} className="w-full sm:col-span-2 px-3 py-3 bg-white dark:bg-slate-700 border border-orange-200 dark:border-orange-800 rounded-lg focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none text-sm text-slate-900 dark:text-white" />
              </div>
            </div>
          </div>
        </div>

        {/* FOOTER */}
        <div className="px-4 sm:px-8 py-5 border-t border-slate-100 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/80 rounded-b-2xl flex flex-col sm:flex-row justify-end gap-3 shrink-0">
          <button onClick={onClose} className="w-full sm:w-auto px-5 py-3 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-600 transition-all active:scale-95">
            Annuler
          </button>
          <button onClick={handleSubmit} disabled={saving || sendingToClient} className="w-full sm:w-auto px-5 py-3 text-sm font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-600 transition-all flex items-center justify-center gap-2 disabled:opacity-50 active:scale-95">
            {(saving || sendingToClient) && <span className="animate-spin h-4 w-4 border-2 border-slate-700 dark:border-slate-300 border-t-transparent rounded-full"></span>}
            Enregistrer (Brouillon)
          </button>
          
          <button onClick={handleSendToClient} disabled={saving || sendingToClient} className="w-full sm:w-auto px-6 py-3 text-sm font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2 disabled:opacity-50 active:scale-95">
            {sendingToClient ? 'Envoi...' : <><Send size={16}/> Envoyer au client</>}
          </button>
        </div>
      </div>

      {/* MODAL CATALOGUE */}
      {showCatalogModal && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4 animate-fadeIn">
          <div className="bg-white dark:bg-slate-800 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-2xl max-h-[80vh] flex flex-col border border-slate-100 dark:border-slate-700 animate-slideUp">
            <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-700 shrink-0">
              <h3 className="text-lg font-bold flex items-center gap-2 text-slate-900 dark:text-white">
                <Package className="text-indigo-600 dark:text-indigo-400" size={20} />
                Ajouter depuis le catalogue
              </h3>
              <button onClick={() => { setShowCatalogModal(false); setCatalogSearch(''); }} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors">
                <X size={20} className="text-slate-500 dark:text-slate-400" />
              </button>
            </div>
            
            <div className="p-5 border-b border-slate-100 dark:border-slate-700 shrink-0">
              <div className="relative">
                <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                <input 
                  type="text" 
                  placeholder="Rechercher un produit par nom ou référence..." 
                  value={catalogSearch}
                  onChange={(e) => setCatalogSearch(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none text-sm transition-all"
                  autoFocus
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              {filteredCatalogProducts.length === 0 ? (
                <div className="text-center py-12 text-slate-500 dark:text-slate-400">
                  <Package size={48} className="mx-auto text-slate-200 dark:text-slate-700 mb-3" />
                  <p className="font-medium">Aucun produit trouvé</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredCatalogProducts.map(product => (
                    <button
                      key={product.$id}
                      onClick={() => addCatalogItem(product)}
                      className="w-full text-left p-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-indigo-500 dark:hover:border-indigo-500 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/20 transition-all flex justify-between items-center group"
                    >
                      <div className="flex-1">
                        <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                          {product.name}
                          {product.reference && (
                            <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 group-hover:bg-white dark:group-hover:bg-slate-800 px-1.5 py-0.5 rounded transition-colors">{product.reference}</span>
                          )}
                        </div>
                        {product.description && (
                          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-1">{product.description}</div>
                        )}
                      </div>
                      <div className="text-right ml-4 shrink-0">
                        <div className="font-bold text-indigo-700 dark:text-indigo-400">{parseFloat(product.unitPrice).toFixed(2)} €</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">{product.unit} • TVA {product.tvaRate}%</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}