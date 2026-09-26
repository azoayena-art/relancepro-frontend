import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { account, databases, teams, DATABASE_ID } from '../appwrite';
import { ID, Query, Permission, Role } from 'appwrite';
import { Users, Lock, Mail, User, AlertCircle, CheckCircle, LogIn, ArrowRight } from 'lucide-react';

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
  const [teamIdToJoin, setTeamIdToJoin] = useState('');

  const handleVerifyEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setShowLoginButton(false);
    setLoading(true);

    try {
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
      const userResponse = await account.create(ID.unique(), email, password, name);
      const newUserId = userResponse.$id;

      await account.createEmailPasswordSession(email, password);

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
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-md p-6 sm:p-8 animate-fadeIn">
        
        {/* INDICATEUR DE PROGRESSION */}
        <div className="flex items-center justify-center gap-2 mb-6">
          <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold transition-colors ${
            step === 'verify' 
              ? 'bg-purple-600 text-white' 
              : 'bg-green-500 text-white'
          }`}>
            {step === 'verify' ? '1' : <CheckCircle size={16} />}
          </div>
          <div className="w-12 h-0.5 bg-slate-200 dark:bg-slate-700"></div>
          <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold transition-colors ${
            step === 'register' 
              ? 'bg-purple-600 text-white' 
              : 'bg-slate-200 dark:bg-slate-700 text-slate-400 dark:text-slate-500'
          }`}>
            2
          </div>
        </div>

        {/* EN-TÊTE */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-blue-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg shadow-purple-500/30">
            <Users size={32} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            {step === 'verify' ? 'Rejoindre une équipe' : 'Créer votre compte'}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
            {step === 'verify' 
              ? 'Entrez votre email pour rejoindre votre équipe' 
              : `Rejoignez ${teamInfo?.teamName || 'l\'équipe'}`}
          </p>
        </div>

        {/* MESSAGE D'ERREUR */}
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6 animate-fadeIn">
            <div className="flex items-start gap-2">
              <AlertCircle size={18} className="text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-700 dark:text-red-300 font-medium">{error}</p>
            </div>
            {showLoginButton && (
              <button
                onClick={handleGoToLogin}
                className="mt-3 w-full bg-purple-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-purple-700 flex items-center justify-center gap-2 active:scale-95 transition-transform"
              >
                <LogIn size={16} /> Se connecter avec cet email
              </button>
            )}
          </div>
        )}

        {/* ÉTAPE 1 : VÉRIFICATION EMAIL */}
        {step === 'verify' ? (
          <form onSubmit={handleVerifyEmail} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Adresse email</label>
              <div className="relative">
                <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="votre@email.com"
                  className="w-full pl-11 pr-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 transition-shadow"
                  required
                  autoFocus
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !email}
              className="w-full bg-gradient-to-r from-purple-600 to-blue-600 text-white py-3 rounded-lg font-semibold hover:from-purple-700 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 active:scale-95 shadow-lg shadow-purple-500/30"
            >
              {loading ? (
                <><svg className="animate-spin h-5 w-5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg><span>Vérification...</span></>
              ) : (
                <>Continuer <ArrowRight size={18} /></>
              )}
            </button>

            <div className="text-center pt-2">
              <button
                type="button"
                onClick={() => navigate('/login')}
                className="text-sm text-purple-600 dark:text-purple-400 hover:underline font-medium"
              >
                Déjà un compte ? Se connecter
              </button>
            </div>
          </form>
        ) : (
          /* ÉTAPE 2 : CRÉATION DE COMPTE */
          <form onSubmit={handleRegister} className="space-y-5">
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 flex items-start gap-3 animate-fadeIn">
              <CheckCircle size={20} className="text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-green-700 dark:text-green-300">
                <p className="font-semibold mb-1">Email vérifié !</p>
                <p>Vous rejoignez <strong>{teamInfo?.teamName}</strong> en tant que <strong>{teamInfo?.roleName}</strong></p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Nom complet</label>
              <div className="relative">
                <User size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 transition-shadow"
                  required
                  autoFocus
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Mot de passe</label>
              <div className="relative">
                <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 8 caractères"
                  className="w-full pl-11 pr-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 transition-shadow"
                  required
                  minLength={8}
                />
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">
                💡 Utilisez au moins 8 caractères avec des lettres et des chiffres
              </p>
            </div>

            <button
              type="submit"
              disabled={loading || !password}
              className="w-full bg-gradient-to-r from-purple-600 to-blue-600 text-white py-3 rounded-lg font-semibold hover:from-purple-700 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 active:scale-95 shadow-lg shadow-purple-500/30"
            >
              {loading ? (
                <><svg className="animate-spin h-5 w-5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg><span>Création du compte...</span></>
              ) : (
                <>Créer mon compte et rejoindre <ArrowRight size={18} /></>
              )}
            </button>

            <div className="text-center pt-2">
              <button
                type="button"
                onClick={() => setStep('verify')}
                className="text-sm text-slate-600 dark:text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 font-medium"
              >
                ← Retour
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}