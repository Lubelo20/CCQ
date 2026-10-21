/** Neon is loaded only when configured, so local development has no install dependency. */
export async function createRepository(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) throw new Error('DATABASE_URL is required.');
  const { neon } = await import('@neondatabase/serverless');
  const sql = neon(connectionString);
  const normalize = row => ({ ...row, amount: row.amount === null ? null : Number(row.amount), updated_at: new Date(row.updated_at).toISOString() });
  return {
    async list() {
      return (await sql`SELECT * FROM public.draw_entries ORDER BY organisation ASC`).map(normalize);
    },
    async save(entry, id = null, version = null) {
      const { organisation, bookings, groups, payment, amount, notes } = entry;
      const data = JSON.stringify(groups);
      const rows = id
        ? await sql`UPDATE public.draw_entries SET organisation=${organisation}, bookings=${bookings}, groups=${data}::jsonb,
            payment=${payment}, amount=${amount}, notes=${notes}, updated_at=GREATEST(now(),updated_at + interval '1 millisecond')
            WHERE id=${id}::uuid AND (${version}::timestamptz IS NULL OR date_trunc('milliseconds',updated_at)=${version}::timestamptz) RETURNING *`
        : await sql`INSERT INTO public.draw_entries (organisation,bookings,groups,payment,amount,notes)
            VALUES (${organisation},${bookings},${data}::jsonb,${payment},${amount},${notes}) RETURNING *`;
      if (!rows.length && id && version && (await sql`SELECT id FROM public.draw_entries WHERE id=${id}::uuid`).length) {
        throw Object.assign(new Error('stale entry'), { code: 'STALE_ENTRY' });
      }
      return rows.length ? normalize(rows[0]) : null;
    },
    // Flips one golfer's attendance inside the groups JSON in a single statement; updated_at is left alone so open editors stay valid.
    async attend(id, group, player, attended) {
      const rows = await sql`UPDATE public.draw_entries SET groups = jsonb_set(groups, ARRAY[${group}::int::text, 'attended'],
          jsonb_set(COALESCE(groups->${group}::int->'attended', '[false,false,false,false]'::jsonb), ARRAY[${player}::int::text], to_jsonb(${attended}::boolean)))
        WHERE id=${id}::uuid AND ${group}::int < bookings RETURNING *`;
      return rows.length ? normalize(rows[0]) : null;
    },
    async remove(id, version = null) {
      const rows = await sql`DELETE FROM public.draw_entries WHERE id=${id}::uuid
        AND (${version}::timestamptz IS NULL OR date_trunc('milliseconds',updated_at)=${version}::timestamptz) RETURNING id`;
      if (!rows.length && version && (await sql`SELECT id FROM public.draw_entries WHERE id=${id}::uuid`).length) {
        throw Object.assign(new Error('stale entry'), { code: 'STALE_ENTRY' });
      }
      return rows.length > 0;
    }
  };
}
