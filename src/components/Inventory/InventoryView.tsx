import { useState } from 'react';
import { useStore } from '@/store/useStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { AlertTriangle, Package, Search, Edit, Plus } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';

export const InventoryView = () => {
  const { products, updateStock, currentUser } = useStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [newStock, setNewStock] = useState('');

  const filteredProducts = products.filter(product =>
    product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    product.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const lowStockProducts = products.filter(p => p.stock_quantity <= p.reorder_level);
  const outOfStockProducts = products.filter(p => p.stock_quantity <= 0);

  const getStockStatus = (product: any) => {
    if (product.stock_quantity <= 0) return { status: 'Out of Stock', variant: 'destructive' };
    if (product.stock_quantity <= product.reorder_level) return { status: 'Low Stock', variant: 'secondary' };
    return { status: 'In Stock', variant: 'default' };
  };

  const handleUpdateStock = () => {
    if (editingProduct && newStock) {
      const quantity = parseInt(newStock);
      if (quantity >= 0) {
        updateStock(editingProduct.id, quantity);
        toast({
          title: "Stock Updated",
          description: `${editingProduct.name} stock updated to ${quantity} ${editingProduct.unit}`,
        });
        setEditingProduct(null);
        setNewStock('');
      }
    }
  };

  const canEditStock = currentUser?.role === 'admin';

  return (
    <div className="space-y-6">
      {/* Stock Alerts */}
      {(lowStockProducts.length > 0 || outOfStockProducts.length > 0) && (
        <Card className="border-warning">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-warning">
              <AlertTriangle className="h-5 w-5" />
              Stock Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            {outOfStockProducts.length > 0 && (
              <div className="mb-4">
                <h4 className="font-medium text-destructive mb-2">Out of Stock ({outOfStockProducts.length})</h4>
                <div className="flex flex-wrap gap-2">
                  {outOfStockProducts.map(product => (
                    <Badge key={product.id} variant="destructive">{product.name}</Badge>
                  ))}
                </div>
              </div>
            )}
            {lowStockProducts.length > 0 && (
              <div>
                <h4 className="font-medium text-warning mb-2">Low Stock ({lowStockProducts.length})</h4>
                <div className="flex flex-wrap gap-2">
                  {lowStockProducts.map(product => (
                    <Badge key={product.id} variant="secondary">
                      {product.name} ({product.stock_quantity} left)
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Inventory List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Inventory Management
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <Input
              placeholder="Search products..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-sm"
            />
          </div>

          <div className="grid gap-4">
            {filteredProducts.map((product) => {
              const stockStatus = getStockStatus(product);
              return (
                <div key={product.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h4 className="font-medium">{product.name}</h4>
                      <Badge variant={stockStatus.variant as any}>
                        {stockStatus.status}
                      </Badge>
                      {product.stock_quantity <= product.reorder_level && (
                        <AlertTriangle className="h-4 w-4 text-warning" />
                      )}
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-muted-foreground">
                      <div>
                        <p className="font-medium">Category</p>
                        <p>{product.category}</p>
                      </div>
                      <div>
                        <p className="font-medium">Stock</p>
                        <p>{product.stock_quantity} {product.unit}</p>
                      </div>
                      <div>
                        <p className="font-medium">Reorder Level</p>
                        <p>{product.reorder_level} {product.unit}</p>
                      </div>
                      <div>
                        <p className="font-medium">Price</p>
                        <p>{formatCurrency(product.selling_price)}</p>
                      </div>
                    </div>
                  </div>
                  {canEditStock && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditingProduct(product);
                        setNewStock(product.stock_quantity.toString());
                      }}
                    >
                      <Edit className="h-4 w-4 mr-2" />
                      Update Stock
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Edit Stock Dialog */}
      <Dialog open={!!editingProduct} onOpenChange={() => setEditingProduct(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Stock - {editingProduct?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="current-stock">Current Stock</Label>
              <p className="text-sm text-muted-foreground">
                {editingProduct?.stock_quantity} {editingProduct?.unit}
              </p>
            </div>
            <div>
              <Label htmlFor="new-stock">New Stock Quantity</Label>
              <Input
                id="new-stock"
                type="number"
                value={newStock}
                onChange={(e) => setNewStock(e.target.value)}
                placeholder="Enter new stock quantity"
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleUpdateStock} className="flex-1">
                Update Stock
              </Button>
              <Button variant="outline" onClick={() => setEditingProduct(null)}>
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};