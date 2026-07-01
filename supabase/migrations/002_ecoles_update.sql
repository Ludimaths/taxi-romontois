-- ================================================================
-- Taxi Romontois — Mise à jour table ecoles (champs facturation)
-- À exécuter après 001_facturation.sql
-- ================================================================

ALTER TABLE public.ecoles
  ADD COLUMN IF NOT EXISTS telephone   TEXT,
  ADD COLUMN IF NOT EXISTS numero_tva  TEXT,
  ADD COLUMN IF NOT EXISTS iban        TEXT;
