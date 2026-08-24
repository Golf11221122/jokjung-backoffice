-- =========================================================
-- JOKJUNG PRODUCTION STOCK FIX V3.2
-- แก้ Production ให้เป็น Atomic Stock Conversion:
--   INPUT  -> current_stock ลด + production_out
--   OUTPUT -> current_stock เพิ่ม + production_in
--
-- ใช้ public.ingredients.current_stock เป็น Stock Source หลัก
-- ตามโครงสร้างฐานข้อมูลปัจจุบัน
--
-- ไม่แก้ข้อมูลเก่า / ไม่ลบข้อมูล
-- =========================================================

begin;

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
set search_path = public
as $$
declare
    v_user uuid;
    v_branch uuid;

    v_batch uuid;
    v_batch_no text;

    v_row jsonb;
    v_ing uuid;
    v_qty numeric;

    v_before numeric;
    v_after numeric;
    v_cost numeric;
    v_line numeric;
    v_total numeric := 0;

    v_output_before numeric;
    v_output_after numeric;
    v_output_old_cost numeric;
    v_batch_unit_cost numeric;
    v_weighted_cost numeric;

    v_basis_qty numeric := 0;
    v_actual_yield numeric := null;
    v_std_yield numeric := null;
    v_yield_var numeric := null;
    v_loss_value numeric := 0;

    v_rows integer;
    v_input_count integer := 0;
    v_distinct_count integer := 0;
begin
    -- -----------------------------------------------------
    -- Context / Permission
    -- -----------------------------------------------------
    select x.user_id, x.branch_id
      into v_user, v_branch
    from public._bo_ctx() x;

    if v_user is null or v_branch is null then
        raise exception 'BACKOFFICE_PERMISSION_DENIED';
    end if;

    if coalesce(p_actual_output_qty, 0) <= 0 then
        raise exception 'OUTPUT_QTY_REQUIRED';
    end if;

    if not exists (
        select 1
        from public.ingredients i
        where i.id = p_output_ingredient_id
          and i.branch_id = v_branch
          and i.is_active = true
          and i.ingredient_type = 'prep'
    ) then
        raise exception 'PREP_OUTPUT_REQUIRED';
    end if;

    if jsonb_typeof(coalesce(p_inputs, '[]'::jsonb)) <> 'array'
       or jsonb_array_length(coalesce(p_inputs, '[]'::jsonb)) = 0 then
        raise exception 'PRODUCTION_INPUTS_REQUIRED';
    end if;

    -- -----------------------------------------------------
    -- Reject duplicate ingredient inputs
    -- -----------------------------------------------------
    select
        count(*),
        count(distinct (x->>'ingredient_id'))
    into v_input_count, v_distinct_count
    from jsonb_array_elements(p_inputs) x;

    if v_input_count <> v_distinct_count then
        raise exception 'DUPLICATE_PRODUCTION_INPUT';
    end if;

    -- -----------------------------------------------------
    -- Standard Yield
    -- -----------------------------------------------------
    if p_recipe_id is not null then
        select coalesce(r.standard_yield_pct, i.standard_yield_pct)
          into v_std_yield
        from public.production_recipes r
        join public.ingredients i
          on i.id = r.output_ingredient_id
        where r.id = p_recipe_id
          and r.branch_id = v_branch
          and r.output_ingredient_id = p_output_ingredient_id;

        if not found then
            raise exception 'PRODUCTION_RECIPE_NOT_FOUND';
        end if;
    else
        select i.standard_yield_pct
          into v_std_yield
        from public.ingredients i
        where i.id = p_output_ingredient_id
          and i.branch_id = v_branch;
    end if;

    -- -----------------------------------------------------
    -- Create batch
    -- -----------------------------------------------------
    v_batch_no := public._bo_next_production_batch_no();

    insert into public.production_batches(
        branch_id,
        batch_no,
        production_recipe_id,
        output_ingredient_id,
        actual_output_qty,
        standard_yield_pct,
        note,
        created_by
    )
    values(
        v_branch,
        v_batch_no,
        p_recipe_id,
        p_output_ingredient_id,
        p_actual_output_qty,
        v_std_yield,
        nullif(trim(coalesce(p_note, '')), ''),
        v_user
    )
    returning id into v_batch;

    -- -----------------------------------------------------
    -- Consume every input
    -- IMPORTANT:
    -- Lock -> Validate -> UPDATE stock -> verify -> detail -> movement
    -- -----------------------------------------------------
    for v_row in
        select value
        from jsonb_array_elements(p_inputs)
    loop
        v_ing := nullif(v_row->>'ingredient_id', '')::uuid;
        v_qty := coalesce((v_row->>'quantity')::numeric, 0);

        if v_ing is null then
            raise exception 'INGREDIENT_REQUIRED';
        end if;

        if v_qty <= 0 then
            raise exception 'INVALID_PRODUCTION_INPUT_QTY';
        end if;

        if v_ing = p_output_ingredient_id then
            raise exception 'OUTPUT_CANNOT_BE_INPUT';
        end if;

        select
            coalesce(i.current_stock, 0),
            coalesce(i.cost_per_unit, 0)
        into
            v_before,
            v_cost
        from public.ingredients i
        where i.id = v_ing
          and i.branch_id = v_branch
          and i.is_active = true
        for update;

        if not found then
            raise exception 'INGREDIENT_NOT_FOUND:%', v_ing;
        end if;

        if v_before < v_qty then
            raise exception
                'INSUFFICIENT_STOCK:% available=% required=%',
                v_ing, v_before, v_qty;
        end if;

        v_after := v_before - v_qty;
        v_line := round(v_qty * v_cost, 2);
        v_total := v_total + v_line;

        update public.ingredients
           set current_stock = v_after,
               updated_at = now()
         where id = v_ing
           and branch_id = v_branch;

        get diagnostics v_rows = row_count;

        if v_rows <> 1 then
            raise exception 'PRODUCTION_INPUT_STOCK_UPDATE_FAILED:%', v_ing;
        end if;

        -- Hard verification before continuing
        if not exists (
            select 1
            from public.ingredients i
            where i.id = v_ing
              and i.branch_id = v_branch
              and i.current_stock = v_after
        ) then
            raise exception 'PRODUCTION_INPUT_STOCK_VERIFY_FAILED:%', v_ing;
        end if;

        insert into public.production_batch_inputs(
            production_batch_id,
            ingredient_id,
            quantity,
            unit_cost,
            line_cost,
            is_yield_basis
        )
        values(
            v_batch,
            v_ing,
            v_qty,
            v_cost,
            v_line,
            coalesce((v_row->>'is_yield_basis')::boolean, false)
        );

        if coalesce((v_row->>'is_yield_basis')::boolean, false) then
            v_basis_qty := v_basis_qty + v_qty;
        end if;

        insert into public.ingredient_stock_movements(
            branch_id,
            ingredient_id,
            movement_type,
            quantity,
            stock_before,
            stock_after,
            unit_cost,
            note,
            created_by
        )
        values(
            v_branch,
            v_ing,
            'production_out',
            v_qty,
            v_before,
            v_after,
            v_cost,
            'Production ' || v_batch_no || ' → ' ||
                (select name
                 from public.ingredients
                 where id = p_output_ingredient_id),
            v_user
        );
    end loop;

    -- -----------------------------------------------------
    -- Add Prep output
    -- -----------------------------------------------------
    v_batch_unit_cost :=
        case
            when p_actual_output_qty > 0
                then round(v_total / p_actual_output_qty, 4)
            else 0
        end;

    select
        coalesce(i.current_stock, 0),
        coalesce(i.cost_per_unit, 0)
    into
        v_output_before,
        v_output_old_cost
    from public.ingredients i
    where i.id = p_output_ingredient_id
      and i.branch_id = v_branch
      and i.is_active = true
    for update;

    if not found then
        raise exception 'PREP_OUTPUT_NOT_FOUND';
    end if;

    v_output_after := v_output_before + p_actual_output_qty;

    v_weighted_cost :=
        case
            when v_output_after > 0 then
                round(
                    (
                        (v_output_before * v_output_old_cost)
                        + v_total
                    ) / v_output_after,
                    4
                )
            else v_batch_unit_cost
        end;

    update public.ingredients
       set current_stock = v_output_after,
           cost_per_unit = v_weighted_cost,
           updated_at = now()
     where id = p_output_ingredient_id
       and branch_id = v_branch;

    get diagnostics v_rows = row_count;

    if v_rows <> 1 then
        raise exception 'PRODUCTION_OUTPUT_STOCK_UPDATE_FAILED';
    end if;

    if not exists (
        select 1
        from public.ingredients i
        where i.id = p_output_ingredient_id
          and i.branch_id = v_branch
          and i.current_stock = v_output_after
    ) then
        raise exception 'PRODUCTION_OUTPUT_STOCK_VERIFY_FAILED';
    end if;

    insert into public.ingredient_stock_movements(
        branch_id,
        ingredient_id,
        movement_type,
        quantity,
        stock_before,
        stock_after,
        unit_cost,
        note,
        created_by
    )
    values(
        v_branch,
        p_output_ingredient_id,
        'production_in',
        p_actual_output_qty,
        v_output_before,
        v_output_after,
        v_batch_unit_cost,
        'Production ' || v_batch_no,
        v_user
    );

    -- -----------------------------------------------------
    -- Yield / Production costing
    -- -----------------------------------------------------
    if v_basis_qty > 0 then
        v_actual_yield :=
            round(p_actual_output_qty / v_basis_qty * 100, 4);

        if v_std_yield is not null then
            v_yield_var :=
                round(v_actual_yield - v_std_yield, 4);

            if v_actual_yield < v_std_yield then
                v_loss_value :=
                    round(
                        greatest(
                            (v_basis_qty * v_std_yield / 100)
                            - p_actual_output_qty,
                            0
                        ) * v_batch_unit_cost,
                        2
                    );
            end if;
        end if;
    end if;

    -- Update only columns that exist in the current V3.1 schema.
    update public.production_batches
       set total_input_cost = v_total,
           output_unit_cost = v_batch_unit_cost,
           actual_yield_pct = v_actual_yield,
           yield_variance_pct = v_yield_var,
           yield_loss_value = v_loss_value
     where id = v_batch;

    return v_batch;
end
$$;

revoke all on function public.backoffice_post_production_batch(
    uuid, uuid, numeric, text, jsonb
) from public;

grant execute on function public.backoffice_post_production_batch(
    uuid, uuid, numeric, text, jsonb
) to authenticated;

commit;

-- =========================================================
-- VERIFY FUNCTION INSTALLED
-- =========================================================
select
    p.proname as function_name,
    pg_get_function_identity_arguments(p.oid) as arguments,
    case when p.prosecdef then 'SECURITY DEFINER' else 'SECURITY INVOKER' end as security_mode
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'backoffice_post_production_batch';

-- =========================================================
-- หลังติดตั้ง:
-- ทดสอบผ่านหน้า Back Office > Production / Prep เท่านั้น
-- ห้ามทดสอบ RPC นี้ตรงจาก SQL Editor เพราะ _bo_ctx() ต้องใช้ผู้ใช้ login
--
-- ผลที่ต้องได้:
-- Raw Input  : current_stock ลด + production_out 1 รายการ
-- Prep Output: current_stock เพิ่ม + production_in  1 รายการ
-- ทั้งหมดอยู่ใน transaction เดียวกัน
-- =========================================================
