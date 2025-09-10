import { useState } from 'react';
import { useStore } from '@/store/useStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Search, Plus, Minus, Trash2, ShoppingCart, AlertTriangle, Zap } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { formatCurrency } from '@/lib/utils';
import { QuickActions } from './QuickActions';
import { QuickQuantity } from './QuickQuantity';

export const POSInterface = () => {
  const {
    products,
    customers,
    cart,
    selectedCustomer,
    addToCart,
    removeFromCart,
    updateCartQuantity,
    clearCart,
    setSelectedCustomer,
    completeSale
  } = useStore();

  const [searchTerm, setSearchTerm] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'mpesa' | 'credit'>('cash');
  const [selectedProductForQuantity, setSelectedProductForQuantity] = useState<string | null>(null);

  // Predictive search - show results after 1 character
  const filteredProducts = products.filter(product =>
    searchTerm.length >= 1 && (
      product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.category.toLowerCase().includes(searchTerm.toLowerCase())
    )
  );

  // Top products for quick access (most expensive or most sold)
  const topProducts = products.slice().sort((a, b) => b.selling_price - a.selling_price);

  const cartTotal = cart.reduce((sum, item) => sum + item.total, 0);
  const cartItemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const handleAddToCart = (productId: string, quantity: number = 1) => {
    const product = products.find(p => p.id === productId);
    if (product) {
      if (product.stock_quantity <= 0) {
        toast({
          title: "Out of Stock",
          description: `${product.name} is out of stock`,
          variant: "destructive"
        });
        return;
      }
      addToCart(product, quantity);
      // Clear search after adding to speed up workflow
      if (searchTerm) {
        setSearchTerm('');
      }
    }
  };

  const handleQuickQuantitySelect = (productId: string, quantity: number) => {
    handleAddToCart(productId, quantity);
    setSelectedProductForQuantity(null);
  };

  const handleQuantityChange = (productId: string, quantity: number) => {
    const product = products.find(p => p.id === productId);
    if (product && quantity > product.stock_quantity) {
      toast({
        title: "Insufficient Stock",
        description: `Only ${product.stock_quantity} units available`,
        variant: "destructive"
      });
      return;
    }
    updateCartQuantity(productId, quantity);
  };

  const handleCompleteSale = () => {
    if (cart.length === 0) {
      toast({
        title: "Empty Cart",
        description: "Add items to cart before completing sale",
        variant: "destructive"
      });
      return;
    }

    const error = completeSale(paymentMethod);
    if (error) {
      toast({
        title: "Sale Failed",
        description: error,
        variant: "destructive"
      });
    } else {
      toast({
        title: "Sale Completed",
        description: `Sale of ${formatCurrency(cartTotal)} completed successfully`,
        variant: "default"
      });
      setPaymentMethod('cash');
    }
  };

  const getStockBadgeVariant = (product: any) => {
    if (product.stock_quantity <= 0) return 'destructive';
    if (product.stock_quantity <= product.reorder_level) return 'warning';
    return 'secondary';
  };

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Product Search & List */}
      <div className="lg:col-span-2 space-y-4">
        {/* Quick Actions */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Zap className="h-4 w-4" />
              Lightning Fast
            </CardTitle>
          </CardHeader>
          <CardContent>
            <QuickActions 
              topProducts={topProducts} 
              onAddToCart={(productId) => handleAddToCart(productId)} 
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Product Search
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Input
              placeholder="Type 'Dairy' for instant results..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="mb-4 text-lg h-12"
              autoFocus
            />
            
            {searchTerm && (
              <div className="grid gap-2 max-h-80 overflow-y-auto">
                {filteredProducts.length === 0 ? (
                  <p className="text-center text-muted-foreground py-4">
                    No products found for "{searchTerm}"
                  </p>
                ) : (
                  filteredProducts.map((product) => (
                    <div
                      key={product.id}
                      className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-medium text-base">{product.name}</h4>
                          <Badge variant={getStockBadgeVariant(product)} className="text-xs">
                            {product.stock_quantity} {product.unit}
                          </Badge>
                          {product.stock_quantity <= product.reorder_level && (
                            <AlertTriangle className="h-4 w-4 text-warning" />
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">{product.category}</p>
                        <p className="font-semibold text-primary text-lg">{formatCurrency(product.selling_price)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {selectedProductForQuantity === product.id ? (
                          <div className="flex items-center gap-2">
                            <QuickQuantity 
                              onQuantitySelect={(qty) => handleQuickQuantitySelect(product.id, qty)} 
                            />
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setSelectedProductForQuantity(null)}
                            >
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setSelectedProductForQuantity(product.id)}
                              disabled={product.stock_quantity <= 0}
                            >
                              Qty
                            </Button>
                            <Button
                              size="lg"
                              onClick={() => handleAddToCart(product.id)}
                              disabled={product.stock_quantity <= 0}
                              className="h-12 px-6"
                            >
                              <Plus className="h-5 w-5 mr-2" />
                              Add
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
            
            {!searchTerm && (
              <div className="text-center py-8">
                <Search className="h-12 w-12 text-muted-foreground mx-auto mb-2" />
                <p className="text-muted-foreground">
                  Start typing to search products instantly
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Try "Dairy", "Feed", or "Fertilizer"
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Cart & Checkout */}
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <ShoppingCart className="h-5 w-5" />
                Cart ({cartItemCount})
              </span>
              {cart.length > 0 && (
                <Button variant="ghost" size="sm" onClick={clearCart}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {cart.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">Cart is empty</p>
            ) : (
              <div className="space-y-3">
                {cart.map((item) => (
                  <div key={item.product.id} className="flex items-center gap-2">
                    <div className="flex-1">
                      <p className="font-medium text-sm">{item.product.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatCurrency(item.product.selling_price)} each
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleQuantityChange(item.product.id, item.quantity - 1)}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="w-8 text-center text-sm">{item.quantity}</span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleQuantityChange(item.product.id, item.quantity + 1)}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-sm">{formatCurrency(item.total)}</p>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => removeFromCart(item.product.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Checkout */}
        {cart.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Checkout</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Customer Selection */}
              <div>
                <label className="text-sm font-medium mb-2 block">Customer</label>
                <Select
                  value={selectedCustomer?.id || ''}
                  onValueChange={(customerId) => {
                    const customer = customers.find(c => c.id === customerId);
                    setSelectedCustomer(customer || null);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select customer" />
                  </SelectTrigger>
                  <SelectContent>
                    {customers.map((customer) => (
                      <SelectItem key={customer.id} value={customer.id}>
                        <div className="flex items-center justify-between w-full">
                          <span>{customer.name}</span>
                          {customer.id !== 'walk-in' && customer.outstanding_balance > 0 && (
                            <Badge variant="warning" className="ml-2">
                              Owes {formatCurrency(customer.outstanding_balance)}
                            </Badge>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                {selectedCustomer && selectedCustomer.id !== 'walk-in' && (
                  <div className="mt-2 p-2 bg-muted rounded text-sm">
                    <p>Credit Limit: {formatCurrency(selectedCustomer.credit_limit)}</p>
                    <p>Outstanding: {formatCurrency(selectedCustomer.outstanding_balance)}</p>
                    <p>Available Credit: {formatCurrency(selectedCustomer.credit_limit - selectedCustomer.outstanding_balance)}</p>
                  </div>
                )}
              </div>

              {/* Payment Method */}
              <div>
                <label className="text-sm font-medium mb-2 block">Payment Method</label>
                <Select
                  value={paymentMethod}
                  onValueChange={(method) => setPaymentMethod(method as any)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="mpesa">M-Pesa</SelectItem>
                    <SelectItem 
                      value="credit" 
                      disabled={!selectedCustomer || selectedCustomer.id === 'walk-in'}
                    >
                      Credit
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Separator />
              
              {/* Total */}
              <div className="space-y-2">
                <div className="flex justify-between text-lg font-semibold">
                  <span>Total:</span>
                  <span>{formatCurrency(cartTotal)}</span>
                </div>
                
                <Button 
                  className="w-full h-14 text-lg" 
                  size="lg"
                  onClick={handleCompleteSale}
                >
                  Complete Sale - {formatCurrency(cartTotal)}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};