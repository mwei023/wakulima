-- Fix remaining security issues

-- 1. Fix USER_ROLES table - restrict visibility
-- ============================================
DROP POLICY IF EXISTS "User roles are viewable by authenticated" ON public.user_roles;

-- Users can view their own role
CREATE POLICY "Users can view own role" ON public.user_roles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Admins can view all roles
CREATE POLICY "Admins can view all roles" ON public.user_roles
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));


-- 2. Fix USER_STORES table - restrict visibility
-- ============================================
DROP POLICY IF EXISTS "User stores are viewable by authenticated" ON public.user_stores;

-- Users can view their own store assignments
CREATE POLICY "Users can view own stores" ON public.user_stores
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Admins can view all store assignments
CREATE POLICY "Admins can view all store assignments" ON public.user_stores
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));


-- 3. Fix SALE_ITEMS INSERT - verify sale access
-- ============================================
DROP POLICY IF EXISTS "Users can insert sale items" ON public.sale_items;

-- Users can only insert sale items for sales in their stores
CREATE POLICY "Users can insert sale items for accessible sales" ON public.sale_items
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.sales
      WHERE sales.id = sale_id
        AND public.user_has_store_access(auth.uid(), sales.store_id)
    )
  );


-- 4. Update PENDING_ORDERS for store-based access (if business allows)
-- ============================================
DROP POLICY IF EXISTS "All users can view pending orders" ON public.pending_orders;
DROP POLICY IF EXISTS "All users can insert pending orders" ON public.pending_orders;
DROP POLICY IF EXISTS "All users can update pending orders" ON public.pending_orders;
DROP POLICY IF EXISTS "All users can delete pending orders" ON public.pending_orders;

-- All authenticated users can view pending orders (shared queue)
CREATE POLICY "Users can view pending orders" ON public.pending_orders
  FOR SELECT
  TO authenticated
  USING (true);

-- All authenticated users can insert pending orders
CREATE POLICY "Users can insert pending orders" ON public.pending_orders
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Users can update pending orders
CREATE POLICY "Users can update pending orders" ON public.pending_orders
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Only admins can delete pending orders
CREATE POLICY "Admins can delete pending orders" ON public.pending_orders
  FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));