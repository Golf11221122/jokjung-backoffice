-- =========================================================
-- JOKJUNG ACCOUNTS PAYABLE V1.7
-- เจ้าหนี้การค้า / Approval / Payment Ledger / Aging
--
-- Flow:
-- Purchase Document -> 3-Way Match -> Approve -> Pay -> Paid
-- =========================================================

begin;

-- ---------------------------------------------------------
-- A) AP state on purchase document
-- ---------------------------------------------------------
alter table public.purchase_documents
    add column if not exists ap_approval_status text not null default 'pending',
    add column if not exists ap_approved_by uuid references public.profiles(id) on delete set null,
    add column if not exists ap_approved_at timestamptz,
    add column if not exists ap_hold_reason text,
    add column if not exists ap_baseline_paid_amount numeric(14,2) not null default 0
        check (ap_baseline_paid_amount >= 0);

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname='purchase_documents_ap_approval_status_check'
    ) then
        alter table public.purchase_documents
        add constraint purchase_documents_ap_approval_status_check
        check (ap_approval_status in ('pending','approved','hold','rejected'));
    end if;
end $$;

-- เก็บยอดจ่ายเดิมก่อนติดตั้ง AP เป็น baseline
update public.purchase_documents
set ap_baseline_paid_amount = paid_amount
where ap_baseline_paid_amount = 0
  and paid_amount > 0;

-- ---------------------------------------------------------
-- B) Payment ledger
-- ---------------------------------------------------------
create table if not exists public.accounts_payable_payments (
    id uuid primary key default gen_random_uuid(),
    branch_id uuid not null references public.branches(id) on delete cascade,
    purchase_document_id uuid not null references public.purchase_documents(id) on delete restrict,
    payment_date date not null,
    amount numeric(14,2) not null check (amount > 0),
    payment_method text not null
        check (payment_method in ('cash','bank_transfer','qr','card','credit','other')),
    reference_no text,
    note text,
    created_by uuid references public.profiles(id) on delete set null,
    created_at timestamptz not null default now(),

    reversed_at timestamptz,
    reversed_by uuid references public.profiles(id) on delete set null,
    reversal_reason text
);

create index if not exists idx_ap_payments_document
on public.accounts_payable_payments(purchase_document_id, payment_date, created_at);

create index if not exists idx_ap_payments_branch_date
on public.accounts_payable_payments(branch_id, payment_date desc);

alter table public.accounts_payable_payments enable row level security;

drop policy if exists ap_payments_read on public.accounts_payable_payments;
create policy ap_payments_read
on public.accounts_payable_payments
for select to authenticated
using (
    exists (
        select 1 from public.profiles p
        where p.id=auth.uid()
          and p.branch_id=accounts_payable_payments.branch_id
          and lower(trim(coalesce(p.role,''))) in ('admin','manager')
    )
);

-- ---------------------------------------------------------
-- C) Helper sync paid amount from baseline + active ledger
-- ---------------------------------------------------------
create or replace function public._bo_ap_sync_document_payment(
    p_document_id uuid
)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
    v_total numeric;
    v_baseline numeric;
    v_ledger numeric;
    v_paid numeric;
    v_last_method text;
    v_last_paid_at timestamptz;
begin
    select total_amount,ap_baseline_paid_amount
    into v_total,v_baseline
    from public.purchase_documents
    where id=p_document_id
    for update;

    if not found then raise exception 'PURCHASE_DOCUMENT_NOT_FOUND'; end if;

    select
        coalesce(sum(amount),0),
        (array_agg(payment_method order by payment_date desc,created_at desc))[1],
        max(created_at)
    into v_ledger,v_last_method,v_last_paid_at
    from public.accounts_payable_payments
    where purchase_document_id=p_document_id
      and reversed_at is null;

    v_paid := least(greatest(coalesce(v_baseline,0)+coalesce(v_ledger,0),0),v_total);

    update public.purchase_documents
    set paid_amount=v_paid,
        payment_status=
            case
                when payment_status='void' then 'void'
                when v_paid<=0 then 'unpaid'
                when v_paid>=v_total and v_total>0 then 'paid'
                else 'partial'
            end,
        payment_method=coalesce(v_last_method,payment_method),
        paid_at=case
            when v_paid>=v_total and v_total>0 then coalesce(v_last_paid_at,paid_at,now())
            else null
        end,
        updated_at=now()
    where id=p_document_id;
end
$$;

revoke all on function public._bo_ap_sync_document_payment(uuid) from public;

-- ---------------------------------------------------------
-- D) AP list + aging + 3-way
-- ---------------------------------------------------------
create or replace function public.backoffice_accounts_payable_v17(
    p_supplier_id uuid default null,
    p_approval_status text default null,
    p_payment_status text default null,
    p_due_filter text default null
)
returns table(
    document_id uuid,
    internal_no text,
    document_no text,
    document_type text,
    supplier_id uuid,
    supplier_name text,
    purchase_order_id uuid,
    po_no text,
    document_date date,
    due_date date,
    total_amount numeric,
    paid_amount numeric,
    balance_due numeric,
    payment_status text,
    approval_status text,
    three_way_status text,
    days_to_due integer,
    aging_bucket text,
    approved_at timestamptz
)
language plpgsql
security definer
set search_path=public
as $$
declare
    v_branch uuid;
begin
    select x.branch_id into v_branch
    from public._bo_ctx() x;

    if v_branch is null then raise exception 'BACKOFFICE_PERMISSION_DENIED'; end if;

    return query
    select
        d.id,
        d.internal_no,
        d.document_no,
        d.document_type,
        d.supplier_id,
        s.name,
        d.purchase_order_id,
        po.po_no,
        d.document_date,
        d.due_date,
        d.total_amount,
        d.paid_amount,
        greatest(d.total_amount-d.paid_amount,0)::numeric,
        d.payment_status,
        d.ap_approval_status,
        (tw.j->>'status')::text,
        case when d.due_date is null then null else (d.due_date-current_date)::integer end,
        case
            when d.payment_status='paid' then 'paid'
            when d.due_date is null then 'no_due_date'
            when d.due_date<current_date then 'overdue'
            when d.due_date<=current_date+7 then 'due_7'
            when d.due_date<=current_date+30 then 'due_30'
            else 'future'
        end::text,
        d.ap_approved_at
    from public.purchase_documents d
    left join public.suppliers s on s.id=d.supplier_id
    left join public.purchase_orders po on po.id=d.purchase_order_id
    cross join lateral (
        select public._bo_purchase_three_way_v16(d.id,1,0.0001) j
    ) tw
    where d.branch_id=v_branch
      and d.payment_status<>'void'
      and (p_supplier_id is null or d.supplier_id=p_supplier_id)
      and (p_approval_status is null or p_approval_status='' or d.ap_approval_status=p_approval_status)
      and (p_payment_status is null or p_payment_status='' or d.payment_status=p_payment_status)
      and (
        p_due_filter is null or p_due_filter='' or
        (p_due_filter='overdue' and d.payment_status<>'paid' and d.due_date<current_date) or
        (p_due_filter='due_7' and d.payment_status<>'paid' and d.due_date between current_date and current_date+7) or
        (p_due_filter='due_30' and d.payment_status<>'paid' and d.due_date between current_date and current_date+30) or
        (p_due_filter='no_due_date' and d.payment_status<>'paid' and d.due_date is null) or
        (p_due_filter='open' and d.payment_status<>'paid')
      )
    order by
        case when d.payment_status<>'paid' and d.due_date<current_date then 0 else 1 end,
        d.due_date nulls last,
        d.document_date desc;
end
$$;

-- ---------------------------------------------------------
-- E) AP dashboard
-- ---------------------------------------------------------
create or replace function public.backoffice_accounts_payable_summary_v17()
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
        'open_balance',coalesce(sum(greatest(total_amount-paid_amount,0))
            filter(where payment_status<>'paid' and payment_status<>'void'),0),
        'overdue_balance',coalesce(sum(greatest(total_amount-paid_amount,0))
            filter(where payment_status not in ('paid','void') and due_date<current_date),0),
        'due_7_balance',coalesce(sum(greatest(total_amount-paid_amount,0))
            filter(where payment_status not in ('paid','void')
                and due_date between current_date and current_date+7),0),
        'due_30_balance',coalesce(sum(greatest(total_amount-paid_amount,0))
            filter(where payment_status not in ('paid','void')
                and due_date between current_date and current_date+30),0),
        'approved_open_balance',coalesce(sum(greatest(total_amount-paid_amount,0))
            filter(where payment_status not in ('paid','void')
                and ap_approval_status='approved'),0),
        'pending_approval_count',count(*)
            filter(where payment_status not in ('paid','void')
                and ap_approval_status='pending'),
        'overdue_count',count(*)
            filter(where payment_status not in ('paid','void')
                and due_date<current_date)
    )
    into v_result
    from public.purchase_documents
    where branch_id=v_branch;

    return v_result;
end
$$;

-- ---------------------------------------------------------
-- F) Approve / Hold / Reject / Pending
-- Approval with PO requires 3-Way Match
-- ---------------------------------------------------------
create or replace function public.backoffice_set_ap_approval_v17(
    p_document_id uuid,
    p_status text,
    p_reason text default null
)
returns text
language plpgsql
security definer
set search_path=public
as $$
declare
    v_user uuid;
    v_branch uuid;
    v_role text;
    v_po uuid;
    v_three_way text;
begin
    select x.user_id,x.branch_id,x.role
    into v_user,v_branch,v_role
    from public._bo_ctx() x;

    if v_branch is null then raise exception 'BACKOFFICE_PERMISSION_DENIED'; end if;
    if lower(trim(coalesce(v_role,''))) not in ('admin','manager') then
        raise exception 'BACKOFFICE_PERMISSION_DENIED';
    end if;

    if p_status not in ('pending','approved','hold','rejected') then
        raise exception 'INVALID_AP_APPROVAL_STATUS';
    end if;

    select purchase_order_id into v_po
    from public.purchase_documents
    where id=p_document_id and branch_id=v_branch
    for update;

    if not found then raise exception 'PURCHASE_DOCUMENT_NOT_FOUND'; end if;

    if p_status='approved' and v_po is not null then
        v_three_way := public._bo_purchase_three_way_v16(
            p_document_id,1,0.0001
        )->>'status';

        if v_three_way<>'matched' then
            raise exception 'AP_3WAY_NOT_MATCHED:%',v_three_way;
        end if;
    end if;

    update public.purchase_documents
    set ap_approval_status=p_status,
        ap_approved_by=case when p_status='approved' then v_user else null end,
        ap_approved_at=case when p_status='approved' then now() else null end,
        ap_hold_reason=case
            when p_status in ('hold','rejected') then nullif(trim(coalesce(p_reason,'')),'')
            else null
        end,
        updated_at=now()
    where id=p_document_id and branch_id=v_branch;

    return p_status;
end
$$;

-- ---------------------------------------------------------
-- G) Record payment
-- ---------------------------------------------------------
create or replace function public.backoffice_record_ap_payment_v17(
    p_document_id uuid,
    p_payment_date date,
    p_amount numeric,
    p_payment_method text,
    p_reference_no text default null,
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
    v_total numeric;
    v_paid numeric;
    v_status text;
    v_approval text;
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

    if p_payment_date is null then raise exception 'PAYMENT_DATE_REQUIRED'; end if;
    if coalesce(p_amount,0)<=0 then raise exception 'INVALID_PAYMENT_AMOUNT'; end if;
    if p_payment_method not in ('cash','bank_transfer','qr','card','credit','other') then
        raise exception 'INVALID_PAYMENT_METHOD';
    end if;

    select total_amount,paid_amount,payment_status,ap_approval_status
    into v_total,v_paid,v_status,v_approval
    from public.purchase_documents
    where id=p_document_id and branch_id=v_branch
    for update;

    if not found then raise exception 'PURCHASE_DOCUMENT_NOT_FOUND'; end if;
    if v_status='void' then raise exception 'PURCHASE_DOCUMENT_VOID'; end if;
    if v_approval<>'approved' then raise exception 'AP_NOT_APPROVED'; end if;

    v_balance := greatest(v_total-v_paid,0);

    if v_balance<=0 then raise exception 'AP_ALREADY_PAID'; end if;
    if p_amount>v_balance+0.01 then raise exception 'PAYMENT_EXCEEDS_BALANCE'; end if;

    insert into public.accounts_payable_payments(
        branch_id,purchase_document_id,payment_date,amount,
        payment_method,reference_no,note,created_by
    )
    values(
        v_branch,p_document_id,p_payment_date,p_amount,
        p_payment_method,nullif(trim(coalesce(p_reference_no,'')),''),
        nullif(trim(coalesce(p_note,'')),''),v_user
    )
    returning id into v_id;

    perform public._bo_ap_sync_document_payment(p_document_id);

    return v_id;
end
$$;

-- ---------------------------------------------------------
-- H) Payment history
-- ---------------------------------------------------------
create or replace function public.backoffice_ap_payment_history_v17(
    p_document_id uuid
)
returns table(
    id uuid,
    payment_date date,
    amount numeric,
    payment_method text,
    reference_no text,
    note text,
    created_at timestamptz,
    created_by_name text,
    reversed_at timestamptz,
    reversal_reason text
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

    if not exists(
        select 1 from public.purchase_documents
        where id=p_document_id and branch_id=v_branch
    ) then raise exception 'PURCHASE_DOCUMENT_NOT_FOUND'; end if;

    return query
    select
        ap.id,ap.payment_date,ap.amount,ap.payment_method,
        ap.reference_no,ap.note,ap.created_at,
        p.full_name,ap.reversed_at,ap.reversal_reason
    from public.accounts_payable_payments ap
    left join public.profiles p on p.id=ap.created_by
    where ap.purchase_document_id=p_document_id
      and ap.branch_id=v_branch
    order by ap.payment_date desc,ap.created_at desc;
end
$$;

-- ---------------------------------------------------------
-- I) Reverse payment (audit-safe, no delete)
-- ---------------------------------------------------------
create or replace function public.backoffice_reverse_ap_payment_v17(
    p_payment_id uuid,
    p_reason text
)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare
    v_user uuid;
    v_branch uuid;
    v_role text;
    v_document uuid;
begin
    select x.user_id,x.branch_id,x.role
    into v_user,v_branch,v_role
    from public._bo_ctx() x;

    if v_branch is null then raise exception 'BACKOFFICE_PERMISSION_DENIED'; end if;
    if lower(trim(coalesce(v_role,'')))<>'admin' then
        raise exception 'ADMIN_REQUIRED';
    end if;
    if trim(coalesce(p_reason,''))='' then raise exception 'REVERSAL_REASON_REQUIRED'; end if;

    update public.accounts_payable_payments
    set reversed_at=now(),
        reversed_by=v_user,
        reversal_reason=trim(p_reason)
    where id=p_payment_id
      and branch_id=v_branch
      and reversed_at is null
    returning purchase_document_id into v_document;

    if v_document is null then raise exception 'PAYMENT_NOT_FOUND_OR_REVERSED'; end if;

    perform public._bo_ap_sync_document_payment(v_document);
    return true;
end
$$;

revoke all on function public.backoffice_accounts_payable_v17(uuid,text,text,text) from public;
revoke all on function public.backoffice_accounts_payable_summary_v17() from public;
revoke all on function public.backoffice_set_ap_approval_v17(uuid,text,text) from public;
revoke all on function public.backoffice_record_ap_payment_v17(uuid,date,numeric,text,text,text) from public;
revoke all on function public.backoffice_ap_payment_history_v17(uuid) from public;
revoke all on function public.backoffice_reverse_ap_payment_v17(uuid,text) from public;

grant execute on function public.backoffice_accounts_payable_v17(uuid,text,text,text) to authenticated;
grant execute on function public.backoffice_accounts_payable_summary_v17() to authenticated;
grant execute on function public.backoffice_set_ap_approval_v17(uuid,text,text) to authenticated;
grant execute on function public.backoffice_record_ap_payment_v17(uuid,date,numeric,text,text,text) to authenticated;
grant execute on function public.backoffice_ap_payment_history_v17(uuid) to authenticated;
grant execute on function public.backoffice_reverse_ap_payment_v17(uuid,text) to authenticated;

commit;

select 'JOKJUNG ACCOUNTS PAYABLE V1.7 READY' as result;
