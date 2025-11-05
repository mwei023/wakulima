import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useRole } from '@/hooks/useRole';
import { toast } from '@/hooks/use-toast';
import { formatDate, formatCurrency } from '@/lib/utils';
import { createAuditLog } from '@/lib/auditLog';
import { Plus, RotateCcw, Check, X, DollarSign } from 'lucide-react';

interface Return {
  id: string;
  sale_id: string;
  product_id: string;
  quantity: number;
  reason: string;
  return_type: string;
  refund_amount: number;
  status: string;
  notes: string;
  created_at: string;
}

interface Sale {
  id: string;
  customer_id: string;
  total_amount: number;
  timestamp: string;
}

interface Product {
  id: string;
  name: string;
  category: string;
  selling_price: number;
}

export const ReturnsRefunds = () => {
  const { user } = useAuth();
  const { isAdmin } = useRole();
  const [returns, setReturns] = useState<Return[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [loading, setLoading] = useState(true);

  const [newReturn, setNewReturn] = useState({
    sale_id: '',
    product_id: '',
    quantity: 1,
    reason: '',
    return_type: 'refund',
    refund_amount: 0,
    notes: ''
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      
      const [returnsRes, salesRes, productsRes] = await Promise.all([
        supabase.from('returns').select('*').order('created_at', { ascending: false }),
        supabase.from('sales').select('*').order('timestamp', { ascending: false }).limit(50),
        supabase.from('products_master').select('id, name, category, selling_price')
      ]);

      if (returnsRes.data) setReturns(returnsRes.data);
      if (salesRes.data) setSales(salesRes.data);
      if (productsRes.data) setProducts(productsRes.data);
    } catch (error) {
      console.error('Error loading data:', error);
      toast({
        title: 'Error',
        description: 'Failed to load returns data',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleProductChange = (productId: string) => {
    const product = products.find(p => p.id === productId);
    if (product) {
      setNewReturn({
        ...newReturn,
        product_id: productId,
        refund_amount: product.selling_price * newReturn.quantity
      });
    }
  };

  const handleQuantityChange = (quantity: number) => {
    const product = products.find(p => p.id === newReturn.product_id);
    if (product) {
      setNewReturn({
        ...newReturn,
        quantity,
        refund_amount: product.selling_price * quantity
      });
    }
  };

  const handleCreateReturn = async () => {
    if (!newReturn.sale_id || !newReturn.product_id || !newReturn.reason) {
      toast({
        title: 'Error',
        description: 'Please fill in all required fields',
        variant: 'destructive'
      });
      return;
    }

    try {
      // Get store_id from the sale
      const sale = sales.find(s => s.id === newReturn.sale_id);
      if (!sale) {
        throw new Error('Sale not found');
      }

      const { data: saleData } = await supabase
        .from('sales')
        .select('store_id')
        .eq('id', newReturn.sale_id)
        .single();

      const { data, error } = await supabase
        .from('returns')
        .insert({
          ...newReturn,
          store_id: saleData?.store_id,
          status: 'pending',
          processed_by: user?.id
        })
        .select()
        .single();

      if (error) throw error;

      await createAuditLog({
        action: 'CREATE_RETURN',
        table_name: 'returns',
        record_id: data.id,
        new_values: newReturn
      });

      toast({
        title: 'Return Created',
        description: 'Return request has been created successfully'
      });

      setIsCreating(false);
      setNewReturn({
        sale_id: '',
        product_id: '',
        quantity: 1,
        reason: '',
        return_type: 'refund',
        refund_amount: 0,
        notes: ''
      });
      loadData();
    } catch (error: any) {
      console.error('Error creating return:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to create return',
        variant: 'destructive'
      });
    }
  };

  const handleUpdateStatus = async (returnId: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from('returns')
        .update({ 
          status: newStatus,
          ...(newStatus === 'completed' && { completed_at: new Date().toISOString() })
        })
        .eq('id', returnId);

      if (error) throw error;

      await createAuditLog({
        action: 'UPDATE_RETURN_STATUS',
        table_name: 'returns',
        record_id: returnId,
        new_values: { status: newStatus }
      });

      toast({
        title: 'Status Updated',
        description: `Return marked as ${newStatus}`
      });

      loadData();
    } catch (error: any) {
      console.error('Error updating status:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to update status',
        variant: 'destructive'
      });
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: any = {
      pending: 'secondary',
      approved: 'default',
      rejected: 'destructive',
      completed: 'default'
    };
    return <Badge variant={variants[status] || 'secondary'}>{status}</Badge>;
  };

  if (loading) {
    return <div className="p-8 text-center">Loading returns...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Returns & Refunds</h2>
          <p className="text-muted-foreground">Manage product returns and customer refunds</p>
        </div>
        <Dialog open={isCreating} onOpenChange={setIsCreating}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Process Return
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Process Return/Refund</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Sale Reference *</Label>
                <Select value={newReturn.sale_id} onValueChange={(value) => setNewReturn({...newReturn, sale_id: value})}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select sale" />
                  </SelectTrigger>
                  <SelectContent>
                    {sales.map(sale => (
                      <SelectItem key={sale.id} value={sale.id}>
                        {sale.id.slice(0, 8)}... - {formatCurrency(sale.total_amount)} ({formatDate(sale.timestamp)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Product *</Label>
                <Select value={newReturn.product_id} onValueChange={handleProductChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select product" />
                  </SelectTrigger>
                  <SelectContent>
                    {products.map(product => (
                      <SelectItem key={product.id} value={product.id}>
                        {product.name} - {formatCurrency(product.selling_price)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Quantity *</Label>
                <Input
                  type="number"
                  min="1"
                  value={newReturn.quantity}
                  onChange={(e) => handleQuantityChange(parseInt(e.target.value) || 1)}
                />
              </div>
              <div>
                <Label>Return Type *</Label>
                <Select value={newReturn.return_type} onValueChange={(value) => setNewReturn({...newReturn, return_type: value})}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="refund">Refund</SelectItem>
                    <SelectItem value="exchange">Exchange</SelectItem>
                    <SelectItem value="credit">Store Credit</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Refund Amount *</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={newReturn.refund_amount}
                  onChange={(e) => setNewReturn({...newReturn, refund_amount: parseFloat(e.target.value) || 0})}
                />
              </div>
              <div>
                <Label>Reason *</Label>
                <Textarea
                  value={newReturn.reason}
                  onChange={(e) => setNewReturn({...newReturn, reason: e.target.value})}
                  placeholder="Reason for return (e.g., defective, wrong item)"
                  required
                />
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea
                  value={newReturn.notes}
                  onChange={(e) => setNewReturn({...newReturn, notes: e.target.value})}
                  placeholder="Additional notes"
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={handleCreateReturn} className="flex-1">Process Return</Button>
                <Button variant="outline" onClick={() => setIsCreating(false)} className="flex-1">Cancel</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4">
        {returns.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <RotateCcw className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">No Returns Yet</h3>
              <p className="text-muted-foreground mb-4">
                Process your first return or refund request
              </p>
              <Button onClick={() => setIsCreating(true)}>Process Return</Button>
            </CardContent>
          </Card>
        ) : (
          returns.map(returnItem => {
            const product = products.find(p => p.id === returnItem.product_id);
            
            return (
              <Card key={returnItem.id}>
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <RotateCcw className="h-4 w-4" />
                        {product?.name || 'Unknown Product'}
                      </CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">
                        Sale: {returnItem.sale_id.slice(0, 8)}...
                      </p>
                    </div>
                    {getStatusBadge(returnItem.status)}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4 text-sm mb-4">
                    <div>
                      <p className="text-muted-foreground">Quantity</p>
                      <p className="font-semibold">{returnItem.quantity}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Refund Amount</p>
                      <p className="font-semibold">{formatCurrency(returnItem.refund_amount)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Type</p>
                      <p className="font-semibold capitalize">{returnItem.return_type}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Created</p>
                      <p className="font-semibold">{formatDate(returnItem.created_at)}</p>
                    </div>
                  </div>
                  <div className="mb-4 p-2 bg-muted rounded text-sm">
                    <p className="text-muted-foreground mb-1">Reason:</p>
                    <p>{returnItem.reason}</p>
                  </div>
                  {returnItem.notes && (
                    <div className="mb-4 p-2 bg-muted rounded text-sm">
                      <p className="text-muted-foreground mb-1">Notes:</p>
                      <p>{returnItem.notes}</p>
                    </div>
                  )}
                  {isAdmin && returnItem.status === 'pending' && (
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => handleUpdateStatus(returnItem.id, 'approved')}>
                        <Check className="h-4 w-4 mr-1" />
                        Approve
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => handleUpdateStatus(returnItem.id, 'rejected')}>
                        <X className="h-4 w-4 mr-1" />
                        Reject
                      </Button>
                    </div>
                  )}
                  {isAdmin && returnItem.status === 'approved' && (
                    <Button size="sm" onClick={() => handleUpdateStatus(returnItem.id, 'completed')}>
                      <DollarSign className="h-4 w-4 mr-1" />
                      Mark Completed
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
};
