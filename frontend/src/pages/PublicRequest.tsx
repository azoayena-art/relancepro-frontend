import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { databases, DATABASE_ID } from '../appwrite';
import { Query, ID as AppwriteID } from 'appwrite';
import { Building2, CheckCircle2, AlertCircle, Send } from 'lucide-react';

export default function PublicRequest() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [company, setCompany] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    address: '',
    needs: ''
  });
  const [rgpdAccepted, setRgpdAccepted] = useState(false);

  useEffect(() => {
    const fetchCompany = async () => {
      try {
        const response = await databases.listDocuments(
          DATABASE_ID,
          'company_settings',
          [Query.equal('publicSlug', slug)]
        );
        if (response.documents.length > 0) {
          setCompany(response.documents[0]);
        }
      } catch (err) {
        console.error('Erreur chargement entreprise:', err);
      } finally {
        setLoading(false);
      }
    };
    if (slug) fetchCompany();
  }, [slug]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rgpdAccepted) {
      setError('Vous devez accepter les conditions pour être recontacté.');
      return;
    }
    if (!form.firstName || !form.phone) {
      setError('Le prénom et le téléphone sont obligatoires.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      // ✅ ÉTAPE 1 : Vérifier si un prospect existe déjà avec cet email ou ce téléphone
      // CORRECTION : On filtre par 'teamId' pour correspondre à la logique de la page Prospects
      let existingProspect = null;
      if (form.email || form.phone) {
        const response = await databases.listDocuments(DATABASE_ID, 'prospects', [
          Query.equal('teamId', company.teamId) 
        ]);
        
        existingProspect = response.documents.find((p: any) => 
          (form.email && p.email === form.email) || (form.phone && p.phone === form.phone)
        );
      }

      // ✅ ÉTAPE 2 : Mise à jour intelligente (on écrase seulement les cases remplies)
      if (existingProspect) {
        const newData = {
          firstName: form.firstName || existingProspect.firstName,
          lastName: form.lastName || existingProspect.lastName,
          phone: form.phone || existingProspect.phone,
          email: form.email || existingProspect.email,
          address: form.address || existingProspect.address,
          needs: form.needs 
            ? `[${new Date().toLocaleDateString('fr-FR')}] ${form.needs}\n---\n${existingProspect.needs || ''}` 
            : existingProspect.needs,
          source: 'website',
          status: 'new',
          teamId: company.teamId // ✅ CORRECTION : Utiliser teamId au lieu de user
        };

        await databases.updateDocument(DATABASE_ID, 'prospects', existingProspect.$id, newData);
        console.log('✅ Prospect existant mis à jour intelligemment.');
      } else {
        // ✅ ÉTAPE 3 : Création d'un nouveau prospect si aucun doublon
        const newData = {
          firstName: form.firstName,
          lastName: form.lastName,
          phone: form.phone,
          email: form.email,
          address: form.address,
          needs: form.needs,
          source: 'website',
          status: 'new',
          teamId: company.teamId // ✅ CORRECTION : Utiliser teamId au lieu de user
        };

        await databases.createDocument(DATABASE_ID, 'prospects', AppwriteID.unique(), newData);
        console.log('✅ Nouveau prospect créé.');
      }

      setSuccess(true);
    } catch (err: any) {
      console.error('❌ Erreur détaillée Appwrite:', err);
      setError('Une erreur est survenue. Veuillez réessayer ou contacter l\'artisan par téléphone.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="text-slate-500">Chargement...</div></div>;
  }

  if (!company) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white p-8 rounded-xl shadow-lg text-center max-w-md">
          <AlertCircle size={48} className="mx-auto text-red-500 mb-4" />
          <h2 className="text-xl font-bold text-slate-900 mb-2">Lien invalide</h2>
          <p className="text-slate-600">Cette page de demande n'existe pas ou a été supprimée.</p>
          <button onClick={() => navigate('/')} className="mt-6 text-blue-600 font-medium hover:underline">Retour à l'accueil</button>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white p-8 rounded-xl shadow-lg text-center max-w-md">
          <CheckCircle2 size={48} className="mx-auto text-green-500 mb-4" />
          <h2 className="text-xl font-bold text-slate-900 mb-2">Demande envoyée !</h2>
          <p className="text-slate-600 mb-6">Merci {form.firstName}. <strong>{company.name}</strong> a bien reçu votre demande et vous recontactera très prochainement au {form.phone}.</p>
          <button onClick={() => window.location.reload()} className="text-blue-600 font-medium hover:underline">Envoyer une autre demande</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto bg-white rounded-xl shadow-lg overflow-hidden">
        <div className="bg-blue-600 p-6 text-center text-white">
          <Building2 size={48} className="mx-auto mb-3 opacity-80" />
          <h1 className="text-2xl font-bold">{company.name}</h1>
          <p className="text-blue-100 mt-1">{company.legalForm} • {company.address}</p>
          {company.phone && <p className="text-blue-100 text-sm mt-1">📞 {company.phone}</p>}
        </div>

        <div className="p-6 sm:p-8">
          <h2 className="text-xl font-semibold text-slate-900 mb-6 text-center">Demandez votre devis gratuit</h2>
          
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6 flex items-center gap-2 text-sm">
              <AlertCircle size={16} /> {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Prénom *</label>
                <input required type="text" value={form.firstName} onChange={e => setForm({...form, firstName: e.target.value})} className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nom *</label>
                <input required type="text" value={form.lastName} onChange={e => setForm({...form, lastName: e.target.value})} className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Téléphone *</label>
              <input required type="tel" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm" placeholder="06 12 34 56 78" />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
              <input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm" placeholder="votre@email.com" />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Adresse du chantier (optionnel)</label>
              <input type="text" value={form.address} onChange={e => setForm({...form, address: e.target.value})} className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm" />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Décrivez votre besoin</label>
              <textarea value={form.needs} onChange={e => setForm({...form, needs: e.target.value})} rows={4} className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm" placeholder="Ex: Rénovation complète de la salle de bain, environ 5m²..."></textarea>
            </div>

            <div className="flex items-start gap-3 pt-2">
              <input type="checkbox" id="rgpd" checked={rgpdAccepted} onChange={e => setRgpdAccepted(e.target.checked)} className="mt-1 w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500" />
              <label htmlFor="rgpd" className="text-xs text-slate-600">
                J'accepte que mes données soient traitées par <strong>{company.name}</strong> afin d'être recontacté pour ma demande de devis, conformément à la politique de confidentialité. *
              </label>
            </div>

            <button type="submit" disabled={submitting} className="w-full bg-blue-600 text-white font-semibold py-3 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
              {submitting ? 'Envoi en cours...' : <><Send size={18} /> Envoyer ma demande</>}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}