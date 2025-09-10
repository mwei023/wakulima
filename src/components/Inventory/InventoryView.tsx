import { useState } from 'react';
import { Package, AlertTriangle, Edit, Search, Plus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useStore } from '@/store/useStore';
import { formatCurrency } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { Product } from '@/types';

export const InventoryView = () => {
  const { products, updateStock, addProduct, currentUser } = useStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [newStock, setNewStock] = useState<number>(0);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

  const categories = [...new Set(products.map(p => p.category))];
  
  const filteredProducts = products.filter(product => {
    const matchesSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         product.category.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || product.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const lowStockProducts = products.filter(p => p.stock_quantity <= p.reorder_level);

  const handleUpdateStock = async () => {
    if (!editingProduct) return;
    
    await updateStock(editingProduct.id, newStock);
    setEditingProduct(null);
    setNewStock(0);
    
    toast({
      title: "Stock Updated",
      description: `${editingProduct.name} stock updated to ${newStock}`,
    });
  };

  const handleAddProduct = async (productData: Omit<Product, 'id' | 'created_at' | 'updated_at'>) => {
    try {
      const newProduct: Product = {
        ...productData,
        id: Date.now().toString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      
      await addProduct(newProduct);
      
      toast({
        title: "Product Added",
        description: `${productData.name} has been added to inventory`
      });
      
      setIsAddDialogOpen(false);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to add product",
        variant: "destructive"
      });
    }
  };

  const canEditStock = currentUser?.role === 'admin';

  return (
    <div className="p-6 space-y-6">
      {/* Stock Alerts */}
      {lowStockProducts.length > 0 && (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Low Stock Alert ({lowStockProducts.length} items)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {lowStockProducts.map((product) => (
                <div key={product.id} className="p-3 border border-destructive rounded-lg">
                  <h4 className="font-medium text-destructive">{product.name}</h4>
                  <p className="text-sm text-muted-foreground">
                    Stock: {product.stock_quantity} {product.unit}s (Min: {product.reorder_level})
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
        <div className="flex-1 flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search products..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={selectedCategory} onValueChange={setSelectedCategory}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map(cat => (
                <SelectItem key={cat} value={cat}>{cat}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        {canEditStock && (
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Product
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Add New Product</DialogTitle>
              </DialogHeader>
              <ProductForm onSubmit={handleAddProduct} />
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Products Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredProducts.map((product) => (
          <Card key={product.id}>
            <CardContent className="p-4">
              <div className="flex justify-between items-start mb-2">
                <h3 className="font-semibold">{product.name}</h3>
                {canEditStock && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditingProduct(product);
                      setNewStock(product.stock_quantity);
                    }}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                )}
              </div>
              
              <div className="space-y-2">
                <Badge variant="outline">{product.category}</Badge>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="text-muted-foreground">Selling Price</p>
                    <p className="font-medium">{formatCurrency(product.selling_price)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Cost Price</p>
                    <p className="font-medium">{formatCurrency(product.cost_price)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Stock</p>
                    <Badge variant={product.stock_quantity <= product.reorder_level ? "destructive" : "secondary"}>
                      {product.stock_quantity} {product.unit}s
                    </Badge>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Profit/Unit</p>
                    <p className="font-medium text-success">
                      {formatCurrency(product.selling_price - product.cost_price)}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Edit Stock Dialog */}
      <Dialog open={!!editingProduct} onOpenChange={() => setEditingProduct(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Stock - {editingProduct?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="current-stock">Current Stock</Label>
              <Input
                id="current-stock"
                value={`${editingProduct?.stock_quantity} ${editingProduct?.unit}s`}
                disabled
              />
            </div>
            <div>
              <Label htmlFor="new-stock">New Stock Quantity</Label>
              <Input
                id="new-stock"
                type="number"
                value={newStock}
                onChange={(e) => setNewStock(Number(e.target.value))}
                min="0"
              />
            </div>
            <Button onClick={handleUpdateStock} className="w-full">
              Update Stock
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const ProductForm = ({ 
  product, 
  onSubmit 
}: { 
  product?: Product; 
  onSubmit: (data: Omit<Product, 'id' | 'created_at' | 'updated_at'>) => void; 
}) => {
  const [formData, setFormData] = useState({
    name: product?.name || '',
    category: product?.category || '',
    unit: product?.unit || '',
    selling_price: product?.selling_price || 0,
    cost_price: product?.cost_price || 0,
    stock_quantity: product?.stock_quantity || 0,
    reorder_level: product?.reorder_level || 0,
    barcode: product?.barcode || ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <Label htmlFor="name">Product Name</Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => setFormData({...formData, name: e.target.value})}
            required
          />
        </div>
        
        <div>
          <Label htmlFor="category">Category</Label>
          <Input
            id="category"
            value={formData.category}
            onChange={(e) => setFormData({...formData, category: e.target.value})}
            required
          />
        </div>
        
        <div>
          <Label htmlFor="unit">Unit</Label>
          <Input
            id="unit"
            value={formData.unit}
            onChange={(e) => setFormData({...formData, unit: e.target.value})}
            required
          />
        </div>
        
        <div>
          <Label htmlFor="cost_price">Cost Price (KES)</Label>
          <Input
            id="cost_price"
            type="number"
            value={formData.cost_price}
            onChange={(e) => setFormData({...formData, cost_price: Number(e.target.value)})}
            required
          />
        </div>
        
        <div>
          <Label htmlFor="selling_price">Selling Price (KES)</Label>
          <Input
            id="selling_price"
            type="number"
            value={formData.selling_price}
            onChange={(e) => setFormData({...formData, selling_price: Number(e.target.value)})}
            required
          />
        </div>
        
        <div>
          <Label htmlFor="stock_quantity">Stock Quantity</Label>
          <Input
            id="stock_quantity"
            type="number"
            value={formData.stock_quantity}
            onChange={(e) => setFormData({...formData, stock_quantity: Number(e.target.value)})}
            required
          />
        </div>
        
        <div>
          <Label htmlFor="reorder_level">Reorder Level</Label>
          <Input
            id="reorder_level"
            type="number"
            value={formData.reorder_level}
            onChange={(e) => setFormData({...formData, reorder_level: Number(e.target.value)})}
            required
          />
        </div>
      </div>
      
      <Button type="submit" className="w-full">
        {product ? 'Update Product' : 'Add Product'}
      </Button>
    </form>
  );
};