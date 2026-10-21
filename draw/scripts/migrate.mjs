import {readFile} from 'node:fs/promises';
import {neon} from '@neondatabase/serverless';
import {loadEnvironment} from './env.mjs';
try {
  loadEnvironment();
  const sql=neon(process.env.DATABASE_URL);
  const source=await readFile(new URL('../db/schema.sql',import.meta.url),'utf8');
  const statements=source.split('-- statement-break').map(s=>s.trim()).filter(Boolean);
  await sql.transaction(statements.map(s=>sql.query(s)));
  console.log('Neon schema ready. Next: npm run db:seed');
} catch(error) {
  console.error('Migration failed. Check DATABASE_URL, connectivity, and database permissions.');
  if(!process.env.DATABASE_URL)console.error(error.message);
  process.exitCode=1;
}
