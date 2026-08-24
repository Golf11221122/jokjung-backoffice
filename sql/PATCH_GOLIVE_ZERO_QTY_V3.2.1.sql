-- =========================================================
-- JOKJUNG GO-LIVE ZERO OPENING STOCK FIX V3.2.1
--
-- แก้ปัญหา:
-- ingredient_stock_quantity_check
-- เมื่อ Opening Qty = 0
--
-- หลักการ:
-- - opening_stock_items ยังบันทึก 0 ได้ (schema อนุญาต >= 0)
-- - ingredients.current_stock ยังถูกตั้งเป็น 0 ได้
-- - แต่จะไม่สร้าง ingredient_stock_movements ที่ quantity = 0
--   เพราะ stock movement constraint ไม่อนุญาต zero quantity
--
-- ไม่ลบข้อมูล / ไม่แก้ Master Data
-- =========================================================

begin;

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
    v_positive_count integer:=0;
    v_zero_count integer:=0;
    v_value numeric:=0;
    v_conflicts bigint:=0;
begin
    select x.user_id,x.branch_id,x.role
    into v_user,v_branch,v_role
    from public._bo_ctx() x;

    if v_branch is null then
        raise exception 'BACKOFFICE_PERMISSION_DENIED';
    end if;

    if v_role<>'admin' then
        raise exception 'ADMIN_REQUIRED';
    end if;

    if p_go_live_at is null then
        raise exception 'GO_LIVE_AT_REQUIRED';
    end if;

    if exists (
        select 1
        from public.branch_go_live_settings
        where branch_id=v_branch
          and status='live'
    ) then
        raise exception 'GO_LIVE_ALREADY_ACTIVE';
    end if;

    if jsonb_array_length(coalesce(p_items,'[]'::jsonb))=0 then
        raise exception 'OPENING_STOCK_REQUIRED';
    end if;

    select
        (select count(*)
         from public.ingredient_stock_movements
         where branch_id=v_branch
           and created_at>=p_go_live_at)
        +
        (select count(*)
         from public.sales
         where branch_id=v_branch
           and created_at>=p_go_live_at)
        +
        (select count(*)
         from public.production_batches
         where branch_id=v_branch
           and created_at>=p_go_live_at)
    into v_conflicts;

    if v_conflicts>0 then
        raise exception 'GO_LIVE_TIME_HAS_EXISTING_TRANSACTIONS';
    end if;

    insert into public.opening_stock_batches(
        branch_id,
        go_live_at,
        note,
        posted_by
    )
    values(
        v_branch,
        p_go_live_at,
        nullif(trim(coalesce(p_note,'')),''),
        v_user
    )
    returning id into v_batch;

    for v_row in
        select *
        from jsonb_array_elements(p_items)
    loop
        v_ing := (v_row->>'ingredient_id')::uuid;
        v_qty := coalesce((v_row->>'opening_qty')::numeric,0);
        v_cost := coalesce((v_row->>'unit_cost')::numeric,0);

        if v_qty<0 or v_cost<0 then
            raise exception 'INVALID_OPENING_STOCK';
        end if;

        select i.current_stock
        into v_before
        from public.ingredients i
        where i.id=v_ing
          and i.branch_id=v_branch
          and i.is_active=true
        for update;

        if not found then
            raise exception 'INGREDIENT_NOT_FOUND';
        end if;

        -- เก็บ snapshot Opening Stock ทุกตัว รวมถึง Qty = 0
        insert into public.opening_stock_items(
            opening_stock_batch_id,
            ingredient_id,
            opening_qty,
            unit_cost,
            opening_value,
            previous_test_qty
        )
        values(
            v_batch,
            v_ing,
            v_qty,
            v_cost,
            round(v_qty*v_cost,2),
            coalesce(v_before,0)
        );

        -- ตั้ง Stock จริงตาม Opening Qty แม้เป็น 0
        update public.ingredients
        set current_stock=v_qty,
            cost_per_unit=v_cost,
            updated_at=now()
        where id=v_ing
          and branch_id=v_branch;

        -- สำคัญ:
        -- movement table ไม่ยอมรับ quantity = 0
        -- จึงสร้าง opening movement เฉพาะรายการที่มากกว่า 0
        if v_qty > 0 then
            insert into public.ingredient_stock_movements(
                branch_id,
                ingredient_id,
                movement_type,
                quantity,
                stock_before,
                stock_after,
                unit_cost,
                note,
                created_by,
                created_at
            )
            values(
                v_branch,
                v_ing,
                'opening',
                v_qty,
                coalesce(v_before,0),
                v_qty,
                v_cost,
                'GO-LIVE OPENING STOCK',
                v_user,
                p_go_live_at
            );

            v_positive_count := v_positive_count + 1;
        else
            v_zero_count := v_zero_count + 1;
        end if;

        v_count := v_count + 1;
        v_value := v_value + round(v_qty*v_cost,2);
    end loop;

    insert into public.branch_go_live_settings(
        branch_id,
        go_live_at,
        status,
        note,
        activated_by,
        activated_at
    )
    values(
        v_branch,
        p_go_live_at,
        'live',
        nullif(trim(coalesce(p_note,'')),''),
        v_user,
        now()
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
        'opening_positive_items',v_positive_count,
        'opening_zero_items',v_zero_count,
        'opening_value',round(v_value,2)
    );
end
$$;

grant execute on function public.backoffice_activate_go_live(
    timestamptz,jsonb,text
) to authenticated;

commit;

select
    'JOKJUNG GO-LIVE V3.2.1 ZERO QTY FIX READY' as result;
