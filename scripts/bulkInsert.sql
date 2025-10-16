-- Bulk insert script for all 279 products
-- Generated from product catalog data

-- Insert categories first
INSERT INTO categories (name) VALUES ('feeds') ON CONFLICT (name) DO NOTHING;
INSERT INTO categories (name) VALUES ('suppliers') ON CONFLICT (name) DO NOTHING;
INSERT INTO categories (name) VALUES ('fertilizers') ON CONFLICT (name) DO NOTHING;
INSERT INTO categories (name) VALUES ('maize') ON CONFLICT (name) DO NOTHING;
INSERT INTO categories (name) VALUES ('beans') ON CONFLICT (name) DO NOTHING;
INSERT INTO categories (name) VALUES ('vegetable_seeds') ON CONFLICT (name) DO NOTHING;
INSERT INTO categories (name) VALUES ('drinkers') ON CONFLICT (name) DO NOTHING;
INSERT INTO categories (name) VALUES ('poultry') ON CONFLICT (name) DO NOTHING;
INSERT INTO categories (name) VALUES ('injectables') ON CONFLICT (name) DO NOTHING;
INSERT INTO categories (name) VALUES ('vaccines') ON CONFLICT (name) DO NOTHING;
INSERT INTO categories (name) VALUES ('supplements') ON CONFLICT (name) DO NOTHING;
INSERT INTO categories (name) VALUES ('blocks') ON CONFLICT (name) DO NOTHING;
INSERT INTO categories (name) VALUES ('fungicides') ON CONFLICT (name) DO NOTHING;
INSERT INTO categories (name) VALUES ('herbicides') ON CONFLICT (name) DO NOTHING;
INSERT INTO categories (name) VALUES ('pesticides') ON CONFLICT (name) DO NOTHING;
INSERT INTO categories (name) VALUES ('other_veterinary') ON CONFLICT (name) DO NOTHING;
INSERT INTO categories (name) VALUES ('miscellaneous') ON CONFLICT (name) DO NOTHING;
INSERT INTO categories (name) VALUES ('farm_equipment') ON CONFLICT (name) DO NOTHING;

-- Insert products using proper UUID generation
INSERT INTO products_master (id, name, category, unit, selling_price, cost_price, barcode) VALUES (gen_random_uuid(), 'Growers 50kg', 'feeds', '50kg', 0.33, 0.21, 'growers_50kg');
INSERT INTO store_inventory (product_id, stock_quantity, reorder_level, store_id) VALUES ((SELECT id FROM products_master WHERE barcode = 'growers_50kg'), 100, 10, '9ddf957b-327f-4b93-9374-7455d2a7480b');

INSERT INTO products_master (id, name, category, unit, selling_price, cost_price, barcode) VALUES ('prod-002', 'Growers 20kg', 'feeds', '20kg', 2, 1, 'growers_20kg');
INSERT INTO store_inventory (product_id, stock_quantity, reorder_level, store_id) VALUES ('prod-002', 100, 10, '9ddf957b-327f-4b93-9374-7455d2a7480b');

INSERT INTO products_master (id, name, category, unit, selling_price, cost_price, barcode) VALUES ('prod-003', 'Growers 10kg', 'feeds', '10kg', 3, 0, 'growers_10kg');
INSERT INTO store_inventory (product_id, stock_quantity, reorder_level, store_id) VALUES ('prod-003', 100, 10, '9ddf957b-327f-4b93-9374-7455d2a7480b');

INSERT INTO products_master (id, name, category, unit, selling_price, cost_price, barcode) VALUES ('prod-004', 'Kienyeji std 50kg', 'feeds', '50kg', 2, 0.44, 'kienyejistd_50kg');
INSERT INTO store_inventory (product_id, stock_quantity, reorder_level, store_id) VALUES ('prod-004', 100, 10, '9ddf957b-327f-4b93-9374-7455d2a7480b');

INSERT INTO products_master (id, name, category, unit, selling_price, cost_price, barcode) VALUES ('prod-005', 'Kienyeji std 20kg', 'feeds', '20kg', 3, 2, 'kienyejistd_20kg');
INSERT INTO store_inventory (product_id, stock_quantity, reorder_level, store_id) VALUES ('prod-005', 100, 10, '9ddf957b-327f-4b93-9374-7455d2a7480b');

INSERT INTO products_master (id, name, category, unit, selling_price, cost_price, barcode) VALUES ('prod-006', 'Kienyeji std 10kg', 'feeds', '10kg', 6, 2, 'kienyejistd_10kg');
INSERT INTO store_inventory (product_id, stock_quantity, reorder_level, store_id) VALUES ('prod-006', 100, 10, '9ddf957b-327f-4b93-9374-7455d2a7480b');

INSERT INTO products_master (id, name, category, unit, selling_price, cost_price, barcode) VALUES ('prod-007', 'Kienyeji premium 50kg', 'feeds', '50kg', 1, 3, 'kienyejipremium_50kg');
INSERT INTO store_inventory (product_id, stock_quantity, reorder_level, store_id) VALUES ('prod-007', 100, 10, '9ddf957b-327f-4b93-9374-7455d2a7480b');

INSERT INTO products_master (id, name, category, unit, selling_price, cost_price, barcode) VALUES ('prod-008', 'Kienyeji premium 20kg', 'feeds', '20kg', 1, 2, 'kienyejipremium_20kg');
INSERT INTO store_inventory (product_id, stock_quantity, reorder_level, store_id) VALUES ('prod-008', 100, 10, '9ddf957b-327f-4b93-9374-7455d2a7480b');

INSERT INTO products_master (id, name, category, unit, selling_price, cost_price, barcode) VALUES ('prod-009', 'Kienyeji premium 10kg', 'feeds', '10kg', 2, 0, 'kienyejipremium_10kg');
INSERT INTO store_inventory (product_id, stock_quantity, reorder_level, store_id) VALUES ('prod-009', 100, 10, '9ddf957b-327f-4b93-9374-7455d2a7480b');

INSERT INTO products_master (id, name, category, unit, selling_price, cost_price, barcode) VALUES ('prod-010', 'Layers 50kg', 'feeds', '50kg', 1.6, 0.5, 'layers_50kg');
INSERT INTO store_inventory (product_id, stock_quantity, reorder_level, store_id) VALUES ('prod-010', 100, 10, '9ddf957b-327f-4b93-9374-7455d2a7480b');

INSERT INTO products_master (id, name, category, unit, selling_price, cost_price, barcode) VALUES ('prod-011', 'Layers 20kg', 'feeds', '20kg', 0, 0, 'layers_20kg');
INSERT INTO store_inventory (product_id, stock_quantity, reorder_level, store_id) VALUES ('prod-011', 100, 10, '9ddf957b-327f-4b93-9374-7455d2a7480b');

INSERT INTO products_master (id, name, category, unit, selling_price, cost_price, barcode) VALUES ('prod-012', 'Layers 10kg', 'feeds', '10kg', 4, 0, 'layers_10kg');
INSERT INTO store_inventory (product_id, stock_quantity, reorder_level, store_id) VALUES ('prod-012', 100, 10, '9ddf957b-327f-4b93-9374-7455d2a7480b');

INSERT INTO products_master (id, name, category, unit, selling_price, cost_price, barcode) VALUES ('prod-013', 'Dairy meal 50kg', 'feeds', '50kg', 3, 0.46, 'dairymeal_50kg');
INSERT INTO store_inventory (product_id, stock_quantity, reorder_level, store_id) VALUES ('prod-013', 100, 10, '9ddf957b-327f-4b93-9374-7455d2a7480b');

INSERT INTO products_master (id, name, category, unit, selling_price, cost_price, barcode) VALUES ('prod-014', 'Dairy meal 20kg', 'feeds', '20kg', 3, 1, 'dairymeal_20kg');
INSERT INTO store_inventory (product_id, stock_quantity, reorder_level, store_id) VALUES ('prod-014', 100, 10, '9ddf957b-327f-4b93-9374-7455d2a7480b');

INSERT INTO products_master (id, name, category, unit, selling_price, cost_price, barcode) VALUES ('prod-015', 'Dairy meal 10kg', 'feeds', '10kg', 4, 2, 'dairymeal_10kg');
INSERT INTO store_inventory (product_id, stock_quantity, reorder_level, store_id) VALUES ('prod-015', 100, 10, '9ddf957b-327f-4b93-9374-7455d2a7480b');

INSERT INTO products_master (id, name, category, unit, selling_price, cost_price, barcode) VALUES ('prod-016', 'Finisher pellet 50kg', 'feeds', '50kg', 4.32, 2.4, 'finisherpellet_50kg');
INSERT INTO store_inventory (product_id, stock_quantity, reorder_level, store_id) VALUES ('prod-016', 100, 10, '9ddf957b-327f-4b93-9374-7455d2a7480b');

INSERT INTO products_master (id, name, category, unit, selling_price, cost_price, barcode) VALUES ('prod-017', 'Finisher mash 50kg', 'feeds', '50kg', 2, 0.7, 'finishermash_50kg');
INSERT INTO store_inventory (product_id, stock_quantity, reorder_level, store_id) VALUES ('prod-017', 100, 10, '9ddf957b-327f-4b93-9374-7455d2a7480b');

INSERT INTO products_master (id, name, category, unit, selling_price, cost_price, barcode) VALUES ('prod-018', 'Starter crumbs 50kg', 'feeds', '50kg', 2.1, 1.115, 'startercrumbs_50kg');
INSERT INTO store_inventory (product_id, stock_quantity, reorder_level, store_id) VALUES ('prod-018', 100, 10, '9ddf957b-327f-4b93-9374-7455d2a7480b');

INSERT INTO products_master (id, name, category, unit, selling_price, cost_price, barcode) VALUES ('prod-019', 'Starter mash 50kg', 'feeds', '50kg', 1.13, 1.32, 'startermash_50kg');
INSERT INTO store_inventory (product_id, stock_quantity, reorder_level, store_id) VALUES ('prod-019', 100, 10, '9ddf957b-327f-4b93-9374-7455d2a7480b');

INSERT INTO products_master (id, name, category, unit, selling_price, cost_price, barcode) VALUES ('prod-020', 'Chick mash 50kg', 'feeds', '50kg', 3.144, 1.1, 'chickmash_50kg');
INSERT INTO store_inventory (product_id, stock_quantity, reorder_level, store_id) VALUES ('prod-020', 100, 10, '9ddf957b-327f-4b93-9374-7455d2a7480b');

INSERT INTO products_master (id, name, category, unit, selling_price, cost_price, barcode) VALUES ('prod-021', 'Chick mash 20kg', 'feeds', '20kg', 0, 2, 'chickmash_20kg');
INSERT INTO store_inventory (product_id, stock_quantity, reorder_level, store_id) VALUES ('prod-021', 100, 10, '9ddf957b-327f-4b93-9374-7455d2a7480b');

INSERT INTO products_master (id, name, category, unit, selling_price, cost_price, barcode) VALUES ('prod-022', 'Chick mash 10kg', 'feeds', '10kg', 5, 2, 'chickmash_10kg');
INSERT INTO store_inventory (product_id, stock_quantity, reorder_level, store_id) VALUES ('prod-022', 100, 10, '9ddf957b-327f-4b93-9374-7455d2a7480b');

INSERT INTO products_master (id, name, category, unit, selling_price, cost_price, barcode) VALUES ('prod-023', 'Rabbit pellet 50kg', 'feeds', '50kg', 2, 1.4, 'rabbitpellet_50kg');
INSERT INTO store_inventory (product_id, stock_quantity, reorder_level, store_id) VALUES ('prod-023', 100, 10, '9ddf957b-327f-4b93-9374-7455d2a7480b');

INSERT INTO products_master (id, name, category, unit, selling_price, cost_price, barcode) VALUES ('prod-024', 'Nguvu meal 50kg', 'feeds', '50kg', 1, 0, 'nguvumeal_50kg');
INSERT INTO store_inventory (product_id, stock_quantity, reorder_level, store_id) VALUES ('prod-024', 100, 10, '9ddf957b-327f-4b93-9374-7455d2a7480b');

INSERT INTO products_master (id, name, category, unit, selling_price, cost_price, barcode) VALUES ('prod-025', 'Calf pellet 50kg', 'feeds', '50kg', 2.13, 1.135, 'calfpellet_50kg');
INSERT INTO store_inventory (product_id, stock_quantity, reorder_level, store_id) VALUES ('prod-025', 100, 10, '9ddf957b-327f-4b93-9374-7455d2a7480b');

INSERT INTO products_master (id, name, category, unit, selling_price, cost_price, barcode) VALUES ('prod-026', 'Suswa Dog Meal 70kg', 'suppliers', '70kg', 3, 1, 'suswadogmeal_70kg');
INSERT INTO store_inventory (product_id, stock_quantity, reorder_level, store_id) VALUES ('prod-026', 100, 10, '9ddf957b-327f-4b93-9374-7455d2a7480b');

INSERT INTO products_master (id, name, category, unit, selling_price, cost_price, barcode) VALUES ('prod-027', 'Suswa Dog Meal 20kg', 'suppliers', '20kg', 0, 2, 'suswadogmeal_20kg');
INSERT INTO store_inventory (product_id, stock_quantity, reorder_level, store_id) VALUES ('prod-027', 100, 10, '9ddf957b-327f-4b93-9374-7455d2a7480b');

INSERT INTO products_master (id, name, category, unit, selling_price, cost_price, barcode) VALUES ('prod-028', 'Suswa Dog Meal 10kg', 'suppliers', '10kg', 4, 0.9, 'suswadogmeal_10kg');
INSERT INTO store_inventory (product_id, stock_quantity, reorder_level, store_id) VALUES ('prod-028', 100, 10, '9ddf957b-327f-4b93-9374-7455d2a7480b');

INSERT INTO products_master (id, name, category, unit, selling_price, cost_price, barcode) VALUES ('prod-029', 'Suswa Dog Meal 5kg', 'suppliers', '5kg', 6, 3, 'suswadogmeal_5kg');
INSERT INTO store_inventory (product_id, stock_quantity, reorder_level, store_id) VALUES ('prod-029', 100, 10, '9ddf957b-327f-4b93-9374-7455d2a7480b');

INSERT INTO products_master (id, name, category, unit, selling_price, cost_price, barcode) VALUES ('prod-030', 'HappyLand Kienyeji 70kg', 'suppliers', '70kg', 3, 1, 'happylandkienyeji_70kg');
INSERT INTO store_inventory (product_id, stock_quantity, reorder_level, store_id) VALUES ('prod-030', 100, 10, '9ddf957b-327f-4b93-9374-7455d2a7480b');

INSERT INTO products_master (id, name, category, unit, selling_price, cost_price, barcode) VALUES ('prod-031', 'HappyLand Kienyeji 50kg', 'suppliers', '50kg', 0, 3, 'happylandkienyeji_50kg');
INSERT INTO store_inventory (product_id, stock_quantity, reorder_level, store_id) VALUES ('prod-031', 100, 10, '9ddf957b-327f-4b93-9374-7455d2a7480b');

INSERT INTO products_master (id, name, category, unit, selling_price, cost_price, barcode) VALUES ('prod-032', 'HappyLand Kienyeji 20kg', 'suppliers', '20kg', 2, 1.13, 'happylandkienyeji_20kg');
INSERT INTO store_inventory (product_id, stock_quantity, reorder_level, store_id) VALUES ('prod-032', 100, 10, '9ddf957b-327f-4b93-9374-7455d2a7480b');

INSERT INTO products_master (id, name, category, unit, selling_price, cost_price, barcode) VALUES ('prod-033', 'HappyLand Kienyeji 10kg', 'suppliers', '10kg', 4.5, 4, 'happylandkienyeji_10kg');
INSERT INTO store_inventory (product_id, stock_quantity, reorder_level, store_id) VALUES ('prod-033', 100, 10, '9ddf957b-327f-4b93-9374-7455d2a7480b');

INSERT INTO products_master (id, name, category, unit, selling_price, cost_price, barcode) VALUES ('prod-034', 'HappyLand Dog Meal HP 20kg', 'suppliers', '20kg', 0, 0, 'happylanddogmealhp_20kg');
INSERT INTO store_inventory (product_id, stock_quantity, reorder_level, store_id) VALUES ('prod-034', 100, 10, '9ddf957b-327f-4b93-9374-7455d2a7480b');

INSERT INTO products_master (id, name, category, unit, selling_price, cost_price, barcode) VALUES ('prod-035', 'HappyLand Dog Meal HP 10kg', 'suppliers', '10kg', 4, 1, 'happylanddogmealhp_10kg');
INSERT INTO store_inventory (product_id, stock_quantity, reorder_level, store_id) VALUES ('prod-035', 100, 10, '9ddf957b-327f-4b93-9374-7455d2a7480b');

INSERT INTO products_master (id, name, category, unit, selling_price, cost_price, barcode) VALUES ('prod-036', 'Tembo Growers 70kg', 'suppliers', '70kg', 3, 1, 'tembogrowers_70kg');
INSERT INTO store_inventory (product_id, stock_quantity, reorder_level, store_id) VALUES ('prod-036', 100, 10, '9ddf957b-327f-4b93-9374-7455d2a7480b');

INSERT INTO products_master (id, name, category, unit, selling_price, cost_price, barcode) VALUES ('prod-037', 'Tembo Growers 20kg', 'suppliers', '20kg', 2, 1.13, 'tembogrowers_20kg');
INSERT INTO store_inventory (product_id, stock_quantity, reorder_level, store_id) VALUES ('prod-037', 100, 10, '9ddf957b-327f-4b93-9374-7455d2a7480b');

INSERT INTO products_master (id, name, category, unit, selling_price, cost_price, barcode) VALUES ('prod-038', 'Tembo Growers 10kg', 'suppliers', '10kg', 3, 0.2, 'tembogrowers_10kg');
INSERT INTO store_inventory (product_id, stock_quantity, reorder_level, store_id) VALUES ('prod-038', 100, 10, '9ddf957b-327f-4b93-9374-7455d2a7480b');

INSERT INTO products_master (id, name, category, unit, selling_price, cost_price, barcode) VALUES ('prod-039', 'Tembo Growers 5kg', 'suppliers', '5kg', 2, 3, 'tembogrowers_5kg');
INSERT INTO store_inventory (product_id, stock_quantity, reorder_level, store_id) VALUES ('prod-039', 100, 10, '9ddf957b-327f-4b93-9374-7455d2a7480b');

INSERT INTO products_master (id, name, category, unit, selling_price, cost_price, barcode) VALUES ('prod-040', 'Tembo Layers 70kg', 'suppliers', '70kg', 3, 1, 'tembolayers_70kg');
INSERT INTO store_inventory (product_id, stock_quantity, reorder_level, store_id) VALUES ('prod-040', 100, 10, '9ddf957b-327f-4b93-9374-7455d2a7480b');

INSERT INTO products_master (id, name, category, unit, selling_price, cost_price, barcode) VALUES ('prod-041', 'Tembo Layers 20kg', 'suppliers', '20kg', 3, 1, 'tembolayers_20kg');
INSERT INTO store_inventory (product_id, stock_quantity, reorder_level, store_id) VALUES ('prod-041', 100, 10, '9ddf957b-327f-4b93-9374-7455d2a7480b');

INSERT INTO products_master (id, name, category, unit, selling_price, cost_price, barcode) VALUES ('prod-042', 'Tembo Layers 10kg', 'suppliers', '10kg', 3, 1.8, 'tembolayers_10kg');
INSERT INTO store_inventory (product_id, stock_quantity, reorder_level, store_id) VALUES ('prod-042', 100, 10, '9ddf957b-327f-4b93-9374-7455d2a7480b');

INSERT INTO products_master (id, name, category, unit, selling_price, cost_price, barcode) VALUES ('prod-043', 'Tembo Layers 5kg', 'suppliers', '5kg', 7, 2, 'tembolayers_5kg');
INSERT INTO store_inventory (product_id, stock_quantity, reorder_level, store_id) VALUES ('prod-043', 100, 10, '9ddf957b-327f-4b93-9374-7455d2a7480b');

INSERT INTO products_master (id, name, category, unit, selling_price, cost_price, barcode) VALUES ('prod-044', 'Tembo Dairy Meal 70kg', 'suppliers', '70kg', 3, 1, 'tembodairymeal_70kg');
INSERT INTO store_inventory (product_id, stock_quantity, reorder_level, store_id) VALUES ('prod-044', 100, 10, '9ddf957b-327f-4b93-9374-7455d2a7480b');

INSERT INTO products_master (id, name, category, unit, selling_price, cost_price, barcode) VALUES ('prod-045', 'Tembo Dairy Meal 20kg', 'suppliers', '20kg', 7, 1, 'tembodairymeal_20kg');
INSERT INTO store_inventory (product_id, stock_quantity, reorder_level, store_id) VALUES ('prod-045', 100, 10, '9ddf957b-327f-4b93-9374-7455d2a7480b');

INSERT INTO products_master (id, name, category, unit, selling_price, cost_price, barcode) VALUES ('prod-046', 'Tembo Dairy Meal 10kg', 'suppliers', '10kg', 6, 1, 'tembodairymeal_10kg');
INSERT INTO store_inventory (product_id, stock_quantity, reorder_level, store_id) VALUES ('prod-046', 100, 10, '9ddf957b-327f-4b93-9374-7455d2a7480b');

INSERT INTO products_master (id, name, category, unit, selling_price, cost_price, barcode) VALUES ('prod-047', 'Tembo Kienyeji 70kg', 'suppliers', '70kg', 2.45, 2, 'tembokienyeji_70kg');
INSERT INTO store_inventory (product_id, stock_quantity, reorder_level, store_id) VALUES ('prod-047', 100, 10, '9ddf957b-327f-4b93-9374-7455d2a7480b');

INSERT INTO products_master (id, name, category, unit, selling_price, cost_price, barcode) VALUES ('prod-048', 'Tembo Kienyeji 20kg', 'suppliers', '20kg', 6, 2, 'tembokienyeji_20kg');
INSERT INTO store_inventory (product_id, stock_quantity, reorder_level, store_id) VALUES ('prod-048', 100, 10, '9ddf957b-327f-4b93-9374-7455d2a7480b');

INSERT INTO products_master (id, name, category, unit, selling_price, cost_price, barcode) VALUES ('prod-049', 'Tembo Kienyeji 10kg', 'suppliers', '10kg', 10, 2.7, 'tembokienyeji_10kg');
INSERT INTO store_inventory (product_id, stock_quantity, reorder_level, store_id) VALUES ('prod-049', 100, 10, '9ddf957b-327f-4b93-9374-7455d2a7480b');

INSERT INTO products_master (id, name, category, unit, selling_price, cost_price, barcode) VALUES ('prod-050', 'Tembo Kienyeji 5kg', 'suppliers', '5kg', 9, 2, 'tembokienyeji_5kg');
INSERT INTO store_inventory (product_id, stock_quantity, reorder_level, store_id) VALUES ('prod-050', 100, 10, '9ddf957b-327f-4b93-9374-7455d2a7480b');
