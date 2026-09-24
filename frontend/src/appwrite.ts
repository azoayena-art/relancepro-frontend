import { Client, Account, Databases, Storage, Teams } from 'appwrite';

// ✅ Initialisation du client Appwrite
const client = new Client();

client
  .setEndpoint('https://fra.cloud.appwrite.io/v1') // Remplace par ton endpoint si différent
  .setProject('6aacf8ec0010a7098203'); // ⚠️ Remplace par ton PROJECT_ID réel (visible dans la console Appwrite)

// ✅ ID de la base de données
export const DATABASE_ID = 'relancepro_db'; // ⚠️ Remplace par ton DATABASE_ID réel si différent

// ✅ Export des instances
export const account = new Account(client);
export const databases = new Databases(client);
export const storage = new Storage(client);
export const teams = new Teams(client);

// ✅ Export du client (utile pour certaines opérations avancées)
export default client;