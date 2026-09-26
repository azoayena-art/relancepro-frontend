import Sidebar from '../components/Sidebar';
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { databases, DATABASE_ID, storage } from '../appwrite';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { getFilePreviewUrl } from '../utils/storage';
import { Building2, Save, AlertCircle, CheckCircle2, Upload, Image as ImageIcon, X, Copy, Lock, Plus, Trash2, Globe, Coins } from 'lucide-react';
import { ID, Query, Permission, Role } from 'appwrite';

// ============================================================
// 🌍 CONFIGURATION DEVISES (exportée pour usage dans toute l'app)
// ============================================================
export interface Currency {
  code: string;
  symbol: string;
  name: string;
  locale: string;
}

export const SUPPORTED_CURRENCIES: Currency[] = [
  { code: 'EUR', symbol: '€',    name: 'Euro (€)',                   locale: 'fr-FR' },
  { code: 'XOF', symbol: 'FCFA', name: 'Franc CFA BCEAO (FCFA)',     locale: 'fr-FR' },
  { code: 'XAF', symbol: 'FCFA', name: 'Franc CFA BEAC (FCFA)',      locale: 'fr-FR' },
  { code: 'USD', symbol: '$',    name: 'Dollar US ($)',              locale: 'en-US' },
  { code: 'GBP', symbol: '£',    name: 'Livre sterling (£)',         locale: 'en-GB' },
  { code: 'CAD', symbol: '$CA',  name: 'Dollar canadien ($CA)',      locale: 'fr-CA' },
  { code: 'CHF', symbol: 'CHF',  name: 'Franc suisse (CHF)',         locale: 'de-CH' },
  { code: 'MAD', symbol: 'DH',   name: 'Dirham marocain (DH)',       locale: 'fr-MA' },
  { code: 'TND', symbol: 'DT',   name: 'Dinar tunisien (DT)',        locale: 'ar-TN' },
  { code: 'DZD', symbol: 'DA',   name: 'Dinar algérien (DA)',        locale: 'ar-DZ' },
  { code: 'JPY', symbol: '¥',    name: 'Yen japonais (¥)',           locale: 'ja-JP' },
  { code: 'CNY', symbol: '¥',    name: 'Yuan chinois (¥)',           locale: 'zh-CN' },
  { code: 'INR', symbol: '₹',    name: 'Roupie indienne (₹)',        locale: 'hi-IN' },
  { code: 'BRL', symbol: 'R$',   name: 'Réal brésilien (R$)',        locale: 'pt-BR' },
  { code: 'MXN', symbol: '$MX',  name: 'Peso mexicain ($MX)',        locale: 'es-MX' },
  { code: 'AUD', symbol: '$AU',  name: 'Dollar australien ($AU)',    locale: 'en-AU' },
  { code: 'TRY', symbol: '₺',    name: 'Livre turque (₺)',           locale: 'tr-TR' },
  { code: 'PLN', symbol: 'zł',   name: 'Zloty polonais (zł)',        locale: 'pl-PL' },
  { code: 'SEK', symbol: 'kr',   name: 'Couronne suédoise (kr)',     locale: 'sv-SE' },
  { code: 'NOK', symbol: 'kr',   name: 'Couronne norvégienne (kr)',  locale: 'nb-NO' },
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
// COMPOSANT PRINCIPAL
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

  const [formData, setFormData] = useState({
    name: '', legalForm: 'Entreprise Individuelle', address: '', siret: '', rcs: '',
    tvaNumber: 'TVA non applicable, art. 293 B du CGI', phone: '', email: '',
    defaultTvaRate: '20', logoFileId: '', publicSlug: '',
    currency: 'EUR'
  });

  const [customTvaRates, setCustomTvaRates] = useState<TvaRate[]>(DEFAULT_TVA_RATES);
  const [showAddTvaModal, setShowAddTvaModal] = useState(false);
  const [editingTvaId, setEditingTvaId] = useState<string | null>(null);
  const [newTva, setNewTva] = useState<{ name: string; rate: string; country: string }>({ name: '', rate: '', country: 'FR' });

  const [logoPreview, setLogoPreview] = useState<string>('');

  useEffect(() => {
    if (!permLoading && !hasPermission('settings.view')) {
      navigate('/dashboard');
    }
  }, [permLoading, hasPermission, navigate]);

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    loadSettings();
  }, [user]);

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

      let response = await databases.listDocuments(DATABASE_ID, 'company_settings', [Query.equal('teamId', teamId)]);
      if (response.documents.length === 0) {
        response = await databases.listDocuments(DATABASE_ID, 'company_settings', [Query.equal('userId', user.$id)]);
      }
      const myDoc = response.documents[0];

      if (myDoc) {
        if (myDoc.teamId && myDoc.teamId !== teamId) {
          setExistingDocId(null);
          setFormData({ name: '', legalForm: 'Entreprise Individuelle', address: '', siret: '', rcs: '', tvaNumber: 'TVA non applicable, art. 293 B du CGI', phone: '', email: '', defaultTvaRate: '20', logoFileId: '', publicSlug: '', currency: 'EUR' });
          setLogoPreview('');
          setCustomTvaRates(DEFAULT_TVA_RATES);
        } else {
          setExistingDocId(myDoc.$id);
          setFormData({
            name: myDoc.name || '', legalForm: myDoc.legalForm || 'Entreprise Individuelle',
            address: myDoc.address || '', siret: myDoc.siret || '', rcs: myDoc.rcs || '',
            tvaNumber: myDoc.tvaNumber || 'TVA non applicable, art. 293 B du CGI',
            phone: myDoc.phone || '', email: myDoc.email || '', defaultTvaRate: myDoc.defaultTvaRate || '20',
            logoFileId: myDoc.logoFileId || '', publicSlug: myDoc.publicSlug || '',
            currency: myDoc.currency || 'EUR'
          });
          if (myDoc.logoFileId) {
            try { setLogoPreview(getFilePreviewUrl('company_logos', myDoc.logoFileId)); } catch (e) { setLogoPreview(''); }
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
        setFormData({ name: '', legalForm: 'Entreprise Individuelle', address: '', siret: '', rcs: '', tvaNumber: 'TVA non applicable, art. 293 B du CGI', phone: '', email: '', defaultTvaRate: '20', logoFileId: '', publicSlug: '', currency: 'EUR' });
        setLogoPreview('');
        setCustomTvaRates(DEFAULT_TVA_RATES);
      }
    } catch (err) { console.error('Erreur chargement:', err); } finally { setLoading(false); }
  };

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
      setSuccess('Logo téléchargé ! N\'oubliez pas d\'enregistrer.');
      setTimeout(() => setSuccess(''), 4000);
    } catch (err: any) { setError(err.message); setLogoPreview(''); } finally { setUploading(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
  };

  const handleRemoveLogo = async () => {
    try { if (formData.logoFileId) await storage.deleteFile('company_logos', formData.logoFileId); setFormData(p => ({...p, logoFileId: ''})); setLogoPreview(''); } catch(e){}
  };

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
    if (!newTva.name.trim()) { setError('Veuillez saisir un nom pour ce taux.'); return; }
    if (isNaN(rate) || rate < 0 || rate > 100) { setError('Le taux doit être compris entre 0 et 100.'); return; }
    if (editingTvaId) {
      setCustomTvaRates(prev => prev.map(t => t.id === editingTvaId ? { ...t, name: newTva.name.trim(), rate, country: newTva.country } : t));
    } else {
      setCustomTvaRates(prev => [...prev, { id: `tva-${Date.now()}`, name: newTva.name.trim(), rate, country: newTva.country }]);
    }
    setShowAddTvaModal(false);
    setEditingTvaId(null);
    setNewTva({ name: '', rate: '', country: 'FR' });
    setSuccess('Taux de TVA mis à jour ! N\'oubliez pas d\'enregistrer.');
    setTimeout(() => setSuccess(''), 3000);
  };

  const handleDeleteTva = (id: string) => {
    if (customTvaRates.length <= 1) { setError('Vous devez conserver au moins un taux de TVA.'); return; }
    if (!confirm('Supprimer ce taux de TVA ?')) return;
    const rateToDelete = customTvaRates.find(t => t.id === id);
    setCustomTvaRates(prev => prev.filter(t => t.id !== id));
    if (rateToDelete && formData.defaultTvaRate === rateToDelete.rate.toString()) {
      const remaining = customTvaRates.filter(t => t.id !== id);
      if (remaining.length > 0) setFormData(prev => ({ ...prev, defaultTvaRate: remaining[0].rate.toString() }));
    }
    setSuccess('Taux supprimé ! N\'oubliez pas d\'enregistrer.');
    setTimeout(() => setSuccess(''), 3000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.$id || !currentTeamId) { setError('Erreur de session ou d\'équipe.'); return; }
    setSaving(true); setError(''); setSuccess('');
    try {
      const payload = { ...formData, userId: user.$id, teamId: currentTeamId, tvaRates: JSON.stringify(customTvaRates) };
      let perms: string[] = [];
      if (user?.secureTeamId) {
        perms = [Permission.read(Role.team(user.secureTeamId)), Permission.update(Role.team(user.secureTeamId)), Permission.delete(Role.team(user.secureTeamId))];
      } else {
        perms = [Permission.read(Role.users()), Permission.update(Role.users()), Permission.delete(Role.users())];
      }
      if (existingDocId) {
        const existingDoc = await databases.getDocument(DATABASE_ID, 'company_settings', existingDocId);
        if (existingDoc.teamId && existingDoc.teamId !== currentTeamId) throw new Error('Accès refusé');
        await databases.updateDocument(DATABASE_ID, 'company_settings', existingDocId, payload);
      } else {
        await databases.createDocument(DATABASE_ID, 'company_settings', ID.unique(), payload, perms);
      }
      setSuccess('Paramètres enregistrés avec succès !');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) { setError(`Erreur: ${err.message}`); } finally { setSaving(false); }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  if (permLoading) return <Sidebar><div className="flex items-center justify-center h-full w-full"><div className="text-slate-500 dark:text-slate-400 text-lg animate-pulse">Vérification des droits...</div></div></Sidebar>;
  if (!hasPermission('settings.view')) return null;
  if (loading) return <Sidebar><div className="flex items-center justify-center h-full w-full"><div className="text-slate-500 dark:text-slate-400 text-lg animate-pulse">Chargement...</div></div></Sidebar>;

  const canEdit = hasPermission('settings.edit');
  const ratesByCountry = customTvaRates.reduce((acc, rate) => {
    const country = COUNTRIES.find(c => c.code === rate.country) || { code: rate.country, name: rate.country };
    if (!acc[country.code]) acc[country.code] = { country, rates: [] };
    acc[country.code].rates.push(rate);
    return acc;
  }, {} as Record<string, { country: typeof COUNTRIES[0]; rates: TvaRate[] }>);

  return (
    <Sidebar>
      <div className="min-h-full bg-slate-50 dark:bg-slate-900">
        <header className="bg-white dark:bg-slate-800 shadow-sm border-b border-slate-200 dark:border-slate-700 sticky top-0 z-20">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex items-center gap-3">
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Building2 size={24} className="text-purple-600" /> 
                  Mon Entreprise
                </h1>
                <p className="text-sm text-slate-500 dark:text-slate-400">Ces informations pré-rempliront automatiquement vos devis et factures.</p>
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          {!canEdit && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 px-4 py-3 rounded-lg flex items-center gap-2 mb-6">
              <Lock size={18} className="flex-shrink-0" />
              <span className="text-sm font-medium">Mode lecture seule.</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-4 sm:p-6 space-y-6">
            {success && (
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 px-4 py-3 rounded-lg flex items-center gap-2 animate-fadeIn">
                <CheckCircle2 size={18} className="flex-shrink-0" />
                <span className="text-sm font-medium">{success}</span>
              </div>
            )}
            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg flex items-center gap-2 animate-fadeIn">
                <AlertCircle size={18} className="flex-shrink-0" />
                <span className="text-sm font-medium">{error}</span>
              </div>
            )}

            {/* LOGO */}
            <div className="border-b border-slate-100 dark:border-slate-700 pb-6">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">Logo de l'entreprise <span className="text-sm font-normal text-slate-500 dark:text-slate-400">(optionnel)</span></h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Ajoutez votre logo pour qu'il apparaisse sur vos devis.</p>
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
                      {logoPreview && (
                        <button type="button" onClick={handleRemoveLogo} className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors active:scale-95">
                          <X size={16} /> Supprimer
                        </button>
                      )}
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">PNG, JPG, SVG ou WEBP • Max 5 Mo</p>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* LIEN PUBLIC */}
            <div className="border-b border-slate-100 dark:border-slate-700 pb-6">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">Lien public de demande de devis</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Partagez ce lien avec vos clients.</p>
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1 flex items-center">
                  <span className="bg-slate-100 dark:bg-slate-700 border border-r-0 border-slate-300 dark:border-slate-600 rounded-l-lg px-3 py-3 text-sm text-slate-500 dark:text-slate-400 whitespace-nowrap hidden sm:block">/demande/</span>
                  <input type="text" name="publicSlug" value={formData.publicSlug} onChange={(e) => setFormData({ ...formData, publicSlug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })} disabled={!canEdit} className={`flex-1 px-3 py-3 border border-slate-300 dark:border-slate-600 rounded-l-lg sm:rounded-l-none rounded-r-lg focus:ring-2 focus:ring-purple-500 outline-none text-sm text-slate-900 dark:text-white ${!canEdit ? 'bg-slate-50 dark:bg-slate-800 cursor-not-allowed' : 'bg-white dark:bg-slate-700'}`} placeholder="mon-entreprise" />
                </div>
                {formData.publicSlug && (
                  <button type="button" onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/demande/${formData.publicSlug}`); setSuccess('Lien copié !'); setTimeout(() => setSuccess(''), 3000); }} className="px-4 py-3 text-sm font-medium text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-800 rounded-lg hover:bg-purple-100 dark:hover:bg-purple-900/50 flex items-center justify-center gap-2 transition-colors active:scale-95">
                    <Copy size={16} /> Copier le lien
                  </button>
                )}
              </div>
            </div>

            {/* 🆕 SECTION MONNAIE */}
            <div className="border-b border-slate-100 dark:border-slate-700 pb-6">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2 mb-2">
                <Coins size={20} className="text-purple-600" />
                Monnaie
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                Devise utilisée sur vos devis, factures, reçus et exports CSV.
              </p>
              <select
                name="currency"
                value={formData.currency}
                onChange={handleChange}
                disabled={!canEdit}
                className={`w-full px-3 py-3 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none text-sm font-semibold ${!canEdit ? 'bg-slate-50 dark:bg-slate-800 cursor-not-allowed' : 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white'}`}
              >
                {SUPPORTED_CURRENCIES.map(c => (
                  <option key={c.code} value={c.code}>
                    {c.symbol} — {c.name}
                  </option>
                ))}
              </select>
              <div className="mt-3 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-3 flex flex-wrap items-center gap-3">
                <p className="text-xs text-purple-700 dark:text-purple-300 flex-1 min-w-[200px]">
                  💡 <strong>Aperçu :</strong> Un montant de <strong>1 234,56</strong> s'affichera :
                </p>
                <span className="font-mono font-bold text-lg text-purple-900 dark:text-purple-100">
                  {formatMoney(1234.56, formData.currency)}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {SUPPORTED_CURRENCIES.slice(0, 5).map(c => (
                  <span key={c.code} className="text-xs px-2 py-1 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-mono">
                    {c.symbol} = {formatMoney(100, c.code)}
                  </span>
                ))}
              </div>
            </div>

            {/* TVA MULTI-PAYS */}
            <div className="border-b border-slate-100 dark:border-slate-700 pb-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                    <Globe size={20} className="text-purple-600" />
                    Taux de TVA par pays
                  </h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                    Définissez vos taux de TVA pour chaque pays où vous facturez.
                  </p>
                </div>
                {canEdit && (
                  <button type="button" onClick={() => openAddTvaModal()} className="flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors active:scale-95">
                    <Plus size={16} /> Ajouter un taux
                  </button>
                )}
              </div>

              <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-4 mb-4">
                <label className="block text-sm font-semibold text-purple-900 dark:text-purple-200 mb-2">
                  ⭐ Taux de TVA par défaut
                </label>
                <select name="defaultTvaRate" value={formData.defaultTvaRate} onChange={handleChange} disabled={!canEdit} className={`w-full px-3 py-3 border border-purple-300 dark:border-purple-700 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none text-sm font-semibold ${!canEdit ? 'bg-purple-50/50 dark:bg-purple-900/10 cursor-not-allowed' : 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white'}`}>
                  {customTvaRates.map(rate => {
                    const country = COUNTRIES.find(c => c.code === rate.country);
                    return <option key={rate.id} value={rate.rate.toString()}>{rate.name} — {rate.rate}% {country ? `(${country.name})` : ''}</option>;
                  })}
                </select>
              </div>

              <div className="space-y-4">
                {Object.values(ratesByCountry).map(({ country, rates }) => (
                  <div key={country.code} className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                    <div className="bg-slate-50 dark:bg-slate-900/50 px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-700 dark:text-slate-300">{country.name}</span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">({rates.length} taux)</span>
                    </div>
                    <div className="divide-y divide-slate-100 dark:divide-slate-700">
                      {rates.map(rate => (
                        <div key={rate.id} className="px-4 py-3 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-slate-900 dark:text-white">{rate.name}</span>
                              <span className={`text-sm font-bold ${formData.defaultTvaRate === rate.rate.toString() ? 'text-purple-600 dark:text-purple-400' : 'text-slate-600 dark:text-slate-300'}`}>{rate.rate}%</span>
                              {formData.defaultTvaRate === rate.rate.toString() && <span className="text-[10px] font-semibold bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 px-2 py-0.5 rounded-full">PAR DÉFAUT</span>}
                            </div>
                          </div>
                          {canEdit && (
                            <div className="flex gap-1 ml-2">
                              <button type="button" onClick={() => openAddTvaModal(rate)} className="p-2 text-slate-400 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/30 rounded-lg transition-colors" title="Modifier">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                              </button>
                              {customTvaRates.length > 1 && (
                                <button type="button" onClick={() => handleDeleteTva(rate.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors" title="Supprimer">
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
            </div>

            {/* INFOS GÉNÉRALES */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
              <div className="md:col-span-2"><h3 className="text-lg font-semibold text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-700 pb-2 mb-4">Informations générales</h3></div>
              
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Nom de l'entreprise *</label>
                <input type="text" name="name" required value={formData.name} onChange={handleChange} disabled={!canEdit} className={`w-full px-3 py-3 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none text-sm text-slate-900 dark:text-white ${!canEdit ? 'bg-slate-50 dark:bg-slate-800 cursor-not-allowed' : 'bg-white dark:bg-slate-700'}`} />
              </div>
              
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Forme juridique</label>
                <select name="legalForm" value={formData.legalForm} onChange={handleChange} disabled={!canEdit} className={`w-full px-3 py-3 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none text-sm text-slate-900 dark:text-white ${!canEdit ? 'bg-slate-50 dark:bg-slate-800 cursor-not-allowed' : 'bg-white dark:bg-slate-700'}`}>
                  <option>Entreprise Individuelle</option><option>Micro-entreprise</option><option>SASU</option><option>SARL</option><option>SAS</option><option>EURL</option>
                </select>
              </div>
              
              <div className="md:col-span-2 space-y-1.5">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Adresse complète</label>
                <input type="text" name="address" value={formData.address} onChange={handleChange} disabled={!canEdit} className={`w-full px-3 py-3 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none text-sm text-slate-900 dark:text-white ${!canEdit ? 'bg-slate-50 dark:bg-slate-800 cursor-not-allowed' : 'bg-white dark:bg-slate-700'}`} />
              </div>
              
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">N° SIRET</label>
                <input type="text" name="siret" value={formData.siret} onChange={handleChange} disabled={!canEdit} className={`w-full px-3 py-3 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none text-sm text-slate-900 dark:text-white ${!canEdit ? 'bg-slate-50 dark:bg-slate-800 cursor-not-allowed' : 'bg-white dark:bg-slate-700'}`} />
              </div>
              
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">RCS / RM</label>
                <input type="text" name="rcs" value={formData.rcs} onChange={handleChange} disabled={!canEdit} className={`w-full px-3 py-3 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none text-sm text-slate-900 dark:text-white ${!canEdit ? 'bg-slate-50 dark:bg-slate-800 cursor-not-allowed' : 'bg-white dark:bg-slate-700'}`} />
              </div>
              
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">N° TVA intracommunautaire</label>
                <select name="tvaNumber" value={formData.tvaNumber.startsWith('TVA non') ? formData.tvaNumber : 'Assujetti à la TVA'} onChange={(e) => {
                  if (e.target.value === 'Assujetti à la TVA') {
                    setFormData({ ...formData, tvaNumber: 'Assujetti à la TVA' });
                  } else {
                    setFormData({ ...formData, tvaNumber: e.target.value });
                  }
                }} disabled={!canEdit} className={`w-full px-3 py-3 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none text-sm text-slate-900 dark:text-white ${!canEdit ? 'bg-slate-50 dark:bg-slate-800 cursor-not-allowed' : 'bg-white dark:bg-slate-700'}`}>
                  <option value="TVA non applicable, art. 293 B du CGI">TVA non applicable (micro-entreprise)</option>
                  <option value="Assujetti à la TVA">Assujetti à la TVA (saisir le numéro ci-dessous)</option>
                </select>
                {formData.tvaNumber !== 'TVA non applicable, art. 293 B du CGI' && (
                  <input type="text" placeholder="Ex: FR12345678901" value={formData.tvaNumber === 'Assujetti à la TVA' ? '' : formData.tvaNumber} onChange={(e) => setFormData({ ...formData, tvaNumber: e.target.value || 'Assujetti à la TVA' })} disabled={!canEdit} className={`w-full mt-2 px-3 py-3 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none text-sm text-slate-900 dark:text-white ${!canEdit ? 'bg-slate-50 dark:bg-slate-800 cursor-not-allowed' : 'bg-white dark:bg-slate-700'}`} />
                )}
              </div>
              
              <div className="md:col-span-2"><h3 className="text-lg font-semibold text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-700 pb-2 mb-4 mt-4">Coordonnées</h3></div>
              
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Téléphone</label>
                <input type="tel" name="phone" value={formData.phone} onChange={handleChange} disabled={!canEdit} className={`w-full px-3 py-3 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none text-sm text-slate-900 dark:text-white ${!canEdit ? 'bg-slate-50 dark:bg-slate-800 cursor-not-allowed' : 'bg-white dark:bg-slate-700'}`} />
              </div>
              
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Email</label>
                <input type="email" name="email" value={formData.email} onChange={handleChange} disabled={!canEdit} className={`w-full px-3 py-3 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none text-sm text-slate-900 dark:text-white ${!canEdit ? 'bg-slate-50 dark:bg-slate-800 cursor-not-allowed' : 'bg-white dark:bg-slate-700'}`} />
              </div>
            </div>

            {canEdit && (
              <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-6 border-t border-slate-100 dark:border-slate-700">
                <button type="button" onClick={() => navigate('/dashboard')} className="w-full sm:w-auto px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors active:scale-95">
                  Annuler
                </button>
                <button type="submit" disabled={saving} className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors active:scale-95">
                  {saving ? (<><svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg><span>Enregistrement...</span></>) : (<><Save size={16} /><span>Enregistrer</span></>)}
                </button>
              </div>
            )}
          </form>
        </main>

        {/* MODAL TVA */}
        {showAddTvaModal && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4 animate-fadeIn">
            <div className="bg-white dark:bg-slate-800 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md animate-slideUp">
              <div className="p-4 sm:p-6 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Globe className="text-purple-600" size={20} />
                  {editingTvaId ? 'Modifier le taux' : 'Nouveau taux de TVA'}
                </h3>
                <button onClick={() => { setShowAddTvaModal(false); setEditingTvaId(null); }} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors">
                  <X size={20} className="text-slate-500 dark:text-slate-400" />
                </button>
              </div>
              <div className="p-4 sm:p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Nom du taux *</label>
                  <input type="text" value={newTva.name} onChange={e => setNewTva({ ...newTva, name: e.target.value })} placeholder="Ex: Taux normal, Taux réduit..." className="w-full px-3 py-3 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none" autoFocus />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Taux (%) *</label>
                    <input type="number" step="0.1" min="0" max="100" value={newTva.rate} onChange={e => setNewTva({ ...newTva, rate: e.target.value })} placeholder="20" className="w-full px-3 py-3 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Pays *</label>
                    <select value={newTva.country} onChange={e => setNewTva({ ...newTva, country: e.target.value })} className="w-full px-3 py-3 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none bg-white dark:bg-slate-700">
                      {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
                    </select>
                  </div>
                </div>
                <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-3">
                  <p className="text-xs text-purple-700 dark:text-purple-300">
                    💡 <strong>Astuce :</strong> Créez plusieurs taux pour un même pays (ex: France 20%, 10%, 5.5%, 2.1%).
                  </p>
                </div>
              </div>
              <div className="p-4 sm:p-6 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-3 bg-slate-50 dark:bg-slate-800/90 rounded-b-2xl">
                <button onClick={() => { setShowAddTvaModal(false); setEditingTvaId(null); }} className="flex-1 px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600 active:scale-95 transition-all">Annuler</button>
                <button onClick={handleSaveTva} disabled={!newTva.name.trim() || !newTva.rate} className="flex-1 px-4 py-3 text-sm font-semibold text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-50 active:scale-95 transition-all">{editingTvaId ? 'Modifier' : 'Ajouter'}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Sidebar>
  );
}