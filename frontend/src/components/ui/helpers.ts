export const statusLabels: Record<string, string> = {
  active: 'Actif', inactive: 'Inactif', archived: 'Archivé',
  new: 'Nouveau', contacted: 'Contacté', quote_sent: 'Devis envoyé',
  pending: 'En attente', followup: 'Relance', won: 'Gagné', lost: 'Perdu',
  draft: 'Brouillon', sent: 'Envoyée', near_due: 'Bientôt échue',
  overdue: 'En retard', paid: 'Payée', partial: 'Partielle', cancelled: 'Archivée',
  refunded: 'Remboursé', partial_refund: 'Remb. partiel', to_refund: 'À rembourser', allocated: 'Avoir imputé',
};

export const typeLabels: Record<string, string> = {
  particulier: 'Particulier', entreprise: 'Entreprise',
  standard: 'Facture', advance: 'Acompte', balance: 'Solde', credit: 'Avoir',
  quote: 'Devis',
};

export const typeTones: Record<string, string> = {
  entreprise: 'sky', particulier: 'teal',
  standard: 'violet', advance: 'sky', balance: 'teal', credit: 'rose',
  quote: 'indigo',
};

export const formatDate = (d?: string | null): string => {
  if (!d) return '-';
  try {
    return new Date(d).toLocaleDateString('fr-FR');
  } catch {
    return '-';
  }
};

export const toEntity = (item: any) => {
  if (!item) return { type: 'particulier' };
  if (item.clientName && !item.firstName) {
    return {
      type: 'entreprise',
      companyName: item.clientName,
      email: item.clientEmail,
      phone: item.clientPhone,
    };
  }
  return {
    type: item.type || 'particulier',
    firstName: item.firstName,
    lastName: item.lastName,
    companyName: item.companyName,
    email: item.email,
    phone: item.phone,
  };
};