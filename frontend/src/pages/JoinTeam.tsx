import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { account, databases, teams, DATABASE_ID } from '../appwrite';
import { ID, Query, Permission, Role } from 'appwrite';
import { Users, Lock, Mail, User, AlertCircle, CheckCircle, LogIn } from 'lucide-react';

export default function JoinTeam() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const emailFromUrl = searchParams.get('email') || '';

  const [step, setStep] = useState<'verify' | 'register'>('verify');
  const [email, setEmail] = useState(emailFromUrl);
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showLoginButton, setShowLoginButton] = useState(false);
  const [teamInfo, setTeamInfo] = useState<{ teamName: string; roleName: string } | null>(null);
  const [memberDocId, setMemberDocId] = useState('');
  
  // ✅ NOUVEAU : État pour stocker le teamId à rejoindre
  const [teamIdToJoin, setTeamIdToJoin] = useState('');

  const handleVerifyEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setShowLoginButton(false);
    setLoading(true);

    try {
      // 1. Vérifier si l'email a une invitation active
      const membersRes = await databases.listDocuments(DATABASE_ID, 'team_members', [
        Query.equal('email', email),
        Query.equal('status', 'active')
      ]);

      if (membersRes.documents.length === 0) {
        setError('Cet email n\'est pas enregistré dans une équipe. Contactez votre administrateur.');
        setLoading(false);
        return;
      }

      const member = membersRes.documents[0];
      let teamName = "votre équipe";
      let roleName = "membre";

      // 2. Tenter de récupérer les noms (peut échouer en 401/403 si non connecté)
      try {
        const teamRes = await databases.getDocument(DATABASE_ID, 'teams', member.teamId);
        teamName = teamRes.name || teamName;
      } catch (err) {
        console.log("Lecture du nom de l'équipe ignorée (permissions)");
      }

      try {
        const roleRes = await databases.getDocument(DATABASE_ID, 'roles', member.roleId);
        roleName = roleRes.name || roleName;
      } catch (err) {
        console.log("Lecture du nom du rôle ignorée (permissions)");
      }

      setTeamInfo({ teamName, roleName });
      setMemberDocId(member.$id);
      setName(member.name || '');
      
      // ✅ NOUVEAU : Stocker le teamId pour l'ajout à l'équipe Appwrite
      setTeamIdToJoin(member.teamId);
      
      setStep('register');
    } catch (err: any) {
      console.error("❌ Erreur détaillée lors de la vérification :", err);
      if (err.code === 401 || err.code === 403) {
        setError('Accès refusé. Le lien d\'invitation est invalide ou a été révoqué.');
      } else {
        setError('Erreur lors de la vérification. Vérifiez votre connexion ou réessayez.');
      }
    } finally {
      setLoading(false);
    }
  };

        const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setShowLoginButton(false);
    setLoading(true);

    try {
      // 1. Créer le compte Appwrite
      const userResponse = await account.create(ID.unique(), email, password, name);
      const newUserId = userResponse.$id;

      // 2. Créer la session IMMÉDIATEMENT (authentifie l'utilisateur pour la suite)
      await account.createEmailPasswordSession(email, password);

      // 3. Mettre à jour le document team_members avec le userId et les permissions
      await databases.updateDocument(
        DATABASE_ID, 
        'team_members', 
        memberDocId, 
        {
          userId: newUserId,
          status: 'active',
          joinedAt: new Date().toISOString()
        },
        [
          Permission.read(Role.user(newUserId)),
          Permission.update(Role.user(newUserId)),
          Permission.delete(Role.any())
        ]
      );

            // 4. Rediriger vers le dashboard (méthode forcée pour éviter les blocages React Router)
      console.log("🚀 Redirection vers le dashboard...");
      window.location.href = '/dashboard';
      
    } catch (err: any) {
      if (err.code === 409) {
        setError('Un compte existe déjà avec cet email.');
        setShowLoginButton(true);
      } else {
        setError(err.message || 'Erreur lors de l\'inscription.');
      }
      console.error("Erreur inscription:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleGoToLogin = () => {
    navigate(`/login?email=${encodeURIComponent(email)}`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Users size={32} className="text-purple-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Rejoindre une équipe</h1>
          <p className="text-sm text-slate-500 mt-2">
            {step === 'verify' 
              ? 'Entrez votre email pour rejoindre votre équipe' 
              : `Rejoignez ${teamInfo?.teamName || 'l\'équipe'}`}
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-6">
            <div className="flex items-start gap-2">
              <AlertCircle size={16} className="text-red-600 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
            {showLoginButton && (
              <button
                onClick={handleGoToLogin}
                className="mt-3 w-full bg-purple-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-purple-700 flex items-center justify-center gap-2"
              >
                <LogIn size={14} /> Se connecter avec cet email
              </button>
            )}
          </div>
        )}

        {step === 'verify' ? (
          <form onSubmit={handleVerifyEmail} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Adresse email</label>
              <div className="relative">
                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="votre@email.com"
                  className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !email}
              className="w-full bg-purple-600 text-white py-2.5 rounded-lg font-medium hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Vérification...' : 'Continuer'}
            </button>

            <div className="text-center">
              <button
                type="button"
                onClick={() => navigate('/login')}
                className="text-sm text-purple-600 hover:underline"
              >
                Déjà un compte ? Se connecter
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleRegister} className="space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-start gap-2">
              <CheckCircle size={16} className="text-green-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-green-700">
                <p className="font-medium">Email vérifié !</p>
                <p>Vous rejoignez <strong>{teamInfo?.teamName}</strong> en tant que <strong>{teamInfo?.roleName}</strong></p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Nom complet</label>
              <div className="relative">
                <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Mot de passe</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 8 caractères"
                  className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
                  required
                  minLength={8}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !password}
              className="w-full bg-purple-600 text-white py-2.5 rounded-lg font-medium hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Création du compte...' : 'Créer mon compte et rejoindre'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}