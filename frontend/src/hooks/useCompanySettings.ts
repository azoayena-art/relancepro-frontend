// src/hooks/useCompanySettings.ts
import { useState, useEffect, useRef, useMemo } from 'react';
import { databases, DATABASE_ID } from '../appwrite';
import { useAuth } from '../context/AuthContext';
import { Query } from 'appwrite';

// ============================================================
// 🌍 CONFIGURATION DEVISES SUPPORTÉES
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

// ============================================================
// 🏢 INTERFACE DES PARAMÈTRES ENTREPRISE
// ============================================================
export interface CompanySettings {
  $id: string;
  teamId: string;
  userId: string;
  name: string;
  legalForm?: string;
  address?: string;
  siret?: string;
  rcs?: string;
  tvaNumber?: string;
  phone?: string;
  email?: string;
  defaultTvaRate?: string;
  logoFileId?: string;
  publicSlug?: string;
  currency: string;
  tvaRates?: string;
}

// ============================================================
// 🔧 HELPERS STANDALONE (utilisables sans le hook)
// ============================================================

/**
 * Récupère la config d'une devise par son code
 */
export const getCurrencyConfig = (code: string): Currency => {
  return SUPPORTED_CURRENCIES.find(c => c.code === code) || SUPPORTED_CURRENCIES[0];
};

/**
 * Formate un montant selon une devise
 * @param amount - Montant numérique
 * @param currencyCode - Code devise (ex: 'EUR', 'USD'). Par défaut 'EUR'
 */
export const formatMoney = (amount: number, currencyCode: string = 'EUR'): string => {
  const currency = getCurrencyConfig(currencyCode);
  const amountNum = Number(amount) || 0;
  try {
    return new Intl.NumberFormat(currency.locale, {
      style: 'currency',
      currency: currency.code,
      maximumFractionDigits: ['JPY', 'XOF', 'XAF', 'KRW', 'VND'].includes(currency.code) ? 0 : 2,
    }).format(amountNum);
  } catch {
    return `${amountNum.toFixed(2)} ${currency.symbol}`;
  }
};

/**
 * Formate un montant court (sans décimales pour les grands nombres)
 * Exemple : 1234.56 → "1,2 K€"
 */
export const formatMoneyShort = (amount: number, currencyCode: string = 'EUR'): string => {
  const currency = getCurrencyConfig(currencyCode);
  const absAmount = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  
  if (absAmount >= 1000000) {
    return `${sign}${(absAmount / 1000000).toFixed(1)} M${currency.symbol}`;
  }
  if (absAmount >= 1000) {
    return `${sign}${(absAmount / 1000).toFixed(1)} K${currency.symbol}`;
  }
  return formatMoney(amount, currencyCode);
};

// ============================================================
// 🪝 HOOK PRINCIPAL : useCompanySettings
// ============================================================

// Cache global pour éviter de recharger à chaque render/mount
let settingsCache: CompanySettings | null = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 30000; // 30 secondes

export const useCompanySettings = () => {
  const { user } = useAuth();
  const [settings, setSettings] = useState<CompanySettings | null>(settingsCache);
  const [loading, setLoading] = useState(!settingsCache);
  const loadingRef = useRef(false);

  useEffect(() => {
    if (!user) {
      setSettings(null);
      setLoading(false);
      return;
    }

    // Utiliser le cache si valide
    const now = Date.now();
    if (settingsCache && (now - cacheTimestamp) < CACHE_DURATION) {
      setSettings(settingsCache);
      setLoading(false);
      return;
    }

    // Éviter les appels multiples simultanés
    if (loadingRef.current) return;
    loadingRef.current = true;

    loadSettings();
  }, [user]);

  const loadSettings = async () => {
    if (!user) return;
    try {
      setLoading(true);
      
      // Récupération du teamId
      let teamId: string | null = null;
      const teamsRes = await databases.listDocuments(
        DATABASE_ID, 
        'teams', 
        [Query.equal('ownerId', user.$id)]
      );
      if (teamsRes.documents.length > 0) {
        teamId = teamsRes.documents[0].$id;
      } else {
        const membersRes = await databases.listDocuments(
          DATABASE_ID, 
          'team_members', 
          [Query.equal('userId', user.$id)]
        );
        if (membersRes.documents.length > 0) {
          teamId = membersRes.documents[0].teamId;
        }
      }

      if (!teamId) {
        setSettings(null);
        return;
      }

      // Chargement des paramètres
      const res = await databases.listDocuments(
        DATABASE_ID, 
        'company_settings', 
        [Query.equal('teamId', teamId), Query.limit(1)]
      );

      if (res.documents.length > 0) {
        const doc = res.documents[0] as unknown as CompanySettings;
        settingsCache = doc;
        cacheTimestamp = Date.now();
        setSettings(doc);
      } else {
        settingsCache = null;
        setSettings(null);
      }
    } catch (error) {
      console.error('❌ Erreur chargement paramètres entreprise:', error);
      setSettings(null);
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  };

  /**
   * Force le rechargement des paramètres (après sauvegarde par exemple)
   */
  const refresh = async () => {
    settingsCache = null;
    cacheTimestamp = 0;
    loadingRef.current = false;
    await loadSettings();
  };

  // ✅ Valeurs dérivées calculées avec useMemo
  const currency = settings?.currency || 'EUR';
  const currencyConfig = useMemo(() => getCurrencyConfig(currency), [currency]);

  // ✅ Helpers liés à la devise courante
  const fm = (amount: number) => formatMoney(amount, currency);
  const fmShort = (amount: number) => formatMoneyShort(amount, currency);

  // ✅ TVA rates parsés
  const tvaRates = useMemo(() => {
    try {
      if (settings?.tvaRates) {
        const parsed = JSON.parse(settings.tvaRates);
        return Array.isArray(parsed) ? parsed : [];
      }
    } catch { /* fallback */ }
    return [];
  }, [settings?.tvaRates]);

  // ✅ Détection franchise en base
  const isSubjectToVAT = useMemo(() => {
    const tva = (settings?.tvaNumber || '').toLowerCase();
    return !!tva && !tva.includes('non applicable');
  }, [settings?.tvaNumber]);

  return {
    // Données brutes
    settings,
    loading,
    refresh,

    // Devise
    currency,
    currencyConfig,
    fm,
    fmShort,
    formatMoney: fm, // alias

    // TVA
    tvaRates,
    isSubjectToVAT,
    defaultTvaRate: settings?.defaultTvaRate || '20',

    // Entreprise
    companyName: settings?.name || '',
    companyAddress: settings?.address || '',
    companySiret: settings?.siret || '',
    companyTvaNumber: settings?.tvaNumber || '',
    companyEmail: settings?.email || '',
    companyPhone: settings?.phone || '',
    logoFileId: settings?.logoFileId || '',
  };
};

export default useCompanySettings;