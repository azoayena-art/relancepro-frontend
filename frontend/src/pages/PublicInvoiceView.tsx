import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { databases, DATABASE_ID } from '../appwrite';
import { Query } from 'appwrite';
import { Download, Receipt, AlertCircle, CheckCircle2, Clock } from 'lucide-react';
import { getFilePreviewUrl } from '../utils/storage';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

interface InvoiceItem {
  id: string; reference: string; description: string; quantity: number;
  unit: string; unitPrice: number; tvaRate: number; total: number; discount: number;
}

interface InvoiceData {
  $id: string;
  invoiceNumber: string;
  status: string;
  issueDate: string;
  dueDate?: string;
  paidAt?: string;
  receivedAt?: string; // ✅ NOUVEAU
  subtotal: number;
  vatRate: number;
  vatAmount: number;
  total: number;
  discount: number;
  tax: number;
  deposit: number;
  balance: number;
  companyName?: string;
  companyAddress?: string;
  companyPhone?: string;
  companyEmail?: string;
  companySiret?: string;
  companyTva?: string;
  logoFileId?: string;
  clientName?: string;
  clientAddress?: string;
  clientEmail?: string;
  clientPhone?: string;
  items?: string;
  paymentMethods?: string;
  paymentConditions?: string;
  executionDelay?: string;
  tradeType?: string;
  insuranceName?: string;
  insurancePolicy?: string;
  insuranceAddress?: string;
}

export default function PublicInvoiceView() {
  const { token } = useParams();
  const [invoice, setInvoice] = useState<InvoiceData | null>(null);
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [isAcknowledging, setIsAcknowledging] = useState(false); // ✅ NOUVEAU

  useEffect(() => {
    const fetchInvoice = async () => {
      try {
        if (!token) throw new Error('Token manquant');
        const response = await databases.listDocuments(
          DATABASE_ID, 'invoices',
          [Query.equal('clientToken', token)]
        );
        if (response.documents.length === 0) throw new Error('Facture introuvable ou lien expiré.');
        
        const doc = response.documents[0] as unknown as InvoiceData;
        setInvoice(doc);
        try { setItems(doc.items ? JSON.parse(doc.items) : []); } catch (e) { setItems([]); }
      } catch (err: any) {
        setError(err.message || 'Une erreur est survenue.');
      } finally { setLoading(false); }
    };
    fetchInvoice();
  }, [token]);

  const getDueStatus = () => {
    if (!invoice?.dueDate) return null;
    if (invoice.status === 'paid') return { label: 'Payée', color: 'text-green-700 bg-green-100', icon: CheckCircle2 };
    
    const today = new Date();
    const dueDate = new Date(invoice.dueDate);
    const diffDays = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return { label: `En retard de ${Math.abs(diffDays)} jour(s)`, color: 'text-red-700 bg-red-100', icon: AlertCircle };
    if (diffDays === 0) return { label: 'Échéance aujourd\'hui', color: 'text-orange-700 bg-orange-100', icon: Clock };
    return { label: `Échéance dans ${diffDays} jour(s)`, color: 'text-blue-700 bg-blue-100', icon: Clock };
  };

  // ✅ NOUVEAU : Fonction pour accuser réception
  const handleAcknowledgeReceipt = async () => {
    if (!invoice) return;
    setIsAcknowledging(true);
    try {
      const now = new Date().toISOString();
      await databases.updateDocument(DATABASE_ID, 'invoices', invoice.$id, {
        receivedAt: now
      });
      // Mettre à jour l'état local pour afficher immédiatement le changement
      setInvoice({ ...invoice, receivedAt: now });
      alert('Merci ! Votre accusé de réception a bien été enregistré.');
    } catch (err: any) {
      console.error('Erreur accusé de réception:', err);
      alert('Une erreur est survenue. Veuillez réessayer.');
    } finally {
      setIsAcknowledging(false);
    }
  };

  const generatePDF = async () => {
    if (!invoice) return;
    setGeneratingPdf(true);
    try {
      const doc = new jsPDF({ unit: 'mm', format: 'a4' });
      const W = 210;
      const M = 20;
      
      const pdfSubtotal = invoice.subtotal || 0;
      const pdfDiscount = invoice.discount || 0;
      const pdfTax = invoice.tax || 0;
      const pdfTotal = invoice.total || 0;
      const pdfDeposit = invoice.deposit || 0;
      const pdfBalance = invoice.balance || 0;
      const pdfDiscountAmount = pdfSubtotal * (pdfDiscount / 100);
      const pdfTaxableAmount = pdfSubtotal - pdfDiscountAmount;
      const pdfIsTvaApplicable = !(invoice.companyTva || '').includes('non applicable');

      let logoB64: string | null = null;
      if (invoice.logoFileId) {
        try {
          const u = getFilePreviewUrl('company_logos', invoice.logoFileId);
          const b = await fetch(u).then(r => r.blob());
          logoB64 = await new Promise<string>((rs, rj) => {
            const rd = new FileReader();
            rd.onloadend = () => rs(rd.result as string);
            rd.onerror = rj;
            rd.readAsDataURL(b);
          });
        } catch(e) {}
      }

      let Y = M;
      if (logoB64) {
        try {
          const format = logoB64.includes('image/png') ? 'PNG' : 'JPEG';
          doc.addImage(logoB64, format, M, Y, 30, 15);
        } catch (e) {}
      }

      doc.setFontSize(14);
      doc.setFont(undefined, 'bold');
      doc.text(invoice.companyName || '', M, Y + 22);
      
      doc.setFontSize(8);
      doc.setFont(undefined, 'normal');
      let infoY = Y + 27;
      if (invoice.companyAddress) { doc.text(invoice.companyAddress, M, infoY); infoY += 4; }
      if (invoice.companyPhone) { doc.text(`Tél: ${invoice.companyPhone}`, M, infoY); infoY += 4; }
      if (invoice.companyEmail) { doc.text(`Email: ${invoice.companyEmail}`, M, infoY); infoY += 4; }
      if (invoice.companySiret) { doc.text(`SIRET: ${invoice.companySiret}`, M, infoY); infoY += 4; }
      if (invoice.companyTva && !invoice.companyTva.includes('non')) { doc.text(`TVA: ${invoice.companyTva}`, M, infoY); infoY += 4; }

      const rX = W - M;
      doc.setFontSize(16);
      doc.setFont(undefined, 'bold');
      doc.text(`FACTURE N° ${invoice.invoiceNumber}`, rX, Y + 5, { align: 'right' });
      
      doc.setFontSize(8);
      doc.setFont(undefined, 'normal');
      doc.text(`Date: ${invoice.issueDate}`, rX, Y + 10, { align: 'right' });
      if (invoice.dueDate) doc.text(`Échéance: ${invoice.dueDate}`, rX, Y + 14, { align: 'right' });

      const clientBoxX = rX - 60;
      const clientBoxY = Y + 18;
      doc.setDrawColor(150);
      doc.setLineWidth(0.3);
      doc.rect(clientBoxX, clientBoxY, 60, 22);
      doc.setFontSize(8);
      doc.setFont(undefined, 'bold');
      doc.text('CLIENT', clientBoxX + 2, clientBoxY + 4);
      doc.setFont(undefined, 'normal');
      doc.setFontSize(9);
      doc.text(invoice.clientName || '', clientBoxX + 2, clientBoxY + 9);
      if (invoice.clientAddress) doc.text(invoice.clientAddress.substring(0, 50), clientBoxX + 2, clientBoxY + 13);
      if (invoice.clientEmail) doc.text(invoice.clientEmail, clientBoxX + 2, clientBoxY + 17);

      Y = Math.max(infoY, clientBoxY + 25) + 5;

      const tableData = items.map(i => {
        const lineDiscount = i.discount || 0;
        const lineTotal = i.quantity * i.unitPrice * (1 - lineDiscount / 100);
        return [
          i.reference || '-',
          i.description,
          i.quantity.toFixed(2),
          i.unit,
          i.unitPrice.toFixed(2) + ' €',
          lineDiscount + '%',
          lineTotal.toFixed(2) + ' €',
          i.tvaRate + '%'
        ];
      });

      autoTable(doc, {
        startY: Y,
        head: [['Réf.', 'Désignation', 'Qté', 'Unité', 'Prix U HT', 'Remise', 'Total HT', 'TVA']],
        body: tableData,
        theme: 'grid',
        margin: { left: M, right: M },
        headStyles: { fillColor: [37, 99, 235], textColor: 255, fontSize: 8, fontStyle: 'bold' },
        styles: { fontSize: 8, cellPadding: 2, lineColor: [200, 200, 200], lineWidth: 0.2 },
        columnStyles: {
          0: { cellWidth: 15 }, 1: { cellWidth: 60 }, 2: { cellWidth: 12, halign: 'center' },
          3: { cellWidth: 12, halign: 'center' }, 4: { cellWidth: 18, halign: 'right' },
          5: { cellWidth: 12, halign: 'right' }, 6: { cellWidth: 18, halign: 'right', fontStyle: 'bold' },
          7: { cellWidth: 12, halign: 'right' }
        }
      });

      let ty = (doc as any).lastAutoTable.finalY + 8;
      const totalsX = W - M - 60;
      doc.setFontSize(8);
      doc.setFont(undefined, 'normal');
      doc.setTextColor(0, 0, 0);
      
      const totalLine = (label: string, value: string, bold = false, color: number[] = [0, 0, 0]) => {
        doc.setFont(undefined, bold ? 'bold' : 'normal');
        doc.setTextColor(color[0], color[1], color[2]);
        doc.text(label, totalsX, ty);
        doc.text(value, W - M, ty, { align: 'right' });
        doc.setDrawColor(200);
        doc.setLineWidth(0.2);
        doc.line(totalsX, ty + 1, W - M, ty + 1);
        ty += 5;
      };

      totalLine('Total HT', `${pdfSubtotal.toFixed(2)} €`);
      if (pdfDiscount > 0) totalLine(`Remise globale ${pdfDiscount}%`, `- ${pdfDiscountAmount.toFixed(2)} €`, false, [220, 38, 38]);
      totalLine('Total HT après remise', `${pdfTaxableAmount.toFixed(2)} €`);
      totalLine('Total TVA', `${pdfTax.toFixed(2)} €`);
      
      doc.setFont(undefined, 'bold');
      doc.setTextColor(0, 0, 0);
      doc.text('Total TTC', totalsX, ty);
      doc.text(`${pdfTotal.toFixed(2)} €`, W - M, ty, { align: 'right' });
      doc.setDrawColor(0);
      doc.setLineWidth(0.5);
      doc.line(totalsX, ty + 1.5, W - M, ty + 1.5);
      ty += 6;
      
      if (pdfDeposit > 0) {
        totalLine('Acompte versé', `- ${pdfDeposit.toFixed(2)} €`);
        doc.setTextColor(37, 99, 235);
        doc.setFont(undefined, 'bold');
        doc.text('NET À PAYER', totalsX, ty);
        doc.text(`${pdfBalance.toFixed(2)} €`, W - M, ty, { align: 'right' });
        ty += 6;
      }

      if (invoice.paymentMethods || invoice.paymentConditions || invoice.executionDelay) {
        ty += 5;
        doc.setFontSize(10);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(0, 0, 0);
        doc.text('Conditions de règlement', M, ty);
        doc.setDrawColor(150);
        doc.setLineWidth(0.3);
        doc.line(M, ty + 1, W - M, ty + 1);
        ty += 6;
        doc.setFontSize(8);
        doc.setFont(undefined, 'normal');
        if (invoice.paymentMethods) { doc.text(`Mode: ${invoice.paymentMethods}`, M, ty); ty += 4; }
        if (invoice.paymentConditions) { doc.text(`Conditions: ${invoice.paymentConditions}`, M, ty); ty += 4; }
        if (invoice.executionDelay) { doc.text(`Délai: ${invoice.executionDelay}`, M, ty); ty += 4; }
        ty += 2;
        doc.setFont(undefined, 'italic');
        doc.setTextColor(100, 100, 100);
        doc.text('Pénalités de retard : 3x le taux d\'intérêt légal (loi 2008-776).', M, ty);
        ty += 4;
        doc.text('Indemnité forfaitaire pour frais de recouvrement : 40€ (art D.441-5).', M, ty);
        ty += 4;
      }

      if (invoice.tradeType || invoice.insuranceName) {
        ty += 5;
        doc.setFontSize(10);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(0, 0, 0);
        doc.text('Assurances', M, ty);
        doc.setDrawColor(150);
        doc.setLineWidth(0.3);
        doc.line(M, ty + 1, W - M, ty + 1);
        ty += 6;
        doc.setFontSize(8);
        doc.setFont(undefined, 'normal');
        if (invoice.tradeType) { doc.text(`Garantie: ${invoice.tradeType}`, M, ty); ty += 4; }
        if (invoice.insuranceName) { doc.text(`Assureur: ${invoice.insuranceName}`, M, ty); ty += 4; }
        if (invoice.insurancePolicy) { doc.text(`N° Police: ${invoice.insurancePolicy}`, M, ty); ty += 4; }
        if (invoice.insuranceAddress) { doc.text(`Adresse: ${invoice.insuranceAddress}`, M, ty); ty += 4; }
      }

      if (!pdfIsTvaApplicable && invoice.companyTva) {
        doc.setFontSize(7);
        doc.setFont(undefined, 'italic');
        doc.setTextColor(100, 100, 100);
        doc.text(invoice.companyTva, M, 285);
      }

      doc.save(`Facture_${invoice.invoiceNumber}.pdf`);
    } catch (e) {
      console.error('Erreur PDF:', e);
      alert('Erreur lors de la génération du PDF.');
    } finally {
      setGeneratingPdf(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="text-slate-500">Chargement de la facture...</div></div>;
  }

  if (error || !invoice) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white p-8 rounded-xl shadow-lg text-center max-w-md">
          <AlertCircle size={48} className="mx-auto text-red-500 mb-4" />
          <h2 className="text-xl font-bold text-slate-900 mb-2">Lien invalide</h2>
          <p className="text-slate-600">{error || 'Cette facture n\'est pas accessible.'}</p>
        </div>
      </div>
    );
  }

  const isTvaApplicable = !(invoice.companyTva || '').includes('non applicable');
  const fm = (a: number) => `${a.toFixed(2)} €`;
  const dueStatus = getDueStatus();

  return (
    <div className="min-h-screen bg-slate-100 py-8 px-4">
      <div className="max-w-4xl mx-auto bg-white shadow-lg">
        {dueStatus && (
          <div className={`${dueStatus.color} px-6 py-3 flex items-center justify-between`}>
            <div className="flex items-center gap-2">
              <dueStatus.icon size={18} />
              <span className="font-semibold text-sm">{dueStatus.label}</span>
            </div>
            {invoice.status !== 'paid' && (
              <span className="text-sm font-bold">
                Reste à payer : {fm(invoice.balance || invoice.total || 0)}
              </span>
            )}
          </div>
        )}

        <div className="p-10 border-b border-slate-200">
          <div className="flex justify-between items-start">
            <div className="flex-1">
              {invoice.logoFileId && (
                <img 
                  src={`https://cloud.appwrite.io/v1/storage/buckets/company_logos/files/${invoice.logoFileId}/view?project=${import.meta.env.VITE_APPWRITE_PROJECT_ID}`}
                  alt="Logo" 
                  className="h-16 mb-3 object-contain"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              )}
              <h1 className="text-lg font-bold text-slate-900">{invoice.companyName || 'Entreprise'}</h1>
              <div className="text-xs text-slate-600 mt-2 space-y-0.5">
                {invoice.companyAddress && <p>{invoice.companyAddress}</p>}
                {invoice.companyPhone && <p>Tél: {invoice.companyPhone}</p>}
                {invoice.companyEmail && <p>Email: {invoice.companyEmail}</p>}
                {invoice.companySiret && <p>SIRET: {invoice.companySiret}</p>}
                {invoice.companyTva && !invoice.companyTva.includes('non') && <p>TVA: {invoice.companyTva}</p>}
              </div>
            </div>

            <div className="text-right">
              <h2 className="text-xl font-bold text-slate-900 mb-2">FACTURE N° {invoice.invoiceNumber}</h2>
              <div className="text-xs text-slate-600 space-y-0.5 mb-4">
                <p>Date: {invoice.issueDate}</p>
                {invoice.dueDate && <p>Échéance: {invoice.dueDate}</p>}
                {invoice.paidAt && <p className="text-green-600 font-semibold">Payée le: {invoice.paidAt.split('T')[0]}</p>}
              </div>
              
              <div className="border border-slate-300 p-3 text-left inline-block min-w-[200px]">
                <p className="text-xs font-bold text-slate-700 mb-1">CLIENT</p>
                <p className="text-sm text-slate-900">{invoice.clientName}</p>
                {invoice.clientAddress && <p className="text-xs text-slate-600">{invoice.clientAddress}</p>}
                {invoice.clientEmail && <p className="text-xs text-slate-600">{invoice.clientEmail}</p>}
              </div>
            </div>
          </div>
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
                <span className="font-medium">{fm(invoice.subtotal || 0)}</span>
              </div>
              {(invoice.discount || 0) > 0 && (
                <div className="flex justify-between py-1 border-b border-slate-200 text-red-600">
                  <span>Remise globale {invoice.discount}%</span>
                  <span>- {fm((invoice.subtotal || 0) * (invoice.discount || 0) / 100)}</span>
                </div>
              )}
              <div className="flex justify-between py-1 border-b border-slate-200">
                <span>Total HT après remise</span>
                <span className="font-medium">{fm((invoice.subtotal || 0) - (invoice.subtotal || 0) * (invoice.discount || 0) / 100)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-200">
                <span>Total TVA</span>
                <span className="font-medium">{fm(invoice.tax || 0)}</span>
              </div>
              <div className="flex justify-between py-2 border-b-2 border-slate-900 font-bold text-sm">
                <span>Total TTC</span>
                <span>{fm(invoice.total || 0)}</span>
              </div>
              {(invoice.deposit || 0) > 0 && (
                <>
                  <div className="flex justify-between py-1 border-b border-slate-200">
                    <span>Acompte versé</span>
                    <span>- {fm(invoice.deposit || 0)}</span>
                  </div>
                  <div className="flex justify-between py-2 font-bold text-blue-700">
                    <span>NET À PAYER</span>
                    <span>{fm(invoice.balance || 0)}</span>
                  </div>
                </>
              )}
            </div>
          </div>

          {(invoice.paymentMethods || invoice.paymentConditions || invoice.executionDelay) && (
            <div className="mt-8">
              <h3 className="text-sm font-bold text-slate-900 mb-2 border-b border-slate-300 pb-1">Conditions de règlement</h3>
              <div className="text-xs text-slate-700 space-y-1">
                {invoice.paymentMethods && <p>Mode: {invoice.paymentMethods}</p>}
                {invoice.paymentConditions && <p>Conditions: {invoice.paymentConditions}</p>}
                {invoice.executionDelay && <p>Délai: {invoice.executionDelay}</p>}
                <p className="mt-2 text-slate-500 italic">Pénalités de retard : 3x le taux d'intérêt légal (loi 2008-776). Indemnité forfaitaire pour frais de recouvrement : 40€ (art D.441-5).</p>
              </div>
            </div>
          )}

          {(invoice.tradeType || invoice.insuranceName) && (
            <div className="mt-6">
              <h3 className="text-sm font-bold text-slate-900 mb-2 border-b border-slate-300 pb-1">Assurances</h3>
              <div className="text-xs text-slate-700 space-y-1">
                {invoice.tradeType && <p>Garantie: {invoice.tradeType}</p>}
                {invoice.insuranceName && <p>Assureur: {invoice.insuranceName}</p>}
                {invoice.insurancePolicy && <p>N° Police: {invoice.insurancePolicy}</p>}
                {invoice.insuranceAddress && <p>Adresse: {invoice.insuranceAddress}</p>}
              </div>
            </div>
          )}

          {!isTvaApplicable && invoice.companyTva && (
            <p className="text-xs italic text-slate-500 mt-8">{invoice.companyTva}</p>
          )}
        </div>

        {/* ✅ NOUVEAU : Zone d'action avec accusé de réception */}
        <div className="bg-slate-50 border-t border-slate-200 p-8">
          <div className="max-w-md mx-auto space-y-4">
            
            {/* Bouton d'accusé de réception (s'affiche seulement si pas encore reçu) */}
            {!invoice.receivedAt && (
              <button
                onClick={handleAcknowledgeReceipt}
                disabled={isAcknowledging}
                className="w-full flex items-center justify-center gap-2 bg-green-600 text-white font-semibold py-4 rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors shadow-sm"
              >
                {isAcknowledging ? (
                  <span className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full"></span>
                ) : (
                  <CheckCircle2 size={20} />
                )}
                {isAcknowledging ? 'Enregistrement...' : "✅ J'ai bien reçu cette facture"}
              </button>
            )}

            {/* Message de confirmation (s'affiche une fois reçu) */}
            {invoice.receivedAt && (
              <div className="w-full flex items-center justify-center gap-2 bg-green-50 text-green-700 font-semibold py-4 rounded-lg border border-green-200">
                <CheckCircle2 size={20} />
                Reçue le {new Date(invoice.receivedAt).toLocaleDateString('fr-FR', { 
                  day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' 
                })}
              </div>
            )}

            <button
              onClick={generatePDF}
              disabled={generatingPdf}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white font-semibold py-4 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm"
            >
              {generatingPdf ? (
                <>
                  <span className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full"></span>
                  Génération du PDF...
                </>
              ) : (
                <>
                  <Download size={20} />
                  Télécharger la facture en PDF
                </>
              )}
            </button>
            
            <p className="text-xs text-slate-500 text-center">
              Ce document fait office de facture officielle. Conservez-le pour votre comptabilité.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}