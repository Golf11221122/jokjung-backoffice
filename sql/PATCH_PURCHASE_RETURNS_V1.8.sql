-- =========================================================
-- JOKJUNG PURCHASE RETURNS / SUPPLIER CREDIT V1.8
-- คืนสินค้า Supplier + ลด Stock + Supplier Credit + ลด AP
-- =========================================================

begin;

create table if not exists public.purchase_returns (
    id uuid primary key default gen_random_uuid(),
    branch_id uuid not null references public.branches(id) on delete cascade,
    return_no text not null,
    supplier_id uuid not null references public.suppliers(id) on delete restrict,
    purchase_order_id uuid not null references public.purchase_orders(id) on delete restrict,
    purchase_document_id uuid references public.purchase_documents(id) on delete set null,
    return_date date not null,
    status text not null default 'draft'
        check (status in ('draft','posted','cancelled')),
    reason text not null,
    supplier_credit_no text,
    credit_amount numeric(14,2) not null default 0 check (credit_amount >= 0),
    note text,
    created_by uuid references public.profiles(id) on delete set null,
    posted_by uuid references public.profiles(id) on delete set null,
    created_at timestamptz not null default now(),
    posted_at timestamptz,
    updated_at timestamptz not null default now(),
    unique(branch_id,return_no)
);

create table if not exists public.purchase_return_items (
    id uuid primary key default gen_random_uuid(),
    purchase_return_id uuid not null references public.purchase_returns(id) on delete cascade,
    purchase_order_item_id uuid not null references public.purchase_order_items(id) on delete restrict,
    ingredient_id uuid not null references public.ingredients(id) on delete restrict,
    quantity numeric(14,3) not null check (quantity > 0),
    unit_cost numeric(14,4) not null default 0 check (unit_cost >= 0),
    line_total numeric(14,2) not null default 0 check (line_total >= 0),
    created_at timestamptz not null default now(),
    unique(purchase_return_id,purchase_order_item_id)
);

-- เครดิต Supplier ที่นำไปลดเจ้าหนี้
create table if not exists public.accounts_payable_credits (
    id uuid primary key default gen_random_uuid(),
    branch_id uuid not null references public.branches(id) on delete cascade,
    purchase_return_id uuid not null references public.purchase_returns(id) on delete restrict,
    purchase_document_id uuid not null references public.purchase_documents(id) on delete restrict,
    credit_date date not null,
    amount numeric(14,2) not null check (amount > 0),
    credit_note_no text,
    note text,
    created_by uuid references public.profiles(id) on delete set null,
    created_at timestamptz not null default now(),
    reversed_at timestamptz,
    reversed_by uuid references public.profiles(id) on delete set null,
    reversal_reason text,
    unique(purchase_return_id,purchase_document_id)
);

create index if not exists idx_purchase_returns_branch_date
on public.purchase_returns(branch_id,return_date desc);

create index if not exists idx_purchase_return_items_return
on public.purchase_return_items(purchase_return_id);

create index if not exists idx_ap_credits_document
on public.accounts_payable_credits(purchase_document_id,credit_date);

alter table public.purchase_returns enable row level security;
alter table public.purchase_return_items enable row level security;
alter table public.accounts_payable_credits enable row level security;

drop policy if exists purchase_returns_read on public.purchase_returns;
create policy purchase_returns_read on public.purchase_returns
for select to authenticated using (
    exists(select 1 from public.profiles p
      where p.id=auth.uid()
        and p.branch_id=purchase_returns.branch_id
        and lower(trim(coalesce(p.role,''))) in ('admin','manager'))
);

drop policy if exists purchase_return_items_read on public.purchase_return_items;
create policy purchase_return_items_read on public.purchase_return_items
for select to authenticated using (
    exists(
      select 1
      from public.purchase_returns r
      join public.profiles p on p.id=auth.uid()
      where r.id=purchase_return_items.purchase_return_id
        and p.branch_id=r.branch_id
        and lower(trim(coalesce(p.role,''))) in ('admin','manager')
    )
);

drop policy if exists ap_credits_read on public.accounts_payable_credits;
create policy ap_credits_read on public.accounts_payable_credits
for select to authenticated using (
    exists(select 1 from public.profiles p
      where p.id=auth.uid()
        and p.branch_id=accounts_payable_credits.branch_id
        and lower(trim(coalesce(p.role,''))) in ('admin','manager'))
);

-- ---------------------------------------------------------
-- Next return no
-- ---------------------------------------------------------
create or replace function public._bo_next_purchase_return_no()
returns text
language plpgsql
security definer
set search_path=public
as $$
declare
    v_branch uuid;
    v_prefix text := 'PR-'||to_char(current_date,'YYYYMMDD')||'-';
    v_seq integer := 1;
    v_no text;
begin
    select x.branch_id into v_branch from public._bo_ctx() x;
    if v_branch is null then raise exception 'BACKOFFICE_PERMISSION_DENIED'; end if;
    loop
        v_no:=v_prefix||lpad(v_seq::text,4,'0');
        exit when not exists(
            select 1 from public.purchase_returns
            where branch_id=v_branch and return_no=v_no
        );
        v_seq:=v_seq+1;
    end loop;
    return v_no;
end
$$;

revoke all on function public._bo_next_purchase_return_no() from public;

-- ---------------------------------------------------------
-- Returnable PO lines
-- ---------------------------------------------------------
create or replace function public.backoffice_purchase_returnable_items_v18(
    p_purchase_order_id uuid
)
returns table(
    po_item_id uuid,
    ingredient_id uuid,
    ingredient_name text,
    unit text,
    received_qty numeric,
    already_returned_qty numeric,
    returnable_qty numeric,
    unit_cost numeric
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

    if not exists(
        select 1 from public.purchase_orders
        where id=p_purchase_order_id and branch_id=v_branch
    ) then raise exception 'PURCHASE_ORDER_NOT_FOUND'; end if;

    return query
    select
        poi.id,
        poi.ingredient_id,
        i.name,
        i.unit,
        poi.received_qty,
        coalesce((
            select sum(pri.quantity)
            from public.purchase_return_items pri
            join public.purchase_returns pr on pr.id=pri.purchase_return_id
            where pri.purchase_order_item_id=poi.id
              and pr.status='posted'
        ),0)::numeric,
        greatest(
            poi.received_qty-coalesce((
                select sum(pri.quantity)
                from public.purchase_return_items pri
                join public.purchase_returns pr on pr.id=pri.purchase_return_id
                where pri.purchase_order_item_id=poi.id
                  and pr.status='posted'
            ),0),0
        )::numeric,
        poi.unit_cost
    from public.purchase_order_items poi
    join public.ingredients i on i.id=poi.ingredient_id
    where poi.purchase_order_id=p_purchase_order_id
    order by i.name;
end
$$;

-- ---------------------------------------------------------
-- Create + POST purchase return atomically
-- Stock out uses adjust_out to remain compatible with existing movement enum.
-- ---------------------------------------------------------
create or replace function public.backoffice_post_purchase_return_v18(
    p_purchase_order_id uuid,
    p_purchase_document_id uuid,
    p_return_date date,
    p_reason text,
    p_supplier_credit_no text,
    p_note text,
    p_items jsonb
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
    v_supplier uuid;
    v_return_id uuid;
    v_return_no text;
    v_row jsonb;
    v_po_item uuid;
    v_ing uuid;
    v_qty numeric;
    v_cost numeric;
    v_received numeric;
    v_returned numeric;
    v_stock numeric;
    v_total numeric:=0;
    v_line_total numeric;
    v_credit_id uuid;
begin
    select x.user_id,x.branch_id,x.role
    into v_user,v_branch,v_role
    from public._bo_ctx() x;

    if v_branch is null then raise exception 'BACKOFFICE_PERMISSION_DENIED'; end if;
    if lower(trim(coalesce(v_role,''))) not in ('admin','manager') then
        raise exception 'BACKOFFICE_PERMISSION_DENIED';
    end if;
    if p_return_date is null then raise exception 'RETURN_DATE_REQUIRED'; end if;
    if trim(coalesce(p_reason,''))='' then raise exception 'RETURN_REASON_REQUIRED'; end if;

    select supplier_id into v_supplier
    from public.purchase_orders
    where id=p_purchase_order_id
      and branch_id=v_branch
      and status in ('partial','received')
    for update;

    if v_supplier is null then raise exception 'PURCHASE_ORDER_NOT_RETURNABLE'; end if;

    if p_purchase_document_id is not null then
        if not exists(
            select 1
            from public.purchase_documents d
            where d.id=p_purchase_document_id
              and d.branch_id=v_branch
              and d.supplier_id=v_supplier
              and d.purchase_order_id=p_purchase_order_id
        ) then raise exception 'PURCHASE_DOCUMENT_MISMATCH'; end if;
    end if;

    if jsonb_array_length(coalesce(p_items,'[]'::jsonb))=0 then
        raise exception 'RETURN_ITEMS_REQUIRED';
    end if;

    v_return_no:=public._bo_next_purchase_return_no();

    insert into public.purchase_returns(
        branch_id,return_no,supplier_id,purchase_order_id,purchase_document_id,
        return_date,status,reason,supplier_credit_no,note,
        created_by,posted_by,posted_at
    ) values(
        v_branch,v_return_no,v_supplier,p_purchase_order_id,p_purchase_document_id,
        p_return_date,'posted',trim(p_reason),
        nullif(trim(coalesce(p_supplier_credit_no,'')),''),
        nullif(trim(coalesce(p_note,'')),''),
        v_user,v_user,now()
    )
    returning id into v_return_id;

    for v_row in
        select * from jsonb_array_elements(p_items)
    loop
        v_po_item:=nullif(v_row->>'po_item_id','')::uuid;
        v_qty:=coalesce((v_row->>'quantity')::numeric,0);

        if v_po_item is null or v_qty<=0 then
            raise exception 'INVALID_RETURN_ITEM';
        end if;

        select poi.ingredient_id,poi.received_qty,poi.unit_cost
        into v_ing,v_received,v_cost
        from public.purchase_order_items poi
        where poi.id=v_po_item
          and poi.purchase_order_id=p_purchase_order_id
        for update;

        if v_ing is null then raise exception 'PURCHASE_ORDER_ITEM_NOT_FOUND'; end if;

        select coalesce(sum(pri.quantity),0)
        into v_returned
        from public.purchase_return_items pri
        join public.purchase_returns pr on pr.id=pri.purchase_return_id
        where pri.purchase_order_item_id=v_po_item
          and pr.status='posted';

        if v_qty > v_received-v_returned+0.0005 then
            raise exception 'RETURN_EXCEEDS_RECEIVED_QTY';
        end if;

        select current_stock into v_stock
        from public.ingredients
        where id=v_ing and branch_id=v_branch
        for update;

        if v_stock is null then raise exception 'INGREDIENT_NOT_FOUND'; end if;
        if v_qty > v_stock+0.0005 then
            raise exception 'INSUFFICIENT_STOCK_FOR_RETURN';
        end if;

        v_line_total:=round(v_qty*v_cost,2);
        v_total:=v_total+v_line_total;

        insert into public.purchase_return_items(
            purchase_return_id,purchase_order_item_id,ingredient_id,
            quantity,unit_cost,line_total
        ) values(
            v_return_id,v_po_item,v_ing,v_qty,v_cost,v_line_total
        );

        update public.ingredients
        set current_stock=current_stock-v_qty,
            updated_at=now()
        where id=v_ing;

        insert into public.ingredient_stock_movements(
            branch_id,ingredient_id,movement_type,quantity,
            stock_before,stock_after,unit_cost,note,created_by
        ) values(
            v_branch,v_ing,'adjust_out',v_qty,
            v_stock,v_stock-v_qty,v_cost,
            concat('Purchase Return ',v_return_no,' • PO ',
                (select po_no from public.purchase_orders where id=p_purchase_order_id),
                ' • ',trim(p_reason)),
            v_user
        );
    end loop;

    update public.purchase_returns
    set credit_amount=round(v_total,2),updated_at=now()
    where id=v_return_id;

    -- ถ้าเลือก Invoice/AP document ให้เครดิตลดเจ้าหนี้ทันที
    if p_purchase_document_id is not null and v_total>0 then
        insert into public.accounts_payable_credits(
            branch_id,purchase_return_id,purchase_document_id,
            credit_date,amount,credit_note_no,note,created_by
        ) values(
            v_branch,v_return_id,p_purchase_document_id,
            p_return_date,round(v_total,2),
            nullif(trim(coalesce(p_supplier_credit_no,'')),''),
            concat('Supplier credit from ',v_return_no),v_user
        )
        returning id into v_credit_id;

        perform public._bo_ap_sync_document_payment(p_purchase_document_id);
    end if;

    return jsonb_build_object(
        'return_id',v_return_id,
        'return_no',v_return_no,
        'credit_amount',round(v_total,2),
        'ap_credit_applied',p_purchase_document_id is not null
    );
end
$$;

-- ---------------------------------------------------------
-- V1.8 AP sync: baseline + cash payments + supplier credits
-- ---------------------------------------------------------
create or replace function public._bo_ap_sync_document_payment(
    p_document_id uuid
)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
    v_total numeric;
    v_baseline numeric;
    v_payments numeric;
    v_credits numeric;
    v_settled numeric;
    v_last_method text;
    v_last_paid_at timestamptz;
begin
    select total_amount,ap_baseline_paid_amount
    into v_total,v_baseline
    from public.purchase_documents
    where id=p_document_id
    for update;

    if not found then raise exception 'PURCHASE_DOCUMENT_NOT_FOUND'; end if;

    select
        coalesce(sum(amount),0),
        (array_agg(payment_method order by payment_date desc,created_at desc))[1],
        max(created_at)
    into v_payments,v_last_method,v_last_paid_at
    from public.accounts_payable_payments
    where purchase_document_id=p_document_id
      and reversed_at is null;

    select coalesce(sum(amount),0)
    into v_credits
    from public.accounts_payable_credits
    where purchase_document_id=p_document_id
      and reversed_at is null;

    v_settled:=least(
        greatest(coalesce(v_baseline,0)+coalesce(v_payments,0)+coalesce(v_credits,0),0),
        v_total
    );

    update public.purchase_documents
    set paid_amount=v_settled,
        payment_status=
          case
            when payment_status='void' then 'void'
            when v_settled<=0 then 'unpaid'
            when v_settled>=v_total and v_total>0 then 'paid'
            else 'partial'
          end,
        payment_method=coalesce(v_last_method,payment_method),
        paid_at=case
            when v_settled>=v_total and v_total>0 then coalesce(v_last_paid_at,paid_at,now())
            else null
        end,
        updated_at=now()
    where id=p_document_id;
end
$$;

-- ---------------------------------------------------------
-- Returns list
-- ---------------------------------------------------------
create or replace function public.backoffice_list_purchase_returns_v18()
returns table(
    id uuid,
    return_no text,
    return_date date,
    supplier_name text,
    po_no text,
    document_internal_no text,
    supplier_credit_no text,
    credit_amount numeric,
    status text,
    reason text,
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
        r.id,r.return_no,r.return_date,s.name,po.po_no,
        d.internal_no,r.supplier_credit_no,r.credit_amount,
        r.status,r.reason,r.created_at
    from public.purchase_returns r
    join public.suppliers s on s.id=r.supplier_id
    join public.purchase_orders po on po.id=r.purchase_order_id
    left join public.purchase_documents d on d.id=r.purchase_document_id
    where r.branch_id=v_branch
    order by r.return_date desc,r.created_at desc;
end
$$;

-- ---------------------------------------------------------
-- Credit history for AP document
-- ---------------------------------------------------------
create or replace function public.backoffice_ap_credit_history_v18(
    p_document_id uuid
)
returns table(
    id uuid,
    return_no text,
    credit_date date,
    amount numeric,
    credit_note_no text,
    note text,
    reversed_at timestamptz
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
    select c.id,r.return_no,c.credit_date,c.amount,c.credit_note_no,c.note,c.reversed_at
    from public.accounts_payable_credits c
    join public.purchase_returns r on r.id=c.purchase_return_id
    where c.purchase_document_id=p_document_id
      and c.branch_id=v_branch
    order by c.credit_date desc,c.created_at desc;
end
$$;

revoke all on function public.backoffice_purchase_returnable_items_v18(uuid) from public;
revoke all on function public.backoffice_post_purchase_return_v18(uuid,uuid,date,text,text,text,jsonb) from public;
revoke all on function public.backoffice_list_purchase_returns_v18() from public;
revoke all on function public.backoffice_ap_credit_history_v18(uuid) from public;

grant execute on function public.backoffice_purchase_returnable_items_v18(uuid) to authenticated;
grant execute on function public.backoffice_post_purchase_return_v18(uuid,uuid,date,text,text,text,jsonb) to authenticated;
grant execute on function public.backoffice_list_purchase_returns_v18() to authenticated;
grant execute on function public.backoffice_ap_credit_history_v18(uuid) to authenticated;

commit;

select 'JOKJUNG PURCHASE RETURNS V1.8 READY' as result;
