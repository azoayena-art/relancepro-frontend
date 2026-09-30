import { Client, Databases, Query } from 'node-appwrite';
import 'dotenv/config';

const client = new Client()
  .setEndpoint(process.env.VITE_APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1')
  .setProject(process.env.VITE_APPWRITE_PROJECT_ID)
  .setKey(process.env.APPWRITE_API_KEY);

const databases = new Databases(client);
const DATABASE_ID = process.env.VITE_APPWRITE_DATABASE_ID || 'relancepro_db';

// ⚙️ CONFIGURER ICI
const INVOICE_NUMBER = 'FAC-2026-001';  // ← Numéro de la facture à corriger
const PAYMENT_INDEX_TO_REMOVE = 0;       // ← Index du paiement à supprimer

async function main() {
  const invoicesRes = await databases.listDocuments(DATABASE_ID, 'invoices', [
    Query.equal('invoiceNumber', INVOICE_NUMBER),
    Query.limit(1)
  ]);
  
  if (invoicesRes.documents.length === 0) {
    console.log(`❌ Facture ${INVOICE_NUMBER} introuvable`);
    return;
  }
  
  const invoice = invoicesRes.documents[0];
  
  let payments = [];
  try {
    payments = typeof invoice.payments === 'string' && invoice.payments.trim() 
      ? JSON.parse(invoice.payments) 
      : (Array.isArray(invoice.payments) ? invoice.payments : []);
  } catch (e) {
    console.log('❌ Impossible de parser les paiements');
    return;
  }
  
  console.log(`📄 Facture: ${invoice.invoiceNumber}`);
  console.log(`📋 Paiements actuels: ${payments.length}`);
  payments.forEach((p, idx) => {
    console.log(`  [${idx}] ${p.amount}€ | ${p.method} | ${p.reference || 'sans ref'} | ${p.notes || 'sans note'}`);
  });
  
  if (PAYMENT_INDEX_TO_REMOVE >= payments.length) {
    console.log(`❌ Index ${PAYMENT_INDEX_TO_REMOVE} invalide (max: ${payments.length - 1})`);
    return;
  }
  
  const removedPayment = payments[PAYMENT_INDEX_TO_REMOVE];
  console.log(`\n⚠️  Suppression du paiement [${PAYMENT_INDEX_TO_REMOVE}]: ${removedPayment.amount}€`);
  
  payments.splice(PAYMENT_INDEX_TO_REMOVE, 1);
  
  // Recalculer le statut
  const totalPaid = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
  const deposit = invoice.deposit || 0;
  const total = invoice.total || 0;
  
  let newStatus = invoice.status;
  let newBalance = Math.max(0, total - totalPaid - deposit);
  
  if (totalPaid + deposit >= total - 0.01) {
    newStatus = 'paid';
    newBalance = 0;
  } else if (totalPaid > 0) {
    newStatus = 'partial';
  } else {
    newStatus = 'sent';
  }
  
  await databases.updateDocument(DATABASE_ID, 'invoices', invoice.$id, {
    payments: JSON.stringify(payments),
    balance: newBalance,
    status: newStatus
  });
  
  console.log(`\n✅ Paiement supprimé`);
  console.log(`📊 Nouveau statut: ${newStatus}`);
  console.log(`📊 Nouveau solde: ${newBalance}€`);
}

main().catch(console.error);