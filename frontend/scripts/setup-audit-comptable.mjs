// scripts/setup-audit-comptable.mjs (VERSION COLLECTION SÉPARÉE)
import { Client, Databases } from 'node-appwrite';

const ENDPOINT    = process.env.APPWRITE_ENDPOINT || 'https://fra.cloud.appwrite.io/v1';
const PROJECT_ID  = process.env.APPWRITE_PROJECT_ID;
const API_KEY     = process.env.APPWRITE_API_KEY;
const DATABASE_ID = process.env.APPWRITE_DATABASE_ID || 'relancepro_db';

if (!PROJECT_ID || !API_KEY) { console.error("❌ Définis APPWRITE_PROJECT_ID et APPWRITE_API_KEY."); process.exit(1); }

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const db = new Databases(client);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function safe(fn, label, allow404 = false) {
  try {
    await fn();
    console.log(`✅ ${label}`);
  } catch (e) {
    const msg = e?.message || '';
    if (e?.code === 409 || /already exists|duplicate|exists/i.test(msg)) {
      console.log(`⏭️  ${label} (déjà présent)`);
    } else if (allow404 && (e?.code === 404 || /not found/i.test(msg))) {
      console.log(`⏭️  ${label} (déjà absent)`);
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

// ✅ Collection dédiée : invoice_metadata (contourne la limite de invoices)
console.log('── Collection invoice_metadata ──');
await safe(async () => { await db.createCollection(DATABASE_ID, 'invoice_metadata', 'invoice_metadata'); }, 'collection invoice_metadata');

await createStringAttr('invoice_metadata', 'teamId', 50);
await createStringAttr('invoice_metadata', 'invoiceId', 50);
await createStringAttr('invoice_metadata', 'creditData', 5000);         // cycle de vie avoirs
await createStringAttr('invoice_metadata', 'archiveData', 1500);        // archivage/annulation
await createStringAttr('invoice_metadata', 'reconciliationData', 2000); // rapprochement acompte/facture

await safe(async () => { await db.createIndex(DATABASE_ID, 'invoice_metadata', '_key_teamId', 'key', ['teamId'], ['ASC']); }, 'index metadata.teamId');
await safe(async () => { await db.createIndex(DATABASE_ID, 'invoice_metadata', '_key_invoiceId', 'key', ['invoiceId'], ['ASC']); }, 'index metadata.invoiceId');

// ✅ Collections optionnelles
console.log('── Collections optionnelles ──');

await safe(async () => { await db.createCollection(DATABASE_ID, 'invoice_payments', 'invoice_payments'); }, 'collection invoice_payments');
await createStringAttr('invoice_payments', 'teamId', 50);
await createStringAttr('invoice_payments', 'data', 5000);
await safe(async () => { await db.createIndex(DATABASE_ID, 'invoice_payments', '_key_teamId', 'key', ['teamId'], ['ASC']); }, 'index payments.teamId');

await safe(async () => { await db.createCollection(DATABASE_ID, 'accounting_events', 'accounting_events'); }, 'collection accounting_events');
await createStringAttr('accounting_events', 'teamId', 50);
await createStringAttr('accounting_events', 'data', 3000);
await safe(async () => { await db.createIndex(DATABASE_ID, 'accounting_events', '_key_teamId', 'key', ['teamId'], ['ASC']); }, 'index events.teamId');

console.log('\n🎉 Setup terminé (collection séparée invoice_metadata).');