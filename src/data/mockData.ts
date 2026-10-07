import { Product, Customer, PendingOrder, User } from '@/types';

export const mockProducts: Product[] = [
  {
    id: '1',
    name: 'Dairy Meal 70kg',
    category: 'Animal Feed',
    unit: 'bag',
    // Integer cents (KES × 100): KSh 35.00 / KSh 32.00.
    selling_price: 350000,
    cost_price: 320000,
    stock_quantity: 25,
    reorder_level: 10,
    store_id: '9ddf957b-327f-4b93-9374-7455d2a7480b',
    created_at: '2024-01-01',
    updated_at: '2024-01-01'
  },
  {
    id: '2',
    name: 'Chick Mash 50kg',
    category: 'Animal Feed',
    unit: 'bag',
    // Integer cents: KSh 42.00 / KSh 38.00.
    selling_price: 420000,
    cost_price: 380000,
    stock_quantity: 8,
    reorder_level: 15,
    store_id: '9ddf957b-327f-4b93-9374-7455d2a7480b',
    created_at: '2024-01-01',
    updated_at: '2024-01-01'
  },
  {
    id: '3',
    name: 'Layers Mash 70kg',
    category: 'Animal Feed',
    unit: 'bag',
    selling_price: 380000,
    cost_price: 340000,
    stock_quantity: 30,
    reorder_level: 12,
    store_id: '9ddf957b-327f-4b93-9374-7455d2a7480b',
    created_at: '2024-01-01',
    updated_at: '2024-01-01'
  },
  {
    id: '4',
    name: 'NPK Fertilizer 50kg',
    category: 'Fertilizer',
    unit: 'bag',
    selling_price: 550000,
    cost_price: 480000,
    stock_quantity: 15,
    reorder_level: 8,
    store_id: '9ddf957b-327f-4b93-9374-7455d2a7480b',
    created_at: '2024-01-01',
    updated_at: '2024-01-01'
  },
  {
    id: '5',
    name: 'DAP Fertilizer 50kg',
    category: 'Fertilizer', 
    unit: 'bag',
    selling_price: 620000,
    cost_price: 550000,
    stock_quantity: 12,
    reorder_level: 6,
    store_id: '9ddf957b-327f-4b93-9374-7455d2a7480b',
    created_at: '2024-01-01',
    updated_at: '2024-01-01'
  },
  {
    id: '6',
    name: 'Terramycin Eye Ointment',
    category: 'Vet Medicine',
    unit: 'piece',
    selling_price: 45000,
    cost_price: 35000,
    stock_quantity: 5,
    reorder_level: 20,
    store_id: '9ddf957b-327f-4b93-9374-7455d2a7480b',
    created_at: '2024-01-01',
    updated_at: '2024-01-01'
  },
  {
    id: '7',
    name: 'Dewormer - Albendazole',
    category: 'Vet Medicine',
    unit: 'bottle',
    selling_price: 68000,
    cost_price: 52000,
    stock_quantity: 18,
    reorder_level: 10,
    store_id: '9ddf957b-327f-4b93-9374-7455d2a7480b',
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
    // Integer cents: limits 500.00 / balance 125.00.
    credit_limit: 5000000,
    outstanding_balance: 1250000,
    created_at: '2024-01-15'
  },
  {
    id: '3',
    name: 'Mary Wanjiku',
    phone: '+254723456789',
    credit_limit: 3000000,
    outstanding_balance: 875000,
    created_at: '2024-01-20'
  },
  {
    id: '4',
    name: 'Peter Mwangi',
    phone: '+254734567890',
    credit_limit: 7500000,
    outstanding_balance: 0,
    created_at: '2024-02-01'
  },
  {
    id: '5',
    name: 'Grace Nyokabi',
    phone: '+254745678901',
    credit_limit: 2500000,
    outstanding_balance: 1875000,
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