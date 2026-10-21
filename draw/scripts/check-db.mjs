import {createRepository} from '../lib/database.js';
import {loadEnvironment} from './env.mjs';
try {
  loadEnvironment();
  const entries=await (await createRepository()).list();
  console.log(`Neon connection OK: ${entries.length} organisations, ${entries.reduce((n,e)=>n+e.bookings,0)} groups.`);
} catch {
  console.error('Database check failed. Verify DATABASE_URL and run the migration.');
  process.exitCode=1;
}
