-- ============================================
-- SECURITY FIX: Implement Proper RLS Policies
-- ============================================

-- 1. Create security definer functions to avoid recursive RLS issues
-- ============================================

-- Function to check if user has a specific role
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Function to check if user is assigned to a specific store
CREATE OR REPLACE FUNCTION public.user_has_store_access(_user_id uuid, _store_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_stores
    WHERE user_id = _user_id
      AND store_id = _store_id
  )
$$;

-- Function to get user's store IDs
CREATE OR REPLACE FUNCTION public.get_user_stores(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT store_id
  FROM public.user_stores
  WHERE user_id = _user_id
$$;


-- 2. Update RLS Policies for CUSTOMERS table
-- ============================================
DROP POLICY IF EXISTS "Customers are viewable by authenticated" ON public.customers;
DROP POLICY IF EXISTS "Customers insert by authenticated" ON public.customers;
DROP POLICY IF EXISTS "Customers update by authenticated" ON public.customers;
DROP POLICY IF EXISTS "Customers delete by authenticated" ON public.customers;

-- Admins can view all customers
CREATE POLICY "Admins can view all customers" ON public.customers
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Cashiers can view customers
CREATE POLICY "Cashiers can view customers" ON public.customers
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'cashier'));

-- Only admins can insert/update/delete customers
CREATE POLICY "Admins can insert customers" ON public.customers
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update customers" ON public.customers
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete customers" ON public.customers
  FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));


-- 3. Update RLS Policies for PROFILES table
-- ============================================
DROP POLICY IF EXISTS "Profiles are viewable by authenticated" ON public.profiles;

-- Users can view their own profile
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- Admins can view all profiles
CREATE POLICY "Admins can view all profiles" ON public.profiles
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));


-- 4. Update RLS Policies for SALES table
-- ============================================
DROP POLICY IF EXISTS "Sales are viewable by authenticated" ON public.sales;
DROP POLICY IF EXISTS "Sales insert by authenticated" ON public.sales;
DROP POLICY IF EXISTS "Sales update by authenticated" ON public.sales;
DROP POLICY IF EXISTS "Sales delete by authenticated" ON public.sales;

-- Admins can view all sales
CREATE POLICY "Admins can view all sales" ON public.sales
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Cashiers can view sales from their assigned stores
CREATE POLICY "Cashiers can view store sales" ON public.sales
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'cashier') AND 
    public.user_has_store_access(auth.uid(), store_id)
  );

-- Users can insert sales for their stores
CREATE POLICY "Users can insert sales for their stores" ON public.sales
  FOR INSERT
  TO authenticated
  WITH CHECK (public.user_has_store_access(auth.uid(), store_id));

-- Only admins can update sales
CREATE POLICY "Admins can update sales" ON public.sales
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Only admins can delete sales
CREATE POLICY "Admins can delete sales" ON public.sales
  FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));


-- 5. Update RLS Policies for SALE_ITEMS table
-- ============================================
DROP POLICY IF EXISTS "Sale items are viewable by authenticated" ON public.sale_items;
DROP POLICY IF EXISTS "Sale items insert by authenticated" ON public.sale_items;
DROP POLICY IF EXISTS "Sale items update by authenticated" ON public.sale_items;
DROP POLICY IF EXISTS "Sale items delete by authenticated" ON public.sale_items;

-- View sale items if user can view the sale
CREATE POLICY "Users can view sale items for accessible sales" ON public.sale_items
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.sales
      WHERE sales.id = sale_items.sale_id
        AND (
          public.has_role(auth.uid(), 'admin') OR
          (public.has_role(auth.uid(), 'cashier') AND public.user_has_store_access(auth.uid(), sales.store_id))
        )
    )
  );

-- Users can insert sale items
CREATE POLICY "Users can insert sale items" ON public.sale_items
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Only admins can update/delete sale items
CREATE POLICY "Admins can update sale items" ON public.sale_items
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete sale items" ON public.sale_items
  FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));


-- 6. Update RLS Policies for PRODUCTS_MASTER table
-- ============================================
DROP POLICY IF EXISTS "Products master are viewable by authenticated" ON public.products_master;
DROP POLICY IF EXISTS "Products master insert by authenticated" ON public.products_master;
DROP POLICY IF EXISTS "Products master update by authenticated" ON public.products_master;
DROP POLICY IF EXISTS "Products master delete by authenticated" ON public.products_master;

-- All users can view products
CREATE POLICY "All users can view products" ON public.products_master
  FOR SELECT
  TO authenticated
  USING (true);

-- Only admins can insert/update/delete products
CREATE POLICY "Admins can insert products" ON public.products_master
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update products" ON public.products_master
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete products" ON public.products_master
  FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));


-- 7. Update RLS Policies for STORE_INVENTORY table
-- ============================================
DROP POLICY IF EXISTS "Store inventory are viewable by authenticated" ON public.store_inventory;
DROP POLICY IF EXISTS "Store inventory insert by authenticated" ON public.store_inventory;
DROP POLICY IF EXISTS "Store inventory update by authenticated" ON public.store_inventory;
DROP POLICY IF EXISTS "Store inventory delete by authenticated" ON public.store_inventory;

-- Admins can view all inventory
CREATE POLICY "Admins can view all inventory" ON public.store_inventory
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Cashiers can view inventory for their assigned stores
CREATE POLICY "Cashiers can view store inventory" ON public.store_inventory
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'cashier') AND 
    public.user_has_store_access(auth.uid(), store_id)
  );

-- Only admins can insert inventory
CREATE POLICY "Admins can insert inventory" ON public.store_inventory
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Users can update inventory for their stores
CREATE POLICY "Users can update store inventory" ON public.store_inventory
  FOR UPDATE
  TO authenticated
  USING (public.user_has_store_access(auth.uid(), store_id))
  WITH CHECK (public.user_has_store_access(auth.uid(), store_id));

-- Only admins can delete inventory
CREATE POLICY "Admins can delete inventory" ON public.store_inventory
  FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));


-- 8. Update RLS Policies for STORES table
-- ============================================
DROP POLICY IF EXISTS "Stores are viewable by authenticated" ON public.stores;
DROP POLICY IF EXISTS "Stores insert by authenticated" ON public.stores;
DROP POLICY IF EXISTS "Stores update by authenticated" ON public.stores;
DROP POLICY IF EXISTS "Stores delete by authenticated" ON public.stores;

-- Admins can view all stores
CREATE POLICY "Admins can view all stores" ON public.stores
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Cashiers can view their assigned stores
CREATE POLICY "Cashiers can view assigned stores" ON public.stores
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'cashier') AND 
    id IN (SELECT public.get_user_stores(auth.uid()))
  );

-- Only admins can modify stores
CREATE POLICY "Admins can insert stores" ON public.stores
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update stores" ON public.stores
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete stores" ON public.stores
  FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));


-- 9. Update RLS Policies for CATEGORIES table
-- ============================================
DROP POLICY IF EXISTS "Categories are viewable by authenticated" ON public.categories;
DROP POLICY IF EXISTS "Categories insert by authenticated" ON public.categories;
DROP POLICY IF EXISTS "Categories update by authenticated" ON public.categories;
DROP POLICY IF EXISTS "Categories delete by authenticated" ON public.categories;

-- All users can view categories
CREATE POLICY "All users can view categories" ON public.categories
  FOR SELECT
  TO authenticated
  USING (true);

-- Only admins can modify categories
CREATE POLICY "Admins can insert categories" ON public.categories
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update categories" ON public.categories
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete categories" ON public.categories
  FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));


-- 10. Update RLS Policies for PENDING_ORDERS table
-- ============================================
DROP POLICY IF EXISTS "Pending orders are viewable by authenticated" ON public.pending_orders;
DROP POLICY IF EXISTS "Pending orders insert by authenticated" ON public.pending_orders;
DROP POLICY IF EXISTS "Pending orders update by authenticated" ON public.pending_orders;
DROP POLICY IF EXISTS "Pending orders delete by authenticated" ON public.pending_orders;

-- All users can manage pending orders
CREATE POLICY "All users can view pending orders" ON public.pending_orders
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "All users can insert pending orders" ON public.pending_orders
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "All users can update pending orders" ON public.pending_orders
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "All users can delete pending orders" ON public.pending_orders
  FOR DELETE
  TO authenticated
  USING (true);