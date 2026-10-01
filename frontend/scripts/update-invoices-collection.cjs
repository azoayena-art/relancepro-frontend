/**
 * Script de mise à jour de la collection 'invoices' pour ajouter les champs e-facturation
 */
require('dotenv').config();
const { Client, Databases } = require('node-appwrite');

// Configuration
const config = {
  endpoint: process.env.VITE_APPWRITE_ENDPOINT || process.env.APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1',
  projectId: process.env.VITE_APPWRITE_PROJECT_ID || process.env.APPWRITE_PROJECT_ID,
  databaseId: process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID,
  apiKey: process.env.VITE_APPWRITE_API_KEY || process.env.APPWRITE_API_KEY,
};

if (!config.apiKey || !config.databaseId) {
  console.error('❌ Erreur: Variables d\'environnement manquantes (.env)');
  process.exit(1);
}

const COLLECTION_ID = 'invoices';

const client = new Client()
  .setEndpoint(config.endpoint)
  .setProject(config.projectId)
  .setKey(config.apiKey);

const databases = new Databases(client);

// Définition des attributs à ajouter
const attributesToAdd = [
  {
    key: 'isElectronic',
    type: 'boolean',
    required: false,
    default: false,
  },
  {
    key: 'transmissionStatus',
    type: 'string',
    size: 50,
    required: false,
    default: 'draft',
  },
  {
    key: 'xmlContent',
    type: 'string',
    size: 100000, // Suffisant pour un XML Factur-X standard
    required: false,
  },
  {
    key: 'pdfHash',
    type: 'string',
    size: 255,
    required: false,
  },
  {
    key: 'transmissionReference',
    type: 'string',
    size: 255,
    required: false,
  },
  // Champs bonus très utiles pour le suivi
  {
    key: 'transmittedAt',
    type: 'datetime',
    required: false,
  },
  {
    key: 'acceptedAt',
    type: 'datetime',
    required: false,
  },
  {
    key: 'rejectedAt',
    type: 'datetime',
    required: false,
  },
  {
    key: 'rejectionReason',
    type: 'string',
    size: 1000,
    required: false,
  }
];

async function addAttributeIfNotExists(attr) {
  try {
    // Vérifier si l'attribut existe déjà
    const existing = await databases.listAttributes(config.databaseId, COLLECTION_ID);
    const exists = existing.attributes.some(a => a.key === attr.key);
    
    if (exists) {
      console.log(`⏭️  Attribut '${attr.key}' existe déjà, ignoré.`);
      return;
    }

    // Créer l'attribut selon son type
    console.log(`➕ Création de l'attribut '${attr.key}' (${attr.type})...`);
    
    if (attr.type === 'boolean') {
      await databases.createBooleanAttribute(
        config.databaseId, COLLECTION_ID, attr.key, attr.required, attr.default
      );
    } else if (attr.type === 'string') {
      await databases.createStringAttribute(
        config.databaseId, COLLECTION_ID, attr.key, attr.size, attr.required, attr.default || undefined
      );
    } else if (attr.type === 'datetime') {
      await databases.createDatetimeAttribute(
        config.databaseId, COLLECTION_ID, attr.key, attr.required, attr.default || undefined
      );
    }
    
    console.log(`✅ Attribut '${attr.key}' créé avec succès.`);
    
    // Petit délai pour éviter de surcharger l'API Appwrite
    await new Promise(resolve => setTimeout(resolve, 300));
    
  } catch (error) {
    if (error.code === 409) {
      console.log(`⏭️  Attribut '${attr.key}' existe déjà (conflit 409), ignoré.`);
    } else {
      console.error(`❌ Erreur lors de la création de '${attr.key}':`, error.message);
    }
  }
}

async function main() {
  console.log('\n🚀 Mise à jour de la collection "invoices" pour l\'e-facturation...\n');
  
  try {
    for (const attr of attributesToAdd) {
      await addAttributeIfNotExists(attr);
    }
    
    console.log('\n🎉 Mise à jour terminée avec succès !');
    console.log('Tu peux maintenant utiliser ces champs dans ton code React/Appwrite.');
  } catch (error) {
    console.error('\n💥 Erreur fatale:', error.message);
    process.exit(1);
  }
}

main();