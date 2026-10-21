import {readFile} from 'node:fs/promises';
import {neon} from '@neondatabase/serverless';
import {loadEnvironment} from './env.mjs';
try {
  loadEnvironment();
  const sql=neon(process.env.DATABASE_URL);
  const entries=JSON.parse(await readFile(new URL('../seed.json',import.meta.url),'utf8'));
  const name='initial-bookings-v1';
  // The marker prevents reruns from restoring deleted entries or resetting edits.
  await sql.transaction([
    sql`SELECT pg_advisory_xact_lock(73148262)`,
    ...entries.map(e=>sql`INSERT INTO public.draw_entries (id,organisation,bookings,groups,payment,amount,notes)
      SELECT ${e.id}::uuid,${e.organisation},${e.bookings},${JSON.stringify(e.groups)}::jsonb,${e.payment},${e.amount},${e.notes}
      WHERE NOT EXISTS (SELECT 1 FROM public.app_migrations WHERE name=${name})
      ON CONFLICT (id) DO NOTHING`),
    sql`INSERT INTO public.app_migrations (name) VALUES (${name}) ON CONFLICT (name) DO NOTHING`
  ]);
  console.log('Initial bookings seeded (or already seeded). Existing edits preserved.');
} catch {
  console.error('Seed failed. Check DATABASE_URL and run npm run db:migrate first.');
  process.exitCode=1;
}
