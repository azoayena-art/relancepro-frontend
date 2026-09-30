// scripts/create-collections-optionnelles.mjs
import { Client, Databases } from 'node-appwrite';

const ENDPOINT    = process.env.APPWRITE_ENDPOINT || 'https://fra.cloud.appwrite.io/v1';
const PROJECT_ID  = process.env.APPWRITE_PROJECT_ID;
const API_KEY     = process.env.APPWRITE_API_KEY;
const DATABASE_ID = process.env.APPWRITE_DATABASE_ID || 'relancepro_db';

if (!PROJECT_ID || !API_KEY) { console.error("❌ Définis APPWRITE_PROJECT_ID et APPWRITE_API_KEY."); process.exit(1); }

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const db = new Databases(client);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

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

async function createStringAttr(collectionId, key, size) {
  await safe(async () => { await db.createStringAttribute(DATABASE_ID, collectionId, key, size, false); }, `${collectionId}.${key}`);
  await sleep(400);
}

// ✅ Collection invoice_payments
console.log('── Collection invoice_payments ──');
await safe(async () => { await db.createCollection(DATABASE_ID, 'invoice_payments', 'invoice_payments'); }, 'collection invoice_payments');
await createStringAttr('invoice_payments', 'teamId', 50);
await createStringAttr('invoice_payments', 'data', 5000); // JSON : tous les champs du paiement
await safe(async () => { await db.createIndex(DATABASE_ID, 'invoice_payments', 'idx_teamId', 'key', ['teamId'], ['ASC']); }, 'index invoice_payments.teamId');
await safe(async () => { await db.createIndex(DATABASE_ID, 'invoice_payments', 'idx_data_invoiceId', 'fulltext', ['data']); }, 'index invoice_payments.data (fulltext)');

// ✅ Collection accounting_events
console.log('\n── Collection accounting_events ──');
await safe(async () => { await db.createCollection(DATABASE_ID, 'accounting_events', 'accounting_events'); }, 'collection accounting_events');
await createStringAttr('accounting_events', 'teamId', 50);
await createStringAttr('accounting_events', 'data', 3000); // JSON : type, documentType, amount, method, reference
await safe(async () => { await db.createIndex(DATABASE_ID, 'accounting_events', 'idx_teamId', 'key', ['teamId'], ['ASC']); }, 'index accounting_events.teamId');

console.log('\n🎉 Collections optionnelles créées avec succès.');