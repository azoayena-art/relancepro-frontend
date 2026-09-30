import { Client, Databases, Query } from 'node-appwrite';
import 'dotenv/config';

const client = new Client()
  .setEndpoint(process.env.VITE_APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1')
  .setProject(process.env.VITE_APPWRITE_PROJECT_ID)
  .setKey(process.env.APPWRITE_API_KEY); // clé API = droits admin, contourne les permissions document

const databases = new Databases(client);
const DATABASE_ID = process.env.VITE_APPWRITE_DATABASE_ID || 'relancepro_db';

const parse = (s) => { try { return JSON.parse(s || '{}'); } catch { return {}; } };

// Score : la version la plus "avancée" gagne (remboursements > statut > version)
const score = (m) => {
  const cd = parse(m.creditData);
  let s = (m.metadataVersion || 0);
  if ((cd.refundPayments || []).length > 0) s += 100;
  if ((cd.refundedAmount || 0) > 0) s += 50;
  if (cd.creditStatus === 'refunded') s += 10;
  if (cd.creditStatus === 'partial_refund') s += 5;
  return s;
};

async function main() {
  const [invRes, metaRes] = await Promise.all([
    databases.listDocuments(DATABASE_ID, 'invoices', [Query.limit(2000)]),
    databases.listDocuments(DATABASE_ID, 'invoice_metadata', [Query.limit(1000)]),
  ]);
  const allInvIds = new Set(invRes.documents.map(d => d.$id));
  const credits = invRes.documents.filter(d => d.type === 'credit');

  const byInvoice = new Map();
  for (const m of metaRes.documents) {
    if (!byInvoice.has(m.invoiceId)) byInvoice.set(m.invoiceId, []);
    byInvoice.get(m.invoiceId).push(m);
  }

  // ---- 1) Orphelins (invoiceId inconnu, ex "unique()") ----
  const orphans = [...byInvoice.entries()]
    .filter(([k]) => !allInvIds.has(k))
    .flatMap(([, v]) => v)
    .sort((a, b) => (a.$createdAt || '').localeCompare(b.$createdAt || ''));
  const withoutMeta = credits
    .filter(c => !byInvoice.has(c.$id))
    .sort((a, b) => (a.$createdAt || '').localeCompare(b.$createdAt || ''));

  const n = Math.min(orphans.length, withoutMeta.length);
  for (let i = 0; i < n; i++) {
    await databases.updateDocument(DATABASE_ID, 'invoice_metadata', orphans[i].$id, { invoiceId: withoutMeta[i].$id });
    console.log(`🔧 Orphelin rattaché : ${orphans[i].invoiceId} -> ${withoutMeta[i].invoiceNumber}`);
    if (!byInvoice.has(withoutMeta[i].$id)) byInvoice.set(withoutMeta[i].$id, []);
    byInvoice.get(withoutMeta[i].$id).push(orphans[i]);
  }
  for (let i = n; i < orphans.length; i++) {
    await databases.deleteDocument(DATABASE_ID, 'invoice_metadata', orphans[i].$id);
    console.log(`🗑️ Orphelin supprimé : ${orphans[i].$id} (invoiceId=${orphans[i].invoiceId})`);
  }

  // ---- 2) Doublons : fusion + suppression ----
  for (const [invId, arr] of byInvoice.entries()) {
    if (!allInvIds.has(invId) || arr.length <= 1) continue;
    arr.sort((a, b) => score(b) - score(a) || (b.$updatedAt || '').localeCompare(a.$updatedAt || ''));
    const keep = arr[0];
    const merged = parse(keep.creditData);
    const seen = new Set((merged.refundPayments || []).map(p => p.id));
    for (const m of arr.slice(1)) {
      const cd = parse(m.creditData);
      for (const p of (cd.refundPayments || [])) {
        if (!seen.has(p.id)) { seen.add(p.id); (merged.refundPayments = merged.refundPayments || []).push(p); }
      }
      if (cd.creditStatus === 'refunded') merged.creditStatus = 'refunded';
    }
    if ((merged.refundPayments || []).length > 0) {
      merged.refundedAmount = merged.refundPayments.reduce((s, p) => s + (p.amount || 0), 0);
      const inv = invRes.documents.find(d => d.$id === invId);
      const total = inv?.total || 0;
      merged.creditStatus = merged.refundedAmount >= total - 0.001 ? 'refunded' : 'partial_refund';
    }
    await databases.updateDocument(DATABASE_ID, 'invoice_metadata', keep.$id, {
      creditData: JSON.stringify(merged),
      metadataVersion: (keep.metadataVersion || 0) + 1
    });
    for (const m of arr.slice(1)) {
      await databases.deleteDocument(DATABASE_ID, 'invoice_metadata', m.$id);
      console.log(`🗑️ Doublon supprimé : ${m.$id}`);
    }
    console.log(`✅ Fusionné pour ${invId} : statut=${merged.creditStatus}, remboursé=${merged.refundedAmount}`);
  }

  console.log('\n🎉 Nettoyage terminé. Actualise la page Factures.');
}
main().catch(e => { console.error('❌', e.message); process.exit(1); });