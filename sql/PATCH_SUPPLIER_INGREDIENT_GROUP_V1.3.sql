-- =========================================================
-- JOKJUNG SUPPLIER INGREDIENT GROUP V1.3
--
-- ฟังก์ชัน:
-- 1) จัดวัตถุดิบเข้ากลุ่ม Supplier
-- 2) Supplier 1 รายมีวัตถุดิบได้หลายรายการ
-- 3) วัตถุดิบ 1 รายการอยู่ได้หลาย Supplier
-- 4) หน้า PO เลือก Supplier แล้วแสดงเฉพาะวัตถุดิบของ Supplier นั้น
-- =========================================================

begin;

create table if not exists public.supplier_ingredients (
    id uuid primary key default gen_random_uuid(),
    branch_id uuid not null references public.branches(id) on delete cascade,
    supplier_id uuid not null references public.suppliers(id) on delete cascade,
    ingredient_id uuid not null references public.ingredients(id) on delete cascade,
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique(branch_id, supplier_id, ingredient_id)
);

create index if not exists idx_supplier_ingredients_supplier
on public.supplier_ingredients(branch_id, supplier_id)
where is_active = true;

create index if not exists idx_supplier_ingredients_ingredient
on public.supplier_ingredients(branch_id, ingredient_id)
where is_active = true;

alter table public.supplier_ingredients enable row level security;

drop policy if exists supplier_ingredients_read on public.supplier_ingredients;
create policy supplier_ingredients_read
on public.supplier_ingredients
for select
to authenticated
using (
    exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.branch_id = supplier_ingredients.branch_id
          and lower(trim(coalesce(p.role,''))) in ('admin','manager')
    )
);

-- ---------------------------------------------------------
-- รายการวัตถุดิบพร้อม flag ว่าอยู่ใน Supplier นี้หรือไม่
-- ---------------------------------------------------------
create or replace function public.backoffice_supplier_ingredient_list(
    p_supplier_id uuid
)
returns table(
    ingredient_id uuid,
    ingredient_name text,
    unit text,
    ingredient_type text,
    cost_per_unit numeric,
    is_linked boolean
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

    if v_branch is null then
        raise exception 'BACKOFFICE_PERMISSION_DENIED';
    end if;

    if p_supplier_id is null then
        raise exception 'SUPPLIER_REQUIRED';
    end if;

    if not exists (
        select 1
        from public.suppliers s
        where s.id = p_supplier_id
          and s.branch_id = v_branch
    ) then
        raise exception 'SUPPLIER_NOT_FOUND';
    end if;

    return query
    select
        i.id,
        i.name,
        i.unit,
        i.ingredient_type,
        i.cost_per_unit,
        exists (
            select 1
            from public.supplier_ingredients si
            where si.branch_id = v_branch
              and si.supplier_id = p_supplier_id
              and si.ingredient_id = i.id
              and si.is_active = true
        ) as is_linked
    from public.ingredients i
    where i.branch_id = v_branch
      and i.is_active = true
    order by
        case i.ingredient_type
            when 'raw' then 1
            when 'beverage' then 2
            when 'packaging' then 3
            when 'consumable' then 4
            when 'prep' then 5
            else 9
        end,
        i.name;
end
$$;

-- ---------------------------------------------------------
-- บันทึก mapping ทั้งชุดของ Supplier
-- ---------------------------------------------------------
create or replace function public.backoffice_save_supplier_ingredients(
    p_supplier_id uuid,
    p_ingredient_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare
    v_branch uuid;
    v_role text;
    v_count integer := 0;
begin
    select x.branch_id, x.role
    into v_branch, v_role
    from public._bo_ctx() x;

    if v_branch is null then
        raise exception 'BACKOFFICE_PERMISSION_DENIED';
    end if;

    if lower(trim(coalesce(v_role,''))) not in ('admin','manager') then
        raise exception 'BACKOFFICE_PERMISSION_DENIED';
    end if;

    if p_supplier_id is null then
        raise exception 'SUPPLIER_REQUIRED';
    end if;

    if not exists (
        select 1
        from public.suppliers s
        where s.id = p_supplier_id
          and s.branch_id = v_branch
    ) then
        raise exception 'SUPPLIER_NOT_FOUND';
    end if;

    -- ปิด mapping เดิมก่อน
    update public.supplier_ingredients
    set is_active = false,
        updated_at = now()
    where branch_id = v_branch
      and supplier_id = p_supplier_id;

    -- เปิด/เพิ่มเฉพาะรายการที่ส่งมา
    if coalesce(array_length(p_ingredient_ids,1),0) > 0 then
        insert into public.supplier_ingredients(
            branch_id,
            supplier_id,
            ingredient_id,
            is_active
        )
        select
            v_branch,
            p_supplier_id,
            i.id,
            true
        from public.ingredients i
        where i.branch_id = v_branch
          and i.is_active = true
          and i.id = any(p_ingredient_ids)
        on conflict(branch_id,supplier_id,ingredient_id)
        do update
        set is_active = true,
            updated_at = now();

        get diagnostics v_count = row_count;
    end if;

    return v_count;
end
$$;

-- ---------------------------------------------------------
-- ใช้หน้า PO ดึงเฉพาะวัตถุดิบของ Supplier
-- ---------------------------------------------------------
create or replace function public.backoffice_list_supplier_ingredients(
    p_supplier_id uuid
)
returns table(
    id uuid,
    name text,
    unit text,
    cost_per_unit numeric,
    ingredient_type text,
    usable_yield_pct numeric
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

    if v_branch is null then
        raise exception 'BACKOFFICE_PERMISSION_DENIED';
    end if;

    if p_supplier_id is null then
        return;
    end if;

    return query
    select
        i.id,
        i.name,
        i.unit,
        i.cost_per_unit,
        i.ingredient_type,
        i.usable_yield_pct
    from public.supplier_ingredients si
    join public.ingredients i
      on i.id = si.ingredient_id
     and i.branch_id = si.branch_id
    where si.branch_id = v_branch
      and si.supplier_id = p_supplier_id
      and si.is_active = true
      and i.is_active = true
    order by
        case i.ingredient_type
            when 'raw' then 1
            when 'beverage' then 2
            when 'packaging' then 3
            when 'consumable' then 4
            when 'prep' then 5
            else 9
        end,
        i.name;
end
$$;

revoke all on function public.backoffice_supplier_ingredient_list(uuid) from public;
revoke all on function public.backoffice_save_supplier_ingredients(uuid,uuid[]) from public;
revoke all on function public.backoffice_list_supplier_ingredients(uuid) from public;

grant execute on function public.backoffice_supplier_ingredient_list(uuid) to authenticated;
grant execute on function public.backoffice_save_supplier_ingredients(uuid,uuid[]) to authenticated;
grant execute on function public.backoffice_list_supplier_ingredients(uuid) to authenticated;

commit;

select 'JOKJUNG SUPPLIER INGREDIENT GROUP V1.3 READY' as result;
