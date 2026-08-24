-- =========================================================
-- JOKJUNG RAW USABLE YIELD V1
-- Direct Raw -> Recipe/BOM costing
--
-- IMPORTANT SEMANTICS
-- cost_per_unit         = purchase / inventory cost
-- usable_yield_pct      = edible/usable % for RAW used directly in Recipe
-- effective recipe cost = purchase cost / usable yield
-- standard_yield_pct    = Production/Prep yield (unchanged)
-- =========================================================

begin;

alter table public.ingredients
    add column if not exists usable_yield_pct numeric(7,2) not null default 100;

update public.ingredients
set usable_yield_pct = 100
where usable_yield_pct is null
   or usable_yield_pct <= 0
   or usable_yield_pct > 100;

alter table public.ingredients
    drop constraint if exists ingredients_usable_yield_pct_check;

alter table public.ingredients
    add constraint ingredients_usable_yield_pct_check
    check (usable_yield_pct > 0 and usable_yield_pct <= 100);

create or replace function public.jokjung_effective_ingredient_cost(
    p_cost numeric,
    p_ingredient_type text,
    p_usable_yield_pct numeric
)
returns numeric
language sql
immutable
as $$
    select case
        when coalesce(p_ingredient_type,'')='raw' then
            round(
                greatest(coalesce(p_cost,0),0)
                / (greatest(least(coalesce(p_usable_yield_pct,100),100),0.01)/100),
                6
            )
        else greatest(coalesce(p_cost,0),0)
    end;
$$;

-- V3.2 list: leaves V3.1 intact for Production and older screens.
create or replace function public.backoffice_list_ingredients_v32()
returns table(
    id uuid,name text,unit text,cost_per_unit numeric,current_stock numeric,
    min_stock numeric,is_active boolean,category_id uuid,category_name text,
    count_frequency text,ingredient_type text,standard_yield_pct numeric,
    usable_yield_pct numeric,effective_cost_per_unit numeric,
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
           i.ingredient_type,i.standard_yield_pct,coalesce(i.usable_yield_pct,100),
           public.jokjung_effective_ingredient_cost(i.cost_per_unit,i.ingredient_type,i.usable_yield_pct),
           i.created_at,i.updated_at
    from public.ingredients i
    left join public.ingredient_categories c on c.id=i.category_id
    where i.branch_id=v_branch
    order by coalesce(c.display_order,999),coalesce(c.name,'อื่นๆ'),i.name;
end
$$;

create or replace function public.backoffice_save_ingredient_v32(
    p_ingredient_id uuid,p_name text,p_unit text,p_cost_per_unit numeric,
    p_min_stock numeric,p_is_active boolean,p_category_id uuid,
    p_count_frequency text,p_ingredient_type text,p_standard_yield_pct numeric,
    p_usable_yield_pct numeric
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
    v_branch uuid;
    v_id uuid;
    v_name text:=trim(coalesce(p_name,''));
    v_usable numeric:=case when p_ingredient_type='raw' then coalesce(p_usable_yield_pct,100) else 100 end;
begin
    select x.branch_id into v_branch from public._bo_ctx() x;
    if v_branch is null then raise exception 'BACKOFFICE_PERMISSION_DENIED'; end if;
    if v_name='' then raise exception 'INGREDIENT_NAME_REQUIRED'; end if;
    if trim(coalesce(p_unit,''))='' then raise exception 'INGREDIENT_UNIT_REQUIRED'; end if;
    if p_count_frequency not in ('daily','weekly','monthly') then raise exception 'INVALID_COUNT_FREQUENCY'; end if;
    if p_ingredient_type not in ('raw','prep','beverage','packaging','consumable') then raise exception 'INVALID_INGREDIENT_TYPE'; end if;
    if p_standard_yield_pct is not null and p_standard_yield_pct<=0 then raise exception 'INVALID_STANDARD_YIELD'; end if;
    if v_usable<=0 or v_usable>100 then raise exception 'INVALID_USABLE_YIELD'; end if;

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
            category_id,count_frequency,ingredient_type,standard_yield_pct,usable_yield_pct
        ) values(
            v_branch,v_name,trim(p_unit),greatest(coalesce(p_cost_per_unit,0),0),
            0,greatest(coalesce(p_min_stock,0),0),coalesce(p_is_active,true),
            p_category_id,p_count_frequency,p_ingredient_type,
            case when p_ingredient_type='prep' then p_standard_yield_pct else null end,
            v_usable
        ) returning id into v_id;
    else
        update public.ingredients
        set name=v_name,
            unit=trim(p_unit),
            cost_per_unit=greatest(coalesce(p_cost_per_unit,0),0),
            min_stock=greatest(coalesce(p_min_stock,0),0),
            is_active=coalesce(p_is_active,true),
            category_id=p_category_id,
            count_frequency=p_count_frequency,
            ingredient_type=p_ingredient_type,
            standard_yield_pct=case when p_ingredient_type='prep' then p_standard_yield_pct else null end,
            usable_yield_pct=v_usable,
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

revoke all on function public.backoffice_list_ingredients_v32() from public;
revoke all on function public.backoffice_save_ingredient_v32(uuid,text,text,numeric,numeric,boolean,uuid,text,text,numeric,numeric) from public;

grant execute on function public.backoffice_list_ingredients_v32() to authenticated;
grant execute on function public.backoffice_save_ingredient_v32(uuid,text,text,numeric,numeric,boolean,uuid,text,text,numeric,numeric) to authenticated;

-- =========================================================
-- Replace recipe cost sync so products.cost uses Raw Effective Cost.
-- =========================================================

-- =========================================================
-- JOKJUNG BACK OFFICE - BULK COST SYNC V1
-- Preview + Sync products.cost from Recipe/BOM
-- ไม่แก้ sale_items.unit_cost ย้อนหลัง
-- =========================================================

create or replace function public.backoffice_bulk_cost_sync_preview()
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
    v_branch uuid;
    v_items jsonb := '[]'::jsonb;
    v_count bigint := 0;
    v_changed bigint := 0;
begin
    select x.branch_id into v_branch
    from public._bo_ctx() x;
    if v_branch is null then raise exception 'BACKOFFICE_PERMISSION_DENIED'; end if;

    with raw_calc as (
        select
            p.id as product_id,
            p.name as product_name,
            round(coalesce(p.price,0)::numeric,2) as sale_price_2dp,
            round(coalesce(p.cost,0)::numeric,2) as current_cost_2dp,
            count(pr.id) as recipe_rows,
            round(coalesce(sum(coalesce(pr.quantity_used,0)*public.jokjung_effective_ingredient_cost(i.cost_per_unit,i.ingredient_type,i.usable_yield_pct)),0)::numeric,2) as recipe_cost_2dp,
            count(*) filter(where pr.id is not null and (i.id is null or coalesce(i.is_active,true)=false)) as broken_ingredient_rows,
            count(*) filter(where pr.id is not null and i.id is not null and public.jokjung_effective_ingredient_cost(i.cost_per_unit,i.ingredient_type,i.usable_yield_pct)<=0) as zero_cost_ingredient_rows
        from public.products p
        left join public.product_recipes pr
          on pr.product_id=p.id and pr.branch_id=v_branch
        left join public.ingredients i
          on i.id=pr.ingredient_id and i.branch_id=v_branch
        where p.branch_id=v_branch
        group by p.id,p.name,p.price,p.cost
    ),
    calc as (
        select *,
            round(recipe_cost_2dp-current_cost_2dp,2) as difference_2dp,
            (recipe_rows>0 and broken_ingredient_rows=0 and zero_cost_ingredient_rows=0) as syncable
        from raw_calc
    ),
    final as (
        select *,
            (syncable and difference_2dp<>0::numeric) as needs_sync
        from calc
    )
    select
        coalesce(jsonb_agg(jsonb_build_object(
            'product_id',product_id,
            'product_name',product_name,
            'sale_price',sale_price_2dp,
            'current_cost',current_cost_2dp,
            'recipe_rows',recipe_rows,
            'recipe_cost',recipe_cost_2dp,
            'difference',difference_2dp,
            'broken_ingredient_rows',broken_ingredient_rows,
            'zero_cost_ingredient_rows',zero_cost_ingredient_rows,
            'syncable',syncable,
            'needs_sync',needs_sync
        ) order by needs_sync desc, product_name),'[]'::jsonb),
        count(*),
        count(*) filter(where needs_sync)
    into v_items,v_count,v_changed
    from final;

    return jsonb_build_object(
        'version','1.3',
        'total_products',v_count,
        'needs_sync_count',v_changed,
        'items',v_items
    );
end;
$$;

create or replace function public.backoffice_bulk_cost_sync_apply(
    p_product_ids uuid[] default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
    v_branch uuid;
    v_user uuid;
    v_updated bigint := 0;
begin
    select x.user_id,x.branch_id
    into v_user,v_branch
    from public._bo_ctx() x;

    if v_branch is null then
        raise exception 'BACKOFFICE_PERMISSION_DENIED';
    end if;

    with calc as (
        select
            p.id as product_id,
            round(coalesce(sum(coalesce(pr.quantity_used,0)*public.jokjung_effective_ingredient_cost(i.cost_per_unit,i.ingredient_type,i.usable_yield_pct)),0)::numeric,2) as recipe_cost,
            count(pr.id) as recipe_rows,
            count(*) filter (
                where pr.id is not null
                  and (
                    i.id is null
                    or coalesce(i.is_active,true)=false
                  )
            ) as broken_ingredient_rows,
            count(*) filter (
                where pr.id is not null
                  and i.id is not null
                  and public.jokjung_effective_ingredient_cost(i.cost_per_unit,i.ingredient_type,i.usable_yield_pct)<=0
            ) as zero_cost_ingredient_rows
        from public.products p
        left join public.product_recipes pr
          on pr.product_id=p.id
         and pr.branch_id=v_branch
        left join public.ingredients i
          on i.id=pr.ingredient_id
         and i.branch_id=v_branch
        where p.branch_id=v_branch
          and (
              p_product_ids is null
              or p.id = any(p_product_ids)
          )
        group by p.id
    ),
    updated as (
        update public.products p
        set cost=c.recipe_cost
        from calc c
        where p.id=c.product_id
          and p.branch_id=v_branch
          and c.recipe_rows>0
          and c.broken_ingredient_rows=0
          and c.zero_cost_ingredient_rows=0
          and round(coalesce(p.cost,0)::numeric,2) <> c.recipe_cost
        returning p.id
    )
    select count(*) into v_updated from updated;

    return jsonb_build_object(
        'ok',true,
        'updated_count',v_updated
    );
end;
$$;

revoke all on function public.backoffice_bulk_cost_sync_preview() from public;
revoke all on function public.backoffice_bulk_cost_sync_apply(uuid[]) from public;

grant execute on function public.backoffice_bulk_cost_sync_preview() to authenticated;
grant execute on function public.backoffice_bulk_cost_sync_apply(uuid[]) to authenticated;

-- ไม่มี TEST SELECT ท้ายไฟล์


-- =========================================================
-- Replace Cost Fix Center diagnostic with the same cost definition.
-- =========================================================

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


commit;

select 'JOKJUNG RAW USABLE YIELD V1 READY' as result;
