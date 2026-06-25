-- SkinAI Lab — Supabase migration (BACKEND=supabase)
-- Same shape as db/schema.sql, plus RLS (deny-all for anon/authenticated) and a
-- private storage bucket. Server code uses the service role key (bypasses RLS).

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE submission_status AS ENUM ('new', 'processing', 'completed', 'need_retake', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE image_kind AS ENUM ('front', 'left', 'right');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS leads (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name   text NOT NULL,
  email       text NOT NULL,
  phone       text,
  age         int,
  gender      text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS leads_email_lower_idx ON leads (lower(email));
DROP TRIGGER IF EXISTS leads_set_updated_at ON leads;
CREATE TRIGGER leads_set_updated_at BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS submissions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id         uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  status          submission_status NOT NULL DEFAULT 'new',
  skin_concerns   text[] NOT NULL DEFAULT '{}',
  notes_from_user text,
  consent_terms   boolean NOT NULL DEFAULT false,
  consent_data    boolean NOT NULL DEFAULT false,
  consent_images  boolean NOT NULL DEFAULT false,
  user_agent      text,
  ip_hash         text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS submissions_status_idx     ON submissions (status);
CREATE INDEX IF NOT EXISTS submissions_created_at_idx ON submissions (created_at DESC);
CREATE INDEX IF NOT EXISTS submissions_lead_id_idx    ON submissions (lead_id);
DROP TRIGGER IF EXISTS submissions_set_updated_at ON submissions;
CREATE TRIGGER submissions_set_updated_at BEFORE UPDATE ON submissions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS images (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  kind          image_kind NOT NULL,
  storage_path  text NOT NULL,
  mime_type     text,
  size_bytes    int,
  width         int,
  height        int,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (submission_id, kind)
);
CREATE INDEX IF NOT EXISTS images_submission_id_idx ON images (submission_id);

CREATE TABLE IF NOT EXISTS analysis_results (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id  uuid NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  provider       text NOT NULL,
  provider_model text,
  raw            jsonb,
  normalized     jsonb,
  overall_score  int,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (submission_id, provider)
);
CREATE INDEX IF NOT EXISTS analysis_results_submission_id_idx ON analysis_results (submission_id);

CREATE TABLE IF NOT EXISTS reports (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL UNIQUE REFERENCES submissions(id) ON DELETE CASCADE,
  token         text NOT NULL UNIQUE,
  published_at  timestamptz NOT NULL DEFAULT now(),
  revoked_at    timestamptz
);
CREATE INDEX IF NOT EXISTS reports_token_idx ON reports (token);

CREATE TABLE IF NOT EXISTS admin_notes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  author_id     text,
  author_email  text,
  body          text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_notes_submission_created_idx ON admin_notes (submission_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Row Level Security: enable on every table with NO policies for anon/authenticated.
-- Direct client access is therefore denied; the server uses the service role key.
-- ---------------------------------------------------------------------------
ALTER TABLE leads            ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE images           ENABLE ROW LEVEL SECURITY;
ALTER TABLE analysis_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports          ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_notes      ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Private storage bucket for face images.
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('skin-images', 'skin-images', false)
ON CONFLICT (id) DO NOTHING;
