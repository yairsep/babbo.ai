CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);

CREATE TABLE profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  children TEXT NOT NULL DEFAULT '[]',
  family_setup TEXT NOT NULL DEFAULT '',
  challenges TEXT NOT NULL DEFAULT '',
  language TEXT NOT NULL DEFAULT 'en',
  reminder_preference TEXT NOT NULL DEFAULT 'in_app',
  onboarding_done BOOLEAN NOT NULL DEFAULT false,
  updated_at TEXT NOT NULL
);

CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX conversations_user ON conversations(user_id, created_at);

CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  source_urls TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);
CREATE INDEX messages_conversation ON messages(conversation_id, created_at);

CREATE TABLE actions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  due_at TEXT NOT NULL,
  recurrence TEXT NOT NULL DEFAULT 'none',
  status TEXT NOT NULL DEFAULT 'open',
  reminder BOOLEAN NOT NULL DEFAULT true,
  created_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE INDEX actions_user_due ON actions(user_id, due_at);

CREATE TABLE memories (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);
