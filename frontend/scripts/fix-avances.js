import { Client, Databases, Query } from 'node-appwrite';
import 'dotenv/config';

const client = new Client()
  .setEndpoint(process.env.VITE_APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1')
  .setProject(process.env.VITE_APPWRITE_PROJECT_ID)
  .setKey(process.env.APPWRITE_API_KEY);

const databases = new Databases(client);
const DATABASE_ID = process.env.VITE_APPWRITE_DATABASE_ID || 'relancepro_db';

async function main() {
  console.log('🧹 CORRECTION DES ACOMPTES ET PAIEMENTS\n');
  console.log('⚠️  ATTENTION: Ce script modifie les données en base !\n');
  
  const readline = await import('readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const confirm = (question) => new Promise(resolve => rl.question(question, ans => resolve(ans.toLowerCase() === 'oui')));
  
  const teamsRes = await databases.listDocuments(DATABASE_ID, 'teams', [Query.limit(10)]);
  if (teamsRes.documents.length === 0) {
    console.log('❌ Aucune équipe trouvée');
    return;
  }
  
  let totalCorrections = 0;
  
  for (const team of teamsRes.documents) {
    console.log(`\n📁 Équipe: ${team.name || team.$id}`);
    
    const invoicesRes = await databases.listDocuments(DATABASE_ID, 'invoices', [
      Query.equal('teamId', team.$id),
      Query.limit(2000)
    ]);
    
    const invoices = invoicesRes.documents;
    
    // ========================================
    // CORRECTION 1 : Factures d'acompte marquées paid sans paiement
    // ========================================
    const advancePaidNoPayment = invoices.filter(inv => {
      if (inv.type !== 'advance') return false;
      if (inv.status !== 'paid') return false;
      
      let payments = [];
      try {
        payments = typeof inv.payments === 'string' && inv.payments.trim() 
          ? JSON.parse(inv.payments) 
          : (Array.isArray(inv.payments) ? inv.payments : []);
      } catch (e) {}
      
      const paidAmount = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
      return paidAmount === 0;
    });
    
    if (advancePaidNoPayment.length > 0) {
      console.log(`\n  🔧 ${advancePaidNoPayment.length} facture(s) d'acompte marquées payées sans paiement`);
      
      for (const inv of advancePaidNoPayment) {
        console.log(`    - ${inv.invoiceNumber} (${inv.total}€)`);
      }
      
      const shouldFix = await confirm('\n  Voulez-vous repasser ces factures en "draft" ? (oui/non): ');
      
      if (shouldFix) {
        for (const inv of advancePaidNoPayment) {
          try {
            await databases.updateDocument(DATABASE_ID, 'invoices', inv.$id, {
              status: 'draft',
              balance: inv.total,
              paidAt: null
            });
            console.log(`    ✅ ${inv.invoiceNumber} repassée en draft`);
            totalCorrections++;
          } catch (e) {
            console.error(`    ❌ Erreur sur ${inv.invoiceNumber}:`, e.message);
          }
        }
      }
    }
    
    // ========================================
    // CORRECTION 2 : Retirer le deposit des paiements fictifs
    // ========================================
    const invoicesWithDepositPayment = invoices.filter(inv => {
      if (inv.type === 'credit') return false;
      
      let payments = [];
      try {
        payments = typeof inv.payments === 'string' && inv.payments.trim() 
          ? JSON.parse(inv.payments) 
          : (Array.isArray(inv.payments) ? inv.payments : []);
      } catch (e) {}
      
      // Détecter les paiements qui pourraient être des doublons du deposit
      return payments.some(p => 
        (p.notes || '').includes('acompte') || 
        (p.reference || '').includes('acompte') ||
        (p.id || '').startsWith('quick-')
      );
    });
    
    if (invoicesWithDepositPayment.length > 0) {
      console.log(`\n  🔍 ${invoicesWithDepositPayment.length} facture(s) avec paiements potentiellement liés à un acompte`);
      
      for (const inv of invoicesWithDepositPayment) {
        let payments = [];
        try {
          payments = typeof inv.payments === 'string' && inv.payments.trim() 
            ? JSON.parse(inv.payments) 
            : (Array.isArray(inv.payments) ? inv.payments : []);
        } catch (e) {}
        
        console.log(`\n    📄 ${inv.invoiceNumber} (${inv.type}):`);
        payments.forEach((p, idx) => {
          console.log(`      [${idx}] ${p.amount}€ | ${p.method} | ${p.reference || 'sans ref'} | ${p.notes || 'sans note'}`);
        });
      }
      
      console.log('\n  ⚠️  Vérifiez manuellement ces paiements avant toute suppression.');
      console.log('  Si un paiement est un doublon du deposit, supprimez-le avec le script ci-dessous.');
    }
  }
  
  console.log(`\n✅ ${totalCorrections} correction(s) appliquée(s)`);
  rl.close();
}

main().catch(console.error);