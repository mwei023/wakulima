import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Product, Customer, Sale, CartItem, User, SyncStatus, PendingOrder } from '@/types';
import { mockProducts, mockCustomers, mockPendingOrders, mockUsers } from '@/data/mockData';
import { offlineManager } from '@/lib/db';
import { supabase } from '@/integrations/supabase/client';

interface StoreState {
  // Data
  products: Product[];
  customers: Customer[];
  sales: Sale[];
  pendingOrders: PendingOrder[];
  currentStoreId: string | null;
  
  // POS
  cart: CartItem[];
  selectedCustomer: Customer | null;
  
  // Sync
  syncStatus: SyncStatus;
  
  // Actions
  loadData: () => Promise<void>;
  
  // Cart actions
  addToCart: (product: Product, quantity: number) => void;
  removeFromCart: (productId: string) => void;
  updateCartQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  setSelectedCustomer: (customer: Customer | null) => void;
  
  // Sales actions
  completeSale: (paymentMethod: 'cash' | 'mpesa' | 'credit') => Promise<string | null>;
  
  // Inventory actions
  updateStock: (productId: string, newQuantity: number) => void;
  addProduct: (product: Product) => Promise<void>;
  updateProduct: (product: Product) => Promise<void>;
  
  // Customer actions
  addCustomer: (customer: Omit<Customer, 'id' | 'created_at'>) => void;
  updateCustomerBalance: (customerId: string, amount: number) => void;
  
  // Orders actions
  confirmOrder: (orderId: string, saleItems: { productId: string; quantity: number }[]) => Promise<void>;
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
      products: [],
      customers: [],
      sales: [],
      pendingOrders: [],
      currentStoreId: null,
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
          // Try loading cached data first
          const cachedData = await offlineManager.loadCachedData();
          if (cachedData) {
            set({
              products: cachedData.products,
              customers: cachedData.customers,
              sales: cachedData.sales,
              pendingOrders: [],
              selectedCustomer: cachedData.customers?.[0] || null
            });
          }

          // Get user's store assignment
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            const { data: userStore } = await supabase
              .from('user_stores')
              .select('store_id')
              .eq('user_id', user.id)
              .single();
            
            if (userStore) {
              set({ currentStoreId: userStore.store_id });
            }
          }

          // Then fetch fresh data from Supabase
          const currentStoreId = get().currentStoreId;
          const { data: products } = await supabase
            .from('products')
            .select('*')
            .eq('store_id', currentStoreId || '');
          const { data: customers } = await supabase.from('customers').select('*');
          const { data: sales } = await supabase.from('sales').select(`
            *,
            sale_items (*)
          `);
          const { data: pendingOrders } = await supabase.from('pending_orders').select('*');

          // Filter out products with null, undefined, or empty IDs and ensure they have required fields
          const validProducts = (products || []).filter(product =>
            product.id !== null &&
            product.id !== undefined &&
            product.id !== '' &&
            typeof product.id === 'string' &&
            product.name &&
            product.category &&
            product.unit &&
            typeof product.selling_price === 'number' &&
            typeof product.cost_price === 'number' &&
            typeof product.stock_quantity === 'number' &&
            typeof product.reorder_level === 'number'
          );

          // Transform sales data to match interface
          const transformedSales = sales?.map(sale => ({
            ...sale,
            items: sale.sale_items || []
          })) || [];

          set({
            products: validProducts,
            customers: customers || [],
            sales: transformedSales,
            pendingOrders: pendingOrders || [],
            selectedCustomer: customers?.[0] || null
          });
        } catch (error) {
          console.error('Error loading data:', error);
          // Fallback to mock data
          set({
            products: mockProducts,
            customers: mockCustomers,
            sales: [],
            pendingOrders: mockPendingOrders,
            selectedCustomer: mockCustomers[0]
          });
        }
      },
      
      // Cart actions
      addToCart: (product: Product, quantity: number) => {
        if (!product.id || product.id === null || product.id === undefined || product.id === '') {
          console.error('Cannot add product with invalid ID to cart:', product);
          return;
        }

        // Additional validation for required fields
        if (!product.name || !product.category || !product.unit ||
            typeof product.selling_price !== 'number' || typeof product.cost_price !== 'number' ||
            typeof product.stock_quantity !== 'number' || typeof product.reorder_level !== 'number') {
          console.error('Cannot add product with missing required fields to cart:', product);
          return;
        }

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
        if (!productId || productId === null || productId === undefined || productId === '') return;
        const { cart } = get();
        set({ cart: cart.filter(item => item.product.id !== productId) });
      },

      updateCartQuantity: (productId: string, quantity: number) => {
        if (!productId || productId === null || productId === undefined || productId === '') return;
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
      completeSale: async (paymentMethod: 'cash' | 'mpesa' | 'credit') => {
        const { cart, selectedCustomer, products, customers } = get();

        // Filter cart to only include items with valid product IDs
        const validCart = cart.filter(item =>
          item.product.id &&
          item.product.id !== null &&
          item.product.id !== undefined &&
          item.product.id !== '' &&
          typeof item.product.id === 'string'
        );

        if (validCart.length !== cart.length) {
          console.warn('Removed invalid cart items');
          set({ cart: validCart });
        }

        if (validCart.length === 0) return null;

        const totalAmount = validCart.reduce((sum, item) => sum + item.total, 0);

        // Validate credit sale
        if (paymentMethod === 'credit') {
          if (!selectedCustomer || selectedCustomer.id === 'walk-in') {
            return 'Credit sales require a registered customer';
          }
          if (selectedCustomer.outstanding_balance + totalAmount > selectedCustomer.credit_limit) {
            return 'Sale exceeds customer credit limit';
          }
        }

        const { currentStoreId } = get();
        if (!currentStoreId) {
          return 'No store assigned to user';
        }

        // Additional validation for validCart items (should be redundant but extra safety)
        const invalidCartItems = validCart.filter(item =>
          !item.product.name ||
          !item.product.category ||
          !item.product.unit ||
          typeof item.product.selling_price !== 'number' ||
          typeof item.product.cost_price !== 'number' ||
          typeof item.product.stock_quantity !== 'number' ||
          typeof item.product.reorder_level !== 'number'
        );

        if (invalidCartItems.length > 0) {
          console.error('Invalid cart items found:', invalidCartItems);
          throw new Error('Some items in your cart have invalid product data. Please refresh the page and try again.');
        }

        const saleId = Date.now().toString();
        console.log('Creating sale with validated cart items:', validCart);
        const sale: Sale = {
          id: saleId,
          customer_id: selectedCustomer?.id || null,
          total_amount: totalAmount,
          payment_method: paymentMethod,
          status: 'pending',
          timestamp: new Date().toISOString(),
          store_id: currentStoreId,
          items: validCart.map(item => ({
            id: crypto.randomUUID(),
            sale_id: saleId,
            product_id: item.product.id, // This should now be guaranteed to be valid
            product_name: item.product.name,
            quantity: item.quantity,
            unit_price: item.product.selling_price,
            total_line: item.total
          }))
        };
        console.log('Sale items created:', sale.items);

        // Update stock
        const updatedProducts = products.map(product => {
          const cartItem = validCart.find(item => item.product.id === product.id);
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
            // Final validation before database insertion (should be redundant but extra safety)
            const invalidItems = sale.items.filter(item => !item.product_id || item.product_id === null || item.product_id === undefined || item.product_id === '');
            if (invalidItems.length > 0) {
              console.error('Invalid items found before DB insertion:', invalidItems);
              throw new Error('Some products have missing or invalid IDs. Please refresh the page and try again.');
            }

            // Refresh session to ensure it's valid
            await supabase.auth.refreshSession();
            // Get current user for created_by field
            const { data: { session } } = await supabase.auth.getSession();
            console.log('session', session);
            if (!session || !session.user) throw new Error('User not authenticated');

            const user = session?.user;
            console.log('user id', user?.id);

            const payload = {
              customer_id: sale.customer_id,
              total_amount: sale.total_amount,
              payment_method: sale.payment_method,
              status: 'pending' as const,
              timestamp: sale.timestamp,
              created_by: user?.id ?? null,
              store_id: currentStoreId
            };
            console.log('sale payload', payload);

            const { data: saleData, error: saleError } = await supabase
              .from('sales')
              .insert([payload])
              .select()
              .single();

            if (saleError) throw saleError;

            // Update sale with the generated UUID
            sale.id = saleData.id;
            sale.items = sale.items.map(item => ({ ...item, sale_id: saleData.id }));

            // Insert sale items with additional validation
            console.log('Inserting sale items:', sale.items);
            const saleItemsToInsert = sale.items.map(item => {
              if (!item.product_id || item.product_id === null || item.product_id === undefined || item.product_id === '') {
                console.error('Attempting to insert sale item with invalid product_id:', item);
                throw new Error(`Invalid product_id for item: ${item.product_name}`);
              }
              return {
                sale_id: saleData.id,
                product_id: item.product_id,
                product_name: item.product_name,
                quantity: item.quantity,
                unit_price: item.unit_price,
                total_line: item.total_line
              };
            });

            const { error: itemsError } = await supabase
              .from('sale_items')
              .insert(saleItemsToInsert);

            if (itemsError) {
              console.error('Error inserting sale items:', itemsError);
              throw itemsError;
            }

            // Update stock quantities in store_inventory (parallelized)
            const stockUpdatePromises = sale.items.map(async (item) => {
              // Fetch current stock
              const { data: currentProduct, error: fetchError } = await supabase
                .from('store_inventory')
                .select('stock_quantity')
                .eq('id', item.product_id)
                .single();

              if (fetchError) throw fetchError;

              // Update with new stock
              const newStock = currentProduct.stock_quantity - item.quantity;
              const { error: stockError } = await supabase
                .from('store_inventory')
                .update({ stock_quantity: newStock })
                .eq('id', item.product_id);

              if (stockError) throw stockError;
            });

            await Promise.all(stockUpdatePromises);

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

        await saveSale();

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

        console.log('Sale completed successfully with valid product IDs');

        // Cache updated data offline
        await offlineManager.cacheData(updatedProducts, updatedCustomers, [...get().sales, sale], get().syncStatus);

        return null; // Success
      },

      // Inventory actions
      updateStock: (productId: string, newQuantity: number) => {
        const { products } = get();
        const updatedProducts = products.map(product =>
          product.id === productId
            ? { ...product, stock_quantity: newQuantity, updated_at: new Date().toISOString() }
            : product
        );
        
        set({ products: updatedProducts });
        
        // Update in Supabase store_inventory table (products is a view)
        supabase
          .from('store_inventory')
          .update({ stock_quantity: newQuantity, updated_at: new Date().toISOString() })
          .eq('id', productId)
          .then(({ error }) => {
            if (error) console.error('Error updating stock:', error);
          });
      },

      addProduct: async (product: Product) => {
        const { currentStoreId } = get();
        
        if (!currentStoreId) {
          throw new Error('No store assigned to user');
        }

        // Save to Supabase - insert into underlying tables
        // First, insert into products_master
        const { data: masterData, error: masterError } = await supabase
          .from('products_master')
          .insert({
            name: product.name,
            category: product.category,
            unit: product.unit,
            selling_price: product.selling_price,
            cost_price: product.cost_price,
            barcode: product.barcode
          })
          .select()
          .single();

        if (masterError) {
          console.error('Error adding to products_master:', masterError);
          throw masterError;
        }

        // Then, insert into store_inventory
        const { data: inventoryData, error: inventoryError } = await supabase
          .from('store_inventory')
          .insert({
            product_id: masterData.id,
            stock_quantity: product.stock_quantity,
            reorder_level: product.reorder_level,
            store_id: currentStoreId
          })
          .select()
          .single();

        if (inventoryError) {
          console.error('Error adding to store_inventory:', inventoryError);
          throw inventoryError;
        }

        // Update local state with the generated IDs
        const newProduct = {
          ...product,
          id: inventoryData.id, // Use store_inventory.id as the product id
          store_id: currentStoreId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        set({ products: [...get().products, newProduct] });
      },
      
      updateProduct: async (product: Product) => {
        const { products } = get();
        const updatedProducts = products.map(p =>
          p.id === product.id ? product : p
        );

        set({ products: updatedProducts });

        // Update in Supabase - update underlying tables
        // First, get the product_id from store_inventory
        const { data: inventoryData, error: fetchError } = await supabase
          .from('store_inventory')
          .select('product_id')
          .eq('id', product.id)
          .single();

        if (fetchError) {
          console.error('Error fetching product_id:', fetchError);
          throw fetchError;
        }

        // Update products_master
        const { error: masterError } = await supabase
          .from('products_master')
          .update({
            name: product.name,
            category: product.category,
            unit: product.unit,
            selling_price: product.selling_price,
            cost_price: product.cost_price,
            barcode: product.barcode
          })
          .eq('id', inventoryData.product_id);

        if (masterError) {
          console.error('Error updating products_master:', masterError);
          throw masterError;
        }

        // Update store_inventory
        const { error: inventoryError } = await supabase
          .from('store_inventory')
          .update({
            stock_quantity: product.stock_quantity,
            reorder_level: product.reorder_level,
            updated_at: new Date().toISOString()
          })
          .eq('id', product.id);

        if (inventoryError) {
          console.error('Error updating store_inventory:', inventoryError);
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
      confirmOrder: async (orderId: string, saleItems: { productId: string; quantity: number }[]) => {
        const { pendingOrders, products, currentStoreId } = get();
        const order = pendingOrders.find(o => o.id === orderId);

        if (order) {
          if (!currentStoreId) {
            console.error('No store assigned to user');
            return;
          }

          // Create a sale from the order
          const totalAmount = saleItems.reduce((sum, item) => {
            const product = products.find(p => p.id === item.productId);
            return sum + (product ? product.selling_price * item.quantity : 0);
          }, 0);

          const sale: Sale = {
            id: '',
            customer_id: order.assigned_customer_id,
            total_amount: totalAmount,
            payment_method: 'credit', // WhatsApp orders default to credit
            status: 'pending',
            timestamp: new Date().toISOString(),
            store_id: currentStoreId,
            items: saleItems.map(item => {
              const product = products.find(p => p.id === item.productId)!;
              return {
                id: '',
                sale_id: '',
                product_id: product.id,
                product_name: product.name,
                quantity: item.quantity,
                unit_price: product.selling_price,
                total_line: product.selling_price * item.quantity
              };
            })
          };

          try {
            // Refresh session to ensure it's valid
            await supabase.auth.refreshSession();
            // Get current user for created_by field
            const { data: { session } } = await supabase.auth.getSession();
            if (!session || !session.user) throw new Error('User not authenticated');

            // Save sale to Supabase
            const { data: saleData, error: saleError } = await supabase
              .from('sales')
              .insert({
                customer_id: sale.customer_id,
                total_amount: sale.total_amount,
                payment_method: sale.payment_method,
                status: sale.status,
                timestamp: sale.timestamp,
                created_by: session.user.id,
                store_id: currentStoreId
              })
              .select()
              .single();

            if (saleError) throw saleError;

            // Update sale with the generated UUID
            sale.id = saleData.id;
            sale.items = sale.items.map(item => ({ ...item, sale_id: saleData.id }));

            // Insert sale items
            const { error: itemsError } = await supabase
              .from('sale_items')
              .insert(sale.items.map(item => ({
                sale_id: saleData.id,
                product_id: item.product_id,
                product_name: item.product_name,
                quantity: item.quantity,
                unit_price: item.unit_price,
                total_line: item.total_line
              })));

            if (itemsError) throw itemsError;

            // Update stock quantities in store_inventory
            for (const item of sale.items) {
              // Fetch current stock
              const { data: currentProduct, error: fetchError } = await supabase
                .from('store_inventory')
                .select('stock_quantity')
                .eq('id', item.product_id)
                .single();

              if (fetchError) throw fetchError;

              // Update with new stock
              const newStock = currentProduct.stock_quantity - item.quantity;
              const { error: stockError } = await supabase
                .from('store_inventory')
                .update({ stock_quantity: newStock })
                .eq('id', item.product_id);

              if (stockError) throw stockError;
            }

            // Update local state
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
          } catch (error) {
            console.error('Error confirming order:', error);
            throw error;
          }
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