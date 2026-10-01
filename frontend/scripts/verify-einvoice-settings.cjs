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

const REQUIRED_ATTRS = [
  'teamId', 'userId', 'platform', 'platformName', 'platformEndpoint',
  'platformApiKey', 'transmissionFormat', 'autoTransmission', 'requireElectronicForB2B'
];

(async () => {
  try {
    const res = await databases.listAttributes(config.databaseId, 'einvoice_settings');
    
    console.log(`\n📊 Attributs présents : ${res.attributes.length}/${REQUIRED_ATTRS.length}\n`);
    
    const existingKeys = res.attributes.map(a => a.key);
    let allOk = true;
    
    REQUIRED_ATTRS.forEach(key => {
      const attr = res.attributes.find(a => a.key === key);
      if (attr) {
        console.log(`  ✅ ${key.padEnd(25)} | ${attr.type.padEnd(10)} | status: ${attr.status}`);
      } else {
        console.log(`  ❌ ${key.padEnd(25)} | MANQUANT`);
        allOk = false;
      }
    });
    
    console.log('\n' + '─'.repeat(60));
    console.log(allOk 
      ? '\n🎉 Tous les attributs sont présents ! La collection est prête.\n'
      : '\n⚠️  Certains attributs sont manquants. Exécutez le script de correction.\n');
      
  } catch (e) {
    console.error('❌ Erreur:', e.message);
  }
})();