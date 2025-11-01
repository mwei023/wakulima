-- Fix products view to include store_id for proper filtering
drop view if exists public.products;

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
  si.updated_at,
  si.store_id
from public.store_inventory si
join public.products_master pm on si.product_id = pm.id;