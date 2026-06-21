-- ══════════════════════════════════════════════════════════════
-- Migration : Workflow réparation complet + nouveaux états
-- À exécuter dans Supabase → SQL Editor
-- ══════════════════════════════════════════════════════════════

-- 1. Étendre l'enum vehicle_state avec les nouvelles valeurs
--    (ADD VALUE est idempotent via IF NOT EXISTS)
ALTER TYPE vehicle_state ADD VALUE IF NOT EXISTS 'en_service';
ALTER TYPE vehicle_state ADD VALUE IF NOT EXISTS 'receptionne';
ALTER TYPE vehicle_state ADD VALUE IF NOT EXISTS 'en_attente_piece';
ALTER TYPE vehicle_state ADD VALUE IF NOT EXISTS 'en_reparation';
ALTER TYPE vehicle_state ADD VALUE IF NOT EXISTS 'repare';

-- 2. Migrer les anciens états véhicules vers les nouvelles valeurs
UPDATE vehicules SET etat = 'en_service'    WHERE etat = 'bon';
UPDATE vehicules SET etat = 'en_reparation' WHERE etat = 'atelier';
-- 'attention' reste tel quel

-- 3. Nouvelles colonnes dans reparations
ALTER TABLE reparations
  ADD COLUMN IF NOT EXISTS date_reception                DATE,
  ADD COLUMN IF NOT EXISTS km_reception                  INTEGER,
  ADD COLUMN IF NOT EXISTS piece_nom                     TEXT,
  ADD COLUMN IF NOT EXISTS piece_fournisseur             TEXT,
  ADD COLUMN IF NOT EXISTS date_commande_piece           DATE,
  ADD COLUMN IF NOT EXISTS date_reception_piece_estimee  DATE,
  ADD COLUMN IF NOT EXISTS date_reception_piece_reelle   DATE,
  ADD COLUMN IF NOT EXISTS date_debut_reparation         DATE,
  ADD COLUMN IF NOT EXISTS type_intervention             TEXT,
  ADD COLUMN IF NOT EXISTS nom_garage                    TEXT,
  ADD COLUMN IF NOT EXISTS cout_estime                   NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS date_fin_reparation           DATE,
  ADD COLUMN IF NOT EXISTS km_sortie                     INTEGER,
  ADD COLUMN IF NOT EXISTS commentaire_mecanicien        TEXT,
  ADD COLUMN IF NOT EXISTS date_remise_circulation       DATE;

-- 4. Notes techniques sur les véhicules
ALTER TABLE vehicules
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- 5. Migrer les anciens statuts de réparation (colonne TEXT, pas d'enum)
UPDATE reparations SET statut = 'receptionne'          WHERE statut IN ('signalee','en_attente_validation');
UPDATE reparations SET statut = 'en_reparation'        WHERE statut = 'en_cours';
UPDATE reparations SET statut = 'remis_en_circulation' WHERE statut = 'termine';
UPDATE reparations SET statut = 'annulee'              WHERE statut = 'refusee';
-- 'en_attente_piece' reste tel quel
