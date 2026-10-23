create extension if not exists pgcrypto;

create table if not exists public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    display_name text not null default '',
    phone text not null default '',
    role text not null default 'customer' check (role in ('customer', 'admin')),
    created_at timestamptz not null default now()
);

create table if not exists public.campaigns (
    id uuid primary key default gen_random_uuid(),
    created_by uuid not null references public.profiles(id),
    name text not null check (char_length(name) between 1 and 90),
    prize_amount numeric(12, 2) not null check (prize_amount > 0),
    ticket_price numeric(12, 2) not null check (ticket_price > 0),
    draw_date date,
    status text not null default 'active' check (status in ('active', 'archived')),
    drawn_number smallint check (drawn_number between 0 and 99),
    winner_published boolean not null default false,
    winner_name_public text,
    archived_at timestamptz,
    created_at timestamptz not null default now(),
    constraint archived_campaign_has_result check (status <> 'archived' or drawn_number is not null),
    constraint winner_name_only_when_published check (winner_published or winner_name_public is null)
);

create table if not exists public.tickets (
    id uuid primary key default gen_random_uuid(),
    campaign_id uuid not null references public.campaigns(id),
    ticket_number smallint not null check (ticket_number between 0 and 99),
    buyer_id uuid references public.profiles(id) on delete set null,
    buyer_name text not null default '',
    buyer_phone text not null default '',
    price_each numeric(12, 2) not null check (price_each > 0),
    status text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled')),
    created_at timestamptz not null default now()
);

alter table public.tickets drop constraint if exists tickets_status_check;
alter table public.tickets
    add constraint tickets_status_check check (status in ('pending', 'fiado', 'confirmed', 'cancelled'));

create index if not exists tickets_buyer_created_idx on public.tickets (buyer_id, created_at desc);
create index if not exists tickets_campaign_status_idx on public.tickets (campaign_id, status);
alter table public.tickets drop constraint if exists tickets_campaign_id_ticket_number_key;
drop index if exists public.tickets_active_campaign_number_unique_idx;
create unique index if not exists tickets_active_campaign_number_unique_idx
    on public.tickets (campaign_id, ticket_number)
    where status in ('pending', 'fiado', 'confirmed');

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.profiles (id, display_name, phone)
    values (
        new.id,
        coalesce(new.raw_user_meta_data ->> 'display_name', ''),
        coalesce(new.raw_user_meta_data ->> 'phone', '')
    )
    on conflict (id) do nothing;
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1 from public.profiles
        where id = (select auth.uid()) and role = 'admin'
    );
$$;

create or replace function public.reserve_campaign_numbers(p_campaign_id uuid, p_numbers integer[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
    campaign_row public.campaigns%rowtype;
    profile_row public.profiles%rowtype;
    requested_count integer;
    occupied_count integer;
begin
    if auth.uid() is null then
        raise exception 'Entre na sua conta para reservar dezenas.';
    end if;

    if p_numbers is null or cardinality(p_numbers) = 0 or cardinality(p_numbers) > 100 then
        raise exception 'Selecione entre 1 e 100 dezenas.';
    end if;

    if exists (select 1 from unnest(p_numbers) as requested(number) where requested.number < 0 or requested.number > 99) then
        raise exception 'As dezenas devem estar entre 00 e 99.';
    end if;

    select count(distinct requested.number) into requested_count from unnest(p_numbers) as requested(number);
    if requested_count <> cardinality(p_numbers) then
        raise exception 'A seleção contém dezenas repetidas.';
    end if;

    select * into campaign_row
    from public.campaigns
    where id = p_campaign_id
    for update;

    if not found or campaign_row.status <> 'active' then
        raise exception 'Esta campanha não está aberta para reservas.';
    end if;

    select count(*) into occupied_count
    from public.tickets
    where campaign_id = p_campaign_id
      and ticket_number = any(p_numbers)
      and status in ('pending', 'fiado', 'confirmed');

    if occupied_count > 0 then
        raise exception 'Uma ou mais dezenas acabaram de ficar indisponíveis. Atualize a cartela e tente novamente.';
    end if;

    select * into profile_row from public.profiles where id = auth.uid();

    insert into public.tickets (campaign_id, ticket_number, buyer_id, buyer_name, buyer_phone, price_each)
    select p_campaign_id, requested.number, auth.uid(),
           coalesce(profile_row.display_name, ''), coalesce(profile_row.phone, ''),
           campaign_row.ticket_price
    from unnest(p_numbers) as requested(number);

    return cardinality(p_numbers);
end;
$$;

drop function if exists public.admin_create_campaign_sale(uuid, integer[], text, text, text);
create function public.admin_create_campaign_sale(
    p_campaign_id uuid,
    p_numbers integer[],
    p_buyer_name text,
    p_buyer_phone text,
    p_buyer_id uuid,
    p_status text default 'confirmed'
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
    campaign_row public.campaigns%rowtype;
    requested_count integer;
    occupied_count integer;
begin
    if auth.uid() is null or not public.is_admin() then
        raise exception 'Somente a administradora pode registrar vendas pelo painel.';
    end if;

    if p_buyer_name is null or char_length(trim(p_buyer_name)) not between 1 and 100 then
        raise exception 'Informe o nome do cliente (até 100 caracteres).';
    end if;

    if p_buyer_phone is not null and trim(p_buyer_phone) <> '' and p_buyer_phone !~ '^\+[0-9]{10,13}$' then
        raise exception 'Informe um telefone válido para contato.';
    end if;

    if p_buyer_id is not null and not exists (
        select 1 from public.profiles where id = p_buyer_id and role = 'customer'
    ) then
        raise exception 'O cliente cadastrado selecionado não é válido.';
    end if;

    if p_status is null or p_status not in ('pending', 'fiado', 'confirmed') then
        raise exception 'Status de venda inválido.';
    end if;

    if p_numbers is null or cardinality(p_numbers) = 0 or cardinality(p_numbers) > 100 then
        raise exception 'Selecione entre 1 e 100 dezenas.';
    end if;

    if exists (select 1 from unnest(p_numbers) as requested(number) where requested.number < 0 or requested.number > 99) then
        raise exception 'As dezenas devem estar entre 00 e 99.';
    end if;

    select count(distinct requested.number) into requested_count from unnest(p_numbers) as requested(number);
    if requested_count <> cardinality(p_numbers) then
        raise exception 'A seleção contém dezenas repetidas.';
    end if;

    select * into campaign_row
    from public.campaigns
    where id = p_campaign_id
    for update;

    if not found or campaign_row.status <> 'active' then
        raise exception 'Esta campanha não está aberta para vendas.';
    end if;

    select count(*) into occupied_count
    from public.tickets
    where campaign_id = p_campaign_id
      and ticket_number = any(p_numbers)
      and status in ('pending', 'fiado', 'confirmed');

    if occupied_count > 0 then
        raise exception 'Uma ou mais dezenas não estão disponíveis. Atualize a cartela e tente novamente.';
    end if;

    insert into public.tickets (campaign_id, ticket_number, buyer_id, buyer_name, buyer_phone, price_each, status)
    select p_campaign_id, requested.number, p_buyer_id, trim(p_buyer_name), coalesce(trim(p_buyer_phone), ''),
           campaign_row.ticket_price, p_status
    from unnest(p_numbers) as requested(number);

    return cardinality(p_numbers);
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.is_admin() from public;
revoke all on function public.reserve_campaign_numbers(uuid, integer[]) from public, anon, authenticated;
revoke all on function public.admin_create_campaign_sale(uuid, integer[], text, text, uuid, text) from public, anon, authenticated;
grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.reserve_campaign_numbers(uuid, integer[]) to authenticated;
grant execute on function public.admin_create_campaign_sale(uuid, integer[], text, text, uuid, text) to authenticated;

alter table public.profiles enable row level security;
alter table public.campaigns enable row level security;
alter table public.tickets enable row level security;

drop policy if exists "Read own profile or admin profiles" on public.profiles;
create policy "Read own profile or admin profiles" on public.profiles
    for select to authenticated
    using (id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "Update own customer details" on public.profiles;
create policy "Update own customer details" on public.profiles
    for update to authenticated
    using (id = (select auth.uid()))
    with check (id = (select auth.uid()) and role = 'customer');

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name, phone) on public.profiles to authenticated;

drop policy if exists "Read public campaigns" on public.campaigns;
create policy "Read public campaigns" on public.campaigns
    for select to anon, authenticated
    using (status = 'active' or (status = 'archived' and winner_published) or (select public.is_admin()));

drop policy if exists "Admins create campaigns" on public.campaigns;
create policy "Admins create campaigns" on public.campaigns
    for insert to authenticated
    with check ((select public.is_admin()) and created_by = (select auth.uid()));

drop policy if exists "Admins update campaigns" on public.campaigns;
create policy "Admins update campaigns" on public.campaigns
    for update to authenticated
    using ((select public.is_admin()))
    with check ((select public.is_admin()));

revoke all on public.campaigns from anon, authenticated;
grant select on public.campaigns to anon;
grant select, insert, update on public.campaigns to authenticated;

drop policy if exists "Read own tickets or admin tickets" on public.tickets;
create policy "Read own tickets or admin tickets" on public.tickets
    for select to authenticated
    using (buyer_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "Admins update ticket status" on public.tickets;
create policy "Admins update ticket status" on public.tickets
    for update to authenticated
    using ((select public.is_admin()))
    with check ((select public.is_admin()));

revoke all on public.tickets from anon, authenticated;
grant select on public.tickets to authenticated;
grant update (status) on public.tickets to authenticated;

create or replace view public.campaign_number_status as
    select campaign_id, ticket_number, status
    from public.tickets
    where status in ('pending', 'fiado', 'confirmed');

revoke all on public.campaign_number_status from public, anon, authenticated;
grant select on public.campaign_number_status to anon, authenticated;

alter table public.profiles force row level security;
alter table public.campaigns force row level security;
alter table public.tickets force row level security;
