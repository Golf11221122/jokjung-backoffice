-- =========================================================
-- JOKJUNG BACK OFFICE V1
-- ใช้ตารางเดิม:
-- ingredients
-- ingredient_stock_movements
-- product_recipes
-- products
-- profiles
-- branches
-- =========================================================

-- Context ของผู้ใช้ + จำกัด Back Office เฉพาะ Admin/Manager
create or replace function public.backoffice_context()
returns table(
    user_id uuid,
    email text,
    full_name text,
    role text,
    branch_id uuid,
    branch_name text
)
language plpgsql
security definer
set search_path = public
as $$
begin
    return query
    select
        p.id,
        coalesce(auth.jwt()->>'email',''),
        p.full_name,
        lower(trim(p.role)),
        p.branch_id,
        b.name
    from public.profiles p
    join public.branches b on b.id = p.branch_id
    where p.id = auth.uid()
      and lower(trim(p.role)) in ('admin','manager')
      and coalesce(b.is_active,true)=true
    limit 1;
end;
$$;

-- รายการวัตถุดิบ
create or replace function public.backoffice_list_ingredients()
returns table(
    id uuid,
    branch_id uuid,
    name text,
    unit text,
    cost_per_unit numeric,
    current_stock numeric,
    min_stock numeric,
    is_active boolean,
    created_at timestamptz,
    updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare v_branch uuid; v_role text;
begin
    select x.branch_id,x.role into v_branch,v_role from public.backoffice_context() x;
    if v_branch is null then raise exception 'BACKOFFICE_PERMISSION_DENIED'; end if;

    return query
    select i.id,i.branch_id,i.name,i.unit,i.cost_per_unit,i.current_stock,i.min_stock,i.is_active,i.created_at,i.updated_at
    from public.ingredients i
    where i.branch_id=v_branch
    order by i.is_active desc,i.name;
end;
$$;

-- สินค้าจาก POS สำหรับ Recipe
create or replace function public.backoffice_list_products()
returns table(
    id uuid,
    name text,
    sku text,
    barcode text,
    price numeric,
    cost numeric,
    is_active boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare v_branch uuid;
begin
    select x.branch_id into v_branch from public.backoffice_context() x;
    if v_branch is null then raise exception 'BACKOFFICE_PERMISSION_DENIED'; end if;

    return query
    select p.id,p.name,p.sku,p.barcode,p.price,p.cost,p.is_active
    from public.products p
    where p.branch_id=v_branch
    order by p.is_active desc,p.name;
end;
$$;

-- เพิ่ม/แก้วัตถุดิบ ไม่แก้ current_stock ในฟอร์ม
create or replace function public.backoffice_save_ingredient(
    p_ingredient_id uuid,
    p_name text,
    p_unit text,
    p_cost_per_unit numeric,
    p_min_stock numeric,
    p_is_active boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_branch uuid; v_id uuid;
begin
    select x.branch_id into v_branch from public.backoffice_context() x;
    if v_branch is null then raise exception 'BACKOFFICE_PERMISSION_DENIED'; end if;
    if trim(coalesce(p_name,''))='' then raise exception 'INGREDIENT_NAME_REQUIRED'; end if;
    if trim(coalesce(p_unit,''))='' then raise exception 'INGREDIENT_UNIT_REQUIRED'; end if;

    if p_ingredient_id is null then
        insert into public.ingredients(
            branch_id,name,unit,cost_per_unit,current_stock,min_stock,is_active
        ) values(
            v_branch,trim(p_name),trim(p_unit),
            greatest(coalesce(p_cost_per_unit,0),0),
            0,
            greatest(coalesce(p_min_stock,0),0),
            coalesce(p_is_active,true)
        )
        returning id into v_id;
    else
        update public.ingredients
        set name=trim(p_name),
            unit=trim(p_unit),
            cost_per_unit=greatest(coalesce(p_cost_per_unit,0),0),
            min_stock=greatest(coalesce(p_min_stock,0),0),
            is_active=coalesce(p_is_active,true),
            updated_at=now()
        where id=p_ingredient_id and branch_id=v_branch
        returning id into v_id;

        if v_id is null then raise exception 'INGREDIENT_NOT_FOUND'; end if;
    end if;

    return v_id;
end;
$$;

-- ปรับ Stock แบบ transaction + movement เสมอ
create or replace function public.backoffice_adjust_stock(
    p_ingredient_id uuid,
    p_movement_type text,
    p_quantity numeric,
    p_unit_cost numeric,
    p_note text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user uuid:=auth.uid();
    v_branch uuid;
    v_before numeric;
    v_after numeric;
    v_delta numeric;
    v_movement uuid;
    v_cost numeric;
begin
    select x.branch_id into v_branch from public.backoffice_context() x;
    if v_branch is null then raise exception 'BACKOFFICE_PERMISSION_DENIED'; end if;

    if p_movement_type not in ('receive','issue','waste','adjust_in','adjust_out') then
        raise exception 'INVALID_MOVEMENT_TYPE';
    end if;

    if coalesce(p_quantity,0)<=0 then raise exception 'QUANTITY_MUST_BE_POSITIVE'; end if;

    select i.current_stock,i.cost_per_unit
    into v_before,v_cost
    from public.ingredients i
    where i.id=p_ingredient_id and i.branch_id=v_branch
    for update;

    if not found then raise exception 'INGREDIENT_NOT_FOUND'; end if;

    v_delta := case when p_movement_type in ('receive','adjust_in') then p_quantity else -p_quantity end;
    v_after := v_before + v_delta;

    if v_after < 0 then
        raise exception 'STOCK_CANNOT_BE_NEGATIVE';
    end if;

    update public.ingredients
    set current_stock=v_after,
        cost_per_unit=case
            when p_movement_type='receive' and coalesce(p_unit_cost,0)>0
            then p_unit_cost
            else cost_per_unit
        end,
        updated_at=now()
    where id=p_ingredient_id;

    insert into public.ingredient_stock_movements(
        branch_id,ingredient_id,movement_type,quantity,
        stock_before,stock_after,unit_cost,note,created_by
    ) values(
        v_branch,p_ingredient_id,p_movement_type,p_quantity,
        v_before,v_after,
        case when coalesce(p_unit_cost,0)>0 then p_unit_cost else v_cost end,
        nullif(trim(coalesce(p_note,'')),''),
        v_user
    )
    returning id into v_movement;

    return v_movement;
end;
$$;

create or replace function public.backoffice_list_movements(p_limit integer default 200)
returns table(
    id uuid,
    ingredient_id uuid,
    ingredient_name text,
    unit text,
    movement_type text,
    quantity numeric,
    stock_before numeric,
    stock_after numeric,
    unit_cost numeric,
    note text,
    created_by uuid,
    created_by_name text,
    created_at timestamptz,
    sale_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare v_branch uuid;
begin
    select x.branch_id into v_branch from public.backoffice_context() x;
    if v_branch is null then raise exception 'BACKOFFICE_PERMISSION_DENIED'; end if;

    return query
    select m.id,m.ingredient_id,i.name,i.unit,m.movement_type,m.quantity,
           m.stock_before,m.stock_after,m.unit_cost,m.note,m.created_by,
           p.full_name,m.created_at,m.sale_id
    from public.ingredient_stock_movements m
    join public.ingredients i on i.id=m.ingredient_id
    left join public.profiles p on p.id=m.created_by
    where m.branch_id=v_branch
    order by m.created_at desc
    limit least(greatest(coalesce(p_limit,200),1),1000);
end;
$$;

create or replace function public.backoffice_get_product_recipe(p_product_id uuid)
returns table(
    ingredient_id uuid,
    ingredient_name text,
    unit text,
    quantity_used numeric,
    cost_per_unit numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare v_branch uuid;
begin
    select x.branch_id into v_branch from public.backoffice_context() x;
    if v_branch is null then raise exception 'BACKOFFICE_PERMISSION_DENIED'; end if;

    if not exists(select 1 from public.products p where p.id=p_product_id and p.branch_id=v_branch) then
        raise exception 'PRODUCT_NOT_FOUND';
    end if;

    return query
    select r.ingredient_id,i.name,i.unit,r.quantity_used,i.cost_per_unit
    from public.product_recipes r
    join public.ingredients i on i.id=r.ingredient_id
    where r.branch_id=v_branch and r.product_id=p_product_id
    order by i.name;
end;
$$;

create or replace function public.backoffice_save_product_recipe(
    p_product_id uuid,
    p_recipe jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
    v_branch uuid;
    v_row jsonb;
    v_ing uuid;
    v_qty numeric;
begin
    select x.branch_id into v_branch from public.backoffice_context() x;
    if v_branch is null then raise exception 'BACKOFFICE_PERMISSION_DENIED'; end if;

    if not exists(select 1 from public.products p where p.id=p_product_id and p.branch_id=v_branch) then
        raise exception 'PRODUCT_NOT_FOUND';
    end if;

    delete from public.product_recipes
    where branch_id=v_branch and product_id=p_product_id;

    for v_row in select * from jsonb_array_elements(coalesce(p_recipe,'[]'::jsonb))
    loop
        v_ing := (v_row->>'ingredient_id')::uuid;
        v_qty := greatest(coalesce((v_row->>'quantity_used')::numeric,0),0);

        if v_qty>0 and exists(
            select 1 from public.ingredients i where i.id=v_ing and i.branch_id=v_branch and i.is_active=true
        ) then
            insert into public.product_recipes(branch_id,product_id,ingredient_id,quantity_used)
            values(v_branch,p_product_id,v_ing,v_qty);
        end if;
    end loop;

    return true;
end;
$$;

create or replace function public.backoffice_dashboard_summary()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_branch uuid; v_result jsonb;
begin
    select x.branch_id into v_branch from public.backoffice_context() x;
    if v_branch is null then raise exception 'BACKOFFICE_PERMISSION_DENIED'; end if;

    select jsonb_build_object(
        'ingredient_count', count(*) filter(where i.is_active),
        'low_stock_count', count(*) filter(where i.is_active and i.current_stock>0 and i.current_stock<=i.min_stock),
        'out_stock_count', count(*) filter(where i.is_active and i.current_stock<=0),
        'stock_value', coalesce(sum(case when i.is_active then i.current_stock*i.cost_per_unit else 0 end),0),
        'alerts', coalesce((
            select jsonb_agg(x order by x.current_stock asc)
            from (
                select i2.name,i2.unit,i2.current_stock,i2.min_stock
                from public.ingredients i2
                where i2.branch_id=v_branch and i2.is_active=true and i2.current_stock<=i2.min_stock
                order by i2.current_stock asc
                limit 20
            ) x
        ),'[]'::jsonb),
        'recent_movements', coalesce((
            select jsonb_agg(x order by x.created_at desc)
            from (
                select m.created_at,i3.name as ingredient_name,i3.unit,m.movement_type,m.quantity,m.stock_after
                from public.ingredient_stock_movements m
                join public.ingredients i3 on i3.id=m.ingredient_id
                where m.branch_id=v_branch
                order by m.created_at desc
                limit 10
            ) x
        ),'[]'::jsonb)
    )
    into v_result
    from public.ingredients i
    where i.branch_id=v_branch;

    return v_result;
end;
$$;

grant execute on function public.backoffice_context() to authenticated;
grant execute on function public.backoffice_list_ingredients() to authenticated;
grant execute on function public.backoffice_list_products() to authenticated;
grant execute on function public.backoffice_save_ingredient(uuid,text,text,numeric,numeric,boolean) to authenticated;
grant execute on function public.backoffice_adjust_stock(uuid,text,numeric,numeric,text) to authenticated;
grant execute on function public.backoffice_list_movements(integer) to authenticated;
grant execute on function public.backoffice_get_product_recipe(uuid) to authenticated;
grant execute on function public.backoffice_save_product_recipe(uuid,jsonb) to authenticated;
grant execute on function public.backoffice_dashboard_summary() to authenticated;

select 'JOKJUNG BACK OFFICE V1 READY' as result;
