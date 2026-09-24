import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { databases, DATABASE_ID } from '../appwrite';
import { Query } from 'appwrite';
import { CheckCircle, Download, Printer, AlertCircle } from 'lucide-react';

export default function InvoicePublic() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [invoice, setInvoice] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [received, setReceived] = useState(false);

  useEffect(() => {
    loadInvoice();
  }, [token]);

  const loadInvoice = async () => {
    try {
      const response = await databases.listDocuments(DATABASE_ID, 'invoices', [
        Query.equal('clientToken', token),
        Query.limit(1)
      ]);

      if (response.documents.length === 0) {
        setError('Facture introuvable ou lien expiré.');
      } else {
        setInvoice(response.documents[0]);
      }
    } catch (err: any) {
      setError('Erreur lors du chargement.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmReceipt = async () => {
    try {
      await databases.updateDocument(DATABASE_ID, 'invoices', invoice.$id, {
        status: 'received',
        receivedAt: new Date().toISOString()
      });
      setReceived(true);
      alert('Merci ! Réception confirmée.');
    } catch (err: any) {
      alert('Erreur: ' + err.message);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-50">Chargement...</div>;

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-lg shadow p-8 max-w-md text-center">
          <AlertCircle size={48} className="text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-slate-900 mb-2">Facture introuvable</h1>
          <p className="text-slate-600">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 py-8 px-4 print:bg-white print:py-0">
      <div className="max-w-4xl mx-auto bg-white shadow-lg rounded-lg overflow-hidden print:shadow-none">
        {/* En-tête */}
        <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white p-8 print:bg-purple-600">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-bold mb-2">FACTURE</h1>
              <p className="text-purple-100 text-lg">{invoice.invoiceNumber}</p>
            </div>
            <div className="text-right">
              <h2 className="text-xl font-bold">{invoice.companyName || 'Mon Entreprise'}</h2>
              <p className="text-purple-100 text-sm whitespace-pre-line">{invoice.companyAddress}</p>
              {invoice.companySiret && <p className="text-purple-100 text-sm">SIRET: {invoice.companySiret}</p>}
            </div>
          </div>
        </div>

        {/* Infos client et dates */}
        <div className="p-8 grid grid-cols-2 gap-8 border-b">
          <div>
            <h3 className="text-xs font-semibold text-slate-500 uppercase mb-2">Facturé à</h3>
            <p className="text-lg font-semibold text-slate-900">{invoice.clientName}</p>
            <p className="text-slate-600">{invoice.clientEmail}</p>
          </div>
          <div className="text-right">
            <div className="mb-3">
              <h3 className="text-xs font-semibold text-slate-500 uppercase">Date d'émission</h3>
              <p className="text-slate-900">{new Date(invoice.createdAt).toLocaleDateString('fr-FR')}</p>
            </div>
            <div>
              <h3 className="text-xs font-semibold text-slate-500 uppercase">Date d'échéance</h3>
              <p className="text-slate-900 font-semibold">{new Date(invoice.dueDate).toLocaleDateString('fr-FR')}</p>
            </div>
          </div>
        </div>

        {/* Tableau des lignes */}
        <div className="p-8">
          <table className="w-full">
            <thead>
              <tr className="border-b-2 border-slate-200">
                <th className="text-left py-3 text-xs font-semibold text-slate-500 uppercase">Description</th>
                <th className="text-right py-3 text-xs font-semibold text-slate-500 uppercase">Qté</th>
                <th className="text-right py-3 text-xs font-semibold text-slate-500 uppercase">Prix unit.</th>
                <th className="text-right py-3 text-xs font-semibold text-slate-500 uppercase">Total</th>
              </tr>
            </thead>
            <tbody>
              {(invoice.lines || []).map((line: any, idx: number) => (
                <tr key={idx} className="border-b border-slate-100">
                  <td className="py-4 text-slate-900">{line.description}</td>
                  <td className="py-4 text-right text-slate-600">{line.quantity}</td>
                  <td className="py-4 text-right text-slate-600">{line.unitPrice.toFixed(2)} €</td>
                  <td className="py-4 text-right font-semibold text-slate-900">{(line.quantity * line.unitPrice).toFixed(2)} €</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totaux */}
          <div className="mt-8 flex justify-end">
            <div className="w-72 space-y-2">
              <div className="flex justify-between text-slate-600">
                <span>Sous-total HT :</span>
                <span>{invoice.subtotal?.toFixed(2) || 0} €</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>TVA (20%) :</span>
                <span>{invoice.tva?.toFixed(2) || 0} €</span>
              </div>
              <div className="flex justify-between text-xl font-bold text-purple-600 border-t-2 border-purple-600 pt-2 mt-2">
                <span>Total TTC :</span>
                <span>{invoice.total?.toFixed(2) || 0} €</span>
              </div>
            </div>
          </div>
        </div>

        {/* Pied de page */}
        <div className="bg-slate-50 p-8 border-t">
          <div className="flex justify-between items-center flex-wrap gap-4">
            <div className="text-sm text-slate-500">
              <p className="font-semibold mb-1">Conditions de paiement</p>
              <p>Paiement à réception. Retard : pénalités de 3 fois le taux d'intérêt légal.</p>
            </div>
            <div className="flex gap-2 print:hidden">
              <button onClick={handlePrint} className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 flex items-center gap-2">
                <Printer size={16} /> Imprimer / PDF
              </button>
            </div>
          </div>

          {/* Bouton accusé de réception */}
          {!received && invoice.status !== 'paid' && (
            <div className="mt-6 pt-6 border-t border-slate-200">
              <p className="text-sm text-slate-600 mb-3">Vous avez reçu cette facture ? Confirmez la réception :</p>
              <button onClick={handleConfirmReceipt} className="bg-green-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-green-700 flex items-center gap-2">
                <CheckCircle size={16} /> J'ai bien reçu cette facture
              </button>
            </div>
          )}
          {received && (
            <div className="mt-6 pt-6 border-t border-slate-200">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-2 text-green-700">
                <CheckCircle size={20} />
                <span className="font-medium">Merci ! Votre accusé de réception a bien été enregistré.</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}