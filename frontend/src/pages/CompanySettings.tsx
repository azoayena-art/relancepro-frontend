import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { databases, DATABASE_ID, storage } from '../appwrite';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { getFilePreviewUrl } from '../utils/storage';
import { toast } from 'sonner';
import Sidebar from '../components/Sidebar';
import Modal from '../components/ui/Modal';
import {
  PageHeader,
  ConfirmDialog,
  FormField,
  Input,
  Select,
  Alert,
  Card,
  SectionTitle,
  Badge,
} from '../components/ui/SharedUI';
import {
  Building2, Save, AlertCircle, CheckCircle2, Upload, Image as ImageIcon,
  X, Copy, Lock, Plus, Trash2, Globe, Coins, FileText, Eye, Edit2, Target,
  Shield, Server, Zap
} from 'lucide-react';
import { ID, Query, Permission, Role } from 'appwrite';

// ============================================================
// 🌍 CONFIGURATION DEVISES
// ============================================================

export interface Currency {
  code: string;
  symbol: string;
  name: string;
  locale: string;
}

export const SUPPORTED_CURRENCIES: Currency[] = [
  { code: 'EUR', symbol: '€', name: 'Euro (€)', locale: 'fr-FR' },
  { code: 'XOF', symbol: 'FCFA', name: 'Franc CFA BCEAO (FCFA)', locale: 'fr-FR' },
  { code: 'XAF', symbol: 'FCFA', name: 'Franc CFA BEAC (FCFA)', locale: 'fr-FR' },
  { code: 'USD', symbol: '$', name: 'Dollar US ($)', locale: 'en-US' },
  { code: 'GBP', symbol: '£', name: 'Livre sterling (£)', locale: 'en-GB' },
  { code: 'CAD', symbol: '$CA', name: 'Dollar canadien ($CA)', locale: 'fr-CA' },
  { code: 'CHF', symbol: 'CHF', name: 'Franc suisse (CHF)', locale: 'de-CH' },
  { code: 'MAD', symbol: 'DH', name: 'Dirham marocain (DH)', locale: 'fr-MA' },
  { code: 'TND', symbol: 'DT', name: 'Dinar tunisien (DT)', locale: 'ar-TN' },
  { code: 'DZD', symbol: 'DA', name: 'Dinar algérien (DA)', locale: 'ar-DZ' },
  { code: 'JPY', symbol: '¥', name: 'Yen japonais (¥)', locale: 'ja-JP' },
  { code: 'CNY', symbol: '¥', name: 'Yuan chinois (¥)', locale: 'zh-CN' },
  { code: 'INR', symbol: '₹', name: 'Roupie indienne (₹)', locale: 'hi-IN' },
  { code: 'BRL', symbol: 'R$', name: 'Réal brésilien (R$)', locale: 'pt-BR' },
  { code: 'MXN', symbol: '$MX', name: 'Peso mexicain ($MX)', locale: 'es-MX' },
  { code: 'AUD', symbol: '$AU', name: 'Dollar australien ($AU)', locale: 'en-AU' },
  { code: 'TRY', symbol: '₺', name: 'Livre turque (₺)', locale: 'tr-TR' },
  { code: 'PLN', symbol: 'zł', name: 'Zloty polonais (zł)', locale: 'pl-PL' },
  { code: 'SEK', symbol: 'kr', name: 'Couronne suédoise (kr)', locale: 'sv-SE' },
  { code: 'NOK', symbol: 'kr', name: 'Couronne norvégienne (kr)', locale: 'nb-NO' },
];

export const getCurrencyConfig = (code: string): Currency => {
  return SUPPORTED_CURRENCIES.find(c => c.code === code) || SUPPORTED_CURRENCIES[0];
};

export const formatMoney = (amount: number, currencyCode: string = 'EUR'): string => {
  const currency = getCurrencyConfig(currencyCode);
  try {
    return new Intl.NumberFormat(currency.locale, {
      style: 'currency',
      currency: currency.code,
      maximumFractionDigits: ['JPY', 'XOF', 'XAF', 'KRW', 'VND'].includes(currency.code) ? 0 : 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency.symbol}`;
  }
};

// ============================================================
// ✅ VALIDATION SIRET (14 chiffres)
// ============================================================

export const isValidSiret = (value: string): boolean => {
  const cleanValue = value.replace(/\s/g, '');
  if (!/^\d{14}$/.test(cleanValue)) return false;
  let sum = 0;
  let isEven = false;
  for (let i = cleanValue.length - 1; i >= 0; i--) {
    let digit = parseInt(cleanValue.charAt(i), 10);
    if (isEven) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    isEven = !isEven;
  }
  return sum % 10 === 0;
};

export const formatSiret = (value: string): string => {
  const clean = value.replace(/\D/g, '');
  if (clean.length === 14) return clean.replace(/(\d{3})(\d{3})(\d{3})(\d{5})/, '$1 $2 $3 $4');
  return clean;
};

// ✅ VALIDATION TVA FRANÇAISE
export const isValidFrenchVAT = (vat: string): boolean => {
  if (!vat) return false;
  const clean = vat.replace(/\s/g, '').toUpperCase();
  return /^FR[0-9A-Z]{2}\d{9}$/.test(clean);
};

const isValidEmail = (email: string): boolean => {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
};

// ============================================================
// TVA & PAYS
// ============================================================

interface TvaRate {
  id: string;
  name: string;
  rate: number;
  country: string;
}

const COUNTRIES = [
  { code: 'FR', name: 'France' }, { code: 'BE', name: 'Belgique' },
  { code: 'LU', name: 'Luxembourg' }, { code: 'DE', name: 'Allemagne' },
  { code: 'ES', name: 'Espagne' }, { code: 'IT', name: 'Italie' },
  { code: 'PT', name: 'Portugal' }, { code: 'NL', name: 'Pays-Bas' },
  { code: 'AT', name: 'Autriche' }, { code: 'IE', name: 'Irlande' },
  { code: 'GB', name: 'Royaume-Uni' }, { code: 'CH', name: 'Suisse' },
  { code: 'CA', name: 'Canada' }, { code: 'US', name: 'États-Unis' },
  { code: 'MA', name: 'Maroc' }, { code: 'TN', name: 'Tunisie' },
  { code: 'DZ', name: 'Algérie' }, { code: 'SN', name: 'Sénégal' },
  { code: 'CI', name: "Côte d'Ivoire" }, { code: 'OTHER', name: 'Autre' },
];

const DEFAULT_TVA_RATES: TvaRate[] = [
  { id: 'default-20', name: 'Taux normal', rate: 20, country: 'FR' },
  { id: 'default-10', name: 'Taux intermédiaire', rate: 10, country: 'FR' },
  { id: 'default-5.5', name: 'Taux réduit', rate: 5.5, country: 'FR' },
  { id: 'default-2.1', name: 'Taux super réduit', rate: 2.1, country: 'FR' },
  { id: 'default-0', name: 'Exonéré', rate: 0, country: 'FR' },
];

// ============================================================
// ⚡ E-FACTURATION - CONFIG
// ============================================================

interface EInvoiceSettings {
  platform: 'ppf' | 'pdp' | 'od';
  platformName: string;
  platformEndpoint: string;
  platformApiKey: string;
  transmissionFormat: 'factur-x' | 'ubl' | 'cii';
  autoTransmission: boolean;
  requireElectronicForB2B: boolean;
}

const DEFAULT_E_INVOICE: EInvoiceSettings = {
  platform: 'ppf',
  platformName: '',
  platformEndpoint: '',
  platformApiKey: '',
  transmissionFormat: 'factur-x',
  autoTransmission: false,
  requireElectronicForB2B: true,
};

// ============================================================
// TYPES D'ONGLETS
// ============================================================

type TabId = 'company' | 'vat' | 'currency' | 'einvoice';

interface Tab {
  id: TabId;
  label: string;
  icon: React.ReactNode;
  description: string;
  badge?: string;
}

const TABS: Tab[] = [
  { id: 'company', label: 'Entreprise', icon: <Building2 size={18} />, description: 'Identité, logo et coordonnées (pré-remplit devis/factures)' },
  { id: 'vat', label: 'TVA', icon: <FileText size={18} />, description: 'Taux par pays' },
  { id: 'currency', label: 'Devise', icon: <Coins size={18} />, description: 'Monnaie utilisée' },
  { id: 'einvoice', label: 'E-Facturation 2026', icon: <Zap size={18} />, description: 'Facturation électronique B2B', badge: '2026' },
];

// ============================================================
// 🎯 COMPOSANT PRINCIPAL
// ============================================================

export default function CompanySettings() {
  const { user } = useAuth();
  const { hasPermission, loading: permLoading } = usePermissions();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [existingDocId, setExistingDocId] = useState<string | null>(null);
  const [currentTeamId, setCurrentTeamId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('company');
  const [isCheckingSiret, setIsCheckingSiret] = useState(false);
  const [siretError, setSiretError] = useState('');
  
  const [formData, setFormData] = useState({
    name: '', legalForm: 'Entreprise Individuelle', address: '', siret: '', rcs: '',
    tvaNumber: 'TVA non applicable, art. 293 B du CGI', phone: '', email: '',
    defaultTvaRate: '20', logoFileId: '', publicSlug: '', currency: 'EUR',
    monthlyGoal: 5000
  });
  
  // ✅ Paramètres e-facturation (collection einvoice_settings)
  const [eInvoiceSettings, setEInvoiceSettings] = useState<EInvoiceSettings>(DEFAULT_E_INVOICE);
  const [eInvoiceSettingsId, setEInvoiceSettingsId] = useState<string | null>(null);
  
  const [customTvaRates, setCustomTvaRates] = useState<TvaRate[]>(DEFAULT_TVA_RATES);
  const [showAddTvaModal, setShowAddTvaModal] = useState(false);
  const [editingTvaId, setEditingTvaId] = useState<string | null>(null);
  const [newTva, setNewTva] = useState<{ name: string; rate: string; country: string }>({ name: '', rate: '', country: 'FR' });
  const [logoPreview, setLogoPreview] = useState<string>('');
  const [confirmDeleteTva, setConfirmDeleteTva] = useState<TvaRate | null>(null);

  const defaultRateValid = customTvaRates.some(r => r.rate.toString() === formData.defaultTvaRate);

  // ✅ Indicateurs pour la section e-facturation
  const hasValidSiret = formData.siret && formData.siret.replace(/\s/g, '').length === 14 && isValidSiret(formData.siret.replace(/\s/g, ''));
  const siren = formData.siret.replace(/\s/g, '').substring(0, 9);
  const nic = formData.siret.replace(/\s/g, '').substring(9, 14);
  const isTvaApplicable = !formData.tvaNumber.includes('non applicable');

  useEffect(() => {
    if (!permLoading && !hasPermission('settings.view')) {
      navigate('/dashboard');
    }
  }, [permLoading, hasPermission, navigate]);

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    loadSettings();
  }, [user]);

  // ============================================================
  // 📥 CHARGEMENT
  // ============================================================

  const loadSettings = async () => {
    try {
      if (!user?.$id) return;
      let teamId = null;
      const teamsRes = await databases.listDocuments(DATABASE_ID, 'teams', [Query.equal('ownerId', user.$id)]);
      if (teamsRes.documents.length > 0) teamId = teamsRes.documents[0].$id;
      else {
        const membersRes = await databases.listDocuments(DATABASE_ID, 'team_members', [Query.equal('userId', user.$id)]);
        if (membersRes.documents.length > 0) teamId = membersRes.documents[0].teamId;
      }
      if (!teamId) { setLoading(false); return; }
      setCurrentTeamId(teamId);

      // 1. Charger company_settings
      let response = await databases.listDocuments(DATABASE_ID, 'company_settings', [Query.equal('teamId', teamId)]);
      if (response.documents.length === 0) {
        response = await databases.listDocuments(DATABASE_ID, 'company_settings', [Query.equal('userId', user.$id)]);
      }

      const myDoc = response.documents[0];
      if (myDoc) {
        if (myDoc.teamId && myDoc.teamId !== teamId) {
          setExistingDocId(null);
          resetForm();
        } else {
          setExistingDocId(myDoc.$id);
          setFormData({
            name: myDoc.name || '', legalForm: myDoc.legalForm || 'Entreprise Individuelle',
            address: myDoc.address || '', siret: myDoc.siret || '', rcs: myDoc.rcs || '',
            tvaNumber: myDoc.tvaNumber || 'TVA non applicable, art. 293 B du CGI',
            phone: myDoc.phone || '', email: myDoc.email || '', defaultTvaRate: myDoc.defaultTvaRate || '20',
            logoFileId: myDoc.logoFileId || '', publicSlug: myDoc.publicSlug || '',
            currency: myDoc.currency || 'EUR',
            monthlyGoal: myDoc.monthlyGoal || 5000
          });
          if (myDoc.logoFileId) {
            try { setLogoPreview(getFilePreviewUrl('company_logos', myDoc.logoFileId)); } catch { setLogoPreview(''); }
          }
          if (myDoc.tvaRates) {
            try {
              const parsed = JSON.parse(myDoc.tvaRates);
              setCustomTvaRates(Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_TVA_RATES);
            } catch { setCustomTvaRates(DEFAULT_TVA_RATES); }
          } else {
            setCustomTvaRates(DEFAULT_TVA_RATES);
          }
        }
      } else {
        setExistingDocId(null);
        resetForm();
      }

      // 2. ✅ Charger les paramètres e-facturation depuis einvoice_settings
      try {
        const eInvoiceRes = await databases.listDocuments(
          DATABASE_ID, 
          'einvoice_settings', 
          [Query.equal('teamId', teamId), Query.limit(1)]
        );
        
        if (eInvoiceRes.documents.length > 0) {
          const doc = eInvoiceRes.documents[0] as any;
          setEInvoiceSettingsId(doc.$id);
          setEInvoiceSettings({
            platform: doc.platform || 'ppf',
            platformName: doc.platformName || '',
            platformEndpoint: doc.platformEndpoint || '',
            platformApiKey: doc.platformApiKey || '',
            transmissionFormat: doc.transmissionFormat || 'factur-x',
            autoTransmission: doc.autoTransmission === true,
            requireElectronicForB2B: doc.requireElectronicForB2B !== false,
          });
        } else {
          setEInvoiceSettingsId(null);
          setEInvoiceSettings(DEFAULT_E_INVOICE);
        }
      } catch (e) {
        console.warn('Paramètres e-facturation non chargés:', e);
        setEInvoiceSettings(DEFAULT_E_INVOICE);
      }
    } catch (err) { console.error('Erreur chargement:', err); } finally { setLoading(false); }
  };

  const resetForm = () => {
    setFormData({ 
      name: '', legalForm: 'Entreprise Individuelle', address: '', siret: '', rcs: '', 
      tvaNumber: 'TVA non applicable, art. 293 B du CGI', phone: '', email: '', 
      defaultTvaRate: '20', logoFileId: '', publicSlug: '', currency: 'EUR',
      monthlyGoal: 5000
    });
    setLogoPreview('');
    setCustomTvaRates(DEFAULT_TVA_RATES);
  };

  // ============================================================
  // 🔧 HANDLERS SIRET
  // ============================================================

  const handleSiretChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatSiret(e.target.value);
    setFormData(prev => ({ ...prev, siret: formatted }));
    setSiretError('');
  };

  const handleSiretBlur = async () => {
    const cleanSiret = formData.siret.replace(/\s/g, '');
    if (cleanSiret.length === 0) return;
    if (!isValidSiret(cleanSiret)) {
      setSiretError('Le numéro SIRET est invalide. Il doit contenir exactement 14 chiffres.');
      return;
    }
    setIsCheckingSiret(true);
    setSiretError('');
    try {
      const response = await fetch(`https://recherche-entreprises.api.gouv.fr/search?q=${cleanSiret}&per_page=1`);
      const data = await response.json();
      if (data.results && data.results.length > 0) {
        const company = data.results[0];
        const siege = company.siege;
        const uniteLegale = company.unite_legale || {};
        if (company.etat_administratif !== 'A') {
          setSiretError('Cette entreprise est fermée administrativement. Vérifiez le numéro.');
          return;
        }
        const fullAddress = `${siege?.libelle_voie || ''}, ${siege?.code_postal || ''} ${siege?.libelle_commune || ''}`.replace(/^, /, '').trim();
        const apiTvaNumber = uniteLegale.tva_intracommunautaire;
        const newTvaNumber = apiTvaNumber ? apiTvaNumber : 'TVA non applicable, art. 293 B du CGI';
        setFormData(prev => ({
          ...prev,
          name: company.nom_complet || prev.name,
          address: fullAddress || prev.address,
          tvaNumber: newTvaNumber
        }));
        toast.success('Entreprise trouvée !', { description: 'Nom, adresse et statut TVA pré-remplis.' });
      } else {
        setSiretError('Entreprise introuvable dans le registre officiel. Vous pouvez remplir manuellement.');
      }
    } catch (err) {
      console.error('Erreur vérification SIRET:', err);
      setSiretError('Erreur de connexion au registre des entreprises.');
    } finally {
      setIsCheckingSiret(false);
    }
  };

  // ============================================================
  // 🖼️ LOGO
  // ============================================================

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(''); setUploading(true);
    try {
      if (!['image/png','image/jpeg','image/jpg','image/svg+xml','image/webp'].includes(file.type)) throw new Error('Format non supporté.');
      if (file.size > 5 * 1024 * 1024) throw new Error('Fichier trop volumineux (Max 5 Mo).');
      const localPreviewUrl = URL.createObjectURL(file);
      setLogoPreview(localPreviewUrl);
      if (formData.logoFileId) { try { await storage.deleteFile('company_logos', formData.logoFileId); } catch(e){} }
      const uploadedFile = await storage.createFile('company_logos', ID.unique(), file);
      setFormData(prev => ({ ...prev, logoFileId: uploadedFile.$id }));
      toast.success('Logo téléchargé !', { description: "N'oubliez pas d'enregistrer." });
    } catch (err: any) { setError(err.message); setLogoPreview(''); } finally { setUploading(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
  };

  const handleRemoveLogo = async () => {
    try { if (formData.logoFileId) await storage.deleteFile('company_logos', formData.logoFileId); setFormData(p => ({...p, logoFileId: ''})); setLogoPreview(''); } catch(e){}
  };

  // ============================================================
  // 💰 TVA
  // ============================================================

  const openAddTvaModal = (tva?: TvaRate) => {
    if (tva) {
      setEditingTvaId(tva.id);
      setNewTva({ name: tva.name, rate: tva.rate.toString(), country: tva.country });
    } else {
      setEditingTvaId(null);
      setNewTva({ name: '', rate: '', country: 'FR' });
    }
    setShowAddTvaModal(true);
  };

  const handleSaveTva = () => {
    const rate = parseFloat(newTva.rate);
    if (!newTva.name.trim()) { toast.error('Veuillez saisir un nom pour ce taux.'); return; }
    if (isNaN(rate) || rate < 0 || rate > 100) { toast.error('Le taux doit être compris entre 0 et 100.'); return; }
    if (editingTvaId) {
      setCustomTvaRates(prev => prev.map(t => t.id === editingTvaId ? { ...t, name: newTva.name.trim(), rate, country: newTva.country } : t));
    } else {
      setCustomTvaRates(prev => [...prev, { id: `tva-${Date.now()}`, name: newTva.name.trim(), rate, country: newTva.country }]);
    }
    setShowAddTvaModal(false);
    setEditingTvaId(null);
    setNewTva({ name: '', rate: '', country: 'FR' });
    toast.success('Taux de TVA mis à jour !', { description: "N'oubliez pas d'enregistrer." });
  };

  const handleDeleteTvaConfirm = () => {
    if (!confirmDeleteTva) return;
    if (customTvaRates.length <= 1) { toast.error('Vous devez conserver au moins un taux de TVA.'); setConfirmDeleteTva(null); return; }
    const rateToDelete = confirmDeleteTva;
    setCustomTvaRates(prev => prev.filter(t => t.id !== rateToDelete.id));
    if (formData.defaultTvaRate === rateToDelete.rate.toString()) {
      const remaining = customTvaRates.filter(t => t.id !== rateToDelete.id);
      if (remaining.length > 0) setFormData(prev => ({ ...prev, defaultTvaRate: remaining[0].rate.toString() }));
    }
    setConfirmDeleteTva(null);
    toast.success('Taux supprimé !', { description: "N'oubliez pas d'enregistrer." });
  };

  // ============================================================
  // 💾 SAUVEGARDE
  // ============================================================

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.$id || !currentTeamId) { toast.error('Erreur de session ou d\'équipe.'); return; }

    if (formData.siret && !isValidSiret(formData.siret.replace(/\s/g, ''))) {
      toast.error('Le numéro SIRET est invalide (14 chiffres attendus).');
      setActiveTab('company');
      return;
    }
    if (formData.email && !isValidEmail(formData.email)) {
      toast.error('L\'adresse email est invalide.');
      setActiveTab('company');
      return;
    }
    if (!defaultRateValid) {
      toast.error('Le taux de TVA par défaut n\'existe pas dans votre liste.');
      setActiveTab('vat');
      return;
    }
    
    // ✅ Validation e-facturation
    if (activeTab === 'einvoice') {
      if (!hasValidSiret) {
        toast.error('Un SIRET valide (14 chiffres) est obligatoire pour activer l\'e-facturation.');
        setActiveTab('company');
        return;
      }
      if (eInvoiceSettings.platform !== 'ppf' && !eInvoiceSettings.platformName.trim()) {
        toast.error('Veuillez indiquer le nom de la plateforme PDP/OD.');
        return;
      }
    }

    setSaving(true); setError(''); setSuccess('');
    try {
      const perms: string[] = user?.secureTeamId
        ? [Permission.read(Role.team(user.secureTeamId)), Permission.update(Role.team(user.secureTeamId)), Permission.delete(Role.team(user.secureTeamId))]
        : [Permission.read(Role.users()), Permission.update(Role.users()), Permission.delete(Role.users())];

      // 1. Sauvegarder company_settings
      const companyPayload = { 
        ...formData, 
        userId: user.$id, 
        teamId: currentTeamId, 
        tvaRates: JSON.stringify(customTvaRates),
      };
      
      if (existingDocId) {
        const existingDoc = await databases.getDocument(DATABASE_ID, 'company_settings', existingDocId);
        if (existingDoc.teamId && existingDoc.teamId !== currentTeamId) throw new Error('Accès refusé');
        await databases.updateDocument(DATABASE_ID, 'company_settings', existingDocId, companyPayload);
      } else {
        await databases.createDocument(DATABASE_ID, 'company_settings', ID.unique(), companyPayload, perms);
      }

      // 2. ✅ Sauvegarder les paramètres e-facturation dans einvoice_settings
      const eInvoicePayload = {
        teamId: currentTeamId,
        userId: user.$id,
        platform: eInvoiceSettings.platform,
        platformName: eInvoiceSettings.platformName,
        platformEndpoint: eInvoiceSettings.platformEndpoint,
        platformApiKey: eInvoiceSettings.platformApiKey,
        transmissionFormat: eInvoiceSettings.transmissionFormat,
        autoTransmission: eInvoiceSettings.autoTransmission,
        requireElectronicForB2B: eInvoiceSettings.requireElectronicForB2B,
      };

      try {
        if (eInvoiceSettingsId) {
          await databases.updateDocument(DATABASE_ID, 'einvoice_settings', eInvoiceSettingsId, eInvoicePayload);
        } else {
          const newDoc = await databases.createDocument(
            DATABASE_ID,
            'einvoice_settings',
            ID.unique(),
            eInvoicePayload,
            perms
          );
          setEInvoiceSettingsId(newDoc.$id);
        }
      } catch (eInvoiceError: any) {
        console.error('Erreur sauvegarde e-facturation:', eInvoiceError);
        toast.warning('Paramètres entreprise enregistrés, mais les paramètres e-facturation ont échoué.');
      }

      toast.success('Paramètres enregistrés avec succès !', {
        description: 'Ces informations seront utilisées pour pré-remplir vos devis et factures.'
      });
      await loadSettings();
    } catch (err: any) { toast.error(`Erreur: ${err.message}`); } finally { setSaving(false); }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const target = e.target as HTMLInputElement;
    const value = target.type === 'number' ? parseFloat(target.value) || 0 : target.value;
    setFormData({ ...formData, [target.name]: value });
  };

  // ============================================================
  // 🎨 RENDU
  // ============================================================

  if (permLoading) return (
    <Sidebar>
      <div className="flex items-center justify-center h-full w-full">
        <div className="text-slate-500 dark:text-slate-400 text-lg animate-pulse">Vérification des droits...</div>
      </div>
    </Sidebar>
  );

  if (!hasPermission('settings.view')) return null;

  if (loading) return (
    <Sidebar>
      <div className="flex items-center justify-center h-full w-full">
        <div className="text-slate-500 dark:text-slate-400 text-lg animate-pulse">Chargement...</div>
      </div>
    </Sidebar>
  );

  const canEdit = hasPermission('settings.edit');
  const ratesByCountry = customTvaRates.reduce((acc, rate) => {
    const country = COUNTRIES.find(c => c.code === rate.country) || { code: rate.country, name: rate.country };
    if (!acc[country.code]) acc[country.code] = { country, rates: [] };
    acc[country.code].rates.push(rate);
    return acc;
  }, {} as Record<string, { country: typeof COUNTRIES[0]; rates: TvaRate[] }>);

  const currentCurrency = getCurrencyConfig(formData.currency);

  return (
    <Sidebar>
      <div className="min-h-full bg-slate-50 dark:bg-slate-900">
        <PageHeader
          icon={Building2}
          iconColor="purple"
          title="Mon Entreprise"
          description="Ces informations pré-rempliront automatiquement vos devis et factures."
        />

        <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          {!canEdit && (
            <Alert tone="warning" icon={Lock} title="Mode lecture seule" className="mb-6">
              Vous n'avez pas les permissions pour modifier ces paramètres.
            </Alert>
          )}

          {success && (
            <Alert tone="success" icon={CheckCircle2} title={success} className="mb-4" />
          )}
          {error && (
            <Alert tone="error" icon={AlertCircle} title={error} className="mb-4" />
          )}

          {/* Navigation par onglets */}
          <div className="bg-white dark:bg-slate-800 rounded-t-xl border border-slate-200 dark:border-slate-700 border-b-0 overflow-hidden">
            <div className="flex overflow-x-auto scrollbar-hide">
              {TABS.map(tab => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex-1 min-w-[140px] flex items-center justify-center gap-2 px-4 py-4 text-sm font-semibold transition-all relative ${
                      isActive
                        ? 'text-purple-600 dark:text-purple-400 bg-purple-50/50 dark:bg-purple-900/10'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/30'
                    }`}
                  >
                    {tab.icon}
                    <span className="hidden sm:inline">{tab.label}</span>
                    {tab.badge && (
                      <span className="px-1.5 py-0.5 text-[9px] font-bold bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded">
                        {tab.badge}
                      </span>
                    )}
                    {isActive && (
                      <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-purple-600 dark:bg-purple-400"></span>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="px-4 sm:px-6 py-3 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-200 dark:border-slate-700">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {TABS.find(t => t.id === activeTab)?.description}
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-800 rounded-b-xl shadow-sm border border-slate-200 dark:border-slate-700 border-t-0 p-4 sm:p-6">
            {/* ONGLET 1 : INFORMATIONS ENTREPRISE */}
            {activeTab === 'company' && (
              <div className="space-y-6 animate-fadeIn">
                {/* LOGO */}
                <Card>
                  <SectionTitle icon={ImageIcon} action={
                    canEdit && logoPreview ? (
                      <button type="button" onClick={handleRemoveLogo} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors active:scale-95">
                        <X size={14} /> Supprimer
                      </button>
                    ) : null
                  }>
                    Logo de l'entreprise <span className="text-sm font-normal text-slate-500 dark:text-slate-400">(optionnel)</span>
                  </SectionTitle>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Ajoutez votre logo pour qu'il apparaisse sur vos devis et factures.</p>
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
                    <div className="w-32 h-32 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg flex items-center justify-center bg-slate-50 dark:bg-slate-700/50 overflow-hidden flex-shrink-0">
                      {logoPreview ? <img src={logoPreview} alt="Logo" className="w-full h-full object-contain p-2" /> : <ImageIcon size={40} className="text-slate-300 dark:text-slate-500" />}
                    </div>
                    <div className="flex flex-col gap-2 w-full sm:w-auto">
                      {canEdit && (
                        <>
                          <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/jpg,image/svg+xml,image/webp" onChange={handleLogoUpload} className="hidden" id="logo-upload" />
                          <label htmlFor="logo-upload" className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg cursor-pointer transition-colors active:scale-95 ${uploading ? 'bg-slate-100 dark:bg-slate-700 text-slate-400 cursor-not-allowed' : 'bg-purple-600 text-white hover:bg-purple-700'}`}>
                            <Upload size={16} /> {uploading ? 'Upload...' : 'Choisir un logo'}
                          </label>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">PNG, JPG, SVG ou WEBP • Max 5 Mo</p>
                        </>
                      )}
                    </div>
                  </div>
                </Card>

                {/* LIEN PUBLIC */}
                <Card>
                  <SectionTitle icon={Globe}>Lien public de demande de devis</SectionTitle>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Partagez ce lien avec vos clients pour qu'ils puissent vous demander un devis.</p>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <div className="flex-1 flex items-center">
                      <span className="bg-slate-100 dark:bg-slate-700 border border-r-0 border-slate-300 dark:border-slate-600 rounded-l-lg px-3 py-3 text-sm text-slate-500 dark:text-slate-400 whitespace-nowrap hidden sm:block">/demande/</span>
                      <Input
                        type="text"
                        name="publicSlug"
                        value={formData.publicSlug}
                        onChange={(e) => setFormData({ ...formData, publicSlug: (e.target as HTMLInputElement).value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
                        disabled={!canEdit}
                        className="flex-1 rounded-l-lg sm:rounded-l-none rounded-r-lg"
                        placeholder="mon-entreprise"
                      />
                    </div>
                    {formData.publicSlug && (
                      <button type="button" onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/demande/${formData.publicSlug}`); toast.success('Lien copié !'); }} className="px-4 py-3 text-sm font-medium text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-800 rounded-lg hover:bg-purple-100 dark:hover:bg-purple-900/50 flex items-center justify-center gap-2 transition-colors active:scale-95">
                        <Copy size={16} /> Copier le lien
                      </button>
                    )}
                  </div>
                </Card>

                {/* INFOS GÉNÉRALES */}
                <Card>
                  <SectionTitle icon={Building2}>Informations légales</SectionTitle>
                  <Alert tone="info" icon={AlertCircle} className="mb-4">
                    💡 <strong>Important :</strong> Ces informations sont automatiquement pré-remplies dans vos <strong>devis</strong> et <strong>factures</strong>.
                  </Alert>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                    <FormField label="Nom de l'entreprise" required>
                      <Input type="text" name="name" required value={formData.name} onChange={handleChange} disabled={!canEdit} />
                    </FormField>
                    <FormField label="Forme juridique">
                      <Select name="legalForm" value={formData.legalForm} onChange={handleChange} disabled={!canEdit}>
                        <option>Entreprise Individuelle</option><option>Micro-entreprise</option><option>SASU</option><option>SARL</option><option>SAS</option><option>EURL</option>
                      </Select>
                    </FormField>
                    <FormField label="Adresse complète" className="md:col-span-2">
                      <Input type="text" name="address" value={formData.address} onChange={handleChange} disabled={!canEdit} placeholder="123 rue de la Paix, 75000 Paris" />
                    </FormField>
                    <FormField label="N° SIRET" hint={siretError || "💡 14 chiffres : 9 pour le SIREN + 5 pour le NIC. Obligatoire pour l'e-facturation B2B en France."}>
                      <div className="relative">
                        <Input
                          type="text"
                          name="siret"
                          value={formData.siret}
                          onChange={handleSiretChange}
                          onBlur={handleSiretBlur}
                          disabled={!canEdit}
                          maxLength={17}
                          placeholder="123 456 789 00012"
                          className={siretError ? 'border-red-500 focus:ring-red-500 pr-10' : 'pr-10'}
                        />
                        {isCheckingSiret && (
                          <div className="absolute right-3 top-1/2 -translate-y-1/2">
                            <svg className="animate-spin h-5 w-5 text-purple-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
                          </div>
                        )}
                      </div>
                      {hasValidSiret && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          <span className="inline-flex items-center gap-1.5 text-xs font-mono bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 px-2 py-1 rounded">
                            <span className="font-semibold">SIREN:</span> {siren}
                          </span>
                          <span className="inline-flex items-center gap-1.5 text-xs font-mono bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 px-2 py-1 rounded">
                            <span className="font-semibold">NIC:</span> {nic}
                          </span>
                        </div>
                      )}
                    </FormField>
                    <FormField label="RCS / RM">
                      <Input type="text" name="rcs" value={formData.rcs} onChange={handleChange} disabled={!canEdit} placeholder="Ex: RCS Paris B 123 456 789" />
                    </FormField>
                    <FormField label="N° TVA intracommunautaire" className="md:col-span-2">
                      <Select name="tvaNumber" value={formData.tvaNumber.startsWith('TVA non') ? formData.tvaNumber : 'Assujetti à la TVA'} onChange={(e) => {
                        if ((e.target as HTMLSelectElement).value === 'Assujetti à la TVA') {
                          setFormData({ ...formData, tvaNumber: 'Assujetti à la TVA' });
                        } else {
                          setFormData({ ...formData, tvaNumber: (e.target as HTMLSelectElement).value });
                        }
                      }} disabled={!canEdit}>
                        <option value="TVA non applicable, art. 293 B du CGI">TVA non applicable (micro-entreprise)</option>
                        <option value="Assujetti à la TVA">Assujetti à la TVA (saisir le numéro ci-dessous)</option>
                      </Select>
                      {formData.tvaNumber !== 'TVA non applicable, art. 293 B du CGI' && (
                        <Input 
                          type="text" 
                          placeholder="Ex: FR12345678901" 
                          value={formData.tvaNumber === 'Assujetti à la TVA' ? '' : formData.tvaNumber} 
                          onChange={(e) => setFormData({ ...formData, tvaNumber: (e.target as HTMLInputElement).value || 'Assujetti à la TVA' })} 
                          disabled={!canEdit} 
                          className="mt-2" 
                        />
                      )}
                    </FormField>
                  </div>
                </Card>

                {/* COORDONNÉES */}
                <Card>
                  <SectionTitle icon={Globe}>Coordonnées</SectionTitle>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                    <FormField label="Téléphone">
                      <Input type="tel" name="phone" value={formData.phone} onChange={handleChange} disabled={!canEdit} placeholder="01 23 45 67 89" />
                    </FormField>
                    <FormField label="Email">
                      <Input type="email" name="email" value={formData.email} onChange={handleChange} disabled={!canEdit} placeholder="contact@entreprise.fr" />
                    </FormField>
                  </div>
                </Card>

                {/* OBJECTIFS COMMERCIAUX */}
                <Card>
                  <SectionTitle icon={Target}>Objectifs commerciaux</SectionTitle>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                    Définissez vos objectifs mensuels pour suivre votre progression sur le tableau de bord.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                    <FormField 
                      label="🎯 Objectif mensuel (HT)" 
                      hint="Utilisé pour calculer votre progression sur le tableau de bord"
                    >
                      <div className="relative">
                        <Input 
                          type="number" 
                          name="monthlyGoal" 
                          value={formData.monthlyGoal} 
                          onChange={handleChange} 
                          disabled={!canEdit}
                          min="0"
                          step="100"
                          placeholder="5000"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400 dark:text-slate-500 pointer-events-none">
                          {currentCurrency.symbol}
                        </span>
                      </div>
                    </FormField>
                  </div>
                </Card>
              </div>
            )}

            {/* ONGLET 2 : TVA */}
            {activeTab === 'vat' && (
              <div className="space-y-6 animate-fadeIn">
                <Card>
                  <SectionTitle icon={FileText}>Taux de TVA par défaut</SectionTitle>
                  <Alert tone="info" icon={AlertCircle} className="mb-4">
                    Ce taux sera appliqué par défaut sur vos nouveaux devis et factures.
                  </Alert>
                  <FormField label="⭐ Taux par défaut">
                    <Select name="defaultTvaRate" value={formData.defaultTvaRate} onChange={handleChange} disabled={!canEdit} className={!defaultRateValid ? 'border-red-500' : ''}>
                      {customTvaRates.map(rate => {
                        const country = COUNTRIES.find(c => c.code === rate.country);
                        return <option key={rate.id} value={rate.rate.toString()}>{rate.name} — {rate.rate}% {country ? `(${country.name})` : ''}</option>;
                      })}
                    </Select>
                  </FormField>
                  {!defaultRateValid && (
                    <p className="text-xs text-red-600 dark:text-red-400 mt-2 flex items-center gap-1">
                      <AlertCircle size={12} /> Le taux sélectionné n'existe pas dans votre liste
                    </p>
                  )}
                </Card>

                <Card>
                  <SectionTitle icon={Globe} action={
                    canEdit ? (
                      <button type="button" onClick={() => openAddTvaModal()} className="flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors active:scale-95">
                        <Plus size={16} /> Ajouter un taux
                      </button>
                    ) : null
                  }>
                    Taux de TVA par pays
                  </SectionTitle>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                    Gérez vos taux de TVA pour chaque pays où vous facturez.
                  </p>
                  <div className="space-y-4">
                    {Object.values(ratesByCountry).map(({ country, rates }) => (
                      <div key={country.code} className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                        <div className="bg-slate-50 dark:bg-slate-900/50 px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2">
                          <span className="text-sm font-bold text-slate-700 dark:text-slate-300">{country.name}</span>
                          <Badge tone="slate">{rates.length} taux</Badge>
                        </div>
                        <div className="divide-y divide-slate-100 dark:divide-slate-700">
                          {rates.map(rate => (
                            <div key={rate.id} className="px-4 py-3 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-semibold text-slate-900 dark:text-white">{rate.name}</span>
                                  <span className={`text-sm font-bold ${formData.defaultTvaRate === rate.rate.toString() ? 'text-purple-600 dark:text-purple-400' : 'text-slate-600 dark:text-slate-300'}`}>{rate.rate}%</span>
                                  {formData.defaultTvaRate === rate.rate.toString() && <Badge tone="purple">PAR DÉFAUT</Badge>}
                                </div>
                              </div>
                              {canEdit && (
                                <div className="flex gap-1 ml-2">
                                  <button type="button" onClick={() => openAddTvaModal(rate)} className="p-2 text-slate-400 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/30 rounded-lg transition-colors" title="Modifier">
                                    <Edit2 size={16} />
                                  </button>
                                  {customTvaRates.length > 1 && (
                                    <button type="button" onClick={() => setConfirmDeleteTva(rate)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors" title="Supprimer">
                                      <Trash2 size={16} />
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            )}

            {/* ONGLET 3 : DEVISE */}
            {activeTab === 'currency' && (
              <div className="space-y-6 animate-fadeIn">
                <Card>
                  <SectionTitle icon={Coins}>Devise principale</SectionTitle>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                    Cette devise sera utilisée sur tous vos devis, factures, reçus et exports CSV.
                  </p>
                  <FormField label="Sélectionnez votre devise">
                    <Select name="currency" value={formData.currency} onChange={handleChange} disabled={!canEdit}>
                      {SUPPORTED_CURRENCIES.map(c => (
                        <option key={c.code} value={c.code}>
                          {c.symbol} — {c.name}
                        </option>
                      ))}
                    </Select>
                  </FormField>
                </Card>

                <Card>
                  <SectionTitle icon={Eye}>Aperçu du rendu</SectionTitle>
                  <Alert tone="info" icon={Eye} className="mb-4">
                    Un montant de <strong>1 234,56</strong> s'affichera ainsi sur vos documents :
                  </Alert>
                  <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-purple-200 dark:border-purple-700 mb-4">
                    <span className="font-mono font-bold text-2xl text-purple-900 dark:text-purple-100">
                      {formatMoney(1234.56, formData.currency)}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 dark:text-slate-400">
                    <div><strong>Code :</strong> {currentCurrency.code}</div>
                    <div><strong>Symbole :</strong> {currentCurrency.symbol}</div>
                    <div><strong>Locale :</strong> {currentCurrency.locale}</div>
                    <div><strong>Décimales :</strong> {['JPY', 'XOF', 'XAF'].includes(currentCurrency.code) ? '0' : '2'}</div>
                  </div>
                </Card>

                <Card>
                  <SectionTitle>Autres devises disponibles</SectionTitle>
                  <div className="flex flex-wrap gap-2">
                    {SUPPORTED_CURRENCIES.map(c => (
                      <span
                        key={c.code}
                        className={`text-xs px-3 py-1.5 rounded-full font-mono transition-colors ${
                          c.code === formData.currency
                            ? 'bg-purple-600 text-white font-bold'
                            : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {c.symbol} {c.code}
                      </span>
                    ))}
                  </div>
                </Card>

                <Alert tone="info" icon={AlertCircle} title="Changement de devise">
                  Si vous changez de devise, les anciens documents ne seront pas modifiés. Seuls les nouveaux documents utiliseront la devise sélectionnée. La devise est stockée dans chaque document pour traçabilité.
                </Alert>
              </div>
            )}

            {/* ONGLET 4 : E-FACTURATION 2026 */}
            {activeTab === 'einvoice' && (
              <div className="space-y-6 animate-fadeIn">
                <Alert tone="info" icon={AlertCircle} title="Réforme 2026 - Facturation électronique obligatoire">
                  <p className="text-sm mt-1">
                    À partir du <strong>1er septembre 2026</strong>, toutes les entreprises françaises assujetties à la TVA 
                    devront émettre et recevoir leurs factures B2B sous format électronique via une plateforme agréée (PDP) 
                    ou le portail public (PPF/Chorus Pro).
                  </p>
                </Alert>

                {!hasValidSiret ? (
                  <Alert tone="warning" icon={Shield} title="⚠️ SIRET requis pour l'e-facturation">
                    <p className="text-sm mt-1">
                      Pour activer l'e-facturation, vous devez d'abord renseigner un <strong>SIRET valide (14 chiffres)</strong> 
                      dans l'onglet "Entreprise". Le SIREN (9 chiffres) et le NIC (5 chiffres) seront extraits automatiquement.
                    </p>
                    <button 
                      type="button" 
                      onClick={() => setActiveTab('company')}
                      className="mt-3 text-sm font-medium text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-1"
                    >
                      → Aller à l'onglet Entreprise
                    </button>
                  </Alert>
                ) : (
                  <Alert tone="success" icon={CheckCircle2} title="✅ Données prêtes pour l'e-facturation">
                    <p className="text-sm mt-1">
                      Votre SIRET <strong className="font-mono">{formData.siret}</strong> est valide.
                      {isTvaApplicable && formData.tvaNumber && !formData.tvaNumber.includes('Assujetti') && (
                        <> TVA : <strong className="font-mono">{formData.tvaNumber}</strong></>
                      )}
                      {' '}Votre entreprise est prête pour transmettre des factures électroniques B2B.
                    </p>
                  </Alert>
                )}

                <Card>
                  <SectionTitle icon={Server}>Plateforme de transmission</SectionTitle>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                    Choisissez la plateforme par laquelle vous transmettrez vos e-factures.
                  </p>
                  <div className="space-y-4">
                    <FormField label="Type de plateforme" required>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <button
                          type="button"
                          onClick={() => setEInvoiceSettings({ ...eInvoiceSettings, platform: 'ppf' })}
                          disabled={!canEdit}
                          className={`p-4 rounded-xl border-2 text-left transition-all ${
                            eInvoiceSettings.platform === 'ppf'
                              ? 'border-purple-600 bg-purple-50 dark:bg-purple-900/20'
                              : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-lg">🏛️</span>
                            <span className="font-semibold text-sm">PPF (Gratuit)</span>
                          </div>
                          <p className="text-xs text-slate-600 dark:text-slate-400">
                            Portail Public (Chorus Pro) - Solution gratuite de l'État français
                          </p>
                        </button>
                        
                        <button
                          type="button"
                          onClick={() => setEInvoiceSettings({ ...eInvoiceSettings, platform: 'pdp' })}
                          disabled={!canEdit}
                          className={`p-4 rounded-xl border-2 text-left transition-all ${
                            eInvoiceSettings.platform === 'pdp'
                              ? 'border-purple-600 bg-purple-50 dark:bg-purple-900/20'
                              : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-lg">🏢</span>
                            <span className="font-semibold text-sm">PDP (Payant)</span>
                          </div>
                          <p className="text-xs text-slate-600 dark:text-slate-400">
                            Plateforme de Dématérialisation Partenaire (ex: PennyLane, Yousign)
                          </p>
                        </button>
                        
                        <button
                          type="button"
                          onClick={() => setEInvoiceSettings({ ...eInvoiceSettings, platform: 'od' })}
                          disabled={!canEdit}
                          className={`p-4 rounded-xl border-2 text-left transition-all ${
                            eInvoiceSettings.platform === 'od'
                              ? 'border-purple-600 bg-purple-50 dark:bg-purple-900/20'
                              : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-lg">🔗</span>
                            <span className="font-semibold text-sm">OD</span>
                          </div>
                          <p className="text-xs text-slate-600 dark:text-slate-400">
                            Opérateur de Dématérialisation (solution tierce)
                          </p>
                        </button>
                      </div>
                    </FormField>

                    {eInvoiceSettings.platform !== 'ppf' && (
                      <>
                        <FormField label="Nom de la plateforme" required>
                          <Input 
                            type="text" 
                            value={eInvoiceSettings.platformName}
                            onChange={(e) => setEInvoiceSettings({ ...eInvoiceSettings, platformName: e.target.value })}
                            disabled={!canEdit}
                            placeholder="Ex: PennyLane, Yousign, Sage..."
                          />
                        </FormField>
                        <FormField label="URL de l'API (Endpoint)">
                          <Input 
                            type="url" 
                            value={eInvoiceSettings.platformEndpoint}
                            onChange={(e) => setEInvoiceSettings({ ...eInvoiceSettings, platformEndpoint: e.target.value })}
                            disabled={!canEdit}
                            placeholder="https://api.exemple.com/v1"
                          />
                        </FormField>
                        <FormField label="Clé API / Token d'authentification">
                          <Input 
                            type="password" 
                            value={eInvoiceSettings.platformApiKey}
                            onChange={(e) => setEInvoiceSettings({ ...eInvoiceSettings, platformApiKey: e.target.value })}
                            disabled={!canEdit}
                            placeholder="Votre clé API secrète"
                          />
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                            🔒 Stockée de manière sécurisée. Ne jamais partager.
                          </p>
                        </FormField>
                      </>
                    )}
                  </div>
                </Card>

                <Card>
                  <SectionTitle icon={FileText}>Format et transmission</SectionTitle>
                  <div className="space-y-4">
                    <FormField label="Format de facturation électronique" required>
                      <Select 
                        value={eInvoiceSettings.transmissionFormat}
                        onChange={(e) => setEInvoiceSettings({ ...eInvoiceSettings, transmissionFormat: e.target.value as any })}
                        disabled={!canEdit}
                      >
                        <option value="factur-x">Factur-X (CII) - Recommandé en France</option>
                        <option value="ubl">UBL 2.1 - Standard européen</option>
                        <option value="cii">CII UN/CEFACT - Format UN</option>
                      </Select>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        💡 <strong>Factur-X</strong> est le format hybride (PDF/A-3 + XML) recommandé pour la France.
                      </p>
                    </FormField>

                    <div className="space-y-3">
                      <label className="flex items-start gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={eInvoiceSettings.autoTransmission}
                          onChange={(e) => setEInvoiceSettings({ ...eInvoiceSettings, autoTransmission: e.target.checked })}
                          disabled={!canEdit}
                          className="mt-1 rounded text-purple-600 focus:ring-purple-500"
                        />
                        <div className="flex-1">
                          <div className="font-medium text-sm text-slate-900 dark:text-white">
                            Transmission automatique
                          </div>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            Transmettre automatiquement les factures à la plateforme après validation
                          </p>
                        </div>
                      </label>

                      <label className="flex items-start gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={eInvoiceSettings.requireElectronicForB2B}
                          onChange={(e) => setEInvoiceSettings({ ...eInvoiceSettings, requireElectronicForB2B: e.target.checked })}
                          disabled={!canEdit}
                          className="mt-1 rounded text-purple-600 focus:ring-purple-500"
                        />
                        <div className="flex-1">
                          <div className="font-medium text-sm text-slate-900 dark:text-white">
                            Exiger l'e-facturation pour les clients B2B français
                          </div>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            Afficher un avertissement si un client professionnel français n'a pas de SIRET
                          </p>
                        </div>
                      </label>
                    </div>
                  </div>
                </Card>

                <Card>
                  <SectionTitle icon={AlertCircle}>Conformité et obligations</SectionTitle>
                  <div className="space-y-3 text-sm">
                    <div className="flex items-start gap-3 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                      <CheckCircle2 size={18} className="text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <div className="font-medium text-green-900 dark:text-green-100">Émission de factures</div>
                        <p className="text-xs text-green-700 dark:text-green-300 mt-0.5">
                          Toutes vos factures B2B doivent être émises sous format électronique à partir du 01/09/2026
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                      <AlertCircle size={18} className="text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <div className="font-medium text-blue-900 dark:text-blue-100">Réception de factures</div>
                        <p className="text-xs text-blue-700 dark:text-blue-300 mt-0.5">
                          Vous devez être capable de recevoir des e-factures de vos fournisseurs via la plateforme choisie
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
                      <FileText size={18} className="text-purple-600 dark:text-purple-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <div className="font-medium text-purple-900 dark:text-purple-100">E-reporting (B2C et international)</div>
                        <p className="text-xs text-purple-700 dark:text-purple-300 mt-0.5">
                          Les transactions B2C et internationales doivent être déclarées via le e-reporting (données de transaction)
                        </p>
                      </div>
                    </div>
                  </div>
                </Card>
              </div>
            )}

            {/* BOUTONS D'ACTION */}
            {canEdit && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-6 mt-6 border-t border-slate-100 dark:border-slate-700">
                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                  Onglet actuel : <strong className="text-slate-700 dark:text-slate-300">{TABS.find(t => t.id === activeTab)?.label}</strong>
                </div>
                <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
                  <button type="button" onClick={() => navigate('/dashboard')} className="w-full sm:w-auto px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors active:scale-95">
                    Annuler
                  </button>
                  <button type="submit" disabled={saving || !defaultRateValid} className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 text-sm font-semibold text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors active:scale-95 shadow-lg shadow-purple-600/20">
                    {saving ? (
                      <>
                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
                        <span>Enregistrement...</span>
                      </>
                    ) : (
                      <><Save size={16} /><span>Enregistrer</span></>
                    )}
                  </button>
                </div>
              </div>
            )}
          </form>
        </main>

        {/* MODAL TVA */}
        <Modal
          open={showAddTvaModal}
          onClose={() => { setShowAddTvaModal(false); setEditingTvaId(null); }}
          title={editingTvaId ? 'Modifier le taux' : 'Nouveau taux de TVA'}
          icon={<Globe className="text-purple-600" size={20} />}
          footer={
            <>
              <button onClick={() => { setShowAddTvaModal(false); setEditingTvaId(null); }} className="flex-1 px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600 active:scale-95 transition-all">Annuler</button>
              <button onClick={handleSaveTva} disabled={!newTva.name.trim() || !newTva.rate} className="flex-1 px-4 py-3 text-sm font-semibold text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-50 active:scale-95 transition-all">{editingTvaId ? 'Modifier' : 'Ajouter'}</button>
            </>
          }
        >
          <div className="space-y-4">
            <FormField label="Nom du taux" required>
              <Input type="text" value={newTva.name} onChange={e => setNewTva({ ...newTva, name: (e.target as HTMLInputElement).value })} placeholder="Ex: Taux normal, Taux réduit..." autoFocus />
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Taux (%)" required>
                <Input type="number" step="0.1" min="0" max="100" value={newTva.rate} onChange={e => setNewTva({ ...newTva, rate: (e.target as HTMLInputElement).value })} placeholder="20" />
              </FormField>
              <FormField label="Pays" required>
                <Select value={newTva.country} onChange={e => setNewTva({ ...newTva, country: (e.target as HTMLSelectElement).value })}>
                  {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
                </Select>
              </FormField>
            </div>
            <Alert tone="info" icon={AlertCircle}>
              💡 <strong>Astuce :</strong> Créez plusieurs taux pour un même pays (ex: France 20%, 10%, 5.5%, 2.1%).
            </Alert>
          </div>
        </Modal>

        {/* CONFIRMATION SUPPRESSION TVA */}
        <ConfirmDialog
          open={!!confirmDeleteTva}
          onClose={() => setConfirmDeleteTva(null)}
          onConfirm={handleDeleteTvaConfirm}
          title="Supprimer ce taux de TVA ?"
          description={
            confirmDeleteTva ? (
              <>
                Le taux <strong className="text-slate-700 dark:text-slate-200">{confirmDeleteTva.name} ({confirmDeleteTva.rate}%)</strong> sera supprimé de votre liste.
              </>
            ) : null
          }
          confirmLabel="Supprimer"
          cancelLabel="Annuler"
          tone="danger"
        />
      </div>
    </Sidebar>
  );
}