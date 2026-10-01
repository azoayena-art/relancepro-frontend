require('dotenv').config();
const { Client, Databases } = require('node-appwrite');

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

(async () => {
  console.log('\n🔧 Correction de l\'attribut platform...\n');
  
  try {
    // Vérifier si l'attribut existe déjà
    const attrs = await databases.listAttributes(config.databaseId, COLLECTION_ID);
    const existing = attrs.attributes.find(a => a.key === 'platform');
    
    if (existing) {
      console.log('✅ L\'attribut platform existe déjà !');
      return;
    }
    
    // ✅ Créer sans valeur par défaut (required: false)
    await databases.createStringAttribute(
      config.databaseId,
      COLLECTION_ID,
      'platform',
      20,       // taille suffisante pour 'ppf', 'pdp', 'od'
      false,    // ✅ NON requis (permet d'avoir une valeur par défaut côté code)
      'ppf'     // ✅ Valeur par défaut autorisée car non requis
    );
    
    console.log('✅ Attribut platform créé avec succès !');
    console.log('   Type: string');
    console.log('   Taille: 20 caractères');
    console.log('   Requis: Non');
    console.log('   Défaut: "ppf"');
    console.log('\n🎉 Collection einvoice_settings complète !\n');
    
  } catch (e) {
    if (e.code === 409) {
      console.log('⏭️  L\'attribut existe déjà (conflit 409).');
    } else {
      console.error('❌ Erreur:', e.message);
      process.exit(1);
    }
  }
})();