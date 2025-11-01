export interface Product {
  id: string;
  name: string;
  category: string;
  unit: string;
  selling_price: number;
  cost_price: number;
  stock_quantity: number;
  reorder_level: number;
  barcode?: string;
  store_id: string;
  product_id?: string; // The products_master.id (when needed for relationships)
  created_at: string;
  updated_at: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  credit_limit: number;
  outstanding_balance: number;
  created_at: string;
}

export interface Sale {
  id: string;
  customer_id: string | null;
  total_amount: number;
  payment_method: 'cash' | 'mpesa' | 'credit';
  status: 'synced' | 'pending';
  timestamp: string;
  store_id: string;
  items: SaleItem[];
}

export interface SaleItem {
  id: string;
  sale_id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  total_line: number;
}

export interface PendingOrder {
  id: string;
  raw_message: string;
  assigned_customer_id: string | null;
  status: 'pending' | 'confirmed' | 'ignored';
  created_at: string;
}

export interface User {
  id: string;
  username: string;
  full_name: string;
  role: 'admin' | 'cashier';
}

export interface CartItem {
  product: Product;
  quantity: number;
  total: number;
}

export interface SyncStatus {
  isOnline: boolean;
  pendingSales: number;
  lastSync: string | null;
}