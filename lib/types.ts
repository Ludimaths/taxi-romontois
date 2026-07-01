export type Role = "gestionnaire" | "conducteur" | "mecanicien" | "parent" | "admin" | "ecole";

// ── Facturation / Suivi élèves ────────────────────────────────────────────────
export interface Ecole {
  id: number;
  nom: string;
  adresse?: string;
  nom_responsable_facturation?: string;
  email?: string;
  lot?: string;
  created_at: string;
}

export interface Eleve {
  id: number;
  nom_famille: string;
  prenom_initiale: string;
  adresse?: string;
  circuit_id?: string;
  ecole_id?: number;
  ecole?: Ecole;
  type_transport: "standard" | "equipe";
  actif: boolean;
  created_at: string;
}

export interface PriseEnCharge {
  id: number;
  eleve_id: number;
  eleve?: Eleve;
  conducteur_id: number;
  circuit_id?: string;
  date: string;        // YYYY-MM-DD
  heure_prise?: string;
  sens: "aller" | "retour";
  statut: "present" | "absent";
  created_at: string;
}

export interface TourneeConfig {
  id: number;
  nom: string;
  circuit_id?: string;
  ecole_id?: number;
  ecole?: Ecole;
  sens: "aller" | "retour";
  jour_semaine: number;  // 1=lundi … 7=dimanche
  km: number;
  duree_minutes: number;
  prix_km: number;
  prix_heure: number;
  actif: boolean;
  created_at: string;
}

export type DriverStatus = "en_service" | "en_attente" | "absent" | "disponible" | "termine";
export type VehicleState = "en_service" | "bon" | "receptionne" | "atelier" | "en_attente_piece" | "en_reparation" | "repare" | "attention";
export type IncidentStatus = "en_attente" | "en_cours" | "resolu";
export type AlertSeverity = "normale" | "haute" | "critique";
export type RepairStatus = "receptionne" | "en_attente_validation" | "en_attente_piece" | "en_reparation" | "repare" | "remis_en_circulation" | "annulee";

export interface CercleScolaire {
  id: number;
  nom: string;
}

export interface Circuit {
  id: string;
  nom: string;
  emoji: string;
  num: string;
  cercle_id: number;
  cercle?: CercleScolaire;
  enfants_count: number;
  km_aller: number;
}

export interface Conducteur {
  id: number;
  user_id?: string;
  nom: string;
  prenom: string;
  tel?: string;
  affectation: string;
  cercle_id?: number;
  cercle?: CercleScolaire;
  circuit_id?: string;
  circuit?: Circuit;
  vehicule_id?: string;
  vehicule?: Vehicule;
  photo_initials: string;
  permis?: string;
  permis_exp?: string;
  tachygraphe: boolean;
  status: DriverStatus;
  absence_motif?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface Vehicule {
  id: string;
  plaque: string;
  marque: string;
  modele: string;
  places: number;
  places_handi: number;
  etat: VehicleState;
  circuit_id?: string;
  circuit?: Circuit;
  conducteur_id?: number;
  conducteur?: Conducteur;
  ct_date?: string;
  date_vidange?: string;
  assurance_date?: string;
  km: number;
  notes?: string;
  qr_token: string;
  created_at: string;
}

export interface Enfant {
  id: number;
  nom: string;
  prenom: string;
  circuit_id?: string;
  circuit?: Circuit;
  cercle_id?: number;
  parent_nom?: string;
  parent_tel?: string;
  adresse_mere?: string;
  adresse_pere?: string;
  parent_user_id?: string;
}

export interface AbsenceEnfant {
  id: number;
  enfant_id: number;
  enfant?: Enfant;
  circuit_id?: string;
  circuit?: Circuit;
  date_absence: string;
  reason: string;
  reported_by: string;
  reported_at: string;
  read_by_gestionnaire: boolean;
  transmitted_to_driver: boolean;
  read_by_driver: boolean;
}

export interface AbsenceConducteur {
  id: number;
  conducteur_id: number;
  conducteur?: Conducteur;
  date_absence: string;
  motif?: string;
  remplacant_id?: number;
  remplacant?: Conducteur;
  circuit_id?: string;
  circuit?: Circuit;
  status: "non_couvert" | "couvert";
  created_at: string;
}

export interface ServiceLog {
  id: number;
  conducteur_id: number;
  conducteur?: Conducteur;
  vehicule_id?: string;
  vehicule?: Vehicule;
  circuit_id?: string;
  circuit?: Circuit;
  date_service: string;
  heure_debut?: string;
  heure_fin?: string;
  status: DriverStatus;
  is_replacement: boolean;
  replacement_name?: string;
  notes?: string;
  created_at: string;
}

export interface Incident {
  id: number;
  type: string;
  vehicule_id?: string;
  vehicule?: Vehicule;
  conducteur_id?: number;
  conducteur?: Conducteur;
  circuit_id?: string;
  circuit?: Circuit;
  description: string;
  status: IncidentStatus;
  response?: string;
  reported_at: string;
  resolved_at?: string;
}

export interface Alerte {
  id: number;
  type: string;
  severity: AlertSeverity;
  message: string;
  read: boolean;
  driver_id?: number;
  vehicle_id?: string;
  created_at: string;
  read_at?: string;
}

export interface Reparation {
  id: number;
  vehicule_id: string;
  vehicule?: Vehicule;
  description: string;
  cout?: number;
  cout_estime?: number;
  date_reparation?: string;
  // Workflow fields
  date_reception?: string;
  km_reception?: number;
  piece_nom?: string;
  piece_fournisseur?: string;
  date_commande_piece?: string;
  date_reception_piece_estimee?: string;
  date_reception_piece_reelle?: string;
  date_debut_reparation?: string;
  type_intervention?: "interne" | "externe" | "piece";
  nom_garage?: string;
  date_fin_reparation?: string;
  km_sortie?: number;
  commentaire_mecanicien?: string;
  date_remise_circulation?: string;
  statut: RepairStatus;
  responsable?: string;
  alerte_envoyee: boolean;
  created_at: string;
}

export interface Profile {
  id: string;
  role: Role;
  nom: string;
  prenom: string;
  tel?: string;
  conducteur_id?: number;
  enfant_id?: number;
  civilite?: "mere" | "pere" | null;
  must_change_password?: boolean;
  photo_url?: string | null;
}

export type CongesStatut = "en_attente" | "transmis_admin" | "accepte" | "refuse";

export interface CongesDemande {
  id: number;
  conducteur_id: number;
  conducteur?: { prenom: string; nom: string };
  date_debut: string;
  date_fin: string;
  motif: string;
  justification: string;
  statut: CongesStatut;
  motif_refus?: string;
  note_gestionnaire?: string;
  transmis_par?: string;
  created_at: string;
  updated_at: string;
}
