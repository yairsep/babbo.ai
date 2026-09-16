import postgres from 'postgres';
import { readFileSync, readdirSync } from 'node:fs';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('Set DATABASE_URL to a Postgres connection string first, e.g.\n  DATABASE_URL=postgresql://postgres:PASSWORD@db.PROJECT.supabase.co:5432/postgres npm run db:migrate');
  process.exit(1);
}
const sql = postgres(url, { max: 1 });
await sql`CREATE TABLE IF NOT EXISTS schema_migrations (filename TEXT PRIMARY KEY, applied_at TEXT NOT NULL)`;

const dir = new URL('../migrations/', import.meta.url);
const files = readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
let applied = 0;
for (const file of files) {
  const already = await sql`SELECT 1 FROM schema_migrations WHERE filename = ${file}`;
  if (already.length) continue;
  const text = readFileSync(new URL(file, dir), 'utf8');
  await sql.begin(async sql => {
    await sql.unsafe(text);
    await sql`INSERT INTO schema_migrations (filename, applied_at) VALUES (${file}, ${new Date().toISOString()})`;
  });
  console.log(`Applied ${file}`);
  applied++;
}
await sql.end();
console.log(applied ? `Migrations applied (${applied}).` : 'Migrations already up to date.');
