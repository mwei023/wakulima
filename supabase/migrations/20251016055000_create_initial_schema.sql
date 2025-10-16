-- Enable extension for UUID generation
create extension if not exists pgcrypto;

-- Enums
create type public.payment_method as enum ('cash','mpesa','credit');
create type public.sale_status as enum ('synced','pending');
create type public.pending_order_status as enum ('pending','confirmed','ignored');
create type public.app_role as enum ('admin','cashier');

-- Timestamp update function
create or replace function public.update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql set search_path = public;

-- Tables
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.products_master (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,
  unit text not null,
  selling_price numeric(12,2) not null,
  cost_price numeric(12,2) not null,
  barcode text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Unique barcode when present
create unique index if not exists unique_products_master_barcode on public.products_master (barcode) where barcode is not null;
create index if not exists idx_products_master_name on public.products_master (name);
create index if not exists idx_products_master_category on public.products_master (category);

create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  location text,
  created_at timestamptz not null default now()
);

create table if not exists public.store_inventory (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products_master(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  stock_quantity integer not null default 0,
  reorder_level integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(product_id, store_id)
);

create index if not exists idx_store_inventory_product_id on public.store_inventory (product_id);
create index if not exists idx_store_inventory_store_id on public.store_inventory (store_id);

-- View for products (combines master and inventory)
create or replace view public.products as
select
  si.id,
  pm.name,
  pm.category,
  pm.unit,
  pm.selling_price,
  pm.cost_price,
  si.stock_quantity,
  si.reorder_level,
  pm.barcode,
  pm.created_at,
  si.updated_at
from public.store_inventory si
join public.products_master pm on si.product_id = pm.id;

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  credit_limit numeric(12,2) not null default 0,
  outstanding_balance numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_customers_name on public.customers (name);
create index if not exists idx_customers_phone on public.customers (phone);

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on delete set null,
  total_amount numeric(12,2) not null,
  payment_method public.payment_method not null,
  status public.sale_status not null default 'pending',
  timestamp timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  store_id uuid not null references public.stores(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_sales_timestamp on public.sales (timestamp desc);
create index if not exists idx_sales_customer_id on public.sales (customer_id);
create index if not exists idx_sales_store_id on public.sales (store_id);

create table if not exists public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  product_id uuid not null references public.store_inventory(id),
  product_name text not null,
  quantity numeric(12,3) not null,
  unit_price numeric(12,2) not null,
  total_line numeric(12,2) not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_sale_items_sale_id on public.sale_items (sale_id);
create index if not exists idx_sale_items_product_id on public.sale_items (product_id);

create table if not exists public.pending_orders (
  id uuid primary key default gen_random_uuid(),
  raw_message text not null,
  assigned_customer_id uuid references public.customers(id) on delete set null,
  status public.pending_order_status not null default 'pending',
  created_at timestamptz not null default now()
);

create index if not exists idx_pending_orders_status on public.pending_orders (status);
create index if not exists idx_pending_orders_created_at on public.pending_orders (created_at desc);

-- User profiles & roles
create table if not exists public.profiles (
  id uuid not null primary key references auth.users(id) on delete cascade,
  username text unique,
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  unique (user_id, role)
);

create table if not exists public.user_stores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  unique (user_id, store_id)
);

-- Triggers for updated_at
create or replace trigger trg_products_master_updated_at
before update on public.products_master
for each row execute function public.update_updated_at_column();

create or replace trigger trg_store_inventory_updated_at
before update on public.store_inventory
for each row execute function public.update_updated_at_column();

create or replace trigger trg_sales_updated_at
before update on public.sales
for each row execute function public.update_updated_at_column();

create or replace trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.update_updated_at_column();

-- Enable Row Level Security
alter table public.categories enable row level security;
alter table public.products_master enable row level security;
alter table public.stores enable row level security;
alter table public.store_inventory enable row level security;
alter table public.customers enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.pending_orders enable row level security;
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.user_stores enable row level security;

-- Policies: allow all authenticated users basic CRUD for core data
-- Categories
create policy "Categories are viewable by authenticated" on public.categories for select to authenticated using (true);
create policy "Categories insert by authenticated" on public.categories for insert to authenticated with check (true);
create policy "Categories update by authenticated" on public.categories for update to authenticated using (true) with check (true);
create policy "Categories delete by authenticated" on public.categories for delete to authenticated using (true);

-- Products Master
create policy "Products master are viewable by authenticated" on public.products_master for select to authenticated using (true);
create policy "Products master insert by authenticated" on public.products_master for insert to authenticated with check (true);
create policy "Products master update by authenticated" on public.products_master for update to authenticated using (true) with check (true);
create policy "Products master delete by authenticated" on public.products_master for delete to authenticated using (true);

-- Stores
create policy "Stores are viewable by authenticated" on public.stores for select to authenticated using (true);
create policy "Stores insert by authenticated" on public.stores for insert to authenticated with check (true);
create policy "Stores update by authenticated" on public.stores for update to authenticated using (true) with check (true);
create policy "Stores delete by authenticated" on public.stores for delete to authenticated using (true);

-- Store Inventory
create policy "Store inventory are viewable by authenticated" on public.store_inventory for select to authenticated using (true);
create policy "Store inventory insert by authenticated" on public.store_inventory for insert to authenticated with check (true);
create policy "Store inventory update by authenticated" on public.store_inventory for update to authenticated using (true) with check (true);
create policy "Store inventory delete by authenticated" on public.store_inventory for delete to authenticated using (true);

-- Customers
create policy "Customers are viewable by authenticated" on public.customers for select to authenticated using (true);
create policy "Customers insert by authenticated" on public.customers for insert to authenticated with check (true);
create policy "Customers update by authenticated" on public.customers for update to authenticated using (true) with check (true);
create policy "Customers delete by authenticated" on public.customers for delete to authenticated using (true);

-- Sales
create policy "Sales are viewable by authenticated" on public.sales for select to authenticated using (true);
create policy "Sales insert by authenticated" on public.sales for insert to authenticated with check (true);
create policy "Sales update by authenticated" on public.sales for update to authenticated using (true) with check (true);
create policy "Sales delete by authenticated" on public.sales for delete to authenticated using (true);

-- Sale Items
create policy "Sale items are viewable by authenticated" on public.sale_items for select to authenticated using (true);
create policy "Sale items insert by authenticated" on public.sale_items for insert to authenticated with check (true);
create policy "Sale items update by authenticated" on public.sale_items for update to authenticated using (true) with check (true);
create policy "Sale items delete by authenticated" on public.sale_items for delete to authenticated using (true);

-- Pending Orders
create policy "Pending orders are viewable by authenticated" on public.pending_orders for select to authenticated using (true);
create policy "Pending orders insert by authenticated" on public.pending_orders for insert to authenticated with check (true);
create policy "Pending orders update by authenticated" on public.pending_orders for update to authenticated using (true) with check (true);
create policy "Pending orders delete by authenticated" on public.pending_orders for delete to authenticated using (true);

-- Profiles: users manage their own profile; everyone authenticated can read basic info
create policy "Profiles are viewable by authenticated" on public.profiles for select to authenticated using (true);
create policy "Users can insert their own profile" on public.profiles for insert to authenticated with check (auth.uid() = id);
create policy "Users can update their own profile" on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- User roles: readable by authenticated; mutation restricted (no write policies)
create policy "User roles are viewable by authenticated" on public.user_roles for select to authenticated using (true);

-- User stores: readable by authenticated; mutation restricted (no write policies)
create policy "User stores are viewable by authenticated" on public.user_stores for select to authenticated using (true);

-- Insert default store
insert into public.stores (id, name, location) values ('9ddf957b-327f-4b93-9374-7455d2a7480b', 'Main Store', 'Kiserian, Kajiado County, Kenya') on conflict (id) do nothing;
