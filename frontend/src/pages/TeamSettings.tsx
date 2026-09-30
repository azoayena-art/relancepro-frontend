import Sidebar from '../components/Sidebar';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { databases, DATABASE_ID } from '../appwrite';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { Query, ID, Permission, Role } from 'appwrite';
import { toast } from 'sonner';
import Modal from '../components/ui/Modal';
import {
  Card,
  Badge,
  FormField,
  Input,
  Select,
  EmptyState,
  Alert,
  SearchFilter,
} from '../components/ui/SharedUI';
import { 
  Users, Shield, Plus, Edit3, UserPlus, CheckSquare, Copy, Check, ExternalLink, 
  Archive, RotateCcw, Eye, Info
} from 'lucide-react';

const ALL_PERMISSIONS = [
  { 
    category: 'Tableau de bord',
    description: 'Accès à la vue d\'ensemble de votre activité',
    items: [
      { key: 'dashboard', label: 'Accéder au tableau de bord', description: 'Consulter les indicateurs clés et statistiques de votre entreprise' }
    ]
  },
  { 
    category: 'Gestion des Prospects',
    description: 'Suivi et gestion des opportunités commerciales',
    items: [
      { key: 'prospects.view', label: 'Consulter les prospects', description: 'Voir la liste complète et les fiches détaillées des prospects' },
      { key: 'prospects.create', label: 'Ajouter un prospect', description: 'Créer une nouvelle fiche prospect dans le système' },
      { key: 'prospects.edit', label: 'Modifier un prospect', description: 'Mettre à jour les informations d\'un prospect existant' },
      { key: 'prospects.delete', label: 'Supprimer un prospect', description: 'Supprimer définitivement une fiche prospect' },
      { key: 'prospects.convert', label: 'Convertir en client', description: 'Transformer un prospect qualifié en client actif' }
    ]
  },
  { 
    category: 'Gestion des Clients',
    description: 'Administration de votre base clients',
    items: [
      { key: 'clients.view', label: 'Consulter les clients', description: 'Accéder à la liste et aux fiches détaillées des clients' },
      { key: 'clients.create', label: 'Ajouter un client', description: 'Créer une nouvelle fiche client' },
      { key: 'clients.edit', label: 'Modifier un client', description: 'Mettre à jour les informations d\'un client' },
      { key: 'clients.delete', label: 'Supprimer un client', description: 'Supprimer une fiche client du système' }
    ]
  },
  { 
    category: 'Catalogue Produits & Services',
    description: 'Gestion de votre catalogue commercial',
    items: [
      { key: 'products.view', label: 'Consulter les produits', description: 'Voir le catalogue complet des produits et services' },
      { key: 'products.create', label: 'Ajouter un produit', description: 'Créer un nouveau produit ou service dans le catalogue' },
      { key: 'products.edit', label: 'Modifier un produit', description: 'Mettre à jour les caractéristiques d\'un produit' },
      { key: 'products.delete', label: 'Supprimer un produit', description: 'Retirer un produit du catalogue' },
      { key: 'products.import', label: 'Importer des produits (CSV/Excel)', description: 'Importer en masse des produits depuis un fichier' }
    ]
  },
  { 
    category: 'Gestion des Devis',
    description: 'Création et suivi des propositions commerciales',
    items: [
      { key: 'quotes.view', label: 'Consulter les devis', description: 'Accéder à la liste et au détail des devis' },
      { key: 'quotes.create', label: 'Créer un devis', description: 'Générer une nouvelle proposition commerciale' },
      { key: 'quotes.edit', label: 'Modifier un devis', description: 'Modifier les éléments d\'un devis existant' },
      { key: 'quotes.delete', label: 'Supprimer un devis', description: 'Supprimer un devis du système' },
      { key: 'quotes.send', label: 'Envoyer au client (lien public)', description: 'Transmettre le devis au client par email ou lien sécurisé' },
      { key: 'quotes.download', label: 'Télécharger le PDF', description: 'Exporter le devis au format PDF' }
    ]
  },
  { 
    category: 'Gestion des Factures',
    description: 'Administration complète de la facturation',
    items: [
      { key: 'invoices.view', label: 'Consulter les factures', description: 'Accéder à l\'historique et au détail des factures' },
      { key: 'invoices.create', label: 'Créer une facture', description: 'Émettre une nouvelle facture' },
      { key: 'invoices.edit', label: 'Modifier une facture', description: 'Corriger une facture avant validation' },
      { key: 'invoices.delete', label: 'Supprimer une facture', description: 'Supprimer une facture brouillon' },
      { key: 'invoices.mark_paid', label: 'Marquer comme payée', description: 'Enregistrer le règlement d\'une facture' },
      { key: 'invoices.download', label: 'Télécharger le PDF', description: 'Exporter la facture au format PDF' },
      { key: 'invoices.credit', label: 'Créer un avoir', description: 'Générer une facture d\'avoir pour annulation ou remboursement' },
      { key: 'invoices.reconcile', label: 'Rapprocher acompte/facture', description: 'Lier un acompte reçu à une facture' },
      { key: 'invoices.archive', label: 'Archiver une facture', description: 'Archiver les anciennes factures pour simplifier la vue' }
    ]
  },
  { 
    category: 'Paiements & Trésorerie',
    description: 'Suivi des flux financiers et encaissements',
    items: [
      { key: 'payments.view', label: 'Consulter les flux de trésorerie', description: 'Accéder à l\'historique des paiements et mouvements' },
      { key: 'payments.create', label: 'Enregistrer un paiement', description: 'Saisir un nouveau paiement reçu ou effectué' },
      { key: 'payments.export', label: 'Exporter en CSV', description: 'Exporter l\'historique des paiements pour analyse' },
      { key: 'payments.reconcile', label: 'Rapprochement bancaire', description: 'Réconcilier les paiements avec les relevés bancaires' }
    ]
  },
  { 
    category: 'Reçus de Paiement',
    description: 'Gestion des justificatifs de paiement',
    items: [
      { key: 'receipts.view', label: 'Consulter les reçus', description: 'Accéder à la liste des reçus émis' },
      { key: 'receipts.download', label: 'Télécharger les reçus PDF', description: 'Exporter les reçus au format PDF' },
      { key: 'receipts.archive', label: 'Archiver un reçu', description: 'Archiver les anciens reçus' }
    ]
  },
  { 
    category: 'Relances & Recouvrement',
    description: 'Gestion des impayés et suivi des relances',
    items: [
      { key: 'reminders.view', label: 'Consulter les relances à effectuer', description: 'Voir la liste des factures en retard à relancer' },
      { key: 'reminders.send', label: 'Envoyer une relance', description: 'Envoyer un email de relance à un client' },
      { key: 'reminders.history', label: 'Voir l\'historique des relances', description: 'Consulter l\'historique des relances envoyées' }
    ]
  },
  { 
    category: 'Paramètres de l\'Entreprise',
    description: 'Configuration générale de votre société',
    items: [
      { key: 'settings.view', label: 'Voir les paramètres', description: 'Consulter la configuration actuelle de l\'entreprise' },
      { key: 'settings.edit', label: 'Modifier les paramètres', description: 'Mettre à jour les informations générales de la société' },
      { key: 'settings.logo', label: 'Gérer le logo', description: 'Télécharger ou modifier le logo de l\'entreprise' },
      { key: 'settings.tva', label: 'Configurer la TVA', description: 'Paramétrer les taux de TVA applicables' }
    ]
  },
  { 
    category: 'Gestion de l\'Équipe',
    description: 'Administration des membres et de leurs accès',
    items: [
      { key: 'team.view', label: 'Voir les membres', description: 'Consulter la liste des membres de l\'équipe' },
      { key: 'team.invite', label: 'Inviter un membre', description: 'Envoyer une invitation à rejoindre l\'équipe' },
      { key: 'team.manage_roles', label: 'Gérer les rôles et permissions', description: 'Créer, modifier et supprimer les rôles' },
      { key: 'team.remove_member', label: 'Retirer un membre', description: 'Archiver ou supprimer un membre de l\'équipe' }
    ]
  },
  { 
    category: 'Rapports & Audit',
    description: 'Analyses et traçabilité des actions',
    items: [
      { key: 'reports.view', label: 'Consulter les rapports', description: 'Accéder aux rapports d\'activité et statistiques' },
      { key: 'reports.export', label: 'Exporter les rapports', description: 'Télécharger les rapports au format Excel/PDF' },
      { key: 'reports.audit', label: 'Voir le journal d\'audit', description: 'Consulter l\'historique des actions effectuées' }
    ]
  },
  { 
    category: 'Facturation & Abonnement',
    description: 'Gestion de votre abonnement à la plateforme',
    items: [
      { key: 'billing.view', label: 'Voir la facturation', description: 'Consulter les factures et détails de l\'abonnement' },
      { key: 'billing.manage', label: 'Gérer l\'abonnement', description: 'Modifier le plan ou le mode de paiement' }
    ]
  }
];

interface RoleType { 
  $id: string; 
  name: string; 
  permissions: string[]; 
  isDefault: boolean; 
  teamId: string;
  createdAt?: string;
}

interface Member { 
  $id: string; 
  userId: string; 
  roleId: string; 
  name?: string; 
  email: string; 
  status: string; 
  role: RoleType; 
  teamId: string;
  invitedAt?: string;
  joinedAt?: string;
}

export default function TeamSettings() {
  const { user } = useAuth();
  const { hasPermission, loading: permLoading } = usePermissions();
  const navigate = useNavigate();
  
  const [teamId, setTeamId] = useState<string | null>(null);
  const [roles, setRoles] = useState<RoleType[]>([]);
  
  const [activeMembers, setActiveMembers] = useState<Member[]>([]);
  const [archivedMembers, setArchivedMembers] = useState<Member[]>([]);
  const [viewMode, setViewMode] = useState<'active' | 'archived'>('active');
  
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [showRoleModal, setShowRoleModal] = useState(false);
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [newRoleName, setNewRoleName] = useState('');
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);

  const [showMemberModal, setShowMemberModal] = useState(false);
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberRoleId, setNewMemberRoleId] = useState('');

  const [showEditRoleModal, setShowEditRoleModal] = useState(false);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [selectedNewRoleId, setSelectedNewRoleId] = useState('');

  const [showLinkModal, setShowLinkModal] = useState(false);
  const [generatedLink, setGeneratedLink] = useState('');
  const [generatedEmail, setGeneratedEmail] = useState('');
  
  const [showRoleDetailsModal, setShowRoleDetailsModal] = useState(false);
  const [selectedRoleForDetails, setSelectedRoleForDetails] = useState<RoleType | null>(null);
  
  const [copiedMemberId, setCopiedMemberId] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  useEffect(() => {
    if (!permLoading && !hasPermission('team.view')) {
      navigate('/dashboard');
    }
  }, [permLoading, hasPermission, navigate]);

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    loadData();
  }, [user]);

  const isValidEmail = (email: string): boolean => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  };

  const logAuditEvent = async (eventType: string, details: any) => {
    if (!teamId || !user) return;
    try {
      await databases.createDocument(DATABASE_ID, 'accounting_events', ID.unique(), {
        teamId,
        data: JSON.stringify({
          type: eventType,
          userId: user.$id,
          userEmail: user.email,
          eventDate: new Date().toISOString(),
          ...details
        })
      });
    } catch (e) {
      console.error('Erreur log audit:', e);
    }
  };

  const loadData = async () => {
    if (!user) return;
    try {
      setLoading(true);
      const teamsRes = await databases.listDocuments(DATABASE_ID, 'teams', [Query.equal('ownerId', user.$id)]);
      let currentTeamId = null;
      if (teamsRes.documents.length > 0) {
        currentTeamId = teamsRes.documents[0].$id;
        setTeamId(currentTeamId);
      } else {
        const membersRes = await databases.listDocuments(DATABASE_ID, 'team_members', [Query.equal('userId', user.$id)]);
        if (membersRes.documents.length > 0) {
          currentTeamId = membersRes.documents[0].teamId;
          setTeamId(currentTeamId);
        }
      }
      if (!currentTeamId) { setLoading(false); return; }

      const rolesRes = await databases.listDocuments(DATABASE_ID, 'roles', [Query.equal('teamId', currentTeamId)]);
      const parsedRoles = rolesRes.documents.map(doc => ({ 
        ...doc, 
        permissions: JSON.parse(doc.permissions || '[]') 
      })) as unknown as RoleType[];
      setRoles(parsedRoles);

      const membersRes = await databases.listDocuments(DATABASE_ID, 'team_members', [Query.equal('teamId', currentTeamId)]);
      const parsedMembers = await Promise.all(membersRes.documents.map(async (doc: any) => {
        const role = parsedRoles.find(r => r.$id === doc.roleId) || { 
          name: 'Inconnu', 
          permissions: [], 
          $id: '', 
          teamId: currentTeamId, 
          isDefault: false 
        };
        return { ...doc, role };
      }));

      setActiveMembers(parsedMembers.filter(m => m.status !== 'archived') as Member[]);
      setArchivedMembers(parsedMembers.filter(m => m.status === 'archived') as Member[]);
    } catch (e) { 
      console.error('Erreur chargement équipe:', e); 
      toast.error('Erreur lors du chargement des données');
    } finally { 
      setLoading(false); 
    }
  };

  const togglePermission = (key: string) => 
    setSelectedPermissions(prev => 
      prev.includes(key) ? prev.filter(p => p !== key) : [...prev, key]
    );
  
  const selectAll = () => setSelectedPermissions(ALL_PERMISSIONS.flatMap(cat => cat.items.map(i => i.key)));
  const deselectAll = () => setSelectedPermissions([]);

  const openRoleModal = (role?: RoleType) => {
    if (role) { 
      if (role.teamId !== teamId) { 
        toast.error('Accès refusé : Ce rôle n\'appartient pas à votre équipe.'); 
        return; 
      }
      setEditingRoleId(role.$id); 
      setNewRoleName(role.name); 
      setSelectedPermissions(role.permissions); 
    } else { 
      setEditingRoleId(null); 
      setNewRoleName(''); 
      setSelectedPermissions([]); 
    }
    setShowRoleModal(true);
  };

  const handleCloneRole = (role: RoleType) => {
    if (role.teamId !== teamId) { 
      toast.error('Accès refusé : Ce rôle n\'appartient pas à votre équipe.'); 
      return; 
    }
    setEditingRoleId(null);
    setNewRoleName(`${role.name} (copie)`);
    setSelectedPermissions([...role.permissions]);
    setShowRoleModal(true);
  };

  const handleViewRoleDetails = (role: RoleType) => {
    if (role.teamId !== teamId) { 
      toast.error('Accès refusé : Ce rôle n\'appartient pas à votre équipe.'); 
      return; 
    }
    setSelectedRoleForDetails(role);
    setShowRoleDetailsModal(true);
  };

  const handleSaveRole = async () => {
    if (!newRoleName.trim() || !teamId) { 
      toast.error("Veuillez donner un nom au rôle."); 
      return; 
    }
    if (selectedPermissions.length === 0) { 
      toast.error("Veuillez cocher au moins une permission."); 
      return; 
    }
    
    const existingRole = roles.find(r => 
      r.name.toLowerCase() === newRoleName.toLowerCase().trim() && 
      r.$id !== editingRoleId
    );
    if (existingRole) {
      toast.error('Un rôle avec ce nom existe déjà.');
      return;
    }
    
    try {
      let perms: string[] = [];
      if (user?.secureTeamId) {
        perms = [
          Permission.read(Role.team(user.secureTeamId)), 
          Permission.update(Role.team(user.secureTeamId)), 
          Permission.delete(Role.team(user.secureTeamId))
        ];
      } else {
        perms = [
          Permission.read(Role.users()), 
          Permission.update(Role.users()), 
          Permission.delete(Role.users())
        ];
      }

      if (editingRoleId) {
        const existingRole = roles.find(r => r.$id === editingRoleId);
        if (!existingRole || existingRole.teamId !== teamId) {
          throw new Error('Accès refusé : Ce rôle n\'appartient pas à votre équipe');
        }
        await databases.updateDocument(DATABASE_ID, 'roles', editingRoleId, { 
          name: newRoleName, 
          permissions: JSON.stringify(selectedPermissions) 
        });
        
        await logAuditEvent('role_updated', {
          roleId: editingRoleId,
          roleName: newRoleName,
          permissionsCount: selectedPermissions.length
        });
        toast.success('Rôle mis à jour avec succès');
      } else {
        await databases.createDocument(DATABASE_ID, 'roles', ID.unique(), { 
          name: newRoleName, 
          teamId: teamId, 
          permissions: JSON.stringify(selectedPermissions), 
          isDefault: false, 
          createdAt: new Date().toISOString() 
        }, perms);
        
        await logAuditEvent('role_created', {
          roleName: newRoleName,
          permissionsCount: selectedPermissions.length
        });
        toast.success('Rôle créé avec succès');
      }
      
      setShowRoleModal(false); 
      setNewRoleName(''); 
      setSelectedPermissions([]); 
      setEditingRoleId(null); 
      loadData();
    } catch (e: any) { 
      toast.error(`Erreur: ${e.message}`); 
    }
  };

  const handleDeleteRole = async (roleId: string, roleName: string) => {
    const roleToDelete = roles.find(r => r.$id === roleId);
    if (!roleToDelete || roleToDelete.teamId !== teamId) { 
      toast.error('Accès refusé : Ce rôle n\'appartient pas à votre équipe.'); 
      return; 
    }
    
    const membersUsingRole = [...activeMembers, ...archivedMembers].filter(m => m.roleId === roleId);
    if (membersUsingRole.length > 0) {
      toast.error(`Impossible de supprimer ce rôle : ${membersUsingRole.length} membre(s) l'utilisent. Réassignez-les d'abord.`);
      return;
    }
    
    if (!confirm(`Supprimer le rôle "${roleName}" ?`)) return;
    
    try { 
      await databases.deleteDocument(DATABASE_ID, 'roles', roleId); 
      
      await logAuditEvent('role_deleted', {
        roleId,
        roleName
      });
      
      toast.success('Rôle supprimé');
      loadData(); 
    } catch (e: any) { 
      toast.error(`Erreur: ${e.message}`); 
    }
  };

  const handleArchiveMember = async (memberId: string, email: string) => {
    const memberToArchive = activeMembers.find(m => m.$id === memberId);
    if (!memberToArchive || memberToArchive.teamId !== teamId) { 
      toast.error('Accès refusé : Ce membre n\'appartient pas à votre équipe.'); 
      return; 
    }
    if (!confirm(`Archiver ${email} ?\n\nIl ne pourra plus accéder à l'application.`)) return;
    
    try { 
      await databases.updateDocument(DATABASE_ID, 'team_members', memberId, { 
        status: 'archived',
        archivedAt: new Date().toISOString()
      }); 
      
      await logAuditEvent('member_archived', {
        memberId,
        memberEmail: email
      });
      
      toast.success('Membre archivé');
      loadData(); 
    } catch (e: any) { 
      toast.error(`Erreur: ${e.message}`); 
    }
  };

  const handleUnarchiveMember = async (memberId: string) => {
    const memberToUnarchive = archivedMembers.find(m => m.$id === memberId);
    if (!memberToUnarchive || memberToUnarchive.teamId !== teamId) { 
      toast.error('Accès refusé : Ce membre n\'appartient pas à votre équipe.'); 
      return; 
    }
    
    try { 
      await databases.updateDocument(DATABASE_ID, 'team_members', memberId, { 
        status: 'active',
        restoredAt: new Date().toISOString()
      }); 
      
      await logAuditEvent('member_restored', {
        memberId,
        memberEmail: memberToUnarchive.email
      });
      
      toast.success('Membre désarchivé');
      loadData(); 
    } catch (e: any) { 
      toast.error(`Erreur: ${e.message}`); 
    }
  };

  const openEditRoleModal = (member: Member) => {
    if (member.teamId !== teamId) { 
      toast.error('Accès refusé : Ce membre n\'appartient pas à votre équipe.'); 
      return; 
    }
    setEditingMember(member); 
    setSelectedNewRoleId(member.roleId); 
    setShowEditRoleModal(true);
  };

  const handleSaveRoleChange = async () => {
    if (!editingMember || !selectedNewRoleId) return;
    if (editingMember.teamId !== teamId) { 
      toast.error('Accès refusé : Ce membre n\'appartient pas à votre équipe.'); 
      return; 
    }
    const newRole = roles.find(r => r.$id === selectedNewRoleId);
    if (!newRole || newRole.teamId !== teamId) { 
      toast.error('Accès refusé : Ce rôle n\'appartient pas à votre équipe.'); 
      return; 
    }
    
    try {
      const oldRoleId = editingMember.roleId;
      await databases.updateDocument(DATABASE_ID, 'team_members', editingMember.$id, { 
        roleId: selectedNewRoleId,
        roleChangedAt: new Date().toISOString()
      });
      
      await logAuditEvent('member_role_changed', {
        memberId: editingMember.$id,
        memberEmail: editingMember.email,
        oldRoleId,
        newRoleId: selectedNewRoleId,
        newRoleName: newRole.name
      });
      
      setShowEditRoleModal(false); 
      setEditingMember(null); 
      toast.success('Rôle modifié avec succès');
      loadData();
    } catch (e: any) { 
      toast.error(`Erreur: ${e.message}`); 
    }
  };

  const copyToClipboard = (text: string, memberId?: string) => {
    navigator.clipboard.writeText(text);
    if (memberId) { 
      setCopiedMemberId(memberId); 
      toast.success('Lien copié dans le presse-papier');
      setTimeout(() => setCopiedMemberId(null), 2000); 
    } else { 
      setLinkCopied(true); 
      toast.success('Lien copié dans le presse-papier');
      setTimeout(() => setLinkCopied(false), 2000); 
    }
  };

  const handleAddMember = async () => {
    if (!newMemberName.trim() || !newMemberEmail.trim() || !newMemberRoleId || !teamId) { 
      toast.error("Veuillez remplir le nom, l'email et choisir un rôle."); 
      return; 
    }
    
    if (!isValidEmail(newMemberEmail)) {
      toast.error('Format d\'email invalide.');
      return;
    }
    
    const selectedRole = roles.find(r => r.$id === newMemberRoleId);
    if (!selectedRole || selectedRole.teamId !== teamId) { 
      toast.error('Accès refusé : Ce rôle n\'appartient pas à votre équipe.'); 
      return; 
    }
    
    const normalizedEmail = newMemberEmail.toLowerCase().trim();
    
    if (activeMembers.some(m => m.email.toLowerCase().trim() === normalizedEmail)) { 
      toast.error("Cet email est déjà utilisé par un membre actif."); 
      return; 
    }
    if (archivedMembers.some(m => m.email.toLowerCase().trim() === normalizedEmail)) { 
      toast.error("Cet email appartient à un membre archivé. Désarchivez-le plutôt."); 
      return; 
    }
    
    try {
      let perms: string[] = [];
      if (user?.secureTeamId) {
        perms = [
          Permission.read(Role.team(user.secureTeamId)), 
          Permission.update(Role.team(user.secureTeamId)), 
          Permission.delete(Role.team(user.secureTeamId))
        ];
      } else {
        perms = [
          Permission.read(Role.users()), 
          Permission.update(Role.users()), 
          Permission.delete(Role.users())
        ];
      }

      await databases.createDocument(DATABASE_ID, 'team_members', ID.unique(), {
        userId: 'pending', 
        teamId: teamId, 
        roleId: newMemberRoleId, 
        email: normalizedEmail, 
        name: newMemberName, 
        status: 'active', 
        invitedAt: new Date().toISOString(), 
        joinedAt: null, 
        invitedBy: user.$id
      }, perms);

      await logAuditEvent('member_invited', {
        memberEmail: normalizedEmail,
        memberName: newMemberName,
        roleId: newMemberRoleId
      });

      const joinLink = `${window.location.origin}/join-team?email=${encodeURIComponent(normalizedEmail)}`;
      setGeneratedLink(joinLink); 
      setGeneratedEmail(normalizedEmail); 
      setShowLinkModal(true);
      setShowMemberModal(false); 
      setNewMemberName(''); 
      setNewMemberEmail(''); 
      setNewMemberRoleId('');
      loadData();
    } catch (e: any) { 
      toast.error(`Erreur: ${e.message}`); 
    }
  };

  const filteredActiveMembers = activeMembers.filter(m => {
    const searchStr = `${m.name || ''} ${m.email} ${m.role.name}`.toLowerCase();
    return search === '' || searchStr.includes(search.toLowerCase());
  });

  const filteredArchivedMembers = archivedMembers.filter(m => {
    const searchStr = `${m.name || ''} ${m.email} ${m.role.name}`.toLowerCase();
    return search === '' || searchStr.includes(search.toLowerCase());
  });

  const currentMembersList = viewMode === 'active' ? filteredActiveMembers : filteredArchivedMembers;

  const getMembersCountForRole = (roleId: string): number => {
    return [...activeMembers, ...archivedMembers].filter(m => m.roleId === roleId).length;
  };

  if (permLoading || loading) {
    return (
      <Sidebar>
        <div className="flex items-center justify-center h-full w-full">
          <div className="text-slate-500 dark:text-slate-400 text-lg animate-pulse">Chargement...</div>
        </div>
      </Sidebar>
    );
  }
  
  if (!hasPermission('team.view')) return null;

  return (
    <Sidebar>
      <div className="min-h-full bg-slate-50 dark:bg-slate-900">
        <header className="bg-white dark:bg-slate-800 shadow-sm border-b border-slate-200 dark:border-slate-700 sticky top-0 z-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center">
                  <Users size={22} className="text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
                    Équipe & Rôles
                  </h1>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Gérez les accès et les permissions de vos collaborateurs
                  </p>
                </div>
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 sm:space-y-8">
          <Card>
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6">
              <h2 className="text-lg font-semibold flex items-center gap-2 text-slate-900 dark:text-white">
                <Shield size={20} className="text-purple-600 dark:text-purple-400"/>
                Rôles et Permissions
              </h2>
              {hasPermission('team.manage_roles') && (
                <button 
                  onClick={() => openRoleModal()} 
                  className="w-full sm:w-auto flex items-center justify-center gap-2 bg-purple-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors active:scale-95"
                >
                  <Plus size={16} /> Créer un rôle
                </button>
              )}
            </div>
            
            {roles.length === 0 ? (
              <EmptyState
                icon={Shield}
                title="Aucun rôle défini"
                description="Créez des rôles pour gérer les permissions de votre équipe."
                tone="purple"
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {roles.map(role => {
                  const membersCount = getMembersCountForRole(role.$id);
                  return (
                    <div 
                      key={role.$id} 
                      className="border border-slate-200 dark:border-slate-700 rounded-xl p-4 hover:shadow-md dark:hover:bg-slate-700/50 transition-all"
                    >
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="font-semibold text-slate-900 dark:text-white">{role.name}</h3>
                        {role.isDefault && (
                          <Badge tone="slate">Par défaut</Badge>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                        {role.permissions.length} permissions • {membersCount} membre(s)
                      </p>
                      <div className="flex flex-wrap gap-1.5 mb-4 min-h-[2rem]">
                        {role.permissions.slice(0, 3).map(p => {
                          const allItems = ALL_PERMISSIONS.flatMap(c => c.items);
                          const permObj = allItems.find(item => item.key === p);
                          return (
                            <Badge key={p} tone="purple">
                              {permObj ? permObj.label : p}
                            </Badge>
                          );
                        })}
                        {role.permissions.length > 3 && (
                          <span className="text-[10px] text-slate-400 dark:text-slate-500 self-center">
                            +{role.permissions.length - 3}
                          </span>
                        )}
                      </div>
                      <div className="flex gap-2 pt-3 border-t border-slate-100 dark:border-slate-700">
                        <button 
                          onClick={() => handleViewRoleDetails(role)} 
                          className="flex-1 flex items-center justify-center gap-1 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50 py-2 rounded-lg transition-colors"
                          title="Voir les détails"
                        >
                          <Eye size={12} /> Détails
                        </button>
                        {hasPermission('team.manage_roles') && (
                          <>
                            <button 
                              onClick={() => handleCloneRole(role)} 
                              className="flex-1 flex items-center justify-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 py-2 rounded-lg transition-colors"
                              title="Cloner ce rôle"
                            >
                              <Copy size={12} /> Cloner
                            </button>
                            <button 
                              onClick={() => openRoleModal(role)} 
                              className="flex-1 flex items-center justify-center gap-1 text-xs font-medium text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/30 py-2 rounded-lg transition-colors"
                              title="Modifier"
                            >
                              <Edit3 size={12} /> Modifier
                            </button>
                          </>
                        )}
                        {!role.isDefault && hasPermission('team.manage_roles') && (
                          <button 
                            onClick={() => handleDeleteRole(role.$id, role.name)} 
                            className="flex-1 flex items-center justify-center gap-1 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 py-2 rounded-lg transition-colors"
                            title="Supprimer"
                          >
                            <Archive size={12} /> Supprimer
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          <Card>
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6">
              <h2 className="text-lg font-semibold flex items-center gap-2 text-slate-900 dark:text-white">
                <UserPlus size={20} className="text-purple-600 dark:text-purple-400"/>
                {viewMode === 'active' ? 'Membres de l\'équipe' : 'Membres Archivés'}
              </h2>
              {viewMode === 'active' && hasPermission('team.invite') && (
                <button 
                  onClick={() => setShowMemberModal(true)} 
                  className="w-full sm:w-auto flex items-center justify-center gap-2 bg-purple-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors active:scale-95"
                >
                  <Plus size={16} /> Ajouter un membre
                </button>
              )}
            </div>

            <div className="flex border-b border-slate-200 dark:border-slate-700 mb-4 overflow-x-auto">
              <button 
                onClick={() => setViewMode('active')} 
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  viewMode === 'active' 
                    ? 'border-purple-600 text-purple-600 dark:text-purple-400' 
                    : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                Actifs ({activeMembers.length})
              </button>
              <button 
                onClick={() => setViewMode('archived')} 
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  viewMode === 'archived' 
                    ? 'border-purple-600 text-purple-600 dark:text-purple-400' 
                    : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                Archivés ({archivedMembers.length})
              </button>
            </div>

            <div className="mb-4">
              <SearchFilter
                value={search}
                onChange={setSearch}
                placeholder="Rechercher par nom, email ou rôle..."
              />
            </div>

            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left min-w-[600px]">
                <thead className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Nom</th>
                    <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Email</th>
                    <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Rôle</th>
                    <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Statut</th>
                    <th className="p-4 text-right text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {currentMembersList.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-8 text-center">
                        <EmptyState
                          icon={Users}
                          title={viewMode === 'active' ? 'Aucun membre actif' : 'Aucun membre archivé'}
                          description={viewMode === 'active' ? 'Ajoutez des membres à votre équipe.' : 'Aucun membre n\'a été archivé.'}
                          tone="slate"
                        />
                      </td>
                    </tr>
                  ) : (
                    currentMembersList.map(member => (
                      <tr key={member.$id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                        <td className="p-4 text-sm font-medium text-slate-900 dark:text-white">
                          {member.name || '-'}
                        </td>
                        <td className="p-4 text-sm text-slate-600 dark:text-slate-300">
                          {member.email}
                        </td>
                        <td className="p-4">
                          <Badge tone="purple">{member.role.name}</Badge>
                        </td>
                        <td className="p-4">
                          <Badge tone={member.status === 'active' ? 'emerald' : 'slate'}>
                            {member.status === 'active' ? 'Actif' : 'Archivé'}
                          </Badge>
                        </td>
                        <td className="p-4 text-right">
                          <div className="flex justify-end gap-1">
                            {viewMode === 'active' ? (
                              <>
                                {hasPermission('team.invite') && (
                                  <button 
                                    onClick={() => { 
                                      const link = `${window.location.origin}/join-team?email=${encodeURIComponent(member.email)}`; 
                                      copyToClipboard(link, member.$id); 
                                    }} 
                                    className={`p-2 rounded-lg transition-colors ${
                                      copiedMemberId === member.$id 
                                        ? 'text-green-600 bg-green-50 dark:bg-green-900/30' 
                                        : 'text-blue-500 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/30'
                                    }`} 
                                    title="Copier le lien d'inscription"
                                  >
                                    {copiedMemberId === member.$id ? <Check size={16} /> : <Copy size={16} />}
                                  </button>
                                )}
                                {hasPermission('team.manage_roles') && (
                                  <button 
                                    onClick={() => openEditRoleModal(member)} 
                                    className="p-2 text-purple-500 hover:text-purple-700 hover:bg-purple-50 dark:hover:bg-purple-900/30 rounded-lg transition-colors" 
                                    title="Modifier le rôle"
                                  >
                                    <Edit3 size={16} />
                                  </button>
                                )}
                                {hasPermission('team.remove_member') && (
                                  <button 
                                    onClick={() => handleArchiveMember(member.$id, member.email)} 
                                    className="p-2 text-orange-500 hover:text-orange-700 hover:bg-orange-50 dark:hover:bg-orange-900/30 rounded-lg transition-colors" 
                                    title="Archiver ce membre"
                                  >
                                    <Archive size={16} />
                                  </button>
                                )}
                              </>
                            ) : (
                              hasPermission('team.remove_member') && (
                                <button 
                                  onClick={() => handleUnarchiveMember(member.$id)} 
                                  className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/30 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/50 transition-colors active:scale-95" 
                                  title="Désarchiver"
                                >
                                  <RotateCcw size={14} /> Désarchiver
                                </button>
                              )
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="md:hidden space-y-3">
              {currentMembersList.length === 0 ? (
                <EmptyState
                  icon={Users}
                  title={viewMode === 'active' ? 'Aucun membre actif' : 'Aucun membre archivé'}
                  description={viewMode === 'active' ? 'Ajoutez des membres à votre équipe.' : 'Aucun membre n\'a été archivé.'}
                  tone="slate"
                />
              ) : (
                currentMembersList.map(member => (
                  <div key={member.$id} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 shadow-sm">
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-slate-900 dark:text-white truncate">
                          {member.name || member.email}
                        </h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 truncate">{member.email}</p>
                      </div>
                      <Badge tone={member.status === 'active' ? 'emerald' : 'slate'}>
                        {member.status === 'active' ? 'Actif' : 'Archivé'}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-xs text-slate-500 dark:text-slate-400">Rôle :</span>
                      <Badge tone="purple">{member.role.name}</Badge>
                    </div>
                    <div className="flex gap-2 pt-3 border-t border-slate-100 dark:border-slate-700">
                      {viewMode === 'active' ? (
                        <>
                          {hasPermission('team.invite') && (
                            <button 
                              onClick={() => { 
                                const link = `${window.location.origin}/join-team?email=${encodeURIComponent(member.email)}`; 
                                copyToClipboard(link, member.$id); 
                              }} 
                              className="flex-1 flex items-center justify-center gap-1.5 p-2.5 text-blue-600 bg-blue-50 dark:bg-blue-900/30 rounded-lg active:scale-95 transition-transform text-xs font-medium"
                            >
                              {copiedMemberId === member.$id ? <Check size={14} /> : <Copy size={14} />}
                              {copiedMemberId === member.$id ? 'Copié' : 'Lien'}
                            </button>
                          )}
                          {hasPermission('team.manage_roles') && (
                            <button 
                              onClick={() => openEditRoleModal(member)} 
                              className="flex-1 flex items-center justify-center gap-1.5 p-2.5 text-purple-600 bg-purple-50 dark:bg-purple-900/30 rounded-lg active:scale-95 transition-transform text-xs font-medium"
                            >
                              <Edit3 size={14} /> Rôle
                            </button>
                          )}
                          {hasPermission('team.remove_member') && (
                            <button 
                              onClick={() => handleArchiveMember(member.$id, member.email)} 
                              className="flex-1 flex items-center justify-center gap-1.5 p-2.5 text-orange-600 bg-orange-50 dark:bg-orange-900/30 rounded-lg active:scale-95 transition-transform text-xs font-medium"
                            >
                              <Archive size={14} /> Archiver
                            </button>
                          )}
                        </>
                      ) : (
                        hasPermission('team.remove_member') && (
                          <button 
                            onClick={() => handleUnarchiveMember(member.$id)} 
                            className="w-full flex items-center justify-center gap-2 p-3 text-sm font-medium text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/30 rounded-lg active:scale-95 transition-transform"
                          >
                            <RotateCcw size={16} /> Désarchiver
                          </button>
                        )
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </main>

        <Modal
          open={showRoleModal}
          onClose={() => setShowRoleModal(false)}
          title={editingRoleId ? 'Modifier le rôle' : 'Créer un nouveau rôle'}
          icon={<Shield size={20} className="text-purple-600" />}
          maxWidth="sm:max-w-3xl"
          footer={
            <div className="flex gap-3 w-full">
              <button 
                onClick={() => setShowRoleModal(false)} 
                className="flex-1 sm:flex-none px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600 active:scale-95 transition-all"
              >
                Annuler
              </button>
              <button 
                onClick={handleSaveRole} 
                disabled={!newRoleName.trim() || selectedPermissions.length === 0} 
                className="flex-1 sm:flex-none px-4 py-3 text-sm font-semibold text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center justify-center gap-2 active:scale-95 transition-all"
              >
                <CheckSquare size={16} /> {editingRoleId ? 'Enregistrer' : 'Créer le rôle'}
              </button>
            </div>
          }
        >
          <div className="space-y-6">
            <FormField label="Nom du rôle" required>
              <Input 
                value={newRoleName} 
                onChange={(e) => setNewRoleName(e.target.value)} 
                placeholder="Ex: Comptable, Commercial, Administrateur..." 
              />
            </FormField>
            <div>
              <div className="flex justify-between items-center mb-3">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Permissions ({selectedPermissions.length}/{ALL_PERMISSIONS.flatMap(c => c.items).length})
                </label>
                <div className="flex gap-3">
                  <button 
                    onClick={selectAll} 
                    className="text-xs font-medium text-purple-600 dark:text-purple-400 hover:underline"
                  >
                    Tout cocher
                  </button>
                  <button 
                    onClick={deselectAll} 
                    className="text-xs font-medium text-slate-500 dark:text-slate-400 hover:underline"
                  >
                    Tout décocher
                  </button>
                </div>
              </div>
              <Alert tone="info" icon={Info}>
                Sélectionnez les permissions que vous souhaitez attribuer à ce rôle. Survolez chaque option pour plus de détails.
              </Alert>
              <div className="space-y-3 mt-4 border border-slate-200 dark:border-slate-700 rounded-xl p-4 max-h-[500px] overflow-y-auto bg-slate-50 dark:bg-slate-900/50">
                {ALL_PERMISSIONS.map(category => (
                  <div 
                    key={category.category} 
                    className="bg-white dark:bg-slate-800 p-4 rounded-lg border border-slate-100 dark:border-slate-700"
                  >
                    <div className="mb-3 pb-2 border-b border-slate-100 dark:border-slate-700">
                      <h4 className="text-sm font-bold text-purple-700 dark:text-purple-400 mb-1">
                        {category.category}
                      </h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {category.description}
                      </p>
                    </div>
                    <div className="space-y-2">
                      {category.items.map(perm => (
                        <label 
                          key={perm.key} 
                          className="flex items-start gap-3 text-sm text-slate-700 dark:text-slate-300 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50 p-2.5 rounded-md transition-colors group"
                          title={perm.description}
                        >
                          <input 
                            type="checkbox" 
                            checked={selectedPermissions.includes(perm.key)} 
                            onChange={() => togglePermission(perm.key)} 
                            className="w-4 h-4 text-purple-600 rounded border-slate-300 dark:border-slate-600 dark:bg-slate-700 focus:ring-purple-500 focus:ring-offset-0 mt-0.5 flex-shrink-0" 
                          />
                          <div className="flex-1">
                            <div className="font-medium group-hover:text-purple-700 dark:group-hover:text-purple-400">
                              {perm.label}
                            </div>
                            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                              {perm.description}
                            </div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Modal>

        <Modal
          open={showRoleDetailsModal && !!selectedRoleForDetails}
          onClose={() => setShowRoleDetailsModal(false)}
          title={`Détails du rôle : ${selectedRoleForDetails?.name || ''}`}
          icon={<Eye size={20} className="text-purple-600" />}
          maxWidth="sm:max-w-2xl"
        >
          {selectedRoleForDetails && (
            <div className="space-y-6">
              <div>
                <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
                  <Users size={16} />
                  Membres utilisant ce rôle ({getMembersCountForRole(selectedRoleForDetails.$id)})
                </h4>
                <div className="space-y-2">
                  {activeMembers.filter(m => m.roleId === selectedRoleForDetails.$id).length === 0 ? (
                    <p className="text-sm text-slate-500 dark:text-slate-400 italic">Aucun membre actif utilise ce rôle.</p>
                  ) : (
                    activeMembers
                      .filter(m => m.roleId === selectedRoleForDetails.$id)
                      .map(member => (
                        <div 
                          key={member.$id} 
                          className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg"
                        >
                          <div className="w-8 h-8 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center text-purple-600 dark:text-purple-400 font-semibold text-sm">
                            {(member.name || member.email).charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-medium text-slate-900 dark:text-white">
                              {member.name || 'Sans nom'}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">{member.email}</p>
                          </div>
                        </div>
                      ))
                  )}
                </div>
              </div>
              <div>
                <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
                  <Shield size={16} />
                  Permissions ({selectedRoleForDetails.permissions.length})
                </h4>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {selectedRoleForDetails.permissions.map(permKey => {
                    const allItems = ALL_PERMISSIONS.flatMap(c => c.items);
                    const permObj = allItems.find(item => item.key === permKey);
                    return (
                      <div 
                        key={permKey} 
                        className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300 p-2.5 bg-slate-50 dark:bg-slate-900/50 rounded"
                      >
                        <Check size={14} className="text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
                        <div className="flex-1">
                          <div className="font-medium">{permObj ? permObj.label : permKey}</div>
                          {permObj?.description && (
                            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                              {permObj.description}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </Modal>

        <Modal
          open={showEditRoleModal && !!editingMember}
          onClose={() => setShowEditRoleModal(false)}
          title="Modifier le rôle"
          icon={<Edit3 size={20} className="text-purple-600" />}
          maxWidth="sm:max-w-md"
          footer={
            <div className="flex gap-3 w-full">
              <button 
                onClick={() => setShowEditRoleModal(false)} 
                className="flex-1 px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600 active:scale-95 transition-all"
              >
                Annuler
              </button>
              <button 
                onClick={handleSaveRoleChange} 
                className="flex-1 px-4 py-3 text-sm font-semibold text-white bg-purple-600 rounded-lg hover:bg-purple-700 flex items-center justify-center gap-2 active:scale-95 transition-all"
              >
                <CheckSquare size={16} /> Enregistrer
              </button>
            </div>
          }
        >
          {editingMember && (
            <div className="space-y-4">
              <Alert tone="info" icon={UserPlus}>
                Changer le rôle de <strong>{editingMember.name || editingMember.email}</strong>
              </Alert>
              <FormField label="Nouveau rôle" required>
                <Select 
                  value={selectedNewRoleId} 
                  onChange={(e) => setSelectedNewRoleId(e.target.value)} 
                >
                  <option value="">Choisir un rôle...</option>
                  {roles.map(r => <option key={r.$id} value={r.$id}>{r.name}</option>)}
                </Select>
              </FormField>
            </div>
          )}
        </Modal>

        <Modal
          open={showMemberModal}
          onClose={() => setShowMemberModal(false)}
          title="Ajouter un membre"
          icon={<UserPlus size={20} className="text-purple-600" />}
          maxWidth="sm:max-w-md"
          footer={
            <div className="flex gap-3 w-full">
              <button 
                onClick={() => setShowMemberModal(false)} 
                className="flex-1 px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600 active:scale-95 transition-all"
              >
                Annuler
              </button>
              <button 
                onClick={handleAddMember} 
                disabled={!newMemberName.trim() || !newMemberEmail.trim() || !newMemberRoleId} 
                className="flex-1 px-4 py-3 text-sm font-semibold text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center justify-center gap-2 active:scale-95 transition-all"
              >
                <UserPlus size={16} /> Ajouter
              </button>
            </div>
          }
        >
          <div className="space-y-4">
            <FormField label="Nom complet" required>
              <Input 
                value={newMemberName} 
                onChange={(e) => setNewMemberName(e.target.value)} 
                placeholder="Ex: Jean Dupont" 
              />
            </FormField>
            <FormField label="Adresse email" required>
              <Input 
                type="email"
                value={newMemberEmail} 
                onChange={(e) => setNewMemberEmail(e.target.value)} 
                placeholder="Ex: jean@exemple.com" 
              />
            </FormField>
            <FormField label="Rôle" required>
              <Select 
                value={newMemberRoleId} 
                onChange={(e) => setNewMemberRoleId(e.target.value)} 
              >
                <option value="">Choisir un rôle...</option>
                {roles.map(r => <option key={r.$id} value={r.$id}>{r.name}</option>)}
              </Select>
            </FormField>
          </div>
        </Modal>

        <Modal
          open={showLinkModal}
          onClose={() => setShowLinkModal(false)}
          title="Membre ajouté !"
          icon={<Check size={20} className="text-green-600" />}
          maxWidth="sm:max-w-md"
        >
          <div className="space-y-4">
            <Alert tone="success" icon={Check}>
              Envoyez ce lien à <strong>{generatedEmail}</strong> pour qu'il puisse créer son compte.
            </Alert>
            <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 p-3 rounded-lg text-sm text-purple-700 dark:text-purple-300 break-all font-mono">
              {generatedLink}
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <button 
                onClick={() => copyToClipboard(generatedLink)} 
                className="flex-1 bg-purple-600 text-white px-3 py-3 rounded-lg text-sm font-medium hover:bg-purple-700 flex items-center justify-center gap-2 active:scale-95 transition-all"
              >
                {linkCopied ? <><Check size={16} /> Copié !</> : <><Copy size={16} /> Copier le lien</>}
              </button>
              <button 
                onClick={() => window.open(generatedLink, '_blank')} 
                className="flex-1 bg-blue-600 text-white px-3 py-3 rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center justify-center gap-2 active:scale-95 transition-all"
              >
                <ExternalLink size={16} /> Ouvrir
              </button>
            </div>
          </div>
        </Modal>
      </div>
    </Sidebar>
  );
}