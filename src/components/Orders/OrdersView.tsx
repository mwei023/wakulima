import { useState } from 'react';
import { useStore } from '@/store/useStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MessageSquare, Check, X, Plus, Trash2 } from 'lucide-react';
import { formatDate, formatCurrency } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';

export const OrdersView = () => {
  const { pendingOrders, customers, products, confirmOrder, ignoreOrder } = useStore();
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [orderItems, setOrderItems] = useState<{ productId: string; quantity: number }[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<string>('');

  const pendingOrdersList = pendingOrders.filter(order => order.status === 'pending');
  const processedOrders = pendingOrders.filter(order => order.status !== 'pending');

  const handleConfirmOrder = () => {
    if (selectedOrder && orderItems.length > 0) {
      confirmOrder(selectedOrder.id, orderItems);
      toast({
        title: "Order Confirmed",
        description: "Order has been confirmed and added to sales",
      });
      setSelectedOrder(null);
      setOrderItems([]);
      setSelectedCustomer('');
    }
  };

  const handleIgnoreOrder = (orderId: string) => {
    ignoreOrder(orderId);
    toast({
      title: "Order Ignored",
      description: "Order has been moved to ignored list",
    });
  };

  const addOrderItem = () => {
    setOrderItems([...orderItems, { productId: '', quantity: 1 }]);
  };

  const updateOrderItem = (index: number, field: 'productId' | 'quantity', value: string | number) => {
    const updated = orderItems.map((item, i) => 
      i === index ? { ...item, [field]: value } : item
    );
    setOrderItems(updated);
  };

  const removeOrderItem = (index: number) => {
    setOrderItems(orderItems.filter((_, i) => i !== index));
  };

  const calculateOrderTotal = () => {
    return orderItems.reduce((sum, item) => {
      const product = products.find(p => p.id === item.productId);
      return sum + (product ? product.selling_price * item.quantity : 0);
    }, 0);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'default';
      case 'confirmed': return 'default';
      case 'ignored': return 'secondary';
      default: return 'default';
    }
  };

  return (
    <div className="space-y-6">
      {/* Pending Orders */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            WhatsApp Orders ({pendingOrdersList.length} pending)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {pendingOrdersList.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No pending WhatsApp orders</p>
              <p className="text-sm">New orders will appear here for processing</p>
            </div>
          ) : (
            <div className="space-y-4">
              {pendingOrdersList.map((order) => (
                <div key={order.id} className="border rounded-lg p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant={getStatusColor(order.status) as any}>
                          {order.status}
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          {formatDate(order.created_at)}
                        </span>
                      </div>
                      <p className="text-sm bg-muted p-3 rounded">
                        {order.raw_message}
                      </p>
                      {order.assigned_customer_id && (
                        <p className="text-sm text-muted-foreground mt-2">
                          Assigned to: {customers.find(c => c.id === order.assigned_customer_id)?.name}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => {
                        setSelectedOrder(order);
                        setSelectedCustomer(order.assigned_customer_id || '');
                      }}
                    >
                      <Check className="h-4 w-4 mr-2" />
                      Confirm Order
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleIgnoreOrder(order.id)}
                    >
                      <X className="h-4 w-4 mr-2" />
                      Ignore
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Processed Orders */}
      {processedOrders.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Processed Orders</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {processedOrders.map((order) => (
                <div key={order.id} className="flex items-center justify-between p-3 border rounded">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant={getStatusColor(order.status) as any}>
                        {order.status}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        {formatDate(order.created_at)}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground truncate">
                      {order.raw_message.substring(0, 100)}...
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Confirm Order Dialog */}
      <Dialog open={!!selectedOrder} onOpenChange={() => setSelectedOrder(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Confirm WhatsApp Order</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Original Message */}
            <div>
              <Label>Original Message</Label>
              <p className="text-sm bg-muted p-3 rounded mt-1">
                {selectedOrder?.raw_message}
              </p>
            </div>

            {/* Customer Selection */}
            <div>
              <Label>Assign to Customer</Label>
              <Select value={selectedCustomer} onValueChange={setSelectedCustomer}>
                <SelectTrigger>
                  <SelectValue placeholder="Select customer (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="walk-in">Walk-in Customer</SelectItem>
                  {customers.filter(c => c.id !== 'walk-in').map((customer) => (
                    <SelectItem key={customer.id} value={customer.id}>
                      {customer.name} - {customer.phone}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Order Items */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Order Items</Label>
                <Button size="sm" variant="outline" onClick={addOrderItem}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Item
                </Button>
              </div>
              
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {orderItems.map((item, index) => (
                  <div key={index} className="flex gap-2 items-center p-2 border rounded">
                    <Select
                      value={item.productId}
                      onValueChange={(value) => updateOrderItem(index, 'productId', value)}
                    >
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Select product" />
                      </SelectTrigger>
                      <SelectContent>
                        {products.map((product) => (
                          <SelectItem key={product.id} value={product.id}>
                            {product.name} - {formatCurrency(product.selling_price)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      value={item.quantity}
                      onChange={(e) => updateOrderItem(index, 'quantity', parseInt(e.target.value) || 1)}
                      className="w-20"
                      min="1"
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => removeOrderItem(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            {/* Order Total */}
            {orderItems.length > 0 && (
              <div className="flex justify-between items-center p-3 bg-muted rounded">
                <span className="font-medium">Total:</span>
                <span className="font-semibold text-lg">{formatCurrency(calculateOrderTotal())}</span>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2">
              <Button 
                onClick={handleConfirmOrder} 
                className="flex-1"
                disabled={orderItems.length === 0}
              >
                Confirm Order
              </Button>
              <Button variant="outline" onClick={() => setSelectedOrder(null)}>
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};