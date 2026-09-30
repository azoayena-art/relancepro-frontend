// scripts/create-indexes.mjs
import { Client, Databases } from 'node-appwrite';

const ENDPOINT    = process.env.APPWRITE_ENDPOINT || 'https://fra.cloud.appwrite.io/v1';
const PROJECT_ID  = process.env.APPWRITE_PROJECT_ID;
const API_KEY     = process.env.APPWRITE_API_KEY;
const DATABASE_ID = process.env.APPWRITE_DATABASE_ID || 'relancepro_db';

if (!PROJECT_ID || !API_KEY) { console.error("❌ Définis APPWRITE_PROJECT_ID et APPWRITE_API_KEY."); process.exit(1); }

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const db = new Databases(client);

async function safe(fn, label) {
  try {
    await fn();
    console.log(`✅ ${label}`);
  } catch (e) {
    const msg = e?.message || '';
    if (e?.code === 409 || /already exists|duplicate/i.test(msg)) {
      console.log(`⏭️  ${label} (déjà présent)`);
    } else {
      console.error(`❌ ${label} → ${msg}`);
      throw e;
    }
  }
}

console.log('── Création des index ──');

// invoice_metadata
await safe(async () => { await db.createIndex(DATABASE_ID, 'invoice_metadata', 'idx_teamId', 'key', ['teamId'], ['ASC']); }, 'index invoice_metadata.teamId');
await safe(async () => { await db.createIndex(DATABASE_ID, 'invoice_metadata', 'idx_invoiceId', 'key', ['invoiceId'], ['ASC']); }, 'index invoice_metadata.invoiceId');

// invoice_payments
await safe(async () => { await db.createIndex(DATABASE_ID, 'invoice_payments', 'idx_teamId', 'key', ['teamId'], ['ASC']); }, 'index invoice_payments.teamId');

// accounting_events
await safe(async () => { await db.createIndex(DATABASE_ID, 'accounting_events', 'idx_teamId', 'key', ['teamId'], ['ASC']); }, 'index accounting_events.teamId');

console.log('\n🎉 Index créés avec succès.');