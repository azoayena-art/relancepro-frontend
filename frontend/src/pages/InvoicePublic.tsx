import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { databases, DATABASE_ID } from '../appwrite';
import { Query } from 'appwrite';
import { CheckCircle, Printer, AlertCircle, FileText } from 'lucide-react';

interface InvoiceItem {
  id: string;
  reference: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  tvaRate: number;
  total: number;
  discount: number;
}

export default function InvoicePublic() {
  const { token } = useParams();
  const [invoice, setInvoice] = useState<any>(null);
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [received, setReceived] = useState(false);
  const [confirming, setConfirming] = useState(false);

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
        const doc = response.documents[0];
        setInvoice(doc);
        setReceived(!!doc.receivedAt);
        
        // ✅ Parsing de la chaîne JSON 'items'
        try {
          const parsedItems = doc.items ? JSON.parse(doc.items) : [];
          setItems(parsedItems);
        } catch (e) {
          setItems([]);
        }
      }
    } catch (err: any) {
      setError('Erreur lors du chargement.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmReceipt = async () => {
    if (!invoice) return;
    setConfirming(true);
    try {
      // ✅ On met à jour UNIQUEMENT receivedAt pour ne pas casser le statut comptable (sent/paid/partial)
      await databases.updateDocument(DATABASE_ID, 'invoices', invoice.$id, {
        receivedAt: new Date().toISOString()
      });
      setReceived(true);
    } catch (err: any) {
      alert('Erreur lors de la confirmation: ' + err.message);
    } finally {
      setConfirming(false);
    }
  };

  const handlePrint = () => window.print();

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="animate-pulse text-slate-500 text-lg">Chargement de la facture...</div>
    </div>
  );

  if (error || !invoice) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md text-center border border-slate-200">
          <AlertCircle size={48} className="text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-slate-900 mb-2">Facture introuvable</h1>
          <p className="text-slate-600">{error || "Le lien que vous avez utilisé n'est pas valide."}</p>
        </div>
      </div>
    );
  }

  const fm = (val: number) => `${(val || 0).toFixed(2)} €`;
  const isTvaApplicable = !(invoice.companyTva || '').toLowerCase().includes('non applicable');

  return (
    <div className="min-h-screen bg-slate-100 py-8 px-4 print:bg-white print:py-0 print:px-0">
      <div className="max-w-4xl mx-auto bg-white shadow-xl rounded-2xl overflow-hidden print:shadow-none print:rounded-none border border-slate-200 print:border-none">
        
        {/* En-tête */}
        <div className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white p-8 print:bg-purple-600">
          <div className="flex flex-col sm:flex-row justify-between items-start gap-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <FileText size={28} />
                <h1 className="text-3xl font-bold">
                  {invoice.type === 'credit' ? 'AVOIR' : invoice.type === 'advance' ? 'ACOMPTE' : 'FACTURE'}
                </h1>
              </div>
              <p className="text-purple-100 text-lg font-mono">{invoice.invoiceNumber}</p>
            </div>
            <div className="text-left sm:text-right">
              <h2 className="text-xl font-bold">{invoice.companyName || 'Mon Entreprise'}</h2>
              <p className="text-purple-100 text-sm whitespace-pre-line mt-1">{invoice.companyAddress}</p>
              {invoice.companySiret && <p className="text-purple-100 text-xs mt-1">SIRET: {invoice.companySiret}</p>}
              {invoice.companyTva && !invoice.companyTva.includes('non') && (
                <p className="text-purple-100 text-xs">TVA: {invoice.companyTva}</p>
              )}
            </div>
          </div>
        </div>

        {/* Infos client et dates */}
        <div className="p-8 grid grid-cols-1 sm:grid-cols-2 gap-8 border-b border-slate-200">
          <div>
            <h3 className="text-xs font-semibold text-slate-500 uppercase mb-2">Facturé à</h3>
            <p className="text-lg font-semibold text-slate-900">{invoice.clientName}</p>
            <p className="text-slate-600 text-sm whitespace-pre-line">{invoice.clientAddress}</p>
            {invoice.clientEmail && <p className="text-slate-500 text-sm mt-1">{invoice.clientEmail}</p>}
          </div>
          <div className="sm:text-right">
            <div className="mb-3">
              <h3 className="text-xs font-semibold text-slate-500 uppercase">Date d'émission</h3>
              {/* ✅ Utilisation de issueDate au lieu de createdAt */}
              <p className="text-slate-900 font-medium">{invoice.issueDate ? new Date(invoice.issueDate).toLocaleDateString('fr-FR') : '-'}</p>
            </div>
            <div>
              <h3 className="text-xs font-semibold text-slate-500 uppercase">Date d'échéance</h3>
              <p className="text-slate-900 font-semibold">{invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString('fr-FR') : '-'}</p>
            </div>
          </div>
        </div>

        {/* Tableau des lignes */}
        <div className="p-8 overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b-2 border-slate-200">
                <th className="text-left py-3 text-xs font-semibold text-slate-500 uppercase">Désignation</th>
                <th className="text-right py-3 text-xs font-semibold text-slate-500 uppercase">Qté</th>
                <th className="text-right py-3 text-xs font-semibold text-slate-500 uppercase">Prix unit. HT</th>
                <th className="text-right py-3 text-xs font-semibold text-slate-500 uppercase">TVA</th>
                <th className="text-right py-3 text-xs font-semibold text-slate-500 uppercase">Total HT</th>
              </tr>
            </thead>
            <tbody>
              {items.length > 0 ? items.map((line: InvoiceItem, idx: number) => {
                const baseTotal = line.quantity * line.unitPrice;
                const discountAmount = baseTotal * ((line.discount || 0) / 100);
                const finalHT = baseTotal - discountAmount;
                
                return (
                  <tr key={idx} className="border-b border-slate-100">
                    <td className="py-4 text-slate-900">
                      <div className="font-medium">{line.description}</div>
                      {line.reference && <div className="text-xs text-slate-500">Réf: {line.reference}</div>}
                    </td>
                    <td className="py-4 text-right text-slate-600">{line.quantity} {line.unit}</td>
                    <td className="py-4 text-right text-slate-600">{fm(line.unitPrice)}</td>
                    <td className="py-4 text-right text-slate-600">{line.tvaRate}%</td>
                    <td className="py-4 text-right font-semibold text-slate-900">
                      {fm(finalHT)}
                      {line.discount > 0 && <div className="text-xs text-red-500">(-{line.discount}%)</div>}
                    </td>
                  </tr>
                );
              }) : (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-500">Aucune ligne de facturation.</td>
                </tr>
              )}
            </tbody>
          </table>

          {/* Totaux */}
          <div className="mt-8 flex justify-end">
            <div className="w-full sm:w-80 space-y-2 text-sm">
              <div className="flex justify-between text-slate-600">
                <span>Total HT :</span>
                <span className="font-medium">{fm(invoice.subtotal)}</span>
              </div>
              {invoice.discount > 0 && (
                <div className="flex justify-between text-red-600">
                  <span>Remise globale ({invoice.discount}%) :</span>
                  <span>- {fm(invoice.subtotal * (invoice.discount / 100))}</span>
                </div>
              )}
              {isTvaApplicable && (
                <div className="flex justify-between text-slate-600">
                  {/* ✅ Utilisation de vatRate et tax */}
                  <span>TVA ({invoice.vatRate || 20}%) :</span>
                  <span>{fm(invoice.tax || invoice.vatAmount)}</span>
                </div>
              )}
              
              <div className="flex justify-between text-xl font-bold text-purple-700 border-t-2 border-purple-600 pt-3 mt-3">
                <span>Total TTC :</span>
                <span>{fm(invoice.total)}</span>
              </div>

              {/* ✅ Gestion des acomptes (Deposit) */}
              {invoice.deposit > 0 && (
                <>
                  <div className="flex justify-between text-blue-600 pt-2 border-t border-slate-200 mt-2">
                    <span>Acompte déjà versé :</span>
                    <span>- {fm(invoice.deposit)}</span>
                  </div>
                  <div className="flex justify-between text-lg font-bold text-slate-900">
                    <span>Net à payer :</span>
                    <span>{fm(invoice.balance)}</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Pied de page */}
        <div className="bg-slate-50 p-8 border-t border-slate-200">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="text-sm text-slate-500 max-w-md">
              <p className="font-semibold mb-1 text-slate-700">Conditions de paiement</p>
              <p>{invoice.paymentConditions || 'Paiement à réception. Retard : pénalités de 3 fois le taux d\'intérêt légal.'}</p>
              {!isTvaApplicable && invoice.companyTva && (
                <p className="mt-2 italic text-xs text-slate-400">{invoice.companyTva}</p>
              )}
            </div>
            <div className="flex gap-2 print:hidden">
              <button onClick={handlePrint} className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 flex items-center gap-2 shadow-sm transition-colors">
                <Printer size={16} /> Imprimer / PDF
              </button>
            </div>
          </div>

          {/* Bouton accusé de réception */}
          {!received && invoice.status !== 'paid' && invoice.status !== 'cancelled' && (
            <div className="mt-6 pt-6 border-t border-slate-200">
              <p className="text-sm text-slate-600 mb-3">Vous avez reçu cette facture ? Confirmez la réception :</p>
              <button 
                onClick={handleConfirmReceipt} 
                disabled={confirming}
                className="bg-green-600 text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-green-700 flex items-center gap-2 shadow-sm transition-colors disabled:opacity-70"
              >
                <CheckCircle size={16} /> 
                {confirming ? 'Confirmation...' : 'J\'ai bien reçu cette facture'}
              </button>
            </div>
          )}
          {received && (
            <div className="mt-6 pt-6 border-t border-slate-200">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3 text-green-700">
                <CheckCircle size={20} className="flex-shrink-0" />
                <div>
                  <p className="font-medium">Accusé de réception enregistré</p>
                  <p className="text-xs text-green-600 mt-0.5">
                    Reçue le {invoice.receivedAt ? new Date(invoice.receivedAt).toLocaleString('fr-FR') : '-'}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}