-- Run once in Supabase Dashboard -> SQL Editor.
-- Replace CHANGE_ME_ADMIN_PASSWORD below with your new admin password before running.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.admin_settings (
  id int primary key default 1 check (id = 1),
  password_hash text not null
);
alter table public.admin_settings enable row level security;
revoke all on table public.admin_settings from anon, authenticated;

insert into public.admin_settings (id, password_hash)
values (1, extensions.crypt('manager@mx!d26', extensions.gen_salt('bf')))
on conflict (id) do update set password_hash = excluded.password_hash;

alter table public.tokens enable row level security;
revoke all on table public.tokens from anon, authenticated;

create or replace function public.is_admin(p_password text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admin_settings
    where id = 1 and password_hash = extensions.crypt(coalesce(p_password, ''), password_hash)
  );
$$;

create or replace function public.check_token(p_token text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (select 1 from public.tokens where token = p_token);
$$;

create or replace function public.admin_verify(p_password text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin(p_password) then
    perform pg_sleep(1);
    return false;
  end if;
  return true;
end;
$$;

create or replace function public.admin_list_tokens(p_password text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin(p_password) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  return coalesce(
    (select jsonb_agg(jsonb_build_object('token', t.token, 'mobile', coalesce(t.mobile, '')) order by t.id desc)
     from public.tokens t),
    '[]'::jsonb
  );
end;
$$;

create or replace function public.admin_add_token(p_password text, p_token text, p_mobile text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin(p_password) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  if coalesce(trim(p_token), '') = '' then
    return 'empty';
  end if;
  if exists (select 1 from public.tokens where token = p_token) then
    return 'exists';
  end if;
  insert into public.tokens (token, mobile) values (p_token, coalesce(p_mobile, ''));
  return 'ok';
exception when unique_violation then
  return 'exists';
end;
$$;

create or replace function public.admin_remove_token(p_password text, p_token text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin(p_password) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  delete from public.tokens where token = p_token;
  return true;
end;
$$;

revoke all on function public.is_admin(text) from public, anon, authenticated;
revoke all on function public.check_token(text) from public;
revoke all on function public.admin_verify(text) from public;
revoke all on function public.admin_list_tokens(text) from public;
revoke all on function public.admin_add_token(text, text, text) from public;
revoke all on function public.admin_remove_token(text, text) from public;
grant execute on function public.check_token(text) to anon, authenticated;
grant execute on function public.admin_verify(text) to anon, authenticated;
grant execute on function public.admin_list_tokens(text) to anon, authenticated;
grant execute on function public.admin_add_token(text, text, text) to anon, authenticated;
grant execute on function public.admin_remove_token(text, text) to anon, authenticated;
