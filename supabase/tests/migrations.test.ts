import { PGlite } from '@electric-sql/pglite'
import { readFile, readdir } from 'node:fs/promises'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const database = new PGlite()
const owner = '11111111-1111-4111-8111-111111111111'
const stranger = '22222222-2222-4222-8222-222222222222'

beforeAll(async () => {
  await database.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    grant usage on schema auth to authenticated;
    grant execute on function auth.uid() to authenticated;
  `)
  const directory = new URL('../migrations/', import.meta.url)
  for (const filename of (await readdir(directory)).filter(name => name.endsWith('.sql')).sort()) {
    await database.exec(await readFile(new URL(filename, directory), 'utf8'))
  }
  await database.exec(await readFile(new URL('../seed.sql', import.meta.url), 'utf8'))
  await database.exec(`
    insert into auth.users values ('${owner}'), ('${stranger}');
    insert into private.owner(singleton,user_id) values (true,'${owner}');
    insert into public.profiles(id,display_name) values ('${owner}','Owner'), ('${stranger}','Stranger');
  `)
})
beforeEach(async () => { await database.exec('reset role'); await database.query("select set_config('request.jwt.claim.sub', $1, false)", [owner]) })
afterAll(async () => { await database.close() })

async function signIn(userId: string) { await database.query("select set_config('request.jwt.claim.sub', $1, false)", [userId]); await database.exec('set role authenticated') }

describe('actual PostgreSQL migrations and security', () => {
  it('applies every migration and loads exactly six active lessons', async () => {
    const result = await database.query<{ count: number }>('select count(*)::int as count from public.lessons')
    expect(result.rows[0].count).toBe(6)
  })
  it('denies unauthenticated table and owner-helper access', async () => {
    await database.exec('set role anon')
    await expect(database.query('select * from public.profiles')).rejects.toThrow(/permission denied/)
    await expect(database.query('select public.is_owner()')).rejects.toThrow(/permission denied/)
  })
  it('enables forced RLS and denies anonymous grants on every application table', async () => {
    const tables = await database.query<{ name: string; protected: boolean; anonymous: boolean }>(`select relname as name, relrowsecurity and relforcerowsecurity as protected,
      has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE') as anonymous
      from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'`)
    expect(tables.rows).toHaveLength(21)
    expect(tables.rows.every(table => table.protected && !table.anonymous)).toBe(true)
    await signIn(stranger)
    for (const table of tables.rows) expect((await database.query(`select * from public.${table.name}`)).rows).toHaveLength(0)
  })
  it('hides owner rows and rejects writes from an authenticated stranger', async () => {
    await signIn(stranger)
    expect((await database.query('select * from public.profiles')).rows).toHaveLength(0)
    await expect(database.query("insert into public.feature_records values ($1,'coding','workspace','{}',now())", [stranger])).rejects.toThrow(/row-level security/)
    await expect(database.query("select public.record_lesson_check('react-effects','[1,2]',1,$1,true)", [crypto.randomUUID()])).rejects.toThrow(/owner/)
    await expect(database.query("select public.consume_service_budget('mentor')")).rejects.toThrow(/Owner/)
  })
  it('allows only the owner’s profile and feature records', async () => {
    await signIn(owner)
    expect((await database.query('select * from public.profiles')).rows).toHaveLength(1)
    await database.query("insert into public.feature_records values ($1,'coding','workspace','{\"drafts\":{}}',now()) on conflict do nothing", [owner])
    expect((await database.query('select * from public.feature_records')).rows).toHaveLength(1)
    await expect(database.query("insert into public.feature_records values ($1,'coding','other','{}',now())", [stranger])).rejects.toThrow(/row-level security/)
  })
  it('atomically records checks, deduplicates retries, and rewards only the first completion', async () => {
    await signIn(owner)
    const firstId = crypto.randomUUID()
    await database.query("select public.record_lesson_check('react-effects','[1,2]',4,$1,true)", [firstId])
    await database.query("select public.record_lesson_check('react-effects','[1,2]',4,$1,true)", [firstId])
    await database.query("select public.record_lesson_check('react-effects','[1,2]',2,$1,true)", [crypto.randomUUID()])
    await database.query("select public.record_lesson_check('react-effects','[0,0]',1,$1,false)", [crypto.randomUUID()])
    const totals = await database.query<{ xp: number; count: number }>("select sum(xp)::int as xp,count(*)::int as count from public.learning_events where lesson_id='react-effects'")
    expect(totals.rows[0]).toEqual({ xp: 50, count: 3 })
    expect((await database.query<{ status: string }>("select status from public.lesson_progress where lesson_id='react-effects'")).rows[0].status).toBe('completed')
    await expect(database.query("select public.record_lesson_check('react-effects','[0,0]',4,$1,true)", [firstId])).rejects.toThrow(/different check/)
  })
  it('rolls back progress if an invalid event cannot be committed', async () => {
    await signIn(owner)
    await expect(database.query("select public.record_lesson_check('not-a-lesson','[1]',1,$1,true)", [crypto.randomUUID()])).rejects.toThrow()
    expect((await database.query("select * from public.lesson_progress where lesson_id='not-a-lesson'")).rows).toHaveLength(0)
  })
  it('enforces per-service request limits and denies private usage table access', async () => {
    await signIn(owner)
    for (let index = 0; index < 5; index += 1) expect((await database.query<{ allowed: boolean }>("select public.consume_service_budget('mentor') as allowed")).rows[0].allowed).toBe(true)
    expect((await database.query<{ allowed: boolean }>("select public.consume_service_budget('mentor') as allowed")).rows[0].allowed).toBe(false)
    expect((await database.query<{ allowed: boolean }>("select public.consume_service_budget('execute') as allowed")).rows[0].allowed).toBe(true)
    await expect(database.query('select * from private.service_usage')).rejects.toThrow(/permission denied/)
  })
  it('revocation immediately removes access even with the same session subject', async () => {
    await database.exec('delete from private.owner')
    await signIn(owner)
    expect((await database.query('select * from public.feature_records')).rows).toHaveLength(0)
    await expect(database.query("select public.record_lesson_check('react-effects','[1,2]',1,$1,true)", [crypto.randomUUID()])).rejects.toThrow(/owner/)
  })
})
