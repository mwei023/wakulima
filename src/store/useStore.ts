import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Product, Customer, Sale, CartItem, PendingOrder } from '@/types';
import { mockPendingOrders } from '@/data/mockData';
import { offlineManager, db, seedLocal, processLocalSale } from '@/lib/db';
import { logSaleTransaction, createAuditLog } from '@/lib/auditLog';
import { STORE_ID } from '@/lib/backend';

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

  // Network
  isOnline: boolean;

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

  // Category actions
  addCategory: (categoryName: string) => Promise<void>;
  removeCategory: (categoryName: string) => Promise<void>;
}

function isValidProduct(product: Product): boolean {
  return !!product
    && typeof product.id === 'string' && product.id !== ''
    && !!product.name && !!product.category && !!product.unit
    && typeof product.selling_price === 'number'
    && typeof product.cost_price === 'number'
    && typeof product.stock_quantity === 'number'
    && typeof product.reorder_level === 'number';
}

function defaultCustomer(customers: Customer[]): Customer | null {
  return customers.find(c => c.id === 'walk-in') ?? customers[0] ?? null;
}

async function refreshFromDb(set: (partial: Partial<StoreState>) => void, keepCustomer: Customer | null = null) {
  const [products, customers, sales] = await Promise.all([
    db.localProducts.toArray(),
    db.localCustomers.toArray(),
    db.localSales.orderBy('timestamp').reverse().toArray(),
  ]);
  set({
    products,
    customers,
    sales,
    currentStoreId: STORE_ID,
    selectedCustomer: keepCustomer ?? defaultCustomer(customers),
  });
  return { products, customers, sales };
}

export const useStore = create<StoreState>()(
  persist(
    (set, get) => {
      // Track browser online status for the header badge only.
      offlineManager.addStatusListener((isOnline) => {
        set({ isOnline });
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
      isOnline: offlineManager.getOnlineStatus(),

      // Data loading (IndexedDB is the database)
      loadData: async () => {
        try {
          await seedLocal();
          const [products, customers, sales] = await Promise.all([
            db.localProducts.toArray(),
            db.localCustomers.toArray(),
            db.localSales.orderBy('timestamp').reverse().toArray(),
          ]);
          set({
            products,
            customers,
            sales,
            pendingOrders: mockPendingOrders,
            currentStoreId: STORE_ID,
            // Always default to walk-in so credit is never silently billed to
            // a registered customer. IndexedDB sorts string ids lexicographically,
            // so customers[0] is NOT reliably the walk-in customer.
            selectedCustomer: defaultCustomer(customers)
          });
        } catch (error) {
          console.error('Error loading data:', error);
        }
      },

      // Cart actions
      addToCart: (product: Product, quantity: number) => {
        if (!isValidProduct(product)) {
          console.error('Cannot add product with invalid data to cart:', product);
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
        if (!productId) return;
        const { cart } = get();
        set({ cart: cart.filter(item => item.product.id !== productId) });
      },

      updateCartQuantity: (productId: string, quantity: number) => {
        if (!productId) return;
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
        set({ cart: [], selectedCustomer: defaultCustomer(customers) });
      },

      setSelectedCustomer: (customer: Customer | null) => {
        set({ selectedCustomer: customer });
      },

      // Sales actions (atomic local transaction: stock + credit checked together)
      completeSale: async (paymentMethod: 'cash' | 'mpesa' | 'credit') => {
        const { cart, selectedCustomer, products } = get();

        const validCart = cart.filter(item => item.product?.id && typeof item.product.id === 'string' && item.product.id !== '');
        if (validCart.length !== cart.length) {
          console.warn('Removed invalid cart items');
          set({ cart: validCart });
        }

        if (validCart.length === 0) return null;

        const totalAmount = validCart.reduce((sum, item) => sum + item.total, 0);

        if (paymentMethod === 'credit') {
          if (!selectedCustomer || selectedCustomer.id === 'walk-in') {
            return 'Credit sales require a registered customer';
          }
          if (selectedCustomer.outstanding_balance + totalAmount > selectedCustomer.credit_limit) {
            return 'Sale exceeds customer credit limit';
          }
        }

        for (const item of validCart) {
          const product = products.find(p => p.id === item.product.id);
          if (!product) {
            return `Product ${item.product.name} not found`;
          }
          if (item.quantity > product.stock_quantity) {
            return `Insufficient stock for ${item.product.name}. Available: ${product.stock_quantity}, Requested: ${item.quantity}`;
          }
        }

        if (!validCart.every(item => isValidProduct(item.product))) {
          return 'Some items in your cart have invalid product data. Please refresh and try again.';
        }

        try {
          const saleId = await processLocalSale(
            STORE_ID,
            selectedCustomer?.id || null,
            paymentMethod,
            validCart.map(item => ({
              product_id: item.product.id,
              product_name: item.product.name,
              quantity: item.quantity,
              unit_price: item.product.selling_price,
              total_line: item.total
            })),
            totalAmount
          );

          const { products: freshProducts, customers: freshCustomers, sales: freshSales } =
            await refreshFromDb(set as (partial: Partial<StoreState>) => void);

          set({ cart: [] });
          await logSaleTransaction(saleId, {
            total_amount: totalAmount,
            payment_method: paymentMethod,
            customer_id: selectedCustomer?.id || null,
            items: validCart.length
          });

          return null; // Success
        } catch (error: unknown) {
          return error instanceof Error ? error.message : 'Sale failed';
        }
      },

      // Inventory actions
      updateStock: (productId: string, newQuantity: number) => {
        if (newQuantity < 0) return;
        const { products } = get();
        const old = products.find(p => p.id === productId);
        const updatedProducts = products.map(product =>
          product.id === productId
            ? { ...product, stock_quantity: newQuantity, updated_at: new Date().toISOString() }
            : product
        );

        set({ products: updatedProducts });
        db.localProducts.update(productId, { stock_quantity: newQuantity }).catch(e => console.error(e));
        if (old) {
          createAuditLog({
            action: 'UPDATE_INVENTORY',
            table_name: 'products',
            record_id: productId,
            old_values: { stock_quantity: old.stock_quantity },
            new_values: { stock_quantity: newQuantity }
          });
        }
      },

      addProduct: async (product: Product) => {
        const newProduct: Product = {
          ...product,
          id: product.id && product.id !== '' ? product.id : crypto.randomUUID(),
          store_id: STORE_ID,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        await db.localProducts.add(newProduct);
        set({ products: [...get().products, newProduct] });
        await createAuditLog({ action: 'CREATE_PRODUCT', table_name: 'products', record_id: newProduct.id, new_values: newProduct });
      },

      updateProduct: async (product: Product) => {
        const { products } = get();
        const old = products.find(p => p.id === product.id);
        set({ products: products.map(p => (p.id === product.id ? product : p)) });

        await db.localProducts.put(product);
        if (old && old.selling_price !== product.selling_price) {
          await createAuditLog({
            action: 'UPDATE_PRICE',
            table_name: 'products',
            record_id: product.id,
            old_values: { selling_price: old.selling_price },
            new_values: { selling_price: product.selling_price }
          });
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
        db.localCustomers.add(newCustomer).catch(e => console.error(e));
      },

      updateCustomerBalance: (customerId: string, amount: number) => {
        const { customers } = get();
        const updated = customers.map(customer =>
          customer.id === customerId
            ? { ...customer, outstanding_balance: Math.max(0, customer.outstanding_balance + amount) }
            : customer
        );
        set({ customers: updated });
        const changed = updated.find(x => x.id === customerId);
        if (changed) {
          db.localCustomers.update(customerId, { outstanding_balance: changed.outstanding_balance }).catch(e => console.error(e));
        }
      },

      // Orders actions (WhatsApp-style orders confirmed into credit sales)
      confirmOrder: async (orderId: string, saleItems: { productId: string; quantity: number }[]) => {
        const { pendingOrders, products } = get();
        const order = pendingOrders.find(o => o.id === orderId);

        if (order) {
          const totalAmount = saleItems.reduce((sum, item) => {
            const product = products.find(p => p.id === item.productId);
            return sum + (product ? product.selling_price * item.quantity : 0);
          }, 0);

          const saleId = await processLocalSale(
            STORE_ID,
            order.assigned_customer_id,
            'credit',
            saleItems.map(item => {
              const product = products.find(p => p.id === item.productId)!;
              return {
                product_id: product.id,
                product_name: product.name,
                quantity: item.quantity,
                unit_price: product.selling_price,
                total_line: product.selling_price * item.quantity
              };
            }),
            totalAmount
          );

          const { products: freshProducts, customers: freshCustomers } =
            await refreshFromDb(set as (partial: Partial<StoreState>) => void);

          set({
            products: freshProducts,
            customers: freshCustomers,
            sales: await db.localSales.orderBy('timestamp').reverse().toArray(),
            pendingOrders: pendingOrders.map(o =>
              o.id === orderId ? { ...o, status: 'confirmed' as const } : o
            )
          });
          await logSaleTransaction(saleId, { total_amount: totalAmount, payment_method: 'credit', from_order: orderId });
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

      // Categories derive from products; no separate table.
      addCategory: async (_categoryName: string) => {},
      removeCategory: async (_categoryName: string) => {}
      };
    },
    {
      name: 'wakulima-agrovet-store',
      partialize: (state) => ({
        pendingOrders: state.pendingOrders
      })
    }
  )
);
