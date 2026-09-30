import { Client, Databases } from 'node-appwrite';
import 'dotenv/config';

const client = new Client()
  .setEndpoint(process.env.VITE_APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1')
  .setProject(process.env.VITE_APPWRITE_PROJECT_ID)
  .setKey(process.env.APPWRITE_API_KEY);

const databases = new Databases(client);
const DATABASE_ID = process.env.VITE_APPWRITE_DATABASE_ID || 'relancepro_db';
const COLLECTION_ID = 'invoice_metadata';

// Attributs requis pour invoice_metadata
const REQUIRED_ATTRIBUTES = [
  { key: 'teamId', type: 'string', size: 100 },
  { key: 'invoiceId', type: 'string', size: 100 },
  { key: 'creditData', type: 'string', size: 100000 },
  { key: 'archiveData', type: 'string', size: 10000 },
  { key: 'reconciliationData', type: 'string', size: 10000 },
  { key: 'metadataVersion', type: 'integer' },  // ← L'attribut manquant
];

async function main() {
  console.log('🔍 Vérification de la collection invoice_metadata...\n');

  // 1. Vérifier si la collection existe
  let collectionExists = true;
  try {
    await databases.getCollection(DATABASE_ID, COLLECTION_ID);
    console.log(`✅ Collection "${COLLECTION_ID}" existe`);
  } catch (e) {
    collectionExists = false;
    console.log(`⚠️ Collection "${COLLECTION_ID}" introuvable, création...`);
    try {
      await databases.createCollection(DATABASE_ID, COLLECTION_ID, 'invoice_metadata');
      console.log(`✅ Collection créée`);
    } catch (ce) {
      console.error('❌ Impossible de créer la collection:', ce.message);
      return;
    }
  }

  // 2. Lister les attributs existants
  let existingKeys = [];
  try {
    const attrs = await databases.listAttributes(DATABASE_ID, COLLECTION_ID);
    existingKeys = attrs.attributes.map(a => a.key);
    console.log(`📋 Attributs existants : ${existingKeys.join(', ') || '(aucun)'}\n`);
  } catch (e) {
    console.warn('⚠️ Impossible de lister les attributs:', e.message);
  }

  // 3. Créer les attributs manquants
  for (const attr of REQUIRED_ATTRIBUTES) {
    if (existingKeys.includes(attr.key)) {
      console.log(`✅ ${attr.key} existe déjà`);
      continue;
    }

    try {
      if (attr.type === 'string') {
        await databases.createStringAttribute(DATABASE_ID, COLLECTION_ID, attr.key, attr.size, false);
      } else if (attr.type === 'integer') {
        await databases.createIntegerAttribute(DATABASE_ID, COLLECTION_ID, attr.key, false, 0);
      }
      console.log(`✅ ${attr.key} créé`);
      // Attendre que l'attribut soit disponible
      await new Promise(r => setTimeout(r, 1500));
    } catch (e) {
      if (e.code === 409) {
        console.log(`⚠️ ${attr.key} existe déjà (conflit)`);
      } else {
        console.error(`❌ Erreur création ${attr.key}:`, e.message);
      }
    }
  }

  console.log('\n🎉 Terminé ! Tu peux maintenant générer des avoirs.');
}

main().catch(console.error);