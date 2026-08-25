-- =========================================================
-- JOKJUNG BANK & CASH RECONCILIATION V2.1
-- กระทบยอด POS กับเงินจริง / เงินเข้าธนาคาร
--
-- ตัวอย่าง QR:
-- POS QR       = 5,000
-- Bank Credit  = 4,985
-- Fee          = 15
-- Difference   = 4,985 + 15 - 5,000 = 0  => MATCHED
--
-- ตัวอย่าง Cash:
-- POS Cash     = 3,000
-- Counted Cash = 2,950
-- Difference   = 2,950 - 3,000 = -50 => SHORT
-- =========================================================

begin;

create table if not exists public.payment_channel_reconciliations (
    id uuid primary key default gen_random_uuid(),
    branch_id uuid not null references public.branches(id) on delete cascade,
    recon_date date not null,
    payment_channel text not null
        check (payment_channel in ('cash','qr','bank_transfer','card','other')),

    expected_amount numeric(14,2) not null default 0,
    actual_amount numeric(14,2) not null default 0,
    fee_amount numeric(14,2) not null default 0 check (fee_amount >= 0),
    adjustment_amount numeric(14,2) not null default 0,

    difference_amount numeric(14,2) generated always as (
        round(actual_amount + fee_amount + adjustment_amount - expected_amount, 2)
    ) stored,

    reference_no text,
    note text,

    created_by uuid references public.profiles(id) on delete set null,
    updated_by uuid references public.profiles(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    unique(branch_id,recon_date,payment_channel)
);

create index if not exists idx_payment_channel_recon_branch_date
on public.payment_channel_reconciliations(branch_id,recon_date desc);

alter table public.payment_channel_reconciliations enable row level security;

drop policy if exists payment_channel_reconciliations_read on public.payment_channel_reconciliations;
create policy payment_channel_reconciliations_read
on public.payment_channel_reconciliations
for select to authenticated
using (
    exists(
        select 1
        from public.profiles p
        where p.id=auth.uid()
          and p.branch_id=payment_channel_reconciliations.branch_id
          and lower(trim(coalesce(p.role,''))) in ('admin','manager')
    )
);

-- ---------------------------------------------------------
-- Expected payment by sales date
-- ---------------------------------------------------------
create or replace function public.backoffice_bank_cash_reconciliation_v21(
    p_date_from date,
    p_date_to date
)
returns table(
    recon_date date,
    payment_channel text,
    expected_amount numeric,
    bill_count bigint,
    actual_amount numeric,
    fee_amount numeric,
    adjustment_amount numeric,
    difference_amount numeric,
    reference_no text,
    note text,
    saved boolean,
    status text
)
language plpgsql
security definer
set search_path=public
as $$
declare
    v_branch uuid;
begin
    select x.branch_id into v_branch from public._bo_ctx() x;

    if v_branch is null then
        raise exception 'BACKOFFICE_PERMISSION_DENIED';
    end if;

    if p_date_from is null or p_date_to is null or p_date_to < p_date_from then
        raise exception 'INVALID_DATE_RANGE';
    end if;

    return query
    with dates as (
        select generate_series(p_date_from,p_date_to,interval '1 day')::date d
    ),
    channels(channel) as (
        values
            ('cash'::text),
            ('qr'::text),
            ('bank_transfer'::text),
            ('card'::text),
            ('other'::text)
    ),
    sales_by_channel as (
        select
            s.created_at::date d,
            case
                when lower(coalesce(s.payment_method,''))='cash' then 'cash'
                when lower(coalesce(s.payment_method,''))='qr' then 'qr'
                when lower(coalesce(s.payment_method,'')) in ('bank_transfer','transfer') then 'bank_transfer'
                when lower(coalesce(s.payment_method,''))='card' then 'card'
                else 'other'
            end channel,
            sum(s.total)::numeric expected_amount,
            count(*)::bigint bill_count
        from public.sales s
        where s.branch_id=v_branch
          and s.created_at>=p_date_from::timestamptz
          and s.created_at<(p_date_to+1)::timestamptz
          and coalesce(s.status,'')<>'cancelled'
        group by
            s.created_at::date,
            case
                when lower(coalesce(s.payment_method,''))='cash' then 'cash'
                when lower(coalesce(s.payment_method,''))='qr' then 'qr'
                when lower(coalesce(s.payment_method,'')) in ('bank_transfer','transfer') then 'bank_transfer'
                when lower(coalesce(s.payment_method,''))='card' then 'card'
                else 'other'
            end
    )
    select
        d.d,
        c.channel,
        coalesce(s.expected_amount,0)::numeric,
        coalesce(s.bill_count,0)::bigint,
        coalesce(r.actual_amount,0)::numeric,
        coalesce(r.fee_amount,0)::numeric,
        coalesce(r.adjustment_amount,0)::numeric,
        case
            when r.id is null then null
            else r.difference_amount
        end::numeric,
        r.reference_no,
        r.note,
        (r.id is not null),
        case
            when r.id is null then 'pending'
            when abs(r.difference_amount)<=0.01 then 'matched'
            when r.difference_amount<0 then 'short'
            else 'over'
        end::text
    from dates d
    cross join channels c
    left join sales_by_channel s
      on s.d=d.d and s.channel=c.channel
    left join public.payment_channel_reconciliations r
      on r.branch_id=v_branch
     and r.recon_date=d.d
     and r.payment_channel=c.channel
    where coalesce(s.expected_amount,0)<>0
       or r.id is not null
    order by d.d desc,
        case c.channel
            when 'cash' then 1
            when 'qr' then 2
            when 'bank_transfer' then 3
            when 'card' then 4
            else 5
        end;
end
$$;

-- ---------------------------------------------------------
-- Save one date/channel reconciliation
-- Expected is re-read from POS on server.
-- ---------------------------------------------------------
create or replace function public.backoffice_save_bank_cash_reconciliation_v21(
    p_recon_date date,
    p_payment_channel text,
    p_actual_amount numeric,
    p_fee_amount numeric default 0,
    p_adjustment_amount numeric default 0,
    p_reference_no text default null,
    p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
    v_user uuid;
    v_branch uuid;
    v_role text;
    v_expected numeric:=0;
    v_id uuid;
    v_difference numeric;
begin
    select x.user_id,x.branch_id,x.role
    into v_user,v_branch,v_role
    from public._bo_ctx() x;

    if v_branch is null then raise exception 'BACKOFFICE_PERMISSION_DENIED'; end if;
    if lower(trim(coalesce(v_role,''))) not in ('admin','manager') then
        raise exception 'BACKOFFICE_PERMISSION_DENIED';
    end if;

    if p_recon_date is null then raise exception 'RECON_DATE_REQUIRED'; end if;
    if p_payment_channel not in ('cash','qr','bank_transfer','card','other') then
        raise exception 'INVALID_PAYMENT_CHANNEL';
    end if;
    if coalesce(p_actual_amount,0)<0 then raise exception 'INVALID_ACTUAL_AMOUNT'; end if;
    if coalesce(p_fee_amount,0)<0 then raise exception 'INVALID_FEE_AMOUNT'; end if;

    select coalesce(sum(s.total),0)
    into v_expected
    from public.sales s
    where s.branch_id=v_branch
      and s.created_at>=p_recon_date::timestamptz
      and s.created_at<(p_recon_date+1)::timestamptz
      and coalesce(s.status,'')<>'cancelled'
      and (
        (p_payment_channel='cash' and lower(coalesce(s.payment_method,''))='cash')
        or (p_payment_channel='qr' and lower(coalesce(s.payment_method,''))='qr')
        or (p_payment_channel='bank_transfer' and lower(coalesce(s.payment_method,'')) in ('bank_transfer','transfer'))
        or (p_payment_channel='card' and lower(coalesce(s.payment_method,''))='card')
        or (p_payment_channel='other' and lower(coalesce(s.payment_method,'')) not in ('cash','qr','bank_transfer','transfer','card'))
      );

    insert into public.payment_channel_reconciliations(
        branch_id,recon_date,payment_channel,
        expected_amount,actual_amount,fee_amount,adjustment_amount,
        reference_no,note,created_by,updated_by
    )
    values(
        v_branch,p_recon_date,p_payment_channel,
        round(v_expected,2),round(p_actual_amount,2),round(coalesce(p_fee_amount,0),2),
        round(coalesce(p_adjustment_amount,0),2),
        nullif(trim(coalesce(p_reference_no,'')),''),
        nullif(trim(coalesce(p_note,'')),''),
        v_user,v_user
    )
    on conflict(branch_id,recon_date,payment_channel)
    do update set
        expected_amount=excluded.expected_amount,
        actual_amount=excluded.actual_amount,
        fee_amount=excluded.fee_amount,
        adjustment_amount=excluded.adjustment_amount,
        reference_no=excluded.reference_no,
        note=excluded.note,
        updated_by=v_user,
        updated_at=now()
    returning id,difference_amount into v_id,v_difference;

    return jsonb_build_object(
        'id',v_id,
        'expected_amount',round(v_expected,2),
        'actual_amount',round(p_actual_amount,2),
        'fee_amount',round(coalesce(p_fee_amount,0),2),
        'adjustment_amount',round(coalesce(p_adjustment_amount,0),2),
        'difference_amount',v_difference,
        'status',case
            when abs(v_difference)<=0.01 then 'matched'
            when v_difference<0 then 'short'
            else 'over'
        end
    );
end
$$;

-- ---------------------------------------------------------
-- KPI summary
-- ---------------------------------------------------------
create or replace function public.backoffice_bank_cash_reconciliation_summary_v21(
    p_date_from date,
    p_date_to date
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
    v_branch uuid;
    v_expected numeric:=0;
    v_actual numeric:=0;
    v_fee numeric:=0;
    v_diff numeric:=0;
    v_matched bigint:=0;
    v_diff_count bigint:=0;
    v_pending bigint:=0;
begin
    select x.branch_id into v_branch from public._bo_ctx() x;
    if v_branch is null then raise exception 'BACKOFFICE_PERMISSION_DENIED'; end if;

    with x as (
        select *
        from public.backoffice_bank_cash_reconciliation_v21(p_date_from,p_date_to)
    )
    select
        coalesce(sum(expected_amount),0),
        coalesce(sum(actual_amount) filter(where saved),0),
        coalesce(sum(fee_amount) filter(where saved),0),
        coalesce(sum(difference_amount) filter(where saved),0),
        count(*) filter(where status='matched'),
        count(*) filter(where status in ('short','over')),
        count(*) filter(where status='pending')
    into v_expected,v_actual,v_fee,v_diff,v_matched,v_diff_count,v_pending
    from x;

    return jsonb_build_object(
        'expected_amount',round(v_expected,2),
        'actual_amount',round(v_actual,2),
        'fee_amount',round(v_fee,2),
        'difference_amount',round(v_diff,2),
        'matched_count',v_matched,
        'difference_count',v_diff_count,
        'pending_count',v_pending
    );
end
$$;

revoke all on function public.backoffice_bank_cash_reconciliation_v21(date,date) from public;
revoke all on function public.backoffice_save_bank_cash_reconciliation_v21(date,text,numeric,numeric,numeric,text,text) from public;
revoke all on function public.backoffice_bank_cash_reconciliation_summary_v21(date,date) from public;

grant execute on function public.backoffice_bank_cash_reconciliation_v21(date,date) to authenticated;
grant execute on function public.backoffice_save_bank_cash_reconciliation_v21(date,text,numeric,numeric,numeric,text,text) to authenticated;
grant execute on function public.backoffice_bank_cash_reconciliation_summary_v21(date,date) to authenticated;

commit;

select 'JOKJUNG BANK CASH RECONCILIATION V2.1 READY' as result;
