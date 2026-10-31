/**
 * Apply LM-03 migration in a single transaction via postgres URI.
 * Requires: LM03_DATABASE_URL (session only), pg/psql in PATH or npm pg.
 */
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import pg from 'pg';

const EXPECTED_REF = 'cqzwyckbhqfpgtbtizkr';
const url = process.env.LM03_DATABASE_URL || process.env.DATABASE_URL || '';

if (!url || !url.includes(EXPECTED_REF)) {
  console.error(JSON.stringify({ error: 'missing_or_invalid_LM03_DATABASE_URL', expectedRef: EXPECTED_REF }));
  process.exit(2);
}

const sqlPath = resolve(process.cwd(), 'supabase/migration_lm03_user_role_admin.sql');
const migration = readFileSync(sqlPath, 'utf8');
const wrapped = `BEGIN;\n${migration}\nCOMMIT;\n`;

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
try {
  await client.connect();
  await client.query(wrapped);
  const checks = await client.query(`
    select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and proname in ('admin_update_user_role','is_lm_role_manager');
  `);
  const log = await client.query(`select to_regclass('public.user_role_change_log') as t;`);
  const roles = await client.query(`select role, count(*)::int c from public.user_profiles group by role order by role;`);
  console.log(
    JSON.stringify(
      {
        ok: true,
        functions: checks.rows.map((r) => r.proname),
        auditTable: log.rows[0]?.t,
        roleDistribution: Object.fromEntries(roles.rows.map((r) => [r.role, r.c])),
      },
      null,
      2,
    ),
  );
} catch (e) {
  console.error(JSON.stringify({ ok: false, error: e.message }));
  process.exit(1);
} finally {
  await client.end();
}
