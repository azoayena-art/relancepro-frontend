// scripts/setup-company-settings.js
// Script à exécuter UNE SEULE FOIS

// Charger les variables d'environnement
import 'dotenv/config';
import { Client, Databases } from 'node-appwrite';

// Configuration
const ENDPOINT = process.env.VITE_APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1';
const PROJECT_ID = process.env.VITE_APPWRITE_PROJECT_ID;
const API_KEY = process.env.APPWRITE_API_KEY;
const DATABASE_ID = process.env.VITE_APPWRITE_DATABASE_ID;
const COLLECTION_ID = 'company_settings';

// Vérification
if (!PROJECT_ID || !API_KEY || !DATABASE_ID) {
  console.error('❌ Variables manquantes dans .env :');
  console.error('   - VITE_APPWRITE_PROJECT_ID');
  console.error('   - APPWRITE_API_KEY');
  console.error('   - VITE_APPWRITE_DATABASE_ID');
  process.exit(1);
}

console.log('📋 Configuration détectée :');
console.log(`   Project ID : ${PROJECT_ID}`);
console.log(`   Database   : ${DATABASE_ID}`);
console.log('');

// Client Appwrite
const client = new Client()
  .setEndpoint(ENDPOINT)
  .setProject(PROJECT_ID)
  .setKey(API_KEY);

const databases = new Databases(client);

// Attributs à créer
const ATTRIBUTES = [
  { key: 'tvaRates', size: 10000, required: false },
  { key: 'currency', size: 10, required: false },
  { key: 'defaultTvaRate', size: 10, required: false },
  { key: 'publicSlug', size: 100, required: false },
  { key: 'logoFileId', size: 100, required: false },
];

// Exécution
async function setup() {
  console.log('🚀 Démarrage du setup...\n');

  // Récupérer les attributs existants
  let existingKeys = [];
  try {
    const existing = await databases.listAttributes(DATABASE_ID, COLLECTION_ID);
    existingKeys = existing.attributes.map(a => a.key);
  } catch (e) {
    console.error(`❌ Erreur : ${e.message}`);
    process.exit(1);
  }

  // Créer les attributs manquants
  let created = 0, skipped = 0, errors = 0;

  for (const attr of ATTRIBUTES) {
    if (existingKeys.includes(attr.key)) {
      console.log(`⚠️  ${attr.key.padEnd(20)} existe déjà`);
      skipped++;
      continue;
    }

    try {
      console.log(`📝 Création de ${attr.key}...`);
      await databases.createStringAttribute(
        DATABASE_ID, COLLECTION_ID, attr.key, attr.size, attr.required
      );
      console.log(`✅ ${attr.key.padEnd(20)} créé (size=${attr.size})`);
      created++;
      await new Promise(r => setTimeout(r, 1500));
    } catch (e) {
      console.error(`❌ ${attr.key.padEnd(20)} erreur : ${e.message}`);
      errors++;
    }
  }

  // Résumé
  console.log('\n' + '='.repeat(50));
  console.log(`✅ Créés : ${created} | ⚠️ Existants : ${skipped} | ❌ Erreurs : ${errors}`);
  console.log('='.repeat(50));
  
  if (errors === 0) {
    console.log('\n🎉 Setup terminé ! Tu peux maintenant enregistrer les paramètres entreprise.');
  }
}

setup().catch(e => {
  console.error('❌ Erreur fatale :', e.message);
  process.exit(1);
});