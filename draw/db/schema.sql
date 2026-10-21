CREATE TABLE IF NOT EXISTS public.app_migrations (
  name text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
-- statement-break
CREATE TABLE IF NOT EXISTS public.draw_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation text NOT NULL CHECK (length(organisation) BETWEEN 1 AND 160),
  bookings integer NOT NULL CHECK (bookings BETWEEN 1 AND 8),
  groups jsonb NOT NULL CHECK (jsonb_typeof(groups) = 'array' AND jsonb_array_length(groups) = bookings),
  payment text NOT NULL DEFAULT 'pending' CHECK (payment IN ('paid','pending','awaiting','invoice-details')),
  amount numeric(12,2) CHECK (amount >= 0 AND amount <= 100000000),
  notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 2000),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- statement-break
-- A primary key makes tee reservations safe even under concurrent saves.
CREATE TABLE IF NOT EXISTS public.draw_tee_assignments (
  tee text PRIMARY KEY CHECK (tee ~ '^([1-9]|1[0-8])[AB]?(@([01][0-9]|2[0-3]):[0-5][0-9])?$'),
  entry_id uuid NOT NULL REFERENCES public.draw_entries(id) ON DELETE CASCADE
);
-- statement-break
-- Reservations are a hole plus an optional tee time ("10@11:20"); widen the check on databases created before tee times.
ALTER TABLE public.draw_tee_assignments DROP CONSTRAINT IF EXISTS draw_tee_assignments_tee_check;
-- statement-break
ALTER TABLE public.draw_tee_assignments ADD CONSTRAINT draw_tee_assignments_tee_check CHECK (tee ~ '^([1-9]|1[0-8])[AB]?(@([01][0-9]|2[0-3]):[0-5][0-9])?$');
-- statement-break
CREATE OR REPLACE FUNCTION public.sync_draw_tees() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  DELETE FROM public.draw_tee_assignments WHERE entry_id = NEW.id;
  INSERT INTO public.draw_tee_assignments (tee, entry_id)
    SELECT item->>'tee' || CASE WHEN COALESCE(item->>'time','') <> '' THEN '@' || (item->>'time') ELSE '' END, NEW.id FROM jsonb_array_elements(NEW.groups) item
    WHERE COALESCE(item->>'tee','') <> '';
  RETURN NEW;
END;
$$;
-- statement-break
DROP TRIGGER IF EXISTS draw_tee_sync ON public.draw_entries;
-- statement-break
CREATE TRIGGER draw_tee_sync AFTER INSERT OR UPDATE OF groups ON public.draw_entries
  FOR EACH ROW EXECUTE FUNCTION public.sync_draw_tees();
-- statement-break
-- Rebuild reservations inside the migration transaction; duplicates abort it.
DELETE FROM public.draw_tee_assignments;
-- statement-break
INSERT INTO public.draw_tee_assignments (tee, entry_id)
  SELECT item->>'tee' || CASE WHEN COALESCE(item->>'time','') <> '' THEN '@' || (item->>'time') ELSE '' END, e.id FROM public.draw_entries e, jsonb_array_elements(e.groups) item
 WHERE COALESCE(item->>'tee','') <> '';
