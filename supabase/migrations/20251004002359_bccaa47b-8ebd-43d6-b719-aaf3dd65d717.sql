-- Seed Store 2 with inventory from the existing products
INSERT INTO public.store_inventory (product_id, store_id, stock_quantity, reorder_level)
SELECT 
  pm.id as product_id,
  '629f9a97-fb24-4067-b095-7149c3ce6fa6'::uuid as store_id,
  50 as stock_quantity,
  10 as reorder_level
FROM public.products_master pm
WHERE NOT EXISTS (
  SELECT 1 
  FROM public.store_inventory si 
  WHERE si.product_id = pm.id 
    AND si.store_id = '629f9a97-fb24-4067-b095-7149c3ce6fa6'
);