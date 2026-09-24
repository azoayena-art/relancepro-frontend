import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { account, databases, teams, DATABASE_ID } from '../appwrite';
import { AppwriteException, ID, Query } from 'appwrite';

interface UserProfile {
  firstName?: string;
  lastName?: string;
  companyName?: string;
  trade?: string;
  role?: string;
  [key: string]: unknown;
}

interface User {
  $id: string;
  email: string;
  name: string;
  profile?: UserProfile;
  teamId?: string;
  secureTeamId?: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string, profileData: Record<string, unknown>) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkSession();
  }, []);

  const fetchUserTeam = async (userId: string) => {
    try {
      const res = await databases.listDocuments(DATABASE_ID, 'teams', [
        Query.equal('ownerId', userId)
      ]);
      if (res.documents.length > 0) {
        return {
          teamId: res.documents[0].$id,
          secureTeamId: res.documents[0].appwriteTeamId
        };
      }
    } catch (e) {
      console.warn('Équipe non trouvée pour cet utilisateur:', e);
    }
    return { teamId: undefined, secureTeamId: undefined };
  };

  const checkSession = async () => {
    try {
      const currentAccount = await account.get();
      if (currentAccount) {
        let profile: UserProfile | undefined;
        try {
          const profileDoc = await databases.getDocument(DATABASE_ID, 'users', currentAccount.$id);
          profile = profileDoc as unknown as UserProfile;
        } catch (profileError) {
          console.warn('Profil non trouvé en base:', profileError);
        }
        const { teamId, secureTeamId } = await fetchUserTeam(currentAccount.$id);
        setUser({
          $id: currentAccount.$id,
          email: currentAccount.email,
          name: currentAccount.name,
          profile: profile,
          teamId,
          secureTeamId
        });
      }
    } catch (error) {
      if (error instanceof AppwriteException && error.code === 401) {
        setUser(null);
      } else {
        console.error('Erreur vérification session:', error);
        setUser(null);
      }
    } finally {
      setLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    try {
      await account.createEmailPasswordSession(email, password);
      const userData = await account.get();
      let profile: UserProfile | undefined;
      try {
        const profileDoc = await databases.getDocument(DATABASE_ID, 'users', userData.$id);
        profile = profileDoc as unknown as UserProfile;
      } catch {
        console.warn('Profil non trouvé lors du login');
      }
      const { teamId, secureTeamId } = await fetchUserTeam(userData.$id);
      setUser({
        $id: userData.$id,
        email: userData.email,
        name: userData.name,
        profile: profile,
        teamId,
        secureTeamId
      });
    } catch (error) {
      console.error('Erreur de connexion:', error);
      throw error;
    }
  };

  const register = async (email: string, password: string, name: string, profileData: Record<string, unknown>) => {
    try {
      console.log("🚀 Début de l'inscription...");
      try { await account.deleteSession('current'); } catch {}
      
      const newAccount = await account.create(ID.unique(), email, password, name);
      console.log("✅ Compte Appwrite créé:", newAccount.$id);
      
      await account.createEmailPasswordSession(email, password);
      console.log("✅ Session créée");

      const companyName = (profileData.companyName as string) || name || 'Mon Entreprise';
      
      // 1. Créer l'équipe Appwrite native (le créateur est automatiquement owner)
      const nativeTeam = await teams.create(ID.unique(), companyName);
      console.log("✅ Équipe Appwrite native créée (vous êtes automatiquement owner):", nativeTeam.$id);
      
      const appwriteTeamId = nativeTeam.$id;

      // 2. Créer le document 'users'
      console.log("📝 Tentative de création du document 'users'...");
      try {
        await databases.createDocument(
          DATABASE_ID,
          'users',
          newAccount.$id,
          {
            userId: newAccount.$id, // ✅ AJOUTÉ : C'était l'attribut manquant !
            firstName: profileData.firstName as string,
            lastName: profileData.lastName as string,
            companyName: companyName,
            trade: profileData.trade as string,
            phone: (profileData.phone as string) || '',
            country: profileData.country as string,
            role: 'admin',
            createdAt: new Date().toISOString()
          }
        );
        console.log("✅ Document 'users' créé avec succès !");
      } catch (dbError: any) {
        console.error("❌ ÉCHEC CRITIQUE CRÉATION 'users':", dbError);
        throw new Error(`Échec création profil: ${dbError.message}`);
      }

      // 3. Créer le document 'teams' dans la BDD
      console.log("📝 Tentative de création du document 'teams'...");
      const teamDoc = await databases.createDocument(
        DATABASE_ID,
        'teams',
        ID.unique(),
        {
          ownerId: newAccount.$id,
          name: companyName,
          appwriteTeamId: appwriteTeamId,
          createdAt: new Date().toISOString()
        }
      );
      console.log("✅ Document 'teams' créé:", teamDoc.$id);

      // 4. Créer le rôle "Administrateur" par défaut
      const defaultPermissions = JSON.stringify([
        'prospects.view', 'prospects.create', 'prospects.edit', 'prospects.delete',
        'clients.view', 'clients.create', 'clients.edit', 'clients.delete',
        'products.view', 'products.create', 'products.edit', 'products.delete',
        'quotes.view', 'quotes.create', 'quotes.edit', 'quotes.delete', 'quotes.send',
        'invoices.view', 'invoices.create', 'invoices.edit', 'invoices.delete', 'invoices.mark_paid',
        'settings.view', 'settings.edit',
        'team.view', 'team.invite', 'team.manage_roles', 'team.remove_member',
        'billing.view', 'billing.manage',
        'reports.view'
      ]);

      console.log("📝 Tentative de création du document 'roles'...");
      const roleDoc = await databases.createDocument(
        DATABASE_ID,
        'roles',
        ID.unique(),
        {
          name: 'Administrateur',
          teamId: teamDoc.$id,
          permissions: defaultPermissions,
          isDefault: true,
          createdAt: new Date().toISOString()
        }
      );
      console.log("✅ Document 'roles' créé:", roleDoc.$id);

      // 5. Créer le membre d'équipe dans la BDD
      console.log("📝 Tentative de création du document 'team_members'...");
      await databases.createDocument(
        DATABASE_ID,
        'team_members',
        ID.unique(),
        {
          userId: newAccount.$id,
          teamId: teamDoc.$id,
          roleId: roleDoc.$id,
          email: email,
          name: name,
          status: 'active',
          joinedAt: new Date().toISOString()
        }
      );
      console.log("✅ Document 'team_members' créé");

      // 6. Mettre à jour l'état local
      setUser({
        $id: newAccount.$id,
        email: newAccount.email,
        name: newAccount.name,
        profile: {
          firstName: profileData.firstName as string,
          lastName: profileData.lastName as string,
          companyName: companyName,
          trade: profileData.trade as string,
          role: 'admin'
        },
        teamId: teamDoc.$id,
        secureTeamId: appwriteTeamId
      });
      console.log("🎉 Inscription terminée avec succès !");

    } catch (error: any) {
      console.error("❌ Erreur critique lors de l'inscription:", error);
      try { await account.deleteSession('current'); } catch {}
      throw new Error(error.message || "Erreur lors de l'inscription.");
    }
  };

  const logout = async () => {
    try {
      await account.deleteSession('current');
    } catch (error) {
      console.error('Erreur lors de la déconnexion:', error);
    } finally {
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}