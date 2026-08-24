-- =========================================================
-- JOKJUNG CASH FLOW / PAYMENT FORECAST V1.9
-- Forecast เงินจ่าย Supplier จาก AP + แผนจ่าย
-- =========================================================

begin;

create table if not exists public.ap_payment_plans (
    id uuid primary key default gen_random_uuid(),
    branch_id uuid not null references public.branches(id) on delete cascade,
    purchase_document_id uuid not null references public.purchase_documents(id) on delete cascade,
    planned_date date not null,
    planned_amount numeric(14,2) not null check (planned_amount > 0),
    status text not null default 'planned'
        check (status in ('planned','completed','cancelled')),
    note text,
    created_by uuid references public.profiles(id) on delete set null,
    completed_by uuid references public.profiles(id) on delete set null,
    created_at timestamptz not null default now(),
    completed_at timestamptz,
    updated_at timestamptz not null default now()
);

create index if not exists idx_ap_payment_plans_branch_date
on public.ap_payment_plans(branch_id,planned_date,status);

create index if not exists idx_ap_payment_plans_document
on public.ap_payment_plans(purchase_document_id,status);

alter table public.ap_payment_plans enable row level security;

drop policy if exists ap_payment_plans_read on public.ap_payment_plans;
create policy ap_payment_plans_read
on public.ap_payment_plans
for select to authenticated
using (
    exists(
        select 1 from public.profiles p
        where p.id=auth.uid()
          and p.branch_id=ap_payment_plans.branch_id
          and lower(trim(coalesce(p.role,''))) in ('admin','manager')
    )
);

-- ---------------------------------------------------------
-- Forecast summary
-- ---------------------------------------------------------
create or replace function public.backoffice_payment_forecast_summary_v19()
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
    v_branch uuid;
    v_result jsonb;
begin
    select x.branch_id into v_branch from public._bo_ctx() x;
    if v_branch is null then raise exception 'BACKOFFICE_PERMISSION_DENIED'; end if;

    select jsonb_build_object(
        'open_ap',coalesce(sum(greatest(d.total_amount-d.paid_amount,0))
            filter(where d.payment_status not in ('paid','void')),0),
        'overdue',coalesce(sum(greatest(d.total_amount-d.paid_amount,0))
            filter(where d.payment_status not in ('paid','void') and d.due_date<current_date),0),
        'due_today',coalesce(sum(greatest(d.total_amount-d.paid_amount,0))
            filter(where d.payment_status not in ('paid','void') and d.due_date=current_date),0),
        'due_7',coalesce(sum(greatest(d.total_amount-d.paid_amount,0))
            filter(where d.payment_status not in ('paid','void') and d.due_date between current_date and current_date+7),0),
        'due_30',coalesce(sum(greatest(d.total_amount-d.paid_amount,0))
            filter(where d.payment_status not in ('paid','void') and d.due_date between current_date and current_date+30),0),
        'approved_open',coalesce(sum(greatest(d.total_amount-d.paid_amount,0))
            filter(where d.payment_status not in ('paid','void') and d.ap_approval_status='approved'),0),
        'planned_7',coalesce((
            select sum(p.planned_amount)
            from public.ap_payment_plans p
            where p.branch_id=v_branch
              and p.status='planned'
              and p.planned_date between current_date and current_date+7
        ),0),
        'planned_30',coalesce((
            select sum(p.planned_amount)
            from public.ap_payment_plans p
            where p.branch_id=v_branch
              and p.status='planned'
              and p.planned_date between current_date and current_date+30
        ),0)
    )
    into v_result
    from public.purchase_documents d
    where d.branch_id=v_branch;

    return v_result;
end
$$;

-- ---------------------------------------------------------
-- Upcoming AP obligations
-- ---------------------------------------------------------
create or replace function public.backoffice_payment_forecast_items_v19(
    p_from date default null,
    p_to date default null,
    p_supplier_id uuid default null
)
returns table(
    document_id uuid,
    internal_no text,
    document_no text,
    supplier_id uuid,
    supplier_name text,
    po_no text,
    due_date date,
    total_amount numeric,
    paid_amount numeric,
    balance_due numeric,
    approval_status text,
    payment_status text,
    three_way_status text,
    planned_amount numeric,
    planned_date date,
    days_to_due integer,
    urgency text
)
language plpgsql
security definer
set search_path=public
as $$
declare
    v_branch uuid;
begin
    select x.branch_id into v_branch from public._bo_ctx() x;
    if v_branch is null then raise exception 'BACKOFFICE_PERMISSION_DENIED'; end if;

    return query
    select
        d.id,
        d.internal_no,
        d.document_no,
        d.supplier_id,
        s.name,
        po.po_no,
        d.due_date,
        d.total_amount,
        d.paid_amount,
        greatest(d.total_amount-d.paid_amount,0)::numeric,
        d.ap_approval_status,
        d.payment_status,
        (tw.j->>'status')::text,
        coalesce((
            select sum(pp.planned_amount)
            from public.ap_payment_plans pp
            where pp.purchase_document_id=d.id
              and pp.status='planned'
        ),0)::numeric,
        (
            select min(pp.planned_date)
            from public.ap_payment_plans pp
            where pp.purchase_document_id=d.id
              and pp.status='planned'
        ),
        case when d.due_date is null then null else (d.due_date-current_date)::integer end,
        case
            when d.due_date is null then 'no_due_date'
            when d.due_date<current_date then 'overdue'
            when d.due_date=current_date then 'today'
            when d.due_date<=current_date+7 then 'due_7'
            when d.due_date<=current_date+30 then 'due_30'
            else 'future'
        end::text
    from public.purchase_documents d
    left join public.suppliers s on s.id=d.supplier_id
    left join public.purchase_orders po on po.id=d.purchase_order_id
    cross join lateral (
        select public._bo_purchase_three_way_v16(d.id,1,0.0001) j
    ) tw
    where d.branch_id=v_branch
      and d.payment_status not in ('paid','void')
      and greatest(d.total_amount-d.paid_amount,0)>0
      and (p_from is null or d.due_date is null or d.due_date>=p_from)
      and (p_to is null or d.due_date is null or d.due_date<=p_to)
      and (p_supplier_id is null or d.supplier_id=p_supplier_id)
    order by
        case
            when d.due_date is null then 9
            when d.due_date<current_date then 0
            when d.due_date=current_date then 1
            when d.due_date<=current_date+7 then 2
            when d.due_date<=current_date+30 then 3
            else 4
        end,
        d.due_date nulls last,
        s.name;
end
$$;

-- ---------------------------------------------------------
-- Daily forecast buckets
-- ---------------------------------------------------------
create or replace function public.backoffice_payment_forecast_daily_v19(
    p_days integer default 30
)
returns table(
    forecast_date date,
    due_amount numeric,
    planned_amount numeric
)
language plpgsql
security definer
set search_path=public
as $$
declare
    v_branch uuid;
    v_days integer := greatest(1,least(coalesce(p_days,30),365));
begin
    select x.branch_id into v_branch from public._bo_ctx() x;
    if v_branch is null then raise exception 'BACKOFFICE_PERMISSION_DENIED'; end if;

    return query
    with dates as (
        select generate_series(current_date,current_date+v_days,interval '1 day')::date d
    ),
    due as (
        select d.due_date d,sum(greatest(d.total_amount-d.paid_amount,0)) amount
        from public.purchase_documents d
        where d.branch_id=v_branch
          and d.payment_status not in ('paid','void')
          and d.due_date between current_date and current_date+v_days
        group by d.due_date
    ),
    planned as (
        select p.planned_date d,sum(p.planned_amount) amount
        from public.ap_payment_plans p
        where p.branch_id=v_branch
          and p.status='planned'
          and p.planned_date between current_date and current_date+v_days
        group by p.planned_date
    )
    select dates.d,
           coalesce(due.amount,0)::numeric,
           coalesce(planned.amount,0)::numeric
    from dates
    left join due on due.d=dates.d
    left join planned on planned.d=dates.d
    order by dates.d;
end
$$;

-- ---------------------------------------------------------
-- Save / replace payment plan for an AP document
-- one active plan per document for simplicity
-- ---------------------------------------------------------
create or replace function public.backoffice_save_payment_plan_v19(
    p_document_id uuid,
    p_planned_date date,
    p_planned_amount numeric,
    p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
    v_user uuid;
    v_branch uuid;
    v_role text;
    v_balance numeric;
    v_id uuid;
begin
    select x.user_id,x.branch_id,x.role
    into v_user,v_branch,v_role
    from public._bo_ctx() x;

    if v_branch is null then raise exception 'BACKOFFICE_PERMISSION_DENIED'; end if;
    if lower(trim(coalesce(v_role,''))) not in ('admin','manager') then
        raise exception 'BACKOFFICE_PERMISSION_DENIED';
    end if;
    if p_planned_date is null then raise exception 'PLANNED_DATE_REQUIRED'; end if;
    if coalesce(p_planned_amount,0)<=0 then raise exception 'INVALID_PLANNED_AMOUNT'; end if;

    select greatest(total_amount-paid_amount,0)
    into v_balance
    from public.purchase_documents
    where id=p_document_id
      and branch_id=v_branch
      and payment_status not in ('paid','void');

    if v_balance is null then raise exception 'AP_DOCUMENT_NOT_FOUND'; end if;
    if p_planned_amount>v_balance+0.01 then raise exception 'PLAN_EXCEEDS_BALANCE'; end if;

    update public.ap_payment_plans
    set status='cancelled',updated_at=now()
    where branch_id=v_branch
      and purchase_document_id=p_document_id
      and status='planned';

    insert into public.ap_payment_plans(
        branch_id,purchase_document_id,planned_date,planned_amount,note,created_by
    )
    values(
        v_branch,p_document_id,p_planned_date,p_planned_amount,
        nullif(trim(coalesce(p_note,'')),''),
        v_user
    )
    returning id into v_id;

    return v_id;
end
$$;

create or replace function public.backoffice_cancel_payment_plan_v19(
    p_document_id uuid
)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare
    v_branch uuid;
begin
    select x.branch_id into v_branch from public._bo_ctx() x;
    if v_branch is null then raise exception 'BACKOFFICE_PERMISSION_DENIED'; end if;

    update public.ap_payment_plans
    set status='cancelled',updated_at=now()
    where branch_id=v_branch
      and purchase_document_id=p_document_id
      and status='planned';

    return true;
end
$$;

revoke all on function public.backoffice_payment_forecast_summary_v19() from public;
revoke all on function public.backoffice_payment_forecast_items_v19(date,date,uuid) from public;
revoke all on function public.backoffice_payment_forecast_daily_v19(integer) from public;
revoke all on function public.backoffice_save_payment_plan_v19(uuid,date,numeric,text) from public;
revoke all on function public.backoffice_cancel_payment_plan_v19(uuid) from public;

grant execute on function public.backoffice_payment_forecast_summary_v19() to authenticated;
grant execute on function public.backoffice_payment_forecast_items_v19(date,date,uuid) to authenticated;
grant execute on function public.backoffice_payment_forecast_daily_v19(integer) to authenticated;
grant execute on function public.backoffice_save_payment_plan_v19(uuid,date,numeric,text) to authenticated;
grant execute on function public.backoffice_cancel_payment_plan_v19(uuid) to authenticated;

commit;

select 'JOKJUNG PAYMENT FORECAST V1.9 READY' as result;
