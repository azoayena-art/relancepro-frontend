// functions/refund-credit/index.js
import { Client, Databases, ID, Query } from 'node-appwrite';

export default async ({ req, res, error }) => {
  try {
    // Configuration depuis les variables d'environnement
    const client = new Client()
      .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT)
      .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
      .setKey(process.env.APPWRITE_API_KEY);
    
    const databases = new Databases(client);
    const DATABASE_ID = process.env.DATABASE_ID || 'relancepro_db';
    const METADATA_COLLECTION = 'invoice_metadata';
    const EVENTS_COLLECTION = 'accounting_events';
    
    // Parser le body de la requête
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { creditInvoiceId, amount, date, method, reference, userId, teamId } = body;
    
    if (!creditInvoiceId || !amount || amount <= 0) {
      return res.json({ success: false, error: 'Paramètres invalides' }, 400);
    }
    
    const MAX_RETRIES = 3;
    
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      // Lire la métadonnée fraîche
      const metadataDocs = await databases.listDocuments(DATABASE_ID, METADATA_COLLECTION, [
        Query.equal('invoiceId', creditInvoiceId),
        Query.limit(1)
      ]);
      
      if (metadataDocs.documents.length === 0) {
        return res.json({ success: false, error: 'Métadonnée introuvable' }, 404);
      }
      
      const metadataDoc = metadataDocs.documents[0];
      const creditData = JSON.parse(metadataDoc.creditData || '{}');
      const currentVersion = metadataDoc.metadataVersion || 0;
      
      const refunds = Array.isArray(creditData.refundPayments) ? creditData.refundPayments : [];
      const refunded = refunds.reduce((s, p) => s + (p.amount || 0), 0);
      const allocated = creditData.allocatedAmount || 0;
      const totalAmount = creditData.totalAmount || 0;
      const refundable = Math.max(0, totalAmount - allocated - refunded);
      
      if (amount > refundable + 0.01) {
        return res.json({ 
          success: false, 
          error: `Montant invalide. Remboursable : ${refundable.toFixed(2)}` 
        }, 400);
      }
      
      // Préparer le nouveau remboursement
      const payment = {
        id: `refund-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        amount,
        date,
        method,
        reference: reference || ''
      };
      
      const newRefunds = [...refunds, payment];
      const newRefunded = newRefunds.reduce((s, p) => s + p.amount, 0);
      const newStatus = newRefunded >= totalAmount - 0.01 ? 'refunded' : 
                        (allocated > 0 ? 'partial_refund' : 'to_refund');
      
      const newCreditData = {
        ...creditData,
        refundPayments: newRefunds,
        refundedAmount: newRefunded,
        creditStatus: newStatus,
        lastRefundAt: new Date().toISOString(),
        lastRefundBy: userId
      };
      
      try {
        // Mise à jour avec incrémentation de version (verrouillage optimiste)
        await databases.updateDocument(DATABASE_ID, METADATA_COLLECTION, metadataDoc.$id, {
          creditData: JSON.stringify(newCreditData),
          metadataVersion: currentVersion + 1
        });
        
        // Créer l'événement comptable
        await databases.createDocument(DATABASE_ID, EVENTS_COLLECTION, ID.unique(), {
          teamId,
          data: JSON.stringify({
            type: 'credit_refund',
            documentType: 'credit',
            documentId: creditInvoiceId,
            amount,
            eventDate: date,
            method,
            reference: reference || '',
            createdBy: userId,
            createdAt: new Date().toISOString()
          })
        });
        
        return res.json({ 
          success: true, 
          refundedAmount: newRefunded,
          newStatus 
        });
        
      } catch (e) {
        console.error(`Tentative ${attempt + 1} échouée:`, e);
        if (attempt < MAX_RETRIES - 1) {
          await new Promise(r => setTimeout(r, 100 * Math.pow(2, attempt)));
          continue;
        }
        throw e;
      }
    }
    
    return res.json({ success: false, error: 'Échec après plusieurs tentatives' }, 500);
    
  } catch (e) {
    error(e.message);
    return res.json({ success: false, error: e.message }, 500);
  }
};