import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Product, Customer, Sale, CartItem, User, SyncStatus, PendingOrder, Store } from '@/types';
import { mockProducts, mockCustomers, mockPendingOrders, mockUsers } from '@/data/mockData';
import { offlineManager } from '@/lib/db';
import { supabase } from '@/integrations/supabase/client';

interface StoreState {
  // Data
  stores: Store[];
  selectedStoreId: string | 'all';
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
  loadData: () => Promise<void>;
  setSelectedStore: (storeId: string | 'all') => void;
  addStore: (name: string, location: string) => Promise<void>;
  
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
  addProduct: (product: Product) => Promise<void>;
  updateProduct: (product: Product) => Promise<void>;
  
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
  addCategory: (categoryName: string) => Promise<void>;
  removeCategory: (categoryName: string) => Promise<void>;
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
      stores: [],
      selectedStoreId: 'all',
      products: [],
      customers: [],
      sales: [],
      pendingOrders: [],
      cart: [],
      selectedCustomer: null,
      syncStatus: {
        isOnline: offlineManager.getOnlineStatus(),
        pendingSales: 0,
        lastSync: null
      },
      
      // Data loading
      loadData: async () => {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          
          // Load user's accessible stores
          const { data: userStores } = await supabase
            .from('user_stores')
            .select('store_id, stores(*)')
            .eq('user_id', user?.id);
          
          const stores = userStores?.map(us => us.stores).filter(Boolean) || [];
          
          // If no stores, load all stores (admin)
          if (stores.length === 0) {
            const { data: allStores } = await supabase.from('stores').select('*');
            stores.push(...(allStores || []));
          }
          
          // Load products by joining products_master with store_inventory
          const { data: inventoryData } = await supabase
            .from('store_inventory')
            .select(`
              id,
              stock_quantity,
              reorder_level,
              store_id,
              created_at,
              updated_at,
              products_master (
                id,
                name,
                category,
                unit,
                selling_price,
                cost_price,
                barcode
              )
            `);
          
          // Transform to Product format
          const products: Product[] = inventoryData?.map(inv => ({
            id: inv.products_master.id,
            name: inv.products_master.name,
            category: inv.products_master.category,
            unit: inv.products_master.unit,
            selling_price: inv.products_master.selling_price,
            cost_price: inv.products_master.cost_price,
            barcode: inv.products_master.barcode || '',
            stock_quantity: inv.stock_quantity,
            reorder_level: inv.reorder_level,
            store_id: inv.store_id,
            created_at: inv.created_at,
            updated_at: inv.updated_at
          })) || [];
          
          const { data: customers } = await supabase.from('customers').select('*');
          const { data: sales } = await supabase.from('sales').select(`
            *,
            sale_items (*)
          `);
          const { data: pendingOrders } = await supabase.from('pending_orders').select('*');
          
          // Transform sales data to match interface
          const transformedSales = sales?.map(sale => ({
            ...sale,
            items: sale.sale_items || []
          })) || [];
          
          // Preserve current store selection or set default only on first load
          const currentStoreId = get().selectedStoreId;
          const defaultStoreId = currentStoreId || (stores.length === 1 ? stores[0].id : 'all');
          
          set({
            stores: stores,
            selectedStoreId: defaultStoreId,
            products: products || [],
            customers: customers || [],
            sales: transformedSales,
            pendingOrders: pendingOrders || [],
            selectedCustomer: customers?.[0] || null
          });
        } catch (error) {
          console.error('Error loading data:', error);
          // Fallback to mock data
          set({
            stores: [],
            selectedStoreId: 'all',
            products: mockProducts,
            customers: mockCustomers,
            sales: [],
            pendingOrders: mockPendingOrders,
            selectedCustomer: mockCustomers[0]
          });
        }
      },
      
      setSelectedStore: (storeId: string | 'all') => {
        // Clear cart when switching stores
        set({ 
          selectedStoreId: storeId,
          cart: []
        });
      },
      
      addStore: async (name: string, location: string) => {
        const { data, error } = await supabase
          .from('stores')
          .insert([{ name, location }])
          .select()
          .single();
        
        if (error) {
          console.error('Error adding store:', error);
          throw error;
        }
        
        set({ stores: [...get().stores, data] });
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
        const { customers } = get();
        set({ cart: [], selectedCustomer: customers[0] || null });
      },
      
      setSelectedCustomer: (customer: Customer | null) => {
        set({ selectedCustomer: customer });
      },
      
      // Sales actions
      completeSale: (paymentMethod: 'cash' | 'mpesa' | 'credit') => {
        const { cart, selectedCustomer, products, customers, selectedStoreId } = get();
        
        // Validate store selection
        if (selectedStoreId === 'all') {
          return 'Please select a specific store to complete the sale';
        }
        
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
        
        const saleId = crypto.randomUUID();
        const sale: Sale = {
          id: saleId,
          customer_id: selectedCustomer?.id || null,
          store_id: selectedStoreId,
          total_amount: totalAmount,
          payment_method: paymentMethod,
          status: 'pending',
          timestamp: new Date().toISOString(),
          items: cart.map(item => ({
            id: crypto.randomUUID(),
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
        
        // Save to Supabase
        const saveSale = async () => {
          try {
            const { data: saleData, error: saleError } = await supabase
              .from('sales')
              .insert([{
                id: sale.id,
                customer_id: sale.customer_id,
                store_id: sale.store_id,
                total_amount: sale.total_amount,
                payment_method: sale.payment_method,
                status: 'pending',
                timestamp: sale.timestamp
              }])
              .select()
              .single();

            if (saleError) throw saleError;

            // Insert sale items
            const { error: itemsError } = await supabase
              .from('sale_items')
              .insert(sale.items.map(item => ({
                sale_id: sale.id,
                product_id: item.product_id,
                product_name: item.product_name,
                quantity: item.quantity,
                unit_price: item.unit_price,
                total_line: item.total_line
              })));

            if (itemsError) throw itemsError;

            // Update store inventory stock
            for (const item of cart) {
              const newQuantity = updatedProducts.find(p => p.id === item.product.id)?.stock_quantity;
              const { error: stockError } = await supabase
                .from('store_inventory')
                .update({ 
                  stock_quantity: newQuantity,
                  updated_at: new Date().toISOString()
                })
                .eq('product_id', item.product.id)
                .eq('store_id', selectedStoreId);
              
              if (stockError) throw stockError;
            }

            // Update customer balance if credit
            if (paymentMethod === 'credit' && selectedCustomer) {
              const { error: customerError } = await supabase
                .from('customers')
                .update({ 
                  outstanding_balance: selectedCustomer.outstanding_balance + totalAmount 
                })
                .eq('id', selectedCustomer.id);
              
              if (customerError) throw customerError;
            }
          } catch (error) {
            console.error('Error saving sale:', error);
            // Queue for offline sync
            offlineManager.queueSale(sale);
          }
        };

        saveSale().then(() => {
          // Refresh from server to reflect persisted stock and sale items
          get().loadData().catch((e) => console.error('Reload after sale failed:', e));
        });
        
        set({
          sales: [...get().sales, sale],
          products: updatedProducts,
          customers: updatedCustomers,
          cart: [],
          selectedCustomer: get().customers[0] || null,
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
        const { products, selectedStoreId } = get();
        const updatedProducts = products.map(product =>
          product.id === productId && product.store_id === selectedStoreId
            ? { ...product, stock_quantity: newQuantity, updated_at: new Date().toISOString() }
            : product
        );
        
        set({ products: updatedProducts });
        
        // Update in Supabase store_inventory
        supabase
          .from('store_inventory')
          .update({ stock_quantity: newQuantity, updated_at: new Date().toISOString() })
          .eq('product_id', productId)
          .eq('store_id', selectedStoreId)
          .then(({ error }) => {
            if (error) console.error('Error updating stock:', error);
          });
      },

      addProduct: async (product: Product) => {
        const { selectedStoreId } = get();
        
        if (selectedStoreId === 'all') {
          throw new Error('Please select a specific store to add products');
        }
        
        // First, check if product exists in master catalog
        const { data: existingProduct } = await supabase
          .from('products_master')
          .select('id')
          .eq('name', product.name)
          .eq('category', product.category)
          .eq('unit', product.unit)
          .maybeSingle();
        
        let productId = existingProduct?.id;
        
        // If product doesn't exist in master, create it
        if (!productId) {
          const { data: newProduct, error: masterError } = await supabase
            .from('products_master')
            .insert([{
              name: product.name,
              category: product.category,
              unit: product.unit,
              selling_price: product.selling_price,
              cost_price: product.cost_price,
              barcode: product.barcode
            }])
            .select()
            .single();
          
          if (masterError) {
            console.error('Error adding product to master:', masterError);
            throw masterError;
          }
          productId = newProduct.id;
        }
        
        // Add to store inventory
        const { error: inventoryError } = await supabase
          .from('store_inventory')
          .insert([{
            product_id: productId,
            store_id: selectedStoreId,
            stock_quantity: product.stock_quantity,
            reorder_level: product.reorder_level
          }]);
        
        if (inventoryError) {
          console.error('Error adding product to inventory:', inventoryError);
          throw inventoryError;
        }
        
        // Add to local state
        const productWithStore = { ...product, id: productId, store_id: selectedStoreId };
        set({ products: [...get().products, productWithStore] });
      },
      
      updateProduct: async (product: Product) => {
        const { products, selectedStoreId } = get();
        const updatedProducts = products.map(p =>
          p.id === product.id && p.store_id === product.store_id ? product : p
        );
        
        set({ products: updatedProducts });
        
        // Update product master
        const { error: masterError } = await supabase
          .from('products_master')
          .update({
            name: product.name,
            category: product.category,
            unit: product.unit,
            selling_price: product.selling_price,
            cost_price: product.cost_price,
            barcode: product.barcode,
            updated_at: new Date().toISOString()
          })
          .eq('id', product.id);
        
        if (masterError) {
          console.error('Error updating product master:', masterError);
          throw masterError;
        }
        
        // Update store inventory
        const { error: inventoryError } = await supabase
          .from('store_inventory')
          .update({
            stock_quantity: product.stock_quantity,
            reorder_level: product.reorder_level,
            updated_at: new Date().toISOString()
          })
          .eq('product_id', product.id)
          .eq('store_id', product.store_id);
        
        if (inventoryError) {
          console.error('Error updating inventory:', inventoryError);
          throw inventoryError;
        }
      },
      
      // Customer actions
      addCustomer: (customerData) => {
        const newCustomer: Customer = {
          ...customerData,
          id: crypto.randomUUID(),
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
        const { pendingOrders, products, selectedStoreId } = get();
        const order = pendingOrders.find(o => o.id === orderId);
        
        // Use the first available store if 'all' is selected
        const storeId = selectedStoreId === 'all' ? get().stores[0]?.id : selectedStoreId;
        
        if (!storeId) {
          console.error('No store selected for order confirmation');
          return;
        }
        
        if (order) {
          // Create a sale from the order
          const totalAmount = saleItems.reduce((sum, item) => {
            const product = products.find(p => p.id === item.productId);
            return sum + (product ? product.selling_price * item.quantity : 0);
          }, 0);
          
          const saleId = crypto.randomUUID();
          const sale: Sale = {
            id: saleId,
            customer_id: order.assigned_customer_id,
            store_id: storeId,
            total_amount: totalAmount,
            payment_method: 'credit', // WhatsApp orders default to credit
            status: 'pending',
            timestamp: new Date().toISOString(),
            items: saleItems.map(item => {
              const product = products.find(p => p.id === item.productId)!;
              return {
                id: crypto.randomUUID(),
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
      addCategory: async (categoryName: string) => {
        const { error } = await supabase
          .from('categories')
          .insert([{ name: categoryName }]);
        
        if (error) {
          console.error('Error adding category:', error);
          throw error;
        }
      },
      
      removeCategory: async (categoryName: string) => {
        const { error } = await supabase
          .from('categories')
          .delete()
          .eq('name', categoryName);
        
        if (error) {
          console.error('Error removing category:', error);
          throw error;
        }
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