-- Drop the old foreign key constraint
ALTER TABLE sale_items 
DROP CONSTRAINT IF EXISTS sale_items_product_id_fkey;

-- Add new foreign key constraint pointing to store_inventory table
-- (since the products view returns store_inventory.id as the product id)
ALTER TABLE sale_items 
ADD CONSTRAINT sale_items_product_id_fkey 
FOREIGN KEY (product_id) 
REFERENCES store_inventory(id) 
ON DELETE CASCADE;