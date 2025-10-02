import { Product, Customer, PendingOrder, User } from '@/types';

export const mockProducts: Product[] = [
  {
    id: '1',
    name: 'Dairy Meal 70kg',
    category: 'Animal Feed',
    unit: 'bag',
    selling_price: 3500,
    cost_price: 3200,
    stock_quantity: 25,
    reorder_level: 10,
    created_at: '2024-01-01',
    updated_at: '2024-01-01'
  },
  {
    id: '2',
    name: 'Chick Mash 50kg',
    category: 'Animal Feed',
    unit: 'bag',
    selling_price: 4200,
    cost_price: 3800,
    stock_quantity: 8,
    reorder_level: 15,
    created_at: '2024-01-01',
    updated_at: '2024-01-01'
  },
  {
    id: '3',
    name: 'Layers Mash 70kg',
    category: 'Animal Feed',
    unit: 'bag',
    selling_price: 3800,
    cost_price: 3400,
    stock_quantity: 30,
    reorder_level: 12,
    created_at: '2024-01-01',
    updated_at: '2024-01-01'
  },
  {
    id: '4',
    name: 'NPK Fertilizer 50kg',
    category: 'Fertilizer',
    unit: 'bag',
    selling_price: 5500,
    cost_price: 4800,
    stock_quantity: 15,
    reorder_level: 8,
    created_at: '2024-01-01',
    updated_at: '2024-01-01'
  },
  {
    id: '5',
    name: 'DAP Fertilizer 50kg',
    category: 'Fertilizer', 
    unit: 'bag',
    selling_price: 6200,
    cost_price: 5500,
    stock_quantity: 12,
    reorder_level: 6,
    created_at: '2024-01-01',
    updated_at: '2024-01-01'
  },
  {
    id: '6',
    name: 'Terramycin Eye Ointment',
    category: 'Vet Medicine',
    unit: 'piece',
    selling_price: 450,
    cost_price: 350,
    stock_quantity: 5,
    reorder_level: 20,
    created_at: '2024-01-01',
    updated_at: '2024-01-01'
  },
  {
    id: '7',
    name: 'Dewormer - Albendazole',
    category: 'Vet Medicine',
    unit: 'bottle',
    selling_price: 680,
    cost_price: 520,
    stock_quantity: 18,
    reorder_level: 10,
    created_at: '2024-01-01',
    updated_at: '2024-01-01'
  }
];

export const mockCustomers: Customer[] = [
  {
    id: 'walk-in',
    name: 'Walk-in Customer',
    phone: '',
    credit_limit: 0,
    outstanding_balance: 0,
    created_at: '2024-01-01'
  },
  {
    id: '2',
    name: 'John Kamau',
    phone: '+254712345678',
    credit_limit: 50000,
    outstanding_balance: 12500,
    created_at: '2024-01-15'
  },
  {
    id: '3',
    name: 'Mary Wanjiku',
    phone: '+254723456789',
    credit_limit: 30000,
    outstanding_balance: 8750,
    created_at: '2024-01-20'
  },
  {
    id: '4',
    name: 'Peter Mwangi',
    phone: '+254734567890',
    credit_limit: 75000,
    outstanding_balance: 0,
    created_at: '2024-02-01'
  },
  {
    id: '5',
    name: 'Grace Nyokabi',
    phone: '+254745678901',
    credit_limit: 25000,
    outstanding_balance: 18750,
    created_at: '2024-02-10'
  }
];

export const mockPendingOrders: PendingOrder[] = [
  {
    id: '1',
    raw_message: 'Hi Samuel, I need 2 bags of dairy meal and 1 bag of layers mash. Can you deliver to Kiserian market? - John',
    assigned_customer_id: '2',
    status: 'pending',
    created_at: '2024-03-15T10:30:00'
  },
  {
    id: '2', 
    raw_message: 'Good morning. Do you have NPK fertilizer in stock? I need 3 bags urgently. Thanks - Mary',
    assigned_customer_id: '3',
    status: 'pending',
    created_at: '2024-03-15T08:15:00'
  },
  {
    id: '3',
    raw_message: 'Halo, nataka dewormer for my goats. How much is it?',
    assigned_customer_id: null,
    status: 'pending',
    created_at: '2024-03-15T14:45:00'
  }
];

export const mockUsers: User[] = [
  {
    id: '1',
    username: 'samuel',
    full_name: 'Samuel Kiprotich',
    role: 'admin'
  },
  {
    id: '2',
    username: 'grace',
    full_name: 'Grace Wanjiru',
    role: 'cashier'
  }
];