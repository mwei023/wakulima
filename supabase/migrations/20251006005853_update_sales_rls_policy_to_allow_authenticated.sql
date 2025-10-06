-- Update sales insert policy to allow authenticated users to create sales
-- Drop existing policy
DROP POLICY IF EXISTS "Sales insert by authenticated" ON public.sales;

-- Create new policy allowing authenticated users to insert
CREATE POLICY "Sales insert by authenticated" ON public.sales
FOR INSERT TO authenticated
WITH CHECK (true);
