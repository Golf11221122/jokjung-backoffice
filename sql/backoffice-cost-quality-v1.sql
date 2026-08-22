-- =========================================================
-- JOKJUNG BACK OFFICE - COST DATA QUALITY V1
-- ตรวจคุณภาพข้อมูลที่มีผลต่อ P&L โดยไม่สร้างฐานต้นทุนใหม่
-- =========================================================

create or replace function public.backoffice_cost_quality_v1(
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
    v_zero_cogs jsonb := '[]'::jsonb;
    v_zero_count bigint := 0;
    v_sales_menu_count bigint := 0;
    v_zero_sales numeric := 0;
    v_revenue numeric := 0;
    v_coverage numeric := 0;
    v_closing_count bigint := 0;
    v_score numeric := 0;
begin
    select x.branch_id into v_branch from public._bo_ctx() x;
    if v_branch is null then raise exception 'BACKOFFICE_PERMISSION_DENIED'; end if;
    if p_date_from is null or p_date_to is null or p_date_to < p_date_from then
        raise exception 'INVALID_DATE_RANGE';
    end if;

    select coalesce(sum(s.total),0)
    into v_revenue
    from public.sales s
    where s.branch_id=v_branch
      and s.created_at >= p_date_from::timestamptz
      and s.created_at < (p_date_to+1)::timestamptz
      and coalesce(s.status,'') <> 'cancelled';

    with m as (
      select
        coalesce(si.product_name,'ไม่ระบุเมนู') as product_name,
        sum(coalesce(si.quantity,0)) as quantity,
        sum(coalesce(si.total_price,coalesce(si.unit_price,0)*coalesce(si.quantity,0))) as revenue,
        sum(coalesce(si.unit_cost,0)*coalesce(si.quantity,0)) as cogs
      from public.sale_items si
      join public.sales s on s.id=si.sale_id
      where s.branch_id=v_branch
        and s.created_at >= p_date_from::timestamptz
        and s.created_at < (p_date_to+1)::timestamptz
        and coalesce(s.status,'') <> 'cancelled'
      group by coalesce(si.product_name,'ไม่ระบุเมนู')
    )
    select
      count(*),
      count(*) filter(where coalesce(cogs,0)=0),
      coalesce(sum(revenue) filter(where coalesce(cogs,0)=0),0),
      coalesce(jsonb_agg(
        jsonb_build_object(
          'product_name',product_name,
          'quantity',quantity,
          'revenue',round(revenue,2),
          'cogs',round(cogs,2),
          'issue','COGS_ZERO'
        )
        order by revenue desc
      ) filter(where coalesce(cogs,0)=0),'[]'::jsonb)
    into v_sales_menu_count,v_zero_count,v_zero_sales,v_zero_cogs
    from m;

    if to_regclass('public.inventory_closings') is not null then
      select coalesce(avg(c.coverage_pct),0),count(*)
      into v_coverage,v_closing_count
      from public.inventory_closings c
      where c.branch_id=v_branch
        and c.status='closed'
        and c.period_start::date>=p_date_from
        and c.period_end::date<=p_date_to;
    end if;

    -- readiness score: 70% cost completeness + 30% stock count coverage
    v_score :=
      (case when v_sales_menu_count=0 then 0
            else ((v_sales_menu_count-v_zero_count)::numeric/v_sales_menu_count)*70 end)
      + least(greatest(coalesce(v_coverage,0),0),100)*0.30;

    return jsonb_build_object(
      'date_from',p_date_from,
      'date_to',p_date_to,
      'revenue',round(v_revenue,2),
      'sold_menu_count',v_sales_menu_count,
      'zero_cogs_menu_count',v_zero_count,
      'zero_cogs_sales',round(v_zero_sales,2),
      'cost_completeness_pct',
        case when v_sales_menu_count=0 then 0
             else round(((v_sales_menu_count-v_zero_count)::numeric/v_sales_menu_count)*100,2) end,
      'stock_count_coverage_pct',round(coalesce(v_coverage,0),2),
      'stock_closing_periods',v_closing_count,
      'readiness_score',round(v_score,2),
      'readiness_status',
        case when v_score>=90 then 'READY'
             when v_score>=70 then 'REVIEW'
             else 'NOT_READY' end,
      'zero_cogs_menus',v_zero_cogs
    );
end;
$$;

revoke all on function public.backoffice_cost_quality_v1(date,date) from public;
grant execute on function public.backoffice_cost_quality_v1(date,date) to authenticated;

-- ไม่มี TEST SELECT ท้ายไฟล์
