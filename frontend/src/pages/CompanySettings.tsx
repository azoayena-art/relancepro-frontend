import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { databases, DATABASE_ID, storage } from '../appwrite';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { getFilePreviewUrl } from '../utils/storage';
import { Building2, Save, ChevronLeft, AlertCircle, CheckCircle2, Upload, Image as ImageIcon, X, Copy, Lock } from 'lucide-react';
import { ID, Query, Permission, Role } from 'appwrite';

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
    defaultTvaRate: '20', logoFileId: '', publicSlug: ''
  });

  const [logoPreview, setLogoPreview] = useState<string>('');

  useEffect(() => {
    if (!permLoading && !hasPermission('settings.view')) {
      console.warn("⛔ Accès refusé : L'utilisateur n'a pas la permission 'settings.view'");
      navigate('/dashboard');
    }
  }, [permLoading, hasPermission, navigate]);

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    
    // ✅ DEBUG : Vérifier que secureTeamId est disponible
    console.log("🔍 DEBUG CompanySettings - secureTeamId:", user?.secureTeamId);
    
    loadSettings();
  }, [user]);

  const loadSettings = async () => {
    try {
      if (!user?.$id) return;
      
      let teamId = null;
      const teamsRes = await databases.listDocuments(DATABASE_ID, 'teams', [Query.equal('ownerId', user.$id)]);
      if (teamsRes.documents.length > 0) {
        teamId = teamsRes.documents[0].$id;
      } else {
        const membersRes = await databases.listDocuments(DATABASE_ID, 'team_members', [Query.equal('userId', user.$id)]);
        if (membersRes.documents.length > 0) {
          teamId = membersRes.documents[0].teamId;
        }
      }

      if (!teamId) {
        setLoading(false);
        return;
      }
      setCurrentTeamId(teamId);

      let response = await databases.listDocuments(DATABASE_ID, 'company_settings', [Query.equal('teamId', teamId)]);
      
      if (response.documents.length === 0) {
        response = await databases.listDocuments(DATABASE_ID, 'company_settings', [Query.equal('userId', user.$id)]);
      }

      const myDoc = response.documents[0];

      if (myDoc) {
        // ✅ VÉRIFICATION DE SÉCURITÉ : Le document doit appartenir à l'équipe
        if (myDoc.teamId && myDoc.teamId !== teamId) {
          console.warn('⚠️ Tentative d\'accès à des paramètres d\'une autre équipe');
          setExistingDocId(null);
          setFormData({ name: '', legalForm: 'Entreprise Individuelle', address: '', siret: '', rcs: '', tvaNumber: 'TVA non applicable, art. 293 B du CGI', phone: '', email: '', defaultTvaRate: '20', logoFileId: '', publicSlug: '' });
          setLogoPreview('');
        } else {
          setExistingDocId(myDoc.$id);
          setFormData({
            name: myDoc.name || '', legalForm: myDoc.legalForm || 'Entreprise Individuelle',
            address: myDoc.address || '', siret: myDoc.siret || '', rcs: myDoc.rcs || '',
            tvaNumber: myDoc.tvaNumber || 'TVA non applicable, art. 293 B du CGI',
            phone: myDoc.phone || '', email: myDoc.email || '', defaultTvaRate: myDoc.defaultTvaRate || '20',
            logoFileId: myDoc.logoFileId || '', publicSlug: myDoc.publicSlug || ''
          });
          if (myDoc.logoFileId) {
            try { setLogoPreview(getFilePreviewUrl('company_logos', myDoc.logoFileId)); } catch (e) { setLogoPreview(''); }
          }
        }
      } else {
        setExistingDocId(null);
        setFormData({ name: '', legalForm: 'Entreprise Individuelle', address: '', siret: '', rcs: '', tvaNumber: 'TVA non applicable, art. 293 B du CGI', phone: '', email: '', defaultTvaRate: '20', logoFileId: '', publicSlug: '' });
        setLogoPreview('');
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.$id || !currentTeamId) { setError('Erreur de session ou d\'équipe.'); return; }
    
    console.log("🔍 DEBUG CompanySettings handleSubmit - secureTeamId:", user?.secureTeamId);
    
    setSaving(true); setError(''); setSuccess('');

    try {
      const payload = { ...formData, userId: user.$id, teamId: currentTeamId };
      
      // ✅ SÉCURITÉ MAXIMALE : Utilisation du secureTeamId avec fallback
      let perms: string[] = [];
      
      if (user?.secureTeamId) {
        console.log("✅ CompanySettings handleSubmit: Utilisation de la sécurité maximale (secureTeamId)");
        perms = [
          Permission.read(Role.team(user.secureTeamId)),
          Permission.update(Role.team(user.secureTeamId)),
          Permission.delete(Role.team(user.secureTeamId))
        ];
      } else {
        console.warn("⚠️ CompanySettings handleSubmit: secureTeamId manquant, fallback Role.users()");
        perms = [
          Permission.read(Role.users()),
          Permission.update(Role.users()),
          Permission.delete(Role.users())
        ];
      }

      console.log("🚀 CompanySettings handleSubmit: Envoi avec permissions:", perms);

      if (existingDocId) {
        // ✅ VÉRIFICATION : S'assurer que le document appartient à l'équipe avant modification
        const existingDoc = await databases.getDocument(DATABASE_ID, 'company_settings', existingDocId);
        if (existingDoc.teamId && existingDoc.teamId !== currentTeamId) {
          throw new Error('Accès refusé : Ces paramètres n\'appartiennent pas à votre équipe');
        }
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

  if (permLoading) return <div className="min-h-screen flex items-center justify-center bg-gray-50">Vérification des droits...</div>;
  if (!hasPermission('settings.view')) return null;
  if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="text-slate-500">Chargement...</div></div>;

  const canEdit = hasPermission('settings.edit');

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center space-x-4">
          <button onClick={() => navigate('/dashboard')} className="text-slate-400 hover:text-slate-600"><ChevronLeft size={24} /></button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center"><Building2 size={24} className="mr-2 text-blue-600" /> Mon Entreprise</h1>
            <p className="text-sm text-slate-500">Ces informations pré-rempliront automatiquement vos devis et factures.</p>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {!canEdit && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg flex items-center gap-2 mb-6">
            <Lock size={18} />
            <span className="text-sm font-medium">Mode lecture seule. Vous n'avez pas la permission de modifier ces paramètres.</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-6">
          {success && <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg flex items-center gap-2"><CheckCircle2 size={18} /><span className="text-sm font-medium">{success}</span></div>}
          {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2"><AlertCircle size={18} /><span className="text-sm font-medium">{error}</span></div>}

          <div className="border-b border-slate-100 pb-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-2">Logo de l'entreprise <span className="text-sm font-normal text-slate-500">(optionnel)</span></h3>
            <p className="text-sm text-slate-500 mb-4">Ajoutez votre logo pour qu'il apparaisse sur vos devis.</p>
            <div className="flex items-center gap-6">
              <div className="w-32 h-32 border-2 border-dashed border-slate-300 rounded-lg flex items-center justify-center bg-slate-50 overflow-hidden">
                {logoPreview ? <img src={logoPreview} alt="Logo" className="w-full h-full object-contain p-2" /> : <ImageIcon size={40} className="text-slate-300" />}
              </div>
              <div className="flex flex-col gap-2">
                {canEdit && (
                  <>
                    <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/jpg,image/svg+xml,image/webp" onChange={handleLogoUpload} className="hidden" id="logo-upload" />
                    <label htmlFor="logo-upload" className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg cursor-pointer transition-colors ${uploading ? 'bg-slate-100 text-slate-400' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
                      <Upload size={16} /> {uploading ? 'Upload...' : 'Choisir un logo'}
                    </label>
                    {logoPreview && <button type="button" onClick={handleRemoveLogo} className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100"><X size={16} /> Supprimer</button>}
                    <p className="text-xs text-slate-500 mt-1">PNG, JPG, SVG ou WEBP • Max 5 Mo</p>
                  </>
                )}
                {!canEdit && logoPreview && (
                  <p className="text-xs text-slate-500">Logo actuel (lecture seule)</p>
                )}
                {!canEdit && !logoPreview && (
                  <p className="text-xs text-slate-500">Aucun logo défini</p>
                )}
              </div>
            </div>
          </div>

          <div className="border-b border-slate-100 pb-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-2">Lien public de demande de devis</h3>
            <p className="text-sm text-slate-500 mb-4">Partagez ce lien avec vos clients pour qu'ils puissent vous envoyer une demande directement.</p>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 flex items-center">
                <span className="bg-slate-100 border border-r-0 border-slate-300 rounded-l-lg px-3 py-2.5 text-sm text-slate-500 whitespace-nowrap">/demande/</span>
                <input 
                  type="text" 
                  name="publicSlug" 
                  value={formData.publicSlug} 
                  onChange={(e) => setFormData({ ...formData, publicSlug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })} 
                  disabled={!canEdit}
                  className={`flex-1 px-3 py-2.5 border border-slate-300 rounded-r-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm ${!canEdit ? 'bg-slate-50 text-slate-500 cursor-not-allowed' : ''}`} 
                  placeholder="mon-entreprise" 
                />
              </div>
              {formData.publicSlug && (
                <button type="button" onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/demande/${formData.publicSlug}`); setSuccess('Lien copié !'); setTimeout(() => setSuccess(''), 3000); }} className="px-4 py-2.5 text-sm font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 flex items-center justify-center gap-2">
                  <Copy size={16} /> Copier le lien
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="md:col-span-2"><h3 className="text-lg font-semibold text-slate-900 border-b border-slate-100 pb-2 mb-4">Informations générales</h3></div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Nom de l'entreprise *</label>
              <input type="text" name="name" required value={formData.name} onChange={handleChange} disabled={!canEdit} className={`w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm ${!canEdit ? 'bg-slate-50 cursor-not-allowed' : ''}`} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Forme juridique</label>
              <select name="legalForm" value={formData.legalForm} onChange={handleChange} disabled={!canEdit} className={`w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-white ${!canEdit ? 'bg-slate-50 cursor-not-allowed' : ''}`}>
                <option>Entreprise Individuelle</option><option>Micro-entreprise</option><option>SASU</option><option>SARL</option><option>SAS</option><option>EURL</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Adresse complète</label>
              <input type="text" name="address" value={formData.address} onChange={handleChange} disabled={!canEdit} className={`w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm ${!canEdit ? 'bg-slate-50 cursor-not-allowed' : ''}`} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">N° SIRET</label>
              <input type="text" name="siret" value={formData.siret} onChange={handleChange} disabled={!canEdit} className={`w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm ${!canEdit ? 'bg-slate-50 cursor-not-allowed' : ''}`} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">RCS / RM</label>
              <input type="text" name="rcs" value={formData.rcs} onChange={handleChange} disabled={!canEdit} className={`w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm ${!canEdit ? 'bg-slate-50 cursor-not-allowed' : ''}`} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">N° TVA</label>
              <select name="tvaNumber" value={formData.tvaNumber} onChange={handleChange} disabled={!canEdit} className={`w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-white ${!canEdit ? 'bg-slate-50 cursor-not-allowed' : ''}`}>
                <option value="TVA non applicable, art. 293 B du CGI">TVA non applicable</option>
                <option value="FRXX123456789">Assujetti à la TVA</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Taux TVA par défaut (%)</label>
              <select name="defaultTvaRate" value={formData.defaultTvaRate} onChange={handleChange} disabled={!canEdit} className={`w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-white ${!canEdit ? 'bg-slate-50 cursor-not-allowed' : ''}`}>
                <option value="20">20%</option><option value="10">10%</option><option value="5.5">5.5%</option><option value="0">0%</option>
              </select>
            </div>
            <div className="md:col-span-2"><h3 className="text-lg font-semibold text-slate-900 border-b border-slate-100 pb-2 mb-4 mt-4">Coordonnées</h3></div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Téléphone</label>
              <input type="tel" name="phone" value={formData.phone} onChange={handleChange} disabled={!canEdit} className={`w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm ${!canEdit ? 'bg-slate-50 cursor-not-allowed' : ''}`} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
              <input type="email" name="email" value={formData.email} onChange={handleChange} disabled={!canEdit} className={`w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm ${!canEdit ? 'bg-slate-50 cursor-not-allowed' : ''}`} />
            </div>
          </div>

          {canEdit && (
            <div className="flex items-center justify-end space-x-3 pt-6 border-t border-slate-100">
              <button type="button" onClick={() => navigate('/dashboard')} className="px-4 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50">Annuler</button>
              <button type="submit" disabled={saving} className="flex items-center space-x-2 px-4 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {saving ? <><svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg><span>Enregistrement...</span></> : <><Save size={16} /><span>Enregistrer</span></>}
              </button>
            </div>
          )}
        </form>
      </main>
    </div>
  );
}