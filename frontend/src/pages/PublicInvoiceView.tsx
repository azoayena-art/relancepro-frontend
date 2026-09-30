import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { databases, DATABASE_ID } from '../appwrite';
import { Query, ID } from 'appwrite';
import {
  CheckCircle, Download, Printer, AlertCircle, FileText, Receipt,
  FileMinus, TrendingDown, Calendar, Building2, Mail, Phone,
  MapPin, Hash, Euro, Shield
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

interface InvoiceItem {
  id?: string;
  reference?: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  tvaRate: number;
  total: number;
  discount?: number;
}

interface Invoice {
  $id: string;
  teamId?: string;
  invoiceNumber: string;
  type?: string;
  status: string;
  originalInvoiceId?: string;
  originalQuoteId?: string;
  clientToken: string;
  companyName?: string;
  companyLegalForm?: string;
  companyAddress?: string;
  companySiret?: string;
  companyRcs?: string;
  companyTva?: string;
  companyPhone?: string;
  companyEmail?: string;
  logoFileId?: string;
  clientName?: string;
  clientAddress?: string;
  clientBillingAddress?: string;
  clientEmail?: string;
  clientPhone?: string;
  items?: string;
  subtotal?: number;
  discount?: number;
  vatRate?: number;
  vatAmount?: number;
  tax?: number;
  total?: number;
  deposit?: number;
  balance?: number;
  issueDate?: string;
  dueDate?: string;
  paidAt?: string;
  receivedAt?: string;
  $createdAt?: string;
  paymentMethods?: string;
  paymentConditions?: string;
  executionDelay?: string;
  specialConditions?: string;
  tradeType?: string;
  insuranceName?: string;
  insuranceAddress?: string;
  insurancePolicy?: string;
  notes?: string;
}

const typeLabels: Record<string, { label: string; title: string; icon: any }> = {
  standard: { label: 'Facture', title: 'FACTURE', icon: FileText },
  advance: { label: "Facture d'acompte", title: "FACTURE D'ACOMPTE", icon: Receipt },
  balance: { label: 'Facture de solde', title: 'FACTURE DE SOLDE', icon: FileText },
  credit: { label: "Facture d'avoir", title: "FACTURE D'AVOIR", icon: FileMinus }
};

export default function InvoicePublic() {
  const { token } = useParams();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  useEffect(() => {
    loadInvoice();
  }, [token]);

  // ============================================================
  // ✅ HELPERS COMPTABLES — strictement alignés avec Invoices.tsx
  // ============================================================
  const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
  const fm = (n: number) => `${round2(n || 0).toFixed(2)} €`;

  const parseItems = (itemsStr: string | undefined): InvoiceItem[] => {
    if (!itemsStr) return [];
    try {
      const parsed = typeof itemsStr === 'string' ? JSON.parse(itemsStr) : itemsStr;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  const checkSubjectToVAT = (inv: Invoice): boolean => {
    const tva = (inv.companyTva || '').toLowerCase();
    return !!tva && !tva.includes('non applicable');
  };

  const loadInvoice = async () => {
    try {
      setLoading(true);
      const response = await databases.listDocuments(DATABASE_ID, 'invoices', [
        Query.equal('clientToken', token),
        Query.limit(1)
      ]);

      if (response.documents.length === 0) {
        setError('Facture introuvable ou lien expiré.');
      } else {
        const inv = response.documents[0] as unknown as Invoice;
        setInvoice(inv);
        setAcknowledged(!!inv.receivedAt);
      }
    } catch (err: any) {
      console.error('Erreur chargement facture publique:', err);
      setError('Erreur lors du chargement.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmReceipt = async () => {
    if (!invoice) return;
    try {
      await databases.updateDocument(DATABASE_ID, 'invoices', invoice.$id, {
        receivedAt: new Date().toISOString()
      });

      try {
        if (invoice.teamId) {
          await databases.createDocument(DATABASE_ID, 'accounting_events', ID.unique(), {
            teamId: invoice.teamId,
            data: JSON.stringify({
              type: 'client_acknowledged_receipt',
              documentType: 'invoice',
              documentId: invoice.$id,
              documentNumber: invoice.invoiceNumber,
              eventDate: new Date().toISOString(),
              note: 'Réception confirmée via le lien public client'
            })
          });
        }
      } catch { /* collection optionnelle */ }

      setAcknowledged(true);
    } catch (err: any) {
      alert('Erreur: ' + err.message);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPdf = async () => {
    if (!invoice) return;
    setDownloadingPdf(true);
    try {
      const doc = new jsPDF({ unit: 'mm', format: 'a4' });
      const W = 210, M = 20;
      const items = parseItems(invoice.items);
      const invType = invoice.type || 'standard';
      const info = typeLabels[invType] || typeLabels.standard;
      const subjectToVAT = checkSubjectToVAT(invoice);
      const isCredit = invType === 'credit';

      let Y = M;
      doc.setFontSize(18); doc.setFont(undefined, 'bold'); 
      doc.setTextColor(isCredit ? 220 : 147, isCredit ? 38 : 51, isCredit ? 38 : 234);
      doc.text(info.title, M, Y + 8);
      
      doc.setFontSize(10); doc.setFont(undefined, 'normal'); doc.setTextColor(100, 100, 100);
      doc.text(`N° ${invoice.invoiceNumber}`, M, Y + 14);
      
      if (isCredit) {
        const refLine = invoice.notes?.split('\n').find(l => l.startsWith('Référence facture d\'origine : '));
        const ref = refLine ? refLine.replace('Référence facture d\'origine : ', '') : 'N/A';
        const motifLine = invoice.notes?.split('\n').find(l => l.startsWith('MOTIF AVOIR : '));
        const motif = motifLine ? motifLine.replace('MOTIF AVOIR : ', '') : 'Non spécifié';
        doc.text(`Réf. origine : ${ref}`, W - M, Y + 12, { align: 'right' });
        doc.text(`Motif : ${motif}`, W - M, Y + 16, { align: 'right' });
      }
      
      doc.setFontSize(9);
      doc.text(`Date : ${invoice.issueDate ? new Date(invoice.issueDate).toLocaleDateString('fr-FR') : '-'}`, W - M, isCredit ? Y + 22 : Y + 5, { align: 'right' });
      if (invoice.dueDate && !isCredit) doc.text(`Échéance : ${new Date(invoice.dueDate).toLocaleDateString('fr-FR')}`, W - M, isCredit ? Y + 26 : Y + 10, { align: 'right' });

      Y += 24;
      doc.setFontSize(11); doc.setFont(undefined, 'bold'); doc.setTextColor(0, 0, 0);
      doc.text(invoice.companyName || '', M, Y);
      doc.setFontSize(8); doc.setFont(undefined, 'normal');
      if (invoice.companyAddress) doc.text(invoice.companyAddress, M, Y + 5);
      if (invoice.companySiret) doc.text(`SIRET : ${invoice.companySiret}`, M, Y + 9);
      if (invoice.companyTva) doc.text(`TVA : ${invoice.companyTva}`, M, Y + 13);

      const clientBoxX = W - M - 60;
      doc.setDrawColor(150); doc.setLineWidth(0.3);
      doc.rect(clientBoxX, Y - 2, 60, 18);
      doc.setFontSize(8); doc.setFont(undefined, 'bold');
      doc.text('CLIENT', clientBoxX + 2, Y + 2);
      doc.setFont(undefined, 'normal'); doc.setFontSize(9);
      doc.text(invoice.clientName || '', clientBoxX + 2, Y + 6);
      if (invoice.clientAddress) doc.text(invoice.clientAddress.substring(0, 50), clientBoxX + 2, Y + 10);
      if (invoice.clientEmail) doc.text(invoice.clientEmail, clientBoxX + 2, Y + 14);

      Y += 24;

      const tableData = items.map(i => [
        i.reference || '-',
        i.description,
        i.quantity.toFixed(2),
        i.unit,
        `${i.unitPrice.toFixed(2)} €`,
        `${(i.discount || 0).toFixed(0)}%`,
        `${(i.quantity * i.unitPrice * (1 - (i.discount || 0) / 100)).toFixed(2)} €`,
        `${i.tvaRate}%`
      ]);

      autoTable(doc, {
        startY: Y,
        head: [['Réf.', 'Désignation', 'Qté', 'Unité', 'Prix U HT', 'Remise', 'Total HT', 'TVA']],
        body: tableData,
        theme: 'grid',
        margin: { left: M, right: M },
        headStyles: { fillColor: isCredit ? [220, 38, 38] : [147, 51, 234], textColor: 255, fontSize: 8, fontStyle: 'bold' },
        styles: { fontSize: 8, cellPadding: 2 }
      });

      let ty = (doc as any).lastAutoTable.finalY + 8;
      const totalsX = W - M - 60;
      doc.setFontSize(9); doc.setFont(undefined, 'normal'); doc.setTextColor(0, 0, 0);

      const line = (label: string, value: string, bold = false, color: number[] = [0, 0, 0]) => {
        doc.setFont(undefined, bold ? 'bold' : 'normal');
        doc.setTextColor(color[0], color[1], color[2]);
        doc.text(label, totalsX, ty);
        doc.text(value, W - M, ty, { align: 'right' });
        ty += 5;
      };

      line('Total HT', fm(invoice.subtotal || 0));
      if ((invoice.discount || 0) > 0) {
        line(`Remise globale ${invoice.discount}%`, `- ${fm((invoice.subtotal || 0) * (invoice.discount || 0) / 100)}`, false, [220, 38, 38]);
        line('Total HT après remise', fm((invoice.subtotal || 0) * (1 - (invoice.discount || 0) / 100)), true);
      }
      
      if (subjectToVAT) {
        const map = new Map<number, { baseHT: number; taxAmount: number }>();
        items.forEach(i => {
          const base = i.quantity * i.unitPrice * (1 - (i.discount || 0) / 100) * (1 - (invoice.discount || 0) / 100);
          const cur = map.get(i.tvaRate) || { baseHT: 0, taxAmount: 0 };
          cur.baseHT += base;
          cur.taxAmount += base * (i.tvaRate || 0) / 100;
          map.set(i.tvaRate, cur);
        });
        Array.from(map.entries()).sort((a, b) => b[0] - a[0]).forEach(([rate, v]) => {
          line(`TVA ${rate}% (base ${fm(v.baseHT)})`, fm(v.taxAmount));
        });
      }
      
      line('Total TTC', fm(invoice.total || 0), true);
      
      if ((invoice.deposit || 0) > 0) {
        line('Acompte déjà versé', `- ${fm(invoice.deposit || 0)}`, false, [37, 99, 235]);
        ty += 2; doc.setDrawColor(37, 99, 235); doc.setLineWidth(0.8); doc.line(totalsX, ty, W - M, ty); ty += 5;
        doc.setFontSize(11); doc.setFont(undefined, 'bold'); doc.setTextColor(37, 99, 235);
        doc.text('NET À PAYER', totalsX, ty); 
        doc.text(fm(invoice.balance || 0), W - M, ty, { align: 'right' }); 
        ty += 6;
      }

      if (!subjectToVAT && invoice.companyTva) {
        doc.setFontSize(7); doc.setFont(undefined, 'italic'); doc.setTextColor(100, 100, 100);
        doc.text(invoice.companyTva, M, 285);
      }

      doc.save(`${invoice.invoiceNumber}.pdf`);
    } catch (e: any) {
      console.error('Erreur PDF:', e);
      alert('Erreur lors de la génération du PDF');
    } finally {
      setDownloadingPdf(false);
    }
  };

  // ============================================================
  // ✅ CALCULS D'AFFICHAGE
  // ============================================================
  const items = useMemo(() => (invoice ? parseItems(invoice.items) : []), [invoice]);
  const subjectToVAT = useMemo(() => (invoice ? checkSubjectToVAT(invoice) : false), [invoice]);

  const taxBreakdown = useMemo(() => {
    if (!invoice || !subjectToVAT) return [];
    const map = new Map<number, { rate: number; baseHT: number; taxAmount: number }>();
    items.forEach(i => {
      const base = i.quantity * i.unitPrice * (1 - (i.discount || 0) / 100) * (1 - (invoice.discount || 0) / 100);
      const cur = map.get(i.tvaRate) || { rate: i.tvaRate, baseHT: 0, taxAmount: 0 };
      cur.baseHT = round2(cur.baseHT + base);
      cur.taxAmount = round2(cur.taxAmount + base * (i.tvaRate || 0) / 100);
      map.set(i.tvaRate, cur);
    });
    return Array.from(map.values()).sort((a, b) => b.rate - a.rate);
  }, [invoice, items, subjectToVAT]);

  const invType = invoice?.type || 'standard';
  const invInfo = typeLabels[invType] || typeLabels.standard;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="text-slate-500 dark:text-slate-400 text-lg animate-pulse">Chargement de la facture...</div>
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 p-4">
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-8 max-w-md text-center border border-slate-200 dark:border-slate-700">
          <AlertCircle size={48} className="text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Facture introuvable</h1>
          <p className="text-slate-600 dark:text-slate-400">{error || "Ce lien n'est plus valide."}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-900 py-8 px-4 print:bg-white print:py-0">
      <div className="max-w-5xl mx-auto bg-white dark:bg-slate-800 shadow-2xl rounded-2xl overflow-hidden print:shadow-none border border-slate-200 dark:border-slate-700">

        {/* En-tête avec type de document */}
        <div className={`bg-gradient-to-r ${invType === 'credit' ? 'from-red-600 to-red-700' : 'from-purple-600 to-blue-600'} text-white p-6 sm:p-8 print:bg-purple-600`}>
          <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <invInfo.icon size={18} />
                <span className="px-3 py-1 bg-white/20 rounded-full text-xs font-bold uppercase tracking-wide">{invInfo.label}</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold mb-1">{invInfo.title}</h1>
              <p className="text-purple-100 text-lg font-mono">{invoice.invoiceNumber}</p>
            </div>
            <div className="text-left sm:text-right">
              <h2 className="text-xl font-bold">{invoice.companyName || 'Mon Entreprise'}</h2>
              {invoice.companyLegalForm && <p className="text-purple-100 text-xs">{invoice.companyLegalForm}</p>}
              <p className="text-purple-100 text-sm whitespace-pre-line mt-1">{invoice.companyAddress}</p>
              {invoice.companySiret && <p className="text-purple-100 text-xs">SIRET : {invoice.companySiret}</p>}
              {invoice.companyRcs && <p className="text-purple-100 text-xs">RCS : {invoice.companyRcs}</p>}
              {invoice.companyEmail && <p className="text-purple-100 text-xs">{invoice.companyEmail}</p>}
              {invoice.companyPhone && <p className="text-purple-100 text-xs">Tél : {invoice.companyPhone}</p>}
            </div>
          </div>
        </div>

        {/* Bannière AVOIR : motif + référence d'origine */}
        {invType === 'credit' && invoice.notes && (
          <div className="bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800 p-4">
            <div className="flex items-start gap-3">
              <TrendingDown size={20} className="text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-red-900 dark:text-red-200 uppercase mb-1">Facture d'avoir</p>
                <p className="text-sm text-red-800 dark:text-red-300 whitespace-pre-line">
                  {invoice.notes.split('\n').filter(l => l.startsWith('MOTIF') || l.startsWith('Référence')).join('\n') || invoice.notes}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Infos client et dates */}
        <div className="p-6 sm:p-8 grid grid-cols-1 sm:grid-cols-2 gap-6 border-b border-slate-200 dark:border-slate-700">
          <div>
            <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-2 flex items-center gap-1">
              <Building2 size={12} /> Facturé à
            </h3>
            <p className="text-lg font-semibold text-slate-900 dark:text-white">{invoice.clientName}</p>
            {invoice.clientAddress && (
              <p className="text-sm text-slate-600 dark:text-slate-400 flex items-start gap-1 mt-1">
                <MapPin size={12} className="mt-0.5 flex-shrink-0" /> {invoice.clientAddress}
              </p>
            )}
            {invoice.clientBillingAddress && invoice.clientBillingAddress !== invoice.clientAddress && (
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1"><strong>Facturation :</strong> {invoice.clientBillingAddress}</p>
            )}
            {invoice.clientEmail && (
              <p className="text-sm text-slate-600 dark:text-slate-400 flex items-center gap-1 mt-1"><Mail size={12} /> {invoice.clientEmail}</p>
            )}
            {invoice.clientPhone && (
              <p className="text-sm text-slate-600 dark:text-slate-400 flex items-center gap-1"><Phone size={12} /> {invoice.clientPhone}</p>
            )}
          </div>
          <div className="text-left sm:text-right">
            <div className="mb-2">
              <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase flex items-center gap-1 sm:justify-end">
                <Calendar size={12} /> Date d'émission
              </h3>
              <p className="text-slate-900 dark:text-white">
                {invoice.issueDate ? new Date(invoice.issueDate).toLocaleDateString('fr-FR') : (invoice.$createdAt ? new Date(invoice.$createdAt).toLocaleDateString('fr-FR') : '-')}
              </p>
            </div>
            {invoice.dueDate && (
              <div className="mb-2">
                <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Date d'échéance</h3>
                <p className="text-slate-900 dark:text-white font-semibold">{new Date(invoice.dueDate).toLocaleDateString('fr-FR')}</p>
              </div>
            )}
            {invoice.paidAt && (
              <div className="inline-block bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 px-3 py-1 rounded-full text-xs font-semibold">
                ✓ Payée le {new Date(invoice.paidAt).toLocaleDateString('fr-FR')}
              </div>
            )}
          </div>
        </div>

        {/* Tableau des lignes */}
        <div className="p-6 sm:p-8">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
            <Hash size={16} /> Détail des prestations
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b-2 border-purple-600">
                  <th className="text-left py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Réf.</th>
                  <th className="text-left py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Description</th>
                  <th className="text-right py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Qté</th>
                  <th className="text-right py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Prix unit. HT</th>
                  {subjectToVAT && <th className="text-right py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">TVA</th>}
                  <th className="text-right py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Total HT</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={subjectToVAT ? 6 : 5} className="py-8 text-center text-slate-500 dark:text-slate-400">
                      Aucune ligne de détail disponible.
                    </td>
                  </tr>
                ) : items.map((line, idx) => {
                  const lineTotal = line.quantity * line.unitPrice * (1 - (line.discount || 0) / 100);
                  return (
                    <tr key={idx} className="border-b border-slate-100 dark:border-slate-700">
                      <td className="py-3 text-slate-600 dark:text-slate-400 text-xs font-mono">{line.reference || '-'}</td>
                      <td className="py-3 text-slate-900 dark:text-white">
                        <div>{line.description}</div>
                        {(line.discount || 0) > 0 && <div className="text-xs text-red-600 dark:text-red-400">Remise : {line.discount}%</div>}
                      </td>
                      <td className="py-3 text-right text-slate-600 dark:text-slate-400">{line.quantity.toFixed(2)} {line.unit}</td>
                      <td className="py-3 text-right text-slate-600 dark:text-slate-400">{line.unitPrice.toFixed(2)} €</td>
                      {subjectToVAT && <td className="py-3 text-right text-slate-600 dark:text-slate-400">{line.tvaRate}%</td>}
                      <td className="py-3 text-right font-semibold text-slate-900 dark:text-white">{lineTotal.toFixed(2)} €</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Totaux avec ventilation TVA */}
          <div className="mt-8 flex justify-end">
            <div className="w-full sm:w-80 space-y-2">
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>Sous-total HT :</span>
                <span className="font-semibold">{fm(invoice.subtotal || 0)}</span>
              </div>
              {(invoice.discount || 0) > 0 && (
                <div className="flex justify-between text-red-600 dark:text-red-400">
                  <span>Remise globale ({invoice.discount}%) :</span>
                  <span className="font-semibold">- {fm((invoice.subtotal || 0) * (invoice.discount || 0) / 100)}</span>
                </div>
              )}
              {(invoice.discount || 0) > 0 && (
                <div className="flex justify-between text-slate-900 dark:text-white font-semibold border-t border-slate-200 dark:border-slate-700 pt-1 mt-1">
                  <span>Total HT après remise :</span>
                  <span>{fm((invoice.subtotal || 0) * (1 - (invoice.discount || 0) / 100))}</span>
                </div>
              )}
              {subjectToVAT && taxBreakdown.map(b => (
                <div key={b.rate} className="flex justify-between text-slate-600 dark:text-slate-400 text-sm">
                  <span>TVA {b.rate}% (base {fm(b.baseHT)}) :</span>
                  <span>{fm(b.taxAmount)}</span>
                </div>
              ))}
              {!subjectToVAT && (
                <div className="text-xs italic text-slate-500 dark:text-slate-400 py-1">
                  {invoice.companyTva || 'TVA non applicable'}
                </div>
              )}
              <div className="flex justify-between text-xl font-bold text-purple-600 dark:text-purple-400 border-t-2 border-purple-600 pt-2 mt-2">
                <span>Total TTC :</span>
                <span>{fm(invoice.total || 0)}</span>
              </div>
              {(invoice.deposit || 0) > 0 && (
                <>
                  <div className="flex justify-between text-blue-600 dark:text-blue-400">
                    <span>Acompte déjà versé :</span>
                    <span className="font-semibold">- {fm(invoice.deposit || 0)}</span>
                  </div>
                  <div className="flex justify-between text-lg font-bold text-slate-900 dark:text-white border-t border-slate-300 dark:border-slate-600 pt-2">
                    <span>Net à payer :</span>
                    <span>{fm(invoice.balance || 0)}</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Conditions légales */}
        <div className="bg-slate-50 dark:bg-slate-900/50 p-6 sm:p-8 border-t border-slate-200 dark:border-slate-700">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-2 flex items-center gap-1">
                <Euro size={12} /> Conditions de paiement
              </h4>
              <p className="text-sm text-slate-700 dark:text-slate-300">{invoice.paymentConditions || 'Paiement à réception.'}</p>
              {invoice.paymentMethods && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1"><strong>Mode :</strong> {invoice.paymentMethods}</p>
              )}
              {invoice.executionDelay && (
                <p className="text-xs text-slate-500 dark:text-slate-400"><strong>Délai :</strong> {invoice.executionDelay}</p>
              )}
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 italic">
                Pénalités de retard : 3× le taux d'intérêt légal (loi 2008-776).<br />
                Indemnité forfaitaire pour frais de recouvrement : 40 € (art. D.441-5).
              </p>
            </div>
            {(invoice.tradeType || invoice.insuranceName || invoice.insurancePolicy) && (
              <div>
                <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-2 flex items-center gap-1">
                  <Shield size={12} /> Assurances & Garanties
                </h4>
                {invoice.tradeType && <p className="text-sm text-slate-700 dark:text-slate-300"><strong>Type :</strong> {invoice.tradeType}</p>}
                {invoice.insuranceName && <p className="text-sm text-slate-700 dark:text-slate-300"><strong>Assureur :</strong> {invoice.insuranceName}</p>}
                {invoice.insurancePolicy && <p className="text-sm text-slate-700 dark:text-slate-300"><strong>N° police :</strong> {invoice.insurancePolicy}</p>}
                {invoice.insuranceAddress && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{invoice.insuranceAddress}</p>}
              </div>
            )}
          </div>
          {invoice.specialConditions && (
            <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
              <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-2">Conditions particulières</h4>
              <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{invoice.specialConditions}</p>
            </div>
          )}
        </div>

        {/* Actions client */}
        <div className="bg-white dark:bg-slate-800 p-6 sm:p-8 border-t-2 border-purple-600 print:hidden">
          <div className="flex flex-col sm:flex-row gap-3 justify-between items-center">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleDownloadPdf}
                disabled={downloadingPdf}
                className="bg-purple-600 text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-purple-700 flex items-center gap-2 active:scale-95 transition-all disabled:opacity-50"
              >
                <Download size={16} /> {downloadingPdf ? 'Génération...' : 'Télécharger PDF'}
              </button>
              <button
                onClick={handlePrint}
                className="bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-600 px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-600 flex items-center gap-2 active:scale-95 transition-all"
              >
                <Printer size={16} /> Imprimer
              </button>
            </div>

            {!acknowledged && invoice.status !== 'paid' && invoice.status !== 'cancelled' && invType !== 'credit' && (
              <button
                onClick={handleConfirmReceipt}
                className="bg-green-600 text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-green-700 flex items-center gap-2 active:scale-95 transition-all"
              >
                <CheckCircle size={16} /> J'ai bien reçu cette facture
              </button>
            )}
            {acknowledged && (
              <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-lg px-4 py-2.5 flex items-center gap-2 text-green-700 dark:text-green-300">
                <CheckCircle size={18} />
                <span className="text-sm font-medium">
                  Réception confirmée {invoice.receivedAt ? `le ${new Date(invoice.receivedAt).toLocaleDateString('fr-FR')}` : ''}
                </span>
              </div>
            )}
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-500 text-center mt-4 italic">
            Document consulté le {new Date().toLocaleDateString('fr-FR')} — Lien sécurisé
          </p>
        </div>
      </div>
    </div>
  );
}