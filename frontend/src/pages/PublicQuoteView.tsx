import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { databases, DATABASE_ID } from '../appwrite';
import { Query, ID, Permission, Role } from 'appwrite';
import { CheckCircle2, XCircle, AlertCircle, Send, PenTool } from 'lucide-react';

interface QuoteItem {
  id: string; reference: string; description: string; quantity: number;
  unit: string; unitPrice: number; tvaRate: number; total: number; discount: number;
}

interface QuoteData {
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
  insuranceAddress?: string; insurancePolicy?: string;
  clientComment?: string; clientSignature?: string;
  prospectId?: string;
  teamId?: string;
  userId?: string;
  notes?: string;
  clientToken?: string;
}

export default function PublicQuoteView() {
  const { token } = useParams();
  const [quote, setQuote] = useState<QuoteData | null>(null);
  const [items, setItems] = useState<QuoteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [action, setAction] = useState<'accept' | 'refuse' | null>(null);
  const [refuseComment, setRefuseComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [newClientId, setNewClientId] = useState<string | null>(null);
  
  const sigCanvas = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  useEffect(() => {
    const fetchQuote = async () => {
      try {
        if (!token) throw new Error('Token manquant');
        
        // ✅ SÉCURITÉ : Récupérer le devis UNIQUEMENT via le token (pas par ID)
        const response = await databases.listDocuments(DATABASE_ID, 'quotes', [
          Query.equal('clientToken', token),
          Query.limit(1) // ✅ Limiter à 1 résultat pour éviter les fuites
        ]);
        
        if (response.documents.length === 0) {
          throw new Error('Devis introuvable ou lien expiré.');
        }
        
        const doc = response.documents[0] as unknown as QuoteData;
        
        // ✅ VÉRIFICATION : Le devis doit avoir un teamId valide
        if (!doc.teamId) {
          throw new Error('Devis invalide : équipe non trouvée.');
        }
        
        // ✅ VÉRIFICATION : Le token doit correspondre exactement
        if (doc.clientToken !== token) {
          throw new Error('Token invalide.');
        }
        
        setQuote(doc);
        try { 
          setItems(doc.items ? JSON.parse(doc.items) : []); 
        } catch (e) { 
          setItems([]); 
        }
        
        if (doc.status === 'Accepté' || doc.status === 'Refusé') {
          setSuccess(true);
        }
        
        // ✅ AUDIT : Logger l'accès public au devis
        console.log(`📊 Accès public au devis ${doc.quoteNumber} (Team: ${doc.teamId})`);
        
      } catch (err: any) {
        console.error('Erreur fetchQuote:', err);
        setError(err.message || 'Une erreur est survenue.');
      } finally {
        setLoading(false);
      }
    };
    
    fetchQuote();
  }, [token]);

  useEffect(() => {
    if (!sigCanvas.current || action !== 'accept') return;
    const canvas = sigCanvas.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';

    const getPos = (e: MouseEvent | TouchEvent) => {
      const rect = canvas.getBoundingClientRect();
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      return { x: clientX - rect.left, y: clientY - rect.top };
    };

    const start = (e: MouseEvent | TouchEvent) => {
      e.preventDefault();
      setIsDrawing(true);
      const { x, y } = getPos(e);
      ctx.beginPath();
      ctx.moveTo(x, y);
    };
    const draw = (e: MouseEvent | TouchEvent) => {
      if (!isDrawing) return;
      e.preventDefault();
      const { x, y } = getPos(e);
      ctx.lineTo(x, y);
      ctx.stroke();
    };
    const stop = () => setIsDrawing(false);

    canvas.addEventListener('mousedown', start);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stop);
    canvas.addEventListener('mouseleave', stop);
    canvas.addEventListener('touchstart', start);
    canvas.addEventListener('touchmove', draw);
    canvas.addEventListener('touchend', stop);

    return () => {
      canvas.removeEventListener('mousedown', start);
      canvas.removeEventListener('mousemove', draw);
      canvas.removeEventListener('mouseup', stop);
      canvas.removeEventListener('mouseleave', stop);
      canvas.removeEventListener('touchstart', start);
      canvas.removeEventListener('touchmove', draw);
      canvas.removeEventListener('touchend', stop);
    };
  }, [action, isDrawing]);

  const getSignatureData = () => {
    if (!sigCanvas.current) return null;
    return sigCanvas.current.toDataURL('image/png');
  };

  const clearSignature = () => {
    if (!sigCanvas.current) return;
    const ctx = sigCanvas.current.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, sigCanvas.current.width, sigCanvas.current.height);
  };

  const handleAccept = async () => {
    if (!quote) return;
    
    // ✅ VÉRIFICATION DE SÉCURITÉ : Le devis n'a pas déjà été traité
    if (quote.status === 'Accepté' || quote.status === 'Refusé') {
      alert('Ce devis a déjà été traité.');
      return;
    }
    
    const signature = getSignatureData();
    
    setSubmitting(true);
    try {
      // ✅ SÉCURITÉ : Mise à jour avec SEULEMENT les champs autorisés
      // (pas de modification du montant, des items, etc.)
      await databases.updateDocument(DATABASE_ID, 'quotes', quote.$id, {
        status: 'Accepté',
        acceptedAt: new Date().toISOString(),
        clientSignature: signature || '',
        clientComment: ''
      });

      // ✅ AUDIT : Logger l'acceptation publique
      console.log(`✅ Devis ${quote.quoteNumber} accepté publiquement (Team: ${quote.teamId})`);

      // Conversion automatique si c'est un prospect
      if (quote.prospectId && quote.teamId) {
        try {
          const prospectDoc = await databases.getDocument(DATABASE_ID, 'prospects', quote.prospectId);
          
          // ✅ VÉRIFICATION : Le prospect doit appartenir à la même équipe que le devis
          if (prospectDoc.teamId !== quote.teamId) {
            console.error('⚠️ Tentative de conversion cross-équipe bloquée');
            throw new Error('Sécurité : Prospect et devis dans des équipes différentes');
          }
          
          if (prospectDoc.status !== 'won') {
            const currentYear = new Date().getFullYear();
            const prefix = `CLI-${currentYear}-`;
            let maxNum = 0;
            
            const existingClients = await databases.listDocuments(DATABASE_ID, 'clients', [
              Query.equal('teamId', quote.teamId),
              Query.limit(2000)
            ]);
            
            existingClients.documents.forEach((doc: any) => {
              if (doc.clientId && doc.clientId.startsWith(prefix)) {
                const num = parseInt(doc.clientId.replace(prefix, ''), 10);
                if (!isNaN(num) && num > maxNum) maxNum = num;
              }
            });
            
            const generatedClientId = `${prefix}${String(maxNum + 1).padStart(3, '0')}`;
            
            // ✅ SÉCURITÉ : Création du client avec permissions appropriées
            // Note: Ceci nécessite que la collection 'clients' permette Create pour Any au niveau collection
            await databases.createDocument(
              DATABASE_ID, 
              'clients', 
              ID.unique(), 
              {
                teamId: quote.teamId,
                userId: quote.userId,
                clientId: generatedClientId,
                type: prospectDoc.companyName ? 'entreprise' : 'particulier',
                firstName: prospectDoc.firstName,
                lastName: prospectDoc.lastName,
                companyName: prospectDoc.companyName || '',
                email: prospectDoc.email || '',
                phone: prospectDoc.phone || '',
                address: prospectDoc.address || '',
                notes: `Converti automatiquement après acceptation du devis ${quote.quoteNumber}.\nNotes d'origine: ${prospectDoc.notes || 'Aucune'}`,
                status: 'active',
                prospectId: quote.prospectId
              },
              [
                // ✅ Permissions pour que l'équipe propriétaire puisse gérer ce client
                Permission.read(Role.team(quote.teamId)),
                Permission.update(Role.team(quote.teamId)),
                Permission.delete(Role.team(quote.teamId))
              ]
            );
            
            await databases.updateDocument(DATABASE_ID, 'prospects', quote.prospectId, {
              status: 'won',
              lastContactDate: new Date().toISOString().split('T')[0],
              notes: `${prospectDoc.notes || ''}\n\n✅ Devis ${quote.quoteNumber} accepté le ${new Date().toLocaleDateString('fr-FR')}\n🎉 Converti automatiquement en client ${generatedClientId}`
            });
            
            setNewClientId(generatedClientId);
            console.log(`✅ Prospect converti automatiquement en client ${generatedClientId}`);
          }
        } catch (e) {
          console.error('Erreur conversion automatique:', e);
          // On continue même si la conversion échoue, le devis est quand même accepté
        }
      }

      setQuote({ ...quote, status: 'Accepté' });
      setSuccess(true);
    } catch (e: any) {
      console.error('Erreur handleAccept:', e);
      alert(`Erreur: ${e.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRefuse = async () => {
    if (!quote || !refuseComment.trim()) { 
      alert('Veuillez indiquer la raison du refus.'); 
      return; 
    }
    
    // ✅ VÉRIFICATION DE SÉCURITÉ : Le devis n'a pas déjà été traité
    if (quote.status === 'Accepté' || quote.status === 'Refusé') {
      alert('Ce devis a déjà été traité.');
      return;
    }
    
    setSubmitting(true);
    try {
      // ✅ SÉCURITÉ : Mise à jour avec SEULEMENT les champs autorisés
      await databases.updateDocument(DATABASE_ID, 'quotes', quote.$id, {
        status: 'Refusé', 
        clientComment: refuseComment, 
        validatedAt: new Date().toISOString()
      });

      // ✅ AUDIT : Logger le refus public
      console.log(`❌ Devis ${quote.quoteNumber} refusé publiquement (Team: ${quote.teamId})`);

      if (quote.prospectId && quote.teamId) {
        try {
          const prospectDoc = await databases.getDocument(DATABASE_ID, 'prospects', quote.prospectId);
          
          // ✅ VÉRIFICATION : Le prospect doit appartenir à la même équipe
          if (prospectDoc.teamId !== quote.teamId) {
            console.error('⚠️ Tentative de modification cross-équipe bloquée');
            throw new Error('Sécurité : Prospect et devis dans des équipes différentes');
          }
          
          await databases.updateDocument(DATABASE_ID, 'prospects', quote.prospectId, {
            status: 'contacted',
            lastContactDate: new Date().toISOString().split('T')[0],
            notes: `${prospectDoc.notes || ''}\n\n❌ Devis ${quote.quoteNumber} refusé le ${new Date().toLocaleDateString('fr-FR')}\nMotif : ${refuseComment}`
          });
        } catch (e) {
          console.error('Erreur mise à jour prospect:', e);
        }
      }

      setQuote({ ...quote, status: 'Refusé' });
      setSuccess(true);
    } catch (err: any) {
      console.error('Erreur handleRefuse:', err);
      setError('Erreur lors du refus. Veuillez réessayer.');
    } finally { 
      setSubmitting(false); 
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="text-slate-500">Chargement du devis...</div></div>;
  
  if (error || !quote) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white p-8 rounded-xl shadow-lg text-center max-w-md">
          <XCircle size={48} className="mx-auto text-red-500 mb-4" />
          <h2 className="text-xl font-bold text-slate-900 mb-2">Lien invalide</h2>
          <p className="text-slate-600">{error || 'Ce devis n\'est pas accessible.'}</p>
        </div>
      </div>
    );
  }

  if (success) {
    const isAccepted = quote.status === 'Accepté';
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white p-8 rounded-xl shadow-lg text-center max-w-md">
          {isAccepted ? <CheckCircle2 size={48} className="mx-auto text-green-500 mb-4" /> : <XCircle size={48} className="mx-auto text-orange-500 mb-4" />}
          <h2 className="text-xl font-bold text-slate-900 mb-2">{isAccepted ? 'Devis accepté !' : 'Devis refusé'}</h2>
          <p className="text-slate-600 mb-2">
            {isAccepted 
              ? `Merci ! Votre accord a bien été enregistré. ${quote.companyName} va procéder à la suite des opérations.` 
              : 'Votre retour a bien été pris en compte. L\'artisan va étudier vos remarques et vous recontacter.'}
          </p>
          {isAccepted && newClientId && (
            <p className="text-sm text-green-700 bg-green-50 border border-green-200 p-3 rounded-lg mt-3">
              <strong>Votre fiche client a été créée automatiquement</strong><br/>
              N° Client : <span className="font-mono font-bold">{newClientId}</span>
            </p>
          )}
          <button onClick={() => window.close()} className="mt-6 text-blue-600 font-medium hover:underline">Fermer la page</button>
        </div>
      </div>
    );
  }

  const isTvaApplicable = !(quote.companyTva || '').includes('non applicable');
  const fm = (a: number) => `${a.toFixed(2)} €`;

  return (
    <div className="min-h-screen bg-slate-100 py-8 px-4">
      <div className="max-w-4xl mx-auto bg-white shadow-lg">
        <div className="p-10 border-b border-slate-200">
          <div className="flex justify-between items-start">
            <div className="flex-1">
              {quote.logoFileId && (
                <img 
                  src={`https://cloud.appwrite.io/v1/storage/buckets/company_logos/files/${quote.logoFileId}/view?project=${import.meta.env.VITE_APPWRITE_PROJECT_ID}`}
                  alt="Logo" 
                  className="h-16 mb-3 object-contain"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              )}
              <h1 className="text-lg font-bold text-slate-900">{quote.companyName || 'Entreprise'}</h1>
              <div className="text-xs text-slate-600 mt-2 space-y-0.5">
                {quote.companyAddress && <p>{quote.companyAddress}</p>}
                {quote.companyPhone && <p>Tél: {quote.companyPhone}</p>}
                {quote.companyEmail && <p>Email: {quote.companyEmail}</p>}
                {quote.companySiret && <p>SIRET: {quote.companySiret}</p>}
                {quote.companyTva && !quote.companyTva.includes('non') && <p>TVA: {quote.companyTva}</p>}
              </div>
            </div>

            <div className="text-right">
              <h2 className="text-xl font-bold text-slate-900 mb-2">DEVIS N° {quote.quoteNumber}</h2>
              <div className="text-xs text-slate-600 space-y-0.5 mb-4">
                <p>Date: {quote.issueDate}</p>
                <p>Valable jusqu'au: {quote.validityDate}</p>
              </div>
              
              <div className="border border-slate-300 p-3 text-left inline-block min-w-[200px]">
                <p className="text-xs font-bold text-slate-700 mb-1">CLIENT</p>
                <p className="text-sm text-slate-900">{quote.clientName}</p>
                {quote.clientAddress && <p className="text-xs text-slate-600">{quote.clientAddress}</p>}
                {quote.clientEmail && <p className="text-xs text-slate-600">{quote.clientEmail}</p>}
              </div>
            </div>
          </div>

          {quote.subject && (
            <div className="text-center mt-6">
              <h3 className="text-base font-bold text-slate-900">Objet: {quote.subject}</h3>
            </div>
          )}
        </div>

        <div className="p-10 pt-6">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-blue-600 text-white">
                <th className="border border-slate-300 px-2 py-2 text-left">Réf.</th>
                <th className="border border-slate-300 px-2 py-2 text-left">Désignation</th>
                <th className="border border-slate-300 px-2 py-2 text-center">Qté</th>
                <th className="border border-slate-300 px-2 py-2 text-center">Unité</th>
                <th className="border border-slate-300 px-2 py-2 text-right">Prix U HT</th>
                <th className="border border-slate-300 px-2 py-2 text-right">Remise</th>
                <th className="border border-slate-300 px-2 py-2 text-right">Total HT</th>
                <th className="border border-slate-300 px-2 py-2 text-right">TVA</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => {
                const lineDiscount = item.discount || 0;
                const lineTotal = item.quantity * item.unitPrice * (1 - lineDiscount / 100);
                return (
                  <tr key={idx} className="hover:bg-slate-50">
                    <td className="border border-slate-300 px-2 py-2">{item.reference || '-'}</td>
                    <td className="border border-slate-300 px-2 py-2">{item.description}</td>
                    <td className="border border-slate-300 px-2 py-2 text-center">{item.quantity.toFixed(2)}</td>
                    <td className="border border-slate-300 px-2 py-2 text-center">{item.unit}</td>
                    <td className="border border-slate-300 px-2 py-2 text-right">{item.unitPrice.toFixed(2)} €</td>
                    <td className="border border-slate-300 px-2 py-2 text-right">{lineDiscount}%</td>
                    <td className="border border-slate-300 px-2 py-2 text-right font-medium">{lineTotal.toFixed(2)} €</td>
                    <td className="border border-slate-300 px-2 py-2 text-right">{item.tvaRate}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="flex justify-end mt-4">
            <div className="w-64 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-200">
                <span>Total HT</span>
                <span className="font-medium">{fm(quote.subtotal || 0)}</span>
              </div>
              {(quote.discount || 0) > 0 && (
                <div className="flex justify-between py-1 border-b border-slate-200 text-red-600">
                  <span>Remise globale {quote.discount}%</span>
                  <span>- {fm((quote.subtotal || 0) * (quote.discount || 0) / 100)}</span>
                </div>
              )}
              <div className="flex justify-between py-1 border-b border-slate-200">
                <span>Total HT après remise</span>
                <span className="font-medium">{fm((quote.subtotal || 0) - (quote.subtotal || 0) * (quote.discount || 0) / 100)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-200">
                <span>Total TVA</span>
                <span className="font-medium">{fm(quote.tax || 0)}</span>
              </div>
              <div className="flex justify-between py-2 border-b-2 border-slate-900 font-bold text-sm">
                <span>Total TTC</span>
                <span>{fm(quote.total || 0)}</span>
              </div>
              {(quote.deposit || 0) > 0 && (
                <>
                  <div className="flex justify-between py-1 border-b border-slate-200">
                    <span>Acompte</span>
                    <span>- {fm(quote.deposit || 0)}</span>
                  </div>
                  <div className="flex justify-between py-2 font-bold text-blue-700">
                    <span>NET À PAYER</span>
                    <span>{fm(quote.balance || 0)}</span>
                  </div>
                </>
              )}
            </div>
          </div>

          {(quote.paymentMethods || quote.paymentConditions || quote.executionDelay) && (
            <div className="mt-8">
              <h3 className="text-sm font-bold text-slate-900 mb-2 border-b border-slate-300 pb-1">Conditions de règlement</h3>
              <div className="text-xs text-slate-700 space-y-1">
                {quote.paymentMethods && <p>Mode: {quote.paymentMethods}</p>}
                {quote.paymentConditions && <p>Conditions: {quote.paymentConditions}</p>}
                {quote.executionDelay && <p>Délai: {quote.executionDelay}</p>}
                <p className="mt-2 text-slate-500 italic">Pénalités de retard : 3x le taux d'intérêt légal (loi 2008-776). Indemnité forfaitaire pour frais de recouvrement : 40€ (art D.441-5).</p>
              </div>
            </div>
          )}

          {(quote.tradeType || quote.insuranceName) && (
            <div className="mt-6">
              <h3 className="text-sm font-bold text-slate-900 mb-2 border-b border-slate-300 pb-1">Assurances</h3>
              <div className="text-xs text-slate-700 space-y-1">
                {quote.tradeType && <p>Garantie: {quote.tradeType}</p>}
                {quote.insuranceName && <p>Assureur: {quote.insuranceName}</p>}
                {quote.insurancePolicy && <p>N° Police: {quote.insurancePolicy}</p>}
                {quote.insuranceAddress && <p>Adresse: {quote.insuranceAddress}</p>}
              </div>
            </div>
          )}

          {quote.clientSignature && quote.bonPourAccord && (
            <div className="mt-6">
              <p className="text-sm font-bold text-slate-900 mb-2">Bon pour accord et signature du client :</p>
              <img src={quote.clientSignature} alt="Signature" className="h-16 border border-slate-300 p-1 bg-white"/>
            </div>
          )}

          {!isTvaApplicable && quote.companyTva && (
            <p className="text-xs italic text-slate-500 mt-8">{quote.companyTva}</p>
          )}
        </div>

        <div className="bg-slate-50 border-t border-slate-200 p-8">
          {!action ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-md mx-auto">
              <button onClick={() => setAction('accept')} className="flex items-center justify-center gap-2 bg-green-600 text-white font-semibold py-4 rounded-lg hover:bg-green-700 transition-colors shadow-sm">
                <CheckCircle2 size={20} /> Accepter et signer
              </button>
              <button onClick={() => setAction('refuse')} className="flex items-center justify-center gap-2 bg-white border-2 border-red-200 text-red-600 font-semibold py-4 rounded-lg hover:bg-red-50 transition-colors shadow-sm">
                <XCircle size={20} /> Refuser
              </button>
            </div>
          ) : action === 'refuse' ? (
            <div className="max-w-md mx-auto bg-red-50 border border-red-200 rounded-lg p-6">
              <h3 className="font-semibold text-red-900 mb-3 flex items-center gap-2">
                <AlertCircle size={18} /> Raison du refus
              </h3>
              <textarea value={refuseComment} onChange={(e) => setRefuseComment(e.target.value)} rows={4} className="w-full px-4 py-3 border border-red-300 rounded-lg focus:ring-2 focus:ring-red-500 outline-none text-sm mb-4" placeholder="Veuillez indiquer pourquoi vous refusez ce devis..." />
              <div className="flex gap-3">
                <button onClick={handleRefuse} disabled={submitting || !refuseComment.trim()} className="flex-1 bg-red-600 text-white font-semibold py-3 rounded-lg hover:bg-red-700 disabled:opacity-50">
                  {submitting ? 'Envoi...' : 'Confirmer le refus'}
                </button>
                <button onClick={() => { setAction(null); setRefuseComment(''); }} className="px-6 py-3 bg-white border border-slate-300 text-slate-700 font-medium rounded-lg hover:bg-slate-50">Annuler</button>
              </div>
            </div>
          ) : (
            <div className="max-w-md mx-auto bg-green-50 border border-green-200 rounded-lg p-6">
              <h3 className="font-semibold text-green-900 mb-3 flex items-center gap-2">
                <PenTool size={18} /> Signature électronique
              </h3>
              <p className="text-sm text-green-800 mb-4">
                En signant ci-dessous, vous acceptez les termes de ce devis et validez la commande.
              </p>
              <div className="bg-white border-2 border-dashed border-green-300 rounded-lg mb-4">
                <canvas ref={sigCanvas} width={400} height={150} className="block w-full touch-none cursor-crosshair" style={{height: '150px'}}/>
              </div>
              <div className="flex gap-3">
                <button onClick={handleAccept} disabled={submitting} className="flex-1 bg-green-600 text-white font-semibold py-3 rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2">
                  {submitting ? 'Validation...' : <><Send size={18} /> Confirmer l'acceptation</>}
                </button>
                <button onClick={() => { setAction(null); clearSignature(); }} className="px-4 py-3 bg-white border border-slate-300 text-slate-700 font-medium rounded-lg hover:bg-slate-50">Annuler</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}