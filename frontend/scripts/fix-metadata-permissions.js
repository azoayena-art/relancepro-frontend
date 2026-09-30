import { Client, Databases } from 'node-appwrite';
import 'dotenv/config';

const client = new Client()
  .setEndpoint(process.env.VITE_APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1')
  .setProject(process.env.VITE_APPWRITE_PROJECT_ID)
  .setKey(process.env.APPWRITE_API_KEY);

const databases = new Databases(client);
const DATABASE_ID = process.env.VITE_APPWRITE_DATABASE_ID || 'relancepro_db';

async function main() {
  try {
    console.log('📝 Mise à jour des permissions de invoice_metadata...');
    
    await databases.updateCollection(
      DATABASE_ID,
      'invoice_metadata',
      'invoice_metadata',
      undefined,
      undefined,
      true,  // documentSecurity = true
      [
        'create("users")',
        'read("users")',
        'update("users")',
        'delete("users")'
      ]
    );
    
    console.log('✅ Permissions mises à jour : tous les utilisateurs authentifiés peuvent gérer les documents');
    console.log('⚠️ ATTENTION : Cela donne les droits à TOUS les utilisateurs connectés.');
    console.log('   Pour plus de sécurité, utilisez des permissions par équipe dans le code.');
  } catch (e) {
    console.error('❌ Erreur:', e.message);
    console.log('\n💡 Alternative : Configurez manuellement dans la console Appwrite :');
    console.log('   Databases → invoice_metadata → Settings → Permissions');
    console.log('   Ajoutez "Any authenticated user" avec Read/Create/Update/Delete');
  }
}

main();