-- =========================================================
-- JOKJUNG BACK OFFICE - P&L V1
-- Revenue: sales.total (ยกเว้น status='cancelled')
-- COGS: sale_items.unit_cost * quantity
-- Expenses: operating_expenses.status='active'
-- Admin / Manager via _bo_ctx()
-- =========================================================

create or replace function public.backoffice_pnl_v1(
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
    v_revenue numeric := 0;
    v_cogs numeric := 0;
    v_expenses numeric := 0;
    v_bills bigint := 0;
    v_expense_count bigint := 0;
    v_expense_breakdown jsonb := '[]'::jsonb;
begin
    select x.branch_id into v_branch
    from public._bo_ctx() x;

    if v_branch is null then
        raise exception 'BACKOFFICE_PERMISSION_DENIED';
    end if;

    if p_date_from is null or p_date_to is null or p_date_to < p_date_from then
        raise exception 'INVALID_DATE_RANGE';
    end if;

    select
        coalesce(sum(s.total),0),
        count(*)
    into
        v_revenue,
        v_bills
    from public.sales s
    where s.branch_id=v_branch
      and s.created_at >= p_date_from::timestamptz
      and s.created_at < (p_date_to + 1)::timestamptz
      and coalesce(s.status,'') <> 'cancelled';

    select
        coalesce(sum(coalesce(si.unit_cost,0) * coalesce(si.quantity,0)),0)
    into
        v_cogs
    from public.sale_items si
    join public.sales s on s.id=si.sale_id
    where s.branch_id=v_branch
      and s.created_at >= p_date_from::timestamptz
      and s.created_at < (p_date_to + 1)::timestamptz
      and coalesce(s.status,'') <> 'cancelled';

    select
        coalesce(sum(e.amount),0),
        count(*)
    into
        v_expenses,
        v_expense_count
    from public.operating_expenses e
    where e.branch_id=v_branch
      and e.expense_date between p_date_from and p_date_to
      and e.status='active';

    select coalesce(
        jsonb_agg(
            jsonb_build_object(
                'category_id',x.category_id,
                'category_name',x.category_name,
                'amount',x.amount
            )
            order by x.amount desc, x.category_name
        ),
        '[]'::jsonb
    )
    into v_expense_breakdown
    from (
        select
            c.id as category_id,
            c.name as category_name,
            sum(e.amount) as amount
        from public.operating_expenses e
        join public.expense_categories c on c.id=e.category_id
        where e.branch_id=v_branch
          and e.expense_date between p_date_from and p_date_to
          and e.status='active'
        group by c.id,c.name
    ) x;

    return jsonb_build_object(
        'date_from',p_date_from,
        'date_to',p_date_to,
        'revenue',round(v_revenue,2),
        'bills',v_bills,
        'cogs',round(v_cogs,2),
        'gross_profit',round(v_revenue-v_cogs,2),
        'gross_margin_pct',
            case when v_revenue=0 then 0
                 else round(((v_revenue-v_cogs)/v_revenue)*100,2)
            end,
        'operating_expenses',round(v_expenses,2),
        'expense_count',v_expense_count,
        'operating_profit',round(v_revenue-v_cogs-v_expenses,2),
        'operating_margin_pct',
            case when v_revenue=0 then 0
                 else round(((v_revenue-v_cogs-v_expenses)/v_revenue)*100,2)
            end,
        'expense_breakdown',v_expense_breakdown
    );
end;
$$;

revoke all on function public.backoffice_pnl_v1(date,date) from public;
grant execute on function public.backoffice_pnl_v1(date,date) to authenticated;

-- ไม่มี TEST SELECT ท้ายไฟล์ เพราะ SQL Editor ไม่มี auth.uid()
