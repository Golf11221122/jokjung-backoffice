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


-- =========================================================
-- V1.1 AUTO PLAN FROM ANNUAL SALES TARGET
-- Generates a practical starter KPI plan from one annual target.
-- =========================================================
create or replace function public.backoffice_kpi_auto_plan_v11(
 p_annual_sales numeric,
 p_year integer default extract(year from current_date)::integer,
 p_open_days_per_year integer default 365,
 p_average_bill numeric default 100,
 p_theoretical_food_cost_pct numeric default 35,
 p_actual_food_cost_pct numeric default 37,
 p_waste_pct numeric default 2,
 p_operating_margin_pct numeric default 10,
 p_cash_variance_pct numeric default 0.5
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_branch uuid; v_role text; v_start date; v_end date; v_month numeric; v_day numeric; v_bills numeric; begin
 select x.branch_id into v_branch from public._bo_ctx() x;
 select lower(coalesce(role,'')) into v_role from public.profiles where id=auth.uid();
 if v_branch is null or v_role<>'admin' then raise exception 'KPI_ADMIN_ONLY'; end if;
 if coalesce(p_annual_sales,0)<=0 or p_open_days_per_year<=0 or coalesce(p_average_bill,0)<=0 then raise exception 'INVALID_KPI_PLAN_INPUT'; end if;
 v_start=make_date(p_year,1,1); v_end=make_date(p_year,12,31); v_month=round(p_annual_sales/12,2); v_day=round(p_annual_sales/p_open_days_per_year,2); v_bills=ceil(v_day/p_average_bill);
 -- annual sales
 perform public.backoffice_kpi_target_upsert_v1('SALES','ยอดขายรายปี','Sales','yearly',v_start,v_end,p_annual_sales,'THB','higher_better',10,null,null,'สร้างอัตโนมัติจาก Annual Sales Plan');
 -- monthly targets, 12 periods
 for i in 1..12 loop
  perform public.backoffice_kpi_target_upsert_v1('SALES','ยอดขายรายเดือน','Sales','monthly',make_date(p_year,i,1),(make_date(p_year,i,1)+interval '1 month - 1 day')::date,v_month,'THB','higher_better',10,null,null,'เฉลี่ยจากยอดขายรายปี');
 end loop;
 -- operational starter targets (year scope)
 perform public.backoffice_kpi_target_upsert_v1('DAILY_SALES','ยอดขายเฉลี่ยต่อวัน','Sales','yearly',v_start,v_end,v_day,'THB','higher_better',10,null,null,'คำนวณจากวันเปิดร้าน');
 perform public.backoffice_kpi_target_upsert_v1('AVG_BILL','Average Bill','Sales','yearly',v_start,v_end,p_average_bill,'THB','higher_better',10,null,null,'Starter KPI');
 perform public.backoffice_kpi_target_upsert_v1('BILL_COUNT','จำนวนบิลเฉลี่ยต่อวัน','Sales','yearly',v_start,v_end,v_bills,'COUNT','higher_better',10,null,null,'ยอดขายเฉลี่ยต่อวัน / Average Bill');
 perform public.backoffice_kpi_target_upsert_v1('THEORETICAL_FC','Theoretical Food Cost','Cost','yearly',v_start,v_end,p_theoretical_food_cost_pct,'PERCENT','lower_better',5,null,null,'Starter KPI');
 perform public.backoffice_kpi_target_upsert_v1('ACTUAL_FC','Actual Food Cost','Cost','yearly',v_start,v_end,p_actual_food_cost_pct,'PERCENT','lower_better',5,null,null,'Starter KPI');
 perform public.backoffice_kpi_target_upsert_v1('WASTE','Waste','Inventory','yearly',v_start,v_end,p_waste_pct,'PERCENT','lower_better',10,null,null,'Starter KPI');
 perform public.backoffice_kpi_target_upsert_v1('OPERATING_MARGIN','Operating Profit Margin','Profit','yearly',v_start,v_end,p_operating_margin_pct,'PERCENT','higher_better',10,null,null,'Starter KPI');
 perform public.backoffice_kpi_target_upsert_v1('CASH_VARIANCE','Cash Variance','Payment','yearly',v_start,v_end,p_cash_variance_pct,'PERCENT','lower_better',10,null,null,'Starter KPI');
 return jsonb_build_object('annual_sales',p_annual_sales,'monthly_sales',v_month,'daily_sales',v_day,'average_bill',p_average_bill,'bills_per_day',v_bills,'year',p_year,'open_days',p_open_days_per_year);
end $$;
revoke all on function public.backoffice_kpi_auto_plan_v11(numeric,integer,integer,numeric,numeric,numeric,numeric,numeric,numeric) from public;
grant execute on function public.backoffice_kpi_auto_plan_v11(numeric,integer,integer,numeric,numeric,numeric,numeric,numeric,numeric) to authenticated;


-- =========================================================
-- V1.2 KPI ACTUAL ENGINE
-- Actual -> Target -> Variance -> Achievement -> Pace -> Status
-- =========================================================
create or replace function public.backoffice_kpi_actual_engine_v12(
 p_as_of date default current_date
) returns jsonb
language plpgsql security definer set search_path=public
as $$
declare
 v_branch uuid; v_targets jsonb := '[]'::jsonb;
begin
 select x.branch_id into v_branch from public._bo_ctx() x;
 if v_branch is null then raise exception 'BACKOFFICE_PERMISSION_DENIED'; end if;

 with targets as (
   select t.*,
     greatest(t.period_start,least(coalesce(p_as_of,current_date),t.period_end)) as actual_end,
     greatest(1,(t.period_end-t.period_start)+1) as period_days,
     greatest(0,(greatest(t.period_start,least(coalesce(p_as_of,current_date),t.period_end))-t.period_start)+1) as elapsed_days
   from public.backoffice_kpi_targets t
   where t.branch_id=v_branch and t.is_active
     and t.period_start<=coalesce(p_as_of,current_date)
     and t.period_end>=date_trunc('year',coalesce(p_as_of,current_date))::date
 ), actuals as (
   select t.*,
     a.revenue,a.prev_revenue,a.bill_count,a.item_qty,a.discount,a.cogs,a.expenses,a.labor_expense,a.rent_expense,
     a.void_count,a.all_bill_count,a.waste_cost,a.cash_diff_abs,a.expected_cash,a.closed_shifts,a.total_shifts,a.actual_control_cogs,
     case t.kpi_code
       when 'SALES' then a.revenue
       when 'DAILY_SALES' then case when t.elapsed_days=0 then null else a.revenue/t.elapsed_days end
       when 'SALES_GROWTH' then case when coalesce(a.prev_revenue,0)=0 then null else (a.revenue-a.prev_revenue)/a.prev_revenue*100 end
       when 'AVG_BILL' then case when a.bill_count=0 then null else a.revenue/a.bill_count end
       when 'BILL_COUNT' then case when t.elapsed_days=0 then null else a.bill_count::numeric/t.elapsed_days end
       when 'ITEMS_PER_BILL' then case when a.bill_count=0 then null else a.item_qty/a.bill_count end
       when 'THEORETICAL_FC' then case when a.revenue=0 then null else a.cogs/a.revenue*100 end
       when 'ACTUAL_FC' then case when a.revenue=0 or a.actual_control_cogs is null then null else a.actual_control_cogs/a.revenue*100 end
       when 'GROSS_MARGIN' then case when a.revenue=0 then null else (a.revenue-a.cogs)/a.revenue*100 end
       when 'LABOR_COST' then case when a.revenue=0 then null else a.labor_expense/a.revenue*100 end
       when 'RENT_COST' then case when a.revenue=0 then null else a.rent_expense/a.revenue*100 end
       when 'OPEX' then case when a.revenue=0 then null else a.expenses/a.revenue*100 end
       when 'PRIME_COST' then case when a.revenue=0 then null else (a.cogs+a.labor_expense)/a.revenue*100 end
       when 'OPERATING_MARGIN' then case when a.revenue=0 then null else (a.revenue-a.cogs-a.expenses)/a.revenue*100 end
       when 'WASTE' then case when a.revenue=0 then null else a.waste_cost/a.revenue*100 end
       when 'VOID_RATE' then case when a.all_bill_count=0 then null else a.void_count::numeric/a.all_bill_count*100 end
       when 'DISCOUNT_RATE' then case when a.revenue+a.discount=0 then null else a.discount/(a.revenue+a.discount)*100 end
       when 'CASH_VARIANCE' then case when a.expected_cash=0 then null else a.cash_diff_abs/a.expected_cash*100 end
       when 'CLOSING_RATE' then case when a.total_shifts=0 then null else a.closed_shifts::numeric/a.total_shifts*100 end
       else null
     end as actual_value
   from targets t
   left join lateral (
     with sb as (
       select s.id,s.total,s.discount,s.status,s.payment_method,s.created_at
       from public.sales s where s.branch_id=v_branch
         and s.created_at>=t.period_start::timestamptz and s.created_at<(t.actual_end+1)::timestamptz
     ), prev as (
       select coalesce(sum(s.total),0)::numeric prev_revenue
       from public.sales s where s.branch_id=v_branch and coalesce(s.status,'')<>'cancelled'
         and s.created_at >= (t.period_start - (t.actual_end-t.period_start+1))::timestamptz
         and s.created_at < t.period_start::timestamptz
     ), si as (
       select coalesce(sum(coalesce(i.quantity,0)),0)::numeric item_qty,
              coalesce(sum(coalesce(i.unit_cost,0)*coalesce(i.quantity,0)),0)::numeric cogs
       from public.sale_items i join public.sales s on s.id=i.sale_id
       where s.branch_id=v_branch and coalesce(s.status,'')<>'cancelled'
         and s.created_at>=t.period_start::timestamptz and s.created_at<(t.actual_end+1)::timestamptz
     ), ex as (
       select coalesce(sum(e.amount),0)::numeric expenses,
              coalesce(sum(e.amount) filter(where c.name='ค่าแรง'),0)::numeric labor_expense,
              coalesce(sum(e.amount) filter(where c.name='ค่าเช่า'),0)::numeric rent_expense
       from public.operating_expenses e join public.expense_categories c on c.id=e.category_id
       where e.branch_id=v_branch and e.status='active' and e.expense_date between t.period_start and t.actual_end
     ), mov as (
       select coalesce(sum(abs(coalesce(m.quantity,0))*coalesce(m.unit_cost,0)) filter(where lower(coalesce(m.movement_type,''))='waste'),0)::numeric waste_cost
       from public.ingredient_stock_movements m
       where m.branch_id=v_branch and m.created_at>=t.period_start::timestamptz and m.created_at<(t.actual_end+1)::timestamptz
     ), sh as (
       select coalesce(sum(abs(coalesce(nullif(to_jsonb(x)->>'cash_difference','')::numeric,0))),0)::numeric cash_diff_abs,
              coalesce(sum(coalesce(nullif(to_jsonb(x)->>'expected_cash','')::numeric,0)),0)::numeric expected_cash,
              count(*) filter(where lower(coalesce(to_jsonb(x)->>'status','')) in ('closed','close'))::bigint closed_shifts,
              count(*)::bigint total_shifts
       from public.shifts x where x.branch_id=v_branch and x.opened_at>=t.period_start::timestamptz and x.opened_at<(t.actual_end+1)::timestamptz
     ), ac as (
       select case when to_regclass('public.inventory_closings') is null then null else (
         select sum(c.actual_control_cost)::numeric from public.inventory_closings c
         where c.branch_id=v_branch and c.status='closed' and c.period_start::date>=t.period_start and c.period_end::date<=t.actual_end
       ) end actual_control_cogs
     )
     select coalesce(sum(sb.total) filter(where coalesce(sb.status,'')<>'cancelled'),0)::numeric revenue,
            (select prev_revenue from prev),
            count(*) filter(where coalesce(sb.status,'')<>'cancelled')::bigint bill_count,
            coalesce(sum(sb.discount) filter(where coalesce(sb.status,'')<>'cancelled'),0)::numeric discount,
            count(*) filter(where sb.status='cancelled')::bigint void_count,
            count(*)::bigint all_bill_count,
            (select item_qty from si),(select cogs from si),(select expenses from ex),(select labor_expense from ex),(select rent_expense from ex),
            (select waste_cost from mov),(select cash_diff_abs from sh),(select expected_cash from sh),(select closed_shifts from sh),(select total_shifts from sh),(select actual_control_cogs from ac)
     from sb
   ) a on true
 ), scored as (
   select a.*,
     case when a.kpi_code='SALES' and a.direction='higher_better' then round(a.target_value*(a.elapsed_days::numeric/a.period_days),2) else a.target_value end expected_to_date,
     case when a.actual_value is null then null
          when a.direction='higher_better' and a.target_value<>0 then a.actual_value/a.target_value*100
          when a.direction='lower_better' and a.actual_value=0 then 100
          when a.direction='lower_better' and a.actual_value<>0 then a.target_value/a.actual_value*100
          else null end achievement_pct,
     case when a.actual_value is null then 'NO_DATA'
          when a.direction='higher_better' then
            case when a.actual_value >= (case when a.kpi_code='SALES' then a.target_value*(a.elapsed_days::numeric/a.period_days) else a.target_value end) then 'GREEN'
                 when a.actual_value >= (case when a.kpi_code='SALES' then a.target_value*(a.elapsed_days::numeric/a.period_days) else a.target_value end)*(1-a.warning_tolerance/100) then 'YELLOW' else 'RED' end
          when a.direction='lower_better' then case when a.actual_value<=a.target_value then 'GREEN' when a.actual_value<=a.target_value*(1+a.warning_tolerance/100) then 'YELLOW' else 'RED' end
          when a.direction='target_range' then case when a.actual_value between coalesce(a.target_min,a.target_value) and coalesce(a.target_max,a.target_value) then 'GREEN' else 'RED' end
          else 'NO_DATA' end status
   from actuals a
 )
 select coalesce(jsonb_agg(jsonb_build_object(
   'id',id,'kpi_code',kpi_code,'kpi_name',kpi_name,'category',category,'period_type',period_type,
   'period_start',period_start,'period_end',period_end,'actual_end',actual_end,'elapsed_days',elapsed_days,'period_days',period_days,
   'target_value',round(target_value,2),'actual_value',case when actual_value is null then null else round(actual_value,2) end,
   'expected_to_date',round(expected_to_date,2),'unit',unit,'direction',direction,'warning_tolerance',warning_tolerance,
   'achievement_pct',case when achievement_pct is null then null else round(achievement_pct,2) end,
   'variance',case when actual_value is null then null else round(actual_value-target_value,2) end,
   'remaining',case when actual_value is null then null when direction='higher_better' then greatest(target_value-actual_value,0) else greatest(actual_value-target_value,0) end,
   'required_per_day',case when kpi_code='SALES' and actual_value is not null and period_end>actual_end then round(greatest(target_value-actual_value,0)/greatest((period_end-actual_end),1),2) else null end,
   'status',status
 ) order by category,kpi_name,period_start desc),'[]'::jsonb) into v_targets from scored;
 return jsonb_build_object('as_of',coalesce(p_as_of,current_date),'items',v_targets);
end $$;
revoke all on function public.backoffice_kpi_actual_engine_v12(date) from public;
grant execute on function public.backoffice_kpi_actual_engine_v12(date) to authenticated;
