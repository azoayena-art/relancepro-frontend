import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { databases, DATABASE_ID } from '../appwrite';
import { useAuth } from '../context/AuthContext';
import { useCompanySettings } from '../hooks/useCompanySettings';
import { Query } from 'appwrite';
import Sidebar from '../components/Sidebar';
import {
  ArrowLeft,
  Printer,
  FileText,
  Mail,
  Phone,
  MapPin,
  Building2,
  Calendar,
  CreditCard,
  Receipt,
  FileMinus
} from 'lucide-react';

interface Invoice {
  $id: string;
  invoiceNumber: string;
  clientName: string;
  clientEmail?: string;
  clientPhone?: string;
  clientAddress?: string;
  issueDate?: string;
  dueDate?: string;
  status?: string;
  type?: string;
  items?: any;
  subtotal?: number;
  taxAmount?: number;
  total?: number;
  paidAmount?: number;
  currency?: string;
  notes?: string;
  terms?: string;
  teamId?: string;
  $createdAt?: string;
  payments?: any;
  originalInvoiceId?: string;
  originalInvoiceNumber?: string;
}

interface CompanySettings {
  name?: string;
  legalForm?: string;
  address?: string;
  siret?: string;
  rcs?: string;
  tvaNumber?: string;
  phone?: string;
  email?: string;
}

interface Movement {
  id: string;
  type: 'initial' | 'advance' | 'credit' | 'payment';
  label: string;
  subLabel?: string;
  date: string;
  amount: number;
  sign: '+' | '-';
  method?: string;
  reference?: string;
}

export default function InvoiceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { fm } = useCompanySettings();

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [advances, setAdvances] = useState<Invoice[]>([]);
  const [credits, setCredits] = useState<Invoice[]>([]);
  const [creditsMetadata, setCreditsMetadata] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) {
      setError('Aucun ID de facture dans l\'URL');
      setLoading(false);
      return;
    }

    loadInvoice();
  }, [id]);

  const loadInvoice = async () => {
    try {
      setLoading(true);
      setError('');

      const doc = await databases.getDocument(DATABASE_ID, 'invoices', id as string);
      const inv = doc as unknown as Invoice;
      setInvoice(inv);

      let teamId: string | null = null;

      if (user && user.$id) {
        try {
          const teamsRes = await databases.listDocuments(DATABASE_ID, 'teams', [
            Query.equal('ownerId', user.$id)
          ]);

          if (teamsRes.documents.length > 0) {
            teamId = teamsRes.documents[0].$id;
          } else {
            const membersRes = await databases.listDocuments(DATABASE_ID, 'team_members', [
              Query.equal('userId', user.$id)
            ]);

            if (membersRes.documents.length > 0) {
              teamId = (membersRes.documents[0] as any).teamId;
            }
          }
        } catch (e) {
          console.warn('Erreur résolution teamId:', e);
        }
      }

      if (!teamId) return;

      // Entreprise
      try {
        const settingsRes = await databases.listDocuments(DATABASE_ID, 'company_settings', [
          Query.equal('teamId', teamId),
          Query.limit(1)
        ]);

        if (settingsRes.documents.length > 0) {
          setCompany(settingsRes.documents[0] as unknown as CompanySettings);
        }
      } catch (e) {
        console.warn('Erreur chargement company_settings:', e);
      }

      // Toutes les factures / acomptes / avoirs de l'équipe
      try {
        const allInvoicesRes = await databases.listDocuments(DATABASE_ID, 'invoices', [
          Query.equal('teamId', teamId),
          Query.limit(2000)
        ]);

        const allDocs = allInvoicesRes.documents as unknown as Invoice[];

        const isLinkedToCurrentInvoice = (d: Invoice) => {
          return (
            d.originalInvoiceId === inv.$id ||
            d.originalInvoiceNumber === inv.invoiceNumber ||
            (d.notes || '').includes(inv.invoiceNumber)
          );
        };

        setAdvances(
          allDocs.filter((d) => d.type === 'advance' && isLinkedToCurrentInvoice(d))
        );

        setCredits(
          allDocs.filter((d) => d.type === 'credit' && isLinkedToCurrentInvoice(d))
        );
      } catch (e) {
        console.warn('Erreur chargement acomptes/avoirs:', e);
      }

      // Métadonnées des avoirs pour récupérer les remboursements
      try {
        const metaRes = await databases.listDocuments(DATABASE_ID, 'invoice_metadata', [
          Query.equal('teamId', teamId),
          Query.limit(2000)
        ]);

        const metaMap: Record<string, any> = {};

        metaRes.documents.forEach((m: any) => {
          try {
            const creditData = typeof m.creditData === 'string'
              ? JSON.parse(m.creditData)
              : m.creditData || {};

            metaMap[m.invoiceId] = creditData;
          } catch {
            metaMap[m.invoiceId] = {};
          }
        });

        setCreditsMetadata(metaMap);
      } catch (e) {
        console.warn('Erreur chargement invoice_metadata:', e);
      }
    } catch (err: any) {
      setError(err?.message || 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Sidebar>
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-slate-500 text-lg">Chargement de la facture...</div>
        </div>
      </Sidebar>
    );
  }

  if (error || !invoice) {
    return (
      <Sidebar>
        <div className="min-h-screen flex items-center justify-center p-6">
          <div className="bg-white dark:bg-slate-800 border border-red-200 dark:border-red-900 rounded-xl p-8 max-w-xl w-full">
            <h2 className="text-xl font-bold text-red-600 mb-4">Erreur de chargement</h2>
            <p className="text-sm text-slate-600 dark:text-slate-300 mb-2">ID demandé :</p>
            <code className="block bg-slate-100 dark:bg-slate-900 p-3 rounded text-xs mb-4 break-all">
              {id || 'aucun'}
            </code>
            <p className="text-sm text-slate-600 dark:text-slate-300 mb-2">Erreur :</p>
            <code className="block bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 p-3 rounded text-xs mb-6 break-all">
              {error || 'Facture introuvable'}
            </code>
            <button
              onClick={() => navigate('/invoices')}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
            >
              Retour aux factures
            </button>
          </div>
        </div>
      </Sidebar>
    );
  }

  // ============================================================
  // PARSING
  // ============================================================

  let items: any[] = [];
  try {
    if (typeof invoice.items === 'string') items = JSON.parse(invoice.items);
    else if (Array.isArray(invoice.items)) items = invoice.items;
  } catch {
    items = [];
  }

  const extractPayments = (doc: Invoice): any[] => {
    try {
      if (typeof doc.payments === 'string') {
        const parsed = JSON.parse(doc.payments);
        return Array.isArray(parsed) ? parsed : [];
      }

      if (Array.isArray(doc.payments)) return doc.payments;
    } catch {
      return [];
    }

    return [];
  };

  const invoicePayments = extractPayments(invoice);

  // ============================================================
  // HELPERS CHAMPS FACTURE
  // ============================================================

  const getItemDescription = (item: any): string => {
    return item.description || item.name || item.title || item.label || item.designation || '';
  };

  const getItemQuantity = (item: any): number => {
    const candidates = [item.quantity, item.qty, item.quantite, item.qte];
    for (const c of candidates) {
      const n = Number(c);
      if (!isNaN(n)) return n;
    }
    return 1;
  };

  const getItemUnitPrice = (item: any): number => {
    const candidates = [item.unitPrice, item.unit_price, item.price, item.priceHT, item.price_ht, item.prix];
    for (const c of candidates) {
      const n = Number(c);
      if (!isNaN(n)) return n;
    }
    return 0;
  };

  const getItemDiscount = (item: any): number => {
    const candidates = [item.discount, item.remise, item.discountAmount];
    for (const c of candidates) {
      const n = Number(c);
      if (!isNaN(n)) return n;
    }
    return 0;
  };

  const getItemTaxRate = (item: any): number => {
    const candidates = [
      item.taxRate,
      item.tax_rate,
      item.tax,
      item.tva,
      item.tvaRate,
      item.tva_rate,
      item.vat,
      item.vatRate,
      item.vat_rate,
      item.rate
    ];

    for (const c of candidates) {
      const n = Number(c);
      if (!isNaN(n) && n > 0) return n;
    }

    return 0;
  };

  const calcLineHT = (item: any): number => {
    return getItemQuantity(item) * getItemUnitPrice(item) - getItemDiscount(item);
  };

  // ============================================================
  // CALCULS TOTAUX
  // ============================================================

  const subtotalHT = items.reduce((sum, item) => sum + calcLineHT(item), 0);

  let defaultTaxRate = 0;
  const invoiceSubtotal = Number(invoice.subtotal || subtotalHT);
  const invoiceTaxAmount = Number(invoice.taxAmount || 0);
  const invoiceTotal = Number(invoice.total || 0);

  if (invoiceTaxAmount > 0 && invoiceSubtotal > 0) {
    defaultTaxRate = (invoiceTaxAmount / invoiceSubtotal) * 100;
  } else if (invoiceTotal > invoiceSubtotal && invoiceSubtotal > 0) {
    defaultTaxRate = ((invoiceTotal - invoiceSubtotal) / invoiceSubtotal) * 100;
  }

  defaultTaxRate = Math.round(defaultTaxRate * 100) / 100;

  const tvaByRate: Record<string, { base: number; amount: number }> = {};

  items.forEach((item) => {
    let rate = getItemTaxRate(item);
    if (rate === 0 && defaultTaxRate > 0) rate = defaultTaxRate;

    const lineHT = calcLineHT(item);
    const key = String(rate);

    if (!tvaByRate[key]) {
      tvaByRate[key] = { base: 0, amount: 0 };
    }

    tvaByRate[key].base += lineHT;
    tvaByRate[key].amount += (lineHT * rate) / 100;
  });

  const totalTVA = Object.values(tvaByRate).reduce((sum, v) => sum + v.amount, 0);
  const totalTTC = invoiceTotal > 0 ? invoiceTotal : subtotalHT + totalTVA;

  // ============================================================
  // ACOMPTES DETECTES DANS LES NOTES (si aucun acompte lié)
  // ============================================================

  const advancesFromNotes: Array<{ label: string; amount: number; date: string }> = [];

  if (invoice.notes && advances.length === 0) {
    const lines = invoice.notes.split('\n');

    lines.forEach((line) => {
      if (!/acompte/i.test(line)) return;

      const amountMatch =
        line.match(/(\d[\d\s\u00A0\u202F]*(?:[.,]\d{1,2})?)\s*(?:€|EUR|euros?)/i) ||
        line.match(/(?:montant|acompte)\s*(?:de|:)?\s*(\d[\d\s\u00A0\u202F]*(?:[.,]\d{1,2})?)/i) ||
        line.match(/(\d[\d\s\u00A0\u202F]*(?:[.,]\d{1,2})?)/);

      if (!amountMatch) return;

      const cleaned = amountMatch[1]
        .replace(/[\s\u00A0\u202F]/g, '')
        .replace(',', '.');

      const amount = Number(cleaned);

      if (!isNaN(amount) && amount > 0) {
        advancesFromNotes.push({
          label: line.trim(),
          amount,
          date: invoice.issueDate || invoice.$createdAt || ''
        });
      }
    });
  }

  // ============================================================
  // HISTORIQUE FINANCIER
  // ============================================================

  const movements: Movement[] = [];

  let totalAdvancesAmount = 0;
  let totalCreditsAmount = 0;
  let totalPaymentsAmount = 0;
  let usedNotesAdvances = false;

  // 1. Facture initiale
  movements.push({
    id: 'initial',
    type: 'initial',
    label: `Facture ${invoice.invoiceNumber}`,
    subLabel: 'Montant initial',
    date: invoice.issueDate || invoice.$createdAt || '',
    amount: totalTTC,
    sign: '+'
  });

  // 2. Acomptes liés avec leurs reçus
  advances.forEach((adv) => {
    const advPayments = extractPayments(adv);

    if (advPayments.length > 0) {
      advPayments.forEach((p, idx) => {
        const amount = Number(p.amount || 0);
        if (amount <= 0) return;

        const receiptNumber =
          p.reference ||
          p.receiptNumber ||
          `REC-${adv.invoiceNumber}-${String(idx + 1).padStart(2, '0')}`;

        movements.push({
          id: `advance-${adv.$id}-${idx}`,
          type: 'advance',
          label: `Reçu ${receiptNumber}`,
          subLabel: `Acompte ${adv.invoiceNumber}`,
          date: p.date || p.paymentDate || adv.issueDate || adv.$createdAt || '',
          amount,
          sign: '-',
          method: p.method,
          reference: receiptNumber
        });

        totalAdvancesAmount += amount;
      });
    } else {
      const amount = Number(adv.paidAmount || adv.total || 0);
      if (amount > 0) {
        const receiptNumber = `REC-${adv.invoiceNumber}-01`;

        movements.push({
          id: `advance-${adv.$id}`,
          type: 'advance',
          label: `Reçu ${receiptNumber}`,
          subLabel: `Acompte ${adv.invoiceNumber}`,
          date: adv.issueDate || adv.$createdAt || '',
          amount,
          sign: '-',
          reference: receiptNumber
        });

        totalAdvancesAmount += amount;
      }
    }
  });

  // 2b. Acomptes retrouvés dans les notes seulement si aucun acompte documenté
  if (totalAdvancesAmount === 0 && advancesFromNotes.length > 0) {
    usedNotesAdvances = true;

    advancesFromNotes.forEach((noteAdvance, idx) => {
      const receiptNumber = `REC-${invoice.invoiceNumber}-ACOMPTES-${String(idx + 1).padStart(2, '0')}`;

      movements.push({
        id: `advance-note-${idx}`,
        type: 'advance',
        label: `Reçu ${receiptNumber}`,
        subLabel: 'Acompte',
        date: noteAdvance.date,
        amount: noteAdvance.amount,
        sign: '-',
        reference: receiptNumber
      });

      totalAdvancesAmount += noteAdvance.amount;
    });
  }

  // 3. Avoirs liés : remboursements avec reçus, pas juste "AV"
  credits.forEach((credit) => {
    if (credit.status === 'cancelled') return;

    const meta = creditsMetadata[credit.$id] || {};
    const refundPayments = Array.isArray(meta.refundPayments) ? meta.refundPayments : [];

    if (refundPayments.length > 0) {
      refundPayments.forEach((refund: any, idx) => {
        const amount = Number(refund.amount || 0);
        if (amount <= 0) return;

        const receiptNumber =
          refund.reference ||
          refund.receiptNumber ||
          `REC-AV-${credit.invoiceNumber}-${String(idx + 1).padStart(2, '0')}`;

        movements.push({
          id: `credit-refund-${credit.$id}-${idx}`,
          type: 'credit',
          label: `Remboursement ${receiptNumber}`,
          subLabel: `Avoir ${credit.invoiceNumber}`,
          date: refund.date || refund.paymentDate || credit.issueDate || credit.$createdAt || '',
          amount,
          sign: '-',
          method: refund.method,
          reference: receiptNumber
        });

        totalCreditsAmount += amount;
      });
    } else {
      const amount = Number(credit.total || 0);
      if (amount > 0) {
        movements.push({
          id: `credit-${credit.$id}`,
          type: 'credit',
          label: `Avoir émis ${credit.invoiceNumber}`,
          subLabel: 'En attente de remboursement',
          date: credit.issueDate || credit.$createdAt || '',
          amount,
          sign: '-',
          reference: credit.invoiceNumber
        });

        totalCreditsAmount += amount;
      }
    }
  });

  // 4. Paiements directs sur la facture FAC
  if (invoicePayments.length > 0) {
    invoicePayments.forEach((p, idx) => {
      const amount = Number(p.amount || 0);
      if (amount <= 0) return;

      const receiptNumber =
        p.reference ||
        p.receiptNumber ||
        `REC-${invoice.invoiceNumber}-${String(idx + 1).padStart(2, '0')}`;

      movements.push({
        id: `payment-${idx}`,
        type: 'payment',
        label: `Reçu ${receiptNumber}`,
        subLabel: `Paiement facture ${invoice.invoiceNumber}`,
        date: p.date || p.paymentDate || invoice.issueDate || invoice.$createdAt || '',
        amount,
        sign: '-',
        method: p.method,
        reference: receiptNumber
      });

      totalPaymentsAmount += amount;
    });
  } else {
    const paidAmount = Number(invoice.paidAmount || 0);

    if (paidAmount > 0) {
      const receiptNumber = `REC-${invoice.invoiceNumber}-01`;

      movements.push({
        id: 'payment-global',
        type: 'payment',
        label: `Reçu ${receiptNumber}`,
        subLabel: `Paiement facture ${invoice.invoiceNumber}`,
        date: invoice.issueDate || invoice.$createdAt || '',
        amount: paidAmount,
        sign: '-',
        reference: receiptNumber
      });

      totalPaymentsAmount += paidAmount;
    }
  }

  // Tri : facture initiale, puis acomptes, puis avoirs, puis paiements
  const movementPriority = (m: Movement) => {
    if (m.type === 'initial') return 0;
    if (m.type === 'advance') return 1;
    if (m.type === 'credit') return 2;
    return 3;
  };

  const safeTime = (d: string) => {
    const t = new Date(d).getTime();
    return isNaN(t) ? 0 : t;
  };

  movements.sort((a, b) => {
    const pA = movementPriority(a);
    const pB = movementPriority(b);

    if (pA !== pB) return pA - pB;

    return safeTime(a.date) - safeTime(b.date);
  });

  const balance = totalTTC - totalAdvancesAmount - totalCreditsAmount - totalPaymentsAmount;

  const advanceCount = advances.length + (usedNotesAdvances ? advancesFromNotes.length : 0);

  // ============================================================
  // AFFICHAGE NOTES SANS LES LIGNES D'ACOMPTES UTILISEES
  // ============================================================

  let displayNotes = invoice.notes || '';

  if (usedNotesAdvances && invoice.notes) {
    displayNotes = invoice.notes
      .split('\n')
      .filter((line) => !/acompte/i.test(line))
      .join('\n')
      .trim();
  }

  // ============================================================
  // HELPERS AFFICHAGE
  // ============================================================

  const docType =
    invoice.type === 'credit'
      ? 'AVOIR'
      : invoice.type === 'advance'
        ? 'FACTURE D\'ACOMPTE'
        : invoice.type === 'quote'
          ? 'DEVIS'
          : 'FACTURE';

  const formatDate = (d?: string) => {
    if (!d) return '-';
    try {
      return new Date(d).toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric'
      });
    } catch {
      return d;
    }
  };

  const formatDateShort = (d?: string) => {
    if (!d) return '-';
    try {
      return new Date(d).toLocaleDateString('fr-FR');
    } catch {
      return d;
    }
  };

  const getMovementIcon = (type: string) => {
    if (type === 'initial') return <FileText size={18} className="text-purple-600" />;
    if (type === 'advance') return <Receipt size={18} className="text-blue-600" />;
    if (type === 'credit') return <FileMinus size={18} className="text-red-600" />;
    return <CreditCard size={18} className="text-emerald-600" />;
  };

  const getMovementBg = (type: string) => {
    if (type === 'initial') return 'bg-purple-50';
    if (type === 'advance') return 'bg-blue-50';
    if (type === 'credit') return 'bg-red-50';
    return 'bg-emerald-50';
  };

  return (
    <Sidebar>
      <div className="min-h-screen bg-slate-100 dark:bg-slate-950 print:bg-white">
        {/* BARRE ACTIONS */}
        <div className="print:hidden bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-10">
          <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
            <button
              onClick={() => navigate('/invoices')}
              className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:text-purple-600"
            >
              <ArrowLeft size={18} />
              Retour aux factures
            </button>

            <button
              onClick={() => window.print()}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700"
            >
              <Printer size={16} />
              Imprimer
            </button>
          </div>
        </div>

        {/* DOCUMENT */}
        <div className="max-w-5xl mx-auto px-4 py-8 print:py-0 print:px-0">
          <div className="bg-white shadow-xl print:shadow-none rounded-lg overflow-hidden">

            {/* EN-TETE */}
            <div className="p-8 border-b-4 border-purple-600">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center text-white">
                      <Building2 size={24} />
                    </div>
                    <div>
                      <h1 className="text-2xl font-bold text-slate-900">
                        {company?.name || 'Mon Entreprise'}
                      </h1>
                      {company?.legalForm && (
                        <p className="text-sm text-slate-500">{company.legalForm}</p>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2 text-sm text-slate-700">
                    {company?.address && (
                      <div className="flex items-start gap-2">
                        <MapPin size={14} className="text-slate-400 mt-0.5" />
                        <span className="whitespace-pre-line">{company.address}</span>
                      </div>
                    )}

                    {company?.phone && (
                      <div className="flex items-center gap-2">
                        <Phone size={14} className="text-slate-400" />
                        <span>{company.phone}</span>
                      </div>
                    )}

                    {company?.email && (
                      <div className="flex items-center gap-2">
                        <Mail size={14} className="text-slate-400" />
                        <span>{company.email}</span>
                      </div>
                    )}

                    {company?.siret && (
                      <div className="flex items-center gap-2">
                        <FileText size={14} className="text-slate-400" />
                        <span>SIRET : {company.siret}</span>
                      </div>
                    )}

                    {company?.tvaNumber && !company.tvaNumber.includes('non applicable') && (
                      <p className="text-xs text-slate-500 ml-6">
                        N° TVA : {company.tvaNumber}
                      </p>
                    )}
                  </div>
                </div>

                <div className="text-left md:text-right">
                  <div className="inline-block bg-gradient-to-br from-purple-600 to-indigo-600 text-white px-6 py-3 rounded-lg mb-4">
                    <p className="text-xs uppercase tracking-widest font-bold opacity-80">
                      {docType}
                    </p>
                    <p className="text-2xl font-bold font-mono mt-1">
                      {invoice.invoiceNumber}
                    </p>
                  </div>

                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between md:justify-end gap-4">
                      <span className="text-slate-500">Date d&apos;émission :</span>
                      <span className="font-semibold text-slate-900">
                        {formatDate(invoice.issueDate || invoice.$createdAt)}
                      </span>
                    </div>

                    {invoice.dueDate && (
                      <div className="flex justify-between md:justify-end gap-4">
                        <span className="text-slate-500">Échéance :</span>
                        <span className="font-semibold text-slate-900">
                          {formatDate(invoice.dueDate)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* CLIENT */}
            <div className="p-8 bg-slate-50/50">
              <div className="bg-white rounded-lg border border-slate-200 p-6">
                <p className="text-xs uppercase tracking-widest text-slate-500 font-bold mb-3">
                  Facturé à
                </p>

                <h2 className="text-xl font-bold text-slate-900 mb-3">
                  {invoice.clientName}
                </h2>

                <div className="space-y-1.5 text-sm text-slate-700">
                  {invoice.clientAddress && (
                    <div className="flex items-start gap-2">
                      <MapPin size={14} className="text-slate-400 mt-0.5" />
                      <span className="whitespace-pre-line">{invoice.clientAddress}</span>
                    </div>
                  )}

                  {invoice.clientEmail && (
                    <div className="flex items-center gap-2">
                      <Mail size={14} className="text-slate-400" />
                      <span>{invoice.clientEmail}</span>
                    </div>
                  )}

                  {invoice.clientPhone && (
                    <div className="flex items-center gap-2">
                      <Phone size={14} className="text-slate-400" />
                      <span>{invoice.clientPhone}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* TABLEAU PRESTATIONS */}
            <div className="p-8">
              <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                <FileText size={18} className="text-purple-600" />
                Détail des prestations
              </h3>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-purple-50 border-b-2 border-purple-200">
                      <th className="text-left py-3 px-4 font-bold text-slate-700 uppercase text-xs">Description</th>
                      <th className="text-center py-3 px-4 font-bold text-slate-700 uppercase text-xs w-20">Qté</th>
                      <th className="text-right py-3 px-4 font-bold text-slate-700 uppercase text-xs w-28">PU HT</th>
                      <th className="text-center py-3 px-4 font-bold text-slate-700 uppercase text-xs w-20">TVA</th>
                      <th className="text-right py-3 px-4 font-bold text-slate-700 uppercase text-xs w-28">Mt TVA</th>
                      <th className="text-right py-3 px-4 font-bold text-slate-700 uppercase text-xs w-28">Total HT</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-200">
                    {items.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-400 italic">
                          Aucune ligne enregistrée
                        </td>
                      </tr>
                    ) : (
                      items.map((item, i) => {
                        const lineHT = calcLineHT(item);
                        let rate = getItemTaxRate(item);
                        if (rate === 0 && defaultTaxRate > 0) rate = defaultTaxRate;
                        const lineTVA = (lineHT * rate) / 100;
                        const discount = getItemDiscount(item);

                        return (
                          <tr key={i} className="hover:bg-slate-50">
                            <td className="py-4 px-4">
                              <div className="font-medium text-slate-900">
                                {getItemDescription(item)}
                              </div>

                              {discount > 0 && (
                                <div className="text-xs text-red-600 mt-1">
                                  Remise : -{fm(discount)}
                                </div>
                              )}
                            </td>

                            <td className="py-4 px-4 text-center tabular-nums">
                              {getItemQuantity(item)}
                            </td>

                            <td className="py-4 px-4 text-right tabular-nums">
                              {fm(getItemUnitPrice(item))}
                            </td>

                            <td className="py-4 px-4 text-center tabular-nums font-medium">
                              {rate}%
                            </td>

                            <td className="py-4 px-4 text-right tabular-nums text-amber-700 font-medium">
                              {fm(lineTVA)}
                            </td>

                            <td className="py-4 px-4 text-right font-semibold tabular-nums">
                              {fm(lineHT)}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* TOTAUX */}
              <div className="mt-8 flex justify-end">
                <div className="w-full md:w-96 space-y-2">
                  <div className="flex justify-between py-2 text-sm text-slate-600 border-b border-slate-100">
                    <span>Total HT</span>
                    <span className="font-semibold tabular-nums">{fm(subtotalHT)}</span>
                  </div>

                  {Object.entries(tvaByRate).map(([rate, data]) => (
                    <div
                      key={rate}
                      className="flex justify-between py-2 text-sm text-slate-600 border-b border-slate-100"
                    >
                      <span>TVA {rate}% (sur {fm(data.base)})</span>
                      <span className="font-semibold tabular-nums text-amber-700">{fm(data.amount)}</span>
                    </div>
                  ))}

                  <div className="flex justify-between py-3 mt-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg px-4">
                    <span className="font-bold">Total TTC</span>
                    <span className="font-bold text-xl tabular-nums">{fm(totalTTC)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* HISTORIQUE FINANCIER */}
            <div className="px-8 pb-8">
              <div className="border-2 border-slate-200 rounded-lg overflow-hidden">
                <div className="bg-slate-900 text-white px-5 py-4 flex items-center gap-2">
                  <Calendar size={18} />
                  <h3 className="font-bold">Historique financier complet</h3>
                </div>

                <div className="divide-y divide-slate-100">
                  {movements.map((mvt) => (
                    <div
                      key={mvt.id}
                      className="flex items-center justify-between px-5 py-4 hover:bg-slate-50"
                    >
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${getMovementBg(mvt.type)}`}>
                          {getMovementIcon(mvt.type)}
                        </div>

                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900 text-sm truncate">
                            {mvt.label}
                          </p>

                          <p className="text-xs text-slate-500 mt-0.5">
                            {mvt.subLabel && <span>{mvt.subLabel} • </span>}
                            <span>{formatDateShort(mvt.date)}</span>
                            {mvt.method && <span> • {mvt.method}</span>}
                          </p>
                        </div>
                      </div>

                      <div className="text-right flex-shrink-0 ml-4">
                        <p className={`font-bold tabular-nums ${mvt.sign === '+' ? 'text-purple-700' : 'text-emerald-600'}`}>
                          {mvt.sign === '+' ? '+' : '-'} {fm(mvt.amount)}
                        </p>

                        {mvt.reference && mvt.type !== 'initial' && (
                          <p className="text-xs text-slate-400 font-mono mt-0.5">
                            {mvt.reference}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* RESUME FINANCIER */}
                <div className="bg-slate-50 px-5 py-4 space-y-2 border-t-2 border-slate-200">
                  {/* Ligne 1 */}
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">Total facture TTC</span>
                    <span className="font-semibold tabular-nums">{fm(totalTTC)}</span>
                  </div>

                  {/* Ligne 2 : Acompte toujours affiché */}
                  <div className="flex justify-between text-sm">
                    <span className="text-blue-600 flex items-center gap-1">
                      <Receipt size={12} />
                      Acompte{advanceCount > 1 ? 's' : ''} ({advanceCount})
                    </span>
                    <span className={`font-semibold tabular-nums ${totalAdvancesAmount > 0 ? 'text-blue-600' : 'text-slate-400'}`}>
                      {totalAdvancesAmount > 0 ? `- ${fm(totalAdvancesAmount)}` : fm(0)}
                    </span>
                  </div>

                  {/* Ligne 3 : Avoirs */}
                  {totalCreditsAmount > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-red-600 flex items-center gap-1">
                        <FileMinus size={12} />
                        Avoirs / remboursements ({credits.length})
                      </span>
                      <span className="font-semibold text-red-600 tabular-nums">
                        - {fm(totalCreditsAmount)}
                      </span>
                    </div>
                  )}

                  {/* Ligne 4 : Paiements */}
                  {totalPaymentsAmount > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-emerald-600 flex items-center gap-1">
                        <CreditCard size={12} />
                        Paiements reçus ({invoicePayments.length || 1})
                      </span>
                      <span className="font-semibold text-emerald-600 tabular-nums">
                        - {fm(totalPaymentsAmount)}
                      </span>
                    </div>
                  )}

                  {/* Solde */}
                  <div className={`flex justify-between py-3 mt-2 rounded-lg px-4 font-bold ${
                    balance > 0.01
                      ? 'bg-amber-50 text-amber-800 border border-amber-200'
                      : balance < -0.01
                        ? 'bg-blue-50 text-blue-800 border border-blue-200'
                        : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  }`}>
                    <span>
                      {balance > 0.01
                        ? 'Solde restant dû'
                        : balance < -0.01
                          ? 'Remboursé'
                          : 'Facture soldée'}
                    </span>
                    <span className="tabular-nums text-lg">{fm(Math.abs(balance))}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* NOTES */}
            {displayNotes && (
              <div className="px-8 pb-8">
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-5">
                  <h3 className="text-sm font-bold text-slate-700 mb-2">Notes</h3>
                  <p className="text-sm text-slate-600 whitespace-pre-line">{displayNotes}</p>
                </div>
              </div>
            )}

            {/* MENTIONS LEGALES */}
            <div className="px-8 pb-8">
              <div className="border-t-2 border-slate-200 pt-6">
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">
                  Conditions de paiement &amp; mentions légales
                </h3>

                <div className="text-xs text-slate-600 leading-relaxed space-y-2">
                  {invoice.terms ? (
                    <p className="whitespace-pre-line">{invoice.terms}</p>
                  ) : (
                    <>
                      <p>
                        <strong>Délai de paiement :</strong> 30 jours à compter de la date d&apos;émission
                        (article L441-10 du Code de commerce).
                      </p>
                      <p>
                        <strong>Pénalités de retard :</strong> 3 fois le taux d&apos;intérêt légal +
                        indemnité forfaitaire de 40 € pour frais de recouvrement.
                      </p>
                      <p>
                        <strong>Escompte :</strong> Aucun escompte pour paiement anticipé.
                      </p>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* PIED DE PAGE */}
            <div className="bg-slate-900 text-slate-300 px-8 py-6">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 text-xs">
                <div>
                  <p className="font-semibold text-white">{company?.name || 'Mon Entreprise'}</p>
                  {company?.siret && <p>SIRET : {company.siret}</p>}
                  {company?.rcs && <p>RCS : {company.rcs}</p>}
                </div>

                <div className="text-right">
                  {company?.tvaNumber && !company.tvaNumber.includes('non applicable') && (
                    <p>N° TVA : {company.tvaNumber}</p>
                  )}
                  {company?.email && <p>{company.email}</p>}
                  {company?.phone && <p>{company.phone}</p>}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Sidebar>
  );
}