import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const PROD_PROJECT_REF = 'cqzwyckbhqfpgtbtizkr';

function loadEnv(name) {
  const path = resolve(process.cwd(), name);
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 0) continue;
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

function refFromUrl(url) {
  const m = String(url || '').match(/https:\/\/([^.]+)\.supabase\.co/i);
  return m ? m[1] : null;
}

const env = { ...loadEnv('.env'), ...loadEnv('.env.local'), ...loadEnv('.env.staging') };
const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL || '';
const ref = refFromUrl(url);
console.log(
  JSON.stringify(
    {
      hasUrl: Boolean(url),
      projectRef: ref,
      isKnownProdRef: ref === PROD_PROJECT_REF,
      stagingLikely: ref && ref !== PROD_PROJECT_REF,
    },
    null,
    2,
  ),
);
