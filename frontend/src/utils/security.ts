import { databases, DATABASE_ID } from '../appwrite';
import { ID } from 'appwrite';

/**
 * 🔒 Vérifie que l'utilisateur a bien accès à ce document
 */
export async function verifyDocumentAccess(
  collection: string,
  documentId: string,
  userTeamId: string
): Promise<any> {
  try {
    const doc = await databases.getDocument(DATABASE_ID, collection, documentId);
    
    if (doc.teamId !== userTeamId) {
      throw new Error('⛔ Accès refusé : ce document ne fait pas partie de votre équipe.');
    }
    
    return doc;
  } catch (error: any) {
    if (error.code === 404) {
      throw new Error('Document introuvable.');
    }
    throw error;
  }
}

/**
 * 📝 Enregistre une action dans les logs d'audit
 */
export async function logAuditAction(
  userId: string,
  teamId: string,
  action: 'create' | 'read' | 'update' | 'delete',
  resourceType: string,
  resourceId: string,
  metadata?: Record<string, any>
): Promise<void> {
  try {
    await databases.createDocument(DATABASE_ID, 'audit_logs', ID.unique(), {
      userId,
      teamId,
      action,
      resourceType,
      resourceId,
      metadata: JSON.stringify(metadata || {}),
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent
    });
  } catch (e) {
    console.error('Erreur log audit:', e);
  }
}