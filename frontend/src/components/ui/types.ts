export interface Entity {
  type?: string;
  firstName?: string;
  lastName?: string;
  companyName?: string;
  email?: string;
  phone?: string;
}

export type DotTone =
  | 'sky' | 'teal' | 'violet' | 'amber' | 'emerald'
  | 'rose' | 'orange' | 'slate' | 'pink' | 'indigo' | 'red';

export type SharedStatus =
  | 'active' | 'inactive' | 'archived'
  | 'new' | 'contacted' | 'quote_sent' | 'pending' | 'followup' | 'won' | 'lost'
  | 'draft' | 'sent' | 'near_due' | 'overdue' | 'paid' | 'partial' | 'cancelled'
  | 'refunded' | 'partial_refund' | 'to_refund' | 'allocated';