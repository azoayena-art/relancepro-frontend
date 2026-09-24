import { Client, Databases, Permission, Role } from 'node-appwrite';
import dotenv from 'dotenv';

dotenv.config();

const client = new Client()
  .setEndpoint(process.env.VITE_APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1')
  .setProject(process.env.VITE_APPWRITE_PROJECT_ID)
  .setKey(process.env.APPWRITE_API_KEY);

const databases = new Databases(client);
const DATABASE_ID = process.env.VITE_APPWRITE_DATABASE_ID || 'relancepro_db';
const COLLECTION_ID = 'quotes';

async function recreateQuotesCollection() {
  console.log('\n========================================');
  console.log('🔄 DÉBUT DE LA RÉCRÉATION DE LA COLLECTION "quotes"');
  console.log('========================================\n');

  try {
    // ÉTAPE 1 : Supprimer l'ancienne collection
    console.log('🗑️  ÉTAPE 1 : Suppression de l\'ancienne collection...');
    try {
      await databases.deleteCollection(DATABASE_ID, COLLECTION_ID);
      console.log('✅ Ancienne collection supprimée avec succès.\n');
    } catch (e) {
      console.log('ℹ️  Collection n\'existait pas, on continue...\n');
    }

    // ÉTAPE 2 : Créer la nouvelle collection
    console.log('📁 ÉTAPE 2 : Création de la nouvelle collection...');
    await databases.createCollection(
      DATABASE_ID,
      COLLECTION_ID,
      'quotes',
      [
        Permission.create(Role.any()),
        Permission.read(Role.any()),
        Permission.update(Role.any()),
        Permission.delete(Role.any())
      ]
    );
    console.log('✅ Collection créée avec succès.\n');

    // ÉTAPE 3 : Ajouter TOUS les attributs
    console.log('➕ ÉTAPE 3 : Ajout des attributs...\n');

    // --- BLOC 1 & 2 : Liens et identification ---
    console.log('  📝 BLOC 1 & 2 : Liens et identification');
    await databases.createStringAttribute(DATABASE_ID, COLLECTION_ID, 'userId', 255, true);
    console.log('    ✅ userId (requis)');
    
    await databases.createStringAttribute(DATABASE_ID, COLLECTION_ID, 'prospectId', 255, true);
    console.log('    ✅ prospectId (requis)');
    
    await databases.createStringAttribute(DATABASE_ID, COLLECTION_ID, 'quoteNumber', 50, true);
    console.log('    ✅ quoteNumber (requis)');
    
    await databases.createStringAttribute(DATABASE_ID, COLLECTION_ID, 'issueDate', 50, true);
    console.log('    ✅ issueDate (requis)');
    
    await databases.createStringAttribute(DATABASE_ID, COLLECTION_ID, 'validityDate', 50, true);
    console.log('    ✅ validityDate (requis)');

    // --- BLOC 3 : Détails ---
    console.log('\n  📝 BLOC 3 : Détails');
    await databases.createStringAttribute(DATABASE_ID, COLLECTION_ID, 'subject', 255, true);
    console.log('    ✅ subject (requis)');
    
    await databases.createStringAttribute(DATABASE_ID, COLLECTION_ID, 'workAddress', 500, false);
    console.log('    ✅ workAddress (optionnel)');

    // --- BLOC 4 : Prestations ---
    console.log('\n  📝 BLOC 4 : Prestations');
    await databases.createStringAttribute(DATABASE_ID, COLLECTION_ID, 'items', 65000, true);
    console.log('    ✅ items (requis, taille 65000)');

    // --- BLOC 1 : Entreprise ---
    console.log('\n  📝 BLOC 1 : Entreprise');
    await databases.createStringAttribute(DATABASE_ID, COLLECTION_ID, 'companyName', 255, false);
    console.log('    ✅ companyName');
    
    await databases.createStringAttribute(DATABASE_ID, COLLECTION_ID, 'companyLegalForm', 100, false);
    console.log('    ✅ companyLegalForm');
    
    await databases.createStringAttribute(DATABASE_ID, COLLECTION_ID, 'companyAddress', 500, false);
    console.log('    ✅ companyAddress');
    
    await databases.createStringAttribute(DATABASE_ID, COLLECTION_ID, 'companySiret', 50, false);
    console.log('    ✅ companySiret');
    
    await databases.createStringAttribute(DATABASE_ID, COLLECTION_ID, 'companyRcs', 100, false);
    console.log('    ✅ companyRcs');
    
    await databases.createStringAttribute(DATABASE_ID, COLLECTION_ID, 'companyTva', 100, false);
    console.log('    ✅ companyTva');

    // --- BLOC 2 : Client ---
    console.log('\n  📝 BLOC 2 : Client');
    await databases.createStringAttribute(DATABASE_ID, COLLECTION_ID, 'clientName', 255, false);
    console.log('    ✅ clientName');
    
    await databases.createStringAttribute(DATABASE_ID, COLLECTION_ID, 'clientAddress', 500, false);
    console.log('    ✅ clientAddress');
    
    await databases.createStringAttribute(DATABASE_ID, COLLECTION_ID, 'clientBillingAddress', 500, false);
    console.log('    ✅ clientBillingAddress');
    
    await databases.createStringAttribute(DATABASE_ID, COLLECTION_ID, 'clientEmail', 255, false);
    console.log('    ✅ clientEmail');
    
    await databases.createStringAttribute(DATABASE_ID, COLLECTION_ID, 'clientPhone', 50, false);
    console.log('    ✅ clientPhone');

    // --- BLOC 5 : Totaux & Fiscalité ---
    console.log('\n  📝 BLOC 5 : Totaux & Fiscalité');
    await databases.createFloatAttribute(DATABASE_ID, COLLECTION_ID, 'subtotal', true, 0);
    console.log('    ✅ subtotal (float)');
    
    await databases.createFloatAttribute(DATABASE_ID, COLLECTION_ID, 'discount', false, 0);
    console.log('    ✅ discount (float)');
    
    await databases.createFloatAttribute(DATABASE_ID, COLLECTION_ID, 'tax', true, 0);
    console.log('    ✅ tax (float)');
    
    await databases.createFloatAttribute(DATABASE_ID, COLLECTION_ID, 'total', true, 0);
    console.log('    ✅ total (float)');
    
    await databases.createFloatAttribute(DATABASE_ID, COLLECTION_ID, 'deposit', false, 0);
    console.log('    ✅ deposit (float)');
    
    await databases.createFloatAttribute(DATABASE_ID, COLLECTION_ID, 'balance', true, 0);
    console.log('    ✅ balance (float)');
    
    await databases.createStringAttribute(DATABASE_ID, COLLECTION_ID, 'tvaMention', 255, true);
    console.log('    ✅ tvaMention (requis)');

    // --- BLOC 6 : Conditions ---
    console.log('\n  📝 BLOC 6 : Conditions');
    await databases.createStringAttribute(DATABASE_ID, COLLECTION_ID, 'executionDelay', 500, false);
    console.log('    ✅ executionDelay');
    
    await databases.createStringAttribute(DATABASE_ID, COLLECTION_ID, 'paymentConditions', 500, false);
    console.log('    ✅ paymentConditions');
    
    await databases.createStringAttribute(DATABASE_ID, COLLECTION_ID, 'paymentMethods', 500, false);
    console.log('    ✅ paymentMethods');
    
    await databases.createStringAttribute(DATABASE_ID, COLLECTION_ID, 'specialConditions', 1000, false);
    console.log('    ✅ specialConditions');

    // --- BLOC 7 : Signature ---
    console.log('\n  📝 BLOC 7 : Signature');
    await databases.createStringAttribute(DATABASE_ID, COLLECTION_ID, 'acceptanceMention', 255, false);
    console.log('    ✅ acceptanceMention');
    
    await databases.createBooleanAttribute(DATABASE_ID, COLLECTION_ID, 'bonPourAccord', false, false);
    console.log('    ✅ bonPourAccord (boolean)');

    // --- BLOC 8 : Métier (BTP) ---
    console.log('\n  📝 BLOC 8 : Métier (BTP)');
    await databases.createStringAttribute(DATABASE_ID, COLLECTION_ID, 'tradeType', 50, false);
    console.log('    ✅ tradeType');
    
    await databases.createStringAttribute(DATABASE_ID, COLLECTION_ID, 'insuranceName', 255, false);
    console.log('    ✅ insuranceName');
    
    await databases.createStringAttribute(DATABASE_ID, COLLECTION_ID, 'insuranceAddress', 500, false);
    console.log('    ✅ insuranceAddress');
    
    await databases.createStringAttribute(DATABASE_ID, COLLECTION_ID, 'insurancePolicy', 100, false);
    console.log('    ✅ insurancePolicy');

    // --- Statut global ---
    console.log('\n  📝 Statut global');
    await databases.createStringAttribute(DATABASE_ID, COLLECTION_ID, 'status', 50, false, 'Brouillon');
    console.log('    ✅ status (défaut: Brouillon)');
    
    await databases.createStringAttribute(DATABASE_ID, COLLECTION_ID, 'createdAt', 255, false);
    console.log('    ✅ createdAt');

    console.log('\n========================================');
    console.log('🎉 COLLECTION "quotes" V2 CRÉÉE AVEC SUCCÈS !');
    console.log('========================================');
    console.log('✅ 37 attributs ajoutés');
    console.log('✅ Tous les blocs légaux sont présents');
    console.log('✅ userId, prospectId, subject, etc. sont bien là');
    console.log('\n💡 Tu peux maintenant tester la création de devis dans ton application.\n');

  } catch (error) {
    console.error('\n❌ ERREUR :', error.message);
    console.log('\n💡 Vérifie que :');
    console.log('   - Ta clé API dans .env a les droits "databases.write"');
    console.log('   - Le Project ID est correct');
    console.log('   - La base de données existe\n');
  }
}

recreateQuotesCollection();