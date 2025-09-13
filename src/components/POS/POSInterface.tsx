import { useState, useRef } from 'react';
import { Search, Plus, Trash2, CreditCard, Banknote, Smartphone, Scan, Printer } from 'lucide-react';
import { BarcodeScanner } from './BarcodeScanner';
import { Receipt } from './Receipt';
import ReactToPrint from 'react-to-print';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useStore } from '@/store/useStore';
import { formatCurrency } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';

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
  const [showScanner, setShowScanner] = useState(false);
  const [lastSale, setLastSale] = useState<any>(null);
  const receiptRef = useRef<HTMLDivElement>(null);

  const filteredProducts = products.filter(product =>
    product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    product.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const cartTotal = cart.reduce((sum, item) => sum + item.total, 0);
  const cartItemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const addProductToCart = (product: any) => {
    if (product.stock_quantity <= 0) {
      toast({
        title: "Out of Stock",
        description: `${product.name} is out of stock`,
        variant: "destructive"
      });
      return;
    }
    addToCart(product, 1);
    setSearchTerm('');
  };

  const updateQuantity = (productId: string, newQuantity: number) => {
    if (newQuantity <= 0) {
      removeFromCart(productId);
      return;
    }
    
    const product = products.find(p => p.id === productId);
    if (product && newQuantity > product.stock_quantity) {
      toast({
        title: "Insufficient Stock",
        description: `Only ${product.stock_quantity} units available`,
        variant: "destructive"
      });
      return;
    }
    updateCartQuantity(productId, newQuantity);
  };

  const calculateProfit = () => {
    return cart.reduce((sum, item) => {
      const product = products.find(p => p.id === item.product.id);
      if (product) {
        return sum + ((item.product.selling_price - product.cost_price) * item.quantity);
      }
      return sum;
    }, 0);
  };

  const processSale = () => {
    if (cart.length === 0) {
      toast({
        title: "Error",
        description: "Cart is empty",
        variant: "destructive"
      });
      return;
    }

    // Check credit limit if paying with credit
    if (paymentMethod === 'credit' && selectedCustomer) {
      if (selectedCustomer.id === 'walk-in') {
        toast({
          title: "Error", 
          description: "Credit sales require a registered customer",
          variant: "destructive"
        });
        return;
      }
      
      const newBalance = selectedCustomer.outstanding_balance + cartTotal;
      if (newBalance > selectedCustomer.credit_limit) {
        toast({
          title: "Credit Limit Exceeded",
          description: `Customer limit: ${formatCurrency(selectedCustomer.credit_limit)}`,
          variant: "destructive"
        });
        return;
      }
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
      });
      setPaymentMethod('cash');
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-6">
      {/* Product Search & Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Product Search
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            placeholder="Search products..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="text-lg"
          />
          
          <div className="grid grid-cols-1 gap-2 max-h-96 overflow-y-auto">
            {filteredProducts.map((product) => (
              <Card key={product.id} className="cursor-pointer hover:bg-muted/50" onClick={() => addProductToCart(product)}>
                <CardContent className="p-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-medium">{product.name}</h4>
                      <p className="text-sm text-muted-foreground">{product.category}</p>
                      <p className="font-bold text-primary">{formatCurrency(product.selling_price)}</p>
                    </div>
                    <div className="text-right">
                      <Badge variant={product.stock_quantity <= product.reorder_level ? "destructive" : "secondary"}>
                        {product.stock_quantity} {product.unit}s
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Cart & Checkout */}
      <Card>
        <CardHeader>
          <CardTitle>Cart ({cartItemCount} items)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Customer Selection */}
          <div>
            <label className="text-sm font-medium">Customer</label>
            <Select value={selectedCustomer?.id || ''} onValueChange={(value) => {
              const customer = customers.find(c => c.id === value);
              setSelectedCustomer(customer || null);
            }}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {customers.map((customer) => (
                  <SelectItem key={customer.id} value={customer.id}>
                    <div>
                      <div className="font-medium">{customer.name}</div>
                      {customer.id !== 'walk-in' && (
                        <div className="text-xs text-muted-foreground">
                          Balance: {formatCurrency(customer.outstanding_balance)} / 
                          Limit: {formatCurrency(customer.credit_limit)}
                        </div>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Cart Items */}
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {cart.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">Cart is empty</p>
            ) : (
              cart.map((item) => (
                <div key={item.product.id} className="flex items-center justify-between p-2 border rounded">
                  <div className="flex-1">
                    <p className="font-medium text-sm">{item.product.name}</p>
                    <p className="text-xs text-muted-foreground">{formatCurrency(item.product.selling_price)} each</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
                    >
                      -
                    </Button>
                    <span className="w-8 text-center">{item.quantity}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
                    >
                      +
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => removeFromCart(item.product.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="w-20 text-right font-medium">
                    {formatCurrency(item.total)}
                  </div>
                </div>
              ))
            )}
          </div>

          {cart.length > 0 && (
            <>
              {/* Payment Method */}
              <div>
                <label className="text-sm font-medium">Payment Method</label>
                <div className="flex gap-2 mt-2">
                  <Button
                    variant={paymentMethod === 'cash' ? 'default' : 'outline'}
                    onClick={() => setPaymentMethod('cash')}
                    className="flex-1"
                  >
                    <Banknote className="h-4 w-4 mr-1" />
                    Cash
                  </Button>
                  <Button
                    variant={paymentMethod === 'mpesa' ? 'default' : 'outline'}
                    onClick={() => setPaymentMethod('mpesa')}
                    className="flex-1"
                  >
                    <Smartphone className="h-4 w-4 mr-1" />
                    M-Pesa
                  </Button>
                  <Button
                    variant={paymentMethod === 'credit' ? 'default' : 'outline'}
                    onClick={() => setPaymentMethod('credit')}
                    className="flex-1"
                  >
                    <CreditCard className="h-4 w-4 mr-1" />
                    Credit
                  </Button>
                </div>
              </div>

              {/* Totals */}
              <div className="border-t pt-4">
                <div className="flex justify-between text-lg font-bold">
                  <span>Total:</span>
                  <span>{formatCurrency(cartTotal)}</span>
                </div>
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Est. Profit:</span>
                  <span className="text-success">{formatCurrency(calculateProfit())}</span>
                </div>
              </div>

              {/* Checkout Button */}
              <Button onClick={processSale} className="w-full" size="lg">
                Complete Sale - {formatCurrency(cartTotal)}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};