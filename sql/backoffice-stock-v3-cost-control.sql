-- =====================================================================
-- JOKJUNG BACK OFFICE — STOCK V3 / INVENTORY CLOSING / COST CONTROL
-- รันต่อจาก STOCK V2 ที่ใช้งานสำเร็จแล้ว
-- =====================================================================

begin;

-- A) หมวดวัตถุดิบ
create table if not exists public.ingredient_categories (
    id uuid primary key default gen_random_uuid(),
    branch_id uuid not null references public.branches(id) on delete cascade,
    name text not null,
    display_order integer not null default 100,
    is_active boolean not null default true,
    created_by uuid references public.profiles(id),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create unique index if not exists uq_ingredient_categories_branch_name
on public.ingredient_categories(branch_id, lower(trim(name)));
alter table public.ingredient_categories enable row level security;
drop policy if exists ingredient_categories_bo_read on public.ingredient_categories;
create policy ingredient_categories_bo_read on public.ingredient_categories
for select to authenticated using (
    exists(select 1 from public.profiles p where p.id=auth.uid()
      and p.branch_id=ingredient_categories.branch_id
      and lower(trim(coalesce(p.role,''))) in ('admin','manager'))
);

insert into public.ingredient_categories(branch_id,name,display_order,is_active)
select b.id,x.name,x.ord,true
from public.branches b
cross join (values
 ('เนื้อสัตว์',10),('ผัก',20),('เส้น / แป้ง',30),('เครื่องปรุง',40),
 ('ของแห้ง',50),('เครื่องดื่ม',60),('Packaging',70),('อื่นๆ',999)
) x(name,ord)
where not exists(select 1 from public.ingredient_categories c
  where c.branch_id=b.id and lower(trim(c.name))=lower(trim(x.name)));

-- B) master field
alter table public.ingredients add column if not exists category_id uuid references public.ingredient_categories(id) on delete set null;
alter table public.ingredients add column if not exists count_frequency text not null default 'monthly';
do $$ begin
 if not exists(select 1 from pg_constraint where conname='ingredients_count_frequency_check' and conrelid='public.ingredients'::regclass) then
  alter table public.ingredients add constraint ingredients_count_frequency_check
  check(count_frequency in ('daily','weekly','monthly'));
 end if;
end $$;
update public.ingredients i set category_id=c.id
from public.ingredient_categories c
where i.category_id is null and c.branch_id=i.branch_id and lower(trim(c.name))=lower('อื่นๆ');

-- C) stock count type
alter table public.stock_counts add column if not exists count_type text not null default 'full';
do $$ begin
 if not exists(select 1 from pg_constraint where conname='stock_counts_count_type_check' and conrelid='public.stock_counts'::regclass) then
  alter table public.stock_counts add constraint stock_counts_count_type_check
  check(count_type in ('daily','weekly','monthly','full'));
 end if;
end $$;

-- D) Inventory Closing snapshot
create table if not exists public.inventory_closings (
 id uuid primary key default gen_random_uuid(),
 branch_id uuid not null references public.branches(id) on delete cascade,
 closing_no text not null,
 period_type text not null check(period_type in ('daily','weekly','monthly','custom')),
 period_start timestamptz not null,
 period_end timestamptz not null,
 stock_count_id uuid references public.stock_counts(id) on delete restrict,
 status text not null default 'draft' check(status in ('draft','closed')),
 note text,
 net_sales numeric(14,2) not null default 0,
 opening_value numeric(14,2) not null default 0,
 purchase_value numeric(14,2) not null default 0,
 theoretical_cost numeric(14,2) not null default 0,
 waste_cost numeric(14,2) not null default 0,
 adjust_in_value numeric(14,2) not null default 0,
 adjust_out_value numeric(14,2) not null default 0,
 expected_closing_value numeric(14,2) not null default 0,
 actual_closing_value numeric(14,2) not null default 0,
 shortage_value numeric(14,2) not null default 0,
 overage_value numeric(14,2) not null default 0,
 actual_control_cost numeric(14,2) not null default 0,
 theoretical_cost_pct numeric(10,4) not null default 0,
 actual_cost_pct numeric(10,4) not null default 0,
 variance_cost_pct numeric(10,4) not null default 0,
 counted_items integer not null default 0,
 total_items integer not null default 0,
 coverage_pct numeric(10,4) not null default 0,
 created_by uuid references public.profiles(id), created_at timestamptz not null default now(),
 closed_by uuid references public.profiles(id), closed_at timestamptz, updated_at timestamptz not null default now(),
 check(period_end>=period_start)
);
create unique index if not exists uq_inventory_closings_branch_no on public.inventory_closings(branch_id,closing_no);
create index if not exists ix_inventory_closings_period on public.inventory_closings(branch_id,period_start,period_end);

create table if not exists public.inventory_closing_items (
 id uuid primary key default gen_random_uuid(),
 closing_id uuid not null references public.inventory_closings(id) on delete cascade,
 ingredient_id uuid not null references public.ingredients(id) on delete restrict,
 ingredient_name text not null, unit text not null,
 category_id uuid, category_name text not null default 'อื่นๆ', count_frequency text not null,
 opening_qty numeric(14,3) not null default 0,
 stock_in_qty numeric(14,3) not null default 0,
 void_qty numeric(14,3) not null default 0,
 adjust_in_qty numeric(14,3) not null default 0,
 sale_usage_qty numeric(14,3) not null default 0,
 waste_qty numeric(14,3) not null default 0,
 adjust_out_qty numeric(14,3) not null default 0,
 expected_qty numeric(14,3) not null default 0,
 actual_qty numeric(14,3), variance_qty numeric(14,3),
 unit_cost_snapshot numeric(14,4) not null default 0,
 opening_value numeric(14,2) not null default 0,
 stock_in_value numeric(14,2) not null default 0,
 theoretical_usage_value numeric(14,2) not null default 0,
 waste_value numeric(14,2) not null default 0,
 adjust_in_value numeric(14,2) not null default 0,
 adjust_out_value numeric(14,2) not null default 0,
 expected_value numeric(14,2) not null default 0,
 actual_value numeric(14,2), variance_value numeric(14,2),
 was_counted boolean not null default false,
 created_at timestamptz not null default now(),
 unique(closing_id,ingredient_id)
);
create index if not exists ix_inventory_closing_items_cat on public.inventory_closing_items(closing_id,category_id);

create table if not exists public.inventory_closing_audit (
 id uuid primary key default gen_random_uuid(),
 closing_id uuid not null references public.inventory_closings(id) on delete cascade,
 action text not null, reason text,
 acted_by uuid references public.profiles(id), acted_at timestamptz not null default now()
);

alter table public.inventory_closings enable row level security;
alter table public.inventory_closing_items enable row level security;
alter table public.inventory_closing_audit enable row level security;
drop policy if exists inventory_closings_bo_read on public.inventory_closings;
create policy inventory_closings_bo_read on public.inventory_closings for select to authenticated using(
 exists(select 1 from public.profiles p where p.id=auth.uid() and p.branch_id=inventory_closings.branch_id and lower(trim(coalesce(p.role,''))) in ('admin','manager')));
drop policy if exists inventory_closing_items_bo_read on public.inventory_closing_items;
create policy inventory_closing_items_bo_read on public.inventory_closing_items for select to authenticated using(
 exists(select 1 from public.inventory_closings c join public.profiles p on p.id=auth.uid()
        where c.id=inventory_closing_items.closing_id and p.branch_id=c.branch_id and lower(trim(coalesce(p.role,''))) in ('admin','manager')));
drop policy if exists inventory_closing_audit_bo_read on public.inventory_closing_audit;
create policy inventory_closing_audit_bo_read on public.inventory_closing_audit for select to authenticated using(
 exists(select 1 from public.inventory_closings c join public.profiles p on p.id=auth.uid()
        where c.id=inventory_closing_audit.closing_id and p.branch_id=c.branch_id and lower(trim(coalesce(p.role,''))) in ('admin','manager')));

-- E) helper closing no
create or replace function public._bo_next_closing_no() returns text language plpgsql security definer set search_path=public as $$
declare v_branch uuid;v_date text:=to_char(current_date,'YYYYMMDD');v_seq int:=1;v_no text;
begin
 select x.branch_id into v_branch from public._bo_ctx() x;
 if v_branch is null then raise exception 'BACKOFFICE_PERMISSION_DENIED';end if;
 loop
  v_no:='CL-'||v_date||'-'||lpad(v_seq::text,4,'0');
  exit when not exists(select 1 from public.inventory_closings where branch_id=v_branch and closing_no=v_no);
  v_seq:=v_seq+1;
 end loop;
 return v_no;
end $$;
revoke all on function public._bo_next_closing_no() from public;

-- F) category RPC
create or replace function public.backoffice_list_ingredient_categories()
returns table(id uuid,name text,display_order int,is_active boolean,ingredient_count bigint)
language plpgsql security definer set search_path=public as $$
declare v_branch uuid;begin
 select x.branch_id into v_branch from public._bo_ctx() x;if v_branch is null then raise exception 'BACKOFFICE_PERMISSION_DENIED';end if;
 return query select c.id,c.name,c.display_order,c.is_active,count(i.id)
 from public.ingredient_categories c left join public.ingredients i on i.category_id=c.id and i.branch_id=c.branch_id
 where c.branch_id=v_branch group by c.id order by c.display_order,c.name;
end $$;

create or replace function public.backoffice_save_ingredient_category(p_category_id uuid,p_name text,p_display_order int,p_is_active boolean)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_user uuid;v_branch uuid;v_id uuid;v_name text:=trim(coalesce(p_name,''));begin
 select x.user_id,x.branch_id into v_user,v_branch from public._bo_ctx() x;if v_branch is null then raise exception 'BACKOFFICE_PERMISSION_DENIED';end if;
 if v_name='' then raise exception 'CATEGORY_NAME_REQUIRED';end if;
 if exists(select 1 from public.ingredient_categories c where c.branch_id=v_branch and lower(trim(c.name))=lower(v_name) and c.id is distinct from p_category_id) then raise exception 'CATEGORY_NAME_EXISTS';end if;
 if p_category_id is null then
  insert into public.ingredient_categories(branch_id,name,display_order,is_active,created_by) values(v_branch,v_name,coalesce(p_display_order,100),coalesce(p_is_active,true),v_user) returning id into v_id;
 else
  update public.ingredient_categories set name=v_name,display_order=coalesce(p_display_order,100),is_active=coalesce(p_is_active,true),updated_at=now() where id=p_category_id and branch_id=v_branch returning id into v_id;
  if v_id is null then raise exception 'CATEGORY_NOT_FOUND';end if;
 end if;return v_id;
exception when unique_violation then raise exception 'CATEGORY_NAME_EXISTS';end $$;

-- G) ingredient V3 RPC
create or replace function public.backoffice_list_ingredients_v3()
returns table(id uuid,name text,unit text,cost_per_unit numeric,current_stock numeric,min_stock numeric,is_active boolean,category_id uuid,category_name text,count_frequency text,created_at timestamptz,updated_at timestamptz)
language plpgsql security definer set search_path=public as $$
declare v_branch uuid;begin
 select x.branch_id into v_branch from public._bo_ctx() x;if v_branch is null then raise exception 'BACKOFFICE_PERMISSION_DENIED';end if;
 return query select i.id,i.name,i.unit,i.cost_per_unit,i.current_stock,i.min_stock,i.is_active,i.category_id,coalesce(c.name,'อื่นๆ'),i.count_frequency,i.created_at,i.updated_at
 from public.ingredients i left join public.ingredient_categories c on c.id=i.category_id
 where i.branch_id=v_branch order by coalesce(c.display_order,999),coalesce(c.name,'อื่นๆ'),i.name;
end $$;

create or replace function public.backoffice_save_ingredient_v3(p_ingredient_id uuid,p_name text,p_unit text,p_cost_per_unit numeric,p_min_stock numeric,p_is_active boolean,p_category_id uuid,p_count_frequency text)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_branch uuid;v_id uuid;v_name text:=trim(coalesce(p_name,''));begin
 select x.branch_id into v_branch from public._bo_ctx() x;if v_branch is null then raise exception 'BACKOFFICE_PERMISSION_DENIED';end if;
 if v_name='' then raise exception 'INGREDIENT_NAME_REQUIRED';end if;if trim(coalesce(p_unit,''))='' then raise exception 'INGREDIENT_UNIT_REQUIRED';end if;
 if coalesce(p_count_frequency,'') not in('daily','weekly','monthly') then raise exception 'INVALID_COUNT_FREQUENCY';end if;
 if p_category_id is not null and not exists(select 1 from public.ingredient_categories c where c.id=p_category_id and c.branch_id=v_branch) then raise exception 'CATEGORY_NOT_FOUND';end if;
 if exists(select 1 from public.ingredients i where i.branch_id=v_branch and lower(trim(i.name))=lower(v_name) and i.id is distinct from p_ingredient_id) then raise exception 'INGREDIENT_NAME_EXISTS';end if;
 if p_ingredient_id is null then
  insert into public.ingredients(branch_id,name,unit,cost_per_unit,current_stock,min_stock,is_active,category_id,count_frequency)
  values(v_branch,v_name,trim(p_unit),greatest(coalesce(p_cost_per_unit,0),0),0,greatest(coalesce(p_min_stock,0),0),coalesce(p_is_active,true),p_category_id,p_count_frequency) returning id into v_id;
 else
  update public.ingredients set name=v_name,unit=trim(p_unit),cost_per_unit=greatest(coalesce(p_cost_per_unit,0),0),min_stock=greatest(coalesce(p_min_stock,0),0),is_active=coalesce(p_is_active,true),category_id=p_category_id,count_frequency=p_count_frequency,updated_at=now()
  where id=p_ingredient_id and branch_id=v_branch returning id into v_id;if v_id is null then raise exception 'INGREDIENT_NOT_FOUND';end if;
 end if;return v_id;
exception when unique_violation then raise exception 'INGREDIENT_NAME_EXISTS';end $$;

-- H) scheduled stock count
create or replace function public.backoffice_create_stock_count_v3(p_count_type text,p_note text)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_user uuid;v_branch uuid;v_id uuid;v_no text;begin
 select x.user_id,x.branch_id into v_user,v_branch from public._bo_ctx() x;if v_branch is null then raise exception 'BACKOFFICE_PERMISSION_DENIED';end if;
 if p_count_type not in('daily','weekly','monthly','full') then raise exception 'INVALID_COUNT_TYPE';end if;
 v_no:=public._bo_next_doc_no('SC','stock_counts');
 insert into public.stock_counts(branch_id,count_no,status,count_type,note,created_by) values(v_branch,v_no,'counting',p_count_type,nullif(trim(coalesce(p_note,'')),''),v_user) returning id into v_id;
 insert into public.stock_count_items(stock_count_id,ingredient_id,system_qty,unit_cost)
 select v_id,i.id,i.current_stock,i.cost_per_unit from public.ingredients i where i.branch_id=v_branch and i.is_active=true and(
  p_count_type in('monthly','full') or (p_count_type='weekly' and i.count_frequency in('daily','weekly')) or (p_count_type='daily' and i.count_frequency='daily'));
 if not exists(select 1 from public.stock_count_items where stock_count_id=v_id) then delete from public.stock_counts where id=v_id;raise exception 'NO_INGREDIENTS_FOR_COUNT_TYPE';end if;
 return v_id;end $$;

create or replace function public.backoffice_list_stock_counts_v3()
returns table(id uuid,count_no text,status text,count_type text,counted_at timestamptz,note text,created_at timestamptz,created_by_name text,completed_by_name text,variance_value numeric,item_count bigint)
language plpgsql security definer set search_path=public as $$
declare v_branch uuid;begin select x.branch_id into v_branch from public._bo_ctx() x;if v_branch is null then raise exception 'BACKOFFICE_PERMISSION_DENIED';end if;
 return query select sc.id,sc.count_no,sc.status,sc.count_type,sc.counted_at,sc.note,sc.created_at,p1.full_name,p2.full_name,coalesce(sum(abs(sci.variance_value)),0)::numeric,count(sci.id)
 from public.stock_counts sc left join public.profiles p1 on p1.id=sc.created_by left join public.profiles p2 on p2.id=sc.completed_by left join public.stock_count_items sci on sci.stock_count_id=sc.id
 where sc.branch_id=v_branch group by sc.id,p1.full_name,p2.full_name order by sc.created_at desc;end $$;

create or replace function public.backoffice_get_stock_count_v3(p_stock_count_id uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_branch uuid;v_result jsonb;begin select x.branch_id into v_branch from public._bo_ctx() x;if v_branch is null then raise exception 'BACKOFFICE_PERMISSION_DENIED';end if;
 select jsonb_build_object('id',sc.id,'count_no',sc.count_no,'status',sc.status,'count_type',sc.count_type,'note',sc.note,'created_at',sc.created_at,'counted_at',sc.counted_at,'items',coalesce((
  select jsonb_agg(jsonb_build_object('id',sci.id,'ingredient_id',sci.ingredient_id,'ingredient_name',i.name,'unit',i.unit,'category_name',coalesce(c.name,'อื่นๆ'),'count_frequency',i.count_frequency,'system_qty',sci.system_qty,'counted_qty',sci.counted_qty,'variance_qty',sci.variance_qty,'unit_cost',sci.unit_cost,'variance_value',sci.variance_value,'note',sci.note) order by coalesce(c.display_order,999),coalesce(c.name,'อื่นๆ'),i.name)
  from public.stock_count_items sci join public.ingredients i on i.id=sci.ingredient_id left join public.ingredient_categories c on c.id=i.category_id where sci.stock_count_id=sc.id),'[]'::jsonb)) into v_result
 from public.stock_counts sc where sc.id=p_stock_count_id and sc.branch_id=v_branch;if v_result is null then raise exception 'STOCK_COUNT_NOT_FOUND';end if;return v_result;end $$;

-- I) detailed stock report V3
create or replace function public.backoffice_stock_report_v3(p_from timestamptz,p_to timestamptz,p_category_id uuid default null)
returns table(ingredient_id uuid,name text,unit text,category_id uuid,category_name text,count_frequency text,current_stock numeric,min_stock numeric,cost_per_unit numeric,stock_value numeric,stock_in_qty numeric,stock_in_value numeric,sale_qty numeric,sale_value numeric,waste_qty numeric,waste_value numeric,adjust_in_qty numeric,adjust_in_value numeric,adjust_out_qty numeric,adjust_out_value numeric,void_qty numeric,void_value numeric,movement_count bigint,last_movement_at timestamptz,status text)
language plpgsql security definer set search_path=public as $$
declare v_branch uuid;begin select x.branch_id into v_branch from public._bo_ctx() x;if v_branch is null then raise exception 'BACKOFFICE_PERMISSION_DENIED';end if;if p_from is null or p_to is null or p_to<p_from then raise exception 'INVALID_PERIOD';end if;
 return query select i.id,i.name,i.unit,i.category_id,coalesce(c.name,'อื่นๆ'),i.count_frequency,i.current_stock,i.min_stock,i.cost_per_unit,round(i.current_stock*i.cost_per_unit,2)::numeric,
 coalesce(sum(m.quantity) filter(where m.movement_type='stock_in'),0)::numeric,coalesce(sum(m.quantity*m.unit_cost) filter(where m.movement_type='stock_in'),0)::numeric,
 coalesce(sum(m.quantity) filter(where m.movement_type='sale'),0)::numeric,coalesce(sum(m.quantity*m.unit_cost) filter(where m.movement_type='sale'),0)::numeric,
 coalesce(sum(m.quantity) filter(where m.movement_type='waste'),0)::numeric,coalesce(sum(m.quantity*m.unit_cost) filter(where m.movement_type='waste'),0)::numeric,
 coalesce(sum(m.quantity) filter(where m.movement_type='adjust_in' and coalesce(m.note,'') not like 'Stock Count %'),0)::numeric,coalesce(sum(m.quantity*m.unit_cost) filter(where m.movement_type='adjust_in' and coalesce(m.note,'') not like 'Stock Count %'),0)::numeric,
 coalesce(sum(m.quantity) filter(where m.movement_type='adjust_out' and coalesce(m.note,'') not like 'Stock Count %'),0)::numeric,coalesce(sum(m.quantity*m.unit_cost) filter(where m.movement_type='adjust_out' and coalesce(m.note,'') not like 'Stock Count %'),0)::numeric,
 coalesce(sum(m.quantity) filter(where m.movement_type='void'),0)::numeric,coalesce(sum(m.quantity*m.unit_cost) filter(where m.movement_type='void'),0)::numeric,count(m.id),max(m.created_at),
 case when not i.is_active then 'inactive' when i.current_stock<=0 then 'out' when i.current_stock<=i.min_stock then 'low' else 'ok' end
 from public.ingredients i left join public.ingredient_categories c on c.id=i.category_id left join public.ingredient_stock_movements m on m.ingredient_id=i.id and m.branch_id=i.branch_id and m.created_at>=p_from and m.created_at<=p_to
 where i.branch_id=v_branch and(p_category_id is null or i.category_id=p_category_id) group by i.id,c.id,c.name,c.display_order order by coalesce(c.display_order,999),coalesce(c.name,'อื่นๆ'),i.name;end $$;

-- J) closing snapshot builder
create or replace function public._bo_refresh_closing_items(p_closing_id uuid) returns boolean language plpgsql security definer set search_path=public as $$
declare v_branch uuid;v_start timestamptz;v_end timestamptz;v_count uuid;v_sales numeric:=0;begin
 select c.branch_id,c.period_start,c.period_end,c.stock_count_id into v_branch,v_start,v_end,v_count from public.inventory_closings c join public._bo_ctx() x on x.branch_id=c.branch_id where c.id=p_closing_id and c.status='draft' for update;
 if v_branch is null then raise exception 'CLOSING_NOT_EDITABLE';end if;delete from public.inventory_closing_items where closing_id=p_closing_id;
 insert into public.inventory_closing_items(closing_id,ingredient_id,ingredient_name,unit,category_id,category_name,count_frequency,opening_qty,stock_in_qty,void_qty,adjust_in_qty,sale_usage_qty,waste_qty,adjust_out_qty,expected_qty,actual_qty,variance_qty,unit_cost_snapshot,opening_value,stock_in_value,theoretical_usage_value,waste_value,adjust_in_value,adjust_out_value,expected_value,actual_value,variance_value,was_counted)
 select p_closing_id,i.id,i.name,i.unit,i.category_id,coalesce(c.name,'อื่นๆ'),i.count_frequency,
 coalesce((select m0.stock_after from public.ingredient_stock_movements m0 where m0.ingredient_id=i.id and m0.branch_id=v_branch and m0.created_at<v_start order by m0.created_at desc limit 1),(select m1.stock_before from public.ingredient_stock_movements m1 where m1.ingredient_id=i.id and m1.branch_id=v_branch and m1.created_at>=v_start and m1.created_at<=v_end order by m1.created_at asc limit 1),i.current_stock),
 coalesce((select sum(m.quantity) from public.ingredient_stock_movements m where m.ingredient_id=i.id and m.branch_id=v_branch and m.created_at between v_start and v_end and m.movement_type='stock_in'),0),
 coalesce((select sum(m.quantity) from public.ingredient_stock_movements m where m.ingredient_id=i.id and m.branch_id=v_branch and m.created_at between v_start and v_end and m.movement_type='void'),0),
 coalesce((select sum(m.quantity) from public.ingredient_stock_movements m where m.ingredient_id=i.id and m.branch_id=v_branch and m.created_at between v_start and v_end and m.movement_type='adjust_in' and coalesce(m.note,'') not like 'Stock Count %'),0),
 coalesce((select sum(m.quantity) from public.ingredient_stock_movements m where m.ingredient_id=i.id and m.branch_id=v_branch and m.created_at between v_start and v_end and m.movement_type='sale'),0),
 coalesce((select sum(m.quantity) from public.ingredient_stock_movements m where m.ingredient_id=i.id and m.branch_id=v_branch and m.created_at between v_start and v_end and m.movement_type='waste'),0),
 coalesce((select sum(m.quantity) from public.ingredient_stock_movements m where m.ingredient_id=i.id and m.branch_id=v_branch and m.created_at between v_start and v_end and m.movement_type='adjust_out' and coalesce(m.note,'') not like 'Stock Count %'),0),
 0,case when sci.id is not null then sci.counted_qty else null end,null,coalesce(sci.unit_cost,i.cost_per_unit,0),0,
 coalesce((select sum(m.quantity*m.unit_cost) from public.ingredient_stock_movements m where m.ingredient_id=i.id and m.branch_id=v_branch and m.created_at between v_start and v_end and m.movement_type='stock_in'),0),
 coalesce((select sum(m.quantity*m.unit_cost) from public.ingredient_stock_movements m where m.ingredient_id=i.id and m.branch_id=v_branch and m.created_at between v_start and v_end and m.movement_type='sale'),0),
 coalesce((select sum(m.quantity*m.unit_cost) from public.ingredient_stock_movements m where m.ingredient_id=i.id and m.branch_id=v_branch and m.created_at between v_start and v_end and m.movement_type='waste'),0),
 coalesce((select sum(m.quantity*m.unit_cost) from public.ingredient_stock_movements m where m.ingredient_id=i.id and m.branch_id=v_branch and m.created_at between v_start and v_end and m.movement_type='adjust_in' and coalesce(m.note,'') not like 'Stock Count %'),0),
 coalesce((select sum(m.quantity*m.unit_cost) from public.ingredient_stock_movements m where m.ingredient_id=i.id and m.branch_id=v_branch and m.created_at between v_start and v_end and m.movement_type='adjust_out' and coalesce(m.note,'') not like 'Stock Count %'),0),0,null,null,(sci.id is not null)
 from public.ingredients i left join public.ingredient_categories c on c.id=i.category_id left join public.stock_count_items sci on sci.stock_count_id=v_count and sci.ingredient_id=i.id where i.branch_id=v_branch and i.is_active=true;

 update public.inventory_closing_items x set expected_qty=x.opening_qty+x.stock_in_qty+x.void_qty+x.adjust_in_qty-x.sale_usage_qty-x.waste_qty-x.adjust_out_qty,opening_value=round(x.opening_qty*x.unit_cost_snapshot,2) where x.closing_id=p_closing_id;
 update public.inventory_closing_items x set variance_qty=case when x.actual_qty is null then null else x.actual_qty-x.expected_qty end,expected_value=round(x.expected_qty*x.unit_cost_snapshot,2),actual_value=case when x.actual_qty is null then null else round(x.actual_qty*x.unit_cost_snapshot,2) end,variance_value=case when x.actual_qty is null then null else round((x.actual_qty-x.expected_qty)*x.unit_cost_snapshot,2) end where x.closing_id=p_closing_id;
 select coalesce(sum(s.total),0) into v_sales from public.sales s where s.branch_id=v_branch and s.created_at between v_start and v_end and coalesce(s.status,'')<>'cancelled';
 update public.inventory_closings c set net_sales=round(v_sales,2),opening_value=round(coalesce((select sum(x.opening_value) from public.inventory_closing_items x where x.closing_id=c.id),0),2),purchase_value=round(coalesce((select sum(x.stock_in_value) from public.inventory_closing_items x where x.closing_id=c.id),0),2),theoretical_cost=round(coalesce((select sum(x.theoretical_usage_value) from public.inventory_closing_items x where x.closing_id=c.id),0),2),waste_cost=round(coalesce((select sum(x.waste_value) from public.inventory_closing_items x where x.closing_id=c.id),0),2),adjust_in_value=round(coalesce((select sum(x.adjust_in_value) from public.inventory_closing_items x where x.closing_id=c.id),0),2),adjust_out_value=round(coalesce((select sum(x.adjust_out_value) from public.inventory_closing_items x where x.closing_id=c.id),0),2),expected_closing_value=round(coalesce((select sum(x.expected_value) from public.inventory_closing_items x where x.closing_id=c.id),0),2),actual_closing_value=round(coalesce((select sum(coalesce(x.actual_value,x.expected_value)) from public.inventory_closing_items x where x.closing_id=c.id),0),2),shortage_value=round(coalesce((select sum(case when x.variance_value<0 then abs(x.variance_value) else 0 end) from public.inventory_closing_items x where x.closing_id=c.id),0),2),overage_value=round(coalesce((select sum(case when x.variance_value>0 then x.variance_value else 0 end) from public.inventory_closing_items x where x.closing_id=c.id),0),2),actual_control_cost=round(coalesce((select sum(x.theoretical_usage_value+x.waste_value+x.adjust_out_value+case when x.variance_value<0 then abs(x.variance_value) else 0 end-x.adjust_in_value-case when x.variance_value>0 then x.variance_value else 0 end) from public.inventory_closing_items x where x.closing_id=c.id),0),2),total_items=(select count(*) from public.inventory_closing_items x where x.closing_id=c.id),counted_items=(select count(*) from public.inventory_closing_items x where x.closing_id=c.id and x.was_counted),coverage_pct=case when (select count(*) from public.inventory_closing_items x where x.closing_id=c.id)=0 then 0 else round((select count(*) from public.inventory_closing_items x where x.closing_id=c.id and x.was_counted)::numeric/(select count(*) from public.inventory_closing_items x where x.closing_id=c.id)::numeric*100,2) end,updated_at=now() where c.id=p_closing_id;
 update public.inventory_closings c set theoretical_cost_pct=case when c.net_sales>0 then round(c.theoretical_cost/c.net_sales*100,4) else 0 end,actual_cost_pct=case when c.net_sales>0 then round(c.actual_control_cost/c.net_sales*100,4) else 0 end,variance_cost_pct=case when c.net_sales>0 then round((c.actual_control_cost-c.theoretical_cost)/c.net_sales*100,4) else 0 end where c.id=p_closing_id;
 return true;end $$;
revoke all on function public._bo_refresh_closing_items(uuid) from public;

-- K) closing public RPC
create or replace function public.backoffice_list_completed_counts_for_closing() returns table(id uuid,count_no text,count_type text,counted_at timestamptz,item_count bigint) language plpgsql security definer set search_path=public as $$
declare v_branch uuid;begin select x.branch_id into v_branch from public._bo_ctx() x;if v_branch is null then raise exception 'BACKOFFICE_PERMISSION_DENIED';end if;return query select sc.id,sc.count_no,sc.count_type,sc.counted_at,count(sci.id) from public.stock_counts sc left join public.stock_count_items sci on sci.stock_count_id=sc.id where sc.branch_id=v_branch and sc.status='completed' group by sc.id order by sc.counted_at desc nulls last,sc.created_at desc limit 100;end $$;

create or replace function public.backoffice_create_inventory_closing(p_period_type text,p_period_start timestamptz,p_period_end timestamptz,p_stock_count_id uuid,p_note text) returns uuid language plpgsql security definer set search_path=public as $$
declare v_user uuid;v_branch uuid;v_id uuid;v_no text;begin select x.user_id,x.branch_id into v_user,v_branch from public._bo_ctx() x;if v_branch is null then raise exception 'BACKOFFICE_PERMISSION_DENIED';end if;if p_period_type not in('daily','weekly','monthly','custom') then raise exception 'INVALID_PERIOD_TYPE';end if;if p_period_start is null or p_period_end is null or p_period_end<p_period_start then raise exception 'INVALID_PERIOD';end if;
 if p_stock_count_id is not null and not exists(select 1 from public.stock_counts sc where sc.id=p_stock_count_id and sc.branch_id=v_branch and sc.status='completed') then raise exception 'COMPLETED_STOCK_COUNT_REQUIRED';end if;
 if exists(select 1 from public.inventory_closings c where c.branch_id=v_branch and c.status='closed' and tstzrange(c.period_start,c.period_end,'[]')&&tstzrange(p_period_start,p_period_end,'[]')) then raise exception 'CLOSING_PERIOD_OVERLAPS';end if;
 v_no:=public._bo_next_closing_no();insert into public.inventory_closings(branch_id,closing_no,period_type,period_start,period_end,stock_count_id,status,note,created_by) values(v_branch,v_no,p_period_type,p_period_start,p_period_end,p_stock_count_id,'draft',nullif(trim(coalesce(p_note,'')),''),v_user) returning id into v_id;perform public._bo_refresh_closing_items(v_id);insert into public.inventory_closing_audit(closing_id,action,reason,acted_by) values(v_id,'create','สร้าง Draft Closing',v_user);return v_id;end $$;

create or replace function public.backoffice_refresh_inventory_closing(p_closing_id uuid) returns boolean language plpgsql security definer set search_path=public as $$
declare v_user uuid;v_branch uuid;begin select x.user_id,x.branch_id into v_user,v_branch from public._bo_ctx() x;if not exists(select 1 from public.inventory_closings where id=p_closing_id and branch_id=v_branch and status='draft') then raise exception 'CLOSING_NOT_EDITABLE';end if;perform public._bo_refresh_closing_items(p_closing_id);insert into public.inventory_closing_audit(closing_id,action,reason,acted_by) values(p_closing_id,'refresh','Refresh Snapshot',v_user);return true;end $$;

create or replace function public.backoffice_list_inventory_closings() returns table(id uuid,closing_no text,period_type text,period_start timestamptz,period_end timestamptz,status text,net_sales numeric,theoretical_cost numeric,actual_control_cost numeric,theoretical_cost_pct numeric,actual_cost_pct numeric,variance_cost_pct numeric,shortage_value numeric,overage_value numeric,coverage_pct numeric,created_at timestamptz,closed_at timestamptz,closed_by_name text) language plpgsql security definer set search_path=public as $$
declare v_branch uuid;begin select x.branch_id into v_branch from public._bo_ctx() x;if v_branch is null then raise exception 'BACKOFFICE_PERMISSION_DENIED';end if;return query select c.id,c.closing_no,c.period_type,c.period_start,c.period_end,c.status,c.net_sales,c.theoretical_cost,c.actual_control_cost,c.theoretical_cost_pct,c.actual_cost_pct,c.variance_cost_pct,c.shortage_value,c.overage_value,c.coverage_pct,c.created_at,c.closed_at,p.full_name from public.inventory_closings c left join public.profiles p on p.id=c.closed_by where c.branch_id=v_branch order by c.period_end desc,c.created_at desc;end $$;

create or replace function public.backoffice_get_inventory_closing(p_closing_id uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_branch uuid;v_result jsonb;begin select x.branch_id into v_branch from public._bo_ctx() x;if v_branch is null then raise exception 'BACKOFFICE_PERMISSION_DENIED';end if;
 select jsonb_build_object('id',c.id,'closing_no',c.closing_no,'period_type',c.period_type,'period_start',c.period_start,'period_end',c.period_end,'status',c.status,'stock_count_id',c.stock_count_id,'note',c.note,'net_sales',c.net_sales,'opening_value',c.opening_value,'purchase_value',c.purchase_value,'theoretical_cost',c.theoretical_cost,'waste_cost',c.waste_cost,'adjust_in_value',c.adjust_in_value,'adjust_out_value',c.adjust_out_value,'expected_closing_value',c.expected_closing_value,'actual_closing_value',c.actual_closing_value,'shortage_value',c.shortage_value,'overage_value',c.overage_value,'actual_control_cost',c.actual_control_cost,'theoretical_cost_pct',c.theoretical_cost_pct,'actual_cost_pct',c.actual_cost_pct,'variance_cost_pct',c.variance_cost_pct,'counted_items',c.counted_items,'total_items',c.total_items,'coverage_pct',c.coverage_pct,'created_at',c.created_at,'closed_at',c.closed_at,
 'items',coalesce((select jsonb_agg(to_jsonb(x) order by x.category_name,x.ingredient_name) from public.inventory_closing_items x where x.closing_id=c.id),'[]'::jsonb),
 'categories',coalesce((select jsonb_agg(jsonb_build_object('category_name',z.category_name,'theoretical_cost',z.theoretical_cost,'waste_cost',z.waste_cost,'shortage_value',z.shortage_value,'overage_value',z.overage_value,'actual_control_cost',z.actual_control_cost) order by z.category_name) from(select x.category_name,round(sum(x.theoretical_usage_value),2) theoretical_cost,round(sum(x.waste_value),2) waste_cost,round(sum(case when x.variance_value<0 then abs(x.variance_value) else 0 end),2) shortage_value,round(sum(case when x.variance_value>0 then x.variance_value else 0 end),2) overage_value,round(sum(x.theoretical_usage_value+x.waste_value+x.adjust_out_value+case when x.variance_value<0 then abs(x.variance_value) else 0 end-x.adjust_in_value-case when x.variance_value>0 then x.variance_value else 0 end),2) actual_control_cost from public.inventory_closing_items x where x.closing_id=c.id group by x.category_name)z),'[]'::jsonb),
 'audit',coalesce((select jsonb_agg(jsonb_build_object('action',a.action,'reason',a.reason,'acted_at',a.acted_at,'acted_by_name',p.full_name) order by a.acted_at desc) from public.inventory_closing_audit a left join public.profiles p on p.id=a.acted_by where a.closing_id=c.id),'[]'::jsonb)) into v_result from public.inventory_closings c where c.id=p_closing_id and c.branch_id=v_branch;if v_result is null then raise exception 'CLOSING_NOT_FOUND';end if;return v_result;end $$;

create or replace function public.backoffice_close_inventory_closing(p_closing_id uuid) returns boolean language plpgsql security definer set search_path=public as $$
declare v_user uuid;v_branch uuid;v_count uuid;begin select x.user_id,x.branch_id into v_user,v_branch from public._bo_ctx() x;select c.stock_count_id into v_count from public.inventory_closings c where c.id=p_closing_id and c.branch_id=v_branch and c.status='draft' for update;if not found then raise exception 'CLOSING_NOT_EDITABLE';end if;if v_count is null then raise exception 'STOCK_COUNT_REQUIRED_TO_CLOSE';end if;perform public._bo_refresh_closing_items(p_closing_id);update public.inventory_closings set status='closed',closed_by=v_user,closed_at=now(),updated_at=now() where id=p_closing_id;insert into public.inventory_closing_audit(closing_id,action,reason,acted_by) values(p_closing_id,'close','ปิดรอบ Stock',v_user);return true;end $$;

create or replace function public.backoffice_reopen_inventory_closing(p_closing_id uuid,p_reason text) returns boolean language plpgsql security definer set search_path=public as $$
declare v_user uuid;v_branch uuid;v_role text;begin select x.user_id,x.branch_id,x.role into v_user,v_branch,v_role from public._bo_ctx() x;if v_role<>'admin' then raise exception 'ADMIN_REQUIRED';end if;if trim(coalesce(p_reason,''))='' then raise exception 'REOPEN_REASON_REQUIRED';end if;if not exists(select 1 from public.inventory_closings where id=p_closing_id and branch_id=v_branch and status='closed') then raise exception 'CLOSING_NOT_CLOSED';end if;update public.inventory_closings set status='draft',closed_by=null,closed_at=null,updated_at=now() where id=p_closing_id;insert into public.inventory_closing_audit(closing_id,action,reason,acted_by) values(p_closing_id,'reopen',trim(p_reason),v_user);return true;end $$;

-- L) Cost Control dashboard
create or replace function public.backoffice_cost_control_dashboard() returns jsonb language plpgsql security definer set search_path=public as $$
declare v_branch uuid;v_result jsonb;begin select x.branch_id into v_branch from public._bo_ctx() x;if v_branch is null then raise exception 'BACKOFFICE_PERMISSION_DENIED';end if;select jsonb_build_object('latest',(select to_jsonb(c) from public.inventory_closings c where c.branch_id=v_branch and c.status='closed' order by c.period_end desc limit 1),'recent',coalesce((select jsonb_agg(to_jsonb(r) order by r.period_end) from(select c.id,c.closing_no,c.period_type,c.period_end,c.net_sales,c.theoretical_cost,c.actual_control_cost,c.theoretical_cost_pct,c.actual_cost_pct,c.variance_cost_pct,c.shortage_value,c.waste_cost,c.coverage_pct from public.inventory_closings c where c.branch_id=v_branch and c.status='closed' order by c.period_end desc limit 12)r),'[]'::jsonb)) into v_result;return v_result;end $$;

-- M) grants
grant execute on function public.backoffice_list_ingredient_categories() to authenticated;
grant execute on function public.backoffice_save_ingredient_category(uuid,text,integer,boolean) to authenticated;
grant execute on function public.backoffice_list_ingredients_v3() to authenticated;
grant execute on function public.backoffice_save_ingredient_v3(uuid,text,text,numeric,numeric,boolean,uuid,text) to authenticated;
grant execute on function public.backoffice_create_stock_count_v3(text,text) to authenticated;
grant execute on function public.backoffice_list_stock_counts_v3() to authenticated;
grant execute on function public.backoffice_get_stock_count_v3(uuid) to authenticated;
grant execute on function public.backoffice_stock_report_v3(timestamptz,timestamptz,uuid) to authenticated;
grant execute on function public.backoffice_list_completed_counts_for_closing() to authenticated;
grant execute on function public.backoffice_create_inventory_closing(text,timestamptz,timestamptz,uuid,text) to authenticated;
grant execute on function public.backoffice_refresh_inventory_closing(uuid) to authenticated;
grant execute on function public.backoffice_list_inventory_closings() to authenticated;
grant execute on function public.backoffice_get_inventory_closing(uuid) to authenticated;
grant execute on function public.backoffice_close_inventory_closing(uuid) to authenticated;
grant execute on function public.backoffice_reopen_inventory_closing(uuid,text) to authenticated;
grant execute on function public.backoffice_cost_control_dashboard() to authenticated;

commit;
select 'JOKJUNG STOCK V3 COST CONTROL READY' as result;
