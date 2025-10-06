-- Update sales insert policy to ensure users can only create sales for themselves
-- Drop existing policy
DROP POLICY IF EXISTS "Sales insert by authenticated" ON public.sales;

-- Create new policy with proper check
CREATE POLICY "Sales insert by authenticated" ON public.sales
FOR INSERT TO authenticated
WITH CHECK (created_by = auth.uid());
