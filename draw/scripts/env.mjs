export function loadEnvironment() {
  try { process.loadEnvFile('.env.local'); } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (!process.env.DATABASE_URL || process.env.DATABASE_URL.includes('YOUR-ENDPOINT')) {
    throw new Error('Set your Neon DATABASE_URL in .env.local or the environment first.');
  }
}
