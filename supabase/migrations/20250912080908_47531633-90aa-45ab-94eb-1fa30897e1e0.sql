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
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  created_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,
  unit text not null,
  selling_price numeric(12,2) not null,
  cost_price numeric(12,2) not null,
  stock_quantity integer not null default 0,
  reorder_level integer not null default 0,
  barcode text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Unique barcode when present
create unique index unique_products_barcode on public.products (barcode) where barcode is not null;
create index idx_products_name on public.products (name);
create index idx_products_category on public.products (category);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  credit_limit numeric(12,2) not null default 0,
  outstanding_balance numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

create index idx_customers_name on public.customers (name);
create index idx_customers_phone on public.customers (phone);

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on delete set null,
  total_amount numeric(12,2) not null,
  payment_method public.payment_method not null,
  status public.sale_status not null default 'pending',
  timestamp timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_sales_timestamp on public.sales (timestamp desc);
create index idx_sales_customer_id on public.sales (customer_id);

create table public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  product_id uuid not null references public.products(id),
  product_name text not null,
  quantity numeric(12,3) not null,
  unit_price numeric(12,2) not null,
  total_line numeric(12,2) not null,
  created_at timestamptz not null default now()
);

create index idx_sale_items_sale_id on public.sale_items (sale_id);
create index idx_sale_items_product_id on public.sale_items (product_id);

create table public.pending_orders (
  id uuid primary key default gen_random_uuid(),
  raw_message text not null,
  assigned_customer_id uuid references public.customers(id) on delete set null,
  status public.pending_order_status not null default 'pending',
  created_at timestamptz not null default now()
);

create index idx_pending_orders_status on public.pending_orders (status);
create index idx_pending_orders_created_at on public.pending_orders (created_at desc);

-- User profiles & roles
create table public.profiles (
  id uuid not null primary key references auth.users(id) on delete cascade,
  username text unique,
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  unique (user_id, role)
);

-- Triggers for updated_at
create or replace trigger trg_products_updated_at
before update on public.products
for each row execute function public.update_updated_at_column();

create or replace trigger trg_sales_updated_at
before update on public.sales
for each row execute function public.update_updated_at_column();

create or replace trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.update_updated_at_column();

-- Enable Row Level Security
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.customers enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.pending_orders enable row level security;
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;

-- Policies: allow all authenticated users basic CRUD for core data
-- Categories
create policy "Categories are viewable by authenticated" on public.categories for select to authenticated using (true);
create policy "Categories insert by authenticated" on public.categories for insert to authenticated with check (true);
create policy "Categories update by authenticated" on public.categories for update to authenticated using (true) with check (true);
create policy "Categories delete by authenticated" on public.categories for delete to authenticated using (true);

-- Products
create policy "Products are viewable by authenticated" on public.products for select to authenticated using (true);
create policy "Products insert by authenticated" on public.products for insert to authenticated with check (true);
create policy "Products update by authenticated" on public.products for update to authenticated using (true) with check (true);
create policy "Products delete by authenticated" on public.products for delete to authenticated using (true);

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
