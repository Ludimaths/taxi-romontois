-- ══════════════════════════════════════════════════════════════
-- Fix mécanicien — À exécuter dans Supabase › SQL Editor
-- ══════════════════════════════════════════════════════════════

-- ─── 1. VÉHICULES : policy explicite pour le mécanicien ──────────────────────
-- La policy "vehicules_read_authenticated" existe mais peut être
-- absente ou inactive en prod. On en ajoute une dédiée.
DROP POLICY IF EXISTS "vehicules_read_mecanicien" ON vehicules;
CREATE POLICY "vehicules_read_mecanicien" ON vehicules
  FOR SELECT
  USING (current_user_role() = 'mecanicien');

-- ─── 2. ALERTES : lire uniquement les alertes pertinentes ────────────────────
DROP POLICY IF EXISTS "alertes_read_mecanicien" ON alertes;
CREATE POLICY "alertes_read_mecanicien" ON alertes
  FOR SELECT
  USING (
    current_user_role() = 'mecanicien'
    AND type IN (
      'vehicule',
      'reparation',
      'validation_requise',
      'remise_circulation',
      'transmis_meca'
    )
  );

-- ─── 3. ALERTES : permettre au mécanicien de marquer comme lu ────────────────
-- Sans ça, markAlertRead() échoue silencieusement (UPDATE bloqué par RLS).
DROP POLICY IF EXISTS "alertes_update_mecanicien" ON alertes;
CREATE POLICY "alertes_update_mecanicien" ON alertes
  FOR UPDATE
  USING (
    current_user_role() = 'mecanicien'
    AND type IN (
      'vehicule',
      'reparation',
      'validation_requise',
      'remise_circulation',
      'transmis_meca'
    )
  );

-- ─── Vérification rapide ──────────────────────────────────────────────────────
-- Décommenter pour tester après exécution :
-- SET ROLE mecanicien;
-- SELECT count(*) FROM vehicules;    -- doit retourner > 0
-- SELECT count(*) FROM alertes;      -- doit retourner les alertes filtrées
-- RESET ROLE;
