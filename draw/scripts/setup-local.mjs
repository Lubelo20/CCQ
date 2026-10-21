import { writeFile, access } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
export async function setupLocal() {
  if (process.env.VERCEL || process.env.DATABASE_URL || process.env.STORAGE) return false;
  try { await access('.env.local'); return false; } catch (e) { if (e.code !== 'ENOENT') throw e; }
  const content = `# Local development only. Keep this file private.\nSTORAGE=local\nADMIN_PASSWORD=${randomBytes(18).toString('base64url')}\nSESSION_SECRET=${randomBytes(32).toString('hex')}\nPORT=3000\n`;
  try { await writeFile('.env.local', content, { flag: 'wx', mode: 0o600 }); }
  catch (e) { if (e.code === 'EEXIST') return false; throw e; }
  console.log('Created private .env.local with random organiser credentials.');
  return true;
}
if (typeof process !== 'undefined' && process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await setupLocal();
