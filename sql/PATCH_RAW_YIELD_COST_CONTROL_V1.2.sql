-- =========================================================
-- JOKJUNG RAW USABLE YIELD V1.2
-- Cost Control / Sale Stock Cost Snapshot Fix
--
-- เป้าหมาย
-- 1) Stock movement ประเภท sale ใช้ Effective Cost ของ Raw
-- 2) Prep / Beverage / Packaging / Consumable ใช้ cost_per_unit เดิม
-- 3) Sale-rule deduction snapshot ใช้ Effective Cost เช่นกัน
-- 4) มีผลกับธุรกรรมใหม่หลังติดตั้ง ไม่ย้อนแก้ประวัติเดิม
-- =========================================================

begin;

-- ต้องติดตั้ง RAW USABLE YIELD V1 ก่อน
do $$
begin
    if to_regprocedure('public.jokjung_effective_ingredient_cost(numeric,text,numeric)') is null then
        raise exception 'RAW_USABLE_YIELD_V1_REQUIRED';
    end if;
end $$;

-- ---------------------------------------------------------
-- A) บังคับต้นทุนของ Stock Movement ตอนขายให้เป็น Effective Cost
-- ---------------------------------------------------------
create or replace function public.jokjung_set_sale_movement_effective_cost()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
    v_cost numeric;
    v_type text;
    v_yield numeric;
begin
    if new.movement_type = 'sale' then
        select i.cost_per_unit, i.ingredient_type, i.usable_yield_pct
        into v_cost, v_type, v_yield
        from public.ingredients i
        where i.id = new.ingredient_id;

        if found then
            new.unit_cost :=
                public.jokjung_effective_ingredient_cost(
                    v_cost,
                    v_type,
                    v_yield
                );
        end if;
    end if;

    return new;
end
$$;

drop trigger if exists trg_jokjung_sale_movement_effective_cost
on public.ingredient_stock_movements;

create trigger trg_jokjung_sale_movement_effective_cost
before insert on public.ingredient_stock_movements
for each row
execute function public.jokjung_set_sale_movement_effective_cost();

-- ---------------------------------------------------------
-- B) Sale Rule snapshot ต้องเก็บต้นทุนเดียวกับ Stock Movement
-- ---------------------------------------------------------
create or replace function public.jokjung_set_sale_rule_effective_cost()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
    v_cost numeric;
    v_type text;
    v_yield numeric;
begin
    select i.cost_per_unit, i.ingredient_type, i.usable_yield_pct
    into v_cost, v_type, v_yield
    from public.ingredients i
    where i.id = new.ingredient_id;

    if found then
        new.unit_cost :=
            public.jokjung_effective_ingredient_cost(
                v_cost,
                v_type,
                v_yield
            );
    end if;

    return new;
end
$$;

do $$
begin
    if to_regclass('public.sale_rule_stock_deductions') is not null then
        execute 'drop trigger if exists trg_jokjung_sale_rule_effective_cost on public.sale_rule_stock_deductions';
        execute '
            create trigger trg_jokjung_sale_rule_effective_cost
            before insert on public.sale_rule_stock_deductions
            for each row
            execute function public.jokjung_set_sale_rule_effective_cost()
        ';
    end if;
end $$;

-- Internal trigger functions are not browser RPCs.
revoke all on function public.jokjung_set_sale_movement_effective_cost() from public;
revoke all on function public.jokjung_set_sale_rule_effective_cost() from public;

commit;

select 'JOKJUNG RAW YIELD COST CONTROL V1.2 READY' as result;
