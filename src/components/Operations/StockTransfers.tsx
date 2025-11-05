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
import { Plus, ArrowRight, Check, X, Clock, Truck } from 'lucide-react';

interface Store {
  id: string;
  name: string;
  location: string;
}

interface Product {
  id: string;
  name: string;
  category: string;
  unit: string;
}

interface StockTransfer {
  id: string;
  from_store_id: string;
  to_store_id: string;
  product_id: string;
  quantity: number;
  status: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

export const StockTransfers = () => {
  const { user } = useAuth();
  const { isAdmin } = useRole();
  const [stores, setStores] = useState<Store[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [transfers, setTransfers] = useState<StockTransfer[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [loading, setLoading] = useState(true);

  const [newTransfer, setNewTransfer] = useState({
    from_store_id: '',
    to_store_id: '',
    product_id: '',
    quantity: 1,
    notes: ''
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      
      const [storesRes, productsRes, transfersRes] = await Promise.all([
        supabase.from('stores').select('*'),
        supabase.from('products_master').select('id, name, category, unit'),
        supabase.from('stock_transfers').select('*').order('created_at', { ascending: false })
      ]);

      if (storesRes.data) setStores(storesRes.data);
      if (productsRes.data) setProducts(productsRes.data);
      if (transfersRes.data) setTransfers(transfersRes.data);
    } catch (error) {
      console.error('Error loading data:', error);
      toast({
        title: 'Error',
        description: 'Failed to load transfer data',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTransfer = async () => {
    if (!newTransfer.from_store_id || !newTransfer.to_store_id || !newTransfer.product_id) {
      toast({
        title: 'Error',
        description: 'Please fill in all required fields',
        variant: 'destructive'
      });
      return;
    }

    if (newTransfer.from_store_id === newTransfer.to_store_id) {
      toast({
        title: 'Error',
        description: 'Source and destination stores must be different',
        variant: 'destructive'
      });
      return;
    }

    try {
      const { data, error } = await supabase
        .from('stock_transfers')
        .insert({
          ...newTransfer,
          requested_by: user?.id,
          status: 'pending'
        })
        .select()
        .single();

      if (error) throw error;

      await createAuditLog({
        action: 'CREATE_TRANSFER',
        table_name: 'stock_transfers',
        record_id: data.id,
        new_values: newTransfer
      });

      toast({
        title: 'Transfer Created',
        description: 'Stock transfer request has been created'
      });

      setIsCreating(false);
      setNewTransfer({
        from_store_id: '',
        to_store_id: '',
        product_id: '',
        quantity: 1,
        notes: ''
      });
      loadData();
    } catch (error: any) {
      console.error('Error creating transfer:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to create transfer',
        variant: 'destructive'
      });
    }
  };

  const handleUpdateStatus = async (transferId: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from('stock_transfers')
        .update({ 
          status: newStatus,
          ...(newStatus === 'approved' && { approved_by: user?.id }),
          ...(newStatus === 'completed' && { completed_at: new Date().toISOString() })
        })
        .eq('id', transferId);

      if (error) throw error;

      await createAuditLog({
        action: 'UPDATE_TRANSFER_STATUS',
        table_name: 'stock_transfers',
        record_id: transferId,
        new_values: { status: newStatus }
      });

      toast({
        title: 'Status Updated',
        description: `Transfer marked as ${newStatus}`
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
      in_transit: 'default',
      completed: 'default',
      cancelled: 'destructive'
    };
    return <Badge variant={variants[status] || 'secondary'}>{status}</Badge>;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending': return <Clock className="h-4 w-4" />;
      case 'approved': return <Check className="h-4 w-4" />;
      case 'in_transit': return <Truck className="h-4 w-4" />;
      case 'completed': return <Check className="h-4 w-4" />;
      case 'cancelled': return <X className="h-4 w-4" />;
      default: return <Clock className="h-4 w-4" />;
    }
  };

  if (loading) {
    return <div className="p-8 text-center">Loading transfers...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Stock Transfers</h2>
          <p className="text-muted-foreground">Manage inventory transfers between stores</p>
        </div>
        <Dialog open={isCreating} onOpenChange={setIsCreating}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New Transfer
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Stock Transfer</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>From Store *</Label>
                <Select value={newTransfer.from_store_id} onValueChange={(value) => setNewTransfer({...newTransfer, from_store_id: value})}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select source store" />
                  </SelectTrigger>
                  <SelectContent>
                    {stores.map(store => (
                      <SelectItem key={store.id} value={store.id}>{store.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>To Store *</Label>
                <Select value={newTransfer.to_store_id} onValueChange={(value) => setNewTransfer({...newTransfer, to_store_id: value})}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select destination store" />
                  </SelectTrigger>
                  <SelectContent>
                    {stores.map(store => (
                      <SelectItem key={store.id} value={store.id}>{store.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Product *</Label>
                <Select value={newTransfer.product_id} onValueChange={(value) => setNewTransfer({...newTransfer, product_id: value})}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select product" />
                  </SelectTrigger>
                  <SelectContent>
                    {products.map(product => (
                      <SelectItem key={product.id} value={product.id}>
                        {product.name} ({product.category})
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
                  value={newTransfer.quantity}
                  onChange={(e) => setNewTransfer({...newTransfer, quantity: parseInt(e.target.value) || 1})}
                />
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea
                  value={newTransfer.notes}
                  onChange={(e) => setNewTransfer({...newTransfer, notes: e.target.value})}
                  placeholder="Optional transfer notes"
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={handleCreateTransfer} className="flex-1">Create Transfer</Button>
                <Button variant="outline" onClick={() => setIsCreating(false)} className="flex-1">Cancel</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4">
        {transfers.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <Truck className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">No Transfers Yet</h3>
              <p className="text-muted-foreground mb-4">
                Create your first stock transfer to move inventory between stores
              </p>
              <Button onClick={() => setIsCreating(true)}>Create Transfer</Button>
            </CardContent>
          </Card>
        ) : (
          transfers.map(transfer => {
            const fromStore = stores.find(s => s.id === transfer.from_store_id);
            const toStore = stores.find(s => s.id === transfer.to_store_id);
            const product = products.find(p => p.id === transfer.product_id);

            return (
              <Card key={transfer.id}>
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <CardTitle className="text-lg flex items-center gap-2">
                        {getStatusIcon(transfer.status)}
                        {product?.name || 'Unknown Product'}
                      </CardTitle>
                      <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                        <span>{fromStore?.name || 'Unknown'}</span>
                        <ArrowRight className="h-4 w-4" />
                        <span>{toStore?.name || 'Unknown'}</span>
                      </div>
                    </div>
                    {getStatusBadge(transfer.status)}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4 text-sm mb-4">
                    <div>
                      <p className="text-muted-foreground">Quantity</p>
                      <p className="font-semibold">{transfer.quantity} {product?.unit || 'units'}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Created</p>
                      <p className="font-semibold">{formatDate(transfer.created_at)}</p>
                    </div>
                  </div>
                  {transfer.notes && (
                    <div className="mb-4 p-2 bg-muted rounded text-sm">
                      <p className="text-muted-foreground mb-1">Notes:</p>
                      <p>{transfer.notes}</p>
                    </div>
                  )}
                  {isAdmin && transfer.status === 'pending' && (
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => handleUpdateStatus(transfer.id, 'approved')}>
                        <Check className="h-4 w-4 mr-1" />
                        Approve
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleUpdateStatus(transfer.id, 'in_transit')}>
                        <Truck className="h-4 w-4 mr-1" />
                        In Transit
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => handleUpdateStatus(transfer.id, 'cancelled')}>
                        <X className="h-4 w-4 mr-1" />
                        Cancel
                      </Button>
                    </div>
                  )}
                  {isAdmin && transfer.status === 'in_transit' && (
                    <Button size="sm" onClick={() => handleUpdateStatus(transfer.id, 'completed')}>
                      <Check className="h-4 w-4 mr-1" />
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
