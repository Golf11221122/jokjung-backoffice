-- =========================================================
-- JOKJUNG PURCHASE 3-WAY MATCH V1.6
-- PO ↔ Goods Received ↔ Invoice / Receipt
-- =========================================================

begin;

create table if not exists public.purchase_document_items (
    id uuid primary key default gen_random_uuid(),
    purchase_document_id uuid not null
        references public.purchase_documents(id) on delete cascade,
    branch_id uuid not null
        references public.branches(id) on delete cascade,
    ingredient_id uuid not null
        references public.ingredients(id) on delete restrict,
    quantity numeric(14,3) not null check (quantity > 0),
    unit_cost numeric(14,4) not null default 0 check (unit_cost >= 0),
    line_total numeric(14,2) not null default 0 check (line_total >= 0),
    note text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique(purchase_document_id, ingredient_id)
);

create index if not exists idx_purchase_document_items_document
on public.purchase_document_items(purchase_document_id);

create index if not exists idx_purchase_document_items_ingredient
on public.purchase_document_items(branch_id, ingredient_id);

alter table public.purchase_document_items enable row level security;

drop policy if exists purchase_document_items_read on public.purchase_document_items;
create policy purchase_document_items_read
on public.purchase_document_items
for select to authenticated
using (
    exists (
        select 1
        from public.profiles p
        where p.id=auth.uid()
          and p.branch_id=purchase_document_items.branch_id
          and lower(trim(coalesce(p.role,''))) in ('admin','manager')
    )
);

-- ---------------------------------------------------------
-- Helper: 3-way status for one document
-- ---------------------------------------------------------
create or replace function public._bo_purchase_three_way_v16(
    p_document_id uuid,
    p_amount_tolerance numeric default 1.00,
    p_price_tolerance numeric default 0.0001
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
    v_branch uuid;
    v_po uuid;
    v_po_total numeric;
    v_doc_base numeric;
    v_amount_variance numeric;
    v_po_items integer:=0;
    v_invoice_items integer:=0;
    v_received_full integer:=0;
    v_qty_diff integer:=0;
    v_price_diff integer:=0;
    v_missing integer:=0;
    v_status text;
begin
    select x.branch_id into v_branch
    from public._bo_ctx() x;

    if v_branch is null then
        raise exception 'BACKOFFICE_PERMISSION_DENIED';
    end if;

    select
        d.purchase_order_id,
        po.total_amount,
        round(
            case
                when d.tax_mode in ('exclusive','inclusive')
                    then greatest(d.total_amount-d.tax_amount,0)
                else d.total_amount
            end
        ,2)
    into v_po,v_po_total,v_doc_base
    from public.purchase_documents d
    left join public.purchase_orders po on po.id=d.purchase_order_id
    where d.id=p_document_id
      and d.branch_id=v_branch;

    if not found then
        raise exception 'PURCHASE_DOCUMENT_NOT_FOUND';
    end if;

    if v_po is null then
        return jsonb_build_object(
            'status','no_po',
            'po_item_count',0,
            'invoice_item_count',(
                select count(*) from public.purchase_document_items
                where purchase_document_id=p_document_id
            ),
            'fully_received_item_count',0,
            'quantity_diff_count',0,
            'price_diff_count',0,
            'missing_item_count',0,
            'po_total_amount',null,
            'document_base_amount',v_doc_base,
            'amount_variance',null
        );
    end if;

    select count(*) into v_po_items
    from public.purchase_order_items
    where purchase_order_id=v_po;

    select count(*) into v_invoice_items
    from public.purchase_document_items
    where purchase_document_id=p_document_id;

    select count(*) into v_received_full
    from public.purchase_order_items
    where purchase_order_id=v_po
      and received_qty >= ordered_qty;

    -- PO item missing from document OR document has extra ingredient
    select count(*) into v_missing
    from (
        select coalesce(poi.ingredient_id,pdi.ingredient_id) ingredient_id
        from public.purchase_order_items poi
        full outer join public.purchase_document_items pdi
          on pdi.purchase_document_id=p_document_id
         and pdi.ingredient_id=poi.ingredient_id
        where poi.purchase_order_id=v_po
           or pdi.purchase_document_id=p_document_id
        group by coalesce(poi.ingredient_id,pdi.ingredient_id)
        having bool_or(poi.id is null) or bool_or(pdi.id is null)
    ) z;

    select count(*) into v_qty_diff
    from public.purchase_order_items poi
    join public.purchase_document_items pdi
      on pdi.purchase_document_id=p_document_id
     and pdi.ingredient_id=poi.ingredient_id
    where poi.purchase_order_id=v_po
      and abs(pdi.quantity-poi.ordered_qty) > 0.0005;

    select count(*) into v_price_diff
    from public.purchase_order_items poi
    join public.purchase_document_items pdi
      on pdi.purchase_document_id=p_document_id
     and pdi.ingredient_id=poi.ingredient_id
    where poi.purchase_order_id=v_po
      and abs(pdi.unit_cost-poi.unit_cost) > greatest(coalesce(p_price_tolerance,0.0001),0);

    v_amount_variance := round(v_doc_base-coalesce(v_po_total,0),2);

    v_status :=
        case
            when v_invoice_items=0 then 'items_missing'
            when v_missing>0 then 'item_mismatch'
            when v_received_full<v_po_items then 'not_fully_received'
            when v_qty_diff>0 then 'quantity_difference'
            when v_price_diff>0 then 'price_difference'
            when abs(v_amount_variance)>greatest(coalesce(p_amount_tolerance,1),0) then 'amount_difference'
            else 'matched'
        end;

    return jsonb_build_object(
        'status',v_status,
        'po_item_count',v_po_items,
        'invoice_item_count',v_invoice_items,
        'fully_received_item_count',v_received_full,
        'quantity_diff_count',v_qty_diff,
        'price_diff_count',v_price_diff,
        'missing_item_count',v_missing,
        'po_total_amount',v_po_total,
        'document_base_amount',v_doc_base,
        'amount_variance',v_amount_variance
    );
end
$$;

revoke all on function public._bo_purchase_three_way_v16(uuid,numeric,numeric) from public;

-- ---------------------------------------------------------
-- Save header + document lines atomically
-- ---------------------------------------------------------
create or replace function public.backoffice_save_purchase_document_v16(
    p_document_id uuid,
    p_supplier_id uuid,
    p_purchase_order_id uuid,
    p_document_type text,
    p_document_no text,
    p_document_date date,
    p_due_date date,
    p_currency_code text,
    p_exchange_rate numeric,
    p_subtotal numeric,
    p_discount_amount numeric,
    p_shipping_amount numeric,
    p_tax_mode text,
    p_tax_rate numeric,
    p_tax_amount numeric,
    p_withholding_tax_amount numeric,
    p_total_amount numeric,
    p_payment_method text,
    p_payment_status text,
    p_paid_amount numeric,
    p_paid_at timestamptz,
    p_note text,
    p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
    v_id uuid;
    v_branch uuid;
    v_row jsonb;
    v_ing uuid;
    v_qty numeric;
    v_cost numeric;
begin
    select x.branch_id into v_branch
    from public._bo_ctx() x;

    if v_branch is null then
        raise exception 'BACKOFFICE_PERMISSION_DENIED';
    end if;

    v_id := public.backoffice_save_purchase_document_v15(
        p_document_id,p_supplier_id,p_purchase_order_id,
        p_document_type,p_document_no,p_document_date,p_due_date,
        p_currency_code,p_exchange_rate,
        p_subtotal,p_discount_amount,p_shipping_amount,
        p_tax_mode,p_tax_rate,p_tax_amount,p_withholding_tax_amount,
        p_total_amount,p_payment_method,p_payment_status,
        p_paid_amount,p_paid_at,p_note
    );

    delete from public.purchase_document_items
    where purchase_document_id=v_id;

    for v_row in
        select * from jsonb_array_elements(coalesce(p_items,'[]'::jsonb))
    loop
        v_ing := nullif(v_row->>'ingredient_id','')::uuid;
        v_qty := coalesce((v_row->>'quantity')::numeric,0);
        v_cost := greatest(coalesce((v_row->>'unit_cost')::numeric,0),0);

        if v_ing is null or v_qty<=0 then
            raise exception 'INVALID_PURCHASE_DOCUMENT_ITEM';
        end if;

        if not exists(
            select 1
            from public.ingredients i
            where i.id=v_ing
              and i.branch_id=v_branch
              and i.is_active=true
        ) then
            raise exception 'INGREDIENT_NOT_FOUND';
        end if;

        insert into public.purchase_document_items(
            purchase_document_id,branch_id,ingredient_id,
            quantity,unit_cost,line_total,note
        )
        values(
            v_id,v_branch,v_ing,
            v_qty,v_cost,round(v_qty*v_cost,2),
            nullif(trim(coalesce(v_row->>'note','')),'')
        );
    end loop;

    return v_id;
end
$$;

-- ---------------------------------------------------------
-- Detail V1.6
-- ---------------------------------------------------------
create or replace function public.backoffice_get_purchase_document_v16(
    p_document_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
    v_branch uuid;
    v_base jsonb;
    v_items jsonb;
    v_match jsonb;
begin
    select x.branch_id into v_branch from public._bo_ctx() x;
    if v_branch is null then raise exception 'BACKOFFICE_PERMISSION_DENIED'; end if;

    v_base := public.backoffice_get_purchase_document_v15(p_document_id,1);

    select coalesce(jsonb_agg(
        jsonb_build_object(
            'id',pdi.id,
            'ingredient_id',pdi.ingredient_id,
            'ingredient_name',i.name,
            'unit',i.unit,
            'quantity',pdi.quantity,
            'unit_cost',pdi.unit_cost,
            'line_total',pdi.line_total,
            'note',pdi.note
        )
        order by i.name
    ),'[]'::jsonb)
    into v_items
    from public.purchase_document_items pdi
    join public.ingredients i on i.id=pdi.ingredient_id
    where pdi.purchase_document_id=p_document_id
      and pdi.branch_id=v_branch;

    v_match := public._bo_purchase_three_way_v16(p_document_id,1,0.0001);

    return v_base
        || jsonb_build_object(
            'document_items',v_items,
            'three_way',v_match
        );
end
$$;

-- ---------------------------------------------------------
-- List V1.6
-- ---------------------------------------------------------
create or replace function public.backoffice_list_purchase_documents_v16(
    p_from date default null,
    p_to date default null,
    p_supplier_id uuid default null,
    p_document_type text default null,
    p_payment_status text default null
)
returns table(
    id uuid,
    internal_no text,
    supplier_id uuid,
    supplier_name text,
    purchase_order_id uuid,
    po_no text,
    document_type text,
    document_no text,
    document_date date,
    due_date date,
    total_amount numeric,
    paid_amount numeric,
    balance_due numeric,
    payment_status text,
    attachment_count bigint,
    three_way_status text,
    three_way_amount_variance numeric,
    created_at timestamptz
)
language plpgsql
security definer
set search_path=public
as $$
declare
    v_branch uuid;
begin
    select x.branch_id into v_branch from public._bo_ctx() x;
    if v_branch is null then raise exception 'BACKOFFICE_PERMISSION_DENIED'; end if;

    return query
    select
        d.id,d.internal_no,d.supplier_id,s.name,
        d.purchase_order_id,po.po_no,
        d.document_type,d.document_no,d.document_date,d.due_date,
        d.total_amount,d.paid_amount,
        greatest(d.total_amount-d.paid_amount,0)::numeric,
        d.payment_status,
        count(a.id)::bigint,
        (m.j->>'status')::text,
        nullif(m.j->>'amount_variance','')::numeric,
        d.created_at
    from public.purchase_documents d
    left join public.suppliers s on s.id=d.supplier_id
    left join public.purchase_orders po on po.id=d.purchase_order_id
    left join public.purchase_document_attachments a on a.purchase_document_id=d.id
    cross join lateral (
        select public._bo_purchase_three_way_v16(d.id,1,0.0001) j
    ) m
    where d.branch_id=v_branch
      and (p_from is null or d.document_date>=p_from)
      and (p_to is null or d.document_date<=p_to)
      and (p_supplier_id is null or d.supplier_id=p_supplier_id)
      and (p_document_type is null or p_document_type='' or d.document_type=p_document_type)
      and (p_payment_status is null or p_payment_status='' or d.payment_status=p_payment_status)
    group by d.id,s.name,po.po_no,m.j
    order by d.document_date desc,d.created_at desc;
end
$$;

revoke all on function public.backoffice_save_purchase_document_v16(
    uuid,uuid,uuid,text,text,date,date,text,numeric,numeric,numeric,numeric,text,numeric,numeric,numeric,numeric,text,text,numeric,timestamptz,text,jsonb
) from public;
revoke all on function public.backoffice_get_purchase_document_v16(uuid) from public;
revoke all on function public.backoffice_list_purchase_documents_v16(date,date,uuid,text,text) from public;

grant execute on function public.backoffice_save_purchase_document_v16(
    uuid,uuid,uuid,text,text,date,date,text,numeric,numeric,numeric,numeric,text,numeric,numeric,numeric,numeric,text,text,numeric,timestamptz,text,jsonb
) to authenticated;
grant execute on function public.backoffice_get_purchase_document_v16(uuid) to authenticated;
grant execute on function public.backoffice_list_purchase_documents_v16(date,date,uuid,text,text) to authenticated;

commit;

select 'JOKJUNG PURCHASE 3-WAY MATCH V1.6 READY' as result;
