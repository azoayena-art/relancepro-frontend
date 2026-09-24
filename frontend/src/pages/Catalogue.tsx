import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { databases, DATABASE_ID } from '../appwrite';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import {
  Plus, Search, Edit2, X, Package, ChevronLeft, Filter, Archive, RotateCcw, Tag, Hash, DollarSign, Percent, Upload, FileSpreadsheet, AlertCircle, CheckCircle2, Download
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
  active: 'bg-green-100 text-green-800',
  archived: 'bg-slate-100 text-slate-600'
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
    
    console.log("🔍 DEBUG Catalogue - secureTeamId:", user?.secureTeamId);
    
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

    console.log("🔍 DEBUG Catalogue handleConfirmImport - secureTeamId:", user?.secureTeamId);

    setImporting(true);
    setImportStep('importing');
    let successCount = 0;
    let failCount = 0;

    // ✅ SÉCURITÉ MAXIMALE : Utilisation du secureTeamId avec fallback
    let perms: string[] = [];
    
    if (user?.secureTeamId) {
      console.log("✅ Catalogue handleConfirmImport: Utilisation de la sécurité maximale (secureTeamId)");
      perms = [
        Permission.read(Role.team(user.secureTeamId)),
        Permission.update(Role.team(user.secureTeamId)),
        Permission.delete(Role.team(user.secureTeamId))
      ];
    } else {
      console.warn("⚠️ Catalogue handleConfirmImport: secureTeamId manquant, fallback Role.users()");
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
    if (cat.teamId !== currentTeamId) {
      alert('⚠️ Accès refusé');
      return;
    }
    setEditingCategoryId(cat.$id);
    setCategoryForm({ name: cat.name || '', description: cat.description || '', status: cat.status || 'active' });
    setShowCategoryModal(true);
  };

  const handleSaveCategory = async () => {
    if (!categoryForm.name.trim()) { alert('Veuillez saisir un nom.'); return; }
    if (!currentTeamId) return;

    console.log("🔍 DEBUG Catalogue handleSaveCategory - secureTeamId:", user?.secureTeamId);

    setSavingCategory(true);
    try {
      const data = { ...categoryForm, teamId: currentTeamId };
      
      // ✅ SÉCURITÉ MAXIMALE : Utilisation du secureTeamId avec fallback
      let perms: string[] = [];
      
      if (user?.secureTeamId) {
        console.log("✅ Catalogue handleSaveCategory: Utilisation de la sécurité maximale (secureTeamId)");
        perms = [
          Permission.read(Role.team(user.secureTeamId)),
          Permission.update(Role.team(user.secureTeamId)),
          Permission.delete(Role.team(user.secureTeamId))
        ];
      } else {
        console.warn("⚠️ Catalogue handleSaveCategory: secureTeamId manquant, fallback Role.users()");
        perms = [
          Permission.read(Role.users()),
          Permission.update(Role.users()),
          Permission.delete(Role.users())
        ];
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

    console.log("🔍 DEBUG Catalogue handleSaveProduct - secureTeamId:", user?.secureTeamId);

    setSavingProduct(true);
    try {
      const data = { ...productForm, teamId: currentTeamId };
      
      // ✅ SÉCURITÉ MAXIMALE : Utilisation du secureTeamId avec fallback
      let perms: string[] = [];
      
      if (user?.secureTeamId) {
        console.log("✅ Catalogue handleSaveProduct: Utilisation de la sécurité maximale (secureTeamId)");
        perms = [
          Permission.read(Role.team(user.secureTeamId)),
          Permission.update(Role.team(user.secureTeamId)),
          Permission.delete(Role.team(user.secureTeamId))
        ];
      } else {
        console.warn("⚠️ Catalogue handleSaveProduct: secureTeamId manquant, fallback Role.users()");
        perms = [
          Permission.read(Role.users()),
          Permission.update(Role.users()),
          Permission.delete(Role.users())
        ];
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

  if (permLoading) return <div className="min-h-screen flex items-center justify-center bg-gray-50">Vérification des droits...</div>;
  if (!hasPermission('products.view')) return null;

  const activeCategories = categories.filter(c => c.status !== 'archived');

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-4">
            <button onClick={() => navigate('/dashboard')} className="text-slate-400 hover:text-slate-600">
              <ChevronLeft size={24} />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 flex items-center">
                <Package size={24} className="mr-2 text-indigo-600" />
                Catalogue
              </h1>
              <p className="text-sm text-slate-500">
                {mainTab === 'products' 
                  ? `${filteredProducts.length} produit(s) ${viewMode === 'active' ? 'actif(s)' : 'archivé(s)'}`
                  : `${filteredCategories.length} catégorie(s) ${viewMode === 'active' ? 'active(s)' : 'archivée(s)'}`
                }
              </p>
            </div>
          </div>
          {viewMode === 'active' && mainTab === 'products' && (
            <div className="flex gap-2">
              {hasPermission('products.create') && (
                <>
                  <button onClick={handleOpenImport} className="flex items-center space-x-2 bg-amber-600 text-white px-4 py-2.5 rounded-lg hover:bg-amber-700 transition-colors font-medium text-sm">
                    <Upload size={18} /><span>Importer</span>
                  </button>
                  <button onClick={handleOpenAddProduct} className="flex items-center space-x-2 bg-indigo-600 text-white px-4 py-2.5 rounded-lg hover:bg-indigo-700 transition-colors font-medium text-sm">
                    <Plus size={18} /><span>Nouveau produit</span>
                  </button>
                </>
              )}
              {mainTab === 'categories' && hasPermission('products.create') && (
                <button onClick={handleOpenAddCategory} className="flex items-center space-x-2 bg-indigo-600 text-white px-4 py-2.5 rounded-lg hover:bg-indigo-700 transition-colors font-medium text-sm">
                  <Plus size={18} /><span>Nouvelle catégorie</span>
                </button>
              )}
            </div>
          )}
          {viewMode === 'active' && mainTab === 'categories' && hasPermission('products.create') && (
            <button onClick={handleOpenAddCategory} className="flex items-center space-x-2 bg-indigo-600 text-white px-4 py-2.5 rounded-lg hover:bg-indigo-700 transition-colors font-medium text-sm">
              <Plus size={18} /><span>Nouvelle catégorie</span>
            </button>
          )}
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex border-b border-slate-200 mb-6">
          <button
            onClick={() => { setMainTab('products'); setViewMode('active'); }}
            className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
              mainTab === 'products' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Package className="inline mr-2" size={16} />
            Produits ({products.filter(p => p.status !== 'archived').length})
          </button>
          <button
            onClick={() => { setMainTab('categories'); setViewMode('active'); }}
            className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
              mainTab === 'categories' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Tag className="inline mr-2" size={16} />
            Catégories ({categories.filter(c => c.status !== 'archived').length})
          </button>
        </div>

        <div className="flex border-b border-slate-200 mb-6">
          <button
            onClick={() => setViewMode('active')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              viewMode === 'active' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Actifs ({mainTab === 'products' ? products.filter(p => p.status !== 'archived').length : categories.filter(c => c.status !== 'archived').length})
          </button>
          <button
            onClick={() => setViewMode('archived')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              viewMode === 'archived' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Archivés ({mainTab === 'products' ? products.filter(p => p.status === 'archived').length : categories.filter(c => c.status === 'archived').length})
          </button>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder={mainTab === 'products' ? 'Rechercher un produit...' : 'Rechercher une catégorie...'}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
            />
          </div>
          {mainTab === 'products' && viewMode === 'active' && (
            <div className="relative">
              <Filter size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm bg-white"
              >
                <option value="all">Toutes les catégories</option>
                {activeCategories.map(cat => (
                  <option key={cat.$id} value={cat.$id}>{cat.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {loading ? (
          <div className="text-center py-12 text-slate-500">Chargement...</div>
        ) : mainTab === 'categories' ? (
          filteredCategories.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-12 text-center">
              <Tag size={48} className="mx-auto text-slate-300 mb-4" />
              <h3 className="text-lg font-semibold text-slate-700 mb-2">Aucune catégorie {viewMode === 'active' ? 'active' : 'archivée'}</h3>
              {viewMode === 'active' && hasPermission('products.create') && (
                <button onClick={handleOpenAddCategory} className="inline-flex items-center space-x-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 text-sm mt-4">
                  <Plus size={16} /><span>Créer une catégorie</span>
                </button>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b">
                    <tr>
                      <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Nom</th>
                      <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Description</th>
                      <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Produits liés</th>
                      <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Statut</th>
                      <th className="text-right px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredCategories.map(cat => {
                      const linkedProducts = products.filter(p => p.categoryId === cat.$id && p.status !== 'archived').length;
                      return (
                        <tr key={cat.$id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-4">
                            <div className="font-medium text-slate-900 flex items-center gap-2">
                              <Tag size={16} className="text-indigo-500" />
                              {cat.name}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-600">{cat.description || '-'}</td>
                          <td className="px-6 py-4">
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-700 bg-indigo-50 px-2 py-1 rounded">
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
                            <div className="flex items-center justify-end space-x-2">
                              {viewMode === 'active' ? (
                                <>
                                  {hasPermission('products.edit') && (
                                    <button onClick={() => handleOpenEditCategory(cat)} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="Modifier">
                                      <Edit2 size={16} />
                                    </button>
                                  )}
                                  {hasPermission('products.delete') && (
                                    <button onClick={() => handleArchiveCategory(cat.$id, cat.name)} className="p-2 text-slate-400 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors" title="Archiver">
                                      <Archive size={16} />
                                    </button>
                                  )}
                                </>
                              ) : (
                                <button onClick={() => handleUnarchiveCategory(cat.$id, cat.name)} className="inline-flex items-center space-x-1 px-3 py-1.5 text-sm font-medium text-green-700 bg-green-50 rounded-lg hover:bg-green-100 transition-colors">
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
          )
        ) : (
          filteredProducts.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-12 text-center">
              <Package size={48} className="mx-auto text-slate-300 mb-4" />
              <h3 className="text-lg font-semibold text-slate-700 mb-2">Aucun produit {viewMode === 'active' ? 'actif' : 'archivé'}</h3>
              <p className="text-slate-500 mb-4">Importez vos produits depuis un fichier Excel/CSV ou créez-les manuellement.</p>
              {viewMode === 'active' && hasPermission('products.create') && (
                <div className="flex gap-2 justify-center">
                  <button onClick={handleOpenImport} className="inline-flex items-center space-x-2 bg-amber-600 text-white px-4 py-2 rounded-lg hover:bg-amber-700 text-sm">
                    <Upload size={16} /><span>Importer</span>
                  </button>
                  <button onClick={handleOpenAddProduct} className="inline-flex items-center space-x-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 text-sm">
                    <Plus size={16} /><span>Créer un produit</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b">
                    <tr>
                      <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Réf.</th>
                      <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Nom</th>
                      <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Catégorie</th>
                      <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Prix unitaire</th>
                      <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Unité</th>
                      <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase">TVA</th>
                      <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Statut</th>
                      <th className="text-right px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredProducts.map(prod => (
                      <tr key={prod.$id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center gap-1 text-xs font-mono font-semibold text-indigo-700 bg-indigo-50 px-2 py-1 rounded">
                            <Hash size={12} />
                            {prod.reference || '—'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-medium text-slate-900">{prod.name}</div>
                          {prod.description && <div className="text-xs text-slate-500 mt-1 line-clamp-1">{prod.description}</div>}
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600">
                          {prod.category ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-indigo-700 bg-indigo-50 px-2 py-1 rounded">
                              <Tag size={12} />
                              {prod.category.name}
                            </span>
                          ) : '-'}
                        </td>
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center gap-1 text-sm font-semibold text-slate-900">
                            <DollarSign size={14} className="text-green-600" />
                            {fm(prod.unitPrice)}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600">{prod.unit}</td>
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center gap-1 text-sm font-medium text-slate-700">
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
                          <div className="flex items-center justify-end space-x-2">
                            {viewMode === 'active' ? (
                              <>
                                {hasPermission('products.edit') && (
                                  <button onClick={() => handleOpenEditProduct(prod)} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="Modifier">
                                    <Edit2 size={16} />
                                  </button>
                                )}
                                {hasPermission('products.delete') && (
                                  <button onClick={() => handleArchiveProduct(prod.$id, prod.name)} className="p-2 text-slate-400 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors" title="Archiver">
                                    <Archive size={16} />
                                  </button>
                                )}
                              </>
                            ) : (
                              <button onClick={() => handleUnarchiveProduct(prod.$id, prod.name)} className="inline-flex items-center space-x-1 px-3 py-1.5 text-sm font-medium text-green-700 bg-green-50 rounded-lg hover:bg-green-100 transition-colors">
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
          )
        )}
      </div>

      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b bg-white">
              <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <Upload className="text-amber-600" size={24} />
                {importStep === 'upload' && 'Importer des produits'}
                {importStep === 'preview' && 'Prévisualisation de l\'import'}
                {importStep === 'importing' && 'Import en cours...'}
                {importStep === 'done' && 'Import terminé'}
              </h2>
              <button 
                onClick={() => setShowImportModal(false)} 
                disabled={importing}
                className="p-2 hover:bg-slate-100 rounded-lg disabled:opacity-50"
              >
                <X size={20} className="text-slate-500" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {importStep === 'upload' && (
                <div className="space-y-6">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <p className="text-sm text-blue-900">
                      <strong>💡 Astuce :</strong> Téléchargez le modèle Excel pour voir le format attendu, puis remplissez-le avec vos produits.
                    </p>
                    <button 
                      onClick={handleDownloadTemplate}
                      className="mt-3 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-700 bg-white border border-blue-300 rounded-lg hover:bg-blue-50"
                    >
                      <Download size={16} />
                      Télécharger le modèle Excel
                    </button>
                  </div>

                  <div 
                    className="border-2 border-dashed border-slate-300 rounded-lg p-12 text-center hover:border-amber-500 transition-colors cursor-pointer"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <FileSpreadsheet size={48} className="mx-auto text-slate-400 mb-4" />
                    <h3 className="text-lg font-semibold text-slate-700 mb-2">
                      Cliquez pour sélectionner un fichier
                    </h3>
                    <p className="text-sm text-slate-500 mb-4">
                      Formats supportés : <strong>.csv</strong>, <strong>.xlsx</strong>, <strong>.xls</strong>
                    </p>
                    <p className="text-xs text-slate-400">
                      Colonnes attendues : Référence, Désignation, Description, Prix, Unité, TVA, Catégorie
                    </p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv,.xlsx,.xls"
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                  </div>

                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                    <h4 className="text-sm font-semibold text-slate-700 mb-2">📋 Colonnes reconnues (flexibles) :</h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
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
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-center">
                      <p className="text-xs text-slate-500 uppercase font-semibold">Total lignes</p>
                      <p className="text-2xl font-bold text-slate-900 mt-1">{importStats.total}</p>
                    </div>
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                      <p className="text-xs text-green-700 uppercase font-semibold">Importables</p>
                      <p className="text-2xl font-bold text-green-700 mt-1">{importStats.valid}</p>
                    </div>
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-center">
                      <p className="text-xs text-amber-700 uppercase font-semibold">Doublons</p>
                      <p className="text-2xl font-bold text-amber-700 mt-1">{importStats.duplicates}</p>
                    </div>
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
                      <p className="text-xs text-red-700 uppercase font-semibold">Erreurs</p>
                      <p className="text-2xl font-bold text-red-700 mt-1">{importStats.errors}</p>
                    </div>
                  </div>

                  {importStats.errors > 0 && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                      <p className="text-sm text-red-800 font-semibold flex items-center gap-2">
                        <AlertCircle size={16} />
                        {importStats.errors} ligne(s) contiennent des erreurs et ne seront pas importées.
                      </p>
                    </div>
                  )}

                  {importStats.duplicates > 0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                      <p className="text-sm text-amber-800 font-semibold flex items-center gap-2">
                        <AlertCircle size={16} />
                        {importStats.duplicates} doublon(s) détecté(s) et ignoré(s).
                      </p>
                    </div>
                  )}

                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <div className="overflow-x-auto max-h-96">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 border-b sticky top-0">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500">Ligne</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500">Statut</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500">Réf.</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500">Désignation</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500">Prix</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500">Unité</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500">TVA</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500">Catégorie</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500">Détail</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {importedProducts.map((p, idx) => (
                            <tr key={idx} className={
                              p.status === 'valid' ? 'bg-white' :
                              p.status === 'duplicate' ? 'bg-amber-50' : 'bg-red-50'
                            }>
                              <td className="px-3 py-2 text-xs text-slate-500">{p.rowIndex}</td>
                              <td className="px-3 py-2">
                                {p.status === 'valid' && <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700"><CheckCircle2 size={14} />OK</span>}
                                {p.status === 'duplicate' && <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700"><AlertCircle size={14} />Doublon</span>}
                                {p.status === 'error' && <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700"><AlertCircle size={14} />Erreur</span>}
                              </td>
                              <td className="px-3 py-2 text-xs font-mono text-slate-600">{p.reference || '-'}</td>
                              <td className="px-3 py-2 font-medium text-slate-900">{p.name}</td>
                              <td className="px-3 py-2 text-xs text-slate-700">{p.unitPrice.toFixed(2)} €</td>
                              <td className="px-3 py-2 text-xs text-slate-600">{p.unit}</td>
                              <td className="px-3 py-2 text-xs text-slate-600">{p.tvaRate}%</td>
                              <td className="px-3 py-2 text-xs text-slate-600">{p.categoryName || '-'}</td>
                              <td className="px-3 py-2 text-xs">
                                {p.error && <span className="text-red-600">{p.error}</span>}
                                {p.duplicateOf && <span className="text-amber-600">{p.duplicateOf}</span>}
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
                  <p className="text-lg font-semibold text-slate-700">Import en cours...</p>
                  <p className="text-sm text-slate-500 mt-2">Veuillez patienter, {importStats.valid} produits sont en cours de création.</p>
                </div>
              )}

              {importStep === 'done' && (
                <div className="text-center py-12">
                  <CheckCircle2 size={64} className="mx-auto text-green-600 mb-4" />
                  <h3 className="text-xl font-bold text-slate-900 mb-2">Import terminé !</h3>
                  <p className="text-slate-600">
                    <strong className="text-green-700">{importResult.success}</strong> produit(s) importé(s) avec succès.
                    {importResult.failed > 0 && (
                      <> <strong className="text-red-700">{importResult.failed}</strong> erreur(s).</>
                    )}
                  </p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t bg-slate-50">
              {importStep === 'upload' && (
                <button 
                  onClick={() => setShowImportModal(false)} 
                  className="px-4 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
                >
                  Annuler
                </button>
              )}
              {importStep === 'preview' && (
                <>
                  <button 
                    onClick={() => { setImportStep('upload'); setImportedProducts([]); }}
                    className="px-4 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
                  >
                    ← Choisir un autre fichier
                  </button>
                  <button 
                    onClick={handleConfirmImport}
                    disabled={importStats.valid === 0}
                    className="px-4 py-2.5 text-sm font-semibold text-white bg-amber-600 rounded-lg hover:bg-amber-700 disabled:opacity-50 flex items-center gap-2"
                  >
                    <Upload size={16} />
                    Importer {importStats.valid} produit(s)
                  </button>
                </>
              )}
              {importStep === 'done' && (
                <button 
                  onClick={() => setShowImportModal(false)}
                  className="px-4 py-2.5 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
                >
                  Fermer
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {showCategoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-xl font-bold text-slate-900">
                {editingCategoryId ? 'Modifier la catégorie' : 'Nouvelle catégorie'}
              </h2>
              <button onClick={() => setShowCategoryModal(false)} className="p-2 hover:bg-slate-100 rounded-lg">
                <X size={20} className="text-slate-500" />
              </button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nom *</label>
                <input
                  type="text"
                  value={categoryForm.name}
                  onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm"
                  placeholder="Ex: Plomberie, Électricité..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                <textarea
                  value={categoryForm.description}
                  onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm"
                  placeholder="Description optionnelle..."
                />
              </div>
            </div>
            <div className="flex items-center justify-end space-x-3 px-6 py-4 border-t bg-slate-50 rounded-b-xl">
              <button onClick={() => setShowCategoryModal(false)} className="px-4 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50">Annuler</button>
              <button onClick={handleSaveCategory} disabled={savingCategory || !categoryForm.name.trim()} className="px-4 py-2.5 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                {savingCategory ? 'Enregistrement...' : editingCategoryId ? 'Mettre à jour' : 'Créer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showProductModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white z-10">
              <h2 className="text-xl font-bold text-slate-900">
                {editingProductId ? 'Modifier le produit' : 'Nouveau produit'}
              </h2>
              <button onClick={() => setShowProductModal(false)} className="p-2 hover:bg-slate-100 rounded-lg">
                <X size={20} className="text-slate-500" />
              </button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Nom *</label>
                  <input type="text" value={productForm.name} onChange={(e) => setProductForm({ ...productForm, name: e.target.value })} className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm" placeholder="Ex: Installation WC standard" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Référence</label>
                  <input type="text" value={productForm.reference} onChange={(e) => setProductForm({ ...productForm, reference: e.target.value })} className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm" placeholder="Ex: WC-001" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                <textarea value={productForm.description} onChange={(e) => setProductForm({ ...productForm, description: e.target.value })} rows={3} className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm" placeholder="Description détaillée..." />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Catégorie</label>
                <select value={productForm.categoryId} onChange={(e) => setProductForm({ ...productForm, categoryId: e.target.value })} className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white">
                  <option value="">-- Aucune catégorie --</option>
                  {activeCategories.map(cat => (<option key={cat.$id} value={cat.$id}>{cat.name}</option>))}
                </select>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Prix unitaire HT *</label>
                  <input type="number" step="0.01" min="0" value={productForm.unitPrice} onChange={(e) => setProductForm({ ...productForm, unitPrice: e.target.value })} className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm" placeholder="0.00" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Unité</label>
                  <select value={productForm.unit} onChange={(e) => setProductForm({ ...productForm, unit: e.target.value })} className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white">
                    {unitOptions.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">TVA (%)</label>
                  <select value={productForm.tvaRate} onChange={(e) => setProductForm({ ...productForm, tvaRate: e.target.value })} className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white">
                    {tvaOptions.map(t => <option key={t} value={t}>{t}%</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end space-x-3 px-6 py-4 border-t bg-slate-50 rounded-b-xl sticky bottom-0">
              <button onClick={() => setShowProductModal(false)} className="px-4 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50">Annuler</button>
              <button onClick={handleSaveProduct} disabled={savingProduct || !productForm.name.trim() || !productForm.unitPrice} className="px-4 py-2.5 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                {savingProduct ? 'Enregistrement...' : editingProductId ? 'Mettre à jour' : 'Créer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}