require('dotenv').config();
const { Client, Databases } = require('node-appwrite');

const config = {
  endpoint: process.env.VITE_APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1',
  projectId: process.env.VITE_APPWRITE_PROJECT_ID || process.env.APPWRITE_PROJECT_ID,
  databaseId: process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID,
  apiKey: process.env.VITE_APPWRITE_API_KEY || process.env.APPWRITE_API_KEY,
};

const COLLECTION_ID = 'company_settings';
const ATTRIBUTE_KEY = 'eInvoiceSettings';
const ATTRIBUTE_SIZE = 3000; // ✅ Réduit de 10000 à 3000 (suffisant pour le JSON)

const client = new Client()
  .setEndpoint(config.endpoint)
  .setProject(config.projectId)
  .setKey(config.apiKey);
const databases = new Databases(client);

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  console.log('\n🚀 Ajout de eInvoiceSettings à company_settings...\n');

  try {
    // Étape 1 : Vérifier l'état actuel
    const attrs = await databases.listAttributes(config.databaseId, COLLECTION_ID);
    const existing = attrs.attributes.find(a => a.key === ATTRIBUTE_KEY);

    if (existing) {
      if (existing.status === 'available') {
        console.log('✅ L\'attribut existe déjà et est disponible !');
        return;
      } else {
        console.log(`⏳ L'attribut existe mais est en statut "${existing.status}".`);
        console.log('   Attente de 10 secondes avant de réessayer...');
        await sleep(10000);
      }
    }

    // Étape 2 : Vérifier les attributs bloqués
    const processing = attrs.attributes.filter(a => a.status !== 'available');
    if (processing.length > 0) {
      console.log(`⚠️  ${processing.length} attribut(s) en cours de traitement :`);
      processing.forEach(a => console.log(`   - ${a.key} (${a.status})`));
      console.log('   Attente de 15 secondes...');
      await sleep(15000);
    }

    // Étape 3 : Créer l'attribut avec retry
    const MAX_RETRIES = 3;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        console.log(`\n📝 Tentative ${attempt}/${MAX_RETRIES} de création...`);
        await databases.createStringAttribute(
          config.databaseId,
          COLLECTION_ID,
          ATTRIBUTE_KEY,
          ATTRIBUTE_SIZE,
          false,  // non requis
          null    // pas de valeur par défaut
        );
        console.log('✅ Attribut eInvoiceSettings créé avec succès !');
        console.log(`   Taille : ${ATTRIBUTE_SIZE} caractères`);
        console.log('\n🎉 Terminé ! Vous pouvez maintenant utiliser l\'onglet E-Facturation 2026.\n');
        return;
      } catch (e) {
        if (e.code === 409) {
          console.log('⏭️  L\'attribut existe déjà (conflit 409).');
          return;
        }
        if (attempt < MAX_RETRIES) {
          console.log(`❌ Échec : ${e.message}`);
          console.log(`   Attente de ${attempt * 5} secondes avant de réessayer...`);
          await sleep(attempt * 5000);
        } else {
          throw e;
        }
      }
    }

  } catch (e) {
    console.error('\n❌ Erreur finale:', e.message);
    console.error('\n💡 Si l\'erreur persiste, utilisez la méthode manuelle :');
    console.error('   1. Console Appwrite → Databases → company_settings → Attributes');
    console.error('   2. Create attribute → String → Key: eInvoiceSettings → Size: 3000\n');
    process.exit(1);
  }
})();
