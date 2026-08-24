-- =========================================================
-- JOKJUNG PURCHASE DOCUMENT RECONCILIATION V1.5
-- PO <-> Receipt / Invoice / Tax Invoice
--
-- แนวคิด:
-- - PO total เป็นยอดก่อน VAT
-- - Document Base = Total - VAT (ถ้ามี VAT)
-- - Compare Document Base กับ PO Total
-- - Tolerance เริ่มต้น 1.00 บาท
-- - แยก VAT ออกจากส่วนต่าง เพื่อไม่แจ้งเตือนผิด
-- - เพิ่ม Shipping/Freight ในเอกสารซื้อ
-- =========================================================

begin;

alter table public.purchase_documents
    add column if not exists shipping_amount numeric(14,2) not null default 0
    check (shipping_amount >= 0);

-- ---------------------------------------------------------
-- LIST V1.5 + reconciliation
-- ---------------------------------------------------------
drop function if exists public.backoffice_list_purchase_documents_v15(date,date,uuid,text,text,numeric);

create function public.backoffice_list_purchase_documents_v15(
    p_from date default null,
    p_to date default null,
    p_supplier_id uuid default null,
    p_document_type text default null,
    p_payment_status text default null,
    p_tolerance numeric default 1.00
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
    currency_code text,
    subtotal numeric,
    discount_amount numeric,
    shipping_amount numeric,
    tax_mode text,
    tax_rate numeric,
    tax_amount numeric,
    total_amount numeric,
    paid_amount numeric,
    balance_due numeric,
    payment_method text,
    payment_status text,
    attachment_count bigint,
    po_total_amount numeric,
    document_base_amount numeric,
    reconcile_variance numeric,
    reconcile_status text,
    created_at timestamptz
)
language plpgsql
security definer
set search_path=public
as $$
declare
    v_branch uuid;
    v_tol numeric := greatest(coalesce(p_tolerance,1),0);
begin
    select x.branch_id into v_branch
    from public._bo_ctx() x;

    if v_branch is null then
        raise exception 'BACKOFFICE_PERMISSION_DENIED';
    end if;

    return query
    select
        d.id,
        d.internal_no,
        d.supplier_id,
        s.name,
        d.purchase_order_id,
        po.po_no,
        d.document_type,
        d.document_no,
        d.document_date,
        d.due_date,
        d.currency_code,
        d.subtotal,
        d.discount_amount,
        d.shipping_amount,
        d.tax_mode,
        d.tax_rate,
        d.tax_amount,
        d.total_amount,
        d.paid_amount,
        greatest(d.total_amount-d.paid_amount,0)::numeric,
        d.payment_method,
        d.payment_status,
        count(a.id)::bigint,
        po.total_amount,
        round(
            case
                when d.tax_mode in ('exclusive','inclusive')
                    then greatest(d.total_amount-d.tax_amount,0)
                else d.total_amount
            end
        ,2)::numeric as document_base_amount,
        case
            when po.id is null then null
            else round(
                (
                    case
                        when d.tax_mode in ('exclusive','inclusive')
                            then greatest(d.total_amount-d.tax_amount,0)
                        else d.total_amount
                    end
                ) - po.total_amount
            ,2)
        end::numeric as reconcile_variance,
        case
            when po.id is null then 'no_po'
            when abs(
                (
                    case
                        when d.tax_mode in ('exclusive','inclusive')
                            then greatest(d.total_amount-d.tax_amount,0)
                        else d.total_amount
                    end
                ) - po.total_amount
            ) <= v_tol then 'matched'
            when (
                (
                    case
                        when d.tax_mode in ('exclusive','inclusive')
                            then greatest(d.total_amount-d.tax_amount,0)
                        else d.total_amount
                    end
                ) - po.total_amount
            ) > v_tol then 'over'
            else 'under'
        end::text,
        d.created_at
    from public.purchase_documents d
    left join public.suppliers s on s.id=d.supplier_id
    left join public.purchase_orders po on po.id=d.purchase_order_id
    left join public.purchase_document_attachments a
      on a.purchase_document_id=d.id
    where d.branch_id=v_branch
      and (p_from is null or d.document_date>=p_from)
      and (p_to is null or d.document_date<=p_to)
      and (p_supplier_id is null or d.supplier_id=p_supplier_id)
      and (p_document_type is null or p_document_type='' or d.document_type=p_document_type)
      and (p_payment_status is null or p_payment_status='' or d.payment_status=p_payment_status)
    group by d.id,s.name,po.id,po.po_no,po.total_amount
    order by d.document_date desc,d.created_at desc;
end
$$;

-- ---------------------------------------------------------
-- DETAIL V1.5
-- ---------------------------------------------------------
create or replace function public.backoffice_get_purchase_document_v15(
    p_document_id uuid,
    p_tolerance numeric default 1.00
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
    v_branch uuid;
    v_result jsonb;
    v_tol numeric := greatest(coalesce(p_tolerance,1),0);
begin
    select x.branch_id into v_branch
    from public._bo_ctx() x;

    if v_branch is null then
        raise exception 'BACKOFFICE_PERMISSION_DENIED';
    end if;

    select jsonb_build_object(
        'id',d.id,
        'internal_no',d.internal_no,
        'supplier_id',d.supplier_id,
        'supplier_name',s.name,
        'purchase_order_id',d.purchase_order_id,
        'po_no',po.po_no,
        'po_total_amount',po.total_amount,
        'document_type',d.document_type,
        'document_no',d.document_no,
        'document_date',d.document_date,
        'due_date',d.due_date,
        'currency_code',d.currency_code,
        'exchange_rate',d.exchange_rate,
        'subtotal',d.subtotal,
        'discount_amount',d.discount_amount,
        'shipping_amount',d.shipping_amount,
        'tax_mode',d.tax_mode,
        'tax_rate',d.tax_rate,
        'tax_amount',d.tax_amount,
        'withholding_tax_amount',d.withholding_tax_amount,
        'total_amount',d.total_amount,
        'document_base_amount',
            round(
                case
                    when d.tax_mode in ('exclusive','inclusive')
                        then greatest(d.total_amount-d.tax_amount,0)
                    else d.total_amount
                end
            ,2),
        'reconcile_variance',
            case when po.id is null then null else
                round(
                    (
                        case
                            when d.tax_mode in ('exclusive','inclusive')
                                then greatest(d.total_amount-d.tax_amount,0)
                            else d.total_amount
                        end
                    ) - po.total_amount
                ,2)
            end,
        'reconcile_status',
            case
                when po.id is null then 'no_po'
                when abs(
                    (
                        case
                            when d.tax_mode in ('exclusive','inclusive')
                                then greatest(d.total_amount-d.tax_amount,0)
                            else d.total_amount
                        end
                    ) - po.total_amount
                ) <= v_tol then 'matched'
                when (
                    (
                        case
                            when d.tax_mode in ('exclusive','inclusive')
                                then greatest(d.total_amount-d.tax_amount,0)
                            else d.total_amount
                        end
                    ) - po.total_amount
                ) > v_tol then 'over'
                else 'under'
            end,
        'payment_method',d.payment_method,
        'payment_status',d.payment_status,
        'paid_amount',d.paid_amount,
        'paid_at',d.paid_at,
        'note',d.note,
        'created_at',d.created_at,
        'updated_at',d.updated_at,
        'attachments',coalesce((
            select jsonb_agg(jsonb_build_object(
                'id',a.id,
                'storage_path',a.storage_path,
                'file_name',a.file_name,
                'mime_type',a.mime_type,
                'size_bytes',a.size_bytes,
                'created_at',a.created_at
            ) order by a.created_at)
            from public.purchase_document_attachments a
            where a.purchase_document_id=d.id
        ),'[]'::jsonb)
    )
    into v_result
    from public.purchase_documents d
    left join public.suppliers s on s.id=d.supplier_id
    left join public.purchase_orders po on po.id=d.purchase_order_id
    where d.id=p_document_id
      and d.branch_id=v_branch;

    if v_result is null then
        raise exception 'PURCHASE_DOCUMENT_NOT_FOUND';
    end if;

    return v_result;
end
$$;

-- ---------------------------------------------------------
-- SAVE V1.5
-- ---------------------------------------------------------
create or replace function public.backoffice_save_purchase_document_v15(
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
    v_role text;
    v_id uuid;
    v_internal_no text;
    v_po_supplier uuid;
begin
    select x.user_id,x.branch_id,x.role
    into v_user,v_branch,v_role
    from public._bo_ctx() x;

    if v_branch is null then raise exception 'BACKOFFICE_PERMISSION_DENIED'; end if;
    if lower(trim(coalesce(v_role,''))) not in ('admin','manager') then
        raise exception 'BACKOFFICE_PERMISSION_DENIED';
    end if;

    if p_document_type not in ('receipt','tax_invoice','invoice','credit_note','debit_note','other') then
        raise exception 'INVALID_DOCUMENT_TYPE';
    end if;
    if p_document_date is null then raise exception 'DOCUMENT_DATE_REQUIRED'; end if;
    if upper(trim(coalesce(p_currency_code,''))) !~ '^[A-Z]{3}$' then
        raise exception 'INVALID_CURRENCY_CODE';
    end if;
    if coalesce(p_exchange_rate,0)<=0 then raise exception 'INVALID_EXCHANGE_RATE'; end if;
    if p_tax_mode not in ('none','exclusive','inclusive') then raise exception 'INVALID_TAX_MODE'; end if;
    if coalesce(p_tax_rate,0)<0 or coalesce(p_tax_rate,0)>100 then raise exception 'INVALID_TAX_RATE'; end if;
    if coalesce(p_subtotal,0)<0
       or coalesce(p_discount_amount,0)<0
       or coalesce(p_shipping_amount,0)<0
       or coalesce(p_tax_amount,0)<0
       or coalesce(p_withholding_tax_amount,0)<0
       or coalesce(p_total_amount,0)<0
       or coalesce(p_paid_amount,0)<0 then
        raise exception 'INVALID_AMOUNT';
    end if;
    if p_payment_status not in ('unpaid','partial','paid','void') then
        raise exception 'INVALID_PAYMENT_STATUS';
    end if;
    if p_payment_method is not null
       and p_payment_method not in ('cash','bank_transfer','qr','card','credit','other') then
        raise exception 'INVALID_PAYMENT_METHOD';
    end if;

    if p_supplier_id is not null and not exists(
        select 1 from public.suppliers
        where id=p_supplier_id and branch_id=v_branch
    ) then raise exception 'SUPPLIER_NOT_FOUND'; end if;

    if p_purchase_order_id is not null then
        select po.supplier_id into v_po_supplier
        from public.purchase_orders po
        where po.id=p_purchase_order_id
          and po.branch_id=v_branch;

        if not found then raise exception 'PURCHASE_ORDER_NOT_FOUND'; end if;

        if p_supplier_id is not null
           and v_po_supplier is distinct from p_supplier_id then
            raise exception 'PO_SUPPLIER_MISMATCH';
        end if;
    end if;

    if p_document_id is null then
        v_internal_no := public._bo_next_purchase_document_no();

        insert into public.purchase_documents(
            branch_id,internal_no,supplier_id,purchase_order_id,
            document_type,document_no,document_date,due_date,
            currency_code,exchange_rate,
            subtotal,discount_amount,shipping_amount,
            tax_mode,tax_rate,tax_amount,
            withholding_tax_amount,total_amount,
            payment_method,payment_status,paid_amount,paid_at,
            note,created_by,updated_by
        ) values(
            v_branch,v_internal_no,p_supplier_id,p_purchase_order_id,
            p_document_type,nullif(trim(coalesce(p_document_no,'')),''),
            p_document_date,p_due_date,
            upper(trim(p_currency_code)),p_exchange_rate,
            p_subtotal,p_discount_amount,p_shipping_amount,
            p_tax_mode,p_tax_rate,p_tax_amount,
            p_withholding_tax_amount,p_total_amount,
            p_payment_method,p_payment_status,p_paid_amount,p_paid_at,
            nullif(trim(coalesce(p_note,'')),''),v_user,v_user
        )
        returning id into v_id;
    else
        update public.purchase_documents
        set supplier_id=p_supplier_id,
            purchase_order_id=p_purchase_order_id,
            document_type=p_document_type,
            document_no=nullif(trim(coalesce(p_document_no,'')),''),
            document_date=p_document_date,
            due_date=p_due_date,
            currency_code=upper(trim(p_currency_code)),
            exchange_rate=p_exchange_rate,
            subtotal=p_subtotal,
            discount_amount=p_discount_amount,
            shipping_amount=p_shipping_amount,
            tax_mode=p_tax_mode,
            tax_rate=p_tax_rate,
            tax_amount=p_tax_amount,
            withholding_tax_amount=p_withholding_tax_amount,
            total_amount=p_total_amount,
            payment_method=p_payment_method,
            payment_status=p_payment_status,
            paid_amount=p_paid_amount,
            paid_at=p_paid_at,
            note=nullif(trim(coalesce(p_note,'')),''),
            updated_by=v_user,
            updated_at=now()
        where id=p_document_id
          and branch_id=v_branch
        returning id into v_id;

        if v_id is null then
            raise exception 'PURCHASE_DOCUMENT_NOT_FOUND';
        end if;
    end if;

    return v_id;
end
$$;

revoke all on function public.backoffice_list_purchase_documents_v15(date,date,uuid,text,text,numeric) from public;
revoke all on function public.backoffice_get_purchase_document_v15(uuid,numeric) from public;
revoke all on function public.backoffice_save_purchase_document_v15(
    uuid,uuid,uuid,text,text,date,date,text,numeric,numeric,numeric,numeric,text,numeric,numeric,numeric,numeric,text,text,numeric,timestamptz,text
) from public;

grant execute on function public.backoffice_list_purchase_documents_v15(date,date,uuid,text,text,numeric) to authenticated;
grant execute on function public.backoffice_get_purchase_document_v15(uuid,numeric) to authenticated;
grant execute on function public.backoffice_save_purchase_document_v15(
    uuid,uuid,uuid,text,text,date,date,text,numeric,numeric,numeric,numeric,text,numeric,numeric,numeric,numeric,text,text,numeric,timestamptz,text
) to authenticated;

commit;

select 'JOKJUNG PURCHASE DOCUMENT RECONCILIATION V1.5 READY' as result;
