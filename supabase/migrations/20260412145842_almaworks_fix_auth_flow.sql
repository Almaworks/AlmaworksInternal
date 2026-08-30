ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS full_name text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending'::text
    CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text]));

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $function$
begin
  insert into public.profiles (id, email, role, status, full_name)
  values (
    new.id, new.email,
    coalesce((new.raw_user_meta_data->>'role')::public.user_role, 'startup'::public.user_role),
    'pending',
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name')
  );
  return new;
end;
$function$;;
