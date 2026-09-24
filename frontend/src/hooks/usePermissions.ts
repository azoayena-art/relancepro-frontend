import { useState, useEffect } from 'react';
import { databases, DATABASE_ID } from '../appwrite';
import { useAuth } from '../context/AuthContext';
import { Query } from 'appwrite';

export function usePermissions() {
  const { user } = useAuth();
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const fetchPermissions = async () => {
      try {
        // 1. Trouver le document du membre actuel
        const membersRes = await databases.listDocuments(DATABASE_ID, 'team_members', [
          Query.equal('userId', user.$id)
        ]);

        if (membersRes.documents.length > 0) {
          const roleId = membersRes.documents[0].roleId;
          
          // 2. Récupérer les permissions de ce rôle
          const roleRes = await databases.getDocument(DATABASE_ID, 'roles', roleId);
          const rolePerms = JSON.parse(roleRes.permissions || '[]');
          
          setPermissions(rolePerms);
        }
      } catch (e) {
        console.error("Erreur lors du chargement des permissions :", e);
      } finally {
        setLoading(false);
      }
    };

    fetchPermissions();
  }, [user]);

  // Fonction utilitaire pour vérifier une permission spécifique
  const hasPermission = (key: string) => permissions.includes(key);

  return { permissions, hasPermission, loading };
}