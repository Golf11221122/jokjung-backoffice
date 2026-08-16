-- =====================================================================
-- JOKJUNG BACK OFFICE — STOCK V3.1 PRODUCTION / RAW INGREDIENT
-- รันต่อจาก Stock V3 Cost Control
-- =====================================================================

begin;

-- 1) Ingredient type / standard yield
alter table public.ingredients
    add column if not exists ingredient_type text not null default 'raw';

alter table public.ingredients
    add column if not exists standard_yield_pct numeric(10,4);

do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conname='ingredients_ingredient_type_check'
          and conrelid='public.ingredients'::regclass
    ) then
        alter table public.ingredients
        add constraint ingredients_ingredient_type_check
        check (ingredient_type in ('raw','prep','beverage','packaging','consumable'));
    end if;
end $$;

-- 2) Movement types for production
alter table public.ingredient_stock_movements
    drop constraint if exists ingredient_stock_movement_type_check;

alter table public.ingredient_stock_movements
    add constraint ingredient_stock_movement_type_check
    check (
        movement_type in (
            'stock_in','adjust_in','adjust_out','sale','void','waste',
            'production_in','production_out'
        )
    );

-- 3) Prep / production recipes
create table if not exists public.production_recipes (
    id uuid primary key default gen_random_uuid(),
    branch_id uuid not null references public.branches(id) on delete cascade,
    output_ingredient_id uuid not null references public.ingredients(id) on delete restrict,
    standard_output_qty numeric(14,3) not null default 1 check(standard_output_qty>0),
    standard_yield_pct numeric(10,4),
    note text,
    is_active boolean not null default true,
    created_by uuid references public.profiles(id),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique(branch_id,output_ingredient_id)
);

create table if not exists public.production_recipe_inputs (
    id uuid primary key default gen_random_uuid(),
    production_recipe_id uuid not null references public.production_recipes(id) on delete cascade,
    ingredient_id uuid not null references public.ingredients(id) on delete restrict,
    input_qty numeric(14,3) not null check(input_qty>0),
    is_yield_basis boolean not null default false,
    note text,
    created_at timestamptz not null default now(),
    unique(production_recipe_id,ingredient_id)
);

-- 4) Actual production batches
create table if not exists public.production_batches (
    id uuid primary key default gen_random_uuid(),
    branch_id uuid not null references public.branches(id) on delete cascade,
    batch_no text not null,
    production_recipe_id uuid references public.production_recipes(id) on delete set null,
    output_ingredient_id uuid not null references public.ingredients(id) on delete restrict,
    actual_output_qty numeric(14,3) not null check(actual_output_qty>0),
    basis_input_qty numeric(14,3),
    actual_yield_pct numeric(10,4),
    standard_yield_pct numeric(10,4),
    yield_variance_pct numeric(10,4),
    yield_loss_value numeric(14,2) not null default 0,
    total_input_cost numeric(14,2) not null default 0,
    output_unit_cost numeric(14,4) not null default 0,
    note text,
    status text not null default 'posted' check(status in ('posted','voided')),
    created_by uuid references public.profiles(id),
    created_at timestamptz not null default now(),
    voided_by uuid references public.profiles(id),
    voided_at timestamptz,
    void_reason text,
    unique(branch_id,batch_no)
);

create table if not exists public.production_batch_inputs (
    id uuid primary key default gen_random_uuid(),
    production_batch_id uuid not null references public.production_batches(id) on delete cascade,
    ingredient_id uuid not null references public.ingredients(id) on delete restrict,
    quantity numeric(14,3) not null check(quantity>0),
    unit_cost numeric(14,4) not null default 0,
    line_cost numeric(14,2) not null default 0,
    is_yield_basis boolean not null default false,
    created_at timestamptz not null default now(),
    unique(production_batch_id,ingredient_id)
);

create index if not exists ix_production_batches_branch_created
on public.production_batches(branch_id,created_at desc);

alter table public.production_recipes enable row level security;
alter table public.production_recipe_inputs enable row level security;
alter table public.production_batches enable row level security;
alter table public.production_batch_inputs enable row level security;

drop policy if exists production_recipes_bo_read on public.production_recipes;
create policy production_recipes_bo_read on public.production_recipes
for select to authenticated
using (
    exists (
        select 1 from public.profiles p
        where p.id=auth.uid()
          and p.branch_id=production_recipes.branch_id
          and lower(trim(coalesce(p.role,''))) in ('admin','manager')
    )
);

drop policy if exists production_recipe_inputs_bo_read on public.production_recipe_inputs;
create policy production_recipe_inputs_bo_read on public.production_recipe_inputs
for select to authenticated
using (
    exists (
        select 1 from public.production_recipes r
        join public.profiles p on p.id=auth.uid()
        where r.id=production_recipe_inputs.production_recipe_id
          and p.branch_id=r.branch_id
          and lower(trim(coalesce(p.role,''))) in ('admin','manager')
    )
);

drop policy if exists production_batches_bo_read on public.production_batches;
create policy production_batches_bo_read on public.production_batches
for select to authenticated
using (
    exists (
        select 1 from public.profiles p
        where p.id=auth.uid()
          and p.branch_id=production_batches.branch_id
          and lower(trim(coalesce(p.role,''))) in ('admin','manager')
    )
);

drop policy if exists production_batch_inputs_bo_read on public.production_batch_inputs;
create policy production_batch_inputs_bo_read on public.production_batch_inputs
for select to authenticated
using (
    exists (
        select 1 from public.production_batches b
        join public.profiles p on p.id=auth.uid()
        where b.id=production_batch_inputs.production_batch_id
          and p.branch_id=b.branch_id
          and lower(trim(coalesce(p.role,''))) in ('admin','manager')
    )
);

-- 5) Closing snapshot production columns
alter table public.inventory_closings
    add column if not exists production_yield_loss_value numeric(14,2) not null default 0;

alter table public.inventory_closing_items
    add column if not exists production_in_qty numeric(14,3) not null default 0;
alter table public.inventory_closing_items
    add column if not exists production_out_qty numeric(14,3) not null default 0;
alter table public.inventory_closing_items
    add column if not exists production_in_value numeric(14,2) not null default 0;
alter table public.inventory_closing_items
    add column if not exists production_out_value numeric(14,2) not null default 0;

-- 6) Helpers
create or replace function public._bo_next_production_batch_no()
returns text
language plpgsql
security definer
set search_path=public
as $$
declare
    v_branch uuid;
    v_date text:=to_char(current_date,'YYYYMMDD');
    v_seq integer:=1;
    v_no text;
begin
    select x.branch_id into v_branch from public._bo_ctx() x;
    if v_branch is null then raise exception 'BACKOFFICE_PERMISSION_DENIED'; end if;

    loop
        v_no:='PB-'||v_date||'-'||lpad(v_seq::text,4,'0');
        exit when not exists(
            select 1 from public.production_batches
            where branch_id=v_branch and batch_no=v_no
        );
        v_seq:=v_seq+1;
    end loop;
    return v_no;
end
$$;
revoke all on function public._bo_next_production_batch_no() from public;

-- 7) Ingredient V3.1 RPC
create or replace function public.backoffice_list_ingredients_v31()
returns table(
    id uuid,name text,unit text,cost_per_unit numeric,current_stock numeric,
    min_stock numeric,is_active boolean,category_id uuid,category_name text,
    count_frequency text,ingredient_type text,standard_yield_pct numeric,
    created_at timestamptz,updated_at timestamptz
)
language plpgsql
security definer
set search_path=public
as $$
declare v_branch uuid;
begin
    select x.branch_id into v_branch from public._bo_ctx() x;
    if v_branch is null then raise exception 'BACKOFFICE_PERMISSION_DENIED'; end if;

    return query
    select i.id,i.name,i.unit,i.cost_per_unit,i.current_stock,i.min_stock,i.is_active,
           i.category_id,coalesce(c.name,'อื่นๆ'),i.count_frequency,
           i.ingredient_type,i.standard_yield_pct,i.created_at,i.updated_at
    from public.ingredients i
    left join public.ingredient_categories c on c.id=i.category_id
    where i.branch_id=v_branch
    order by coalesce(c.display_order,999),coalesce(c.name,'อื่นๆ'),i.name;
end
$$;

create or replace function public.backoffice_save_ingredient_v31(
    p_ingredient_id uuid,p_name text,p_unit text,p_cost_per_unit numeric,
    p_min_stock numeric,p_is_active boolean,p_category_id uuid,
    p_count_frequency text,p_ingredient_type text,p_standard_yield_pct numeric
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare v_branch uuid;v_id uuid;v_name text:=trim(coalesce(p_name,''));
begin
    select x.branch_id into v_branch from public._bo_ctx() x;
    if v_branch is null then raise exception 'BACKOFFICE_PERMISSION_DENIED'; end if;
    if v_name='' then raise exception 'INGREDIENT_NAME_REQUIRED'; end if;
    if trim(coalesce(p_unit,''))='' then raise exception 'INGREDIENT_UNIT_REQUIRED'; end if;
    if p_count_frequency not in ('daily','weekly','monthly') then raise exception 'INVALID_COUNT_FREQUENCY'; end if;
    if p_ingredient_type not in ('raw','prep','beverage','packaging','consumable') then raise exception 'INVALID_INGREDIENT_TYPE'; end if;
    if p_standard_yield_pct is not null and (p_standard_yield_pct<=0 or p_standard_yield_pct>100) then
        raise exception 'INVALID_STANDARD_YIELD';
    end if;

    if p_category_id is not null and not exists(
        select 1 from public.ingredient_categories c
        where c.id=p_category_id and c.branch_id=v_branch
    ) then raise exception 'CATEGORY_NOT_FOUND'; end if;

    if exists(
        select 1 from public.ingredients i
        where i.branch_id=v_branch
          and lower(trim(i.name))=lower(v_name)
          and i.id is distinct from p_ingredient_id
    ) then raise exception 'INGREDIENT_NAME_EXISTS'; end if;

    if p_ingredient_id is null then
        insert into public.ingredients(
            branch_id,name,unit,cost_per_unit,current_stock,min_stock,is_active,
            category_id,count_frequency,ingredient_type,standard_yield_pct
        ) values(
            v_branch,v_name,trim(p_unit),greatest(coalesce(p_cost_per_unit,0),0),
            0,greatest(coalesce(p_min_stock,0),0),coalesce(p_is_active,true),
            p_category_id,p_count_frequency,p_ingredient_type,
            case when p_ingredient_type='prep' then p_standard_yield_pct else null end
        ) returning id into v_id;
    else
        update public.ingredients
        set name=v_name,unit=trim(p_unit),
            cost_per_unit=greatest(coalesce(p_cost_per_unit,0),0),
            min_stock=greatest(coalesce(p_min_stock,0),0),
            is_active=coalesce(p_is_active,true),
            category_id=p_category_id,count_frequency=p_count_frequency,
            ingredient_type=p_ingredient_type,
            standard_yield_pct=case when p_ingredient_type='prep' then p_standard_yield_pct else null end,
            updated_at=now()
        where id=p_ingredient_id and branch_id=v_branch
        returning id into v_id;
        if v_id is null then raise exception 'INGREDIENT_NOT_FOUND'; end if;
    end if;

    return v_id;
exception when unique_violation then
    raise exception 'INGREDIENT_NAME_EXISTS';
end
$$;

-- 8) Production recipe RPC
create or replace function public.backoffice_list_production_recipes()
returns table(
    id uuid,output_ingredient_id uuid,output_name text,output_unit text,
    standard_output_qty numeric,standard_yield_pct numeric,note text,
    is_active boolean,input_count bigint,updated_at timestamptz
)
language plpgsql
security definer
set search_path=public
as $$
declare v_branch uuid;
begin
    select x.branch_id into v_branch from public._bo_ctx() x;
    if v_branch is null then raise exception 'BACKOFFICE_PERMISSION_DENIED'; end if;

    return query
    select r.id,r.output_ingredient_id,i.name,i.unit,
           r.standard_output_qty,r.standard_yield_pct,r.note,r.is_active,
           count(ri.id),r.updated_at
    from public.production_recipes r
    join public.ingredients i on i.id=r.output_ingredient_id
    left join public.production_recipe_inputs ri on ri.production_recipe_id=r.id
    where r.branch_id=v_branch
    group by r.id,i.id
    order by i.name;
end
$$;

create or replace function public.backoffice_get_production_recipe(p_recipe_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare v_branch uuid;v_result jsonb;
begin
    select x.branch_id into v_branch from public._bo_ctx() x;
    if v_branch is null then raise exception 'BACKOFFICE_PERMISSION_DENIED'; end if;

    select jsonb_build_object(
        'id',r.id,'output_ingredient_id',r.output_ingredient_id,
        'output_name',o.name,'output_unit',o.unit,
        'standard_output_qty',r.standard_output_qty,
        'standard_yield_pct',r.standard_yield_pct,
        'note',r.note,'is_active',r.is_active,
        'inputs',coalesce((
            select jsonb_agg(jsonb_build_object(
                'id',ri.id,'ingredient_id',ri.ingredient_id,
                'ingredient_name',i.name,'unit',i.unit,
                'ingredient_type',i.ingredient_type,
                'input_qty',ri.input_qty,'is_yield_basis',ri.is_yield_basis,
                'cost_per_unit',i.cost_per_unit
            ) order by ri.is_yield_basis desc,i.name)
            from public.production_recipe_inputs ri
            join public.ingredients i on i.id=ri.ingredient_id
            where ri.production_recipe_id=r.id
        ),'[]'::jsonb)
    ) into v_result
    from public.production_recipes r
    join public.ingredients o on o.id=r.output_ingredient_id
    where r.id=p_recipe_id and r.branch_id=v_branch;

    if v_result is null then raise exception 'PRODUCTION_RECIPE_NOT_FOUND'; end if;
    return v_result;
end
$$;

create or replace function public.backoffice_save_production_recipe(
    p_recipe_id uuid,p_output_ingredient_id uuid,p_standard_output_qty numeric,
    p_standard_yield_pct numeric,p_note text,p_is_active boolean,p_inputs jsonb
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
    v_user uuid;v_branch uuid;v_id uuid;v_row jsonb;v_ing uuid;v_qty numeric;
    v_basis_count integer:=0;
begin
    select x.user_id,x.branch_id into v_user,v_branch from public._bo_ctx() x;
    if v_branch is null then raise exception 'BACKOFFICE_PERMISSION_DENIED'; end if;
    if coalesce(p_standard_output_qty,0)<=0 then raise exception 'OUTPUT_QTY_REQUIRED'; end if;
    if p_standard_yield_pct is not null and (p_standard_yield_pct<=0 or p_standard_yield_pct>100) then
        raise exception 'INVALID_STANDARD_YIELD';
    end if;

    if not exists(
        select 1 from public.ingredients i
        where i.id=p_output_ingredient_id and i.branch_id=v_branch
          and i.is_active=true and i.ingredient_type='prep'
    ) then raise exception 'PREP_OUTPUT_REQUIRED'; end if;

    if jsonb_array_length(coalesce(p_inputs,'[]'::jsonb))=0 then
        raise exception 'PRODUCTION_INPUTS_REQUIRED';
    end if;

    if p_recipe_id is null then
        insert into public.production_recipes(
            branch_id,output_ingredient_id,standard_output_qty,standard_yield_pct,
            note,is_active,created_by
        ) values(
            v_branch,p_output_ingredient_id,p_standard_output_qty,p_standard_yield_pct,
            nullif(trim(coalesce(p_note,'')),''),coalesce(p_is_active,true),v_user
        ) returning id into v_id;
    else
        update public.production_recipes
        set output_ingredient_id=p_output_ingredient_id,
            standard_output_qty=p_standard_output_qty,
            standard_yield_pct=p_standard_yield_pct,
            note=nullif(trim(coalesce(p_note,'')),''),
            is_active=coalesce(p_is_active,true),updated_at=now()
        where id=p_recipe_id and branch_id=v_branch
        returning id into v_id;
        if v_id is null then raise exception 'PRODUCTION_RECIPE_NOT_FOUND'; end if;
        delete from public.production_recipe_inputs where production_recipe_id=v_id;
    end if;

    for v_row in select * from jsonb_array_elements(p_inputs)
    loop
        v_ing:=(v_row->>'ingredient_id')::uuid;
        v_qty:=coalesce((v_row->>'input_qty')::numeric,0);

        if v_qty<=0 then raise exception 'INVALID_PRODUCTION_INPUT_QTY'; end if;
        if v_ing=p_output_ingredient_id then raise exception 'OUTPUT_CANNOT_BE_INPUT'; end if;
        if not exists(
            select 1 from public.ingredients i
            where i.id=v_ing and i.branch_id=v_branch and i.is_active=true
        ) then raise exception 'INGREDIENT_NOT_FOUND'; end if;

        if coalesce((v_row->>'is_yield_basis')::boolean,false) then
            v_basis_count:=v_basis_count+1;
        end if;

        insert into public.production_recipe_inputs(
            production_recipe_id,ingredient_id,input_qty,is_yield_basis,note
        ) values(
            v_id,v_ing,v_qty,coalesce((v_row->>'is_yield_basis')::boolean,false),
            nullif(trim(coalesce(v_row->>'note','')),'')
        );
    end loop;

    if v_basis_count>1 then raise exception 'ONLY_ONE_YIELD_BASIS_ALLOWED'; end if;

    return v_id;
exception when unique_violation then
    raise exception 'PRODUCTION_RECIPE_EXISTS';
end
$$;

-- 9) Post production batch (atomic stock conversion)
create or replace function public.backoffice_post_production_batch(
    p_recipe_id uuid,
    p_output_ingredient_id uuid,
    p_actual_output_qty numeric,
    p_note text,
    p_inputs jsonb
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
    v_user uuid;v_branch uuid;v_batch uuid;v_batch_no text;
    v_row jsonb;v_ing uuid;v_qty numeric;v_before numeric;v_after numeric;
    v_cost numeric;v_line numeric;v_total numeric:=0;
    v_output_before numeric;v_output_after numeric;v_output_old_cost numeric;
    v_batch_unit_cost numeric;v_weighted_cost numeric;
    v_basis_qty numeric:=null;v_actual_yield numeric:=null;v_std_yield numeric:=null;
    v_yield_var numeric:=null;v_loss_value numeric:=0;
begin
    select x.user_id,x.branch_id into v_user,v_branch from public._bo_ctx() x;
    if v_branch is null then raise exception 'BACKOFFICE_PERMISSION_DENIED'; end if;
    if coalesce(p_actual_output_qty,0)<=0 then raise exception 'OUTPUT_QTY_REQUIRED'; end if;

    if not exists(
        select 1 from public.ingredients i
        where i.id=p_output_ingredient_id and i.branch_id=v_branch
          and i.is_active=true and i.ingredient_type='prep'
    ) then raise exception 'PREP_OUTPUT_REQUIRED'; end if;

    if jsonb_array_length(coalesce(p_inputs,'[]'::jsonb))=0 then
        raise exception 'PRODUCTION_INPUTS_REQUIRED';
    end if;

    if p_recipe_id is not null then
        select coalesce(r.standard_yield_pct,i.standard_yield_pct)
        into v_std_yield
        from public.production_recipes r
        join public.ingredients i on i.id=r.output_ingredient_id
        where r.id=p_recipe_id and r.branch_id=v_branch
          and r.output_ingredient_id=p_output_ingredient_id;
        if not found then raise exception 'PRODUCTION_RECIPE_NOT_FOUND'; end if;
    else
        select i.standard_yield_pct into v_std_yield
        from public.ingredients i
        where i.id=p_output_ingredient_id;
    end if;

    v_batch_no:=public._bo_next_production_batch_no();

    insert into public.production_batches(
        branch_id,batch_no,production_recipe_id,output_ingredient_id,
        actual_output_qty,standard_yield_pct,note,created_by
    ) values(
        v_branch,v_batch_no,p_recipe_id,p_output_ingredient_id,
        p_actual_output_qty,v_std_yield,nullif(trim(coalesce(p_note,'')),''),v_user
    ) returning id into v_batch;

    -- Consume inputs
    for v_row in select * from jsonb_array_elements(p_inputs)
    loop
        v_ing:=(v_row->>'ingredient_id')::uuid;
        v_qty:=coalesce((v_row->>'quantity')::numeric,0);
        if v_qty<=0 then raise exception 'INVALID_PRODUCTION_INPUT_QTY'; end if;
        if v_ing=p_output_ingredient_id then raise exception 'OUTPUT_CANNOT_BE_INPUT'; end if;

        select i.current_stock,i.cost_per_unit
        into v_before,v_cost
        from public.ingredients i
        where i.id=v_ing and i.branch_id=v_branch and i.is_active=true
        for update;
        if not found then raise exception 'INGREDIENT_NOT_FOUND'; end if;
        if coalesce(v_before,0)<v_qty then
            raise exception 'INSUFFICIENT_STOCK:%',v_ing;
        end if;

        v_after:=v_before-v_qty;
        v_line:=round(v_qty*coalesce(v_cost,0),2);
        v_total:=v_total+v_line;

        update public.ingredients
        set current_stock=v_after,updated_at=now()
        where id=v_ing;

        insert into public.production_batch_inputs(
            production_batch_id,ingredient_id,quantity,unit_cost,line_cost,is_yield_basis
        ) values(
            v_batch,v_ing,v_qty,coalesce(v_cost,0),v_line,
            coalesce((v_row->>'is_yield_basis')::boolean,false)
        );

        if coalesce((v_row->>'is_yield_basis')::boolean,false) then
            if v_basis_qty is not null then raise exception 'ONLY_ONE_YIELD_BASIS_ALLOWED'; end if;
            v_basis_qty:=v_qty;
        end if;

        insert into public.ingredient_stock_movements(
            branch_id,ingredient_id,movement_type,quantity,
            stock_before,stock_after,unit_cost,note,created_by
        ) values(
            v_branch,v_ing,'production_out',v_qty,v_before,v_after,coalesce(v_cost,0),
            'Production '||v_batch_no||' → '||
            (select name from public.ingredients where id=p_output_ingredient_id),
            v_user
        );
    end loop;

    v_batch_unit_cost:=case when p_actual_output_qty>0 then round(v_total/p_actual_output_qty,4) else 0 end;

    select i.current_stock,i.cost_per_unit
    into v_output_before,v_output_old_cost
    from public.ingredients i
    where i.id=p_output_ingredient_id and i.branch_id=v_branch
    for update;

    v_output_after:=coalesce(v_output_before,0)+p_actual_output_qty;
    v_weighted_cost:=case
        when v_output_after>0 then round(
            ((coalesce(v_output_before,0)*coalesce(v_output_old_cost,0))+v_total)
            /v_output_after,4
        )
        else v_batch_unit_cost
    end;

    update public.ingredients
    set current_stock=v_output_after,cost_per_unit=v_weighted_cost,updated_at=now()
    where id=p_output_ingredient_id;

    insert into public.ingredient_stock_movements(
        branch_id,ingredient_id,movement_type,quantity,
        stock_before,stock_after,unit_cost,note,created_by
    ) values(
        v_branch,p_output_ingredient_id,'production_in',p_actual_output_qty,
        coalesce(v_output_before,0),v_output_after,v_batch_unit_cost,
        'Production '||v_batch_no,v_user
    );

    if v_basis_qty is not null and v_basis_qty>0 then
        v_actual_yield:=round(p_actual_output_qty/v_basis_qty*100,4);
        if v_std_yield is not null then
            v_yield_var:=round(v_actual_yield-v_std_yield,4);
            if v_actual_yield<v_std_yield then
                v_loss_value:=round(
                    greatest((v_basis_qty*v_std_yield/100)-p_actual_output_qty,0)
                    *v_batch_unit_cost,2
                );
            end if;
        end if;
    end if;

    update public.production_batches
    set basis_input_qty=v_basis_qty,actual_yield_pct=v_actual_yield,
        yield_variance_pct=v_yield_var,yield_loss_value=v_loss_value,
        total_input_cost=round(v_total,2),output_unit_cost=v_batch_unit_cost
    where id=v_batch;

    return v_batch;
end
$$;

create or replace function public.backoffice_list_production_batches(
    p_from timestamptz default null,p_to timestamptz default null
)
returns table(
    id uuid,batch_no text,output_ingredient_id uuid,output_name text,output_unit text,
    actual_output_qty numeric,total_input_cost numeric,output_unit_cost numeric,
    actual_yield_pct numeric,standard_yield_pct numeric,yield_variance_pct numeric,
    yield_loss_value numeric,status text,created_at timestamptz,created_by_name text,note text
)
language plpgsql
security definer
set search_path=public
as $$
declare v_branch uuid;
begin
    select x.branch_id into v_branch from public._bo_ctx() x;
    if v_branch is null then raise exception 'BACKOFFICE_PERMISSION_DENIED'; end if;

    return query
    select b.id,b.batch_no,b.output_ingredient_id,i.name,i.unit,b.actual_output_qty,
           b.total_input_cost,b.output_unit_cost,b.actual_yield_pct,b.standard_yield_pct,
           b.yield_variance_pct,b.yield_loss_value,b.status,b.created_at,p.full_name,b.note
    from public.production_batches b
    join public.ingredients i on i.id=b.output_ingredient_id
    left join public.profiles p on p.id=b.created_by
    where b.branch_id=v_branch
      and (p_from is null or b.created_at>=p_from)
      and (p_to is null or b.created_at<=p_to)
    order by b.created_at desc
    limit 500;
end
$$;

create or replace function public.backoffice_get_production_batch(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare v_branch uuid;v_result jsonb;
begin
    select x.branch_id into v_branch from public._bo_ctx() x;
    if v_branch is null then raise exception 'BACKOFFICE_PERMISSION_DENIED'; end if;

    select jsonb_build_object(
        'id',b.id,'batch_no',b.batch_no,'output_ingredient_id',b.output_ingredient_id,
        'output_name',o.name,'output_unit',o.unit,'actual_output_qty',b.actual_output_qty,
        'total_input_cost',b.total_input_cost,'output_unit_cost',b.output_unit_cost,
        'basis_input_qty',b.basis_input_qty,'actual_yield_pct',b.actual_yield_pct,
        'standard_yield_pct',b.standard_yield_pct,'yield_variance_pct',b.yield_variance_pct,
        'yield_loss_value',b.yield_loss_value,'status',b.status,'note',b.note,
        'created_at',b.created_at,'created_by_name',p.full_name,
        'inputs',coalesce((
            select jsonb_agg(jsonb_build_object(
                'ingredient_id',bi.ingredient_id,'ingredient_name',i.name,'unit',i.unit,
                'quantity',bi.quantity,'unit_cost',bi.unit_cost,'line_cost',bi.line_cost,
                'is_yield_basis',bi.is_yield_basis
            ) order by bi.is_yield_basis desc,i.name)
            from public.production_batch_inputs bi
            join public.ingredients i on i.id=bi.ingredient_id
            where bi.production_batch_id=b.id
        ),'[]'::jsonb)
    ) into v_result
    from public.production_batches b
    join public.ingredients o on o.id=b.output_ingredient_id
    left join public.profiles p on p.id=b.created_by
    where b.id=p_batch_id and b.branch_id=v_branch;

    if v_result is null then raise exception 'PRODUCTION_BATCH_NOT_FOUND'; end if;
    return v_result;
end
$$;

-- 10) Report V3.1
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
declare v_branch uuid;
begin
    select x.branch_id into v_branch from public._bo_ctx() x;
    if v_branch is null then raise exception 'BACKOFFICE_PERMISSION_DENIED'; end if;
    if p_from is null or p_to is null or p_to<p_from then raise exception 'INVALID_PERIOD'; end if;

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
     and m.created_at>=p_from and m.created_at<=p_to
    where i.branch_id=v_branch
      and (p_category_id is null or i.category_id=p_category_id)
      and (p_ingredient_type is null or i.ingredient_type=p_ingredient_type)
    group by i.id,c.id,c.name,c.display_order
    order by coalesce(c.display_order,999),coalesce(c.name,'อื่นๆ'),i.name;
end
$$;

-- 11) Production summary for Cost Control
create or replace function public.backoffice_production_summary(
    p_from timestamptz,p_to timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare v_branch uuid;v_result jsonb;
begin
    select x.branch_id into v_branch from public._bo_ctx() x;
    if v_branch is null then raise exception 'BACKOFFICE_PERMISSION_DENIED'; end if;

    select jsonb_build_object(
        'batch_count',count(*),
        'input_cost',coalesce(sum(b.total_input_cost),0),
        'yield_loss_value',coalesce(sum(b.yield_loss_value),0),
        'avg_yield_pct',coalesce(avg(b.actual_yield_pct) filter(where b.actual_yield_pct is not null),0),
        'below_standard_count',count(*) filter(where b.yield_variance_pct<0)
    ) into v_result
    from public.production_batches b
    where b.branch_id=v_branch and b.status='posted'
      and b.created_at>=p_from and b.created_at<=p_to;

    return v_result;
end
$$;

-- 12) Update closing snapshot function to include production in/out and yield loss
create or replace function public._bo_refresh_closing_items(p_closing_id uuid)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare
    v_branch uuid;v_start timestamptz;v_end timestamptz;v_count uuid;
    v_sales numeric:=0;v_prod_loss numeric:=0;
begin
    select c.branch_id,c.period_start,c.period_end,c.stock_count_id
    into v_branch,v_start,v_end,v_count
    from public.inventory_closings c
    join public._bo_ctx() x on x.branch_id=c.branch_id
    where c.id=p_closing_id and c.status='draft'
    for update;

    if v_branch is null then raise exception 'CLOSING_NOT_EDITABLE'; end if;

    delete from public.inventory_closing_items where closing_id=p_closing_id;

    insert into public.inventory_closing_items(
        closing_id,ingredient_id,ingredient_name,unit,category_id,category_name,count_frequency,
        opening_qty,stock_in_qty,production_in_qty,production_out_qty,void_qty,adjust_in_qty,
        sale_usage_qty,waste_qty,adjust_out_qty,expected_qty,actual_qty,variance_qty,
        unit_cost_snapshot,opening_value,stock_in_value,production_in_value,production_out_value,
        theoretical_usage_value,waste_value,adjust_in_value,adjust_out_value,
        expected_value,actual_value,variance_value,was_counted
    )
    select
        p_closing_id,i.id,i.name,i.unit,i.category_id,coalesce(c.name,'อื่นๆ'),i.count_frequency,
        coalesce(
            (select m0.stock_after from public.ingredient_stock_movements m0
             where m0.ingredient_id=i.id and m0.branch_id=v_branch and m0.created_at<v_start
             order by m0.created_at desc limit 1),
            (select m1.stock_before from public.ingredient_stock_movements m1
             where m1.ingredient_id=i.id and m1.branch_id=v_branch
               and m1.created_at between v_start and v_end
             order by m1.created_at asc limit 1),
            i.current_stock
        ),
        coalesce((select sum(m.quantity) from public.ingredient_stock_movements m where m.ingredient_id=i.id and m.branch_id=v_branch and m.created_at between v_start and v_end and m.movement_type='stock_in'),0),
        coalesce((select sum(m.quantity) from public.ingredient_stock_movements m where m.ingredient_id=i.id and m.branch_id=v_branch and m.created_at between v_start and v_end and m.movement_type='production_in'),0),
        coalesce((select sum(m.quantity) from public.ingredient_stock_movements m where m.ingredient_id=i.id and m.branch_id=v_branch and m.created_at between v_start and v_end and m.movement_type='production_out'),0),
        coalesce((select sum(m.quantity) from public.ingredient_stock_movements m where m.ingredient_id=i.id and m.branch_id=v_branch and m.created_at between v_start and v_end and m.movement_type='void'),0),
        coalesce((select sum(m.quantity) from public.ingredient_stock_movements m where m.ingredient_id=i.id and m.branch_id=v_branch and m.created_at between v_start and v_end and m.movement_type='adjust_in' and coalesce(m.note,'') not like 'Stock Count %'),0),
        coalesce((select sum(m.quantity) from public.ingredient_stock_movements m where m.ingredient_id=i.id and m.branch_id=v_branch and m.created_at between v_start and v_end and m.movement_type='sale'),0),
        coalesce((select sum(m.quantity) from public.ingredient_stock_movements m where m.ingredient_id=i.id and m.branch_id=v_branch and m.created_at between v_start and v_end and m.movement_type='waste'),0),
        coalesce((select sum(m.quantity) from public.ingredient_stock_movements m where m.ingredient_id=i.id and m.branch_id=v_branch and m.created_at between v_start and v_end and m.movement_type='adjust_out' and coalesce(m.note,'') not like 'Stock Count %'),0),
        0,null,null,
        coalesce(sci.unit_cost,i.cost_per_unit,0),
        0,
        coalesce((select sum(m.quantity*m.unit_cost) from public.ingredient_stock_movements m where m.ingredient_id=i.id and m.branch_id=v_branch and m.created_at between v_start and v_end and m.movement_type='stock_in'),0),
        coalesce((select sum(m.quantity*m.unit_cost) from public.ingredient_stock_movements m where m.ingredient_id=i.id and m.branch_id=v_branch and m.created_at between v_start and v_end and m.movement_type='production_in'),0),
        coalesce((select sum(m.quantity*m.unit_cost) from public.ingredient_stock_movements m where m.ingredient_id=i.id and m.branch_id=v_branch and m.created_at between v_start and v_end and m.movement_type='production_out'),0),
        coalesce((select sum(m.quantity*m.unit_cost) from public.ingredient_stock_movements m where m.ingredient_id=i.id and m.branch_id=v_branch and m.created_at between v_start and v_end and m.movement_type='sale'),0),
        coalesce((select sum(m.quantity*m.unit_cost) from public.ingredient_stock_movements m where m.ingredient_id=i.id and m.branch_id=v_branch and m.created_at between v_start and v_end and m.movement_type='waste'),0),
        coalesce((select sum(m.quantity*m.unit_cost) from public.ingredient_stock_movements m where m.ingredient_id=i.id and m.branch_id=v_branch and m.created_at between v_start and v_end and m.movement_type='adjust_in' and coalesce(m.note,'') not like 'Stock Count %'),0),
        coalesce((select sum(m.quantity*m.unit_cost) from public.ingredient_stock_movements m where m.ingredient_id=i.id and m.branch_id=v_branch and m.created_at between v_start and v_end and m.movement_type='adjust_out' and coalesce(m.note,'') not like 'Stock Count %'),0),
        0,null,null,(sci.id is not null)
    from public.ingredients i
    left join public.ingredient_categories c on c.id=i.category_id
    left join public.stock_count_items sci on sci.stock_count_id=v_count and sci.ingredient_id=i.id
    where i.branch_id=v_branch and i.is_active=true;

    update public.inventory_closing_items ci
    set expected_qty =
            ci.opening_qty + ci.stock_in_qty + ci.production_in_qty + ci.void_qty + ci.adjust_in_qty
            - ci.production_out_qty - ci.sale_usage_qty - ci.waste_qty - ci.adjust_out_qty,
        actual_qty=case when ci.was_counted then sci.counted_qty else null end,
        opening_value=round(ci.opening_qty*ci.unit_cost_snapshot,2)
    from public.stock_count_items sci
    where ci.closing_id=p_closing_id
      and sci.stock_count_id=v_count and sci.ingredient_id=ci.ingredient_id;

    update public.inventory_closing_items ci
    set expected_qty =
            ci.opening_qty + ci.stock_in_qty + ci.production_in_qty + ci.void_qty + ci.adjust_in_qty
            - ci.production_out_qty - ci.sale_usage_qty - ci.waste_qty - ci.adjust_out_qty,
        opening_value=round(ci.opening_qty*ci.unit_cost_snapshot,2)
    where ci.closing_id=p_closing_id;

    update public.inventory_closing_items ci
    set variance_qty=case when ci.actual_qty is null then null else ci.actual_qty-ci.expected_qty end,
        expected_value=round(ci.expected_qty*ci.unit_cost_snapshot,2),
        actual_value=case when ci.actual_qty is null then null else round(ci.actual_qty*ci.unit_cost_snapshot,2) end,
        variance_value=case when ci.actual_qty is null then null else round((ci.actual_qty-ci.expected_qty)*ci.unit_cost_snapshot,2) end
    where ci.closing_id=p_closing_id;

    select coalesce(sum(s.total),0) into v_sales
    from public.sales s
    where s.branch_id=v_branch and s.created_at between v_start and v_end
      and coalesce(s.status,'')<>'cancelled';

    select coalesce(sum(b.yield_loss_value),0) into v_prod_loss
    from public.production_batches b
    where b.branch_id=v_branch and b.status='posted'
      and b.created_at between v_start and v_end;

    update public.inventory_closings c
    set net_sales=round(v_sales,2),
        opening_value=round(coalesce((select sum(x.opening_value) from public.inventory_closing_items x where x.closing_id=c.id),0),2),
        purchase_value=round(coalesce((select sum(x.stock_in_value) from public.inventory_closing_items x where x.closing_id=c.id),0),2),
        theoretical_cost=round(coalesce((select sum(x.theoretical_usage_value) from public.inventory_closing_items x where x.closing_id=c.id),0),2),
        waste_cost=round(coalesce((select sum(x.waste_value) from public.inventory_closing_items x where x.closing_id=c.id),0),2),
        adjust_in_value=round(coalesce((select sum(x.adjust_in_value) from public.inventory_closing_items x where x.closing_id=c.id),0),2),
        adjust_out_value=round(coalesce((select sum(x.adjust_out_value) from public.inventory_closing_items x where x.closing_id=c.id),0),2),
        production_yield_loss_value=round(v_prod_loss,2),
        expected_closing_value=round(coalesce((select sum(x.expected_value) from public.inventory_closing_items x where x.closing_id=c.id),0),2),
        actual_closing_value=round(coalesce((select sum(coalesce(x.actual_value,x.expected_value)) from public.inventory_closing_items x where x.closing_id=c.id),0),2),
        shortage_value=round(coalesce((select sum(case when x.variance_value<0 then abs(x.variance_value) else 0 end) from public.inventory_closing_items x where x.closing_id=c.id),0),2),
        overage_value=round(coalesce((select sum(case when x.variance_value>0 then x.variance_value else 0 end) from public.inventory_closing_items x where x.closing_id=c.id),0),2),
        actual_control_cost=round(
            coalesce((select sum(x.theoretical_usage_value+x.waste_value+x.adjust_out_value
                +case when x.variance_value<0 then abs(x.variance_value) else 0 end)
                from public.inventory_closing_items x where x.closing_id=c.id),0)
            -coalesce((select sum(x.adjust_in_value+case when x.variance_value>0 then x.variance_value else 0 end)
                from public.inventory_closing_items x where x.closing_id=c.id),0)
        ,2),
        total_items=(select count(*) from public.inventory_closing_items x where x.closing_id=c.id),
        counted_items=(select count(*) from public.inventory_closing_items x where x.closing_id=c.id and x.was_counted),
        coverage_pct=case when (select count(*) from public.inventory_closing_items x where x.closing_id=c.id)=0 then 0
            else round((select count(*) from public.inventory_closing_items x where x.closing_id=c.id and x.was_counted)::numeric
                 /(select count(*) from public.inventory_closing_items x where x.closing_id=c.id)::numeric*100,2) end,
        updated_at=now()
    where c.id=p_closing_id;

    update public.inventory_closings c
    set theoretical_cost_pct=case when c.net_sales>0 then round(c.theoretical_cost/c.net_sales*100,4) else 0 end,
        actual_cost_pct=case when c.net_sales>0 then round(c.actual_control_cost/c.net_sales*100,4) else 0 end,
        variance_cost_pct=case when c.net_sales>0 then round((c.actual_control_cost-c.theoretical_cost)/c.net_sales*100,4) else 0 end
    where c.id=p_closing_id;

    return true;
end
$$;
revoke all on function public._bo_refresh_closing_items(uuid) from public;

-- 13) Extend closing detail JSON
create or replace function public.backoffice_get_inventory_closing(p_closing_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare v_branch uuid;v_result jsonb;
begin
    select x.branch_id into v_branch from public._bo_ctx() x;
    if v_branch is null then raise exception 'BACKOFFICE_PERMISSION_DENIED'; end if;

    select jsonb_build_object(
        'id',c.id,'closing_no',c.closing_no,'period_type',c.period_type,
        'period_start',c.period_start,'period_end',c.period_end,'status',c.status,
        'stock_count_id',c.stock_count_id,'note',c.note,
        'net_sales',c.net_sales,'opening_value',c.opening_value,'purchase_value',c.purchase_value,
        'theoretical_cost',c.theoretical_cost,'waste_cost',c.waste_cost,
        'production_yield_loss_value',c.production_yield_loss_value,
        'adjust_in_value',c.adjust_in_value,'adjust_out_value',c.adjust_out_value,
        'expected_closing_value',c.expected_closing_value,'actual_closing_value',c.actual_closing_value,
        'shortage_value',c.shortage_value,'overage_value',c.overage_value,
        'actual_control_cost',c.actual_control_cost,
        'theoretical_cost_pct',c.theoretical_cost_pct,'actual_cost_pct',c.actual_cost_pct,
        'variance_cost_pct',c.variance_cost_pct,
        'counted_items',c.counted_items,'total_items',c.total_items,'coverage_pct',c.coverage_pct,
        'created_at',c.created_at,'closed_at',c.closed_at,
        'items',coalesce((
            select jsonb_agg(to_jsonb(x) order by x.category_name,x.ingredient_name)
            from public.inventory_closing_items x where x.closing_id=c.id
        ),'[]'::jsonb),
        'categories',coalesce((
            select jsonb_agg(jsonb_build_object(
                'category_name',z.category_name,'theoretical_cost',z.theoretical_cost,
                'waste_cost',z.waste_cost,'shortage_value',z.shortage_value,
                'overage_value',z.overage_value,'actual_control_cost',z.actual_control_cost
            ) order by z.category_name)
            from (
                select x.category_name,
                    round(sum(x.theoretical_usage_value),2) theoretical_cost,
                    round(sum(x.waste_value),2) waste_cost,
                    round(sum(case when x.variance_value<0 then abs(x.variance_value) else 0 end),2) shortage_value,
                    round(sum(case when x.variance_value>0 then x.variance_value else 0 end),2) overage_value,
                    round(sum(x.theoretical_usage_value+x.waste_value+x.adjust_out_value
                        +case when x.variance_value<0 then abs(x.variance_value) else 0 end
                        -x.adjust_in_value-case when x.variance_value>0 then x.variance_value else 0 end),2) actual_control_cost
                from public.inventory_closing_items x
                where x.closing_id=c.id group by x.category_name
            ) z
        ),'[]'::jsonb),
        'audit',coalesce((
            select jsonb_agg(jsonb_build_object(
                'action',a.action,'reason',a.reason,'acted_at',a.acted_at,'acted_by_name',p.full_name
            ) order by a.acted_at desc)
            from public.inventory_closing_audit a
            left join public.profiles p on p.id=a.acted_by
            where a.closing_id=c.id
        ),'[]'::jsonb)
    ) into v_result
    from public.inventory_closings c
    where c.id=p_closing_id and c.branch_id=v_branch;

    if v_result is null then raise exception 'CLOSING_NOT_FOUND'; end if;
    return v_result;
end
$$;

-- Grants
grant execute on function public.backoffice_list_ingredients_v31() to authenticated;
grant execute on function public.backoffice_save_ingredient_v31(uuid,text,text,numeric,numeric,boolean,uuid,text,text,numeric) to authenticated;
grant execute on function public.backoffice_list_production_recipes() to authenticated;
grant execute on function public.backoffice_get_production_recipe(uuid) to authenticated;
grant execute on function public.backoffice_save_production_recipe(uuid,uuid,numeric,numeric,text,boolean,jsonb) to authenticated;
grant execute on function public.backoffice_post_production_batch(uuid,uuid,numeric,text,jsonb) to authenticated;
grant execute on function public.backoffice_list_production_batches(timestamptz,timestamptz) to authenticated;
grant execute on function public.backoffice_get_production_batch(uuid) to authenticated;
grant execute on function public.backoffice_stock_report_v31(timestamptz,timestamptz,uuid,text) to authenticated;
grant execute on function public.backoffice_production_summary(timestamptz,timestamptz) to authenticated;

-- 14) Cost Control V3.1 with Production Yield Loss
create or replace function public.backoffice_cost_control_dashboard_v31()
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare v_branch uuid;v_result jsonb;
begin
    select x.branch_id into v_branch from public._bo_ctx() x;
    if v_branch is null then raise exception 'BACKOFFICE_PERMISSION_DENIED'; end if;

    select jsonb_build_object(
        'latest',(
            select to_jsonb(c)
            from public.inventory_closings c
            where c.branch_id=v_branch and c.status='closed'
            order by c.period_end desc limit 1
        ),
        'recent',coalesce((
            select jsonb_agg(to_jsonb(r) order by r.period_end)
            from (
                select c.id,c.closing_no,c.period_type,c.period_end,c.net_sales,
                       c.theoretical_cost,c.actual_control_cost,c.theoretical_cost_pct,
                       c.actual_cost_pct,c.variance_cost_pct,c.shortage_value,
                       c.waste_cost,c.production_yield_loss_value,c.coverage_pct
                from public.inventory_closings c
                where c.branch_id=v_branch and c.status='closed'
                order by c.period_end desc limit 12
            ) r
        ),'[]'::jsonb)
    ) into v_result;

    return v_result;
end
$$;

grant execute on function public.backoffice_cost_control_dashboard_v31() to authenticated;

commit;

select 'JOKJUNG STOCK V3.1 PRODUCTION READY' as result;
