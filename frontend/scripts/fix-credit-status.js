import { Client, Databases, Query } from 'node-appwrite';
import 'dotenv/config';

const client = new Client()
  .setEndpoint(process.env.VITE_APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1')
  .setProject(process.env.VITE_APPWRITE_PROJECT_ID)
  .setKey(process.env.APPWRITE_API_KEY);

const databases = new Databases(client);
const DATABASE_ID = process.env.VITE_APPWRITE_DATABASE_ID || 'relancepro_db';

async function main() {
  console.log('🔍 Recherche des avoirs sans metadata...\n');
  
  // Récupérer tous les avoirs
  const creditsRes = await databases.listDocuments(DATABASE_ID, 'invoices', [
    Query.equal('type', 'credit'),
    Query.limit(2000)
  ]);
  
  console.log(`📋 ${creditsRes.documents.length} avoir(s) trouvé(s)\n`);
  
  for (const credit of creditsRes.documents) {
    // Vérifier si la metadata existe
    const metaRes = await databases.listDocuments(DATABASE_ID, 'invoice_metadata', [
      Query.equal('invoiceId', credit.$id),
      Query.limit(1)
    ]);
    
    if (metaRes.documents.length === 0) {
      console.log(`⚠️ Avoir ${credit.invoiceNumber} sans metadata, création...`);
      
      // Vérifier si la facture d'origine est payée
      let originalPaid = false;
      if (credit.originalInvoiceId) {
        try {
          const original = await databases.getDocument(DATABASE_ID, 'invoices', credit.originalInvoiceId);
          originalPaid = original.status === 'paid';
        } catch (e) {}
      }
      
      const creditStatus = originalPaid ? 'to_refund' : 'allocated';
      const allocatedAmount = originalPaid ? 0 : (credit.total || 0);
      
      await databases.createDocument(DATABASE_ID, 'invoice_metadata', credit.$id, {
        teamId: credit.teamId,
        invoiceId: credit.$id,
        creditData: JSON.stringify({
          creditStatus,
          allocatedAmount,
          refundedAmount: 0,
          refundPayments: [],
          taxBreakdown: []
        }),
        archiveData: '{}',
        reconciliationData: '{}',
        metadataVersion: 1
      });
      
      console.log(`✅ Metadata créée : ${creditStatus}\n`);
    } else {
      const creditData = JSON.parse(metaRes.documents[0].creditData || '{}');
      console.log(`✅ Avoir ${credit.invoiceNumber} : ${creditData.creditStatus || 'undefined'}`);
      
      // Si creditStatus est undefined, corriger
      if (!creditData.creditStatus) {
        let originalPaid = false;
        if (credit.originalInvoiceId) {
          try {
            const original = await databases.getDocument(DATABASE_ID, 'invoices', credit.originalInvoiceId);
            originalPaid = original.status === 'paid';
          } catch (e) {}
        }
        
        const creditStatus = originalPaid ? 'to_refund' : 'allocated';
        creditData.creditStatus = creditStatus;
        creditData.allocatedAmount = originalPaid ? 0 : (credit.total || 0);
        
        await databases.updateDocument(DATABASE_ID, 'invoice_metadata', metaRes.documents[0].$id, {
          creditData: JSON.stringify(creditData),
          metadataVersion: (metaRes.documents[0].metadataVersion || 0) + 1
        });
        
        console.log(`✅ Corrigé : ${creditStatus}\n`);
      }
    }
  }
  
  console.log('\n🎉 Terminé !');
}

main().catch(console.error);