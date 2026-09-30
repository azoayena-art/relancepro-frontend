import { Client, Databases } from 'node-appwrite';

const client = new Client()
  .setEndpoint(process.env.VITE_APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1')
  .setProject(process.env.VITE_APPWRITE_PROJECT_ID)
  .setKey(process.env.APPWRITE_API_KEY); // Clé API avec droits d'admin

const databases = new Databases(client);
const DATABASE_ID = process.env.VITE_APPWRITE_DATABASE_ID || 'relancepro_db';

const collections = ['quotes', 'invoices', 'receipts'];

async function main() {
  for (const collection of collections) {
    try {
      console.log(`📝 Création de l'attribut currencyCode sur ${collection}...`);
      await databases.createStringAttribute(
        DATABASE_ID,
        collection,
        'currencyCode',
        10,      // Taille max
        false,   // Non requis
        'EUR',   // Valeur par défaut
        false    // Pas un tableau
      );
      console.log(`✅ Attribut créé sur ${collection}`);
    } catch (e) {
      if (e.code === 409) {
        console.log(`⚠️ L'attribut existe déjà sur ${collection}`);
      } else {
        console.error(`❌ Erreur sur ${collection}:`, e.message);
      }
    }
  }
}

main();