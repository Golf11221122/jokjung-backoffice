-- RAW USABLE YIELD AWARE: requires PATCH_RAW_USABLE_YIELD_V1.sql
-- =========================================================
-- JOKJUNG BACK OFFICE - COST FIX CENTER V1
-- วิเคราะห์สาเหตุ COGS = 0 จากข้อมูลจริง
-- ไม่แก้ต้นทุนอัตโนมัติ / ไม่สร้าง Recipe ใหม่
-- =========================================================

create or replace function public.backoffice_cost_fix_center_v1(
    p_date_from date default current_date,
    p_date_to date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
    v_branch uuid;
    v_items jsonb := '[]'::jsonb;
    v_total bigint := 0;
    v_no_recipe bigint := 0;
    v_ing_cost bigint := 0;
    v_not_synced bigint := 0;
    v_sale_snapshot bigint := 0;
    v_other bigint := 0;
begin
    select x.branch_id into v_branch
    from public._bo_ctx() x;

    if v_branch is null then
        raise exception 'BACKOFFICE_PERMISSION_DENIED';
    end if;

    if p_date_from is null
       or p_date_to is null
       or p_date_to < p_date_from
    then
        raise exception 'INVALID_DATE_RANGE';
    end if;

    with sold as (
        select
            si.product_id,
            coalesce(max(si.product_name),'ไม่ระบุเมนู') as product_name,
            sum(coalesce(si.quantity,0)) as sold_qty,
            round(sum(
                coalesce(
                    si.total_price,
                    coalesce(si.unit_price,0) * coalesce(si.quantity,0)
                )
            ),2) as sales_amount,
            round(sum(
                coalesce(si.unit_cost,0) * coalesce(si.quantity,0)
            ),4) as captured_cogs,
            count(*) as sale_line_count,
            count(*) filter (
                where coalesce(si.unit_cost,0) <= 0
            ) as zero_cost_lines
        from public.sale_items si
        join public.sales s
          on s.id = si.sale_id
        where s.branch_id = v_branch
          and s.created_at >= p_date_from::timestamptz
          and s.created_at < (p_date_to + 1)::timestamptz
          and coalesce(s.status,'') <> 'cancelled'
        group by si.product_id
    ),
    diagnostic as (
        select
            s.*,
            p.id as current_product_id,
            p.cost as product_cost,
            p.price as product_price,

            coalesce((
                select count(*)
                from public.product_recipes pr
                where pr.branch_id = v_branch
                  and pr.product_id = s.product_id
            ),0) as recipe_rows,

            coalesce((
                select round(sum(
                    coalesce(pr.quantity_used,0)
                    * public.jokjung_effective_ingredient_cost(i.cost_per_unit,i.ingredient_type,i.usable_yield_pct)
                ),4)
                from public.product_recipes pr
                left join public.ingredients i
                  on i.id = pr.ingredient_id
                 and i.branch_id = v_branch
                where pr.branch_id = v_branch
                  and pr.product_id = s.product_id
            ),0) as recipe_cost,

            coalesce((
                select count(*)
                from public.product_recipes pr
                left join public.ingredients i
                  on i.id = pr.ingredient_id
                 and i.branch_id = v_branch
                where pr.branch_id = v_branch
                  and pr.product_id = s.product_id
                  and (
                      i.id is null
                      or coalesce(i.is_active,true) = false
                  )
            ),0) as missing_or_inactive_ingredients,

            coalesce((
                select count(*)
                from public.product_recipes pr
                join public.ingredients i
                  on i.id = pr.ingredient_id
                 and i.branch_id = v_branch
                where pr.branch_id = v_branch
                  and pr.product_id = s.product_id
                  and public.jokjung_effective_ingredient_cost(i.cost_per_unit,i.ingredient_type,i.usable_yield_pct) <= 0
            ),0) as zero_cost_ingredients,

            coalesce((
                select jsonb_agg(
                    jsonb_build_object(
                        'ingredient_id', i.id,
                        'ingredient_name', coalesce(i.name,'ไม่พบวัตถุดิบ'),
                        'unit', i.unit,
                        'quantity_used', pr.quantity_used,
                        'purchase_cost_per_unit', coalesce(i.cost_per_unit,0),
                        'usable_yield_pct', case when i.ingredient_type='raw' then coalesce(i.usable_yield_pct,100) else null end,
                        'cost_per_unit', public.jokjung_effective_ingredient_cost(i.cost_per_unit,i.ingredient_type,i.usable_yield_pct),
                        'line_cost',
                            round(
                                coalesce(pr.quantity_used,0)
                                * public.jokjung_effective_ingredient_cost(i.cost_per_unit,i.ingredient_type,i.usable_yield_pct),
                                4
                            ),
                        'is_active', i.is_active
                    )
                    order by coalesce(i.name,'')
                )
                from public.product_recipes pr
                left join public.ingredients i
                  on i.id = pr.ingredient_id
                 and i.branch_id = v_branch
                where pr.branch_id = v_branch
                  and pr.product_id = s.product_id
            ),'[]'::jsonb) as ingredients

        from sold s
        left join public.products p
          on p.id = s.product_id
         and p.branch_id = v_branch

        -- Cost Fix Center สนใจเฉพาะเมนูที่มี sale line ต้นทุน 0
        where s.zero_cost_lines > 0
    ),
    classified as (
        select
            d.*,
            case
                when d.product_id is null
                  or d.current_product_id is null
                    then 'PRODUCT_LINK_MISSING'

                when d.recipe_rows = 0
                    then 'NO_RECIPE'

                when d.missing_or_inactive_ingredients > 0
                    then 'INGREDIENT_MISSING'

                when d.zero_cost_ingredients > 0
                    then 'INGREDIENT_COST_ZERO'

                when d.recipe_cost > 0
                  and coalesce(d.product_cost,0) <= 0
                    then 'PRODUCT_COST_NOT_SYNCED'

                when d.recipe_cost > 0
                  and coalesce(d.product_cost,0) > 0
                  and d.zero_cost_lines > 0
                    then 'SALE_COST_NOT_CAPTURED'

                else 'REVIEW_REQUIRED'
            end as issue_code
        from diagnostic d
    )
    select
        coalesce(jsonb_agg(
            jsonb_build_object(
                'product_id', product_id,
                'product_name', product_name,
                'sold_qty', sold_qty,
                'sales_amount', sales_amount,
                'captured_cogs', captured_cogs,
                'sale_line_count', sale_line_count,
                'zero_cost_lines', zero_cost_lines,
                'product_cost', coalesce(product_cost,0),
                'product_price', coalesce(product_price,0),
                'recipe_rows', recipe_rows,
                'recipe_cost', recipe_cost,
                'zero_cost_ingredients', zero_cost_ingredients,
                'missing_or_inactive_ingredients', missing_or_inactive_ingredients,
                'ingredients', ingredients,
                'issue_code', issue_code,
                'issue_text',
                    case issue_code
                        when 'PRODUCT_LINK_MISSING'
                            then 'Sale Item ไม่ผูก Product ปัจจุบัน'
                        when 'NO_RECIPE'
                            then 'ยังไม่มี Recipe / BOM'
                        when 'INGREDIENT_MISSING'
                            then 'Recipe อ้างวัตถุดิบที่หายหรือปิดใช้งาน'
                        when 'INGREDIENT_COST_ZERO'
                            then 'มีวัตถุดิบใน Recipe ที่ต้นทุน = 0'
                        when 'PRODUCT_COST_NOT_SYNCED'
                            then 'Recipe มีต้นทุน แต่ products.cost ยังเป็น 0'
                        when 'SALE_COST_NOT_CAPTURED'
                            then 'ต้นทุนปัจจุบันมีแล้ว แต่ Sale เก่าบันทึก unit_cost = 0'
                        else 'ต้องตรวจข้อมูลเพิ่มเติม'
                    end,
                'recommended_action',
                    case issue_code
                        when 'PRODUCT_LINK_MISSING'
                            then 'ตรวจ Product Mapping / Sale Item'
                        when 'NO_RECIPE'
                            then 'สร้าง Recipe / BOM'
                        when 'INGREDIENT_MISSING'
                            then 'แก้ Recipe ให้ใช้วัตถุดิบที่ใช้งานอยู่'
                        when 'INGREDIENT_COST_ZERO'
                            then 'ใส่ต้นทุนวัตถุดิบก่อน'
                        when 'PRODUCT_COST_NOT_SYNCED'
                            then 'บันทึก Recipe ใหม่เพื่อ Sync Product Cost'
                        when 'SALE_COST_NOT_CAPTURED'
                            then 'ต้นทุนใหม่จะมีผลกับ Sale ใหม่; Sale เก่าคง Snapshot เดิม'
                        else 'ตรวจ Cost Control'
                    end
            )
            order by sales_amount desc
        ),'[]'::jsonb),

        count(*),
        count(*) filter(where issue_code='NO_RECIPE'),
        count(*) filter(where issue_code='INGREDIENT_COST_ZERO'),
        count(*) filter(where issue_code='PRODUCT_COST_NOT_SYNCED'),
        count(*) filter(where issue_code='SALE_COST_NOT_CAPTURED'),
        count(*) filter(where issue_code not in (
            'NO_RECIPE',
            'INGREDIENT_COST_ZERO',
            'PRODUCT_COST_NOT_SYNCED',
            'SALE_COST_NOT_CAPTURED'
        ))
    into
        v_items,
        v_total,
        v_no_recipe,
        v_ing_cost,
        v_not_synced,
        v_sale_snapshot,
        v_other
    from classified;

    return jsonb_build_object(
        'date_from', p_date_from,
        'date_to', p_date_to,
        'total_issues', v_total,
        'no_recipe_count', v_no_recipe,
        'ingredient_cost_zero_count', v_ing_cost,
        'product_cost_not_synced_count', v_not_synced,
        'sale_cost_not_captured_count', v_sale_snapshot,
        'other_issue_count', v_other,
        'items', v_items
    );
end;
$$;

revoke all
on function public.backoffice_cost_fix_center_v1(date,date)
from public;

grant execute
on function public.backoffice_cost_fix_center_v1(date,date)
to authenticated;

-- ไม่มี TEST SELECT ท้ายไฟล์
