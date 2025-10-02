-- Create master products table (shared catalog)
CREATE TABLE public.products_master (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  unit TEXT NOT NULL,
  selling_price NUMERIC NOT NULL,
  cost_price NUMERIC NOT NULL,
  barcode TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(name, category, unit)
);

-- Create store inventory table (per-store stock tracking)
CREATE TABLE public.store_inventory (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products_master(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  stock_quantity INTEGER NOT NULL DEFAULT 0,
  reorder_level INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(product_id, store_id)
);

-- Migrate existing products to master catalog (deduplicate by name, category, unit)
INSERT INTO public.products_master (id, name, category, unit, selling_price, cost_price, barcode, created_at, updated_at)
SELECT DISTINCT ON (name, category, unit)
  gen_random_uuid() as id,
  name,
  category,
  unit,
  selling_price,
  cost_price,
  barcode,
  MIN(created_at) as created_at,
  MAX(updated_at) as updated_at
FROM public.products
GROUP BY name, category, unit, selling_price, cost_price, barcode;

-- Migrate inventory data to store_inventory table
INSERT INTO public.store_inventory (product_id, store_id, stock_quantity, reorder_level, created_at, updated_at)
SELECT 
  pm.id as product_id,
  p.store_id,
  p.stock_quantity,
  p.reorder_level,
  p.created_at,
  p.updated_at
FROM public.products p
JOIN public.products_master pm ON pm.name = p.name AND pm.category = p.category AND pm.unit = p.unit;

-- Enable RLS on new tables
ALTER TABLE public.products_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_inventory ENABLE ROW LEVEL SECURITY;

-- RLS policies for products_master (everyone can view catalog)
CREATE POLICY "Products are viewable by authenticated users"
ON public.products_master
FOR SELECT
USING (true);

CREATE POLICY "Admins can insert products"
ON public.products_master
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid() AND role = 'admin'::app_role
  )
);

CREATE POLICY "Admins can update products"
ON public.products_master
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid() AND role = 'admin'::app_role
  )
);

CREATE POLICY "Admins can delete products"
ON public.products_master
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid() AND role = 'admin'::app_role
  )
);

-- RLS policies for store_inventory (users can manage their store inventory)
CREATE POLICY "Users can view inventory for their stores"
ON public.store_inventory
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM user_stores
    WHERE user_stores.store_id = store_inventory.store_id
    AND user_stores.user_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid() AND role = 'admin'::app_role
  )
);

CREATE POLICY "Users can insert inventory for their stores"
ON public.store_inventory
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_stores
    WHERE user_stores.store_id = store_inventory.store_id
    AND user_stores.user_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid() AND role = 'admin'::app_role
  )
);

CREATE POLICY "Users can update inventory for their stores"
ON public.store_inventory
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM user_stores
    WHERE user_stores.store_id = store_inventory.store_id
    AND user_stores.user_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid() AND role = 'admin'::app_role
  )
);

CREATE POLICY "Users can delete inventory for their stores"
ON public.store_inventory
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM user_stores
    WHERE user_stores.store_id = store_inventory.store_id
    AND user_stores.user_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid() AND role = 'admin'::app_role
  )
);

-- Add triggers for updated_at
CREATE TRIGGER update_products_master_updated_at
BEFORE UPDATE ON public.products_master
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_store_inventory_updated_at
BEFORE UPDATE ON public.store_inventory
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Rename old products table for backup
ALTER TABLE public.products RENAME TO products_old_backup;

-- Create a view to maintain backward compatibility temporarily
CREATE VIEW public.products AS
SELECT 
  si.id,
  pm.name,
  pm.category,
  pm.unit,
  pm.selling_price,
  pm.cost_price,
  si.stock_quantity,
  si.reorder_level,
  pm.barcode,
  si.store_id,
  pm.created_at,
  si.updated_at
FROM public.store_inventory si
JOIN public.products_master pm ON pm.id = si.product_id;