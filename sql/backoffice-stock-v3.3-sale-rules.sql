-- =====================================================================
-- JOKJUNG BACK OFFICE — STOCK V3.3 SALE RULES
-- Adds stock recipes for Modifier options and DINE-IN / TAKEAWAY.
-- BASE BOM remains handled by the existing create_pos_sale flow.
-- =====================================================================

begin;

create table if not exists public.modifier_option_ingredient_rules (
    id uuid primary key default gen_random_uuid(),
    branch_id uuid not null references public.branches(id) on delete cascade,
    modifier_option_id uuid not null references public.modifier_options(id) on delete cascade,
    ingredient_id uuid not null references public.ingredients(id) on delete restrict,
    quantity_used numeric(14,3) not null check(quantity_used > 0),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique(modifier_option_id, ingredient_id)
);

create table if not exists public.product_order_type_ingredient_rules (
    id uuid primary key default gen_random_uuid(),
    branch_id uuid not null references public.branches(id) on delete cascade,
    product_id uuid not null references public.products(id) on delete cascade,
    order_type text not null check(order_type in ('dine_in','takeaway')),
    ingredient_id uuid not null references public.ingredients(id) on delete restrict,
    quantity_used numeric(14,3) not null check(quantity_used > 0),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique(product_id, order_type, ingredient_id)
);

create table if not exists public.sale_rule_stock_applications (
    sale_id uuid primary key references public.sales(id) on delete cascade,
    branch_id uuid not null references public.branches(id) on delete cascade,
    order_type text,
    applied_at timestamptz not null default now(),
    restored_at timestamptz
);

create table if not exists public.sale_rule_stock_deductions (
    id uuid primary key default gen_random_uuid(),
    sale_id uuid not null references public.sales(id) on delete cascade,
    branch_id uuid not null references public.branches(id) on delete cascade,
    ingredient_id uuid not null references public.ingredients(id) on delete restrict,
    quantity numeric(14,3) not null check(quantity > 0),
    unit_cost numeric(14,4) not null default 0,
    source_type text not null check(source_type in ('modifier','order_type')),
    source_key text,
    created_at timestamptz not null default now()
);

create index if not exists idx_modifier_option_ingredient_rules_option
on public.modifier_option_ingredient_rules(modifier_option_id);
create index if not exists idx_product_order_type_rules_product
on public.product_order_type_ingredient_rules(product_id, order_type);
create index if not exists idx_sale_rule_stock_deductions_sale
on public.sale_rule_stock_deductions(sale_id);

-- Backoffice helpers ---------------------------------------------------
create or replace function public.backoffice_get_sale_stock_rules(p_product_id uuid)
returns jsonb
language plpgsql security definer set search_path=public
as $$
declare v_branch uuid; v_result jsonb;
begin
  select x.branch_id into v_branch from public._bo_ctx() x;
  if v_branch is null then raise exception 'BACKOFFICE_PERMISSION_DENIED'; end if;
  if not exists(select 1 from public.products p where p.id=p_product_id and p.branch_id=v_branch) then
    raise exception 'PRODUCT_NOT_FOUND';
  end if;

  select jsonb_build_object(
    'order_types', jsonb_build_object(
      'dine_in', coalesce((select jsonb_agg(jsonb_build_object(
          'ingredient_id',r.ingredient_id,'quantity_used',r.quantity_used,'ingredient_name',i.name,'unit',i.unit
        ) order by i.name)
        from public.product_order_type_ingredient_rules r
        join public.ingredients i on i.id=r.ingredient_id
        where r.branch_id=v_branch and r.product_id=p_product_id and r.order_type='dine_in'),'[]'::jsonb),
      'takeaway', coalesce((select jsonb_agg(jsonb_build_object(
          'ingredient_id',r.ingredient_id,'quantity_used',r.quantity_used,'ingredient_name',i.name,'unit',i.unit
        ) order by i.name)
        from public.product_order_type_ingredient_rules r
        join public.ingredients i on i.id=r.ingredient_id
        where r.branch_id=v_branch and r.product_id=p_product_id and r.order_type='takeaway'),'[]'::jsonb)
    ),
    'modifier_options', coalesce((select jsonb_agg(x.obj order by x.group_order,x.option_order)
      from (
        select g.display_order group_order,o.display_order option_order,
          jsonb_build_object(
            'group_id',g.id,'group_name',g.name,'option_id',o.id,'option_name',o.name,
            'price_adjustment',o.price_adjustment,
            'recipe',coalesce((select jsonb_agg(jsonb_build_object(
                'ingredient_id',mr.ingredient_id,'quantity_used',mr.quantity_used,'ingredient_name',i.name,'unit',i.unit
              ) order by i.name)
              from public.modifier_option_ingredient_rules mr
              join public.ingredients i on i.id=mr.ingredient_id
              where mr.branch_id=v_branch and mr.modifier_option_id=o.id),'[]'::jsonb)
          ) obj
        from public.product_modifier_groups pg
        join public.modifier_groups g on g.id=pg.modifier_group_id and g.branch_id=v_branch
        join public.modifier_options o on o.modifier_group_id=g.id and o.is_active is distinct from false
        where pg.product_id=p_product_id and g.is_active is distinct from false
      ) x),'[]'::jsonb)
  ) into v_result;
  return v_result;
end $$;

create or replace function public.backoffice_save_order_type_stock_rule(
  p_product_id uuid,p_order_type text,p_recipe jsonb
) returns void
language plpgsql security definer set search_path=public
as $$
declare v_branch uuid; v_row jsonb; v_ing uuid; v_qty numeric; v_seen uuid[] := '{}';
begin
  select x.branch_id into v_branch from public._bo_ctx() x;
  if v_branch is null then raise exception 'BACKOFFICE_PERMISSION_DENIED'; end if;
  if p_order_type not in ('dine_in','takeaway') then raise exception 'INVALID_ORDER_TYPE'; end if;
  if not exists(select 1 from public.products where id=p_product_id and branch_id=v_branch) then raise exception 'PRODUCT_NOT_FOUND'; end if;
  delete from public.product_order_type_ingredient_rules where branch_id=v_branch and product_id=p_product_id and order_type=p_order_type;
  for v_row in select * from jsonb_array_elements(coalesce(p_recipe,'[]'::jsonb)) loop
    v_ing := (v_row->>'ingredient_id')::uuid; v_qty := coalesce((v_row->>'quantity_used')::numeric,0);
    if v_qty<=0 then raise exception 'INVALID_RULE_QTY'; end if;
    if v_ing=any(v_seen) then raise exception 'DUPLICATE_INGREDIENT'; end if; v_seen:=array_append(v_seen,v_ing);
    if not exists(select 1 from public.ingredients where id=v_ing and branch_id=v_branch and is_active=true) then raise exception 'INGREDIENT_NOT_FOUND'; end if;
    insert into public.product_order_type_ingredient_rules(branch_id,product_id,order_type,ingredient_id,quantity_used)
    values(v_branch,p_product_id,p_order_type,v_ing,v_qty);
  end loop;
end $$;

create or replace function public.backoffice_save_modifier_stock_rule(
  p_option_id uuid,p_recipe jsonb
) returns void
language plpgsql security definer set search_path=public
as $$
declare v_branch uuid; v_row jsonb; v_ing uuid; v_qty numeric; v_seen uuid[] := '{}';
begin
  select x.branch_id into v_branch from public._bo_ctx() x;
  if v_branch is null then raise exception 'BACKOFFICE_PERMISSION_DENIED'; end if;
  if not exists(select 1 from public.modifier_options o join public.modifier_groups g on g.id=o.modifier_group_id where o.id=p_option_id and g.branch_id=v_branch) then raise exception 'MODIFIER_OPTION_NOT_FOUND'; end if;
  delete from public.modifier_option_ingredient_rules where branch_id=v_branch and modifier_option_id=p_option_id;
  for v_row in select * from jsonb_array_elements(coalesce(p_recipe,'[]'::jsonb)) loop
    v_ing := (v_row->>'ingredient_id')::uuid; v_qty := coalesce((v_row->>'quantity_used')::numeric,0);
    if v_qty<=0 then raise exception 'INVALID_RULE_QTY'; end if;
    if v_ing=any(v_seen) then raise exception 'DUPLICATE_INGREDIENT'; end if; v_seen:=array_append(v_seen,v_ing);
    if not exists(select 1 from public.ingredients where id=v_ing and branch_id=v_branch and is_active=true) then raise exception 'INGREDIENT_NOT_FOUND'; end if;
    insert into public.modifier_option_ingredient_rules(branch_id,modifier_option_id,ingredient_id,quantity_used)
    values(v_branch,p_option_id,v_ing,v_qty);
  end loop;
end $$;

-- POS helpers ----------------------------------------------------------
create or replace function public.jokjung_validate_sale_rule_stock(
  p_branch_id uuid,p_order_type text,p_items jsonb
) returns jsonb
language plpgsql security definer set search_path=public
as $$
declare v_user uuid:=auth.uid(); v_bad record;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists(select 1 from public.profiles p where p.id=v_user and p.branch_id=p_branch_id) then raise exception 'BRANCH_PERMISSION_DENIED'; end if;
  if p_order_type is not null and p_order_type not in ('dine_in','takeaway') then raise exception 'INVALID_ORDER_TYPE'; end if;
  create temp table if not exists _jj_req(ingredient_id uuid primary key, qty numeric not null) on commit drop;
  truncate _jj_req;
  insert into _jj_req(ingredient_id,qty)
  select r.ingredient_id,sum(r.quantity_used*coalesce((it->>'quantity')::numeric,0))
  from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) it
  join public.product_order_type_ingredient_rules r on r.branch_id=p_branch_id and r.product_id=(it->>'product_id')::uuid and r.order_type=p_order_type
  group by r.ingredient_id
  on conflict(ingredient_id) do update set qty=_jj_req.qty+excluded.qty;
  insert into _jj_req(ingredient_id,qty)
  select r.ingredient_id,sum(r.quantity_used*coalesce((it->>'quantity')::numeric,0))
  from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) it
  cross join lateral jsonb_array_elements(coalesce(it->'modifiers','[]'::jsonb)) m
  join public.modifier_option_ingredient_rules r on r.branch_id=p_branch_id and r.modifier_option_id=(m->>'option_id')::uuid
  group by r.ingredient_id
  on conflict(ingredient_id) do update set qty=_jj_req.qty+excluded.qty;
  select i.name,i.current_stock,q.qty into v_bad
  from _jj_req q join public.ingredients i on i.id=q.ingredient_id
  where i.branch_id=p_branch_id and coalesce(i.current_stock,0)<q.qty limit 1;
  if found then raise exception 'EXTRA_STOCK_INSUFFICIENT:% ต้องการ % คงเหลือ %',v_bad.name,v_bad.qty,v_bad.current_stock; end if;
  return jsonb_build_object('ok',true,'ingredient_count',(select count(*) from _jj_req));
end $$;

create or replace function public.jokjung_apply_sale_rule_stock(
  p_invoice_no text,p_branch_id uuid,p_order_type text,p_items jsonb
) returns jsonb
language plpgsql security definer set search_path=public
as $$
declare v_user uuid:=auth.uid(); v_sale uuid; v_req record; v_before numeric; v_cost numeric; v_after numeric;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists(select 1 from public.profiles p where p.id=v_user and p.branch_id=p_branch_id) then raise exception 'BRANCH_PERMISSION_DENIED'; end if;
  select s.id into v_sale from public.sales s where s.branch_id=p_branch_id and s.invoice_no=p_invoice_no order by s.created_at desc limit 1;
  if v_sale is null then raise exception 'SALE_NOT_FOUND'; end if;
  if exists(select 1 from public.sale_rule_stock_applications a where a.sale_id=v_sale and a.restored_at is null) then return jsonb_build_object('ok',true,'already_applied',true); end if;

  create temp table if not exists _jj_req2(ingredient_id uuid primary key, qty numeric not null, sources text) on commit drop; truncate _jj_req2;
  insert into _jj_req2(ingredient_id,qty,sources)
  select r.ingredient_id,sum(r.quantity_used*coalesce((it->>'quantity')::numeric,0)),'order_type'
  from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) it
  join public.product_order_type_ingredient_rules r on r.branch_id=p_branch_id and r.product_id=(it->>'product_id')::uuid and r.order_type=p_order_type
  group by r.ingredient_id
  on conflict(ingredient_id) do update set qty=_jj_req2.qty+excluded.qty,sources=_jj_req2.sources||'+order_type';
  insert into _jj_req2(ingredient_id,qty,sources)
  select r.ingredient_id,sum(r.quantity_used*coalesce((it->>'quantity')::numeric,0)),'modifier'
  from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) it
  cross join lateral jsonb_array_elements(coalesce(it->'modifiers','[]'::jsonb)) m
  join public.modifier_option_ingredient_rules r on r.branch_id=p_branch_id and r.modifier_option_id=(m->>'option_id')::uuid
  group by r.ingredient_id
  on conflict(ingredient_id) do update set qty=_jj_req2.qty+excluded.qty,sources=_jj_req2.sources||'+modifier';

  delete from public.sale_rule_stock_applications where sale_id=v_sale and restored_at is not null;
  delete from public.sale_rule_stock_deductions where sale_id=v_sale;

  for v_req in select * from _jj_req2 order by ingredient_id loop
    select current_stock,cost_per_unit into v_before,v_cost from public.ingredients where id=v_req.ingredient_id and branch_id=p_branch_id for update;
    if not found then raise exception 'INGREDIENT_NOT_FOUND'; end if;
    if coalesce(v_before,0)<v_req.qty then raise exception 'EXTRA_STOCK_INSUFFICIENT'; end if;
    v_after:=v_before-v_req.qty;
    update public.ingredients set current_stock=v_after,updated_at=now() where id=v_req.ingredient_id;
    insert into public.ingredient_stock_movements(branch_id,ingredient_id,movement_type,quantity,stock_before,stock_after,unit_cost,note,created_by)
    values(p_branch_id,v_req.ingredient_id,'sale',v_req.qty,v_before,v_after,coalesce(v_cost,0),'SALE RULE '||v_req.sources||' / '||v_sale::text,v_user);
    insert into public.sale_rule_stock_deductions(sale_id,branch_id,ingredient_id,quantity,unit_cost,source_type,source_key)
    values(v_sale,p_branch_id,v_req.ingredient_id,v_req.qty,coalesce(v_cost,0),case when position('modifier' in v_req.sources)>0 then 'modifier' else 'order_type' end,v_req.sources);
  end loop;
  insert into public.sale_rule_stock_applications(sale_id,branch_id,order_type) values(v_sale,p_branch_id,p_order_type);
  return jsonb_build_object('ok',true,'sale_id',v_sale,'ingredient_count',(select count(*) from _jj_req2));
end $$;

create or replace function public.jokjung_restore_sale_rule_stock(p_sale_id uuid)
returns jsonb
language plpgsql security definer set search_path=public
as $$
declare v_user uuid:=auth.uid(); v_branch uuid; v_row record; v_before numeric; v_after numeric;
begin
  select branch_id into v_branch from public.sales where id=p_sale_id;
  if v_branch is null then raise exception 'SALE_NOT_FOUND'; end if;
  if not exists(select 1 from public.profiles p where p.id=v_user and p.branch_id=v_branch) then raise exception 'BRANCH_PERMISSION_DENIED'; end if;
  if exists(select 1 from public.sale_rule_stock_applications where sale_id=p_sale_id and restored_at is not null) then return jsonb_build_object('ok',true,'already_restored',true); end if;
  for v_row in select ingredient_id,sum(quantity) qty,max(unit_cost) unit_cost from public.sale_rule_stock_deductions where sale_id=p_sale_id group by ingredient_id loop
    select current_stock into v_before from public.ingredients where id=v_row.ingredient_id and branch_id=v_branch for update;
    if not found then raise exception 'INGREDIENT_NOT_FOUND'; end if;
    v_after:=coalesce(v_before,0)+v_row.qty;
    update public.ingredients set current_stock=v_after,updated_at=now() where id=v_row.ingredient_id;
    insert into public.ingredient_stock_movements(branch_id,ingredient_id,movement_type,quantity,stock_before,stock_after,unit_cost,note,created_by)
    values(v_branch,v_row.ingredient_id,'void',v_row.qty,v_before,v_after,coalesce(v_row.unit_cost,0),'VOID SALE RULE / '||p_sale_id::text,v_user);
  end loop;
  update public.sale_rule_stock_applications set restored_at=now() where sale_id=p_sale_id;
  return jsonb_build_object('ok',true,'restored_count',(select count(*) from public.sale_rule_stock_deductions where sale_id=p_sale_id));
end $$;


-- Atomic checkout wrapper ------------------------------------------------
-- Calls the existing create_pos_sale and the extra stock layer in ONE DB
-- transaction. If any extra stock step fails, the sale is rolled back too.
create or replace function public.jokjung_create_pos_sale_v33(
  p_branch_id uuid,
  p_discount numeric,
  p_payment_method text,
  p_received_amount numeric,
  p_note text,
  p_items jsonb,
  p_order_type text
) returns jsonb
language plpgsql security definer set search_path=public
as $$
declare v_sale jsonb; v_invoice text;
begin
  perform public.jokjung_validate_sale_rule_stock(p_branch_id,p_order_type,p_items);

  -- to_jsonb works whether the existing function returns json/jsonb/composite.
  select to_jsonb(public.create_pos_sale(
      p_branch_id,
      p_discount,
      p_payment_method,
      p_received_amount,
      p_note,
      p_items
  )) into v_sale;

  -- Some Postgres function return shapes can be wrapped in a field named
  -- create_pos_sale. Normalize both shapes.
  if v_sale ? 'create_pos_sale' and jsonb_typeof(v_sale->'create_pos_sale')='object' then
    v_sale := v_sale->'create_pos_sale';
  end if;

  v_invoice := v_sale->>'invoice_no';
  if coalesce(v_invoice,'')='' then raise exception 'CREATE_POS_SALE_NO_INVOICE'; end if;

  perform public.jokjung_apply_sale_rule_stock(v_invoice,p_branch_id,p_order_type,p_items);
  return v_sale;
end $$;

grant execute on function public.backoffice_get_sale_stock_rules(uuid) to authenticated;
grant execute on function public.backoffice_save_order_type_stock_rule(uuid,text,jsonb) to authenticated;
grant execute on function public.backoffice_save_modifier_stock_rule(uuid,jsonb) to authenticated;
grant execute on function public.jokjung_validate_sale_rule_stock(uuid,text,jsonb) to authenticated;
grant execute on function public.jokjung_apply_sale_rule_stock(text,uuid,text,jsonb) to authenticated;
grant execute on function public.jokjung_restore_sale_rule_stock(uuid) to authenticated;
grant execute on function public.jokjung_create_pos_sale_v33(uuid,numeric,text,numeric,text,jsonb,text) to authenticated;

commit;
