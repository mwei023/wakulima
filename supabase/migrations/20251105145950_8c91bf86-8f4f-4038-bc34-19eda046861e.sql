-- Create audit_logs table for tracking all sensitive operations
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  action text NOT NULL,
  table_name text NOT NULL,
  record_id text,
  old_values jsonb,
  new_values jsonb,
  ip_address text,
  user_agent text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Enable RLS
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Admins can view all audit logs
CREATE POLICY "Admins can view audit logs"
ON public.audit_logs
FOR SELECT
USING (has_role(auth.uid(), 'admin'));

-- System can insert audit logs (security definer functions will handle this)
CREATE POLICY "System can insert audit logs"
ON public.audit_logs
FOR INSERT
WITH CHECK (true);

-- Create index for performance
CREATE INDEX idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX idx_audit_logs_created_at ON public.audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_table_name ON public.audit_logs(table_name);

-- Create stock_transfers table
CREATE TABLE public.stock_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_store_id uuid REFERENCES public.stores(id) NOT NULL,
  to_store_id uuid REFERENCES public.stores(id) NOT NULL,
  product_id uuid REFERENCES public.products_master(id) NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'in_transit', 'completed', 'cancelled')),
  requested_by uuid REFERENCES auth.users(id) NOT NULL,
  approved_by uuid REFERENCES auth.users(id),
  notes text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  completed_at timestamp with time zone,
  CONSTRAINT different_stores CHECK (from_store_id != to_store_id)
);

-- Enable RLS
ALTER TABLE public.stock_transfers ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY "Admins can manage transfers"
ON public.stock_transfers
FOR ALL
USING (has_role(auth.uid(), 'admin'));

-- Cashiers can view transfers for their stores
CREATE POLICY "Cashiers can view store transfers"
ON public.stock_transfers
FOR SELECT
USING (
  has_role(auth.uid(), 'cashier') AND (
    user_has_store_access(auth.uid(), from_store_id) OR 
    user_has_store_access(auth.uid(), to_store_id)
  )
);

-- Cashiers can create transfers from their stores
CREATE POLICY "Cashiers can create transfers"
ON public.stock_transfers
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'cashier') AND 
  user_has_store_access(auth.uid(), from_store_id)
);

-- Create index
CREATE INDEX idx_stock_transfers_from_store ON public.stock_transfers(from_store_id);
CREATE INDEX idx_stock_transfers_to_store ON public.stock_transfers(to_store_id);
CREATE INDEX idx_stock_transfers_status ON public.stock_transfers(status);

-- Create returns table
CREATE TABLE public.returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid REFERENCES public.sales(id) NOT NULL,
  product_id uuid REFERENCES public.products_master(id) NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  reason text NOT NULL,
  return_type text NOT NULL CHECK (return_type IN ('refund', 'exchange', 'credit')),
  refund_amount numeric(10, 2) NOT NULL CHECK (refund_amount >= 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'completed')),
  processed_by uuid REFERENCES auth.users(id),
  store_id uuid REFERENCES public.stores(id) NOT NULL,
  notes text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  completed_at timestamp with time zone
);

-- Enable RLS
ALTER TABLE public.returns ENABLE ROW LEVEL SECURITY;

-- Admins can manage all returns
CREATE POLICY "Admins can manage returns"
ON public.returns
FOR ALL
USING (has_role(auth.uid(), 'admin'));

-- Cashiers can view returns for their store
CREATE POLICY "Cashiers can view store returns"
ON public.returns
FOR SELECT
USING (
  has_role(auth.uid(), 'cashier') AND 
  user_has_store_access(auth.uid(), store_id)
);

-- Cashiers can create returns for their store
CREATE POLICY "Cashiers can create returns"
ON public.returns
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'cashier') AND 
  user_has_store_access(auth.uid(), store_id)
);

-- Create index
CREATE INDEX idx_returns_sale_id ON public.returns(sale_id);
CREATE INDEX idx_returns_store_id ON public.returns(store_id);
CREATE INDEX idx_returns_status ON public.returns(status);

-- Create failed_login_attempts table for security
CREATE TABLE public.failed_login_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  ip_address text,
  user_agent text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Enable RLS
ALTER TABLE public.failed_login_attempts ENABLE ROW LEVEL SECURITY;

-- Only admins can view failed login attempts
CREATE POLICY "Admins can view failed logins"
ON public.failed_login_attempts
FOR SELECT
USING (has_role(auth.uid(), 'admin'));

-- Anyone can insert (for tracking)
CREATE POLICY "System can insert failed logins"
ON public.failed_login_attempts
FOR INSERT
WITH CHECK (true);

-- Create index
CREATE INDEX idx_failed_logins_email ON public.failed_login_attempts(email);
CREATE INDEX idx_failed_logins_created_at ON public.failed_login_attempts(created_at DESC);

-- Create notification_preferences table
CREATE TABLE public.notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) UNIQUE NOT NULL,
  email_notifications boolean DEFAULT true,
  sms_notifications boolean DEFAULT false,
  low_stock_alerts boolean DEFAULT true,
  daily_reports boolean DEFAULT false,
  weekly_reports boolean DEFAULT false,
  phone_number text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Enable RLS
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

-- Users can view and update their own preferences
CREATE POLICY "Users can view own preferences"
ON public.notification_preferences
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own preferences"
ON public.notification_preferences
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own preferences"
ON public.notification_preferences
FOR UPDATE
USING (auth.uid() = user_id);

-- Admins can view all
CREATE POLICY "Admins can view all preferences"
ON public.notification_preferences
FOR SELECT
USING (has_role(auth.uid(), 'admin'));

-- Add updated_at triggers
CREATE TRIGGER update_stock_transfers_updated_at
BEFORE UPDATE ON public.stock_transfers
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_returns_updated_at
BEFORE UPDATE ON public.returns
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_notification_preferences_updated_at
BEFORE UPDATE ON public.notification_preferences
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();