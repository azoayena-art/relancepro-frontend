/**
 * Récupère l'URL de prévisualisation d'un fichier de manière fiable et propre
 */
export function getFilePreviewUrl(bucketId: string, fileId: string): string {
  const endpoint = (import.meta.env.VITE_APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1').replace('/v1', '');
  const projectId = import.meta.env.VITE_APPWRITE_PROJECT_ID;
  
  // Construction manuelle propre pour éviter les bugs du SDK
  return `${endpoint}/v1/storage/buckets/${bucketId}/files/${fileId}/preview?project=${projectId}`;
}

/**
 * Récupère l'URL de visualisation (pour le PDF)
 */
export function getFileViewUrl(bucketId: string, fileId: string): string {
  const endpoint = (import.meta.env.VITE_APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1').replace('/v1', '');
  const projectId = import.meta.env.VITE_APPWRITE_PROJECT_ID;
  
  return `${endpoint}/v1/storage/buckets/${bucketId}/files/${fileId}/view?project=${projectId}`;
}