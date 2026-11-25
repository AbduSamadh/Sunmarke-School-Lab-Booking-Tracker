/**
 * Postgres schema. Plain SQL so it runs unchanged on PGlite (local/dev/tests)
 * and on managed Postgres (Supabase/Neon) once hosting is chosen (D9).
 *
 * Double-booking safety (R7) is enforced by the two partial unique indexes on
 * booking_slots, not by application code alone.
 * Nothing booking-related is hard-deleted: rows are deactivated or status-changed.
 */
export const SCHEMA_VERSION = 3;

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS meta (key text PRIMARY KEY, value text NOT NULL);

CREATE TABLE IF NOT EXISTS staff (
  id text PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  department text NOT NULL DEFAULT '',
  role text NOT NULL CHECK (role IN ('teacher','incharge','admin','viewer')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text
);

CREATE TABLE IF NOT EXISTS resources (
  id text PRIMARY KEY,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('room','cart_pool')),
  units int NOT NULL CHECK (units > 0),
  location text NOT NULL DEFAULT '',
  capacity int,
  colour text NOT NULL DEFAULT 'r1',
  sort int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS incharge_assignments (
  resource_id text NOT NULL REFERENCES resources(id),
  staff_id text NOT NULL REFERENCES staff(id),
  priority int NOT NULL,
  PRIMARY KEY (resource_id, staff_id)
);

CREATE TABLE IF NOT EXISTS timetables (
  id text PRIMARY KEY,
  name text NOT NULL,
  valid_from text,
  valid_to text,
  weekdays int[] NOT NULL,
  priority int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text
);

CREATE TABLE IF NOT EXISTS blocks (
  id text PRIMARY KEY,
  timetable_id text NOT NULL REFERENCES timetables(id),
  code text NOT NULL,
  start_time text NOT NULL,
  end_time text NOT NULL,
  bookable boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS blackouts (
  id text PRIMARY KEY,
  resource_id text REFERENCES resources(id),
  date_from text NOT NULL,
  date_to text NOT NULL,
  block_codes text[],
  reason text NOT NULL CHECK (reason IN ('holiday','exam','maintenance','training','other')),
  note text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text
);

CREATE TABLE IF NOT EXISTS bookings (
  id text PRIMARY KEY,
  resource_id text NOT NULL REFERENCES resources(id),
  date text NOT NULL,
  block_ids text[] NOT NULL,
  teacher_id text NOT NULL REFERENCES staff(id),
  incharge_id text NOT NULL REFERENCES staff(id),
  subject text NOT NULL,
  year_group text NOT NULL,
  section text NOT NULL DEFAULT '',
  student_count int NOT NULL,
  cart_count int,
  classroom text,
  objective text NOT NULL DEFAULT '',
  lesson_plan_url text,
  special_requirements text NOT NULL DEFAULT '',
  status text NOT NULL CHECK (status IN ('confirmed','cancelled','completed','no_show','declined')),
  status_reason text,
  cross_cover boolean NOT NULL DEFAULT false,
  recurrence_id text,
  reminder_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL
);
CREATE INDEX IF NOT EXISTS bookings_date ON bookings(date);
CREATE INDEX IF NOT EXISTS bookings_teacher ON bookings(teacher_id);

CREATE TABLE IF NOT EXISTS booking_slots (
  id serial PRIMARY KEY,
  booking_id text NOT NULL REFERENCES bookings(id),
  incharge_id text NOT NULL REFERENCES staff(id),
  resource_id text NOT NULL REFERENCES resources(id),
  room_key text,            -- = resource_id for rooms, NULL for cart pools (many classes share the pool)
  date text NOT NULL,
  block_id text NOT NULL,
  units int NOT NULL DEFAULT 1,
  active boolean NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX IF NOT EXISTS slot_incharge_once ON booking_slots(incharge_id, date, block_id) WHERE active;
CREATE UNIQUE INDEX IF NOT EXISTS slot_room_once ON booking_slots(room_key, date, block_id) WHERE active AND room_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS slot_date ON booking_slots(date) WHERE active;

CREATE TABLE IF NOT EXISTS booking_attempts (
  id serial PRIMARY KEY,
  teacher_id text,
  resource_id text,
  date text,
  block_id text,
  code text NOT NULL,
  at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS waitlist (
  id text PRIMARY KEY,
  resource_id text NOT NULL REFERENCES resources(id),
  date text NOT NULL,
  block_id text NOT NULL,
  teacher_id text NOT NULL REFERENCES staff(id),
  units int NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','offered','booked','expired','left')),
  offered_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS calendar_events (
  id text PRIMARY KEY,
  staff_id text NOT NULL REFERENCES staff(id),
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  title text NOT NULL,
  booking_id text,
  source text NOT NULL CHECK (source IN ('app','external')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS calendar_app_event_once ON calendar_events(booking_id, staff_id) WHERE active AND booking_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS notifications (
  id text PRIMARY KEY,
  booking_id text,
  template text NOT NULL,
  recipient text NOT NULL,
  subject text NOT NULL,
  body_html text NOT NULL,
  body_text text NOT NULL,
  ics text,
  status text NOT NULL DEFAULT 'sent',
  error text,
  sent_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS jobs (
  id text PRIMARY KEY,
  kind text NOT NULL,
  payload jsonb NOT NULL,
  idempotency_key text UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','done','failed')),
  attempts int NOT NULL DEFAULT 0,
  last_error text,
  run_after timestamptz NOT NULL DEFAULT now(),
  alerted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS conflict_flags (
  key text PRIMARY KEY,
  booking_id text NOT NULL,
  detail text NOT NULL,
  notified_at timestamptz NOT NULL DEFAULT now(),
  resolved boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS audit_log (
  id serial PRIMARY KEY,
  actor_id text,
  action text NOT NULL,
  entity text NOT NULL,
  entity_id text,
  before jsonb,
  after jsonb,
  at timestamptz NOT NULL DEFAULT now()
);

-- Release 1.1 ---------------------------------------------------------------
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS checked_in_at timestamptz;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS feedback_sent_at timestamptz;
ALTER TABLE resources ADD COLUMN IF NOT EXISTS links jsonb NOT NULL DEFAULT '[]';
ALTER TABLE resources ADD COLUMN IF NOT EXISTS checkin_code text;

CREATE TABLE IF NOT EXISTS recurrences (
  id text PRIMARY KEY,
  teacher_id text NOT NULL REFERENCES staff(id),
  resource_id text NOT NULL REFERENCES resources(id),
  start_date text NOT NULL,
  end_date text NOT NULL,
  every_weeks int NOT NULL DEFAULT 1,
  block_codes text[] NOT NULL,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS absences (
  id text PRIMARY KEY,
  staff_id text NOT NULL REFERENCES staff(id),
  date_from text NOT NULL,
  date_to text NOT NULL,
  block_codes text[],
  reason text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS feedback (
  booking_id text PRIMARY KEY REFERENCES bookings(id),
  teacher_id text NOT NULL REFERENCES staff(id),
  rating int NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text NOT NULL DEFAULT '',
  issue_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS equipment_issues (
  id text PRIMARY KEY,
  resource_id text NOT NULL REFERENCES resources(id),
  item text NOT NULL DEFAULT '',      -- e.g. "Cart 7", "Headset 3"
  title text NOT NULL,
  detail text NOT NULL DEFAULT '',
  severity text NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  blackout_id text,
  booking_id text,
  reported_by text NOT NULL,
  resolved_by text,
  resolved_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE TABLE IF NOT EXISTS settings (key text PRIMARY KEY, value jsonb NOT NULL);

CREATE TABLE IF NOT EXISTS lookups (
  kind text NOT NULL,
  value text NOT NULL,
  sort int NOT NULL DEFAULT 0,
  PRIMARY KEY (kind, value)
);

-- Release 2 ------------------------------------------------------------------
-- Multi-campus: every campus has its own labs, staff, timetables and blackouts.
CREATE TABLE IF NOT EXISTS campuses (
  id text PRIMARY KEY,
  name text NOT NULL,
  short_name text NOT NULL DEFAULT '',
  sort int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO campuses (id, name, short_name) VALUES ('sunmarke', 'Sunmarke School', 'Sunmarke') ON CONFLICT DO NOTHING;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS campus_id text NOT NULL DEFAULT 'sunmarke' REFERENCES campuses(id);
ALTER TABLE resources ADD COLUMN IF NOT EXISTS campus_id text NOT NULL DEFAULT 'sunmarke' REFERENCES campuses(id);
ALTER TABLE timetables ADD COLUMN IF NOT EXISTS campus_id text NOT NULL DEFAULT 'sunmarke' REFERENCES campuses(id);
ALTER TABLE blackouts ADD COLUMN IF NOT EXISTS campus_id text NOT NULL DEFAULT 'sunmarke' REFERENCES campuses(id);
-- Group admins (Fortes) see and manage every campus; everyone else sees their own.
ALTER TABLE staff ADD COLUMN IF NOT EXISTS all_campuses boolean NOT NULL DEFAULT false;
-- The campus Labs Hub (Google Site): linked in the footer and in confirmation emails.
ALTER TABLE campuses ADD COLUMN IF NOT EXISTS hub_url text NOT NULL DEFAULT '';
-- abd, 25 Nov: each AI Cart goes with its own in-charge. The lead is bookings.incharge_id;
-- the others are here, and every one of them holds its own row in booking_slots.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS support_ids text[] NOT NULL DEFAULT '{}';
-- abd, 25 Nov: messages go to Teams instead of email.
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'email';

-- Curriculum mapping: the KS3 progressive plan, as admin-editable levels.
CREATE TABLE IF NOT EXISTS curriculum_levels (
  id text PRIMARY KEY,
  code text NOT NULL UNIQUE,
  strand text NOT NULL,
  title text NOT NULL,
  year_group text NOT NULL DEFAULT '',
  sort int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS curriculum_ids text[] NOT NULL DEFAULT '{}';

-- Phone app: device tokens for push notifications (Expo push tokens).
CREATE TABLE IF NOT EXISTS push_devices (
  token text PRIMARY KEY,
  staff_id text NOT NULL REFERENCES staff(id),
  platform text NOT NULL CHECK (platform IN ('ios','android','web')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
`;
