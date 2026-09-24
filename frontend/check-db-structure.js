
import { Client, Databases } from 'node-appwrite';

// ⚠️ REMPLACE CES VALEURS PAR CELLES DE TA CONSOLE APPWRITE
const PROJECT_ID = '6aacf8ec0010a7098203'; 
const API_KEY = 'standard_85b1c2940c934f7344ca18942563ced42af8df90739edf9b434b498c01136169918ebe2e8a39491ad83820d164ff00b169ca79f8fd497b140e62528ca65609f8eac2adc16c4cbc508279b5e8d4ba3b5b2f9786071b4d290e08e391d75754ebd1e32bf1dc8f2d4d40aea7bd593c1f5706859a98b91bec2e160da6066643537059'; // Doit avoir les droits "databases.read"
const DATABASE_ID = 'relancepro_db'; // L'ID de ta base de données

const client = new Client()
    .setEndpoint('https://cloud.appwrite.io/v1')
    .setProject(PROJECT_ID)
    .setKey(API_KEY);

const databases = new Databases(client);

async function checkDatabaseStructure() {
    try {
        console.log(`\n🔍 Analyse de la structure de la base : ${DATABASE_ID}\n`);
        
        const collections = await databases.listCollections(DATABASE_ID);
        
        if (collections.total === 0) {
            console.log('⚠️ Aucune collection trouvée.');
            return;
        }

        console.log(`✅ ${collections.total} collection(s) trouvée(s) :\n`);

        for (const collection of collections.collections) {
            console.log(`📁 COLLECTION : "${collection.name}" (ID: ${collection.$id})`);
            
            try {
                const attributes = await databases.listAttributes(DATABASE_ID, collection.$id);
                
                if (attributes.total === 0) {
                    console.log('   ⚠️ Aucun attribut défini.');
                } else {
                    console.log('   Attributs :');
                    attributes.attributes.forEach(attr => {
                        const required = attr.required ? ' 🔒 Requis' : ' 🔓 Optionnel';
                        const size = attr.size ? ` [Taille: ${attr.size}]` : '';
                        console.log(`     • ${attr.key} : ${attr.type}${size}${required}`);
                    });
                }
            } catch (error) {
                console.log(`   ❌ Erreur lecture attributs : ${error.message}`);
            }
            console.log('--------------------------------------------------');
        }
        console.log('🎉 Analyse terminée avec succès !\n');
    } catch (error) {
        console.error('❌ Erreur de connexion:', error.message);
    }
}

checkDatabaseStructure();