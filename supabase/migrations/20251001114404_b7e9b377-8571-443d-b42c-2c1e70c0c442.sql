-- Insert sample categories
INSERT INTO public.categories (name, description) VALUES
  ('Seeds', 'Agricultural seeds and planting materials'),
  ('Fertilizers', 'Organic and chemical fertilizers'),
  ('Pesticides', 'Crop protection products'),
  ('Tools', 'Farming tools and equipment'),
  ('Animal Feed', 'Livestock and poultry feed')
ON CONFLICT DO NOTHING;

-- Insert sample products
INSERT INTO public.products (name, category, unit, selling_price, cost_price, stock_quantity, reorder_level, barcode) VALUES
  ('Maize Seeds - Hybrid', 'Seeds', 'kg', 450, 350, 100, 20, '1001'),
  ('Wheat Seeds', 'Seeds', 'kg', 380, 280, 75, 15, '1002'),
  ('DAP Fertilizer', 'Fertilizers', 'bag', 4500, 3800, 50, 10, '2001'),
  ('NPK Fertilizer', 'Fertilizers', 'bag', 4200, 3500, 60, 10, '2002'),
  ('Organic Manure', 'Fertilizers', 'bag', 800, 600, 80, 15, '2003'),
  ('Pesticide Spray', 'Pesticides', 'liter', 1200, 900, 40, 10, '3001'),
  ('Fungicide', 'Pesticides', 'liter', 1500, 1100, 35, 8, '3002'),
  ('Garden Hoe', 'Tools', 'piece', 650, 450, 30, 5, '4001'),
  ('Spade', 'Tools', 'piece', 800, 600, 25, 5, '4002'),
  ('Dairy Meal', 'Animal Feed', 'bag', 3600, 3000, 45, 10, '5001'),
  ('Chicken Feed', 'Animal Feed', 'bag', 2800, 2300, 55, 12, '5002'),
  ('Poultry Grower', 'Animal Feed', 'bag', 2500, 2000, 50, 10, '5003')
ON CONFLICT DO NOTHING;