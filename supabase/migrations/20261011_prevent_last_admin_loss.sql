-- Last remaining active admin cannot be demoted or disabled, even by another
-- admin using a direct table update. Server APIs use the same rule.
--
-- Apply in the Supabase SQL editor (or `supabase db push` / migration runner)
-- against the production project. Safe to re-run.

create or replace function public.prevent_last_admin_loss()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (OLD.role = 'admin' and coalesce(OLD.status, 'active') = 'active')
     and not (NEW.role = 'admin' and coalesce(NEW.status, 'active') = 'active') then
    if not exists (
      select 1
        from public.profiles p
       where p.id <> OLD.id
         and p.role = 'admin'
         and coalesce(p.status, 'active') = 'active'
    ) then
      raise exception 'Cannot demote or disable the last remaining admin';
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists profiles_prevent_last_admin_loss on public.profiles;
create trigger profiles_prevent_last_admin_loss
  before update on public.profiles
  for each row
  execute function public.prevent_last_admin_loss();
