-- =========================================================
-- JOKJUNG BACK OFFICE - EXPENSE MANAGEMENT V1
-- ใช้ _bo_ctx() ของ Back Office เดิม
-- Admin / Manager
-- =========================================================

create table if not exists public.expense_categories (
    id uuid primary key default gen_random_uuid(),
    branch_id uuid not null references public.branches(id) on delete cascade,
    name text not null,
    sort_order integer not null default 0,
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    unique(branch_id, name)
);

create table if not exists public.operating_expenses (
    id uuid primary key default gen_random_uuid(),
    branch_id uuid not null references public.branches(id) on delete cascade,
    expense_date date not null default current_date,
    category_id uuid not null references public.expense_categories(id),
    description text,
    amount numeric(14,2) not null check(amount > 0),
    payment_method text,
    reference_no text,
    status text not null default 'active' check(status in ('active','void')),
    void_reason text,
    voided_at timestamptz,
    voided_by uuid references public.profiles(id) on delete set null,
    created_by uuid not null references public.profiles(id),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_operating_expenses_branch_date
on public.operating_expenses(branch_id, expense_date desc);

alter table public.expense_categories enable row level security;
alter table public.operating_expenses enable row level security;

drop policy if exists expense_categories_bo_read on public.expense_categories;
create policy expense_categories_bo_read
on public.expense_categories for select to authenticated
using (
    exists (
        select 1 from public.profiles p
        where p.id=auth.uid()
          and p.branch_id=expense_categories.branch_id
          and lower(trim(coalesce(p.role,''))) in ('admin','manager')
    )
);

drop policy if exists operating_expenses_bo_read on public.operating_expenses;
create policy operating_expenses_bo_read
on public.operating_expenses for select to authenticated
using (
    exists (
        select 1 from public.profiles p
        where p.id=auth.uid()
          and p.branch_id=operating_expenses.branch_id
          and lower(trim(coalesce(p.role,''))) in ('admin','manager')
    )
);

create or replace function public.backoffice_expense_seed_categories()
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare v_branch uuid;
begin
    select x.branch_id into v_branch from public._bo_ctx() x;
    if v_branch is null then raise exception 'BACKOFFICE_PERMISSION_DENIED'; end if;

    insert into public.expense_categories(branch_id,name,sort_order)
    values
      (v_branch,'ค่าแรง',10),
      (v_branch,'ค่าเช่า',20),
      (v_branch,'ค่าน้ำ',30),
      (v_branch,'ค่าไฟ',40),
      (v_branch,'ค่าแก๊ส',50),
      (v_branch,'ค่าการตลาด',60),
      (v_branch,'ค่าธรรมเนียม Delivery',70),
      (v_branch,'ค่าซ่อมบำรุง',80),
      (v_branch,'ค่าอุปกรณ์ / ของใช้',90),
      (v_branch,'ค่าใช้จ่ายอื่นๆ',100)
    on conflict(branch_id,name) do nothing;

    return jsonb_build_object('ok',true);
end;
$$;

create or replace function public.backoffice_expense_list(
    p_date_from date default current_date,
    p_date_to date default current_date,
    p_category_id uuid default null,
    p_include_void boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare v_branch uuid; v_result jsonb;
begin
    select x.branch_id into v_branch from public._bo_ctx() x;
    if v_branch is null then raise exception 'BACKOFFICE_PERMISSION_DENIED'; end if;

    select jsonb_build_object(
      'summary',jsonb_build_object(
        'active_count',count(*) filter(where e.status='active'),
        'active_amount',coalesce(sum(e.amount) filter(where e.status='active'),0)
      ),
      'categories',coalesce((
        select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name) order by c.sort_order,c.name)
        from public.expense_categories c
        where c.branch_id=v_branch and c.is_active=true
      ),'[]'::jsonb),
      'items',coalesce(jsonb_agg(
        jsonb_build_object(
          'id',e.id,'expense_date',e.expense_date,'category_id',e.category_id,
          'category_name',c.name,'description',e.description,'amount',e.amount,
          'payment_method',e.payment_method,'reference_no',e.reference_no,
          'status',e.status,'void_reason',e.void_reason,'created_at',e.created_at,
          'created_by_name',p.full_name
        ) order by e.expense_date desc,e.created_at desc
      ) filter(where e.id is not null),'[]'::jsonb)
    ) into v_result
    from public.operating_expenses e
    join public.expense_categories c on c.id=e.category_id
    left join public.profiles p on p.id=e.created_by
    where e.branch_id=v_branch
      and e.expense_date between p_date_from and p_date_to
      and (p_category_id is null or e.category_id=p_category_id)
      and (p_include_void or e.status='active');

    return v_result;
end;
$$;

create or replace function public.backoffice_expense_save(
    p_expense_date date,
    p_category_id uuid,
    p_amount numeric,
    p_description text default null,
    p_payment_method text default null,
    p_reference_no text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare v_user uuid; v_branch uuid; v_id uuid;
begin
    select x.user_id,x.branch_id into v_user,v_branch from public._bo_ctx() x;
    if v_branch is null then raise exception 'BACKOFFICE_PERMISSION_DENIED'; end if;
    if p_amount is null or p_amount<=0 then raise exception 'INVALID_AMOUNT'; end if;

    if not exists(
      select 1 from public.expense_categories
      where id=p_category_id and branch_id=v_branch and is_active=true
    ) then raise exception 'INVALID_CATEGORY'; end if;

    insert into public.operating_expenses(
      branch_id,expense_date,category_id,description,amount,
      payment_method,reference_no,created_by
    ) values(
      v_branch,coalesce(p_expense_date,current_date),p_category_id,
      nullif(trim(coalesce(p_description,'')),''),
      p_amount,nullif(trim(coalesce(p_payment_method,'')),''),
      nullif(trim(coalesce(p_reference_no,'')),''),v_user
    ) returning id into v_id;

    return jsonb_build_object('ok',true,'id',v_id);
end;
$$;

create or replace function public.backoffice_expense_void(
    p_expense_id uuid,
    p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare v_user uuid; v_branch uuid;
begin
    select x.user_id,x.branch_id into v_user,v_branch from public._bo_ctx() x;
    if v_branch is null then raise exception 'BACKOFFICE_PERMISSION_DENIED'; end if;
    if nullif(trim(coalesce(p_reason,'')),'') is null then raise exception 'VOID_REASON_REQUIRED'; end if;

    update public.operating_expenses
    set status='void',void_reason=trim(p_reason),voided_at=now(),voided_by=v_user,updated_at=now()
    where id=p_expense_id and branch_id=v_branch and status='active';

    if not found then raise exception 'EXPENSE_NOT_FOUND_OR_VOIDED'; end if;
    return jsonb_build_object('ok',true);
end;
$$;

revoke all on function public.backoffice_expense_seed_categories() from public;
revoke all on function public.backoffice_expense_list(date,date,uuid,boolean) from public;
revoke all on function public.backoffice_expense_save(date,uuid,numeric,text,text,text) from public;
revoke all on function public.backoffice_expense_void(uuid,text) from public;

grant execute on function public.backoffice_expense_seed_categories() to authenticated;
grant execute on function public.backoffice_expense_list(date,date,uuid,boolean) to authenticated;
grant execute on function public.backoffice_expense_save(date,uuid,numeric,text,text,text) to authenticated;
grant execute on function public.backoffice_expense_void(uuid,text) to authenticated;

-- หมายเหตุ:
-- ไม่ต้องเรียก backoffice_expense_seed_categories() จาก SQL Editor
-- หน้า expenses.html จะเรียก RPC นี้เองหลังผู้ใช้ Login แล้ว
