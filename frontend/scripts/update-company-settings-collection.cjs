require('dotenv').config();
const { Client, Databases } = require('node-appwrite');

const config = {
  endpoint: process.env.VITE_APPWRITE_ENDPOINT || process.env.APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1',
  projectId: process.env.VITE_APPWRITE_PROJECT_ID || process.env.APPWRITE_PROJECT_ID,
  databaseId: process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID,
  apiKey: process.env.VITE_APPWRITE_API_KEY || process.env.APPWRITE_API_KEY,
};

const COLLECTION_ID = 'company_settings';
const client = new Client().setEndpoint(config.endpoint).setProject(config.projectId).setKey(config.apiKey);
const databases = new Databases(client);

(async () => {
  try {
    await databases.createStringAttribute(
      config.databaseId, COLLECTION_ID, 'eInvoiceSettings', 10000, false
    );
    console.log('✅ Attribut eInvoiceSettings créé');
  } catch (e) {
    if (e.code === 409) console.log('⏭️  Attribut existe déjà');
    else console.error('❌ Erreur:', e.message);
  }
})();