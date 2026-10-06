import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useStore } from '@/store/useStore';
import { useRole } from '@/hooks/useRole';
import { toast } from '@/hooks/use-toast';
import { formatDate, formatCurrency } from '@/lib/utils';
import { createAuditLog } from '@/lib/auditLog';
import { createLocalReturn, updateLocalReturnStatus, getLocalReturns, LocalReturn } from '@/lib/db';
import { Plus, RotateCcw, Check, X, DollarSign } from 'lucide-react';

interface SaleLine {
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
}

interface SaleSummary {
  id: string;
  customer_id: string;
  total_amount: number;
  timestamp: string;
  payment_method: string;
  items: SaleLine[];
}

const statusVariants: Record<string, 'secondary' | 'default' | 'destructive'> = {
  pending: 'secondary',
  approved: 'default',
  rejected: 'destructive',
  completed: 'default'
};

export const ReturnsRefunds = () => {
  const { isAdmin } = useRole();
  const storeSales = useStore(s => s.sales);
  const reloadStore = useStore(s => s.loadData);
  const [returns, setReturns] = useState<LocalReturn[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [loading, setLoading] = useState(true);

  const [newReturn, setNewReturn] = useState({
    sale_id: '',
    product_id: '',
    quantity: 1,
    reason: '',
    return_type: 'refund',
    notes: ''
  });

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setReturns(await getLocalReturns());
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

  const sales: SaleSummary[] = useMemo(
    () =>
      storeSales.map(s => ({
        id: s.id,
        customer_id: s.customer_id ?? '',
        total_amount: s.total_amount,
        timestamp: s.timestamp,
        payment_method: s.payment_method,
        items: s.items ?? []
      })),
    [storeSales]
  );

  const selectedSale = sales.find(s => s.id === newReturn.sale_id) ?? null;

  // Units already returned (not rejected) per product for the selected sale.
  const returnedByProduct = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of returns) {
      if (r.sale_id === newReturn.sale_id && r.status !== 'rejected') {
        map[r.product_id] = (map[r.product_id] ?? 0) + r.quantity;
      }
    }
    return map;
  }, [returns, newReturn.sale_id]);

  const selectedLine = selectedSale?.items.find(i => i.product_id === newReturn.product_id) ?? null;
  const returnable = selectedLine ? selectedLine.quantity - (returnedByProduct[selectedLine.product_id] ?? 0) : 0;
  // Refund is always computed from what the customer actually paid — never editable.
  const computedRefund = selectedLine ? Math.round(selectedLine.unit_price * newReturn.quantity * 100) / 100 : 0;

  const handleSaleChange = (saleId: string) => {
    setNewReturn({ ...newReturn, sale_id: saleId, product_id: '', quantity: 1 });
  };

  const handleProductChange = (productId: string) => {
    setNewReturn(prev => ({ ...prev, product_id: productId, quantity: 1 }));
  };

  const handleQuantityChange = (quantity: number) => {
    setNewReturn(prev => ({ ...prev, quantity }));
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
    if (newReturn.quantity < 1 || newReturn.quantity > returnable) {
      toast({
        title: 'Error',
        description: `Quantity must be between 1 and ${returnable} (purchased minus already returned)`,
        variant: 'destructive'
      });
      return;
    }

    try {
      const data = await createLocalReturn({
        sale_id: newReturn.sale_id,
        product_id: newReturn.product_id,
        quantity: newReturn.quantity,
        reason: newReturn.reason,
        return_type: newReturn.return_type,
        notes: newReturn.notes
      });

      await createAuditLog({
        action: 'CREATE_RETURN',
        table_name: 'returns',
        record_id: data.id,
        new_values: { ...newReturn, refund_amount: data.refund_amount }
      });

      toast({
        title: 'Return Created',
        description: `Refund of ${formatCurrency(data.refund_amount)} pending approval`
      });

      setIsCreating(false);
      setNewReturn({
        sale_id: '',
        product_id: '',
        quantity: 1,
        reason: '',
        return_type: 'refund',
        notes: ''
      });
      loadData();
    } catch (error: unknown) {
      console.error('Error creating return:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to create return',
        variant: 'destructive'
      });
    }
  };

  const handleUpdateStatus = async (returnId: string, newStatus: string) => {
    try {
      await updateLocalReturnStatus(returnId, newStatus);

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
      // Refresh inventory/customer figures after a completed return restocks and reverses money.
      if (newStatus === 'completed') await reloadStore();
    } catch (error: unknown) {
      console.error('Error updating status:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to update status',
        variant: 'destructive'
      });
    }
  };

  const getStatusBadge = (status: string) => {
    return <Badge variant={statusVariants[status] ?? 'secondary'}>{status}</Badge>;
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
                <Select value={newReturn.sale_id} onValueChange={handleSaleChange}>
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
                <Label>Product (from this sale) *</Label>
                <Select
                  value={newReturn.product_id}
                  onValueChange={handleProductChange}
                  disabled={!selectedSale || selectedSale.items.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={selectedSale ? 'Select product' : 'Select a sale first'} />
                  </SelectTrigger>
                  <SelectContent>
                    {selectedSale?.items.map(line => {
                      const remaining = line.quantity - (returnedByProduct[line.product_id] ?? 0);
                      return (
                        <SelectItem key={line.product_id} value={line.product_id} disabled={remaining <= 0}>
                          {line.product_name} — bought {line.quantity} @ {formatCurrency(line.unit_price)}
                          {remaining <= 0 ? ' (fully returned)' : `, ${remaining} returnable`}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Quantity * {selectedLine ? `(max ${returnable})` : ''}</Label>
                <Input
                  type="number"
                  min="1"
                  max={returnable || undefined}
                  disabled={!selectedLine}
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
                <Label>Refund Amount (computed from sale price)</Label>
                <Input
                  type="text"
                  readOnly
                  disabled
                  value={selectedLine ? formatCurrency(computedRefund) : '—'}
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
            const product = storeSales
              .flatMap(s => s.items ?? [])
              .find(i => i.product_id === returnItem.product_id);

            return (
              <Card key={returnItem.id}>
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <RotateCcw className="h-4 w-4" />
                        {product?.product_name || returnItem.product_id}
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
