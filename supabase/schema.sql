-- ============================================================
-- TAXI ROMONTOIS — Schema complet avec DROP IF EXISTS
-- Version 2.0 — reset propre avant recréation
-- ============================================================

-- Triggers
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS on_reparation_insert ON reparations;

-- Fonctions
DROP FUNCTION IF EXISTS handle_new_user()        CASCADE;
DROP FUNCTION IF EXISTS check_reparation_seuil() CASCADE;
DROP FUNCTION IF EXISTS current_user_role()       CASCADE;
DROP FUNCTION IF EXISTS current_conducteur_id()   CASCADE;
DROP FUNCTION IF EXISTS current_enfant_id()       CASCADE;

-- Tables (CASCADE supprime policies et foreign keys)
DROP TABLE IF EXISTS absences_conducteurs CASCADE;
DROP TABLE IF EXISTS reparations          CASCADE;
DROP TABLE IF EXISTS alertes              CASCADE;
DROP TABLE IF EXISTS incidents            CASCADE;
DROP TABLE IF EXISTS service_logs         CASCADE;
DROP TABLE IF EXISTS absences_enfants     CASCADE;
DROP TABLE IF EXISTS enfants              CASCADE;
DROP TABLE IF EXISTS profiles             CASCADE;
DROP TABLE IF EXISTS conducteurs          CASCADE;
DROP TABLE IF EXISTS vehicules            CASCADE;
DROP TABLE IF EXISTS circuits             CASCADE;
DROP TABLE IF EXISTS cercles_scolaires    CASCADE;

-- Types
DROP TYPE IF EXISTS role_type       CASCADE;
DROP TYPE IF EXISTS driver_status   CASCADE;
DROP TYPE IF EXISTS vehicle_state   CASCADE;
DROP TYPE IF EXISTS incident_status CASCADE;
DROP TYPE IF EXISTS alert_severity  CASCADE;
DROP TYPE IF EXISTS repair_status   CASCADE;

-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Types ─────────────────────────────────────────────────────────────────────
CREATE TYPE role_type       AS ENUM ('gestionnaire','conducteur','mecanicien','parent','admin');
CREATE TYPE driver_status   AS ENUM ('en_service','en_attente','absent','disponible','termine');
CREATE TYPE vehicle_state   AS ENUM ('bon','atelier','attention');
CREATE TYPE incident_status AS ENUM ('en_attente','en_cours','resolu');
CREATE TYPE alert_severity  AS ENUM ('normale','haute','critique');
CREATE TYPE repair_status   AS ENUM ('en_cours','termine');

-- ── Tables ────────────────────────────────────────────────────────────────────
CREATE TABLE cercles_scolaires (
  id         SERIAL PRIMARY KEY,
  nom        VARCHAR(100) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE circuits (
  id            VARCHAR(10) PRIMARY KEY,
  nom           VARCHAR(100) NOT NULL,
  emoji         VARCHAR(10),
  num           VARCHAR(5) NOT NULL,
  cercle_id     INTEGER REFERENCES cercles_scolaires(id),
  enfants_count INTEGER DEFAULT 0,
  km_aller      DECIMAL(6,1),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE vehicules (
  id             VARCHAR(20) PRIMARY KEY,
  plaque         VARCHAR(20) NOT NULL UNIQUE,
  marque         VARCHAR(50) NOT NULL,
  modele         VARCHAR(100) NOT NULL,
  places         INTEGER DEFAULT 0,
  places_handi   INTEGER DEFAULT 0,
  etat           vehicle_state DEFAULT 'bon',
  circuit_id     VARCHAR(10) REFERENCES circuits(id),
  ct_date        VARCHAR(10),
  assurance_date VARCHAR(10),
  km             INTEGER DEFAULT 0,
  qr_token       UUID DEFAULT uuid_generate_v4() UNIQUE,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE conducteurs (
  id             SERIAL PRIMARY KEY,
  user_id        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  nom            VARCHAR(100) NOT NULL,
  prenom         VARCHAR(100) NOT NULL,
  tel            VARCHAR(30),
  affectation    VARCHAR(200) DEFAULT 'Scolaire',
  cercle_id      INTEGER REFERENCES cercles_scolaires(id),
  circuit_id     VARCHAR(10) REFERENCES circuits(id),
  vehicule_id    VARCHAR(20) REFERENCES vehicules(id),
  photo_initials VARCHAR(5),
  permis         VARCHAR(50),
  permis_exp     DATE,
  tachygraphe    BOOLEAN DEFAULT FALSE,
  status         driver_status DEFAULT 'disponible',
  absence_motif  VARCHAR(200),
  notes          TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE profiles (
  id            UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  role          role_type NOT NULL DEFAULT 'conducteur',
  nom           VARCHAR(100) NOT NULL,
  prenom        VARCHAR(100) NOT NULL,
  tel           VARCHAR(30),
  conducteur_id INTEGER REFERENCES conducteurs(id) ON DELETE SET NULL,
  enfant_id     INTEGER,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE enfants (
  id             SERIAL PRIMARY KEY,
  nom            VARCHAR(100) NOT NULL,
  prenom         VARCHAR(100) NOT NULL,
  circuit_id     VARCHAR(10) REFERENCES circuits(id),
  cercle_id      INTEGER REFERENCES cercles_scolaires(id),
  parent_nom     VARCHAR(200),
  parent_tel     VARCHAR(30),
  adresse_mere   TEXT,
  adresse_pere   TEXT,
  parent_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE absences_enfants (
  id                    SERIAL PRIMARY KEY,
  enfant_id             INTEGER REFERENCES enfants(id) ON DELETE CASCADE,
  circuit_id            VARCHAR(10) REFERENCES circuits(id),
  date_absence          DATE DEFAULT CURRENT_DATE,
  reason                VARCHAR(200) NOT NULL,
  reported_by           VARCHAR(100) DEFAULT 'Parent',
  reported_at           TIMESTAMPTZ DEFAULT NOW(),
  read_by_gestionnaire  BOOLEAN DEFAULT FALSE,
  transmitted_to_driver BOOLEAN DEFAULT FALSE,
  read_by_driver        BOOLEAN DEFAULT FALSE,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE service_logs (
  id               SERIAL PRIMARY KEY,
  conducteur_id    INTEGER REFERENCES conducteurs(id),
  vehicule_id      VARCHAR(20) REFERENCES vehicules(id),
  circuit_id       VARCHAR(10) REFERENCES circuits(id),
  date_service     DATE DEFAULT CURRENT_DATE,
  heure_debut      TIME,
  heure_fin        TIME,
  status           driver_status DEFAULT 'en_attente',
  is_replacement   BOOLEAN DEFAULT FALSE,
  replacement_name VARCHAR(200),
  notes            TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE incidents (
  id            SERIAL PRIMARY KEY,
  type          VARCHAR(50) NOT NULL,
  vehicule_id   VARCHAR(20) REFERENCES vehicules(id),
  conducteur_id INTEGER REFERENCES conducteurs(id),
  circuit_id    VARCHAR(10) REFERENCES circuits(id),
  description   TEXT NOT NULL,
  status        incident_status DEFAULT 'en_attente',
  response      TEXT,
  reported_at   TIMESTAMPTZ DEFAULT NOW(),
  resolved_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE alertes (
  id         SERIAL PRIMARY KEY,
  type       VARCHAR(50) NOT NULL,
  severity   alert_severity DEFAULT 'normale',
  message    TEXT NOT NULL,
  read       BOOLEAN DEFAULT FALSE,
  driver_id  INTEGER REFERENCES conducteurs(id),
  vehicle_id VARCHAR(20) REFERENCES vehicules(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  read_at    TIMESTAMPTZ
);

CREATE TABLE reparations (
  id              SERIAL PRIMARY KEY,
  vehicule_id     VARCHAR(20) REFERENCES vehicules(id),
  description     TEXT NOT NULL,
  cout            DECIMAL(10,2) NOT NULL DEFAULT 0,
  date_reparation DATE DEFAULT CURRENT_DATE,
  statut          repair_status DEFAULT 'en_cours',
  responsable     VARCHAR(200),
  alerte_envoyee  BOOLEAN DEFAULT FALSE,
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE absences_conducteurs (
  id            SERIAL PRIMARY KEY,
  conducteur_id INTEGER REFERENCES conducteurs(id),
  date_absence  DATE DEFAULT CURRENT_DATE,
  motif         VARCHAR(200),
  remplacant_id INTEGER REFERENCES conducteurs(id),
  circuit_id    VARCHAR(10) REFERENCES circuits(id),
  status        VARCHAR(50) DEFAULT 'non_couvert',
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- DONNÉES INITIALES
-- ============================================================

INSERT INTO cercles_scolaires (nom) VALUES
  ('Mérine'),('AISMLE'),('CESL'),('Siviriez'),('Cugy-ASISE'),
  ('Saint Prex-ASISE'),('Verdeil-Yverdon'),('Verdeil-Payerne'),
  ('Perceval'),('Carré d''As'),('Lucens'),('Espérance'),
  ('TEM'),('Clos Fleury'),('Cheiry-Surpierre'),('Romont');

INSERT INTO circuits (id,nom,emoji,num,cercle_id,enfants_count,km_aller) VALUES
  ('C001','Hélico',      '🚁','06', 1,6,20),
  ('C002','Paresseux',   '🦥','06', 7,7,33),
  ('C003','Éléphant',    '🐘','03', 2,7,31),
  ('C004','Libellule',   '🦗','03', 3,5,17),
  ('C005','Varan Vert',  '🦎','02', 5,5,19),
  ('C006','Fourmi',      '🐜','02', 3,5,15),
  ('C007','Chat',        '🐱','03', 6,9,24),
  ('C008','Tortue Verte','🐢','03', 4,6,18),
  ('C009','Ours',        '🐻','02', 1,8,22),
  ('C010','Zèbre',       '🦓','03',11,7,26),
  ('C011','Cheval',      '🐴','01', 8,6,28),
  ('C012','Lémurien',    '🐒','08', 7,4,35),
  ('C013','Raisin',      '🍇','01',12,5,21),
  ('C014','Panthère',    '🐆','06', 1,7,22),
  ('C015','Rhinocéros',  '🦏','02', 6,6,24),
  ('C016','Baleine',     '🐋','02', 6,5,22),
  ('C017','Lapin Rose',  '🐰','02', 4,6,16),
  ('C018','Soleil',      '☀', '05', 8,8,30),
  ('C019','Poussin',     '🐥','03', 1,5,20),
  ('C020','Banane',      '🍌','02',12,6,23),
  ('C021','Hérisson',    '🦔','02', 3,4,14),
  ('C022','Perroquet',   '🦜','09', 8,7,32),
  ('C023','Hippopotame', '🦛','05', 5,6,27),
  ('C024','Ours Brun',   '🐻','01', 4,5,18),
  ('C025','Panda',       '🐼','04', 3,7,16),
  ('C026','Lion',        '🦁','04', 1,8,20),
  ('C027','Hérisson-03', '🦔','03', 7,5,29),
  ('C028','Arc en ciel', '🌈','05', 7,7,31),
  ('C029','Tigre',       '🐯','02', 2,6,28),
  ('C030','Biche',       '🦌','01', 9,5,22),
  ('C031','Cheval-08',   '🐴','08', 7,6,33),
  ('C032','Vache',       '🐄','03',13,7,19),
  ('C033','Pic Vert',    '🐦','06', 9,5,25),
  ('C034','Licorne',     '🦄','05', 3,8,17),
  ('C035','Colibri',     '🐦','02', 7,4,28),
  ('C036','Lézard',      '🦎','12', 7,8,28),
  ('C037','Coccinelle',  '🐞','01', 1,6,21),
  ('C038','Hibou',       '🦉','04', 9,5,24),
  ('C039','Suricate',    '🦡','11',10,7,26),
  ('C040','Crocodile',   '🐊','03',10,6,22),
  ('C041','Kangourou',   '🦘','04',10,5,23),
  ('C042','Tigre-09',    '🐯','09',10,6,25),
  ('C043','Chat-12',     '🐱','12',10,7,24),
  ('C044','Tortue',      '🐢','03', 1,5,19),
  ('C045','Lapin',       '🐰','05', 1,6,21),
  ('C046','Étoile',      '⭐','02', 8,5,31),
  ('C047','Lune',        '🌙','08', 8,6,33),
  ('C048','Impala',      '🦌','07',10,5,24),
  ('C049','Tortue-01',   '🐢','01',13,7,20),
  ('C050','Panda Roux',  '🦊','04', 5,5,22),
  ('C051','Abeille',     '🐝','01', 6,6,21),
  ('C052','Ours-05',     '🐻','05', 9,5,23),
  ('C053','Bus A',       '🚌','01',15,8,25),
  ('C054','Bus B',       '🚌','02',15,7,25);

INSERT INTO vehicules (id,plaque,marque,modele,places,places_handi,etat,circuit_id,ct_date,assurance_date,km) VALUES
  ('FR-13',     'FR 13',     'Mercedes',   'Vito',        9, 0,'bon',      'C001','04.2027','04.2027', 87432),
  ('FR-80058',  'FR 80058',  'Seat',       'Alhambra',    7, 0,'bon',      'C003','01.2027','01.2027', 62100),
  ('FR-76343',  'FR 76343',  'Volkswagen', 'Transporter', 9, 0,'bon',      'C006',NULL,NULL,            54100),
  ('FR-150291', 'FR 150291', 'Mercedes',   'Sprinter',   14, 0,'atelier',  NULL,NULL,NULL,             102300),
  ('FR-150292', 'FR 150292', 'Fiat',       'Ducato',      7, 2,'bon',      NULL,NULL,NULL,              78500),
  ('FR-150295', 'FR 150295', 'Mercedes',   'Sprinter',   12, 0,'bon',      NULL,NULL,NULL,              91200),
  ('FR-150296', 'FR 150296', 'Beulas',     'Mythos',     49,13,'bon',      'C008',NULL,NULL,           145200),
  ('FR-150299', 'FR 150299', 'Mercedes',   'Sprinter',   35, 0,'bon',      NULL,NULL,NULL,             118000),
  ('FR-150374', 'FR 150374', 'Mercedes',   'Vito',        9, 0,'bon',      'C009','01.2027','01.2027', 78900),
  ('FR-151220', 'FR 151220', 'Volkswagen', 'Crafter',    17, 0,'bon',      'C036',NULL,NULL,            91000),
  ('FR-151322', 'FR 151322', 'Seat',       'Alhambra',    7, 0,'attention','C005',NULL,NULL,           138000),
  ('FR-151323', 'FR 151323', 'Mercedes',   'Sprinter',   24, 0,'bon',      NULL,NULL,NULL,              67400),
  ('FR-151324', 'FR 151324', 'Mercedes',   'Sprinter',   24, 0,'bon',      NULL,NULL,NULL,              72100),
  ('FR-378163', 'FR 378163', 'Citroën',    'Jumpy',       8, 0,'bon',      NULL,NULL,NULL,             115000),
  ('FR-386060', 'FR 386060', 'Fiat',       'Handicap',    3, 3,'bon',      NULL,NULL,NULL,              88000),
  ('FR-394931', 'FR 394931', 'Opel',       'Movano',      3, 2,'bon',      NULL,NULL,NULL,              95000),
  ('FR-401713', 'FR 401713', 'Volkswagen', 'Crafter',     7, 2,'bon',      NULL,NULL,NULL,              44000),
  ('VD-453460', 'VD 453460', 'Mercedes',   'Sprinter',    9, 4,'bon',      NULL,NULL,NULL,              68000),
  ('VD-453482', 'VD 453482', 'Mercedes',   'Sprinter',    9, 4,'bon',      NULL,NULL,NULL,              71000),
  ('VD-466679', 'VD 466679', 'Mercedes',   'Vito',        9, 0,'bon',      NULL,NULL,NULL,              59000),
  ('VD-577285', 'VD 577285', 'Volkswagen', 'Crafter',     9, 4,'bon',      NULL,NULL,NULL,              52000),
  ('VD-578241', 'VD 578241', 'Volkswagen', 'Crafter',     9, 4,'bon',      NULL,NULL,NULL,              48000),
  ('VD-601758', 'VD 601758', 'Volkswagen', 'Transporter', 9, 0,'bon',      NULL,NULL,NULL,              38000),
  ('VD-633137', 'VD 633137', 'Mercedes',   'Vito',        8, 0,'bon',      NULL,NULL,NULL,              31000);

INSERT INTO conducteurs
  (nom,prenom,tel,affectation,cercle_id,circuit_id,vehicule_id,photo_initials,permis,permis_exp,tachygraphe,status,absence_motif)
VALUES
  ('Aebischer',    'Yvan',       NULL,            'Scolaire',            1,'C001','FR-13',    'AY','B,D1,D1E','2030-02-18',TRUE, 'en_attente',NULL),
  ('Atasever',     'Mehmet',     NULL,            'Scolaire',            7,'C002',NULL,       'AM',NULL,       NULL,        FALSE,'disponible',NULL),
  ('Aubort',       'Michel',     NULL,            'Scolaire,Nettoyage',  2,'C003','FR-80058', 'AM','B,D,DE',  '2028-11-04',TRUE, 'en_service', NULL),
  ('Auguet',       'Stéphane',   '079 464 76 92', 'Scolaire',            3,'C004',NULL,       'AS',NULL,       NULL,        FALSE,'disponible',NULL),
  ('Barcia',       'José',       '079 222 05 53', 'Scolaire',            5,'C005','FR-151322','BJ',NULL,       NULL,        FALSE,'disponible',NULL),
  ('Barsacq',      'Sandrine',   '078 679 46 94', 'Scolaire',            3,'C006','FR-76343', 'BS','B',        '2026-03-15',FALSE,'en_service', NULL),
  ('Benhalima',    'Omar',       '078 759 52 51', 'Scolaire',            6,'C007',NULL,       'BO','D',        '2027-09-10',FALSE,'en_attente',NULL),
  ('Bérod',        'Sylviane',   '026/411.22.23', 'Scolaire',            4,'C008','FR-150296','BS',NULL,       NULL,        FALSE,'en_attente',NULL),
  ('Bettex',       'Olivier',    '078 255 97 38', 'Scolaire',            8,'C011',NULL,       'BO',NULL,       NULL,        FALSE,'disponible',NULL),
  ('Bonnard',      'Antoine',    NULL,            'Scolaire',           12,'C013',NULL,       'BA',NULL,       NULL,        FALSE,'absent',    'Maladie 11.02.2026'),
  ('Cavada',       'Nancy',      '079 647 69 33', 'Scolaire',            1,'C009','FR-150374','CN',NULL,       NULL,        FALSE,'absent',    'Maladie'),
  ('Chabloz',      'Jacky',      '079/424.81.07', 'Scolaire',           11,'C010',NULL,       'CJ',NULL,       NULL,        FALSE,'disponible',NULL),
  ('Charbonnier',  'Lucas',      '077 417 12 52', 'Scolaire',           13,NULL,  NULL,       'CL',NULL,       NULL,        FALSE,'disponible',NULL),
  ('Cordon',       'Marion',     NULL,            'Scolaire',            6,'C016',NULL,       'CM',NULL,       NULL,        FALSE,'disponible',NULL),
  ('Cuénoud',      'Rosemarie',  NULL,            'Scolaire',            4,'C017',NULL,       'CR',NULL,       NULL,        FALSE,'disponible',NULL),
  ('Da Silva Pina','Carmindo',   NULL,            'Scolaire',            8,'C018',NULL,       'DC',NULL,       NULL,        FALSE,'disponible',NULL),
  ('Dintimille',   'Serge',      '078 664 03 42', 'Scolaire',           12,'C020',NULL,       'DS',NULL,       NULL,        FALSE,'disponible',NULL),
  ('El Hassany',   'Abdellah',   '078 252 41 09', 'Scolaire',            4,'C024',NULL,       'EA',NULL,       NULL,        FALSE,'disponible',NULL),
  ('Esmel',        'Abel',       '079 833 59 73', 'Scolaire',            9,'C052',NULL,       'EA',NULL,       NULL,        FALSE,'disponible',NULL),
  ('Fleuti',       'Francis',    '079 742 08 10', 'Scolaire',            3,'C025',NULL,       'FF',NULL,       NULL,        FALSE,'disponible',NULL),
  ('Gaya',         'Jenissa',    '078 312 84 07', 'Scolaire',            1,'C026',NULL,       'GJ',NULL,       NULL,        FALSE,'disponible',NULL),
  ('Herren',       'Marlyse',    '077 437 88 17', 'Scolaire',            7,'C027',NULL,       'HM',NULL,       NULL,        FALSE,'disponible',NULL),
  ('Ismajlji',     'Seljman',    '076/217.00.97', 'Scolaire',            1,'C037',NULL,       'IS','B',        NULL,        FALSE,'disponible',NULL),
  ('Kouchou',      'Lionel',     '079 153 67 22', 'Scolaire',            9,'C038',NULL,       'KL',NULL,       NULL,        FALSE,'disponible',NULL),
  ('Lavanchy',     'Olivier',    '079/616.57.48', 'Scolaire',            5,NULL,  NULL,       'LO',NULL,       NULL,        FALSE,'disponible',NULL),
  ('Loichat',      'Daniel',     '079 255 24 25', 'Scolaire',            5,'C050',NULL,       'LD',NULL,       NULL,        FALSE,'disponible',NULL),
  ('Macedo',       'Bruno',      NULL,            'Scolaire',           10,'C039',NULL,       'MB',NULL,       NULL,        FALSE,'absent',    'Permis suspendu'),
  ('Macedo',       'Elvira',     NULL,            'Scolaire',           10,'C040',NULL,       'ME',NULL,       NULL,        FALSE,'absent',    'Maladie 08.02.2026'),
  ('Macedo',       'Hugo',       NULL,            'Scolaire',           10,'C041',NULL,       'MH',NULL,       NULL,        FALSE,'disponible',NULL),
  ('Magnin',       'Elena',      '079 818 73 02', 'Scolaire',            7,'C028',NULL,       'ME',NULL,       NULL,        FALSE,'disponible',NULL),
  ('Mettraux',     'Gabriel',    '079 872 27 86', 'Scolaire',            2,'C029',NULL,       'MG',NULL,       NULL,        FALSE,'disponible',NULL),
  ('Miceva',       'Vanja',      '079 415 34 72', 'Scolaire',            9,'C030',NULL,       'MV',NULL,       NULL,        FALSE,'disponible',NULL),
  ('Michard',      'Vanessa',    '079 175 52 75', 'Scolaire',            7,'C031',NULL,       'MV',NULL,       NULL,        FALSE,'disponible',NULL),
  ('Moreira',      'Rute',       '078 209 47 70', 'Scolaire',           13,'C032',NULL,       'MR',NULL,       NULL,        FALSE,'disponible',NULL),
  ('Ndiaye',       'Ibrahima',   '077 980 61 62', 'Scolaire',            9,'C033',NULL,       'NI',NULL,       NULL,        FALSE,'disponible',NULL),
  ('Nicolet',      'Gérard',     '026/652.37.62', 'Scolaire',            3,'C034',NULL,       'NG',NULL,       NULL,        FALSE,'disponible',NULL),
  ('Noirat',       'Frédéric',   '078 736 31 33', 'Scolaire',            7,'C035',NULL,       'NF',NULL,       NULL,        FALSE,'disponible',NULL),
  ('Oliveira',     'Alessandra', '079 824 96 43', 'Scolaire',            8,'C046',NULL,       'OA',NULL,       NULL,        FALSE,'disponible',NULL),
  ('Oliveira',     'Manuel',     NULL,            'Scolaire',            7,'C036','FR-151220','OM',NULL,       NULL,        FALSE,'disponible',NULL),
  ('Pfister',      'Eira',       '026/668.15.71', 'Scolaire',           15,'C053',NULL,       'PE',NULL,       NULL,        FALSE,'disponible',NULL),
  ('Plancherel',   'Ferdinand',  '079/471.57.37', 'Scolaire',            1,'C045',NULL,       'PF',NULL,       NULL,        FALSE,'disponible',NULL),
  ('Progin',       'Mireille',   '079 660 18 13', 'Scolaire',           10,'C043',NULL,       'PM',NULL,       NULL,        FALSE,'disponible',NULL),
  ('Pulver',       'René',       '078/729.31.07', 'Scolaire',            1,'C044',NULL,       'PR',NULL,       NULL,        FALSE,'disponible',NULL),
  ('Röthlisberger','Frédéric',   '079/238.65.68', 'Scolaire',           15,'C054',NULL,       'RF',NULL,       NULL,        FALSE,'disponible',NULL),
  ('Schemann',     'Johann',     '077 988 44 90', 'Scolaire',           10,'C042',NULL,       'SJ',NULL,       NULL,        FALSE,'disponible',NULL),
  ('Schneider',    'Martial',    '079/285.89.37', 'Scolaire',           11,NULL,  NULL,       'SM',NULL,       NULL,        FALSE,'disponible',NULL),
  ('Soldati',      'Noémie',     NULL,            'Scolaire',            6,'C051',NULL,       'SN',NULL,       NULL,        FALSE,'disponible',NULL),
  ('Stici',        'Tudor',      '076/454.51.77', 'Scolaire',           10,'C048',NULL,       'ST',NULL,       NULL,        FALSE,'disponible',NULL),
  ('Suarez',       'Frédérico',  NULL,            'Scolaire',            8,'C047',NULL,       'SF',NULL,       NULL,        FALSE,'disponible',NULL),
  ('Tiqddarine',   'Khalid',     '078 238 57 13', 'Scolaire',           13,NULL,  NULL,       'TK',NULL,       NULL,        FALSE,'disponible',NULL),
  ('Walti',        'Léonard',    '077 416 84 28', 'Scolaire',           13,'C049',NULL,       'WL',NULL,       NULL,        FALSE,'disponible',NULL),
  ('Chevalley',    'Stéphane',   NULL,            'Scolaire',            6,NULL,  NULL,       'CS',NULL,       NULL,        FALSE,'disponible',NULL);

UPDATE conducteurs SET vehicule_id='FR-13'     WHERE nom='Aebischer' AND prenom='Yvan';
UPDATE conducteurs SET vehicule_id='FR-150374' WHERE nom='Cavada'    AND prenom='Nancy';

INSERT INTO alertes (type,severity,message,read) VALUES
  ('document',  'haute',   'Permis Sandrine Barsacq expire dans 45 jours (15.03.2026)',FALSE),
  ('vehicule',  'critique','FR 151322 : 138 000 km — révision immédiate requise',      FALSE),
  ('conducteur','haute',   'Circuit Ours non couvert — Nancy Cavada absente',           TRUE),
  ('vehicule',  'normale', 'FR 150291 en atelier — aucun conducteur affecté',          TRUE),
  ('conducteur','haute',   'Bruno Macedo : permis suspendu — Circuit Suricate non couvert',FALSE),
  ('conducteur','haute',   'Elvira Macedo absente depuis 08.02.2026 — Circuit Crocodile non couvert',FALSE);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE profiles             ENABLE ROW LEVEL SECURITY;
ALTER TABLE cercles_scolaires    ENABLE ROW LEVEL SECURITY;
ALTER TABLE circuits             ENABLE ROW LEVEL SECURITY;
ALTER TABLE conducteurs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicules            ENABLE ROW LEVEL SECURITY;
ALTER TABLE enfants              ENABLE ROW LEVEL SECURITY;
ALTER TABLE absences_enfants     ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_logs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE incidents            ENABLE ROW LEVEL SECURITY;
ALTER TABLE alertes              ENABLE ROW LEVEL SECURITY;
ALTER TABLE reparations          ENABLE ROW LEVEL SECURITY;
ALTER TABLE absences_conducteurs ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION current_user_role()
RETURNS role_type LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION current_conducteur_id()
RETURNS INTEGER LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT conducteur_id FROM profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION current_enfant_id()
RETURNS INTEGER LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT enfant_id FROM profiles WHERE id = auth.uid();
$$;

-- profiles
CREATE POLICY "profiles_own"          ON profiles FOR ALL    USING (id = auth.uid());
CREATE POLICY "profiles_gestionnaire" ON profiles FOR SELECT USING (current_user_role() IN ('gestionnaire','admin'));

-- référence
CREATE POLICY "cercles_read_all"  ON cercles_scolaires FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "circuits_read_all" ON circuits           FOR SELECT USING (auth.role() = 'authenticated');

-- conducteurs
CREATE POLICY "conducteurs_read_gestionnaire_admin" ON conducteurs FOR SELECT
  USING (current_user_role() IN ('gestionnaire','admin','mecanicien'));
CREATE POLICY "conducteurs_read_self" ON conducteurs FOR SELECT
  USING (id = current_conducteur_id());
CREATE POLICY "conducteurs_write_gestionnaire_admin" ON conducteurs FOR ALL
  USING (current_user_role() IN ('gestionnaire','admin'));
CREATE POLICY "conducteurs_update_self" ON conducteurs FOR UPDATE
  USING (id = current_conducteur_id());

-- véhicules
CREATE POLICY "vehicules_read_authenticated" ON vehicules FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "vehicules_write_gestionnaire_admin_mecanicien" ON vehicules FOR ALL
  USING (current_user_role() IN ('gestionnaire','admin','mecanicien'));

-- enfants
CREATE POLICY "enfants_read_gestionnaire" ON enfants FOR SELECT
  USING (current_user_role() IN ('gestionnaire','admin','conducteur'));
CREATE POLICY "enfants_read_parent_own" ON enfants FOR SELECT
  USING (id = current_enfant_id() AND current_user_role() = 'parent');
CREATE POLICY "enfants_write_gestionnaire" ON enfants FOR ALL
  USING (current_user_role() IN ('gestionnaire','admin'));

-- absences enfants
CREATE POLICY "absences_enfants_read_gestionnaire" ON absences_enfants FOR SELECT
  USING (current_user_role() IN ('gestionnaire','admin'));
CREATE POLICY "absences_enfants_read_conducteur_own_circuit" ON absences_enfants FOR SELECT
  USING (
    current_user_role() = 'conducteur' AND
    circuit_id = (SELECT circuit_id FROM conducteurs WHERE id = current_conducteur_id())
  );
CREATE POLICY "absences_enfants_read_parent_own" ON absences_enfants FOR SELECT
  USING (enfant_id = current_enfant_id() AND current_user_role() = 'parent');
CREATE POLICY "absences_enfants_insert_parent" ON absences_enfants FOR INSERT
  WITH CHECK (current_user_role() = 'parent' AND enfant_id = current_enfant_id());
CREATE POLICY "absences_enfants_insert_scan" ON absences_enfants FOR INSERT
  WITH CHECK (true);
CREATE POLICY "absences_enfants_update_gestionnaire" ON absences_enfants FOR UPDATE
  USING (current_user_role() IN ('gestionnaire','admin'));

-- service logs
CREATE POLICY "service_logs_read_gestionnaire" ON service_logs FOR SELECT
  USING (current_user_role() IN ('gestionnaire','admin'));
CREATE POLICY "service_logs_read_conducteur_own" ON service_logs FOR SELECT
  USING (conducteur_id = current_conducteur_id());
CREATE POLICY "service_logs_insert_all" ON service_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "service_logs_update_all" ON service_logs FOR UPDATE USING (true);

-- incidents
CREATE POLICY "incidents_read_gestionnaire" ON incidents FOR SELECT
  USING (current_user_role() IN ('gestionnaire','admin'));
CREATE POLICY "incidents_read_conducteur_own" ON incidents FOR SELECT
  USING (conducteur_id = current_conducteur_id());
CREATE POLICY "incidents_insert_all" ON incidents FOR INSERT WITH CHECK (true);
CREATE POLICY "incidents_update_gestionnaire" ON incidents FOR UPDATE
  USING (current_user_role() IN ('gestionnaire','admin'));

-- alertes
CREATE POLICY "alertes_read_gestionnaire_admin" ON alertes FOR SELECT
  USING (current_user_role() IN ('gestionnaire','admin'));
CREATE POLICY "alertes_insert_all" ON alertes FOR INSERT WITH CHECK (true);
CREATE POLICY "alertes_update_gestionnaire_admin" ON alertes FOR UPDATE
  USING (current_user_role() IN ('gestionnaire','admin'));

-- réparations
CREATE POLICY "reparations_read_mecanicien_admin" ON reparations FOR SELECT
  USING (current_user_role() IN ('gestionnaire','admin','mecanicien'));
CREATE POLICY "reparations_insert_mecanicien" ON reparations FOR INSERT
  WITH CHECK (current_user_role() IN ('mecanicien','gestionnaire','admin'));
CREATE POLICY "reparations_update_mecanicien" ON reparations FOR UPDATE
  USING (current_user_role() IN ('mecanicien','gestionnaire','admin'));

-- absences conducteurs
CREATE POLICY "absences_conducteurs_read_gestionnaire" ON absences_conducteurs FOR SELECT
  USING (current_user_role() IN ('gestionnaire','admin'));
CREATE POLICY "absences_conducteurs_all_gestionnaire" ON absences_conducteurs FOR ALL
  USING (current_user_role() IN ('gestionnaire','admin'));

-- ============================================================
-- TRIGGER : profil auto à l'inscription
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO profiles (id, role, nom, prenom)
  VALUES (
    NEW.id,
    COALESCE((NEW.raw_user_meta_data->>'role')::role_type, 'conducteur'),
    COALESCE(NEW.raw_user_meta_data->>'nom', ''),
    COALESCE(NEW.raw_user_meta_data->>'prenom', '')
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- TRIGGER : alerte automatique si réparation >= 1000 CHF
-- ============================================================
CREATE OR REPLACE FUNCTION check_reparation_seuil()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.cout >= 1000 AND NOT NEW.alerte_envoyee THEN
    INSERT INTO alertes (type, severity, message, read, vehicle_id)
    VALUES (
      'reparation',
      'haute',
      '⚠ Réparation ' || (SELECT plaque FROM vehicules WHERE id = NEW.vehicule_id) ||
      ' : ' || NEW.cout || ' CHF — Seuil 1000 CHF dépassé. ' || NEW.description,
      FALSE,
      NEW.vehicule_id
    );
    NEW.alerte_envoyee := TRUE;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_reparation_insert
  BEFORE INSERT ON reparations
  FOR EACH ROW EXECUTE FUNCTION check_reparation_seuil();

-- ============================================================
-- REALTIME
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE conducteurs;
ALTER PUBLICATION supabase_realtime ADD TABLE service_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE incidents;
ALTER PUBLICATION supabase_realtime ADD TABLE absences_enfants;
ALTER PUBLICATION supabase_realtime ADD TABLE alertes;
ALTER PUBLICATION supabase_realtime ADD TABLE reparations;
