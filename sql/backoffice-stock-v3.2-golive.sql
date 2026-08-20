-- =====================================================================
-- JOKJUNG BACK OFFICE — STOCK V3.2 GO-LIVE
-- รันต่อจาก V3.1 Production
--
-- ไม่ลบข้อมูลทดลอง
-- Go-Live + Opening Stock + Report/Closing boundary
-- =====================================================================

begin;

alter table public.ingredient_stock_movements
    drop constraint if exists ingredient_stock_movement_type_check;

alter table public.ingredient_stock_movements
    add constraint ingredient_stock_movement_type_check
    check (
        movement_type in (
            'opening','stock_in','adjust_in','adjust_out','sale','void','waste',
            'production_in','production_out'
        )
    );

create table if not exists public.branch_go_live_settings (
    branch_id uuid primary key references public.branches(id) on delete cascade,
    go_live_at timestamptz,
    status text not null default 'not_live'
        check(status in ('not_live','live')),
    note text,
    activated_by uuid references public.profiles(id),
    activated_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.opening_stock_batches (
    id uuid primary key default gen_random_uuid(),
    branch_id uuid not null references public.branches(id) on delete cascade,
    go_live_at timestamptz not null,
    note text,
    posted_by uuid references public.profiles(id),
    posted_at timestamptz not null default now(),
    unique(branch_id)
);

create table if not exists public.opening_stock_items (
    id uuid primary key default gen_random_uuid(),
    opening_stock_batch_id uuid not null references public.opening_stock_batches(id) on delete cascade,
    ingredient_id uuid not null references public.ingredients(id) on delete restrict,
    opening_qty numeric(14,3) not null check(opening_qty >= 0),
    unit_cost numeric(14,4) not null check(unit_cost >= 0),
    opening_value numeric(14,2) not null default 0,
    previous_test_qty numeric(14,3) not null default 0,
    created_at timestamptz not null default now(),
    unique(opening_stock_batch_id,ingredient_id)
);

alter table public.branch_go_live_settings enable row level security;
alter table public.opening_stock_batches enable row level security;
alter table public.opening_stock_items enable row level security;

drop policy if exists branch_go_live_settings_read on public.branch_go_live_settings;
create policy branch_go_live_settings_read
on public.branch_go_live_settings for select to authenticated
using (
    exists (
        select 1 from public.profiles p
        where p.id=auth.uid()
          and p.branch_id=branch_go_live_settings.branch_id
          and lower(trim(coalesce(p.role,''))) in ('admin','manager')
    )
);

drop policy if exists opening_stock_batches_read on public.opening_stock_batches;
create policy opening_stock_batches_read
on public.opening_stock_batches for select to authenticated
using (
    exists (
        select 1 from public.profiles p
        where p.id=auth.uid()
          and p.branch_id=opening_stock_batches.branch_id
          and lower(trim(coalesce(p.role,''))) in ('admin','manager')
    )
);

drop policy if exists opening_stock_items_read on public.opening_stock_items;
create policy opening_stock_items_read
on public.opening_stock_items for select to authenticated
using (
    exists (
        select 1
        from public.opening_stock_batches b
        join public.profiles p on p.id=auth.uid()
        where b.id=opening_stock_items.opening_stock_batch_id
          and p.branch_id=b.branch_id
          and lower(trim(coalesce(p.role,''))) in ('admin','manager')
    )
);

create or replace function public.backoffice_get_go_live_status()
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
    v_branch uuid;
    v_role text;
    v_result jsonb;
begin
    select x.branch_id,x.role into v_branch,v_role from public._bo_ctx() x;
    if v_branch is null then raise exception 'BACKOFFICE_PERMISSION_DENIED'; end if;

    select jsonb_build_object(
        'branch_id',v_branch,
        'status',coalesce(g.status,'not_live'),
        'go_live_at',g.go_live_at,
        'note',g.note,
        'activated_at',g.activated_at,
        'activated_by_name',p.full_name,
        'can_activate',(v_role='admin'),
        'opening_batch_id',b.id,
        'opening_item_count',coalesce((
            select count(*) from public.opening_stock_items oi
            where oi.opening_stock_batch_id=b.id
        ),0),
        'opening_value',coalesce((
            select sum(oi.opening_value) from public.opening_stock_items oi
            where oi.opening_stock_batch_id=b.id
        ),0)
    )
    into v_result
    from (select 1) q
    left join public.branch_go_live_settings g on g.branch_id=v_branch
    left join public.profiles p on p.id=g.activated_by
    left join public.opening_stock_batches b on b.branch_id=v_branch;

    return v_result;
end
$$;

create or replace function public.backoffice_go_live_preview(p_go_live_at timestamptz)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
    v_branch uuid;
    v_movement_count bigint:=0;
    v_sales_count bigint:=0;
    v_production_count bigint:=0;
begin
    select x.branch_id into v_branch from public._bo_ctx() x;
    if v_branch is null then raise exception 'BACKOFFICE_PERMISSION_DENIED'; end if;
    if p_go_live_at is null then raise exception 'GO_LIVE_AT_REQUIRED'; end if;

    select count(*) into v_movement_count
    from public.ingredient_stock_movements
    where branch_id=v_branch and created_at>=p_go_live_at;

    select count(*) into v_sales_count
    from public.sales
    where branch_id=v_branch and created_at>=p_go_live_at;

    select count(*) into v_production_count
    from public.production_batches
    where branch_id=v_branch and created_at>=p_go_live_at;

    return jsonb_build_object(
        'movement_count',v_movement_count,
        'sales_count',v_sales_count,
        'production_count',v_production_count,
        'has_conflict',(v_movement_count+v_sales_count+v_production_count)>0
    );
end
$$;

create or replace function public.backoffice_activate_go_live(
    p_go_live_at timestamptz,
    p_items jsonb,
    p_note text
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
    v_batch uuid;
    v_row jsonb;
    v_ing uuid;
    v_qty numeric;
    v_cost numeric;
    v_before numeric;
    v_count integer:=0;
    v_value numeric:=0;
    v_conflicts bigint:=0;
begin
    select x.user_id,x.branch_id,x.role
    into v_user,v_branch,v_role
    from public._bo_ctx() x;

    if v_branch is null then raise exception 'BACKOFFICE_PERMISSION_DENIED'; end if;
    if v_role<>'admin' then raise exception 'ADMIN_REQUIRED'; end if;
    if p_go_live_at is null then raise exception 'GO_LIVE_AT_REQUIRED'; end if;

    if exists (
        select 1 from public.branch_go_live_settings
        where branch_id=v_branch and status='live'
    ) then raise exception 'GO_LIVE_ALREADY_ACTIVE'; end if;

    if jsonb_array_length(coalesce(p_items,'[]'::jsonb))=0 then
        raise exception 'OPENING_STOCK_REQUIRED';
    end if;

    select
        (select count(*) from public.ingredient_stock_movements
         where branch_id=v_branch and created_at>=p_go_live_at)
        +
        (select count(*) from public.sales
         where branch_id=v_branch and created_at>=p_go_live_at)
        +
        (select count(*) from public.production_batches
         where branch_id=v_branch and created_at>=p_go_live_at)
    into v_conflicts;

    if v_conflicts>0 then
        raise exception 'GO_LIVE_TIME_HAS_EXISTING_TRANSACTIONS';
    end if;

    insert into public.opening_stock_batches(
        branch_id,go_live_at,note,posted_by
    ) values(
        v_branch,p_go_live_at,nullif(trim(coalesce(p_note,'')),''),v_user
    )
    returning id into v_batch;

    for v_row in select * from jsonb_array_elements(p_items)
    loop
        v_ing:=(v_row->>'ingredient_id')::uuid;
        v_qty:=coalesce((v_row->>'opening_qty')::numeric,0);
        v_cost:=coalesce((v_row->>'unit_cost')::numeric,0);

        if v_qty<0 or v_cost<0 then raise exception 'INVALID_OPENING_STOCK'; end if;

        select i.current_stock into v_before
        from public.ingredients i
        where i.id=v_ing and i.branch_id=v_branch and i.is_active=true
        for update;

        if not found then raise exception 'INGREDIENT_NOT_FOUND'; end if;

        insert into public.opening_stock_items(
            opening_stock_batch_id,ingredient_id,opening_qty,unit_cost,
            opening_value,previous_test_qty
        ) values(
            v_batch,v_ing,v_qty,v_cost,round(v_qty*v_cost,2),coalesce(v_before,0)
        );

        update public.ingredients
        set current_stock=v_qty,
            cost_per_unit=v_cost,
            updated_at=now()
        where id=v_ing;

        insert into public.ingredient_stock_movements(
            branch_id,ingredient_id,movement_type,quantity,
            stock_before,stock_after,unit_cost,note,created_by,created_at
        ) values(
            v_branch,v_ing,'opening',v_qty,
            coalesce(v_before,0),v_qty,v_cost,
            'GO-LIVE OPENING STOCK',v_user,p_go_live_at
        );

        v_count:=v_count+1;
        v_value:=v_value+round(v_qty*v_cost,2);
    end loop;

    insert into public.branch_go_live_settings(
        branch_id,go_live_at,status,note,activated_by,activated_at
    ) values(
        v_branch,p_go_live_at,'live',
        nullif(trim(coalesce(p_note,'')),''),
        v_user,now()
    )
    on conflict(branch_id) do update
    set go_live_at=excluded.go_live_at,
        status='live',
        note=excluded.note,
        activated_by=excluded.activated_by,
        activated_at=excluded.activated_at,
        updated_at=now();

    return jsonb_build_object(
        'status','live',
        'go_live_at',p_go_live_at,
        'opening_items',v_count,
        'opening_value',round(v_value,2)
    );
end
$$;

create or replace function public._bo_effective_start(p_requested timestamptz)
returns timestamptz
language plpgsql
security definer
set search_path=public
as $$
declare
    v_branch uuid;
    v_go_live timestamptz;
begin
    select x.branch_id into v_branch from public._bo_ctx() x;
    if v_branch is null then raise exception 'BACKOFFICE_PERMISSION_DENIED'; end if;

    select go_live_at into v_go_live
    from public.branch_go_live_settings
    where branch_id=v_branch and status='live';

    if v_go_live is null then return p_requested; end if;
    return greatest(p_requested,v_go_live);
end
$$;
revoke all on function public._bo_effective_start(timestamptz) from public;

create or replace function public.backoffice_stock_report_v31(
    p_from timestamptz,p_to timestamptz,p_category_id uuid default null,
    p_ingredient_type text default null
)
returns table(
    ingredient_id uuid,name text,unit text,category_id uuid,category_name text,
    ingredient_type text,count_frequency text,current_stock numeric,min_stock numeric,
    cost_per_unit numeric,stock_value numeric,
    stock_in_qty numeric,stock_in_value numeric,
    production_in_qty numeric,production_in_value numeric,
    production_out_qty numeric,production_out_value numeric,
    sale_qty numeric,sale_value numeric,waste_qty numeric,waste_value numeric,
    adjust_in_qty numeric,adjust_in_value numeric,adjust_out_qty numeric,adjust_out_value numeric,
    void_qty numeric,void_value numeric,movement_count bigint,last_movement_at timestamptz,status text
)
language plpgsql
security definer
set search_path=public
as $$
declare
    v_branch uuid;
    v_from timestamptz;
begin
    select x.branch_id into v_branch from public._bo_ctx() x;
    if v_branch is null then raise exception 'BACKOFFICE_PERMISSION_DENIED'; end if;
    if p_from is null or p_to is null or p_to<p_from then raise exception 'INVALID_PERIOD'; end if;

    v_from:=public._bo_effective_start(p_from);
    if p_to<v_from then return; end if;

    return query
    select
        i.id,i.name,i.unit,i.category_id,coalesce(c.name,'อื่นๆ'),i.ingredient_type,i.count_frequency,
        i.current_stock,i.min_stock,i.cost_per_unit,round(i.current_stock*i.cost_per_unit,2)::numeric,
        coalesce(sum(m.quantity) filter(where m.movement_type='stock_in'),0)::numeric,
        coalesce(sum(m.quantity*m.unit_cost) filter(where m.movement_type='stock_in'),0)::numeric,
        coalesce(sum(m.quantity) filter(where m.movement_type='production_in'),0)::numeric,
        coalesce(sum(m.quantity*m.unit_cost) filter(where m.movement_type='production_in'),0)::numeric,
        coalesce(sum(m.quantity) filter(where m.movement_type='production_out'),0)::numeric,
        coalesce(sum(m.quantity*m.unit_cost) filter(where m.movement_type='production_out'),0)::numeric,
        coalesce(sum(m.quantity) filter(where m.movement_type='sale'),0)::numeric,
        coalesce(sum(m.quantity*m.unit_cost) filter(where m.movement_type='sale'),0)::numeric,
        coalesce(sum(m.quantity) filter(where m.movement_type='waste'),0)::numeric,
        coalesce(sum(m.quantity*m.unit_cost) filter(where m.movement_type='waste'),0)::numeric,
        coalesce(sum(m.quantity) filter(where m.movement_type='adjust_in' and coalesce(m.note,'') not like 'Stock Count %'),0)::numeric,
        coalesce(sum(m.quantity*m.unit_cost) filter(where m.movement_type='adjust_in' and coalesce(m.note,'') not like 'Stock Count %'),0)::numeric,
        coalesce(sum(m.quantity) filter(where m.movement_type='adjust_out' and coalesce(m.note,'') not like 'Stock Count %'),0)::numeric,
        coalesce(sum(m.quantity*m.unit_cost) filter(where m.movement_type='adjust_out' and coalesce(m.note,'') not like 'Stock Count %'),0)::numeric,
        coalesce(sum(m.quantity) filter(where m.movement_type='void'),0)::numeric,
        coalesce(sum(m.quantity*m.unit_cost) filter(where m.movement_type='void'),0)::numeric,
        count(m.id),max(m.created_at),
        case when not i.is_active then 'inactive'
             when i.current_stock<=0 then 'out'
             when i.current_stock<=i.min_stock then 'low'
             else 'ok' end
    from public.ingredients i
    left join public.ingredient_categories c on c.id=i.category_id
    left join public.ingredient_stock_movements m
      on m.ingredient_id=i.id and m.branch_id=i.branch_id
     and m.created_at>=v_from and m.created_at<=p_to
     and m.movement_type<>'opening'
    where i.branch_id=v_branch
      and (p_category_id is null or i.category_id=p_category_id)
      and (p_ingredient_type is null or i.ingredient_type=p_ingredient_type)
    group by i.id,c.id,c.name,c.display_order
    order by coalesce(c.display_order,999),coalesce(c.name,'อื่นๆ'),i.name;
end
$$;

create or replace function public.backoffice_production_summary(
    p_from timestamptz,p_to timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
    v_branch uuid;
    v_from timestamptz;
    v_result jsonb;
begin
    select x.branch_id into v_branch from public._bo_ctx() x;
    if v_branch is null then raise exception 'BACKOFFICE_PERMISSION_DENIED'; end if;

    v_from:=public._bo_effective_start(p_from);

    select jsonb_build_object(
        'batch_count',count(*),
        'input_cost',coalesce(sum(b.total_input_cost),0),
        'yield_loss_value',coalesce(sum(b.yield_loss_value),0),
        'avg_yield_pct',coalesce(avg(b.actual_yield_pct) filter(where b.actual_yield_pct is not null),0),
        'below_standard_count',count(*) filter(where b.yield_variance_pct<0)
    )
    into v_result
    from public.production_batches b
    where b.branch_id=v_branch and b.status='posted'
      and b.created_at>=v_from and b.created_at<=p_to;

    return v_result;
end
$$;

create or replace function public.backoffice_create_inventory_closing(
    p_period_type text,p_period_start timestamptz,p_period_end timestamptz,
    p_stock_count_id uuid,p_note text
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
    v_user uuid;
    v_branch uuid;
    v_id uuid;
    v_no text;
    v_go_live timestamptz;
begin
    select x.user_id,x.branch_id into v_user,v_branch from public._bo_ctx() x;
    if v_branch is null then raise exception 'BACKOFFICE_PERMISSION_DENIED'; end if;
    if p_period_type not in ('daily','weekly','monthly','custom') then raise exception 'INVALID_PERIOD_TYPE'; end if;
    if p_period_start is null or p_period_end is null or p_period_end<p_period_start then raise exception 'INVALID_PERIOD'; end if;

    select go_live_at into v_go_live
    from public.branch_go_live_settings
    where branch_id=v_branch and status='live';

    if v_go_live is null then raise exception 'GO_LIVE_REQUIRED'; end if;
    if p_period_start<v_go_live then raise exception 'CLOSING_BEFORE_GO_LIVE_NOT_ALLOWED'; end if;

    if p_stock_count_id is not null and not exists(
        select 1 from public.stock_counts sc
        where sc.id=p_stock_count_id and sc.branch_id=v_branch and sc.status='completed'
    ) then raise exception 'COMPLETED_STOCK_COUNT_REQUIRED'; end if;

    if exists(
        select 1 from public.inventory_closings c
        where c.branch_id=v_branch and c.status='closed'
          and tstzrange(c.period_start,c.period_end,'[]')
              && tstzrange(p_period_start,p_period_end,'[]')
    ) then raise exception 'CLOSING_PERIOD_OVERLAPS'; end if;

    v_no:=public._bo_next_closing_no();

    insert into public.inventory_closings(
        branch_id,closing_no,period_type,period_start,period_end,
        stock_count_id,status,note,created_by
    ) values(
        v_branch,v_no,p_period_type,p_period_start,p_period_end,
        p_stock_count_id,'draft',nullif(trim(coalesce(p_note,'')),''),v_user
    ) returning id into v_id;

    perform public._bo_refresh_closing_items(v_id);

    insert into public.inventory_closing_audit(closing_id,action,reason,acted_by)
    values(v_id,'create','สร้าง Draft Closing หลัง Go-Live',v_user);

    return v_id;
end
$$;

grant execute on function public.backoffice_get_go_live_status() to authenticated;
grant execute on function public.backoffice_go_live_preview(timestamptz) to authenticated;
grant execute on function public.backoffice_activate_go_live(timestamptz,jsonb,text) to authenticated;

commit;

select 'JOKJUNG STOCK V3.2 GO-LIVE READY' as result;
