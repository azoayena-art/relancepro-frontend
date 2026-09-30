import { useState, useEffect, useRef, useMemo } from 'react';
import { databases, DATABASE_ID } from '../appwrite';
import { useAuth } from '../context/AuthContext';
import { useCompanySettings } from '../hooks/useCompanySettings';
import SignatureCanvas from 'react-signature-canvas';
import {
  X, Calculator, Plus, Minus, Building2, User,
  Wrench, DollarSign, FileSignature, Shield, Upload,
  FileText, Package, Search, Check, Send, ChevronLeft, ChevronRight, MapPin
} from 'lucide-react';
import { Query, ID as AppwriteID, Permission, Role } from 'appwrite';
import Modal from '../components/ui/Modal';
import {
  FormField,
  Input,
  Select,
  Textarea,
  Alert,
  Badge,
  EmptyState,
  SearchFilter,
  Pagination,
} from '../components/ui/SharedUI';

// ============================================================
// 📋 INTERFACES
// ============================================================

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
  tvaRates?: string;
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

// ============================================================
// 🎨 CONSTANTES
// ============================================================

const PAYMENT_METHODS = ["Virement bancaire", "Chèque", "Espèces", "Carte bancaire", "Prélèvement SEPA"];
const EXECUTION_DELAYS = ["Immédiat", "Selon planning", "Sous 1 semaine", "Sous 2 semaines", "Sous 1 mois", "À convenir"];
const INSURANCE_TYPES = ["Décennale (BTP)", "Responsabilité Civile Pro", "Multirisque Pro", "Garantie Parfaite Achèvement", "Non applicable"];
const UNIT_OPTIONS = ['Forfait', 'Heure', 'Jour', 'm²', 'ml', 'Unité', 'kg', 'Intervention'];
const TVA_OPTIONS = ['20', '10', '5.5', '0'];

// ⚙️ Pagination catalogue
const CATALOG_ITEMS_PER_PAGE = 20;

// ============================================================
// 🎯 PROPS
// ============================================================

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

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export default function QuoteModal({ 
  isOpen, onClose, onSave, clients = [], companySettings, 
  editingQuote, preselectedClientId = null, getNextQuoteNumber, currentTeamId, userPermissions = []
}: QuoteModalProps) {

  const { user } = useAuth();
  const { fm: hookFm, currency, currencyConfig } = useCompanySettings();
  
  const [saving, setSaving] = useState(false);
  const [sendingToClient, setSendingToClient] = useState(false);
  const [formData, setFormData] = useState<QuoteFormData>(emptyFormData());
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  
  const [catalogProducts, setCatalogProducts] = useState<CatalogProduct[]>([]);
  const [showCatalogModal, setShowCatalogModal] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogPage, setCatalogPage] = useState(1);
  
  const [clientSearch, setClientSearch] = useState('');
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  
  const sigCanvas = useRef<SignatureCanvas>(null);
  const [sigTab, setSigTab] = useState<'draw' | 'upload'>('draw');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const wasOpenRef = useRef(false);

  // ============================================================
  // ✅ EFFETS
  // ============================================================

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

  // Reset pagination catalogue quand recherche change
  useEffect(() => {
    setCatalogPage(1);
  }, [catalogSearch]);

  // ============================================================
  // ✅ CALCULS
  // ============================================================

  const tvaSelectOptions = useMemo(() => {
    try {
      const raw = (companySettings as any)?.tvaRates;
      if (raw) {
        const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (Array.isArray(arr) && arr.length > 0) {
          return arr.map((r: any) => ({ value: String(r.rate), label: `${r.rate}% — ${r.name}${r.country ? ` (${r.country})` : ''}` }));
        }
      }
    } catch { /* fallback */ }
    return TVA_OPTIONS.map(t => ({ value: t, label: `${t}%` }));
  }, [companySettings]);

  const filteredCatalogProducts = useMemo(() => {
    return catalogProducts.filter(p => 
      catalogSearch === '' || 
      p.name.toLowerCase().includes(catalogSearch.toLowerCase()) || 
      (p.reference && p.reference.toLowerCase().includes(catalogSearch.toLowerCase()))
    );
  }, [catalogProducts, catalogSearch]);

  // Pagination catalogue
  const catalogTotalPages = Math.max(1, Math.ceil(filteredCatalogProducts.length / CATALOG_ITEMS_PER_PAGE));
  const catalogStartIndex = (catalogPage - 1) * CATALOG_ITEMS_PER_PAGE;
  const catalogEndIndex = catalogStartIndex + CATALOG_ITEMS_PER_PAGE;
  const paginatedCatalogProducts = filteredCatalogProducts.slice(catalogStartIndex, catalogEndIndex);

  const filteredClients = useMemo(() => {
    return clients.filter((c: any) => 
      clientSearch === '' || `${c.firstName} ${c.lastName} ${c.companyName}`.toLowerCase().includes(clientSearch.toLowerCase())
    );
  }, [clients, clientSearch]);

  // Calculs financiers
  const subtotalRaw = formData.items.reduce((s, i) => s + (i.quantity * i.unitPrice * (1 - (i.discount || 0) / 100)), 0);
  const discountAmountRaw = subtotalRaw * (formData.discount / 100);
  const taxableRaw = subtotalRaw - discountAmountRaw;
  const isTvaApplicable = !formData.companyTva.includes('non applicable');
  const taxRaw = isTvaApplicable ? formData.items.reduce((a, i) => a + ((i.quantity * i.unitPrice * (1 - (i.discount || 0) / 100) * (1 - formData.discount / 100)) * (i.tvaRate / 100)), 0) : 0;

  const subtotal = round2(subtotalRaw);
  const discountAmount = round2(discountAmountRaw);
  const taxableAmount = round2(taxableRaw);
  const tax = round2(taxRaw);
  const total = round2(taxableAmount + tax);
  const balance = round2(total - formData.deposit);

  const taxBreakdown = useMemo(() => {
    if (!isTvaApplicable) return [] as { rate: number; baseHT: number; taxAmount: number }[];
    const map = new Map<number, { rate: number; baseHT: number; taxAmount: number }>();
    formData.items.forEach(i => {
      const base = i.quantity * i.unitPrice * (1 - (i.discount || 0) / 100) * (1 - formData.discount / 100);
      const cur = map.get(i.tvaRate) || { rate: i.tvaRate, baseHT: 0, taxAmount: 0 };
      cur.baseHT = round2(cur.baseHT + base);
      cur.taxAmount = round2(cur.taxAmount + base * (i.tvaRate / 100));
      map.set(i.tvaRate, cur);
    });
    return Array.from(map.values()).sort((a, b) => b.rate - a.rate);
  }, [formData.items, formData.discount, isTvaApplicable]);

  // ============================================================
  // ✅ CHARGEMENT
  // ============================================================

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
    setStep(1);
    let freshSettings = companySettings;
    
    // ✅ Charger les paramètres les plus récents (par teamId d'abord)
    try {
      if (currentTeamId) {
        const res = await databases.listDocuments(DATABASE_ID, 'company_settings', [
          Query.equal('teamId', currentTeamId),
          Query.limit(1)
        ]);
        if (res.documents.length > 0) {
          freshSettings = res.documents[0] as unknown as CompanySettings;
        }
      }
      
      // Fallback par userId
      if (!freshSettings && user?.$id) {
        const res = await databases.listDocuments(DATABASE_ID, 'company_settings', [
          Query.equal('userId', user.$id),
          Query.limit(1)
        ]);
        if (res.documents.length > 0) {
          freshSettings = res.documents[0] as unknown as CompanySettings;
        }
      }
    } catch (e) { 
      console.log('Settings non trouvés, utilisation des props'); 
    }

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
      
      // ✅ Mapper correctement le régime TVA
      let companyTvaValue = 'TVA non applicable, art. 293 B du CGI';
      if (freshSettings?.tvaNumber) {
        if (freshSettings.tvaNumber.includes('non applicable')) {
          companyTvaValue = 'TVA non applicable, art. 293 B du CGI';
        } else if (freshSettings.tvaNumber.trim() !== '') {
          // C'est un vrai numéro TVA (FR...) → on le stocke tel quel
          companyTvaValue = freshSettings.tvaNumber;
        }
      }

      const def = freshSettings ? {
        ...emptyFormData(), 
        quoteNumber: newQuoteNumber,
        companyName: freshSettings.name || '', 
        companyLegalForm: freshSettings.legalForm || 'Entreprise Individuelle',
        companyAddress: freshSettings.address || '', 
        companySiret: freshSettings.siret || '',
        companyRcs: freshSettings.rcs || '', 
        companyTva: companyTvaValue,  // ✅ Valeur correctement mappée
        companyPhone: freshSettings.phone || '', 
        companyEmail: freshSettings.email || '',
        logoFileId: freshSettings.logoFileId || '',
        items: [{ 
          id: '1', reference: '', description: '', quantity: 1, 
          unit: 'Forfait', unitPrice: 0, tvaRate: defaultTvaRate, 
          total: 0, discount: 0 
        }]
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

  // ============================================================
  // ✅ ACTIONS
  // ============================================================

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

  // ============================================================
  // ✅ VALIDATION
  // ============================================================

  const validateStep = (s: number): string | null => {
    if (s === 1) {
      if (!formData.clientId) return 'Étape 1 : veuillez sélectionner un client.';
      if (!formData.subject.trim()) return 'Étape 1 : veuillez indiquer l\'objet du devis.';
    }
    if (s === 2) {
      if (!formData.companyName.trim()) return 'Étape 2 : veuillez indiquer le nom de votre entreprise.';
    }
    if (s === 3) {
      if (formData.items.some(i => !i.description.trim())) return 'Étape 3 : chaque ligne doit avoir une description.';
      if (formData.items.some(i => i.quantity <= 0 || i.unitPrice < 0)) return 'Étape 3 : quantités et prix doivent être positifs.';
    }
    if (s === 4) {
      if (formData.deposit < 0 || formData.deposit > total) return `Étape 4 : l'acompte ne peut pas dépasser le total TTC (${hookFm(total)}).`;
      if (formData.discount < 0 || formData.discount > 100) return 'Étape 4 : la remise globale doit être entre 0 et 100%.';
    }
    return null;
  };

  const firstInvalidStep = (): number | null => {
    for (let s = 1; s <= 4; s++) {
      const err = validateStep(s);
      if (err) { return s; }
    }
    return null;
  };

  const goNext = () => {
    const err = validateStep(step);
    if (err) { alert(err); return; }
    setStep((step + 1) as 1 | 2 | 3 | 4);
  };
  const goPrev = () => setStep(Math.max(1, step - 1) as 1 | 2 | 3 | 4);
  const goToStep = (s: 1 | 2 | 3 | 4) => {
    if (s < step) { setStep(s); return; }
    for (let i = step; i < s; i++) {
      const err = validateStep(i);
      if (err) { alert(err); return; }
    }
    setStep(s);
  };

  // ============================================================
  // ✅ SAUVEGARDE
  // ============================================================

  const buildPayload = (status: string, clientToken?: string) => {
    let mainVatRate = 20;
    try {
        const rateCounts = new Map<number, number>();
        formData.items.forEach(item => {
            const rate = parseInt(String(item.tvaRate || 0), 10);
            if (!isNaN(rate) && rate >= 0 && rate <= 100) {
                rateCounts.set(rate, (rateCounts.get(rate) || 0) + 1);
            }
        });
        if (rateCounts.size > 0) {
            let maxCount = 0;
            rateCounts.forEach((count, rate) => {
                if (count > maxCount) {
                    maxCount = count;
                    mainVatRate = rate;
                }
            });
        }
    } catch {
        mainVatRate = 20;
    }
    
    return {
        ...formData, 
        userId: user?.$id, 
        teamId: currentTeamId, 
        status,
        clientToken: clientToken || formData.clientToken,
        currencyCode: currency,
        vatRate: mainVatRate,
        items: JSON.stringify(formData.items), 
        subtotal, 
        discount: formData.discount, 
        tax: tax, 
        total: total,
        deposit: formData.deposit, 
        balance: balance, 
        tvaMention: formData.companyTva, 
        createdAt: new Date().toISOString() 
    };
  };

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
    const bad = firstInvalidStep();
    if (bad) { alert(validateStep(bad)!); setStep(bad as 1 | 2 | 3 | 4); return; }
    
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
    const bad = firstInvalidStep();
    if (bad) { alert(validateStep(bad)!); setStep(bad as 1 | 2 | 3 | 4); return; }
    
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

  // ============================================================
  // 🎨 RENDU
  // ============================================================

  if (!isOpen) return null;

  const STEPS = [
    { n: 1 as const, label: 'Client', icon: User },
    { n: 2 as const, label: 'Entreprise', icon: Building2 },
    { n: 3 as const, label: 'Prestations', icon: Wrench },
    { n: 4 as const, label: 'Total & Conditions', icon: DollarSign },
  ];

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title={editingQuote ? (formData.status === 'Refusé' ? 'Modifier (Refusé)' : 'Modifier le devis') : 'Nouveau Devis'}
      icon={<Calculator size={20} className="text-purple-600" />}
      maxWidth="sm:max-w-5xl"
      footer={
        <div className="flex flex-col sm:flex-row gap-3 w-full">
          <button 
            onClick={onClose} 
            className="order-3 sm:order-1 w-full sm:w-auto px-5 py-3 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-600 transition-all active:scale-95"
          >
            Annuler
          </button>
          
          <div className="flex flex-col sm:flex-row gap-3 order-1 sm:order-2 flex-1">
            {step > 1 && (
              <button 
                onClick={goPrev} 
                className="w-full sm:w-auto px-5 py-3 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-600 transition-all flex items-center justify-center gap-2 active:scale-95"
              >
                <ChevronLeft size={16} /> Précédent
              </button>
            )}
            {step < 4 && (
              <button 
                onClick={goNext} 
                className="w-full sm:w-auto px-6 py-3 text-sm font-bold text-white bg-purple-600 rounded-xl hover:bg-purple-700 transition-all shadow-lg shadow-purple-600/20 flex items-center justify-center gap-2 active:scale-95"
              >
                Suivant <ChevronRight size={16} />
              </button>
            )}
            {step === 4 && (
              <>
                <button 
                  onClick={handleSubmit} 
                  disabled={saving || sendingToClient}
                  className="w-full sm:w-auto px-5 py-3 text-sm font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-600 transition-all flex items-center justify-center gap-2 disabled:opacity-50 active:scale-95"
                >
                  {(saving || sendingToClient) && <span className="animate-spin h-4 w-4 border-2 border-slate-700 dark:border-slate-300 border-t-transparent rounded-full" />}
                  Enregistrer (Brouillon)
                </button>
                <button 
                  onClick={handleSendToClient} 
                  disabled={saving || sendingToClient}
                  className="w-full sm:w-auto px-6 py-3 text-sm font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2 disabled:opacity-50 active:scale-95"
                >
                  {sendingToClient ? 'Envoi...' : <><Send size={16}/> Envoyer au client</>}
                </button>
              </>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-6">
        {/* INDICATEUR D'ÉTAPES */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 -mx-4 px-4">
          {STEPS.map((s, idx) => {
            const Icon = s.icon;
            const isActive = step === s.n;
            const isDone = step > s.n;
            return (
              <div key={s.n} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => goToStep(s.n)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                    isActive
                      ? 'bg-purple-600 text-white shadow-sm'
                      : isDone
                      ? 'bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900/50'
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'
                  }`}
                >
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${isActive ? 'bg-white/20' : isDone ? 'bg-purple-600 text-white' : 'bg-slate-300 dark:bg-slate-600 text-slate-700 dark:text-slate-300'}`}>
                    {isDone ? <Check size={12} /> : s.n}
                  </span>
                  <Icon size={14} />
                  {s.label}
                </button>
                {idx < STEPS.length - 1 && <ChevronRight size={14} className="text-slate-300 dark:text-slate-600 flex-shrink-0" />}
              </div>
            );
          })}
        </div>

        {/* Alerte refus */}
        {formData.clientComment && formData.status === 'Refusé' && (
          <Alert tone="error" icon={X} title="Motif du refus du client">
            <p className="text-sm mt-1 whitespace-pre-wrap">{formData.clientComment}</p>
          </Alert>
        )}

        {/* ÉTAPE 1 : CLIENT */}
        {step === 1 && (
          <div className="space-y-6">
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-2">
                <User size={14} className="text-purple-600" /> Client destinataire
              </h3>
              
              {/* Recherche client custom (dropdown) */}
              <div className="relative">
                <div className="relative group">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-purple-500 transition-colors" size={18} />
                  <Input
                    type="text"
                    placeholder="Rechercher un client par nom ou entreprise..."
                    value={clientSearch}
                    onChange={(e) => { setClientSearch(e.target.value); setShowClientDropdown(true); }}
                    onFocus={() => setShowClientDropdown(true)}
                    className="pl-11"
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
                          className="w-full text-left px-4 py-3 hover:bg-purple-50 dark:hover:bg-slate-700 transition-colors border-b border-slate-50 dark:border-slate-700 last:border-0 flex items-center gap-3"
                        >
                          <div className="w-9 h-9 rounded-full bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 flex items-center justify-center font-bold text-xs shrink-0">
                            {(client.firstName?.[0] || '') + (client.lastName?.[0] || '')}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-slate-900 dark:text-white text-sm truncate">{client.firstName} {client.lastName}</div>
                            {client.companyName && <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">{client.companyName}</div>}
                          </div>
                          {formData.clientId === client.$id && <Check size={16} className="text-purple-600 dark:text-purple-400 ml-auto flex-shrink-0" />}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              {formData.clientId && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField label="Adresse">
                    <Input value={formData.clientAddress} onChange={e => setFormData({...formData, clientAddress: e.target.value})} />
                  </FormField>
                  <FormField label="Adresse de facturation">
                    <Input value={formData.clientBillingAddress} onChange={e => setFormData({...formData, clientBillingAddress: e.target.value})} />
                  </FormField>
                  <FormField label="Email">
                    <Input type="email" value={formData.clientEmail} onChange={e => setFormData({...formData, clientEmail: e.target.value})} />
                  </FormField>
                  <FormField label="Téléphone">
                    <Input type="tel" value={formData.clientPhone} onChange={e => setFormData({...formData, clientPhone: e.target.value})} />
                  </FormField>
                </div>
              )}
            </div>

            <div className="space-y-4">
              <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-2">
                <FileText size={14} className="text-purple-600" /> Informations du devis
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField label="N° Devis">
                  <Input readOnly value={formData.quoteNumber} className="bg-slate-100 dark:bg-slate-700/50 font-semibold text-purple-700 dark:text-purple-400" />
                </FormField>
                <FormField label="Objet" required>
                  <Input type="text" value={formData.subject} onChange={e => setFormData({...formData, subject: e.target.value})} placeholder="Ex: Rénovation salle de bain..." />
                </FormField>
                <FormField label="Date d'émission">
                  <Input type="date" value={formData.issueDate} onChange={e => setFormData({...formData, issueDate: e.target.value})} />
                </FormField>
                <FormField label="Date de validité">
                  <Input type="date" value={formData.validityDate} onChange={e => setFormData({...formData, validityDate: e.target.value})} />
                </FormField>
                <FormField label="Adresse du chantier" hint="Si différent de l'adresse du client" className="sm:col-span-2">
                  <div className="relative">
                    <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <Input value={formData.workAddress} onChange={e => setFormData({...formData, workAddress: e.target.value})} className="pl-9" placeholder="Adresse d'exécution des travaux" />
                  </div>
                </FormField>
              </div>
            </div>
          </div>
        )}

        {/* ÉTAPE 2 : ENTREPRISE */}
        {step === 2 && (
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <Building2 size={14} className="text-purple-600" /> Mon Entreprise
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField label="Nom de l'entreprise" required className="sm:col-span-2">
                <Input placeholder="Nom entreprise" value={formData.companyName} onChange={e => setFormData({...formData, companyName: e.target.value})} />
              </FormField>
              <FormField label="Forme juridique">
                <Input placeholder="Ex: SARL, EI..." value={formData.companyLegalForm} onChange={e => setFormData({...formData, companyLegalForm: e.target.value})} />
              </FormField>
              <FormField label="Adresse">
                <Input placeholder="Adresse complète" value={formData.companyAddress} onChange={e => setFormData({...formData, companyAddress: e.target.value})} />
              </FormField>
              <FormField label="SIRET">
                <Input placeholder="SIRET" value={formData.companySiret} onChange={e => setFormData({...formData, companySiret: e.target.value})} />
              </FormField>
              <FormField label="RCS / RM">
                <Input placeholder="RCS/RM" value={formData.companyRcs} onChange={e => setFormData({...formData, companyRcs: e.target.value})} />
              </FormField>
              <FormField label="Téléphone">
                <Input type="tel" placeholder="Téléphone" value={formData.companyPhone} onChange={e => setFormData({...formData, companyPhone: e.target.value})} />
              </FormField>
              <FormField label="Email">
                <Input type="email" placeholder="Email" value={formData.companyEmail} onChange={e => setFormData({...formData, companyEmail: e.target.value})} />
              </FormField>
              <FormField label="Régime TVA" className="sm:col-span-2">
                <Select 
                  value={
                    formData.companyTva.includes('non applicable') 
                      ? 'TVA non applicable, art. 293 B du CGI' 
                      : 'assujetti'
                  } 
                  onChange={e => {
                    const val = e.target.value;
                    if (val === 'TVA non applicable, art. 293 B du CGI') {
                      setFormData({...formData, companyTva: 'TVA non applicable, art. 293 B du CGI'});
                    } else {
                      // Si on choisit "Assujetti", on met soit le numéro des settings, soit une valeur par défaut
                      const tvaFromSettings = companySettings?.tvaNumber || '';
                      const hasRealNumber = tvaFromSettings && !tvaFromSettings.includes('non applicable');
                      setFormData({
                        ...formData, 
                        companyTva: hasRealNumber ? tvaFromSettings : 'FR00000000000'
                      });
                    }
                  }}
                >
                  <option value="TVA non applicable, art. 293 B du CGI">
                    TVA non applicable, art. 293 B du CGI
                  </option>
                  <option value="assujetti">
                    Assujetti à la TVA ({
                      formData.companyTva.includes('non applicable') 
                        ? 'numéro à saisir' 
                        : formData.companyTva || 'FR...'
                    })
                  </option>
                </Select>
                
                {/* Champ de saisie du numéro si assujetti */}
                {!formData.companyTva.includes('non applicable') && (
                  <Input 
                    type="text" 
                    placeholder="Ex: FR12345678901" 
                    value={formData.companyTva} 
                    onChange={(e) => setFormData({...formData, companyTva: e.target.value})}
                    className="mt-2"
                  />
                )}
                
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                  {isTvaApplicable 
                    ? '✅ TVA appliquée sur les lignes selon leurs taux.' 
                    : 'ℹ️ Franchise en base : aucune TVA ne sera calculée (mention automatique sur le PDF).'}
                </p>
              </FormField>
            </div>
          </div>
        )}

        {/* ÉTAPE 3 : PRESTATIONS */}
        {step === 3 && (
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-2">
                <Wrench size={14} className="text-purple-600" /> Prestations & Produits
              </h3>
              <div className="flex gap-2">
                <button 
                  type="button" 
                  onClick={() => setShowCatalogModal(true)} 
                  className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 flex items-center gap-1 bg-indigo-50 dark:bg-indigo-900/30 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 px-3 py-2 rounded-lg transition-colors"
                >
                  <Package size={14}/> Catalogue
                </button>
                <button 
                  type="button" 
                  onClick={addItem} 
                  className="text-xs font-semibold text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 flex items-center gap-1 bg-green-50 dark:bg-green-900/30 hover:bg-green-100 dark:hover:bg-green-900/50 px-3 py-2 rounded-lg transition-colors"
                >
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
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 dark:text-slate-400 w-24">Prix U. HT ({currencyConfig?.symbol || '€'})</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 w-20">Remise %</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 w-20">TVA %</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 dark:text-slate-400 w-28">Total HT ({currencyConfig?.symbol || '€'})</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 w-12"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700 bg-white dark:bg-slate-800">
                  {formData.items.map((item, idx) => (
                    <tr key={item.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-700/50 transition-colors">
                      <td className="px-4 py-2">
                        <input type="text" value={item.reference} onChange={e => handleItemChange(idx, 'reference', e.target.value)} className="w-full bg-transparent border-none focus:ring-0 text-xs p-1 text-slate-900 dark:text-white placeholder-slate-400" placeholder="REF" />
                      </td>
                      <td className="px-4 py-2">
                        <input type="text" value={item.description} onChange={e => handleItemChange(idx, 'description', e.target.value)} className="w-full bg-transparent border-none focus:ring-0 text-sm p-1 font-medium text-slate-900 dark:text-white placeholder-slate-400" placeholder="Description" />
                      </td>
                      <td className="px-4 py-2">
                        <input type="number" min="0" step="0.01" value={item.quantity} onChange={e => handleItemChange(idx, 'quantity', parseFloat(e.target.value) || 0)} className="w-full text-center bg-transparent border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded focus:ring-1 focus:ring-purple-500 focus:border-purple-500 text-xs p-1" />
                      </td>
                      <td className="px-4 py-2">
                        <select value={item.unit} onChange={e => handleItemChange(idx, 'unit', e.target.value)} className="w-full text-center bg-transparent border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded focus:ring-1 focus:ring-purple-500 focus:border-purple-500 text-xs p-1">
                          {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-2">
                        <input type="number" min="0" step="0.01" value={item.unitPrice} onChange={e => handleItemChange(idx, 'unitPrice', parseFloat(e.target.value) || 0)} className="w-full text-right bg-transparent border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded focus:ring-1 focus:ring-purple-500 focus:border-purple-500 text-xs p-1" />
                      </td>
                      <td className="px-4 py-2">
                        <input type="number" min="0" max="100" step="0.01" value={item.discount || 0} onChange={e => handleItemChange(idx, 'discount', parseFloat(e.target.value) || 0)} className="w-full text-center bg-transparent border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded focus:ring-1 focus:ring-purple-500 focus:border-purple-500 text-xs p-1" title="Remise en %" />
                      </td>
                      <td className="px-4 py-2">
                        <select value={item.tvaRate} onChange={e => handleItemChange(idx, 'tvaRate', parseFloat(e.target.value))} className="w-full text-center bg-transparent border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded focus:ring-1 focus:ring-purple-500 focus:border-purple-500 text-xs p-1">
                          {!tvaSelectOptions.some(o => parseFloat(o.value) === item.tvaRate) && (
                            <option value={item.tvaRate}>{item.tvaRate}%</option>
                          )}
                          {tvaSelectOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-2 text-right font-semibold text-slate-900 dark:text-white text-xs">
                        {round2(item.total).toFixed(2)} {currencyConfig?.symbol || '€'}
                      </td>
                      <td className="px-4 py-2 text-center">
                        <button onClick={() => removeItem(idx)} className="text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 p-1.5 rounded transition-colors"><Minus size={14} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Alert tone="info" icon={Package}>
              <p className="text-xs">
                💡 Les taux disponibles proviennent de vos paramètres entreprise (TVA multi-pays). Devise actuelle : <strong className="text-purple-600 dark:text-purple-400">{currencyConfig?.symbol || '€'} {currency}</strong>.
              </p>
            </Alert>
          </div>
        )}

        {/* ÉTAPE 4 : TOTAL & CONDITIONS */}
        {step === 4 && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">
              <div className="space-y-4">
                <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-2">
                  <DollarSign size={14} className="text-purple-600" /> Conditions & Modalités
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField label="Remise globale (%)">
                    <Input type="number" min="0" max="100" value={formData.discount} onChange={e => setFormData({...formData, discount: parseFloat(e.target.value) || 0})} />
                  </FormField>
                  <FormField label={`Acompte (${currencyConfig?.symbol || '€'})`} hint={formData.deposit > total ? `⚠️ Maximum : ${hookFm(total)}` : undefined}>
                    <Input type="number" min="0" max={total} step="0.01" value={formData.deposit} onChange={e => setFormData({...formData, deposit: parseFloat(e.target.value) || 0})} />
                  </FormField>
                </div>
                <FormField label="Modalités de paiement">
                  <Input list="dl-pm" value={formData.paymentMethods} onChange={e => setFormData({...formData, paymentMethods: e.target.value})} placeholder="Ex: Virement..." />
                  <datalist id="dl-pm">{PAYMENT_METHODS.map(m => <option key={m} value={m}/>)}</datalist>
                </FormField>
                <FormField label="Conditions de règlement">
                  <Input value={formData.paymentConditions} onChange={e => setFormData({...formData, paymentConditions: e.target.value})} placeholder="Ex: Paiement à 30 jours" />
                </FormField>
                <FormField label="Délai d'exécution">
                  <Input list="dl-ed" value={formData.executionDelay} onChange={e => setFormData({...formData, executionDelay: e.target.value})} />
                  <datalist id="dl-ed">{EXECUTION_DELAYS.map(d => <option key={d} value={d}/>)}</datalist>
                </FormField>
                <FormField label="Conditions particulières">
                  <Textarea rows={2} value={formData.specialConditions} onChange={e => setFormData({...formData, specialConditions: e.target.value})} placeholder="Ex: Accès chantier, horaires..." />
                </FormField>
              </div>

              <div className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-6 border border-slate-200 dark:border-slate-600 space-y-3 h-fit">
                <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-4">
                  Récapitulatif financier ({currencyConfig?.symbol || '€'} {currency})
                </h3>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600 dark:text-slate-400">Total HT</span>
                  <span className="font-semibold text-slate-900 dark:text-white">{hookFm(subtotal)}</span>
                </div>
                {formData.discount > 0 && (
                  <div className="flex justify-between text-sm text-red-600 dark:text-red-400">
                    <span>Remise globale ({formData.discount}%)</span>
                    <span className="font-semibold">- {hookFm(discountAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600 dark:text-slate-400">HT après remise</span>
                  <span className="font-semibold text-slate-900 dark:text-white">{hookFm(taxableAmount)}</span>
                </div>
                
                {isTvaApplicable && taxBreakdown.length > 0 && (
                  <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg p-3 space-y-1">
                    <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Ventilation TVA</p>
                    {taxBreakdown.map(b => (
                      <div key={b.rate} className="flex justify-between text-xs text-slate-600 dark:text-slate-300">
                        <span>TVA {b.rate}% (base {hookFm(b.baseHT)})</span>
                        <span className="font-semibold">{hookFm(b.taxAmount)}</span>
                      </div>
                    ))}
                  </div>
                )}
                
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600 dark:text-slate-400">Total TVA</span>
                  <span className="font-semibold text-slate-900 dark:text-white">{hookFm(tax)}</span>
                </div>
                <div className="border-t border-slate-200 dark:border-slate-600 my-3"></div>
                <div className="flex justify-between text-base">
                  <span className="font-bold text-slate-900 dark:text-white">Total TTC</span>
                  <span className="font-bold text-purple-600 dark:text-purple-400">{hookFm(total)}</span>
                </div>
                {formData.deposit > 0 && (
                  <>
                    <div className="flex justify-between text-sm text-red-600 dark:text-red-400">
                      <span>Acompte à verser</span>
                      <span className="font-semibold">- {hookFm(formData.deposit)}</span>
                    </div>
                    <div className="border-t border-slate-300 dark:border-slate-500 my-3"></div>
                    <div className="flex justify-between text-lg">
                      <span className="font-bold text-slate-900 dark:text-white">Net à payer</span>
                      <span className="font-bold text-slate-900 dark:text-white">{hookFm(balance)}</span>
                    </div>
                  </>
                )}
                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-2">
                  ✅ Contrôle : HT ({hookFm(taxableAmount)}) + TVA ({hookFm(tax)}) = TTC ({hookFm(taxableAmount + tax)})
                </p>
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
                  <FormField label="Type de garantie" className="sm:col-span-2">
                    <Input list="dl-ins" value={formData.tradeType} onChange={e => setFormData(prev => ({...prev, tradeType: e.target.value}))} placeholder="Type de garantie..." />
                    <datalist id="dl-ins">{INSURANCE_TYPES.map(t => <option key={t} value={t}/>)}</datalist>
                  </FormField>
                  <FormField label="Nom assureur">
                    <Input placeholder="Nom assureur" value={formData.insuranceName} onChange={e => setFormData(prev => ({...prev, insuranceName: e.target.value}))} />
                  </FormField>
                  <FormField label="N° police">
                    <Input placeholder="N° police" value={formData.insurancePolicy} onChange={e => setFormData(prev => ({...prev, insurancePolicy: e.target.value}))} />
                  </FormField>
                  <FormField label="Adresse assureur" className="sm:col-span-2">
                    <Input placeholder="Adresse assureur" value={formData.insuranceAddress} onChange={e => setFormData(prev => ({...prev, insuranceAddress: e.target.value}))} />
                  </FormField>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* MODAL CATALOGUE */}
      <Modal
        open={showCatalogModal}
        onClose={() => { setShowCatalogModal(false); setCatalogSearch(''); }}
        title="Ajouter depuis le catalogue"
        icon={<Package size={20} className="text-indigo-600" />}
        maxWidth="sm:max-w-2xl"
      >
        <div className="space-y-4">
          <SearchFilter
            value={catalogSearch}
            onChange={setCatalogSearch}
            placeholder="Rechercher un produit par nom ou référence..."
          />

          <div className="max-h-96 overflow-y-auto">
            {filteredCatalogProducts.length === 0 ? (
              <EmptyState
                icon={Package}
                title="Aucun produit trouvé"
                description="Modifiez votre recherche ou ajoutez des produits au catalogue."
                tone="indigo"
              />
            ) : (
              <div className="space-y-2">
                {paginatedCatalogProducts.map(product => (
                  <button
                    key={product.$id}
                    onClick={() => addCatalogItem(product)}
                    className="w-full text-left p-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-indigo-500 dark:hover:border-indigo-500 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/20 transition-all flex justify-between items-center group"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-2 truncate">
                        {product.name}
                        {product.reference && (
                          <Badge tone="slate">{product.reference}</Badge>
                        )}
                      </div>
                      {product.description && (
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-1">{product.description}</div>
                      )}
                    </div>
                    <div className="text-right ml-4 shrink-0">
                      <div className="font-bold text-indigo-700 dark:text-indigo-400">
                        {parseFloat(product.unitPrice).toFixed(2)} {currencyConfig?.symbol || '€'}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">{product.unit} • TVA {product.tvaRate}%</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Pagination */}
          {catalogTotalPages > 1 && (
            <Pagination
              currentPage={catalogPage}
              totalPages={catalogTotalPages}
              onPageChange={setCatalogPage}
              startItem={catalogStartIndex + 1}
              endItem={Math.min(catalogEndIndex, filteredCatalogProducts.length)}
              totalItems={filteredCatalogProducts.length}
              itemName="produit"
            />
          )}
        </div>
      </Modal>
    </Modal>
  );
}