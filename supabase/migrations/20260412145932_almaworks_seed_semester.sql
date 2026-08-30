-- Seed the Spring 2026 semester so outreach/mentor rows have a valid FK.
INSERT INTO public.semesters (id, name, start_date, end_date, is_active)
VALUES ('00000000-0000-0000-0000-000000000001', 'Spring 2026', '2026-01-15', '2026-05-15', true)
ON CONFLICT DO NOTHING;;
