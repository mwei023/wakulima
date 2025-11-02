-- Drop the existing unique constraint on barcode
ALTER TABLE public.products_master DROP CONSTRAINT IF EXISTS unique_products_master_barcode;

-- Create a new unique constraint that allows multiple NULL values
-- This is done by creating a unique index with a WHERE clause
CREATE UNIQUE INDEX unique_products_master_barcode_not_null 
ON public.products_master (barcode) 
WHERE barcode IS NOT NULL;