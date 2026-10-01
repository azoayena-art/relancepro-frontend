require('dotenv').config();
const { Client, Databases } = require('node-appwrite');

const config = {
  endpoint: process.env.VITE_APPWRITE_ENDPOINT || process.env.APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1',
  projectId: process.env.VITE_APPWRITE_PROJECT_ID || process.env.APPWRITE_PROJECT_ID,
  databaseId: process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID,
  apiKey: process.env.VITE_APPWRITE_API_KEY || process.env.APPWRITE_API_KEY,
};

const COLLECTION_ID = 'prospects';
const client = new Client().setEndpoint(config.endpoint).setProject(config.projectId).setKey(config.apiKey);
const databases = new Databases(client);

const attributes = [
  { key: 'country', type: 'string', size: 10, required: false, default: 'FR' },
  { key: 'siren', type: 'string', size: 9, required: false },
  { key: 'siret', type: 'string', size: 14, required: false },
  { key: 'vatNumber', type: 'string', size: 50, required: false },
];

async function addAttribute(attr) {
  try {
    const existing = await databases.listAttributes(config.databaseId, COLLECTION_ID);
    if (existing.attributes.some(a => a.key === attr.key)) {
      console.log(`⏭️  '${attr.key}' existe déjà`);
      return;
    }
    console.log(`➕ Création de '${attr.key}'...`);
    await databases.createStringAttribute(
      config.databaseId, COLLECTION_ID, attr.key, attr.size, attr.required, attr.default
    );
    console.log(`✅ '${attr.key}' créé`);
    await new Promise(r => setTimeout(r, 300));
  } catch (e) {
    if (e.code === 409) console.log(`⏭️  '${attr.key}' existe déjà (409)`);
    else console.error(`❌ Erreur '${attr.key}':`, e.message);
  }
}

(async () => {
  console.log('\n🚀 Mise à jour collection prospects...\n');
  for (const attr of attributes) await addAttribute(attr);
  console.log('\n🎉 Terminé !\n');
})();