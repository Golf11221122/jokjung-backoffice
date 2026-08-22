-- JOKJUNG BACK OFFICE - P&L V2 FULL
-- Revenue + theoretical COGS + actual stock-control COGS + expenses + menu COGS analysis
-- Uses existing _bo_ctx(), sales, sale_items, inventory_closings, operating_expenses.

create or replace function public.backoffice_pnl_v2(
 p_date_from date default current_date,
 p_date_to date default current_date
) returns jsonb
language plpgsql security definer set search_path=public
as $$
declare
 v_branch uuid; v_rev numeric:=0; v_disc numeric:=0; v_cogs numeric:=0; v_exp numeric:=0;
 v_bills bigint:=0; v_actual numeric:=null; v_actual_coverage numeric:=null; v_closing_count bigint:=0;
 v_exp_break jsonb:='[]'; v_menu jsonb:='[]'; v_daily jsonb:='[]';
begin
 select x.branch_id into v_branch from public._bo_ctx() x;
 if v_branch is null then raise exception 'BACKOFFICE_PERMISSION_DENIED'; end if;
 if p_date_from is null or p_date_to is null or p_date_to<p_date_from then raise exception 'INVALID_DATE_RANGE'; end if;

 select coalesce(sum(s.total),0),coalesce(sum(coalesce(s.discount,0)),0),count(*)
 into v_rev,v_disc,v_bills
 from public.sales s
 where s.branch_id=v_branch and s.created_at>=p_date_from::timestamptz
 and s.created_at<(p_date_to+1)::timestamptz and coalesce(s.status,'')<>'cancelled';

 select coalesce(sum(coalesce(si.unit_cost,0)*coalesce(si.quantity,0)),0)
 into v_cogs from public.sale_items si join public.sales s on s.id=si.sale_id
 where s.branch_id=v_branch and s.created_at>=p_date_from::timestamptz
 and s.created_at<(p_date_to+1)::timestamptz and coalesce(s.status,'')<>'cancelled';

 select coalesce(sum(e.amount),0) into v_exp from public.operating_expenses e
 where e.branch_id=v_branch and e.expense_date between p_date_from and p_date_to and e.status='active';

 -- Actual Control Cost is used only when CLOSED inventory periods are fully inside selected dates.
 if to_regclass('public.inventory_closings') is not null then
   select sum(c.actual_control_cost),avg(c.coverage_pct),count(*)
   into v_actual,v_actual_coverage,v_closing_count
   from public.inventory_closings c
   where c.branch_id=v_branch and c.status='closed'
     and c.period_start::date>=p_date_from and c.period_end::date<=p_date_to;
 end if;

 select coalesce(jsonb_agg(jsonb_build_object('category_name',q.name,'amount',q.amount)
 order by q.amount desc,q.name),'[]'::jsonb) into v_exp_break
 from (select c.name,sum(e.amount) amount from public.operating_expenses e
 join public.expense_categories c on c.id=e.category_id
 where e.branch_id=v_branch and e.expense_date between p_date_from and p_date_to and e.status='active'
 group by c.name) q;

 select coalesce(jsonb_agg(to_jsonb(q) order by q.revenue desc),'[]'::jsonb) into v_menu
 from (
   select coalesce(si.product_name,'ไม่ระบุเมนู') product_name,
     sum(coalesce(si.quantity,0)) quantity,
     round(sum(coalesce(si.total_price,coalesce(si.unit_price,0)*coalesce(si.quantity,0))),2) revenue,
     round(sum(coalesce(si.unit_cost,0)*coalesce(si.quantity,0)),2) cogs,
     round(sum(coalesce(si.total_price,coalesce(si.unit_price,0)*coalesce(si.quantity,0)))-
           sum(coalesce(si.unit_cost,0)*coalesce(si.quantity,0)),2) gross_profit,
     case when sum(coalesce(si.total_price,coalesce(si.unit_price,0)*coalesce(si.quantity,0)))=0 then 0
       else round(sum(coalesce(si.unit_cost,0)*coalesce(si.quantity,0))/
       sum(coalesce(si.total_price,coalesce(si.unit_price,0)*coalesce(si.quantity,0)))*100,2) end food_cost_pct
   from public.sale_items si join public.sales s on s.id=si.sale_id
   where s.branch_id=v_branch and s.created_at>=p_date_from::timestamptz
   and s.created_at<(p_date_to+1)::timestamptz and coalesce(s.status,'')<>'cancelled'
   group by coalesce(si.product_name,'ไม่ระบุเมนู')
 ) q;

 select coalesce(jsonb_agg(to_jsonb(q) order by q.report_date),'[]'::jsonb) into v_daily
 from (
   select d.day::date as report_date,
    coalesce(s.revenue,0)::numeric as revenue,
    coalesce(s.cogs,0)::numeric as cogs,
    coalesce(e.expenses,0)::numeric as expenses,
    (coalesce(s.revenue,0)-coalesce(s.cogs,0)-coalesce(e.expenses,0))::numeric as operating_profit
   from generate_series(p_date_from,p_date_to,'1 day'::interval) d(day)
   left join (
     select s.created_at::date as sale_date,
       sum(s.total) as revenue,
       sum(coalesce(si.unit_cost,0)*coalesce(si.quantity,0)) as cogs
     from public.sales s left join public.sale_items si on si.sale_id=s.id
     where s.branch_id=v_branch and s.created_at>=p_date_from::timestamptz
       and s.created_at<(p_date_to+1)::timestamptz and coalesce(s.status,'')<>'cancelled'
     group by s.created_at::date
   ) s on s.sale_date=d.day::date
   left join (
     select expense_date as expense_day, sum(amount) as expenses from public.operating_expenses
     where branch_id=v_branch and expense_date between p_date_from and p_date_to and status='active'
     group by expense_date
   ) e on e.expense_day=d.day::date
 ) q;

 return jsonb_build_object(
  'date_from',p_date_from,'date_to',p_date_to,'revenue',round(v_rev,2),'discount',round(v_disc,2),'bills',v_bills,
  'theoretical_cogs',round(v_cogs,2),'theoretical_food_cost_pct',case when v_rev=0 then 0 else round(v_cogs/v_rev*100,2) end,
  'gross_profit',round(v_rev-v_cogs,2),'gross_margin_pct',case when v_rev=0 then 0 else round((v_rev-v_cogs)/v_rev*100,2) end,
  'operating_expenses',round(v_exp,2),'operating_profit',round(v_rev-v_cogs-v_exp,2),
  'operating_margin_pct',case when v_rev=0 then 0 else round((v_rev-v_cogs-v_exp)/v_rev*100,2) end,
  'actual_control_cogs',case when v_actual is null then null else round(v_actual,2) end,
  'actual_food_cost_pct',case when v_actual is null or v_rev=0 then null else round(v_actual/v_rev*100,2) end,
  'stock_closing_periods',v_closing_count,'stock_count_coverage_pct',round(coalesce(v_actual_coverage,0),2),
  'actual_operating_profit',case when v_actual is null then null else round(v_rev-v_actual-v_exp,2) end,
  'expense_breakdown',v_exp_break,'menu_analysis',v_menu,'daily',v_daily
 );
end $$;
revoke all on function public.backoffice_pnl_v2(date,date) from public;
grant execute on function public.backoffice_pnl_v2(date,date) to authenticated;
