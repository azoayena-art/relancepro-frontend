import { Client, Databases, Query } from 'node-appwrite';
import 'dotenv/config';

const client = new Client()
  .setEndpoint(process.env.VITE_APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1')
  .setProject(process.env.VITE_APPWRITE_PROJECT_ID)
  .setKey(process.env.APPWRITE_API_KEY);

const databases = new Databases(client);
const DATABASE_ID = process.env.VITE_APPWRITE_DATABASE_ID || 'relancepro_db';

async function main() {
  const metas = await databases.listDocuments(DATABASE_ID, 'invoice_metadata', [Query.limit(1000)]);
  const invs = await databases.listDocuments(DATABASE_ID, 'invoices', [Query.limit(2000)]);
  const invIds = new Set(invs.documents.map(d => d.$id));

  let deleted = 0;
  for (const m of metas.documents) {
    if (!invIds.has(m.invoiceId)) {
      console.log(`🗑️  Orpheline : ${m.$id} (invoiceId="${m.invoiceId}")`);
      await databases.deleteDocument(DATABASE_ID, 'invoice_metadata', m.$id);
      deleted++;
    }
  }
  console.log(`✅ ${deleted} métadonnée(s) orpheline(s) supprimée(s)`);
}

main().catch(console.error);