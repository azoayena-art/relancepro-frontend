require('dotenv').config();
const { Client, Databases } = require('node-appwrite');

const config = {
  endpoint: process.env.VITE_APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1',
  projectId: process.env.VITE_APPWRITE_PROJECT_ID || process.env.APPWRITE_PROJECT_ID,
  databaseId: process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID,
  apiKey: process.env.VITE_APPWRITE_API_KEY || process.env.APPWRITE_API_KEY,
};

const COLLECTION_ID = 'invoices';
const client = new Client()
  .setEndpoint(config.endpoint)
  .setProject(config.projectId)
  .setKey(config.apiKey);
const databases = new Databases(client);

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const attributes = [
  { key: 'isElectronic', type: 'boolean', required: false, default: false },
  { key: 'transmissionStatus', type: 'string', size: 50, required: false, default: null },
  { key: 'xmlContent', type: 'string', size: 50000, required: false, default: null },
  { key: 'pdfHash', type: 'string', size: 100, required: false, default: null },
  { key: 'einvoicePlatform', type: 'string', size: 20, required: false, default: 'ppf' },
  { key: 'einvoiceFormat', type: 'string', size: 50, required: false, default: 'factur-x' },
  { key: 'transmissionReference', type: 'string', size: 255, required: false, default: null },
];

(async () => {
  console.log('\n🚀 Ajout des attributs e-facturation à la collection invoices...\n');

  // Vérifier les attributs existants
  let existingAttrs = [];
  try {
    const res = await databases.listAttributes(config.databaseId, COLLECTION_ID);
    existingAttrs = res.attributes.map(a => a.key);
    console.log(`📊 ${existingAttrs.length} attributs existants dans la collection`);
  } catch (e) {
    console.error('❌ Impossible de lister les attributs:', e.message);
    process.exit(1);
  }

  let created = 0;
  let skipped = 0;

  for (const attr of attributes) {
    if (existingAttrs.includes(attr.key)) {
      console.log(`⏭️  ${attr.key} existe déjà`);
      skipped++;
      continue;
    }

    try {
      console.log(`➕ Création de ${attr.key}...`);
      
      if (attr.type === 'boolean') {
        await databases.createBooleanAttribute(
          config.databaseId,
          COLLECTION_ID,
          attr.key,
          attr.required || false,
          attr.default !== undefined ? attr.default : null
        );
      } else if (attr.type === 'string') {
        await databases.createStringAttribute(
          config.databaseId,
          COLLECTION_ID,
          attr.key,
          attr.size,
          attr.required || false,
          attr.default !== undefined ? attr.default : null
        );
      }
      
      console.log(`✅ ${attr.key} créé`);
      created++;
      await sleep(500); // Pause pour éviter le rate limiting
    } catch (e) {
      if (e.code === 409) {
        console.log(`⏭️  ${attr.key} existe déjà (conflit)`);
        skipped++;
      } else {
        console.error(`❌ Erreur ${attr.key}:`, e.message);
      }
    }
  }

  console.log('\n' + '─'.repeat(60));
  console.log(`\n🎉 Terminé ! ${created} attribut(s) créé(s), ${skipped} ignoré(s)`);
  console.log('\n💡 Vous pouvez maintenant tester la conversion en E-Facture.\n');
})();