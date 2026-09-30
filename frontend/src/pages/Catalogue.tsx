import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { databases, DATABASE_ID } from '../appwrite';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { useCompanySettings } from '../hooks/useCompanySettings';
import { Toaster, toast } from 'sonner';
import Sidebar from '../components/Sidebar';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import {
  Plus, Search, Edit2, X, Package, Filter, Archive, RotateCcw, Tag, DollarSign, Percent, Upload, FileSpreadsheet, AlertCircle, CheckCircle2, Download, Settings, Trash2
} from 'lucide-react';
import { Query, ID, Permission, Role } from 'appwrite';
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
  Card,
  SectionTitle,
  Badge,
  statusLabels,
  type Entity,
} from '../components/ui/SharedUI';

// ============================================================
// 📋 INTERFACES
// ============================================================

interface Category {
  $id: string;
  teamId: string;
  name: string;
  description?: string;
  status: string;
  $createdAt?: string;
}

interface Product {
  $id: string;
  teamId: string;
  categoryId?: string;
  reference?: string;
  name: string;
  description?: string;
  unit: string;
  unitPrice: string;
  tvaRate: string;
  status: string;
  category?: Category;
  $createdAt?: string;
}

interface CompanySettings {
  $id?: string;
  name: string;
  legalForm: string;
  address: string;
  siret: string;
  rcs: string;
  tvaNumber: string;
  phone: string;
  email: string;
  defaultTvaRate: string;
  logoFileId?: string;
  tvaRates?: string;
  customUnits?: string;
}

interface ImportedProduct {
  rowIndex: number;
  reference?: string;
  name: string;
  description?: string;
  unit: string;
  unitPrice: number;
  tvaRate: number;
  categoryName?: string;
  categoryId?: string;
  status: 'valid' | 'duplicate' | 'error';
  error?: string;
  duplicateOf?: string;
}

// ============================================================
// 🎨 CONFIGURATION
// ============================================================

const statusColors: Record<string, string> = {
  active: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  archived: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
};

const statusLabelsLocal: Record<string, string> = {
  active: 'Actif',
  archived: 'Archivé'
};

const defaultUnitOptions = ['Forfait', 'Heure', 'Jour', 'm²', 'ml', 'Unité', 'kg', 'Intervention'];
const emptyCategoryForm = { name: '', description: '', status: 'active' };
const emptyProductForm = {
  categoryId: '', reference: '', name: '', description: '',
  unit: 'Forfait', unitPrice: '', tvaRate: '20', status: 'active'
};

// ⚙️ Pagination
const ITEMS_PER_PAGE = 20;

// ============================================================
// 🛠️ HELPERS
// ============================================================

const normalizeString = (str: string): string => {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .trim();
};

const parseFrenchNumber = (str: string | number): number => {
  if (typeof str === 'number') return str;
  if (!str) return 0;
  const cleaned = String(str)
    .replace(/\s/g, '')
    .replace(/,/g, '.')
    .replace(/[^\d.-]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
};

// ============================================================
// 🎯 COMPOSANT PRINCIPAL
// ============================================================

export default function Catalogue() {
  const { user } = useAuth();
  const { hasPermission, loading: permLoading } = usePermissions();
  const navigate = useNavigate();
  const { fm: fmCurrency, currencyConfig } = useCompanySettings();
  const SYM = currencyConfig?.symbol || '€';

  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentTeamId, setCurrentTeamId] = useState<string | null>(null);
  const [mainTab, setMainTab] = useState<'products' | 'categories'>('products');
  const [viewMode, setViewMode] = useState<'active' | 'archived'>('active');
  
  // Modals
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [categoryForm, setCategoryForm] = useState(emptyCategoryForm);
  const [savingCategory, setSavingCategory] = useState(false);
  const [showProductModal, setShowProductModal] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [productForm, setProductForm] = useState(emptyProductForm);
  const [savingProduct, setSavingProduct] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importStep, setImportStep] = useState<'upload' | 'preview' | 'importing' | 'done'>('upload');
  const [importedProducts, setImportedProducts] = useState<ImportedProduct[]>([]);
  const [importStats, setImportStats] = useState({ total: 0, valid: 0, duplicates: 0, errors: 0 });
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState({ success: 0, failed: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Filtres
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  
  // ✅ PAGINATION
  const [productsPage, setProductsPage] = useState(1);
  const [categoriesPage, setCategoriesPage] = useState(1);

  // Units
  const [showUnitsModal, setShowUnitsModal] = useState(false);
  const [unitsList, setUnitsList] = useState<string[]>([]);
  const [newUnit, setNewUnit] = useState('');
  const [editingUnitIndex, setEditingUnitIndex] = useState<number | null>(null);
  const [editingUnitValue, setEditingUnitValue] = useState('');
  const [savingUnits, setSavingUnits] = useState(false);

  const tvaOptions = useMemo(() => {
    try {
      const raw = (companySettings as any)?.tvaRates;
      if (raw) {
        const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (Array.isArray(arr) && arr.length > 0) {
          return arr.map((r: any) => ({
            value: String(r.rate),
            label: `${r.rate}%${r.name ? ` — ${r.name}` : ''}${r.country ? ` (${r.country})` : ''}`
          }));
        }
      }
    } catch { /* fallback */ }
    return [
      { value: '20', label: '20% — Taux normal (France)' },
      { value: '10', label: '10% — Taux intermédiaire' },
      { value: '5.5', label: '5.5% — Taux réduit' },
      { value: '2.1', label: '2.1% — Taux super-réduit' },
      { value: '0', label: '0% — Exonéré' }
    ];
  }, [companySettings]);

  const activeUnits = useMemo(() => {
    try {
      const raw = (companySettings as any)?.customUnits;
      if (raw) {
        const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (Array.isArray(arr) && arr.length > 0) return arr;
      }
    } catch {}
    return defaultUnitOptions;
  }, [companySettings]);

  // ============================================================
  // 📥 CHARGEMENT
  // ============================================================

  useEffect(() => {
    if (!permLoading && !hasPermission('products.view')) navigate('/dashboard');
  }, [permLoading, hasPermission, navigate]);

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    loadData();
  }, [user]);

  const loadData = async () => {
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

      const [catRes, prodRes, settingsRes] = await Promise.all([
        databases.listDocuments(DATABASE_ID, 'categories', [Query.equal('teamId', teamId), Query.orderDesc('$createdAt'), Query.limit(2000)]),
        databases.listDocuments(DATABASE_ID, 'products', [Query.equal('teamId', teamId), Query.orderDesc('$createdAt'), Query.limit(2000)]),
        databases.listDocuments(DATABASE_ID, 'company_settings', [Query.equal('userId', user.$id), Query.limit(1)]).catch(() => ({ documents: [] }))
      ]);

      const cats = catRes.documents as unknown as Category[];
      const prods = prodRes.documents as unknown as Product[];
      const prodsWithCategory = prods.map(p => ({
        ...p, category: cats.find(c => c.$id === p.categoryId) || undefined
      }));

      if (settingsRes.documents.length > 0) {
        setCompanySettings(settingsRes.documents[0] as unknown as CompanySettings);
      }
      setCategories(cats);
      setProducts(prodsWithCategory);
    } catch (error) {
      console.error('Erreur chargement catalogue:', error);
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // ⚙️ UNITÉS
  // ============================================================

  const handleOpenUnitsModal = () => {
    let currentUnits: string[] = [];
    try {
      const raw = (companySettings as any)?.customUnits;
      if (raw) {
        currentUnits = typeof raw === 'string' ? JSON.parse(raw) : raw;
      }
    } catch {}
    if (!Array.isArray(currentUnits) || currentUnits.length === 0) {
      currentUnits = [...defaultUnitOptions];
    }
    setUnitsList(currentUnits);
    setNewUnit('');
    setEditingUnitIndex(null);
    setShowUnitsModal(true);
  };

  const handleAddUnit = () => {
    const trimmed = newUnit.trim();
    if (!trimmed) return;
    if (unitsList.some(u => u.toLowerCase() === trimmed.toLowerCase())) {
      toast.error('Cette unité existe déjà.');
      return;
    }
    setUnitsList([...unitsList, trimmed]);
    setNewUnit('');
    toast.success(`Unité "${trimmed}" ajoutée.`, { duration: 2000 });
  };

  const handleSaveEditUnit = () => {
    if (editingUnitIndex === null) return;
    const trimmed = editingUnitValue.trim();
    if (!trimmed) return;
    if (unitsList.some((u, i) => i !== editingUnitIndex && u.toLowerCase() === trimmed.toLowerCase())) {
      toast.error('Cette unité existe déjà.');
      return;
    }
    const newList = [...unitsList];
    newList[editingUnitIndex] = trimmed;
    setUnitsList(newList);
    setEditingUnitIndex(null);
  };

  const handleDeleteUnit = (idx: number, unit: string) => {
    const usedBy = products.filter(p => p.unit === unit && p.status !== 'archived');
    if (usedBy.length > 0) {
      if (!confirm(`⚠️ L'unité "${unit}" est utilisée par ${usedBy.length} produit(s) actif(s).\n\nVoulez-vous vraiment la supprimer ? Les produits concernés conserveront l'ancienne valeur mais elle ne sera plus proposée dans la liste.`)) return;
    } else {
      if (!confirm(`Supprimer l'unité "${unit}" ?`)) return;
    }
    setUnitsList(unitsList.filter((_, i) => i !== idx));
    toast.info(`Unité "${unit}" supprimée.`, { duration: 2000 });
  };

  const handleSaveUnits = async () => {
    setSavingUnits(true);
    try {
      let perms: string[] = [];
      if (user?.secureTeamId) {
        perms = [Permission.read(Role.team(user.secureTeamId)), Permission.update(Role.team(user.secureTeamId)), Permission.delete(Role.team(user.secureTeamId))];
      } else {
        perms = [Permission.read(Role.users()), Permission.update(Role.users()), Permission.delete(Role.users())];
      }
      const dataToSave = { customUnits: JSON.stringify(unitsList) };
      if (companySettings && (companySettings as any).$id) {
        await databases.updateDocument(DATABASE_ID, 'company_settings', (companySettings as any).$id, dataToSave);
        setCompanySettings(prev => prev ? { ...prev, customUnits: JSON.stringify(unitsList) } : prev);
      } else {
        const created = await databases.createDocument(DATABASE_ID, 'company_settings', ID.unique(), {
          userId: user.$id, teamId: currentTeamId || '',
          name: '', legalForm: '', address: '', siret: '', rcs: '', tvaNumber: '', phone: '', email: '', defaultTvaRate: '20',
          ...dataToSave
        }, perms);
        setCompanySettings(prev => prev ? { ...prev, $id: created.$id, customUnits: JSON.stringify(unitsList) } : { $id: created.$id, customUnits: JSON.stringify(unitsList) } as any);
      }
      setShowUnitsModal(false);
      toast.success('Unités enregistrées avec succès !');
    } catch (e: any) {
      toast.error(`Erreur lors de l'enregistrement : ${e.message}`);
    } finally {
      setSavingUnits(false);
    }
  };

  // ============================================================
  // 📥 IMPORT
  // ============================================================

  const handleOpenImport = () => {
    setImportStep('upload');
    setImportedProducts([]);
    setImportStats({ total: 0, valid: 0, duplicates: 0, errors: 0 });
    setImportResult({ success: 0, failed: 0 });
    setShowImportModal(true);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fileName = file.name.toLowerCase();
    let rows: any[] = [];
    try {
      if (fileName.endsWith('.csv')) {
        const text = await file.text();
        const result = Papa.parse(text, { header: true, skipEmptyLines: true, transformHeader: (h: string) => h.trim().toLowerCase() });
        rows = result.data as any[];
      } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(sheet, { defval: '' }) as any[];
        rows = jsonData.map(row => {
          const normalized: any = {};
          Object.keys(row).forEach(key => { normalized[key.trim().toLowerCase()] = row[key]; });
          return normalized;
        });
      } else {
        toast.error('Format non supporté. Veuillez utiliser un fichier CSV ou Excel (.xlsx).');
        return;
      }
      if (rows.length === 0) {
        toast.error('Le fichier est vide ou ne contient pas de données valides.');
        return;
      }
      analyzeImportedData(rows);
    } catch (error: any) {
      console.error('Erreur parsing fichier:', error);
      toast.error(`Erreur lors de la lecture du fichier : ${error.message}`);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const analyzeImportedData = (rows: any[]) => {
    const analyzed: ImportedProduct[] = [];
    let validCount = 0, duplicateCount = 0, errorCount = 0;
    const validTvaRates = tvaOptions.map(o => parseFloat(o.value));

    rows.forEach((row, index) => {
      const rowIndex = index + 2;
      const name = row['désignation'] || row['designation'] || row['nom'] || row['name'] || '';
      const reference = row['référence'] || row['reference'] || row['ref'] || '';
      const description = row['description'] || row['desc'] || '';
      const unit = row['unité'] || row['unite'] || row['unit'] || 'Forfait';
      const priceStr = row['prix'] || row['price'] || row['prix unitaire'] || row['prix ht'] || '';
      const tvaStr = row['tva'] || row['tva rate'] || row['taux tva'] || companySettings?.defaultTvaRate || '20';
      const categoryName = row['catégorie'] || row['categorie'] || row['category'] || '';

      const errors: string[] = [];
      if (!name || name.toString().trim() === '') errors.push('Désignation manquante');
      const price = parseFrenchNumber(priceStr);
      if (price <= 0) errors.push('Prix invalide (doit être > 0)');
      const normalizedUnit = normalizeUnit(unit.toString());
      const tvaRate = parseFrenchNumber(tvaStr);
      const normalizedTva = validTvaRates.reduce((prev, curr) => 
        Math.abs(curr - tvaRate) < Math.abs(prev - tvaRate) ? curr : prev
      );

      let status: 'valid' | 'duplicate' | 'error' = 'valid';
      let error = '', duplicateOf = '';

      if (errors.length > 0) {
        status = 'error';
        error = errors.join(', ');
        errorCount++;
      } else {
        const normalizedName = normalizeString(name.toString());
        const normalizedRef = reference ? reference.toString().trim().toLowerCase() : '';
        const duplicateInFile = analyzed.find(p => {
          if (p.status !== 'valid') return false;
          if (normalizedRef && p.reference && p.reference.toLowerCase().trim() === normalizedRef) return true;
          return normalizeString(p.name) === normalizedName;
        });
        if (duplicateInFile) {
          status = 'duplicate';
          duplicateOf = `Ligne ${duplicateInFile.rowIndex}`;
          duplicateCount++;
        } else {
          const duplicateInDb = products.find(p => {
            if (p.status === 'archived') return false;
            if (normalizedRef && p.reference && p.reference.toLowerCase().trim() === normalizedRef) return true;
            return normalizeString(p.name) === normalizedName;
          });
          if (duplicateInDb) {
            status = 'duplicate';
            duplicateOf = `Existant : ${duplicateInDb.name}`;
            duplicateCount++;
          } else {
            const normalizedCatName = normalizeString(categoryName.toString());
            const matchedCategory = categories.find(c => normalizeString(c.name) === normalizedCatName);
            validCount++;
            analyzed.push({
              rowIndex, reference: reference.toString(), name: name.toString().trim(),
              description: description.toString(), unit: normalizedUnit, unitPrice: price,
              tvaRate: normalizedTva, categoryName: categoryName.toString(),
              categoryId: matchedCategory?.$id || '', status: 'valid'
            });
            return;
          }
        }
      }
      analyzed.push({
        rowIndex, reference: reference.toString(), name: name.toString().trim(),
        description: description.toString(), unit: normalizedUnit, unitPrice: price || 0,
        tvaRate: normalizedTva, categoryName: categoryName.toString(), categoryId: '',
        status, error, duplicateOf
      });
    });

    setImportedProducts(analyzed);
    setImportStats({ total: rows.length, valid: validCount, duplicates: duplicateCount, errors: errorCount });
    setImportStep('preview');
  };

  const normalizeUnit = (unit: string): string => {
    const u = unit.toLowerCase().trim();
    const exactMatch = activeUnits.find(au => au.toLowerCase().trim() === u);
    if (exactMatch) return exactMatch;
    const aliases: Record<string, string> = {
      'forfait': 'Forfait', 'forf': 'Forfait', 'flat': 'Forfait',
      'heure': 'Heure', 'h': 'Heure', 'hour': 'Heure', 'heures': 'Heure',
      'jour': 'Jour', 'j': 'Jour', 'day': 'Jour', 'jours': 'Jour',
      'm²': 'm²', 'm2': 'm²', 'mètre carré': 'm²', 'sqm': 'm²',
      'ml': 'ml', 'mètre linéaire': 'ml', 'm l': 'ml',
      'unité': 'Unité', 'unite': 'Unité', 'u': 'Unité', 'unit': 'Unité', 'pcs': 'Unité',
      'kg': 'kg', 'kilogramme': 'kg',
      'intervention': 'Intervention', 'interv': 'Intervention'
    };
    const mapped = aliases[u];
    if (mapped) {
      const found = activeUnits.find(au => au.toLowerCase() === mapped.toLowerCase());
      if (found) return found;
      return mapped;
    }
    return unit.trim() || activeUnits[0] || 'Forfait';
  };

  const handleConfirmImport = async () => {
    if (!currentTeamId) return;
    const validProducts = importedProducts.filter(p => p.status === 'valid');
    if (validProducts.length === 0) { toast.warning('Aucun produit valide à importer.'); return; }
    if (!confirm(`Importer ${validProducts.length} produit(s) ?`)) return;
    setImporting(true);
    setImportStep('importing');

    let successCount = 0, failCount = 0;
    let perms: string[] = [];
    if (user?.secureTeamId) {
      perms = [Permission.read(Role.team(user.secureTeamId)), Permission.update(Role.team(user.secureTeamId)), Permission.delete(Role.team(user.secureTeamId))];
    } else {
      perms = [Permission.read(Role.users()), Permission.update(Role.users()), Permission.delete(Role.users())];
    }

    const batchSize = 10;
    for (let i = 0; i < validProducts.length; i += batchSize) {
      const batch = validProducts.slice(i, i + batchSize);
      const promises = batch.map(async (p) => {
        try {
          await databases.createDocument(DATABASE_ID, 'products', ID.unique(), {
            teamId: currentTeamId, categoryId: p.categoryId || '', reference: p.reference || '',
            name: p.name, description: p.description || '', unit: p.unit,
            unitPrice: p.unitPrice.toString(), tvaRate: p.tvaRate.toString(), status: 'active'
          }, perms);
          successCount++;
        } catch (e: any) {
          console.error('Erreur import produit:', p.name, e);
          failCount++;
        }
      });
      await Promise.all(promises);
    }

    setImportResult({ success: successCount, failed: failCount });
    setImportStep('done');
    await loadData();
    setImporting(false);
  };

  const handleDownloadTemplate = () => {
    const template = [
      { 'Référence': 'WC-001', 'Désignation': 'Installation WC standard', 'Description': 'Pose complète', 'Prix': '350,00', 'Unité': 'Forfait', 'TVA': '10', 'Catégorie': 'Plomberie' },
      { 'Référence': 'ELEC-001', 'Désignation': 'Installation prise électrique', 'Description': 'Pose prise 2P+T', 'Prix': '85,50', 'Unité': 'Unité', 'TVA': '10', 'Catégorie': 'Électricité' }
    ];
    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Modèle');
    XLSX.writeFile(wb, 'modele_import_catalogue.xlsx');
    toast.success('Modèle Excel téléchargé !');
  };

  // ============================================================
  // ⚙️ CATÉGORIES
  // ============================================================

  const handleOpenAddCategory = () => {
    setEditingCategoryId(null);
    setCategoryForm(emptyCategoryForm);
    setShowCategoryModal(true);
  };

  const handleOpenEditCategory = (cat: Category) => {
    if (cat.teamId !== currentTeamId) { toast.error('Accès refusé'); return; }
    setEditingCategoryId(cat.$id);
    setCategoryForm({ name: cat.name || '', description: cat.description || '', status: cat.status || 'active' });
    setShowCategoryModal(true);
  };

  const handleSaveCategory = async () => {
    if (!categoryForm.name.trim()) { toast.error('Veuillez saisir un nom.'); return; }
    if (!currentTeamId) return;
    const normalizedName = normalizeString(categoryForm.name);
    const existingCat = categories.find(c => 
      c.$id !== editingCategoryId && normalizeString(c.name) === normalizedName && c.status !== 'archived'
    );
    if (existingCat) { toast.error(`Une catégorie "${existingCat.name}" existe déjà.`); return; }

    setSavingCategory(true);
    try {
      const data = { ...categoryForm, teamId: currentTeamId };
      let perms: string[] = [];
      if (user?.secureTeamId) {
        perms = [Permission.read(Role.team(user.secureTeamId)), Permission.update(Role.team(user.secureTeamId)), Permission.delete(Role.team(user.secureTeamId))];
      } else {
        perms = [Permission.read(Role.users()), Permission.update(Role.users()), Permission.delete(Role.users())];
      }
      if (editingCategoryId) {
        const existingDoc = await databases.getDocument(DATABASE_ID, 'categories', editingCategoryId);
        if (existingDoc.teamId !== currentTeamId) { toast.error('Accès refusé'); setSavingCategory(false); return; }
        await databases.updateDocument(DATABASE_ID, 'categories', editingCategoryId, data);
        toast.success('Catégorie mise à jour !');
      } else {
        await databases.createDocument(DATABASE_ID, 'categories', ID.unique(), data, perms);
        toast.success('Catégorie créée !');
      }
      setShowCategoryModal(false);
      await loadData();
    } catch (error: any) {
      toast.error(`Erreur : ${error.message}`);
    } finally {
      setSavingCategory(false);
    }
  };

  const handleArchiveCategory = async (id: string, name: string) => {
    const linkedCount = products.filter(p => p.categoryId === id && p.status !== 'archived').length;
    if (linkedCount > 0) {
      if (!confirm(`⚠️ Cette catégorie contient ${linkedCount} produit(s) actif(s).\n\nArchiver quand même ?`)) return;
    } else {
      if (!confirm(`Archiver la catégorie "${name}" ?`)) return;
    }
    try {
      const doc = await databases.getDocument(DATABASE_ID, 'categories', id);
      if (doc.teamId !== currentTeamId) { toast.error('Accès refusé'); return; }
      await databases.updateDocument(DATABASE_ID, 'categories', id, { status: 'archived' });
      toast.success(`Catégorie "${name}" archivée.`);
      await loadData();
    } catch (error: any) { toast.error(`Erreur : ${error.message}`); }
  };

  const handleUnarchiveCategory = async (id: string, name: string) => {
    try {
      const doc = await databases.getDocument(DATABASE_ID, 'categories', id);
      if (doc.teamId !== currentTeamId) { toast.error('Accès refusé'); return; }
      await databases.updateDocument(DATABASE_ID, 'categories', id, { status: 'active' });
      toast.success(`Catégorie "${name}" désarchivée.`);
      await loadData();
      setViewMode('active');
    } catch (error: any) { toast.error(`Erreur : ${error.message}`); }
  };

  // ============================================================
  // ⚙️ PRODUITS
  // ============================================================

  const handleOpenAddProduct = () => {
    setEditingProductId(null);
    const defaultTva = companySettings?.defaultTvaRate || tvaOptions[0]?.value || '20';
    setProductForm({ ...emptyProductForm, tvaRate: defaultTva, unit: activeUnits[0] || 'Forfait' });
    setShowProductModal(true);
  };

  const handleOpenEditProduct = (prod: Product) => {
    if (prod.teamId !== currentTeamId) { toast.error('Accès refusé'); return; }
    setEditingProductId(prod.$id);
    setProductForm({
      categoryId: prod.categoryId || '', reference: prod.reference || '',
      name: prod.name || '', description: prod.description || '',
      unit: prod.unit || 'Forfait', unitPrice: prod.unitPrice || '',
      tvaRate: prod.tvaRate || '20', status: prod.status || 'active'
    });
    setShowProductModal(true);
  };

  const handleSaveProduct = async () => {
    if (!productForm.name.trim()) { toast.error('Veuillez saisir un nom.'); return; }
    const price = parseFrenchNumber(productForm.unitPrice);
    if (price <= 0) { toast.error(`Le prix unitaire doit être supérieur à 0 (${SYM}).`); return; }
    if (!currentTeamId) return;

    const normalizedName = normalizeString(productForm.name);
    const normalizedRef = productForm.reference ? productForm.reference.toLowerCase().trim() : '';
    const existingProd = products.find(p => {
      if (p.$id === editingProductId || p.status === 'archived') return false;
      if (normalizedRef && p.reference && p.reference.toLowerCase().trim() === normalizedRef) return true;
      return normalizeString(p.name) === normalizedName;
    });
    if (existingProd) {
      toast.error(`Un produit similaire existe déjà : "${existingProd.name}"${existingProd.reference ? ` (Réf: ${existingProd.reference})` : ''}`);
      return;
    }

    setSavingProduct(true);
    try {
      const data = { ...productForm, teamId: currentTeamId, unitPrice: price.toString() };
      let perms: string[] = [];
      if (user?.secureTeamId) {
        perms = [Permission.read(Role.team(user.secureTeamId)), Permission.update(Role.team(user.secureTeamId)), Permission.delete(Role.team(user.secureTeamId))];
      } else {
        perms = [Permission.read(Role.users()), Permission.update(Role.users()), Permission.delete(Role.users())];
      }
      if (editingProductId) {
        const existingDoc = await databases.getDocument(DATABASE_ID, 'products', editingProductId);
        if (existingDoc.teamId !== currentTeamId) { toast.error('Accès refusé'); setSavingProduct(false); return; }
        await databases.updateDocument(DATABASE_ID, 'products', editingProductId, data);
        toast.success('Produit mis à jour !');
      } else {
        await databases.createDocument(DATABASE_ID, 'products', ID.unique(), data, perms);
        toast.success('Produit créé !');
      }
      setShowProductModal(false);
      await loadData();
    } catch (error: any) { toast.error(`Erreur : ${error.message}`); }
    finally { setSavingProduct(false); }
  };

  const handleArchiveProduct = async (id: string, name: string) => {
    if (!confirm(`Archiver le produit "${name}" ?\nIl ne sera plus proposé dans les devis.`)) return;
    try {
      const doc = await databases.getDocument(DATABASE_ID, 'products', id);
      if (doc.teamId !== currentTeamId) { toast.error('Accès refusé'); return; }
      await databases.updateDocument(DATABASE_ID, 'products', id, { status: 'archived' });
      toast.success(`Produit "${name}" archivé.`);
      await loadData();
    } catch (error: any) { toast.error(`Erreur : ${error.message}`); }
  };

  const handleUnarchiveProduct = async (id: string, name: string) => {
    try {
      const doc = await databases.getDocument(DATABASE_ID, 'products', id);
      if (doc.teamId !== currentTeamId) { toast.error('Accès refusé'); return; }
      await databases.updateDocument(DATABASE_ID, 'products', id, { status: 'active' });
      toast.success(`Produit "${name}" désarchivé.`);
      await loadData();
      setViewMode('active');
    } catch (error: any) { toast.error(`Erreur : ${error.message}`); }
  };

  // ============================================================
  // ✅ FILTRAGE ET PAGINATION
  // ============================================================

  const filteredCategories = categories.filter(c => {
    const matchSearch = search === '' || normalizeString(c.name).includes(normalizeString(search));
    const matchView = viewMode === 'active' ? c.status !== 'archived' : c.status === 'archived';
    return matchSearch && matchView;
  });

  const filteredProducts = products.filter(p => {
    const searchNorm = normalizeString(search);
    const matchSearch = search === '' ||
      normalizeString(p.name).includes(searchNorm) ||
      (p.reference && normalizeString(p.reference).includes(searchNorm)) ||
      (p.description && normalizeString(p.description).includes(searchNorm));
    const matchCategory = filterCategory === 'all' || p.categoryId === filterCategory;
    const matchView = viewMode === 'active' ? p.status !== 'archived' : p.status === 'archived';
    return matchSearch && matchCategory && matchView;
  });

  // ✅ Calcul pagination
  const productsTotalPages = Math.max(1, Math.ceil(filteredProducts.length / ITEMS_PER_PAGE));
  const categoriesTotalPages = Math.max(1, Math.ceil(filteredCategories.length / ITEMS_PER_PAGE));

  // ✅ Reset page quand filtres changent
  useEffect(() => {
    setProductsPage(1);
  }, [search, filterCategory, viewMode, mainTab]);

  useEffect(() => {
    setCategoriesPage(1);
  }, [search, viewMode, mainTab]);

  // ✅ Découpage des listes
  const productsStart = (productsPage - 1) * ITEMS_PER_PAGE;
  const productsEnd = productsStart + ITEMS_PER_PAGE;
  const paginatedProducts = filteredProducts.slice(productsStart, productsEnd);

  const categoriesStart = (categoriesPage - 1) * ITEMS_PER_PAGE;
  const categoriesEnd = categoriesStart + ITEMS_PER_PAGE;
  const paginatedCategories = filteredCategories.slice(categoriesStart, categoriesEnd);

  const fm = (price: string | number) => {
    const num = typeof price === 'number' ? price : parseFrenchNumber(price);
    return fmCurrency(num);
  };

  if (permLoading) return <Sidebar><div className="flex items-center justify-center h-full w-full"><div className="text-slate-500 dark:text-slate-400 text-lg animate-pulse">Vérification des droits...</div></div></Sidebar>;
  if (!hasPermission('products.view')) return null;

  const activeCategories = categories.filter(c => c.status !== 'archived');

  return (
    <Sidebar>
      <Toaster richColors position="top-right" closeButton toastOptions={{ style: { borderRadius: '12px' } }} />
      <div className="min-h-full bg-slate-50 dark:bg-slate-900">
        <PageHeader
          icon={Package}
          iconColor="purple"
          title="Catalogue"
          description={
            mainTab === 'products'
              ? `${filteredProducts.length} produit(s) ${viewMode === 'active' ? 'actif(s)' : 'archivé(s)'} • Prix en ${SYM}`
              : `${filteredCategories.length} catégorie(s) ${viewMode === 'active' ? 'active(s)' : 'archivée(s)'}`
          }
          action={
            viewMode === 'active' && hasPermission('products.create') ? (
              <div className="flex gap-2 w-full sm:w-auto">
                {mainTab === 'products' ? (
                  <>
                    <button onClick={handleOpenUnitsModal} className="flex items-center justify-center gap-2 bg-slate-600 text-white px-4 py-2.5 rounded-lg hover:bg-slate-700 transition-colors font-medium text-sm active:scale-95" title="Gérer les unités">
                      <Settings size={18} /> <span className="hidden sm:inline">Unités</span>
                    </button>
                    <button onClick={handleOpenImport} className="flex items-center justify-center gap-2 bg-amber-600 text-white px-4 py-2.5 rounded-lg hover:bg-amber-700 transition-colors font-medium text-sm active:scale-95">
                      <Upload size={18} /> <span className="hidden sm:inline">Importer</span>
                    </button>
                    <button onClick={handleOpenAddProduct} className="flex items-center justify-center gap-2 bg-purple-600 text-white px-4 py-2.5 rounded-lg hover:bg-purple-700 transition-colors font-medium text-sm active:scale-95">
                      <Plus size={18} /> <span>Nouveau</span>
                    </button>
                  </>
                ) : (
                  <button onClick={handleOpenAddCategory} className="flex items-center justify-center gap-2 bg-purple-600 text-white px-4 py-2.5 rounded-lg hover:bg-purple-700 transition-colors font-medium text-sm active:scale-95">
                    <Plus size={18} /> <span>Nouvelle catégorie</span>
                  </button>
                )}
              </div>
            ) : null
          }
        />

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {/* ONGLETS PRINCIPAUX */}
          <TypeTabs
            tabs={[
              { key: 'products', label: 'Produits', count: products.filter(p => p.status === (viewMode === 'active' ? 'active' : 'archived')).length },
              { key: 'categories', label: 'Catégories', count: categories.filter(c => c.status === (viewMode === 'active' ? 'active' : 'archived')).length },
            ]}
            activeTab={mainTab}
            onTabChange={(key) => { setMainTab(key as any); setViewMode('active'); }}
            color="purple"
          />

          {/* ONGLETS STATUT */}
          <ViewTabs
            active={viewMode}
            onChange={setViewMode}
            counts={{
              active: mainTab === 'products' ? products.filter(p => p.status !== 'archived').length : categories.filter(c => c.status !== 'archived').length,
              archived: mainTab === 'products' ? products.filter(p => p.status === 'archived').length : categories.filter(c => c.status === 'archived').length
            }}
            color="purple"
          />

          {/* RECHERCHE ET FILTRES */}
          <div className="flex flex-col sm:flex-row gap-3 mb-6">
            <SearchFilter
              value={search}
              onChange={setSearch}
              placeholder={mainTab === 'products' ? 'Rechercher un produit...' : 'Rechercher une catégorie...'}
              shortcut="⌘K"
            />
            {mainTab === 'products' && viewMode === 'active' && (
              <SelectFilter
                value={filterCategory}
                onChange={setFilterCategory}
                options={activeCategories.map(cat => ({ value: cat.$id, label: cat.name }))}
                placeholder="Toutes les catégories"
              />
            )}
          </div>

          {/* CONTENU */}
          {loading ? (
            <div className="text-center py-12 text-slate-500 dark:text-slate-400 animate-pulse">Chargement...</div>
          ) : mainTab === 'categories' ? (
            filteredCategories.length === 0 ? (
              <EmptyState
                icon={Tag}
                title={`Aucune catégorie ${viewMode === 'active' ? 'active' : 'archivée'}`}
                action={
                  viewMode === 'active' && hasPermission('products.create') ? (
                    <button onClick={handleOpenAddCategory} className="inline-flex items-center gap-2 bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 text-sm mt-4 active:scale-95 transition-transform">
                      <Plus size={16} /><span>Créer une catégorie</span>
                    </button>
                  ) : null
                }
              />
            ) : (
              <>
                <DataTable headers={[
                  { label: 'Nom', align: 'left' },
                  { label: 'Description', align: 'left' },
                  { label: 'Produits liés', align: 'left' },
                  { label: 'Statut', align: 'left' },
                  { label: '', align: 'right', width: 'w-12' }
                ]}>
                  {paginatedCategories.map(cat => {
                    const linkedProducts = products.filter(p => p.categoryId === cat.$id && p.status !== 'archived').length;
                    return (
                      <tr key={cat.$id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="font-medium text-slate-900 dark:text-white flex items-center gap-2">
                            <Tag size={16} className="text-purple-500" />
                            {cat.name}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-300">{cat.description || '-'}</td>
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-purple-700 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/30 px-2 py-1 rounded">
                            <Package size={12} />
                            {linkedProducts} produit(s)
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium ${statusColors[cat.status]}`}>
                            {statusLabelsLocal[cat.status]}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {viewMode === 'active' ? (
                              <>
                                {hasPermission('products.edit') && (
                                  <button onClick={() => handleOpenEditCategory(cat)} className="p-2 text-slate-400 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/30 rounded-lg transition-colors" title="Modifier">
                                    <Edit2 size={16} />
                                  </button>
                                )}
                                {hasPermission('products.delete') && (
                                  <button onClick={() => handleArchiveCategory(cat.$id, cat.name)} className="p-2 text-slate-400 hover:text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/30 rounded-lg transition-colors" title="Archiver">
                                    <Archive size={16} />
                                  </button>
                                )}
                              </>
                            ) : (
                              <button onClick={() => handleUnarchiveCategory(cat.$id, cat.name)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/30 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/50 transition-colors">
                                <RotateCcw size={14} /><span>Désarchiver</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </DataTable>

                {/* Mobile cards */}
                <div className="md:hidden space-y-4 mt-4">
                  {paginatedCategories.map(cat => {
                    const linkedProducts = products.filter(p => p.categoryId === cat.$id && p.status !== 'archived').length;
                    return (
                      <MobileCard key={cat.$id}>
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                              <Tag size={16} className="text-purple-500" />
                              {cat.name}
                            </h3>
                            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{cat.description || 'Aucune description'}</p>
                          </div>
                          <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusColors[cat.status]}`}>
                            {statusLabelsLocal[cat.status]}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs font-semibold text-purple-700 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/30 px-2 py-1.5 rounded mb-4 w-fit">
                          <Package size={12} />
                          {linkedProducts} produit(s) lié(s)
                        </div>
                        <div className="pt-3 border-t border-slate-100 dark:border-slate-700">
                          {viewMode === 'active' ? (
                            <div className="grid grid-cols-2 gap-2">
                              {hasPermission('products.edit') && (
                                <button onClick={() => handleOpenEditCategory(cat)} className="flex items-center justify-center gap-2 p-2.5 text-purple-600 bg-purple-50 dark:bg-purple-900/30 rounded-lg active:scale-95 transition-transform">
                                  <Edit2 size={18} /><span className="text-sm font-medium">Modifier</span>
                                </button>
                              )}
                              {hasPermission('products.delete') && (
                                <button onClick={() => handleArchiveCategory(cat.$id, cat.name)} className="flex items-center justify-center gap-2 p-2.5 text-orange-600 bg-orange-50 dark:bg-orange-900/30 rounded-lg active:scale-95 transition-transform">
                                  <Archive size={18} /><span className="text-sm font-medium">Archiver</span>
                                </button>
                              )}
                            </div>
                          ) : (
                            <button onClick={() => handleUnarchiveCategory(cat.$id, cat.name)} className="w-full flex items-center justify-center gap-2 p-3 text-sm font-medium text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/30 rounded-lg active:scale-95 transition-transform">
                              <RotateCcw size={16} /><span>Désarchiver</span>
                            </button>
                          )}
                        </div>
                      </MobileCard>
                    );
                  })}
                </div>

                {/* ✅ PAGINATION CATÉGORIES */}
                <Pagination
                  currentPage={categoriesPage}
                  totalPages={categoriesTotalPages}
                  onPageChange={setCategoriesPage}
                  startItem={filteredCategories.length > 0 ? categoriesStart + 1 : 0}
                  endItem={Math.min(categoriesEnd, filteredCategories.length)}
                  totalItems={filteredCategories.length}
                  itemName="catégorie"
                />
              </>
            )
          ) : (
            filteredProducts.length === 0 ? (
              <EmptyState
                icon={Package}
                title={`Aucun produit ${viewMode === 'active' ? 'actif' : 'archivé'}`}
                description="Importez vos produits depuis un fichier Excel/CSV ou créez-les manuellement."
                action={
                  viewMode === 'active' && hasPermission('products.create') ? (
                    <div className="flex flex-col sm:flex-row gap-2 justify-center">
                      <button onClick={handleOpenImport} className="inline-flex items-center justify-center gap-2 bg-amber-600 text-white px-4 py-2.5 rounded-lg hover:bg-amber-700 text-sm active:scale-95 transition-transform">
                        <Upload size={16} /><span>Importer</span>
                      </button>
                      <button onClick={handleOpenAddProduct} className="inline-flex items-center justify-center gap-2 bg-purple-600 text-white px-4 py-2.5 rounded-lg hover:bg-purple-700 text-sm active:scale-95 transition-transform">
                        <Plus size={16} /><span>Créer un produit</span>
                      </button>
                    </div>
                  ) : null
                }
              />
            ) : (
              <>
                <DataTable headers={[
                  { label: 'Réf.', align: 'left' },
                  { label: 'Nom', align: 'left' },
                  { label: 'Catégorie', align: 'left' },
                  { label: 'Prix unitaire', align: 'left' },
                  { label: 'Unité', align: 'left' },
                  { label: 'TVA', align: 'left' },
                  { label: 'Statut', align: 'left' },
                  { label: '', align: 'right', width: 'w-12' }
                ]}>
                  {paginatedProducts.map(prod => (
                    <tr key={prod.$id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-1 text-xs font-mono font-semibold text-purple-700 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/30 px-2 py-1 rounded">
                         {prod.reference || '—'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-medium text-slate-900 dark:text-white">{prod.name}</div>
                        {prod.description && <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-1">{prod.description}</div>}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-300">
                        {prod.category ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-purple-700 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/30 px-2 py-1 rounded">
                            <Tag size={12} />
                            {prod.category.name}
                          </span>
                        ) : '-'}
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-1 text-sm font-semibold text-slate-900 dark:text-white">
                          <DollarSign size={14} className="text-green-600" />
                          {fm(prod.unitPrice)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-300">{prod.unit}</td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-1 text-sm font-medium text-slate-700 dark:text-slate-300">
                          <Percent size={14} className="text-slate-500" />
                          {prod.tvaRate}%
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium ${statusColors[prod.status]}`}>
                          {statusLabelsLocal[prod.status]}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {viewMode === 'active' ? (
                            <>
                              {hasPermission('products.edit') && (
                                <button onClick={() => handleOpenEditProduct(prod)} className="p-2 text-slate-400 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/30 rounded-lg transition-colors" title="Modifier">
                                  <Edit2 size={16} />
                                </button>
                              )}
                              {hasPermission('products.delete') && (
                                <button onClick={() => handleArchiveProduct(prod.$id, prod.name)} className="p-2 text-slate-400 hover:text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/30 rounded-lg transition-colors" title="Archiver">
                                  <Archive size={16} />
                                </button>
                              )}
                            </>
                          ) : (
                            <button onClick={() => handleUnarchiveProduct(prod.$id, prod.name)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/30 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/50 transition-colors">
                              <RotateCcw size={14} /><span>Désarchiver</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </DataTable>

                {/* Mobile cards */}
                <div className="md:hidden space-y-4 mt-4">
                  {paginatedProducts.map(prod => (
                    <MobileCard key={prod.$id}>
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <span className="inline-flex items-center gap-1 text-xs font-mono font-semibold text-purple-700 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/30 px-2 py-1 rounded mb-1">

                          </span>
                          <h3 className="font-semibold text-slate-900 dark:text-white">{prod.name}</h3>
                          {prod.description && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">{prod.description}</p>}
                        </div>
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusColors[prod.status]}`}>
                          {statusLabelsLocal[prod.status]}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 py-3 border-t border-b border-slate-100 dark:border-slate-700 mb-3 text-sm">
                        <div>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">Prix</p>
                          <p className="font-bold text-slate-900 dark:text-white flex items-center gap-1"><DollarSign size={12} className="text-green-600" />{fm(prod.unitPrice)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">Unité / TVA</p>
                          <p className="font-medium text-slate-900 dark:text-white">{prod.unit} / {prod.tvaRate}%</p>
                        </div>
                        {prod.category && (
                          <div className="col-span-2">
                            <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">Catégorie</p>
                            <p className="font-medium text-purple-700 dark:text-purple-400 flex items-center gap-1"><Tag size={12} />{prod.category.name}</p>
                          </div>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {viewMode === 'active' ? (
                          <>
                            {hasPermission('products.edit') && (
                              <button onClick={() => handleOpenEditProduct(prod)} className="flex items-center justify-center gap-2 p-2.5 text-purple-600 bg-purple-50 dark:bg-purple-900/30 rounded-lg active:scale-95 transition-transform">
                                <Edit2 size={18} /><span className="text-sm font-medium">Modifier</span>
                              </button>
                            )}
                            {hasPermission('products.delete') && (
                              <button onClick={() => handleArchiveProduct(prod.$id, prod.name)} className="flex items-center justify-center gap-2 p-2.5 text-orange-600 bg-orange-50 dark:bg-orange-900/30 rounded-lg active:scale-95 transition-transform">
                                <Archive size={18} /><span className="text-sm font-medium">Archiver</span>
                              </button>
                            )}
                          </>
                        ) : (
                          <button onClick={() => handleUnarchiveProduct(prod.$id, prod.name)} className="col-span-2 flex items-center justify-center gap-2 p-3 text-sm font-medium text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/30 rounded-lg active:scale-95 transition-transform">
                            <RotateCcw size={16} /><span>Désarchiver</span>
                          </button>
                        )}
                      </div>
                    </MobileCard>
                  ))}
                </div>

                {/* ✅ PAGINATION PRODUITS */}
                <Pagination
                  currentPage={productsPage}
                  totalPages={productsTotalPages}
                  onPageChange={setProductsPage}
                  startItem={filteredProducts.length > 0 ? productsStart + 1 : 0}
                  endItem={Math.min(productsEnd, filteredProducts.length)}
                  totalItems={filteredProducts.length}
                  itemName="produit"
                />
              </>
            )
          )}
        </main>

        {/* Les modals restent identiques (Import, Category, Product, Units) */}
        {/* ... (Code des modals inchangé) ... */}
      </div>
    </Sidebar>
  );
}