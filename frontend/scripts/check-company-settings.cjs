require('dotenv').config();
const { Client, Databases } = require('node-appwrite');

const config = {
  endpoint: process.env.VITE_APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1',
  projectId: process.env.VITE_APPWRITE_PROJECT_ID || process.env.APPWRITE_PROJECT_ID,
  databaseId: process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID,
  apiKey: process.env.VITE_APPWRITE_API_KEY || process.env.APPWRITE_API_KEY,
};

const client = new Client()
  .setEndpoint(config.endpoint)
  .setProject(config.projectId)
  .setKey(config.apiKey);

const databases = new Databases(client);

(async () => {
  try {
    const res = await databases.listAttributes(
      config.databaseId,
      'company_settings'
    );
    
    console.log(`\n📊 Total : ${res.attributes.length} attributs\n`);
    console.log('─'.repeat(60));
    
    let totalSize = 0;
    res.attributes.forEach(attr => {
      const size = attr.size || '-';
      if (attr.size) totalSize += attr.size;
      console.log(`  ${attr.key.padEnd(30)} | Type: ${attr.type.padEnd(10)} | Taille: ${size}`);
    });
    
    console.log('─'.repeat(60));
    console.log(`\n📏 Taille totale estimée : ${totalSize} caractères`);
    console.log(`⚠️  Limite Appwrite : ~1 000 000 caractères au total\n`);
    
    // Vérifier si eInvoiceSettings existe déjà
    const hasEInvoice = res.attributes.some(a => a.key === 'eInvoiceSettings');
    console.log(hasEInvoice 
      ? '✅ eInvoiceSettings existe déjà !' 
      : '❌ eInvoiceSettings manquant');
      
  } catch (e) {
    console.error('❌ Erreur:', e.message);
  }
})();