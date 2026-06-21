export type Role = "gestionnaire" | "conducteur" | "mecanicien" | "parent" | "admin";

export type DriverStatus = "en_service" | "en_attente" | "absent" | "disponible" | "termine";
export type VehicleState = "bon" | "atelier" | "attention";
export type IncidentStatus = "en_attente" | "en_cours" | "resolu";
export type AlertSeverity = "normale" | "haute" | "critique";
export type RepairStatus = "en_cours" | "termine";

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
  assurance_date?: string;
  km: number;
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
  cout: number;
  date_reparation: string;
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
}
