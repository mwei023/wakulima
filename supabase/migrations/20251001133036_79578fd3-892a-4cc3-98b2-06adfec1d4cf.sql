-- Create stores table
CREATE TABLE public.stores (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  location text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on stores
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;

-- Create user_stores junction table for staff-store assignments
CREATE TABLE public.user_stores (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, store_id)
);

-- Enable RLS on user_stores
ALTER TABLE public.user_stores ENABLE ROW LEVEL SECURITY;

-- Add store_id to products
ALTER TABLE public.products ADD COLUMN store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE;

-- Add store_id to sales
ALTER TABLE public.sales ADD COLUMN store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE;

-- Create indexes for better performance
CREATE INDEX idx_products_store_id ON public.products(store_id);
CREATE INDEX idx_sales_store_id ON public.sales(store_id);
CREATE INDEX idx_user_stores_user_id ON public.user_stores(user_id);
CREATE INDEX idx_user_stores_store_id ON public.user_stores(store_id);

-- Create trigger for stores updated_at
CREATE TRIGGER update_stores_updated_at
  BEFORE UPDATE ON public.stores
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- RLS Policies for stores
CREATE POLICY "Users can view their assigned stores"
  ON public.stores FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_stores
      WHERE user_stores.store_id = stores.id
      AND user_stores.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can manage all stores"
  ON public.stores FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- RLS Policies for user_stores
CREATE POLICY "Users can view their store assignments"
  ON public.user_stores FOR SELECT
  USING (user_id = auth.uid() OR EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'admin'
  ));

CREATE POLICY "Admins can manage store assignments"
  ON public.user_stores FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- Update products RLS to include store access
DROP POLICY IF EXISTS "Products are viewable by authenticated" ON public.products;
CREATE POLICY "Users can view products from their stores"
  ON public.products FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_stores
      WHERE user_stores.store_id = products.store_id
      AND user_stores.user_id = auth.uid()
    ) OR
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Products insert by authenticated" ON public.products;
CREATE POLICY "Users can insert products to their stores"
  ON public.products FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_stores
      WHERE user_stores.store_id = products.store_id
      AND user_stores.user_id = auth.uid()
    ) OR
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Products update by authenticated" ON public.products;
CREATE POLICY "Users can update products in their stores"
  ON public.products FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_stores
      WHERE user_stores.store_id = products.store_id
      AND user_stores.user_id = auth.uid()
    ) OR
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Products delete by authenticated" ON public.products;
CREATE POLICY "Users can delete products from their stores"
  ON public.products FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_stores
      WHERE user_stores.store_id = products.store_id
      AND user_stores.user_id = auth.uid()
    ) OR
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- Update sales RLS to include store access
DROP POLICY IF EXISTS "Sales are viewable by authenticated" ON public.sales;
CREATE POLICY "Users can view sales from their stores"
  ON public.sales FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_stores
      WHERE user_stores.store_id = sales.store_id
      AND user_stores.user_id = auth.uid()
    ) OR
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Sales insert by authenticated" ON public.sales;
CREATE POLICY "Users can insert sales to their stores"
  ON public.sales FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_stores
      WHERE user_stores.store_id = sales.store_id
      AND user_stores.user_id = auth.uid()
    ) OR
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Sales update by authenticated" ON public.sales;
CREATE POLICY "Users can update sales in their stores"
  ON public.sales FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_stores
      WHERE user_stores.store_id = sales.store_id
      AND user_stores.user_id = auth.uid()
    ) OR
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Sales delete by authenticated" ON public.sales;
CREATE POLICY "Users can delete sales from their stores"
  ON public.sales FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_stores
      WHERE user_stores.store_id = sales.store_id
      AND user_stores.user_id = auth.uid()
    ) OR
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- Insert a default store for existing data
INSERT INTO public.stores (name, location)
VALUES ('Main Store', 'Default Location');

-- Get the default store id and update existing records
DO $$
DECLARE
  default_store_id uuid;
BEGIN
  SELECT id INTO default_store_id FROM public.stores WHERE name = 'Main Store' LIMIT 1;
  
  UPDATE public.products SET store_id = default_store_id WHERE store_id IS NULL;
  UPDATE public.sales SET store_id = default_store_id WHERE store_id IS NULL;
END $$;

-- Make store_id NOT NULL after migrating data
ALTER TABLE public.products ALTER COLUMN store_id SET NOT NULL;
ALTER TABLE public.sales ALTER COLUMN store_id SET NOT NULL;