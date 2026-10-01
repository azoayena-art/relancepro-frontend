require('dotenv').config();
const { Client, Databases, Permission, Role } = require('node-appwrite');

const config = {
  endpoint: process.env.VITE_APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1',
  projectId: process.env.VITE_APPWRITE_PROJECT_ID || process.env.APPWRITE_PROJECT_ID,
  databaseId: process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID,
  apiKey: process.env.VITE_APPWRITE_API_KEY || process.env.APPWRITE_API_KEY,
};

const COLLECTION_ID = 'einvoice_settings';
const client = new Client()
  .setEndpoint(config.endpoint)
  .setProject(config.projectId)
  .setKey(config.apiKey);
const databases = new Databases(client);

const attributes = [
  { key: 'teamId', type: 'string', size: 255, required: true },
  { key: 'userId', type: 'string', size: 255, required: false },
  { key: 'platform', type: 'string', size: 20, required: true, default: 'ppf' },
  { key: 'platformName', type: 'string', size: 255, required: false },
  { key: 'platformEndpoint', type: 'string', size: 1000, required: false },
  { key: 'platformApiKey', type: 'string', size: 1000, required: false },
  { key: 'transmissionFormat', type: 'string', size: 50, required: false, default: 'factur-x' },
  { key: 'autoTransmission', type: 'boolean', required: false, default: false },
  { key: 'requireElectronicForB2B', type: 'boolean', required: false, default: true },
];

(async () => {
  console.log('\n🚀 Création de la collection einvoice_settings...\n');
  
  try {
    // Créer la collection
    await databases.createCollection(
      config.databaseId,
      COLLECTION_ID,
      'Paramètres E-Facturation 2026',
      [
        Permission.read(Role.users()),
        Permission.create(Role.users()),
        Permission.update(Role.users()),
        Permission.delete(Role.users())
      ]
    );
    console.log('✅ Collection créée');
    
    // Attendre que la collection soit prête
    await new Promise(r => setTimeout(r, 2000));
    
    // Créer les attributs
    for (const attr of attributes) {
      try {
        if (attr.type === 'string') {
          await databases.createStringAttribute(
            config.databaseId, COLLECTION_ID,
            attr.key, attr.size, attr.required, attr.default
          );
        } else if (attr.type === 'boolean') {
          await databases.createBooleanAttribute(
            config.databaseId, COLLECTION_ID,
            attr.key, attr.required, attr.default
          );
        }
        console.log(`✅ ${attr.key}`);
        await new Promise(r => setTimeout(r, 300));
      } catch (e) {
        if (e.code === 409) console.log(`⏭️  ${attr.key} existe déjà`);
        else console.error(`❌ ${attr.key}:`, e.message);
      }
    }
    
    console.log('\n🎉 Collection einvoice_settings prête !');
    console.log('\n💡 Vous pouvez maintenant supprimer l\'attribut eInvoiceSettings');
    console.log('   de company_settings s\'il existe, ou simplement ne pas l\'utiliser.\n');
    
  } catch (e) {
    if (e.code === 409) {
      console.log('⏭️  La collection existe déjà');
    } else {
      console.error('❌ Erreur:', e.message);
    }
  }
})();