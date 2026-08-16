
-- ============================================================
-- JOKJUNG BACK OFFICE : STOCK V2 FULL CYCLE
-- ใช้ต่อจาก Back Office V1 และฐานข้อมูล POS เดิม
--
-- วงจร:
-- Supplier -> Purchase Order -> Receive -> Stock In
-- -> Recipe/BOM -> POS Sale -> Stock Out
-- -> Waste/Adjust -> Stock Count -> Variance -> Report
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 0) UNIQUE INGREDIENT NAME (กันชื่อซ้ำในสาขา)
-- ------------------------------------------------------------
create unique index if not exists uq_ingredients_branch_name
on public.ingredients(branch_id, lower(trim(name)));

-- ------------------------------------------------------------
-- 1) SUPPLIERS
-- ------------------------------------------------------------
create table if not exists public.suppliers (
    id uuid primary key default gen_random_uuid(),
    branch_id uuid not null references public.branches(id) on delete cascade,
    name text not null,
    contact_name text,
    phone text,
    email text,
    tax_id text,
    address text,
    payment_terms text,
    note text,
    is_active boolean not null default true,
    created_by uuid references public.profiles(id),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create unique index if not exists uq_suppliers_branch_name
on public.suppliers(branch_id, lower(trim(name)));

alter table public.suppliers enable row level security;

drop policy if exists suppliers_backoffice_read on public.suppliers;
create policy suppliers_backoffice_read
on public.suppliers for select to authenticated
using (
    exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.branch_id = suppliers.branch_id
          and lower(trim(p.role)) in ('admin','manager')
    )
);

-- ------------------------------------------------------------
-- 2) PURCHASE ORDERS
-- ------------------------------------------------------------
create table if not exists public.purchase_orders (
    id uuid primary key default gen_random_uuid(),
    branch_id uuid not null references public.branches(id) on delete cascade,
    supplier_id uuid references public.suppliers(id) on delete restrict,
    po_no text not null,
    status text not null default 'draft'
        check (status in ('draft','ordered','partial','received','cancelled')),
    order_date date not null default current_date,
    expected_date date,
    subtotal numeric(14,2) not null default 0,
    discount_amount numeric(14,2) not null default 0,
    shipping_amount numeric(14,2) not null default 0,
    total_amount numeric(14,2) not null default 0,
    note text,
    created_by uuid references public.profiles(id),
    ordered_by uuid references public.profiles(id),
    ordered_at timestamptz,
    received_by uuid references public.profiles(id),
    received_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create unique index if not exists uq_purchase_orders_branch_no
on public.purchase_orders(branch_id, po_no);

create table if not exists public.purchase_order_items (
    id uuid primary key default gen_random_uuid(),
    purchase_order_id uuid not null references public.purchase_orders(id) on delete cascade,
    ingredient_id uuid not null references public.ingredients(id) on delete restrict,
    ordered_qty numeric(14,3) not null check (ordered_qty > 0),
    received_qty numeric(14,3) not null default 0 check (received_qty >= 0),
    unit_cost numeric(14,4) not null default 0 check (unit_cost >= 0),
    line_total numeric(14,2) not null default 0,
    note text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique(purchase_order_id, ingredient_id)
);

alter table public.purchase_orders enable row level security;
alter table public.purchase_order_items enable row level security;

drop policy if exists purchase_orders_backoffice_read on public.purchase_orders;
create policy purchase_orders_backoffice_read
on public.purchase_orders for select to authenticated
using (
    exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.branch_id = purchase_orders.branch_id
          and lower(trim(p.role)) in ('admin','manager')
    )
);

drop policy if exists purchase_order_items_backoffice_read on public.purchase_order_items;
create policy purchase_order_items_backoffice_read
on public.purchase_order_items for select to authenticated
using (
    exists (
        select 1
        from public.purchase_orders po
        join public.profiles p on p.id = auth.uid()
        where po.id = purchase_order_items.purchase_order_id
          and p.branch_id = po.branch_id
          and lower(trim(p.role)) in ('admin','manager')
    )
);

-- ------------------------------------------------------------
-- 3) STOCK COUNTS
-- ------------------------------------------------------------
create table if not exists public.stock_counts (
    id uuid primary key default gen_random_uuid(),
    branch_id uuid not null references public.branches(id) on delete cascade,
    count_no text not null,
    status text not null default 'draft'
        check(status in ('draft','counting','completed','cancelled')),
    counted_at timestamptz,
    note text,
    created_by uuid references public.profiles(id),
    completed_by uuid references public.profiles(id),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create unique index if not exists uq_stock_counts_branch_no
on public.stock_counts(branch_id, count_no);

create table if not exists public.stock_count_items (
    id uuid primary key default gen_random_uuid(),
    stock_count_id uuid not null references public.stock_counts(id) on delete cascade,
    ingredient_id uuid not null references public.ingredients(id) on delete restrict,
    system_qty numeric(14,3) not null default 0,
    counted_qty numeric(14,3),
    variance_qty numeric(14,3),
    unit_cost numeric(14,4) not null default 0,
    variance_value numeric(14,2),
    note text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique(stock_count_id, ingredient_id)
);

alter table public.stock_counts enable row level security;
alter table public.stock_count_items enable row level security;

drop policy if exists stock_counts_backoffice_read on public.stock_counts;
create policy stock_counts_backoffice_read
on public.stock_counts for select to authenticated
using (
    exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.branch_id = stock_counts.branch_id
          and lower(trim(p.role)) in ('admin','manager')
    )
);

drop policy if exists stock_count_items_backoffice_read on public.stock_count_items;
create policy stock_count_items_backoffice_read
on public.stock_count_items for select to authenticated
using (
    exists (
        select 1
        from public.stock_counts sc
        join public.profiles p on p.id = auth.uid()
        where sc.id = stock_count_items.stock_count_id
          and p.branch_id = sc.branch_id
          and lower(trim(p.role)) in ('admin','manager')
    )
);

-- ------------------------------------------------------------
-- 4) HELPERS
-- ------------------------------------------------------------
create or replace function public._bo_ctx()
returns table(user_id uuid, branch_id uuid, role text)
language sql
security definer
set search_path=public
as $$
    select p.id, p.branch_id, lower(trim(coalesce(p.role,'')))
    from public.profiles p
    where p.id = auth.uid()
      and lower(trim(coalesce(p.role,''))) in ('admin','manager')
    limit 1
$$;

revoke all on function public._bo_ctx() from public;

create or replace function public._bo_next_doc_no(p_prefix text, p_table text)
returns text
language plpgsql
security definer
set search_path=public
as $$
declare
    v_branch uuid;
    v_date text := to_char(current_date,'YYYYMMDD');
    v_seq integer := 1;
    v_candidate text;
    v_exists boolean;
begin
    select x.branch_id into v_branch from public._bo_ctx() x;
    if v_branch is null then raise exception 'BACKOFFICE_PERMISSION_DENIED'; end if;

    loop
        v_candidate := p_prefix || '-' || v_date || '-' || lpad(v_seq::text,4,'0');

        if p_table='purchase_orders' then
            select exists(
                select 1 from public.purchase_orders
                where branch_id=v_branch and po_no=v_candidate
            ) into v_exists;
        elsif p_table='stock_counts' then
            select exists(
                select 1 from public.stock_counts
                where branch_id=v_branch and count_no=v_candidate
            ) into v_exists;
        else
            raise exception 'INVALID_DOC_TABLE';
        end if;

        exit when not v_exists;
        v_seq := v_seq + 1;
    end loop;

    return v_candidate;
end
$$;

revoke all on function public._bo_next_doc_no(text,text) from public;

-- ------------------------------------------------------------
-- 5) INGREDIENT MASTER + MANUAL MOVEMENT
-- ------------------------------------------------------------
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
set search_path=public
as $$
declare
    v_branch uuid;
    v_id uuid;
    v_name text := trim(coalesce(p_name,''));
begin
    select x.branch_id into v_branch from public._bo_ctx() x;
    if v_branch is null then raise exception 'BACKOFFICE_PERMISSION_DENIED'; end if;
    if v_name='' then raise exception 'INGREDIENT_NAME_REQUIRED'; end if;
    if trim(coalesce(p_unit,''))='' then raise exception 'INGREDIENT_UNIT_REQUIRED'; end if;

    if exists (
        select 1 from public.ingredients i
        where i.branch_id=v_branch
          and lower(trim(i.name))=lower(v_name)
          and i.id is distinct from p_ingredient_id
    ) then
        raise exception 'INGREDIENT_NAME_EXISTS';
    end if;

    if p_ingredient_id is null then
        insert into public.ingredients(
            branch_id,name,unit,cost_per_unit,current_stock,min_stock,is_active
        ) values(
            v_branch,v_name,trim(p_unit),
            greatest(coalesce(p_cost_per_unit,0),0),
            0,greatest(coalesce(p_min_stock,0),0),
            coalesce(p_is_active,true)
        ) returning id into v_id;
    else
        update public.ingredients
        set name=v_name,
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
exception
    when unique_violation then
        raise exception 'INGREDIENT_NAME_EXISTS';
end
$$;

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
set search_path=public
as $$
declare
    v_user uuid;
    v_branch uuid;
    v_before numeric;
    v_after numeric;
    v_old_cost numeric;
    v_delta numeric;
    v_db_type text;
    v_id uuid;
begin
    select x.user_id,x.branch_id into v_user,v_branch from public._bo_ctx() x;
    if v_branch is null then raise exception 'BACKOFFICE_PERMISSION_DENIED'; end if;
    if coalesce(p_quantity,0)<=0 then raise exception 'QUANTITY_MUST_BE_POSITIVE'; end if;

    v_db_type := case p_movement_type
        when 'receive' then 'stock_in'
        when 'stock_in' then 'stock_in'
        when 'issue' then 'adjust_out'
        when 'adjust_in' then 'adjust_in'
        when 'adjust_out' then 'adjust_out'
        when 'waste' then 'waste'
        else null
    end;

    if v_db_type is null then raise exception 'INVALID_MOVEMENT_TYPE'; end if;

    select current_stock,cost_per_unit
    into v_before,v_old_cost
    from public.ingredients
    where id=p_ingredient_id and branch_id=v_branch
    for update;

    if not found then raise exception 'INGREDIENT_NOT_FOUND'; end if;

    v_delta := case when v_db_type in ('stock_in','adjust_in') then p_quantity else -p_quantity end;
    v_after := coalesce(v_before,0) + v_delta;
    if v_after < 0 then raise exception 'STOCK_CANNOT_BE_NEGATIVE'; end if;

    update public.ingredients
    set current_stock=v_after,
        cost_per_unit=case
            when v_db_type='stock_in' and coalesce(p_unit_cost,0)>0 then p_unit_cost
            else cost_per_unit
        end,
        updated_at=now()
    where id=p_ingredient_id;

    insert into public.ingredient_stock_movements(
        branch_id,ingredient_id,movement_type,quantity,
        stock_before,stock_after,unit_cost,note,created_by
    ) values(
        v_branch,p_ingredient_id,v_db_type,p_quantity,
        coalesce(v_before,0),v_after,
        case when coalesce(p_unit_cost,0)>0 then p_unit_cost else coalesce(v_old_cost,0) end,
        nullif(trim(coalesce(p_note,'')),''),
        v_user
    ) returning id into v_id;

    return v_id;
end
$$;

-- ------------------------------------------------------------
-- 6) SUPPLIER RPC
-- ------------------------------------------------------------
create or replace function public.backoffice_list_suppliers()
returns table(
    id uuid,name text,contact_name text,phone text,email text,tax_id text,
    address text,payment_terms text,note text,is_active boolean,
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
    select s.id,s.name,s.contact_name,s.phone,s.email,s.tax_id,
           s.address,s.payment_terms,s.note,s.is_active,s.created_at,s.updated_at
    from public.suppliers s
    where s.branch_id=v_branch
    order by s.is_active desc,s.name;
end
$$;

create or replace function public.backoffice_save_supplier(
    p_supplier_id uuid,p_name text,p_contact_name text,p_phone text,p_email text,
    p_tax_id text,p_address text,p_payment_terms text,p_note text,p_is_active boolean
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare v_user uuid;v_branch uuid;v_id uuid;v_name text:=trim(coalesce(p_name,''));
begin
    select x.user_id,x.branch_id into v_user,v_branch from public._bo_ctx() x;
    if v_branch is null then raise exception 'BACKOFFICE_PERMISSION_DENIED'; end if;
    if v_name='' then raise exception 'SUPPLIER_NAME_REQUIRED'; end if;

    if exists(
        select 1 from public.suppliers s
        where s.branch_id=v_branch
          and lower(trim(s.name))=lower(v_name)
          and s.id is distinct from p_supplier_id
    ) then raise exception 'SUPPLIER_NAME_EXISTS'; end if;

    if p_supplier_id is null then
        insert into public.suppliers(
            branch_id,name,contact_name,phone,email,tax_id,address,payment_terms,note,is_active,created_by
        ) values(
            v_branch,v_name,nullif(trim(coalesce(p_contact_name,'')),''),
            nullif(trim(coalesce(p_phone,'')),''),
            nullif(trim(coalesce(p_email,'')),''),
            nullif(trim(coalesce(p_tax_id,'')),''),
            nullif(trim(coalesce(p_address,'')),''),
            nullif(trim(coalesce(p_payment_terms,'')),''),
            nullif(trim(coalesce(p_note,'')),''),
            coalesce(p_is_active,true),v_user
        ) returning id into v_id;
    else
        update public.suppliers
        set name=v_name,contact_name=nullif(trim(coalesce(p_contact_name,'')),''),
            phone=nullif(trim(coalesce(p_phone,'')),''),
            email=nullif(trim(coalesce(p_email,'')),''),
            tax_id=nullif(trim(coalesce(p_tax_id,'')),''),
            address=nullif(trim(coalesce(p_address,'')),''),
            payment_terms=nullif(trim(coalesce(p_payment_terms,'')),''),
            note=nullif(trim(coalesce(p_note,'')),''),
            is_active=coalesce(p_is_active,true),updated_at=now()
        where id=p_supplier_id and branch_id=v_branch
        returning id into v_id;
        if v_id is null then raise exception 'SUPPLIER_NOT_FOUND'; end if;
    end if;
    return v_id;
exception when unique_violation then
    raise exception 'SUPPLIER_NAME_EXISTS';
end
$$;

-- ------------------------------------------------------------
-- 7) PURCHASE ORDER RPC
-- ------------------------------------------------------------
create or replace function public.backoffice_list_purchase_orders()
returns table(
    id uuid,po_no text,status text,order_date date,expected_date date,
    supplier_id uuid,supplier_name text,total_amount numeric,note text,
    created_at timestamptz,ordered_at timestamptz,received_at timestamptz
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
    select po.id,po.po_no,po.status,po.order_date,po.expected_date,
           po.supplier_id,s.name,po.total_amount,po.note,
           po.created_at,po.ordered_at,po.received_at
    from public.purchase_orders po
    left join public.suppliers s on s.id=po.supplier_id
    where po.branch_id=v_branch
    order by po.created_at desc;
end
$$;

create or replace function public.backoffice_get_purchase_order(p_purchase_order_id uuid)
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
        'id',po.id,'po_no',po.po_no,'status',po.status,'order_date',po.order_date,
        'expected_date',po.expected_date,'supplier_id',po.supplier_id,
        'supplier_name',s.name,'subtotal',po.subtotal,'discount_amount',po.discount_amount,
        'shipping_amount',po.shipping_amount,'total_amount',po.total_amount,'note',po.note,
        'items',coalesce((
            select jsonb_agg(jsonb_build_object(
                'id',poi.id,'ingredient_id',poi.ingredient_id,'ingredient_name',i.name,'unit',i.unit,
                'ordered_qty',poi.ordered_qty,'received_qty',poi.received_qty,
                'unit_cost',poi.unit_cost,'line_total',poi.line_total,'note',poi.note
            ) order by i.name)
            from public.purchase_order_items poi
            join public.ingredients i on i.id=poi.ingredient_id
            where poi.purchase_order_id=po.id
        ),'[]'::jsonb)
    )
    into v_result
    from public.purchase_orders po
    left join public.suppliers s on s.id=po.supplier_id
    where po.id=p_purchase_order_id and po.branch_id=v_branch;

    if v_result is null then raise exception 'PURCHASE_ORDER_NOT_FOUND'; end if;
    return v_result;
end
$$;

create or replace function public.backoffice_save_purchase_order(
    p_purchase_order_id uuid,
    p_supplier_id uuid,
    p_order_date date,
    p_expected_date date,
    p_discount_amount numeric,
    p_shipping_amount numeric,
    p_note text,
    p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
    v_user uuid;v_branch uuid;v_id uuid;v_po_no text;
    v_item jsonb;v_ing uuid;v_qty numeric;v_cost numeric;
    v_subtotal numeric:=0;v_line numeric;
begin
    select x.user_id,x.branch_id into v_user,v_branch from public._bo_ctx() x;
    if v_branch is null then raise exception 'BACKOFFICE_PERMISSION_DENIED'; end if;

    if p_supplier_id is not null and not exists(
        select 1 from public.suppliers s
        where s.id=p_supplier_id and s.branch_id=v_branch and s.is_active=true
    ) then raise exception 'SUPPLIER_NOT_FOUND'; end if;

    if jsonb_array_length(coalesce(p_items,'[]'::jsonb))=0 then
        raise exception 'PURCHASE_ORDER_ITEMS_REQUIRED';
    end if;

    if p_purchase_order_id is null then
        v_po_no := public._bo_next_doc_no('PO','purchase_orders');
        insert into public.purchase_orders(
            branch_id,supplier_id,po_no,status,order_date,expected_date,
            discount_amount,shipping_amount,note,created_by
        ) values(
            v_branch,p_supplier_id,v_po_no,'draft',coalesce(p_order_date,current_date),
            p_expected_date,greatest(coalesce(p_discount_amount,0),0),
            greatest(coalesce(p_shipping_amount,0),0),
            nullif(trim(coalesce(p_note,'')),''),v_user
        ) returning id into v_id;
    else
        select po.id into v_id
        from public.purchase_orders po
        where po.id=p_purchase_order_id and po.branch_id=v_branch and po.status='draft'
        for update;
        if v_id is null then raise exception 'PURCHASE_ORDER_NOT_EDITABLE'; end if;

        update public.purchase_orders
        set supplier_id=p_supplier_id,order_date=coalesce(p_order_date,current_date),
            expected_date=p_expected_date,
            discount_amount=greatest(coalesce(p_discount_amount,0),0),
            shipping_amount=greatest(coalesce(p_shipping_amount,0),0),
            note=nullif(trim(coalesce(p_note,'')),''),
            updated_at=now()
        where id=v_id;

        delete from public.purchase_order_items where purchase_order_id=v_id;
    end if;

    for v_item in select * from jsonb_array_elements(p_items)
    loop
        v_ing := (v_item->>'ingredient_id')::uuid;
        v_qty := coalesce((v_item->>'ordered_qty')::numeric,0);
        v_cost := greatest(coalesce((v_item->>'unit_cost')::numeric,0),0);

        if v_qty<=0 then raise exception 'INVALID_PURCHASE_QUANTITY'; end if;
        if not exists(
            select 1 from public.ingredients i
            where i.id=v_ing and i.branch_id=v_branch and i.is_active=true
        ) then raise exception 'INGREDIENT_NOT_FOUND'; end if;

        v_line := round(v_qty*v_cost,2);
        v_subtotal := v_subtotal + v_line;

        insert into public.purchase_order_items(
            purchase_order_id,ingredient_id,ordered_qty,unit_cost,line_total,note
        ) values(
            v_id,v_ing,v_qty,v_cost,v_line,nullif(trim(coalesce(v_item->>'note','')),'')
        );
    end loop;

    update public.purchase_orders
    set subtotal=round(v_subtotal,2),
        total_amount=greatest(round(
            v_subtotal
            - greatest(coalesce(discount_amount,0),0)
            + greatest(coalesce(shipping_amount,0),0)
        ,2),0),
        updated_at=now()
    where id=v_id;

    return v_id;
end
$$;

create or replace function public.backoffice_set_purchase_order_status(
    p_purchase_order_id uuid,p_status text
)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare v_user uuid;v_branch uuid;v_old text;
begin
    select x.user_id,x.branch_id into v_user,v_branch from public._bo_ctx() x;
    if v_branch is null then raise exception 'BACKOFFICE_PERMISSION_DENIED'; end if;

    select status into v_old from public.purchase_orders
    where id=p_purchase_order_id and branch_id=v_branch
    for update;
    if v_old is null then raise exception 'PURCHASE_ORDER_NOT_FOUND'; end if;

    if p_status='ordered' and v_old='draft' then
        update public.purchase_orders
        set status='ordered',ordered_by=v_user,ordered_at=now(),updated_at=now()
        where id=p_purchase_order_id;
    elsif p_status='cancelled' and v_old in ('draft','ordered') then
        update public.purchase_orders
        set status='cancelled',updated_at=now()
        where id=p_purchase_order_id;
    else
        raise exception 'INVALID_PURCHASE_ORDER_STATUS_CHANGE';
    end if;

    return true;
end
$$;

-- รับของ: รองรับรับบางส่วน + Weighted Average Cost
create or replace function public.backoffice_receive_purchase_order(
    p_purchase_order_id uuid,
    p_items jsonb,
    p_note text
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
    v_user uuid;v_branch uuid;v_status text;
    v_row jsonb;v_item_id uuid;v_receive numeric;v_cost numeric;
    v_ing uuid;v_ordered numeric;v_received numeric;
    v_before numeric;v_after numeric;v_old_cost numeric;v_new_cost numeric;
    v_all_received boolean;v_movement_id uuid;v_count integer:=0;
begin
    select x.user_id,x.branch_id into v_user,v_branch from public._bo_ctx() x;
    if v_branch is null then raise exception 'BACKOFFICE_PERMISSION_DENIED'; end if;

    select status into v_status
    from public.purchase_orders
    where id=p_purchase_order_id and branch_id=v_branch
    for update;

    if v_status not in ('ordered','partial') then
        raise exception 'PURCHASE_ORDER_NOT_RECEIVABLE';
    end if;

    for v_row in select * from jsonb_array_elements(coalesce(p_items,'[]'::jsonb))
    loop
        v_item_id := (v_row->>'item_id')::uuid;
        v_receive := coalesce((v_row->>'receive_qty')::numeric,0);
        v_cost := greatest(coalesce((v_row->>'unit_cost')::numeric,0),0);

        if v_receive<=0 then continue; end if;

        select ingredient_id,ordered_qty,received_qty,unit_cost
        into v_ing,v_ordered,v_received,v_cost
        from public.purchase_order_items
        where id=v_item_id and purchase_order_id=p_purchase_order_id
        for update;

        if v_ing is null then raise exception 'PURCHASE_ORDER_ITEM_NOT_FOUND'; end if;
        if v_received + v_receive > v_ordered then raise exception 'RECEIVE_OVER_ORDERED_QTY'; end if;

        -- ถ้า payload มี unit_cost ใช้ payload, ถ้าไม่มีก็ใช้ PO cost
        if coalesce((v_row->>'unit_cost')::numeric,0)>0 then
            v_cost := (v_row->>'unit_cost')::numeric;
        end if;

        select current_stock,cost_per_unit
        into v_before,v_old_cost
        from public.ingredients
        where id=v_ing and branch_id=v_branch
        for update;

        if not found then raise exception 'INGREDIENT_NOT_FOUND'; end if;

        v_after := coalesce(v_before,0)+v_receive;
        v_new_cost := case
            when v_after > 0 then
                round(
                    ((coalesce(v_before,0)*coalesce(v_old_cost,0)) + (v_receive*v_cost))
                    / v_after
                ,4)
            else v_cost
        end;

        update public.ingredients
        set current_stock=v_after,cost_per_unit=v_new_cost,updated_at=now()
        where id=v_ing;

        update public.purchase_order_items
        set received_qty=received_qty+v_receive,
            unit_cost=v_cost,
            line_total=round(ordered_qty*v_cost,2),
            updated_at=now()
        where id=v_item_id;

        insert into public.ingredient_stock_movements(
            branch_id,ingredient_id,movement_type,quantity,
            stock_before,stock_after,unit_cost,note,created_by
        ) values(
            v_branch,v_ing,'stock_in',v_receive,
            coalesce(v_before,0),v_after,v_cost,
            concat('รับของ PO ',(select po_no from public.purchase_orders where id=p_purchase_order_id),
                   case when nullif(trim(coalesce(p_note,'')),'') is not null then ' • '||trim(p_note) else '' end),
            v_user
        ) returning id into v_movement_id;

        v_count := v_count + 1;
    end loop;

    select not exists(
        select 1 from public.purchase_order_items
        where purchase_order_id=p_purchase_order_id
          and received_qty < ordered_qty
    ) into v_all_received;

    update public.purchase_orders
    set status=case when v_all_received then 'received' else 'partial' end,
        received_by=case when v_all_received then v_user else received_by end,
        received_at=case when v_all_received then now() else received_at end,
        updated_at=now()
    where id=p_purchase_order_id;

    return jsonb_build_object(
        'received_lines',v_count,
        'status',case when v_all_received then 'received' else 'partial' end
    );
end
$$;

-- ------------------------------------------------------------
-- 8) STOCK COUNT RPC
-- ------------------------------------------------------------
create or replace function public.backoffice_list_stock_counts()
returns table(
    id uuid,count_no text,status text,counted_at timestamptz,note text,
    created_at timestamptz,created_by_name text,completed_by_name text,
    variance_value numeric
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
    select sc.id,sc.count_no,sc.status,sc.counted_at,sc.note,sc.created_at,
           p1.full_name,p2.full_name,
           coalesce(sum(abs(sci.variance_value)),0)::numeric
    from public.stock_counts sc
    left join public.profiles p1 on p1.id=sc.created_by
    left join public.profiles p2 on p2.id=sc.completed_by
    left join public.stock_count_items sci on sci.stock_count_id=sc.id
    where sc.branch_id=v_branch
    group by sc.id,p1.full_name,p2.full_name
    order by sc.created_at desc;
end
$$;

create or replace function public.backoffice_create_stock_count(p_note text)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare v_user uuid;v_branch uuid;v_id uuid;v_no text;
begin
    select x.user_id,x.branch_id into v_user,v_branch from public._bo_ctx() x;
    if v_branch is null then raise exception 'BACKOFFICE_PERMISSION_DENIED'; end if;

    v_no := public._bo_next_doc_no('SC','stock_counts');

    insert into public.stock_counts(
        branch_id,count_no,status,note,created_by
    ) values(
        v_branch,v_no,'counting',nullif(trim(coalesce(p_note,'')),''),v_user
    ) returning id into v_id;

    insert into public.stock_count_items(
        stock_count_id,ingredient_id,system_qty,unit_cost
    )
    select v_id,i.id,i.current_stock,i.cost_per_unit
    from public.ingredients i
    where i.branch_id=v_branch and i.is_active=true;

    return v_id;
end
$$;

create or replace function public.backoffice_get_stock_count(p_stock_count_id uuid)
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
        'id',sc.id,'count_no',sc.count_no,'status',sc.status,'note',sc.note,
        'created_at',sc.created_at,'counted_at',sc.counted_at,
        'items',coalesce((
            select jsonb_agg(jsonb_build_object(
                'id',sci.id,'ingredient_id',sci.ingredient_id,'ingredient_name',i.name,'unit',i.unit,
                'system_qty',sci.system_qty,'counted_qty',sci.counted_qty,
                'variance_qty',sci.variance_qty,'unit_cost',sci.unit_cost,
                'variance_value',sci.variance_value,'note',sci.note
            ) order by i.name)
            from public.stock_count_items sci
            join public.ingredients i on i.id=sci.ingredient_id
            where sci.stock_count_id=sc.id
        ),'[]'::jsonb)
    ) into v_result
    from public.stock_counts sc
    where sc.id=p_stock_count_id and sc.branch_id=v_branch;

    if v_result is null then raise exception 'STOCK_COUNT_NOT_FOUND'; end if;
    return v_result;
end
$$;

create or replace function public.backoffice_save_stock_count_items(
    p_stock_count_id uuid,p_items jsonb
)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare v_branch uuid;v_row jsonb;v_item_id uuid;v_counted numeric;v_system numeric;v_cost numeric;
begin
    select x.branch_id into v_branch from public._bo_ctx() x;
    if v_branch is null then raise exception 'BACKOFFICE_PERMISSION_DENIED'; end if;

    if not exists(
        select 1 from public.stock_counts
        where id=p_stock_count_id and branch_id=v_branch and status='counting'
    ) then raise exception 'STOCK_COUNT_NOT_EDITABLE'; end if;

    for v_row in select * from jsonb_array_elements(coalesce(p_items,'[]'::jsonb))
    loop
        v_item_id := (v_row->>'item_id')::uuid;
        v_counted := (v_row->>'counted_qty')::numeric;

        if v_counted is null or v_counted<0 then raise exception 'INVALID_COUNTED_QTY'; end if;

        select system_qty,unit_cost into v_system,v_cost
        from public.stock_count_items
        where id=v_item_id and stock_count_id=p_stock_count_id;

        if not found then raise exception 'STOCK_COUNT_ITEM_NOT_FOUND'; end if;

        update public.stock_count_items
        set counted_qty=v_counted,
            variance_qty=round(v_counted-v_system,3),
            variance_value=round((v_counted-v_system)*v_cost,2),
            note=nullif(trim(coalesce(v_row->>'note','')),''),
            updated_at=now()
        where id=v_item_id;
    end loop;

    return true;
end
$$;

create or replace function public.backoffice_complete_stock_count(p_stock_count_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
    v_user uuid;v_branch uuid;v_row record;
    v_before numeric;v_after numeric;v_type text;v_moves integer:=0;v_total numeric:=0;
begin
    select x.user_id,x.branch_id into v_user,v_branch from public._bo_ctx() x;
    if v_branch is null then raise exception 'BACKOFFICE_PERMISSION_DENIED'; end if;

    if not exists(
        select 1 from public.stock_counts
        where id=p_stock_count_id and branch_id=v_branch and status='counting'
        for update
    ) then raise exception 'STOCK_COUNT_NOT_COMPLETABLE'; end if;

    if exists(
        select 1 from public.stock_count_items
        where stock_count_id=p_stock_count_id and counted_qty is null
    ) then raise exception 'STOCK_COUNT_INCOMPLETE'; end if;

    for v_row in
        select sci.*,i.current_stock
        from public.stock_count_items sci
        join public.ingredients i on i.id=sci.ingredient_id
        where sci.stock_count_id=p_stock_count_id
        order by i.name
    loop
        v_before := v_row.current_stock;
        v_after := v_row.counted_qty;

        if v_after <> v_before then
            v_type := case when v_after>v_before then 'adjust_in' else 'adjust_out' end;

            update public.ingredients
            set current_stock=v_after,updated_at=now()
            where id=v_row.ingredient_id;

            insert into public.ingredient_stock_movements(
                branch_id,ingredient_id,movement_type,quantity,
                stock_before,stock_after,unit_cost,note,created_by
            ) values(
                v_branch,v_row.ingredient_id,v_type,abs(v_after-v_before),
                v_before,v_after,v_row.unit_cost,
                concat('Stock Count ',(select count_no from public.stock_counts where id=p_stock_count_id)),
                v_user
            );

            v_moves := v_moves+1;
        end if;

        v_total := v_total + abs(coalesce(v_row.variance_value,0));
    end loop;

    update public.stock_counts
    set status='completed',counted_at=now(),completed_by=v_user,updated_at=now()
    where id=p_stock_count_id;

    return jsonb_build_object('movement_count',v_moves,'variance_value',round(v_total,2));
end
$$;

-- ------------------------------------------------------------
-- 9) REPORT + DASHBOARD
-- ------------------------------------------------------------
create or replace function public.backoffice_stock_report()
returns table(
    ingredient_id uuid,name text,unit text,current_stock numeric,min_stock numeric,
    cost_per_unit numeric,stock_value numeric,status text,last_movement_at timestamptz
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
    select i.id,i.name,i.unit,i.current_stock,i.min_stock,i.cost_per_unit,
           round(i.current_stock*i.cost_per_unit,2)::numeric,
           case
             when not i.is_active then 'inactive'
             when i.current_stock<=0 then 'out'
             when i.current_stock<=i.min_stock then 'low'
             else 'ok'
           end,
           (select max(m.created_at) from public.ingredient_stock_movements m where m.ingredient_id=i.id)
    from public.ingredients i
    where i.branch_id=v_branch
    order by
      case when i.current_stock<=0 then 0 when i.current_stock<=i.min_stock then 1 else 2 end,
      i.name;
end
$$;

create or replace function public.backoffice_stock_dashboard_v2()
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
        'ingredient_count',count(*) filter(where i.is_active),
        'low_stock_count',count(*) filter(where i.is_active and i.current_stock>0 and i.current_stock<=i.min_stock),
        'out_stock_count',count(*) filter(where i.is_active and i.current_stock<=0),
        'stock_value',coalesce(sum(case when i.is_active then i.current_stock*i.cost_per_unit else 0 end),0),
        'open_po_count',(select count(*) from public.purchase_orders po where po.branch_id=v_branch and po.status in ('draft','ordered','partial')),
        'pending_count_count',(select count(*) from public.stock_counts sc where sc.branch_id=v_branch and sc.status='counting'),
        'month_purchase_value',(select coalesce(sum(po.total_amount),0) from public.purchase_orders po where po.branch_id=v_branch and po.status in ('ordered','partial','received') and po.order_date>=date_trunc('month',current_date)::date),
        'month_waste_value',(
            select coalesce(sum(m.quantity*m.unit_cost),0)
            from public.ingredient_stock_movements m
            where m.branch_id=v_branch and m.movement_type='waste'
              and m.created_at>=date_trunc('month',now())
        )
    ) into v_result
    from public.ingredients i
    where i.branch_id=v_branch;

    return v_result;
end
$$;

-- ------------------------------------------------------------
-- 10) GRANTS
-- ------------------------------------------------------------
grant execute on function public.backoffice_save_ingredient(uuid,text,text,numeric,numeric,boolean) to authenticated;
grant execute on function public.backoffice_adjust_stock(uuid,text,numeric,numeric,text) to authenticated;
grant execute on function public.backoffice_list_suppliers() to authenticated;
grant execute on function public.backoffice_save_supplier(uuid,text,text,text,text,text,text,text,text,boolean) to authenticated;
grant execute on function public.backoffice_list_purchase_orders() to authenticated;
grant execute on function public.backoffice_get_purchase_order(uuid) to authenticated;
grant execute on function public.backoffice_save_purchase_order(uuid,uuid,date,date,numeric,numeric,text,jsonb) to authenticated;
grant execute on function public.backoffice_set_purchase_order_status(uuid,text) to authenticated;
grant execute on function public.backoffice_receive_purchase_order(uuid,jsonb,text) to authenticated;
grant execute on function public.backoffice_list_stock_counts() to authenticated;
grant execute on function public.backoffice_create_stock_count(text) to authenticated;
grant execute on function public.backoffice_get_stock_count(uuid) to authenticated;
grant execute on function public.backoffice_save_stock_count_items(uuid,jsonb) to authenticated;
grant execute on function public.backoffice_complete_stock_count(uuid) to authenticated;
grant execute on function public.backoffice_stock_report() to authenticated;
grant execute on function public.backoffice_stock_dashboard_v2() to authenticated;

commit;

select 'JOKJUNG STOCK V2 FULL CYCLE READY' as result;
