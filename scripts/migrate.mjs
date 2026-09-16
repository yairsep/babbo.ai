import postgres from 'postgres';
import { readFileSync } from 'node:fs';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('Set DATABASE_URL to a Postgres connection string first, e.g.\n  DATABASE_URL=postgresql://postgres:PASSWORD@db.PROJECT.supabase.co:5432/postgres npm run db:migrate');
  process.exit(1);
}
const sql = postgres(url, { max: 1 });
const schema = readFileSync(new URL('../migrations/0001_init.sql', import.meta.url), 'utf8');
await sql.unsafe(schema);
await sql.end();
console.log('Migration applied.');
