import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Product, Customer, Sale, CartItem, User, SyncStatus, PendingOrder } from '@/types';
import { mockProducts, mockCustomers, mockPendingOrders, mockUsers } from '@/data/mockData';
import { offlineManager } from '@/lib/db';

interface StoreState {
  // Auth
  currentUser: User | null;
  isAuthenticated: boolean;
  
  // Data
  products: Product[];
  customers: Customer[];
  sales: Sale[];
  pendingOrders: PendingOrder[];
  
  // POS
  cart: CartItem[];
  selectedCustomer: Customer | null;
  
  // Sync
  syncStatus: SyncStatus;
  
  // Actions
  login: (username: string, password: string) => boolean;
  logout: () => void;
  
  // Cart actions
  addToCart: (product: Product, quantity: number) => void;
  removeFromCart: (productId: string) => void;
  updateCartQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  setSelectedCustomer: (customer: Customer | null) => void;
  
  // Sales actions
  completeSale: (paymentMethod: 'cash' | 'mpesa' | 'credit') => string | null;
  
  // Inventory actions
  updateStock: (productId: string, newQuantity: number) => void;
  addProduct: (product: Product) => void;
  
  // Customer actions
  addCustomer: (customer: Omit<Customer, 'id' | 'created_at'>) => void;
  updateCustomerBalance: (customerId: string, amount: number) => void;
  
  // Orders actions
  confirmOrder: (orderId: string, saleItems: { productId: string; quantity: number }[]) => void;
  ignoreOrder: (orderId: string) => void;
  
  // Sync actions
  setSyncStatus: (status: Partial<SyncStatus>) => void;
  forceSync: () => Promise<void>;
  
  // Category actions
  addCategory: (categoryName: string) => void;
  removeCategory: (categoryName: string) => void;
}

export const useStore = create<StoreState>()(
  persist(
    (set, get) => {
      // Initialize offline manager
      offlineManager.addStatusListener((isOnline) => {
        set({ syncStatus: { ...get().syncStatus, isOnline } });
        if (isOnline) {
          // Update pending sales count when coming online
          offlineManager.getPendingSalesCount().then(count => {
            set({ syncStatus: { ...get().syncStatus, pendingSales: count } });
          });
        }
      });

      return {
      // Initial state
      currentUser: null,
      isAuthenticated: false,
      products: mockProducts,
      customers: mockCustomers,
      sales: [],
      pendingOrders: mockPendingOrders,
      cart: [],
      selectedCustomer: mockCustomers[0], // Walk-in customer by default
      syncStatus: {
        isOnline: offlineManager.getOnlineStatus(),
        pendingSales: 0,
        lastSync: null
      },
      
      // Auth actions
      login: (username: string, password: string) => {
        const user = mockUsers.find(u => u.username === username);
        if (user && password === 'password') { // Simple demo auth
          set({ currentUser: user, isAuthenticated: true });
          return true;
        }
        return false;
      },
      
      logout: () => {
        set({ currentUser: null, isAuthenticated: false });
      },
      
      // Cart actions
      addToCart: (product: Product, quantity: number) => {
        const { cart } = get();
        const existingItem = cart.find(item => item.product.id === product.id);
        
        if (existingItem) {
          set({
            cart: cart.map(item =>
              item.product.id === product.id
                ? { ...item, quantity: item.quantity + quantity, total: (item.quantity + quantity) * product.selling_price }
                : item
            )
          });
        } else {
          set({
            cart: [...cart, {
              product,
              quantity,
              total: quantity * product.selling_price
            }]
          });
        }
      },
      
      removeFromCart: (productId: string) => {
        const { cart } = get();
        set({ cart: cart.filter(item => item.product.id !== productId) });
      },
      
      updateCartQuantity: (productId: string, quantity: number) => {
        const { cart } = get();
        if (quantity <= 0) {
          get().removeFromCart(productId);
          return;
        }
        set({
          cart: cart.map(item =>
            item.product.id === productId
              ? { ...item, quantity, total: quantity * item.product.selling_price }
              : item
          )
        });
      },
      
      clearCart: () => {
        set({ cart: [], selectedCustomer: mockCustomers[0] });
      },
      
      setSelectedCustomer: (customer: Customer | null) => {
        set({ selectedCustomer: customer });
      },
      
      // Sales actions
      completeSale: (paymentMethod: 'cash' | 'mpesa' | 'credit') => {
        const { cart, selectedCustomer, products, customers } = get();
        
        if (cart.length === 0) return null;
        
        const totalAmount = cart.reduce((sum, item) => sum + item.total, 0);
        
        // Validate credit sale
        if (paymentMethod === 'credit') {
          if (!selectedCustomer || selectedCustomer.id === 'walk-in') {
            return 'Credit sales require a registered customer';
          }
          if (selectedCustomer.outstanding_balance + totalAmount > selectedCustomer.credit_limit) {
            return 'Sale exceeds customer credit limit';
          }
        }
        
        const saleId = Date.now().toString();
        const sale: Sale = {
          id: saleId,
          customer_id: selectedCustomer?.id || null,
          total_amount: totalAmount,
          payment_method: paymentMethod,
          status: 'pending',
          timestamp: new Date().toISOString(),
          items: cart.map(item => ({
            id: Date.now().toString() + Math.random(),
            sale_id: saleId,
            product_id: item.product.id,
            product_name: item.product.name,
            quantity: item.quantity,
            unit_price: item.product.selling_price,
            total_line: item.total
          }))
        };
        
        // Update stock
        const updatedProducts = products.map(product => {
          const cartItem = cart.find(item => item.product.id === product.id);
          if (cartItem) {
            return {
              ...product,
              stock_quantity: product.stock_quantity - cartItem.quantity
            };
          }
          return product;
        });
        
        // Update customer balance if credit sale
        let updatedCustomers = customers;
        if (paymentMethod === 'credit' && selectedCustomer) {
          updatedCustomers = customers.map(customer =>
            customer.id === selectedCustomer.id
              ? { ...customer, outstanding_balance: customer.outstanding_balance + totalAmount }
              : customer
          );
        }
        
        // Queue sale for offline sync if needed
        if (!offlineManager.getOnlineStatus()) {
          offlineManager.queueSale(sale);
        }
        
        set({
          sales: [...get().sales, sale],
          products: updatedProducts,
          customers: updatedCustomers,
          cart: [],
          selectedCustomer: mockCustomers[0],
          syncStatus: { 
            ...get().syncStatus, 
            pendingSales: offlineManager.getOnlineStatus() ? get().syncStatus.pendingSales : get().syncStatus.pendingSales + 1
          }
        });
        
        // Cache updated data offline
        offlineManager.cacheData(updatedProducts, updatedCustomers, [...get().sales, sale], get().syncStatus);
        
        return null; // Success
      },
      
      // Inventory actions
      updateStock: (productId: string, newQuantity: number) => {
        const { products } = get();
        set({
          products: products.map(product =>
            product.id === productId
              ? { ...product, stock_quantity: newQuantity, updated_at: new Date().toISOString() }
              : product
          )
        });
      },

      addProduct: (product: Product) => {
        set({ products: [...get().products, product] });
      },
      
      // Customer actions
      addCustomer: (customerData) => {
        const newCustomer: Customer = {
          ...customerData,
          id: Date.now().toString(),
          created_at: new Date().toISOString()
        };
        set({ customers: [...get().customers, newCustomer] });
      },
      
      updateCustomerBalance: (customerId: string, amount: number) => {
        const { customers } = get();
        set({
          customers: customers.map(customer =>
            customer.id === customerId
              ? { ...customer, outstanding_balance: Math.max(0, customer.outstanding_balance + amount) }
              : customer
          )
        });
      },
      
      // Orders actions
      confirmOrder: (orderId: string, saleItems: { productId: string; quantity: number }[]) => {
        const { pendingOrders, products } = get();
        const order = pendingOrders.find(o => o.id === orderId);
        
        if (order) {
          // Create a sale from the order
          const totalAmount = saleItems.reduce((sum, item) => {
            const product = products.find(p => p.id === item.productId);
            return sum + (product ? product.selling_price * item.quantity : 0);
          }, 0);
          
          const saleId = Date.now().toString();
          const sale: Sale = {
            id: saleId,
            customer_id: order.assigned_customer_id,
            total_amount: totalAmount,
            payment_method: 'credit', // WhatsApp orders default to credit
            status: 'pending',
            timestamp: new Date().toISOString(),
            items: saleItems.map(item => {
              const product = products.find(p => p.id === item.productId)!;
              return {
                id: Date.now().toString() + Math.random(),
                sale_id: saleId,
                product_id: product.id,
                product_name: product.name,
                quantity: item.quantity,
                unit_price: product.selling_price,
                total_line: product.selling_price * item.quantity
              };
            })
          };
          
          // Update stock
          const updatedProducts = products.map(product => {
            const saleItem = saleItems.find(item => item.productId === product.id);
            if (saleItem) {
              return {
                ...product,
                stock_quantity: product.stock_quantity - saleItem.quantity
              };
            }
            return product;
          });
          
          set({
            sales: [...get().sales, sale],
            products: updatedProducts,
            pendingOrders: pendingOrders.map(o =>
              o.id === orderId ? { ...o, status: 'confirmed' as const } : o
            )
          });
        }
      },
      
      ignoreOrder: (orderId: string) => {
        const { pendingOrders } = get();
        set({
          pendingOrders: pendingOrders.map(o =>
            o.id === orderId ? { ...o, status: 'ignored' as const } : o
          )
        });
      },
      
      // Sync actions
      setSyncStatus: (status: Partial<SyncStatus>) => {
        set({ syncStatus: { ...get().syncStatus, ...status } });
      },
      
      forceSync: async () => {
        try {
          await offlineManager.forcSync();
          const pendingCount = await offlineManager.getPendingSalesCount();
          set({ 
            syncStatus: { 
              ...get().syncStatus, 
              pendingSales: pendingCount,
              lastSync: new Date().toISOString()
            } 
          });
        } catch (error) {
          console.error('Sync failed:', error);
          throw error;
        }
      },
      
      // Category actions
      addCategory: (categoryName: string) => {
        // Categories are managed through products, no separate storage needed
        // This is a placeholder for future category-specific logic
      },
      
      removeCategory: (categoryName: string) => {
        // Categories are managed through products, no separate storage needed
        // This is a placeholder for future category-specific logic
      }
      };
    },
    {
      name: 'wakulima-agrovet-store',
      partialize: (state) => ({
        products: state.products,
        customers: state.customers,
        sales: state.sales,
        pendingOrders: state.pendingOrders,
        syncStatus: state.syncStatus
      })
    }
  )
);