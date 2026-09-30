import { Client, Databases, Query } from 'node-appwrite';
import 'dotenv/config';

const client = new Client()
  .setEndpoint(process.env.VITE_APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1')
  .setProject(process.env.VITE_APPWRITE_PROJECT_ID)
  .setKey(process.env.APPWRITE_API_KEY);

const databases = new Databases(client);
const DATABASE_ID = process.env.VITE_APPWRITE_DATABASE_ID || 'relancepro_db';

async function main() {
  console.log('🔍 DIAGNOSTIC DES ACOMPTES ET PAIEMENTS\n');
  
  // Récupérer l'équipe
  const teamsRes = await databases.listDocuments(DATABASE_ID, 'teams', [Query.limit(10)]);
  if (teamsRes.documents.length === 0) {
    console.log('❌ Aucune équipe trouvée');
    return;
  }
  
  for (const team of teamsRes.documents) {
    console.log(`\n📁 Équipe: ${team.name || team.$id}`);
    
    // Récupérer toutes les factures de l'équipe
    const invoicesRes = await databases.listDocuments(DATABASE_ID, 'invoices', [
      Query.equal('teamId', team.$id),
      Query.limit(2000)
    ]);
    
    const invoices = invoicesRes.documents;
    
    // 1. Factures avec deposit > 0
    const withDeposit = invoices.filter(inv => (inv.deposit || 0) > 0);
    console.log(`\n  💰 Factures avec acompte défini: ${withDeposit.length}`);
    for (const inv of withDeposit) {
      console.log(`    - ${inv.invoiceNumber} | type: ${inv.type} | status: ${inv.status} | total: ${inv.total}€ | deposit: ${inv.deposit}€`);
    }
    
    // 2. Factures d'acompte (type: advance)
    const advanceInvoices = invoices.filter(inv => inv.type === 'advance');
    console.log(`\n  📋 Factures d'acompte (type=advance): ${advanceInvoices.length}`);
    for (const inv of advanceInvoices) {
      let payments = [];
      try {
        payments = typeof inv.payments === 'string' && inv.payments.trim() 
          ? JSON.parse(inv.payments) 
          : (Array.isArray(inv.payments) ? inv.payments : []);
      } catch (e) {}
      
      const paidAmount = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
      console.log(`    - ${inv.invoiceNumber} | status: ${inv.status} | total: ${inv.total}€ | payé: ${paidAmount}€`);
      
      if (inv.status === 'paid' && paidAmount === 0) {
        console.log(`      ⚠️  ANOMALIE: marquée payée mais aucun paiement enregistré !`);
      }
    }
    
    // 3. Factures marquées paid avec deposit mais sans paiement couvrant
    const anomalies = invoices.filter(inv => {
      if (inv.type === 'credit') return false;
      if (inv.status !== 'paid') return false;
      
      let payments = [];
      try {
        payments = typeof inv.payments === 'string' && inv.payments.trim() 
          ? JSON.parse(inv.payments) 
          : (Array.isArray(inv.payments) ? inv.payments : []);
      } catch (e) {}
      
      const paidAmount = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
      const deposit = inv.deposit || 0;
      
      // Anomalie : payée mais paiements + deposit < total
      return (paidAmount + deposit) < (inv.total || 0) - 0.01;
    });
    
    console.log(`\n  ⚠️  Anomalies détectées (payées sans paiement complet): ${anomalies.length}`);
    for (const inv of anomalies) {
      let payments = [];
      try {
        payments = typeof inv.payments === 'string' && inv.payments.trim() 
          ? JSON.parse(inv.payments) 
          : (Array.isArray(inv.payments) ? inv.payments : []);
      } catch (e) {}
      
      const paidAmount = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
      console.log(`    - ${inv.invoiceNumber} | total: ${inv.total}€ | payé: ${paidAmount}€ | deposit: ${inv.deposit || 0}€`);
    }
  }
  
  console.log('\n✅ Diagnostic terminé');
}

main().catch(console.error);