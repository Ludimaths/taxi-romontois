-- ================================================================
-- Taxi Romontois — Module Facturation & Suivi Élèves
-- À exécuter dans Supabase > SQL Editor
-- ================================================================

-- ── Table ECOLES ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ecoles (
  id                        SERIAL PRIMARY KEY,
  nom                       TEXT NOT NULL,
  adresse                   TEXT,
  nom_responsable_facturation TEXT,
  email                     TEXT,
  lot                       TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Table ELEVES ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.eleves (
  id              SERIAL PRIMARY KEY,
  nom_famille     TEXT NOT NULL,
  prenom_initiale TEXT NOT NULL,
  adresse         TEXT,
  circuit_id      TEXT REFERENCES public.circuits(id) ON DELETE SET NULL,
  ecole_id        INT  REFERENCES public.ecoles(id)   ON DELETE SET NULL,
  type_transport  TEXT NOT NULL DEFAULT 'standard' CHECK (type_transport IN ('standard','equipe')),
  actif           BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Table PRISES_EN_CHARGE ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.prises_en_charge (
  id            SERIAL PRIMARY KEY,
  eleve_id      INT  NOT NULL REFERENCES public.eleves(id)     ON DELETE CASCADE,
  conducteur_id INT  NOT NULL REFERENCES public.conducteurs(id) ON DELETE CASCADE,
  circuit_id    TEXT REFERENCES public.circuits(id)             ON DELETE SET NULL,
  date          DATE NOT NULL,
  heure_prise   TIME,
  sens          TEXT NOT NULL DEFAULT 'aller' CHECK (sens IN ('aller','retour')),
  statut        TEXT NOT NULL DEFAULT 'present' CHECK (statut IN ('present','absent')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Table TOURNEES_CONFIG ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tournees_config (
  id              SERIAL PRIMARY KEY,
  nom             TEXT NOT NULL,
  circuit_id      TEXT REFERENCES public.circuits(id)  ON DELETE SET NULL,
  ecole_id        INT  REFERENCES public.ecoles(id)    ON DELETE SET NULL,
  sens            TEXT NOT NULL DEFAULT 'aller' CHECK (sens IN ('aller','retour')),
  jour_semaine    INT  NOT NULL CHECK (jour_semaine BETWEEN 1 AND 7),
  km              NUMERIC(8,2) DEFAULT 0,
  duree_minutes   INT DEFAULT 0,
  prix_km         NUMERIC(8,4) DEFAULT 0,
  prix_heure      NUMERIC(8,4) DEFAULT 0,
  actif           BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Index utiles ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_eleves_circuit   ON public.eleves(circuit_id);
CREATE INDEX IF NOT EXISTS idx_eleves_ecole     ON public.eleves(ecole_id);
CREATE INDEX IF NOT EXISTS idx_pec_date         ON public.prises_en_charge(date);
CREATE INDEX IF NOT EXISTS idx_pec_conducteur   ON public.prises_en_charge(conducteur_id);
CREATE INDEX IF NOT EXISTS idx_pec_eleve        ON public.prises_en_charge(eleve_id);
CREATE INDEX IF NOT EXISTS idx_tournees_circuit ON public.tournees_config(circuit_id);

-- ── RLS ───────────────────────────────────────────────────────
ALTER TABLE public.ecoles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eleves            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prises_en_charge  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournees_config   ENABLE ROW LEVEL SECURITY;

-- Helper : récupère le rôle du user connecté
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;

-- Helper : récupère le conducteur_id du user connecté
CREATE OR REPLACE FUNCTION public.get_conductor_id()
RETURNS INT LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT conducteur_id FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;

-- Helper : récupère l'ecole_id du user connecté (pour rôle ecole)
CREATE OR REPLACE FUNCTION public.get_ecole_id()
RETURNS INT LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT ecole_id FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;

-- ── RLS ECOLES ────────────────────────────────────────────────
CREATE POLICY ecoles_staff_all ON public.ecoles
  FOR ALL USING (get_user_role() IN ('gestionnaire','admin'));

CREATE POLICY ecoles_ecole_own ON public.ecoles
  FOR SELECT USING (id = get_ecole_id());

-- ── RLS ELEVES ────────────────────────────────────────────────
CREATE POLICY eleves_staff_all ON public.eleves
  FOR ALL USING (get_user_role() IN ('gestionnaire','admin'));

CREATE POLICY eleves_ecole_own ON public.eleves
  FOR SELECT USING (ecole_id = get_ecole_id());

-- ── RLS PRISES_EN_CHARGE ─────────────────────────────────────
CREATE POLICY pec_staff_all ON public.prises_en_charge
  FOR ALL USING (get_user_role() IN ('gestionnaire','admin'));

CREATE POLICY pec_conducteur_own ON public.prises_en_charge
  FOR ALL USING (conducteur_id = get_conductor_id());

CREATE POLICY pec_ecole_own ON public.prises_en_charge
  FOR SELECT USING (
    eleve_id IN (
      SELECT id FROM public.eleves WHERE ecole_id = get_ecole_id()
    )
  );

-- ── RLS TOURNEES_CONFIG ───────────────────────────────────────
CREATE POLICY tournees_staff_all ON public.tournees_config
  FOR ALL USING (get_user_role() IN ('gestionnaire','admin'));

CREATE POLICY tournees_ecole_own ON public.tournees_config
  FOR SELECT USING (ecole_id = get_ecole_id());

-- ── Colonne ecole_id dans profiles (pour le rôle ecole) ───────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ecole_id INT REFERENCES public.ecoles(id) ON DELETE SET NULL;

-- ── Exemple de données de test (optionnel) ────────────────────
-- INSERT INTO public.ecoles (nom, adresse, nom_responsable_facturation, email, lot)
-- VALUES ('École de Romont', 'Rue de la Poste 1, 1680 Romont', 'Marie Dupont', 'facturation@ecole-romont.ch', 'LOT-001');
