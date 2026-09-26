import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { databases, DATABASE_ID } from '../appwrite';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import Sidebar from '../components/Sidebar';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import {
  Plus, Search, Edit2, X, Package, Filter, Archive, RotateCcw, Tag, Hash, DollarSign, Percent, Upload, FileSpreadsheet, AlertCircle, CheckCircle2, Download
} from 'lucide-react';
import { Query, ID, Permission, Role } from 'appwrite';

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

const statusLabels: Record<string, string> = {
  active: 'Actif',
  archived: 'Archivé'
};

const statusColors: Record<string, string> = {
  active: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  archived: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
};

const unitOptions = ['Forfait', 'Heure', 'Jour', 'm²', 'ml', 'Unité', 'kg', 'Intervention'];
const tvaOptions = ['20', '10', '5.5', '0'];

const emptyCategoryForm = { name: '', description: '', status: 'active' };
const emptyProductForm = {
  categoryId: '', reference: '', name: '', description: '',
  unit: 'Forfait', unitPrice: '', tvaRate: '20', status: 'active'
};

export default function Catalogue() {
  const { user } = useAuth();
  const { hasPermission, loading: permLoading } = usePermissions();
  const navigate = useNavigate();

  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentTeamId, setCurrentTeamId] = useState<string | null>(null);
  
  const [mainTab, setMainTab] = useState<'products' | 'categories'>('products');
  const [viewMode, setViewMode] = useState<'active' | 'archived'>('active');
  
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
  
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');

  useEffect(() => {
    if (!permLoading && !hasPermission('products.view')) {
      navigate('/dashboard');
    }
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

      const [catRes, prodRes] = await Promise.all([
        databases.listDocuments(DATABASE_ID, 'categories', [
          Query.equal('teamId', teamId), Query.orderDesc('$createdAt'), Query.limit(2000)
        ]),
        databases.listDocuments(DATABASE_ID, 'products', [
          Query.equal('teamId', teamId), Query.orderDesc('$createdAt'), Query.limit(2000)
        ])
      ]);

      const cats = catRes.documents as unknown as Category[];
      const prods = prodRes.documents as unknown as Product[];
      const prodsWithCategory = prods.map(p => ({
        ...p, category: cats.find(c => c.$id === p.categoryId) || undefined
      }));

      setCategories(cats);
      setProducts(prodsWithCategory);
    } catch (error) {
      console.error('Erreur chargement catalogue:', error);
    } finally {
      setLoading(false);
    }
  };

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
        const result = Papa.parse(text, {
          header: true,
          skipEmptyLines: true,
          transformHeader: (h: string) => h.trim().toLowerCase()
        });
        rows = result.data as any[];
      } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(sheet, { defval: '' }) as any[];
        rows = jsonData.map(row => {
          const normalized: any = {};
          Object.keys(row).forEach(key => {
            normalized[key.trim().toLowerCase()] = row[key];
          });
          return normalized;
        });
      } else {
        alert('Format non supporté. Veuillez utiliser un fichier CSV ou Excel (.xlsx).');
        return;
      }

      if (rows.length === 0) {
        alert('Le fichier est vide ou ne contient pas de données valides.');
        return;
      }

      analyzeImportedData(rows);

    } catch (error: any) {
      console.error('Erreur parsing fichier:', error);
      alert(`Erreur lors de la lecture du fichier : ${error.message}`);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const analyzeImportedData = (rows: any[]) => {
    const analyzed: ImportedProduct[] = [];
    let validCount = 0;
    let duplicateCount = 0;
    let errorCount = 0;

    rows.forEach((row, index) => {
      const rowIndex = index + 2;
      
      const name = row['désignation'] || row['designation'] || row['nom'] || row['name'] || '';
      const reference = row['référence'] || row['reference'] || row['ref'] || '';
      const description = row['description'] || row['desc'] || '';
      const unit = row['unité'] || row['unite'] || row['unit'] || 'Forfait';
      const priceStr = row['prix'] || row['price'] || row['prix unitaire'] || row['prix ht'] || '';
      const tvaStr = row['tva'] || row['tva rate'] || row['taux tva'] || '20';
      const categoryName = row['catégorie'] || row['categorie'] || row['category'] || '';

      const errors: string[] = [];
      
      if (!name || name.toString().trim() === '') {
        errors.push('Désignation manquante');
      }
      
      const price = parseFloat(priceStr.toString().replace(',', '.'));
      if (isNaN(price) || price < 0) {
        errors.push('Prix invalide');
      }

      const normalizedUnit = normalizeUnit(unit.toString());
      const tvaRate = parseFloat(tvaStr.toString().replace(',', '.'));
      const normalizedTva = [20, 10, 5.5, 0].includes(tvaRate) ? tvaRate : 20;

      let status: 'valid' | 'duplicate' | 'error' = 'valid';
      let error = '';
      let duplicateOf = '';

      if (errors.length > 0) {
        status = 'error';
        error = errors.join(', ');
        errorCount++;
      } else {
        const duplicateInFile = analyzed.find(p => 
          p.status === 'valid' && 
          p.name.toLowerCase().trim() === name.toString().toLowerCase().trim() &&
          (reference === '' || p.reference === reference.toString())
        );
        
        if (duplicateInFile) {
          status = 'duplicate';
          duplicateOf = `Ligne ${duplicateInFile.rowIndex}`;
          duplicateCount++;
        } else {
          const duplicateInDb = products.find(p => 
            p.status !== 'archived' && (
              (reference && p.reference && p.reference === reference.toString()) ||
              p.name.toLowerCase().trim() === name.toString().toLowerCase().trim()
            )
          );
          
          if (duplicateInDb) {
            status = 'duplicate';
            duplicateOf = `Existant : ${duplicateInDb.name}`;
            duplicateCount++;
          } else {
            const matchedCategory = categories.find(c => 
              c.name.toLowerCase().trim() === categoryName.toString().toLowerCase().trim()
            );
            
            validCount++;
            analyzed.push({
              rowIndex,
              reference: reference.toString(),
              name: name.toString().trim(),
              description: description.toString(),
              unit: normalizedUnit,
              unitPrice: price,
              tvaRate: normalizedTva,
              categoryName: categoryName.toString(),
              categoryId: matchedCategory?.$id || '',
              status: 'valid'
            });
            return;
          }
        }
      }

      analyzed.push({
        rowIndex,
        reference: reference.toString(),
        name: name.toString().trim(),
        description: description.toString(),
        unit: normalizedUnit,
        unitPrice: isNaN(price) ? 0 : price,
        tvaRate: normalizedTva,
        categoryName: categoryName.toString(),
        categoryId: '',
        status,
        error,
        duplicateOf
      });
    });

    setImportedProducts(analyzed);
    setImportStats({
      total: rows.length,
      valid: validCount,
      duplicates: duplicateCount,
      errors: errorCount
    });
    setImportStep('preview');
  };

  const normalizeUnit = (unit: string): string => {
    const u = unit.toLowerCase().trim();
    if (['forfait', 'forf', 'flat'].includes(u)) return 'Forfait';
    if (['heure', 'h', 'hour', 'heures'].includes(u)) return 'Heure';
    if (['jour', 'j', 'day', 'jours'].includes(u)) return 'Jour';
    if (['m²', 'm2', 'mètre carré', 'sqm'].includes(u)) return 'm²';
    if (['ml', 'mètre linéaire', 'm l'].includes(u)) return 'ml';
    if (['unité', 'unite', 'u', 'unit', 'pcs'].includes(u)) return 'Unité';
    if (['kg', 'kilogramme'].includes(u)) return 'kg';
    if (['intervention', 'interv'].includes(u)) return 'Intervention';
    return 'Forfait';
  };

  const handleConfirmImport = async () => {
    if (!currentTeamId) return;
    
    const validProducts = importedProducts.filter(p => p.status === 'valid');
    if (validProducts.length === 0) {
      alert('Aucun produit valide à importer.');
      return;
    }

    if (!confirm(`Importer ${validProducts.length} produit(s) ?`)) return;

    setImporting(true);
    setImportStep('importing');
    let successCount = 0;
    let failCount = 0;

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

    const batchSize = 10;
    for (let i = 0; i < validProducts.length; i += batchSize) {
      const batch = validProducts.slice(i, i + batchSize);
      
      const promises = batch.map(async (p) => {
        try {
          await databases.createDocument(
            DATABASE_ID, 
            'products', 
            ID.unique(), 
            {
              teamId: currentTeamId,
              categoryId: p.categoryId || '',
              reference: p.reference || '',
              name: p.name,
              description: p.description || '',
              unit: p.unit,
              unitPrice: p.unitPrice.toString(),
              tvaRate: p.tvaRate.toString(),
              status: 'active'
            },
            perms
          );
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
      {
        'Référence': 'WC-001',
        'Désignation': 'Installation WC standard',
        'Description': 'Pose complète d\'un WC standard avec raccordement',
        'Prix': '350',
        'Unité': 'Forfait',
        'TVA': '10',
        'Catégorie': 'Plomberie'
      },
      {
        'Référence': 'ELEC-001',
        'Désignation': 'Installation prise électrique',
        'Description': 'Pose d\'une prise électrique 2P+T',
        'Prix': '85',
        'Unité': 'Unité',
        'TVA': '10',
        'Catégorie': 'Électricité'
      }
    ];

    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Modèle');
    XLSX.writeFile(wb, 'modele_import_catalogue.xlsx');
  };

  const handleOpenAddCategory = () => {
    setEditingCategoryId(null);
    setCategoryForm(emptyCategoryForm);
    setShowCategoryModal(true);
  };

  const handleOpenEditCategory = (cat: Category) => {
    if (cat.teamId !== currentTeamId) { alert('⚠️ Accès refusé'); return; }
    setEditingCategoryId(cat.$id);
    setCategoryForm({ name: cat.name || '', description: cat.description || '', status: cat.status || 'active' });
    setShowCategoryModal(true);
  };

  const handleSaveCategory = async () => {
    if (!categoryForm.name.trim()) { alert('Veuillez saisir un nom.'); return; }
    if (!currentTeamId) return;

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
        if (existingDoc.teamId !== currentTeamId) { alert('⚠️ Accès refusé'); setSavingCategory(false); return; }
        await databases.updateDocument(DATABASE_ID, 'categories', editingCategoryId, data);
      } else {
        await databases.createDocument(DATABASE_ID, 'categories', ID.unique(), data, perms);
      }
      setShowCategoryModal(false);
      await loadData();
    } catch (error: any) {
      alert(`Erreur : ${error.message}`);
    } finally {
      setSavingCategory(false);
    }
  };

  const handleArchiveCategory = async (id: string, name: string) => {
    if (!confirm(`Archiver la catégorie "${name}" ?`)) return;
    try {
      const doc = await databases.getDocument(DATABASE_ID, 'categories', id);
      if (doc.teamId !== currentTeamId) { alert('⚠️ Accès refusé'); return; }
      await databases.updateDocument(DATABASE_ID, 'categories', id, { status: 'archived' });
      await loadData();
    } catch (error: any) { alert(`Erreur : ${error.message}`); }
  };

  const handleUnarchiveCategory = async (id: string, name: string) => {
    try {
      const doc = await databases.getDocument(DATABASE_ID, 'categories', id);
      if (doc.teamId !== currentTeamId) { alert('⚠️ Accès refusé'); return; }
      await databases.updateDocument(DATABASE_ID, 'categories', id, { status: 'active' });
      await loadData();
      setViewMode('active');
    } catch (error: any) { alert(`Erreur : ${error.message}`); }
  };

  const handleOpenAddProduct = () => {
    setEditingProductId(null);
    setProductForm(emptyProductForm);
    setShowProductModal(true);
  };

  const handleOpenEditProduct = (prod: Product) => {
    if (prod.teamId !== currentTeamId) { alert('⚠️ Accès refusé'); return; }
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
    if (!productForm.name.trim()) { alert('Veuillez saisir un nom.'); return; }
    if (!productForm.unitPrice || parseFloat(productForm.unitPrice) < 0) { alert('Prix invalide.'); return; }
    if (!currentTeamId) return;

    setSavingProduct(true);
    try {
      const data = { ...productForm, teamId: currentTeamId };
      let perms: string[] = [];
      
      if (user?.secureTeamId) {
        perms = [Permission.read(Role.team(user.secureTeamId)), Permission.update(Role.team(user.secureTeamId)), Permission.delete(Role.team(user.secureTeamId))];
      } else {
        perms = [Permission.read(Role.users()), Permission.update(Role.users()), Permission.delete(Role.users())];
      }

      if (editingProductId) {
        const existingDoc = await databases.getDocument(DATABASE_ID, 'products', editingProductId);
        if (existingDoc.teamId !== currentTeamId) { alert('⚠️ Accès refusé'); setSavingProduct(false); return; }
        await databases.updateDocument(DATABASE_ID, 'products', editingProductId, data);
      } else {
        await databases.createDocument(DATABASE_ID, 'products', ID.unique(), data, perms);
      }
      setShowProductModal(false);
      await loadData();
    } catch (error: any) { alert(`Erreur : ${error.message}`); }
    finally { setSavingProduct(false); }
  };

  const handleArchiveProduct = async (id: string, name: string) => {
    if (!confirm(`Archiver le produit "${name}" ?`)) return;
    try {
      const doc = await databases.getDocument(DATABASE_ID, 'products', id);
      if (doc.teamId !== currentTeamId) { alert('⚠️ Accès refusé'); return; }
      await databases.updateDocument(DATABASE_ID, 'products', id, { status: 'archived' });
      await loadData();
    } catch (error: any) { alert(`Erreur : ${error.message}`); }
  };

  const handleUnarchiveProduct = async (id: string, name: string) => {
    try {
      const doc = await databases.getDocument(DATABASE_ID, 'products', id);
      if (doc.teamId !== currentTeamId) { alert('⚠️ Accès refusé'); return; }
      await databases.updateDocument(DATABASE_ID, 'products', id, { status: 'active' });
      await loadData();
      setViewMode('active');
    } catch (error: any) { alert(`Erreur : ${error.message}`); }
  };

  const filteredCategories = categories.filter(c => {
    const matchSearch = search === '' || c.name.toLowerCase().includes(search.toLowerCase());
    const matchView = viewMode === 'active' ? c.status !== 'archived' : c.status === 'archived';
    return matchSearch && matchView;
  });

  const filteredProducts = products.filter(p => {
    const matchSearch = search === '' || 
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.reference && p.reference.toLowerCase().includes(search.toLowerCase())) ||
      (p.description && p.description.toLowerCase().includes(search.toLowerCase()));
    const matchCategory = filterCategory === 'all' || p.categoryId === filterCategory;
    const matchView = viewMode === 'active' ? p.status !== 'archived' : p.status === 'archived';
    return matchSearch && matchCategory && matchView;
  });

  const fm = (price: string) => {
    const num = parseFloat(price);
    return isNaN(num) ? '0,00 €' : `${num.toFixed(2)} €`;
  };

  if (permLoading) return <Sidebar><div className="flex items-center justify-center h-full w-full"><div className="text-slate-500 dark:text-slate-400 text-lg animate-pulse">Vérification des droits...</div></div></Sidebar>;
  if (!hasPermission('products.view')) return null;

  const activeCategories = categories.filter(c => c.status !== 'archived');

  return (
    <Sidebar>
      <div className="min-h-full bg-slate-50 dark:bg-slate-900">
        {/* HEADER STICKY */}
        <header className="bg-white dark:bg-slate-800 shadow-sm border-b border-slate-200 dark:border-slate-700 sticky top-0 z-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-3">
                <div>
                  <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Package size={24} className="text-purple-600" />
                    Catalogue
                  </h1>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {mainTab === 'products' 
                      ? `${filteredProducts.length} produit(s) ${viewMode === 'active' ? 'actif(s)' : 'archivé(s)'}`
                      : `${filteredCategories.length} catégorie(s) ${viewMode === 'active' ? 'active(s)' : 'archivée(s)'}`
                    }
                  </p>
                </div>
              </div>
              {viewMode === 'active' && hasPermission('products.create') && (
                <div className="flex gap-2 w-full sm:w-auto">
                  {mainTab === 'products' && (
                    <>
                      <button onClick={handleOpenImport} className="flex-1 sm:flex-none items-center justify-center gap-2 bg-amber-600 text-white px-4 py-2.5 rounded-lg hover:bg-amber-700 transition-colors font-medium text-sm flex active:scale-95">
                        <Upload size={18} /><span className="hidden sm:inline">Importer</span>
                      </button>
                      <button onClick={handleOpenAddProduct} className="flex-1 sm:flex-none items-center justify-center gap-2 bg-purple-600 text-white px-4 py-2.5 rounded-lg hover:bg-purple-700 transition-colors font-medium text-sm flex active:scale-95">
                        <Plus size={18} /><span>Nouveau</span>
                      </button>
                    </>
                  )}
                  {mainTab === 'categories' && (
                    <button onClick={handleOpenAddCategory} className="flex-1 sm:flex-none items-center justify-center gap-2 bg-purple-600 text-white px-4 py-2.5 rounded-lg hover:bg-purple-700 transition-colors font-medium text-sm flex active:scale-95">
                      <Plus size={18} /><span>Nouvelle catégorie</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {/* ONGLETS PRINCIPAUX */}
          <div className="flex border-b border-slate-200 dark:border-slate-700 mb-6">
            <button onClick={() => { setMainTab('products'); setViewMode('active'); }} className={`px-4 sm:px-6 py-3 text-sm font-medium border-b-2 transition-colors ${mainTab === 'products' ? 'border-purple-600 text-purple-600 dark:text-purple-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}>
              <Package className="inline mr-2" size={16} />
              Produits
            </button>
            <button onClick={() => { setMainTab('categories'); setViewMode('active'); }} className={`px-4 sm:px-6 py-3 text-sm font-medium border-b-2 transition-colors ${mainTab === 'categories' ? 'border-purple-600 text-purple-600 dark:text-purple-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}>
              <Tag className="inline mr-2" size={16} />
              Catégories
            </button>
          </div>

          {/* ONGLETS STATUT */}
          <div className="flex border-b border-slate-200 dark:border-slate-700 mb-6">
            <button onClick={() => setViewMode('active')} className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${viewMode === 'active' ? 'border-purple-600 text-purple-600 dark:text-purple-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}>
              Actifs ({mainTab === 'products' ? products.filter(p => p.status !== 'archived').length : categories.filter(c => c.status !== 'archived').length})
            </button>
            <button onClick={() => setViewMode('archived')} className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${viewMode === 'archived' ? 'border-purple-600 text-purple-600 dark:text-purple-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}>
              Archivés ({mainTab === 'products' ? products.filter(p => p.status === 'archived').length : categories.filter(c => c.status === 'archived').length})
            </button>
          </div>

          {/* BARRE DE RECHERCHE ET FILTRES */}
          <div className="flex flex-col sm:flex-row gap-3 mb-6">
            <div className="relative flex-1">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder={mainTab === 'products' ? 'Rechercher un produit...' : 'Rechercher une catégorie...'}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white rounded-lg focus:ring-2 focus:ring-purple-500 outline-none text-sm transition-shadow"
              />
            </div>
            {mainTab === 'products' && viewMode === 'active' && (
              <div className="relative sm:w-64">
                <Filter size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <select
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white rounded-lg focus:ring-2 focus:ring-purple-500 outline-none text-sm bg-white dark:bg-slate-800 appearance-none"
                >
                  <option value="all">Toutes les catégories</option>
                  {activeCategories.map(cat => (
                    <option key={cat.$id} value={cat.$id}>{cat.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* CONTENU : TABLEAU DESKTOP / CARTES MOBILE */}
          {loading ? (
            <div className="text-center py-12 text-slate-500 dark:text-slate-400 animate-pulse">Chargement...</div>
          ) : mainTab === 'categories' ? (
            filteredCategories.length === 0 ? (
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-12 text-center shadow-sm">
                <Tag size={48} className="mx-auto text-slate-300 dark:text-slate-600 mb-4" />
                <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-2">Aucune catégorie {viewMode === 'active' ? 'active' : 'archivée'}</h3>
                {viewMode === 'active' && hasPermission('products.create') && (
                  <button onClick={handleOpenAddCategory} className="inline-flex items-center gap-2 bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 text-sm mt-4 active:scale-95 transition-transform">
                    <Plus size={16} /><span>Créer une catégorie</span>
                  </button>
                )}
              </div>
            ) : (
              <>
                {/* VERSION DESKTOP (Tableau) */}
                <div className="hidden md:block bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700">
                        <tr>
                          <th className="text-left px-6 py-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Nom</th>
                          <th className="text-left px-6 py-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Description</th>
                          <th className="text-left px-6 py-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Produits liés</th>
                          <th className="text-left px-6 py-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Statut</th>
                          <th className="text-right px-6 py-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                        {filteredCategories.map(cat => {
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
                                  {statusLabels[cat.status]}
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
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* VERSION MOBILE (Cartes) */}
                <div className="md:hidden space-y-4">
                  {filteredCategories.map(cat => {
                    const linkedProducts = products.filter(p => p.categoryId === cat.$id && p.status !== 'archived').length;
                    return (
                      <div key={cat.$id} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 shadow-sm">
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                              <Tag size={16} className="text-purple-500" />
                              {cat.name}
                            </h3>
                            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{cat.description || 'Aucune description'}</p>
                          </div>
                          <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusColors[cat.status]}`}>
                            {statusLabels[cat.status]}
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
                      </div>
                    );
                  })}
                </div>
              </>
            )
          ) : (
            filteredProducts.length === 0 ? (
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-12 text-center shadow-sm">
                <Package size={48} className="mx-auto text-slate-300 dark:text-slate-600 mb-4" />
                <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-2">Aucun produit {viewMode === 'active' ? 'actif' : 'archivé'}</h3>
                <p className="text-slate-500 dark:text-slate-400 mb-4">Importez vos produits depuis un fichier Excel/CSV ou créez-les manuellement.</p>
                {viewMode === 'active' && hasPermission('products.create') && (
                  <div className="flex flex-col sm:flex-row gap-2 justify-center">
                    <button onClick={handleOpenImport} className="inline-flex items-center justify-center gap-2 bg-amber-600 text-white px-4 py-2.5 rounded-lg hover:bg-amber-700 text-sm active:scale-95 transition-transform">
                      <Upload size={16} /><span>Importer</span>
                    </button>
                    <button onClick={handleOpenAddProduct} className="inline-flex items-center justify-center gap-2 bg-purple-600 text-white px-4 py-2.5 rounded-lg hover:bg-purple-700 text-sm active:scale-95 transition-transform">
                      <Plus size={16} /><span>Créer un produit</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <>
                {/* VERSION DESKTOP (Tableau) */}
                <div className="hidden md:block bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700">
                        <tr>
                          <th className="text-left px-6 py-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Réf.</th>
                          <th className="text-left px-6 py-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Nom</th>
                          <th className="text-left px-6 py-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Catégorie</th>
                          <th className="text-left px-6 py-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Prix unitaire</th>
                          <th className="text-left px-6 py-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Unité</th>
                          <th className="text-left px-6 py-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">TVA</th>
                          <th className="text-left px-6 py-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Statut</th>
                          <th className="text-right px-6 py-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                        {filteredProducts.map(prod => (
                          <tr key={prod.$id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                            <td className="px-6 py-4">
                              <span className="inline-flex items-center gap-1 text-xs font-mono font-semibold text-purple-700 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/30 px-2 py-1 rounded">
                                <Hash size={12} />
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
                                {statusLabels[prod.status]}
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
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* VERSION MOBILE (Cartes) */}
                <div className="md:hidden space-y-4">
                  {filteredProducts.map(prod => (
                    <div key={prod.$id} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 shadow-sm">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <span className="inline-flex items-center gap-1 text-xs font-mono font-semibold text-purple-700 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/30 px-2 py-1 rounded mb-1">
                            <Hash size={12} /> {prod.reference || 'Sans réf.'}
                          </span>
                          <h3 className="font-semibold text-slate-900 dark:text-white">{prod.name}</h3>
                          {prod.description && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">{prod.description}</p>}
                        </div>
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusColors[prod.status]}`}>
                          {statusLabels[prod.status]}
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
                    </div>
                  ))}
                </div>
              </>
            )
          )}
        </main>

        {/* MODAL IMPORT - OPTIMISÉ MOBILE */}
        {showImportModal && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4 animate-fadeIn">
            <div className="bg-white dark:bg-slate-800 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-5xl max-h-[90vh] overflow-hidden flex flex-col animate-slideUp">
              <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex-shrink-0">
                <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Upload className="text-amber-600" size={24} />
                  {importStep === 'upload' && 'Importer des produits'}
                  {importStep === 'preview' && 'Prévisualisation de l\'import'}
                  {importStep === 'importing' && 'Import en cours...'}
                  {importStep === 'done' && 'Import terminé'}
                </h2>
                <button onClick={() => setShowImportModal(false)} disabled={importing} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg disabled:opacity-50 transition-colors">
                  <X size={20} className="text-slate-500 dark:text-slate-400" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 sm:p-6">
                {importStep === 'upload' && (
                  <div className="space-y-6">
                    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                      <p className="text-sm text-blue-900 dark:text-blue-200">
                        <strong>💡 Astuce :</strong> Téléchargez le modèle Excel pour voir le format attendu, puis remplissez-le avec vos produits.
                      </p>
                      <button onClick={handleDownloadTemplate} className="mt-3 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-700 dark:text-blue-300 bg-white dark:bg-slate-800 border border-blue-300 dark:border-blue-700 rounded-lg hover:bg-blue-50 dark:hover:bg-slate-700 transition-colors">
                        <Download size={16} />
                        Télécharger le modèle Excel
                      </button>
                    </div>

                    <div className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg p-8 sm:p-12 text-center hover:border-amber-500 dark:hover:border-amber-500 transition-colors cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                      <FileSpreadsheet size={48} className="mx-auto text-slate-400 dark:text-slate-500 mb-4" />
                      <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-2">Cliquez pour sélectionner un fichier</h3>
                      <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Formats supportés : <strong>.csv</strong>, <strong>.xlsx</strong>, <strong>.xls</strong></p>
                      <p className="text-xs text-slate-400 dark:text-slate-500">Colonnes attendues : Référence, Désignation, Description, Prix, Unité, TVA, Catégorie</p>
                      <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleFileSelect} className="hidden" />
                    </div>

                    <div className="bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg p-4">
                      <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">📋 Colonnes reconnues (flexibles) :</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 text-xs text-slate-600 dark:text-slate-400">
                        <div><strong>Désignation</strong> <span className="text-red-600">*</span> (nom, designation)</div>
                        <div><strong>Prix</strong> <span className="text-red-600">*</span> (price, prix unitaire)</div>
                        <div><strong>Unité</strong> <span className="text-red-600">*</span> (unite, unit)</div>
                        <div><strong>Référence</strong> (ref, reference)</div>
                        <div><strong>Description</strong> (desc)</div>
                        <div><strong>TVA</strong> (tva rate, taux tva)</div>
                        <div><strong>Catégorie</strong> (categorie, category)</div>
                      </div>
                    </div>
                  </div>
                )}

                {importStep === 'preview' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
                      <div className="bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg p-4 text-center">
                        <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-semibold">Total lignes</p>
                        <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{importStats.total}</p>
                      </div>
                      <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 text-center">
                        <p className="text-xs text-green-700 dark:text-green-300 uppercase font-semibold">Importables</p>
                        <p className="text-2xl font-bold text-green-700 dark:text-green-300 mt-1">{importStats.valid}</p>
                      </div>
                      <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 text-center">
                        <p className="text-xs text-amber-700 dark:text-amber-300 uppercase font-semibold">Doublons</p>
                        <p className="text-2xl font-bold text-amber-700 dark:text-amber-300 mt-1">{importStats.duplicates}</p>
                      </div>
                      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-center">
                        <p className="text-xs text-red-700 dark:text-red-300 uppercase font-semibold">Erreurs</p>
                        <p className="text-2xl font-bold text-red-700 dark:text-red-300 mt-1">{importStats.errors}</p>
                      </div>
                    </div>

                    {importStats.errors > 0 && (
                      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                        <p className="text-sm text-red-800 dark:text-red-200 font-semibold flex items-center gap-2">
                          <AlertCircle size={16} />
                          {importStats.errors} ligne(s) contiennent des erreurs et ne seront pas importées.
                        </p>
                      </div>
                    )}

                    {importStats.duplicates > 0 && (
                      <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                        <p className="text-sm text-amber-800 dark:text-amber-200 font-semibold flex items-center gap-2">
                          <AlertCircle size={16} />
                          {importStats.duplicates} doublon(s) détecté(s) et ignoré(s).
                        </p>
                      </div>
                    )}

                    <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                      <div className="overflow-x-auto max-h-96">
                        <table className="w-full text-sm min-w-[600px]">
                          <thead className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700 sticky top-0">
                            <tr>
                              <th className="px-3 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400">Ligne</th>
                              <th className="px-3 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400">Statut</th>
                              <th className="px-3 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400">Réf.</th>
                              <th className="px-3 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400">Désignation</th>
                              <th className="px-3 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400">Prix</th>
                              <th className="px-3 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400">Unité</th>
                              <th className="px-3 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400">TVA</th>
                              <th className="px-3 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400">Catégorie</th>
                              <th className="px-3 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400">Détail</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                            {importedProducts.map((p, idx) => (
                              <tr key={idx} className={p.status === 'valid' ? 'bg-white dark:bg-slate-800' : p.status === 'duplicate' ? 'bg-amber-50 dark:bg-amber-900/20' : 'bg-red-50 dark:bg-red-900/20'}>
                                <td className="px-3 py-3 text-xs text-slate-500 dark:text-slate-400">{p.rowIndex}</td>
                                <td className="px-3 py-3">
                                  {p.status === 'valid' && <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 dark:text-green-300"><CheckCircle2 size={14} />OK</span>}
                                  {p.status === 'duplicate' && <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-300"><AlertCircle size={14} />Doublon</span>}
                                  {p.status === 'error' && <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 dark:text-red-300"><AlertCircle size={14} />Erreur</span>}
                                </td>
                                <td className="px-3 py-3 text-xs font-mono text-slate-600 dark:text-slate-300">{p.reference || '-'}</td>
                                <td className="px-3 py-3 font-medium text-slate-900 dark:text-white">{p.name}</td>
                                <td className="px-3 py-3 text-xs text-slate-700 dark:text-slate-300">{p.unitPrice.toFixed(2)} €</td>
                                <td className="px-3 py-3 text-xs text-slate-600 dark:text-slate-400">{p.unit}</td>
                                <td className="px-3 py-3 text-xs text-slate-600 dark:text-slate-400">{p.tvaRate}%</td>
                                <td className="px-3 py-3 text-xs text-slate-600 dark:text-slate-400">{p.categoryName || '-'}</td>
                                <td className="px-3 py-3 text-xs">
                                  {p.error && <span className="text-red-600 dark:text-red-400">{p.error}</span>}
                                  {p.duplicateOf && <span className="text-amber-600 dark:text-amber-400">{p.duplicateOf}</span>}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

                {importStep === 'importing' && (
                  <div className="text-center py-12">
                    <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-amber-600 border-t-transparent mb-4"></div>
                    <p className="text-lg font-semibold text-slate-700 dark:text-slate-300">Import en cours...</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">Veuillez patienter, {importStats.valid} produits sont en cours de création.</p>
                  </div>
                )}

                {importStep === 'done' && (
                  <div className="text-center py-12">
                    <CheckCircle2 size={64} className="mx-auto text-green-600 dark:text-green-400 mb-4" />
                    <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Import terminé !</h3>
                    <p className="text-slate-600 dark:text-slate-400">
                      <strong className="text-green-700 dark:text-green-400">{importResult.success}</strong> produit(s) importé(s) avec succès.
                      {importResult.failed > 0 && (
                        <> <strong className="text-red-700 dark:text-red-400">{importResult.failed}</strong> erreur(s).</>
                      )}
                    </p>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 px-4 sm:px-6 py-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/90 flex-shrink-0">
                {importStep === 'upload' && (
                  <button onClick={() => setShowImportModal(false)} className="w-full sm:w-auto px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600 active:scale-95 transition-all">
                    Annuler
                  </button>
                )}
                {importStep === 'preview' && (
                  <>
                    <button onClick={() => { setImportStep('upload'); setImportedProducts([]); }} className="flex-1 sm:flex-none px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600 active:scale-95 transition-all">
                      ← Choisir un autre fichier
                    </button>
                    <button onClick={handleConfirmImport} disabled={importStats.valid === 0} className="flex-1 sm:flex-none px-4 py-3 text-sm font-semibold text-white bg-amber-600 rounded-lg hover:bg-amber-700 disabled:opacity-50 flex items-center justify-center gap-2 active:scale-95 transition-all">
                      <Upload size={16} />
                      Importer {importStats.valid} produit(s)
                    </button>
                  </>
                )}
                {importStep === 'done' && (
                  <button onClick={() => setShowImportModal(false)} className="w-full sm:w-auto px-4 py-3 text-sm font-semibold text-white bg-purple-600 rounded-lg hover:bg-purple-700 active:scale-95 transition-all">
                    Fermer
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* MODAL CATÉGORIE - OPTIMISÉ MOBILE */}
        {showCategoryModal && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4 animate-fadeIn">
            <div className="bg-white dark:bg-slate-800 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg animate-slideUp">
              <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-700">
                <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                  {editingCategoryId ? 'Modifier la catégorie' : 'Nouvelle catégorie'}
                </h2>
                <button onClick={() => setShowCategoryModal(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors">
                  <X size={20} className="text-slate-500 dark:text-slate-400" />
                </button>
              </div>
              <div className="px-4 sm:px-6 py-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Nom *</label>
                  <input
                    type="text"
                    value={categoryForm.name}
                    onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                    className="w-full px-3 py-3 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                    placeholder="Ex: Plomberie, Électricité..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Description</label>
                  <textarea
                    value={categoryForm.description}
                    onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-3 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none resize-none"
                    placeholder="Description optionnelle..."
                  />
                </div>
              </div>
              <div className="flex items-center justify-end gap-3 px-4 sm:px-6 py-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/90 rounded-b-2xl">
                <button onClick={() => setShowCategoryModal(false)} className="flex-1 sm:flex-none px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600 active:scale-95 transition-all">
                  Annuler
                </button>
                <button onClick={handleSaveCategory} disabled={savingCategory || !categoryForm.name.trim()} className="flex-1 sm:flex-none px-4 py-3 text-sm font-semibold text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-50 active:scale-95 transition-all">
                  {savingCategory ? 'Enregistrement...' : editingCategoryId ? 'Mettre à jour' : 'Créer'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL PRODUIT - OPTIMISÉ MOBILE */}
        {showProductModal && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4 animate-fadeIn">
            <div className="bg-white dark:bg-slate-800 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto animate-slideUp">
              <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-700 sticky top-0 bg-white dark:bg-slate-800 z-10">
                <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                  {editingProductId ? 'Modifier le produit' : 'Nouveau produit'}
                </h2>
                <button onClick={() => setShowProductModal(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors">
                  <X size={20} className="text-slate-500 dark:text-slate-400" />
                </button>
              </div>
              <div className="px-4 sm:px-6 py-4 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Nom *</label>
                    <input type="text" value={productForm.name} onChange={(e) => setProductForm({ ...productForm, name: e.target.value })} className="w-full px-3 py-3 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none" placeholder="Ex: Installation WC standard" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Référence</label>
                    <input type="text" value={productForm.reference} onChange={(e) => setProductForm({ ...productForm, reference: e.target.value })} className="w-full px-3 py-3 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none" placeholder="Ex: WC-001" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Description</label>
                  <textarea value={productForm.description} onChange={(e) => setProductForm({ ...productForm, description: e.target.value })} rows={3} className="w-full px-3 py-3 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none resize-none" placeholder="Description détaillée..." />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Catégorie</label>
                  <select value={productForm.categoryId} onChange={(e) => setProductForm({ ...productForm, categoryId: e.target.value })} className="w-full px-3 py-3 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none bg-white dark:bg-slate-700">
                    <option value="">-- Aucune catégorie --</option>
                    {activeCategories.map(cat => (<option key={cat.$id} value={cat.$id}>{cat.name}</option>))}
                  </select>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Prix unitaire HT *</label>
                    <input type="number" step="0.01" min="0" value={productForm.unitPrice} onChange={(e) => setProductForm({ ...productForm, unitPrice: e.target.value })} className="w-full px-3 py-3 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none" placeholder="0.00" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Unité</label>
                    <select value={productForm.unit} onChange={(e) => setProductForm({ ...productForm, unit: e.target.value })} className="w-full px-3 py-3 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none bg-white dark:bg-slate-700">
                      {unitOptions.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">TVA (%)</label>
                    <select value={productForm.tvaRate} onChange={(e) => setProductForm({ ...productForm, tvaRate: e.target.value })} className="w-full px-3 py-3 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none bg-white dark:bg-slate-700">
                      {tvaOptions.map(t => <option key={t} value={t}>{t}%</option>)}
                    </select>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-end gap-3 px-4 sm:px-6 py-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/90 sticky bottom-0 rounded-b-2xl">
                <button onClick={() => setShowProductModal(false)} className="flex-1 sm:flex-none px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600 active:scale-95 transition-all">
                  Annuler
                </button>
                <button onClick={handleSaveProduct} disabled={savingProduct || !productForm.name.trim() || !productForm.unitPrice} className="flex-1 sm:flex-none px-4 py-3 text-sm font-semibold text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-50 active:scale-95 transition-all">
                  {savingProduct ? 'Enregistrement...' : editingProductId ? 'Mettre à jour' : 'Créer'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Sidebar>
  );
}