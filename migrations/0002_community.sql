CREATE TABLE community_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  area TEXT NOT NULL DEFAULT '',
  intro TEXT NOT NULL DEFAULT '',
  visible BOOLEAN NOT NULL DEFAULT false,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX community_profiles_visible ON community_profiles(visible);
