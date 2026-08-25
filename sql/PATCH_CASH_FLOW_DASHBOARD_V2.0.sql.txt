-- =========================================================
-- JOKJUNG CASH FLOW DASHBOARD V2.0
-- Actual Inflow + Actual Outflow + Planned Supplier Payments
-- =========================================================

begin;

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
    v_approval text;
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

    select greatest(total_amount-paid_amount,0),ap_approval_status
    into v_balance,v_approval
    from public.purchase_documents
    where id=p_document_id
      and branch_id=v_branch
      and payment_status not in ('paid','void');

    if v_balance is null then raise exception 'AP_DOCUMENT_NOT_FOUND'; end if;
    if v_approval<>'approved' then raise exception 'AP_NOT_APPROVED'; end if;
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

revoke all on function public.backoffice_save_payment_plan_v19(uuid,date,numeric,text) from public;
grant execute on function public.backoffice_save_payment_plan_v19(uuid,date,numeric,text) to authenticated;

create or replace function public.backoffice_cash_flow_summary_v20(
    p_date_from date default current_date,
    p_date_to date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
    v_branch uuid;
    v_sales numeric:=0;
    v_cash_sales numeric:=0;
    v_qr_sales numeric:=0;
    v_other_sales numeric:=0;
    v_expenses numeric:=0;
    v_supplier_payments numeric:=0;
    v_actual_out numeric:=0;
    v_actual_net numeric:=0;
    v_planned_future numeric:=0;
begin
    select x.branch_id into v_branch from public._bo_ctx() x;
    if v_branch is null then raise exception 'BACKOFFICE_PERMISSION_DENIED'; end if;
    if p_date_from is null or p_date_to is null or p_date_to<p_date_from then
        raise exception 'INVALID_DATE_RANGE';
    end if;

    select
        coalesce(sum(s.total),0),
        coalesce(sum(s.total) filter(where lower(coalesce(s.payment_method,''))='cash'),0),
        coalesce(sum(s.total) filter(where lower(coalesce(s.payment_method,''))='qr'),0),
        coalesce(sum(s.total) filter(where lower(coalesce(s.payment_method,'')) not in ('cash','qr')),0)
    into v_sales,v_cash_sales,v_qr_sales,v_other_sales
    from public.sales s
    where s.branch_id=v_branch
      and s.created_at>=p_date_from::timestamptz
      and s.created_at<(p_date_to+1)::timestamptz
      and coalesce(s.status,'')<>'cancelled';

    select coalesce(sum(e.amount),0)
    into v_expenses
    from public.operating_expenses e
    where e.branch_id=v_branch
      and e.expense_date between p_date_from and p_date_to
      and e.status='active';

    select coalesce(sum(ap.amount),0)
    into v_supplier_payments
    from public.accounts_payable_payments ap
    where ap.branch_id=v_branch
      and ap.payment_date between p_date_from and p_date_to
      and ap.reversed_at is null;

    v_actual_out:=v_expenses+v_supplier_payments;
    v_actual_net:=v_sales-v_actual_out;

    select coalesce(sum(pp.planned_amount),0)
    into v_planned_future
    from public.ap_payment_plans pp
    join public.purchase_documents d on d.id=pp.purchase_document_id
    where pp.branch_id=v_branch
      and pp.status='planned'
      and pp.planned_date between p_date_from and p_date_to
      and d.ap_approval_status='approved'
      and d.payment_status not in ('paid','void');

    return jsonb_build_object(
        'date_from',p_date_from,
        'date_to',p_date_to,
        'sales_inflow',round(v_sales,2),
        'cash_sales',round(v_cash_sales,2),
        'qr_sales',round(v_qr_sales,2),
        'other_sales',round(v_other_sales,2),
        'operating_expenses',round(v_expenses,2),
        'supplier_payments',round(v_supplier_payments,2),
        'actual_outflow',round(v_actual_out,2),
        'actual_net_cash_flow',round(v_actual_net,2),
        'planned_supplier_payments',round(v_planned_future,2),
        'projected_net_after_plans',round(v_actual_net-v_planned_future,2)
    );
end
$$;

create or replace function public.backoffice_cash_flow_daily_v20(
    p_date_from date default current_date,
    p_date_to date default current_date
)
returns table(
    flow_date date,
    sales_inflow numeric,
    cash_sales numeric,
    qr_sales numeric,
    operating_expenses numeric,
    supplier_payments numeric,
    actual_outflow numeric,
    actual_net numeric,
    planned_supplier_payments numeric,
    projected_net numeric
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
    with days as (
        select generate_series(p_date_from,p_date_to,interval '1 day')::date d
    ),
    sale_by_day as (
        select s.created_at::date d,
               sum(s.total)::numeric sales,
               sum(s.total) filter(where lower(coalesce(s.payment_method,''))='cash')::numeric cash,
               sum(s.total) filter(where lower(coalesce(s.payment_method,''))='qr')::numeric qr
        from public.sales s
        where s.branch_id=v_branch
          and s.created_at>=p_date_from::timestamptz
          and s.created_at<(p_date_to+1)::timestamptz
          and coalesce(s.status,'')<>'cancelled'
        group by s.created_at::date
    ),
    expense_by_day as (
        select e.expense_date d,sum(e.amount)::numeric amount
        from public.operating_expenses e
        where e.branch_id=v_branch
          and e.expense_date between p_date_from and p_date_to
          and e.status='active'
        group by e.expense_date
    ),
    payment_by_day as (
        select ap.payment_date d,sum(ap.amount)::numeric amount
        from public.accounts_payable_payments ap
        where ap.branch_id=v_branch
          and ap.payment_date between p_date_from and p_date_to
          and ap.reversed_at is null
        group by ap.payment_date
    ),
    plan_by_day as (
        select pp.planned_date d,sum(pp.planned_amount)::numeric amount
        from public.ap_payment_plans pp
        join public.purchase_documents doc on doc.id=pp.purchase_document_id
        where pp.branch_id=v_branch
          and pp.planned_date between p_date_from and p_date_to
          and pp.status='planned'
          and doc.ap_approval_status='approved'
          and doc.payment_status not in ('paid','void')
        group by pp.planned_date
    )
    select
        days.d,
        coalesce(s.sales,0)::numeric,
        coalesce(s.cash,0)::numeric,
        coalesce(s.qr,0)::numeric,
        coalesce(e.amount,0)::numeric,
        coalesce(ap.amount,0)::numeric,
        (coalesce(e.amount,0)+coalesce(ap.amount,0))::numeric,
        (coalesce(s.sales,0)-coalesce(e.amount,0)-coalesce(ap.amount,0))::numeric,
        coalesce(pl.amount,0)::numeric,
        (coalesce(s.sales,0)-coalesce(e.amount,0)-coalesce(ap.amount,0)-coalesce(pl.amount,0))::numeric
    from days
    left join sale_by_day s on s.d=days.d
    left join expense_by_day e on e.d=days.d
    left join payment_by_day ap on ap.d=days.d
    left join plan_by_day pl on pl.d=days.d
    order by days.d;
end
$$;

create or replace function public.backoffice_cash_flow_outflows_v20(
    p_date_from date default current_date,
    p_date_to date default current_date
)
returns table(
    flow_date date,
    flow_type text,
    source_id uuid,
    description text,
    counterparty text,
    payment_method text,
    reference_no text,
    amount numeric
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
        e.expense_date,
        'operating_expense'::text,
        e.id,
        coalesce(e.description,c.name),
        c.name,
        e.payment_method,
        e.reference_no,
        e.amount
    from public.operating_expenses e
    join public.expense_categories c on c.id=e.category_id
    where e.branch_id=v_branch
      and e.expense_date between p_date_from and p_date_to
      and e.status='active'

    union all

    select
        ap.payment_date,
        'supplier_payment'::text,
        ap.id,
        concat('ชำระ ',d.internal_no),
        s.name,
        ap.payment_method,
        ap.reference_no,
        ap.amount
    from public.accounts_payable_payments ap
    join public.purchase_documents d on d.id=ap.purchase_document_id
    left join public.suppliers s on s.id=d.supplier_id
    where ap.branch_id=v_branch
      and ap.payment_date between p_date_from and p_date_to
      and ap.reversed_at is null

    order by 1 desc,2,4;
end
$$;

revoke all on function public.backoffice_cash_flow_summary_v20(date,date) from public;
revoke all on function public.backoffice_cash_flow_daily_v20(date,date) from public;
revoke all on function public.backoffice_cash_flow_outflows_v20(date,date) from public;

grant execute on function public.backoffice_cash_flow_summary_v20(date,date) to authenticated;
grant execute on function public.backoffice_cash_flow_daily_v20(date,date) to authenticated;
grant execute on function public.backoffice_cash_flow_outflows_v20(date,date) to authenticated;

commit;

select 'JOKJUNG CASH FLOW DASHBOARD V2.0 READY' as result;
