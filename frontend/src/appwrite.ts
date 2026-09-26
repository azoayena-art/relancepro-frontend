import { Client, Account, Databases, Storage, Teams } from 'appwrite';

const client = new Client();

client
  .setEndpoint('https://fra.cloud.appwrite.io/v1')
  .setProject('6aacf8ec0010a7098203');

export const DATABASE_ID = 'relancepro_db';

// ✅ AJOUT OBLIGATOIRE : ID du bucket (visible dans ta capture : badge "company_logos")
export const BUCKET_ID = 'company_logos';

export const account = new Account(client);
export const databases = new Databases(client);
export const storage = new Storage(client);
export const teams = new Teams(client);

export default client;