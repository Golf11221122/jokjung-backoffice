-- JOKJUNG KPI & TARGET MANAGEMENT V1
-- Admin-only target editing, Back Office read access
create table if not exists public.backoffice_kpi_targets (
 id uuid primary key default gen_random_uuid(), branch_id uuid not null references public.branches(id) on delete cascade,
 kpi_code text not null, kpi_name text not null, category text not null,
 period_type text not null check(period_type in ('daily','weekly','monthly','quarterly','yearly')),
 period_start date not null, period_end date not null, target_value numeric not null,
 unit text not null check(unit in ('THB','PERCENT','COUNT','RATIO')),
 direction text not null check(direction in ('higher_better','lower_better','target_range')),
 warning_tolerance numeric not null default 10, target_min numeric, target_max numeric,
 is_active boolean not null default true, note text, created_by uuid references auth.users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(branch_id,kpi_code,period_type,period_start)
);
create index if not exists bo_kpi_target_lookup on public.backoffice_kpi_targets(branch_id,period_start,period_end,kpi_code) where is_active;
alter table public.backoffice_kpi_targets enable row level security;
revoke all on public.backoffice_kpi_targets from anon,authenticated;

create or replace function public.backoffice_kpi_targets_list_v1(p_period_start date default null,p_period_end date default null)
returns setof public.backoffice_kpi_targets language plpgsql security definer set search_path=public as $$
declare v_branch uuid; begin select x.branch_id into v_branch from public._bo_ctx() x; if v_branch is null then raise exception 'BACKOFFICE_PERMISSION_DENIED'; end if;
return query select t.* from public.backoffice_kpi_targets t where t.branch_id=v_branch and t.is_active and (p_period_start is null or t.period_end>=p_period_start) and (p_period_end is null or t.period_start<=p_period_end) order by t.category,t.kpi_name,t.period_start desc; end $$;

create or replace function public.backoffice_kpi_target_upsert_v1(p_kpi_code text,p_kpi_name text,p_category text,p_period_type text,p_period_start date,p_period_end date,p_target_value numeric,p_unit text,p_direction text,p_warning_tolerance numeric default 10,p_target_min numeric default null,p_target_max numeric default null,p_note text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_branch uuid; v_id uuid; v_role text; begin
select x.branch_id into v_branch from public._bo_ctx() x; select role into v_role from public.profiles where id=auth.uid(); if v_branch is null or lower(coalesce(v_role,''))<>'admin' then raise exception 'KPI_ADMIN_ONLY'; end if;
if p_period_end<p_period_start then raise exception 'INVALID_PERIOD'; end if;
insert into public.backoffice_kpi_targets(branch_id,kpi_code,kpi_name,category,period_type,period_start,period_end,target_value,unit,direction,warning_tolerance,target_min,target_max,note,created_by,updated_at)
values(v_branch,upper(trim(p_kpi_code)),trim(p_kpi_name),trim(p_category),p_period_type,p_period_start,p_period_end,p_target_value,p_unit,p_direction,coalesce(p_warning_tolerance,10),p_target_min,p_target_max,nullif(trim(p_note),''),auth.uid(),now())
on conflict(branch_id,kpi_code,period_type,period_start) do update set kpi_name=excluded.kpi_name,category=excluded.category,period_end=excluded.period_end,target_value=excluded.target_value,unit=excluded.unit,direction=excluded.direction,warning_tolerance=excluded.warning_tolerance,target_min=excluded.target_min,target_max=excluded.target_max,note=excluded.note,updated_at=now() returning id into v_id; return v_id; end $$;

create or replace function public.backoffice_kpi_target_delete_v1(p_id uuid) returns boolean language plpgsql security definer set search_path=public as $$ declare v_branch uuid; v_role text; begin select x.branch_id into v_branch from public._bo_ctx() x; select role into v_role from public.profiles where id=auth.uid(); if v_branch is null or lower(coalesce(v_role,''))<>'admin' then raise exception 'KPI_ADMIN_ONLY'; end if; update public.backoffice_kpi_targets set is_active=false,updated_at=now() where id=p_id and branch_id=v_branch; return found; end $$;

revoke all on function public.backoffice_kpi_targets_list_v1(date,date) from public;
revoke all on function public.backoffice_kpi_target_upsert_v1(text,text,text,text,date,date,numeric,text,text,numeric,numeric,numeric,text) from public;
revoke all on function public.backoffice_kpi_target_delete_v1(uuid) from public;
grant execute on function public.backoffice_kpi_targets_list_v1(date,date) to authenticated;
grant execute on function public.backoffice_kpi_target_upsert_v1(text,text,text,text,date,date,numeric,text,text,numeric,numeric,numeric,text) to authenticated;
grant execute on function public.backoffice_kpi_target_delete_v1(uuid) to authenticated;

-- Suggested starter KPI definitions are UI presets only; no targets are forced into the database.
