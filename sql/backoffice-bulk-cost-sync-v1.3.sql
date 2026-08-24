-- RAW USABLE YIELD AWARE: requires PATCH_RAW_USABLE_YIELD_V1.sql
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
