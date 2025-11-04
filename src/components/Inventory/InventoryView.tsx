import { useState } from 'react';
import { Package, AlertTriangle, Edit, Search, Plus, Database, ChevronDown } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useStore } from '@/store/useStore';
import { useRole } from '@/hooks/useRole';
import { formatCurrency } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { Product } from '@/types';
import { CategorySelector } from './CategorySelector';
import { populateDatabase, parsedProducts } from '../../../scripts/populateProducts.js';
import { supabase } from '@/integrations/supabase/client';

export const InventoryView = () => {
  const { products, updateStock, addProduct, updateProduct } = useStore();
  const { isAdmin } = useRole();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isPopulating, setIsPopulating] = useState(false);
  const [isLowStockOpen, setIsLowStockOpen] = useState(true);

  const categories = [...new Set(products.map(p => p.category).filter(cat => cat && cat.trim() !== ''))];
  
  const filteredProducts = products.filter(product => {
    const matchesSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         product.category.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || product.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const lowStockProducts = products.filter(p => p.stock_quantity <= p.reorder_level);

  const handleUpdateProduct = async (productData: Product) => {
    if (!editingProduct) return;
    
    try {
      await updateProduct(productData);
      setEditingProduct(null);
      
      toast({
        title: "Product Updated",
        description: `${productData.name} has been updated`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update product",
        variant: "destructive"
      });
    }
  };

  const handleAddProduct = async (productData: Omit<Product, 'id' | 'created_at' | 'updated_at'>) => {
    try {
      const newProduct: Product = {
        ...productData,
        id: crypto.randomUUID(),
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

  const handlePopulateProducts = async () => {
    if (isPopulating) return;

    setIsPopulating(true);
    try {
      const { currentStoreId } = useStore.getState();
      if (!currentStoreId) {
        toast({
          title: "Error",
          description: "No store assigned to user",
          variant: "destructive"
        });
        return;
      }

      toast({
        title: "Starting Population",
        description: `Populating ${parsedProducts.length} products...`
      });

      const result = await populateDatabase(supabase, currentStoreId);

      toast({
        title: "Population Complete",
        description: `Successfully added ${result.successCount} products. ${result.errorCount} errors.`
      });

      // Refresh the data
      await useStore.getState().loadData();

    } catch (error) {
      console.error('Population error:', error);
      toast({
        title: "Error",
        description: "Failed to populate products",
        variant: "destructive"
      });
    } finally {
      setIsPopulating(false);
    }
  };

  

  return (
    <div className="p-6 space-y-6">
      {/* Stock Alerts */}
      {lowStockProducts.length > 0 && (
        <Collapsible open={isLowStockOpen} onOpenChange={setIsLowStockOpen}>
          <Card className="border-destructive">
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-destructive">
                    <AlertTriangle className="h-5 w-5" />
                    Low Stock Alert ({lowStockProducts.length} items)
                  </div>
                  <ChevronDown className={`h-5 w-5 transition-transform ${isLowStockOpen ? '' : '-rotate-90'}`} />
                </CardTitle>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
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
            </CollapsibleContent>
          </Card>
        </Collapsible>
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
        
        {isAdmin && (
          <>
            <Button
              onClick={handlePopulateProducts}
              disabled={isPopulating}
              variant="outline"
            >
              <Database className="h-4 w-4 mr-2" />
              {isPopulating ? 'Populating...' : `Populate Products (${parsedProducts.length})`}
            </Button>
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
                <ProductForm onSubmit={handleAddProduct} isAdmin={isAdmin} />
              </DialogContent>
            </Dialog>
          </>
        )}
      </div>

      {/* Products Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredProducts.map((product) => (
          <Card key={product.id}>
            <CardContent className="p-4">
              <div className="flex justify-between items-start mb-2">
                <h3 className="font-semibold">{product.name}</h3>
                {isAdmin && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditingProduct(product)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                )}
              </div>
              
              <div className="space-y-2">
                <Badge variant="outline">{product.category}</Badge>
                <div className={`grid gap-2 text-sm ${isAdmin ? 'grid-cols-2' : 'grid-cols-1'}`}>
                  <div>
                    <p className="text-muted-foreground">Selling Price</p>
                    <p className="font-medium">{formatCurrency(product.selling_price)}</p>
                  </div>
                  {isAdmin && (
                    <div>
                      <p className="text-muted-foreground">Cost Price</p>
                      <p className="font-medium">{formatCurrency(product.cost_price)}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-muted-foreground">Stock</p>
                    <Badge variant={product.stock_quantity <= product.reorder_level ? "destructive" : "secondary"}>
                      {product.stock_quantity} {product.unit}s
                    </Badge>
                  </div>
                  {isAdmin && (
                    <div>
                      <p className="text-muted-foreground">Profit/Unit</p>
                      <p className="font-medium text-success">
                        {formatCurrency(product.selling_price - product.cost_price)}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Edit Product Dialog */}
      <Dialog open={!!editingProduct} onOpenChange={() => setEditingProduct(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Product</DialogTitle>
          </DialogHeader>
          <ProductEditForm 
            product={editingProduct} 
            onSubmit={handleUpdateProduct}
            isAdmin={isAdmin}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
};

const ProductForm = ({ 
  product, 
  onSubmit,
  isAdmin = false
}: { 
  product?: Product; 
  onSubmit: (data: Omit<Product, 'id' | 'created_at' | 'updated_at'>) => void;
  isAdmin?: boolean;
}) => {
  const [formData, setFormData] = useState({
    name: product?.name || '',
    category: product?.category || '',
    unit: product?.unit || '',
    selling_price: product?.selling_price || 0,
    cost_price: product?.cost_price || 0,
    stock_quantity: product?.stock_quantity || 0,
    reorder_level: product?.reorder_level || 0,
    barcode: product?.barcode || '',
    store_id: product?.store_id || '9ddf957b-327f-4b93-9374-7455d2a7480b' // Default store or from product
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
          <CategorySelector
            value={formData.category}
            onChange={(category) => setFormData({...formData, category})}
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
          <Label htmlFor="barcode">Barcode</Label>
          <Input
            id="barcode"
            value={formData.barcode}
            onChange={(e) => setFormData({...formData, barcode: e.target.value})}
          />
        </div>
        
        {isAdmin && (
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
        )}
        
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

        {isAdmin && (
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
        )}
      </div>
      
      <Button type="submit" className="w-full">
        {product ? 'Update Product' : 'Add Product'}
      </Button>
    </form>
  );
};

const ProductEditForm = ({ 
  product, 
  onSubmit,
  isAdmin = false
}: { 
  product?: Product | null; 
  onSubmit: (data: Product) => void;
  isAdmin?: boolean;
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
    if (!product) return;
    onSubmit({ 
      ...product, 
      ...formData,
      updated_at: new Date().toISOString()
    });
  };

  if (!product) return null;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Product Name - Full Width */}
      <div>
        <Label htmlFor="edit-name" className="text-base font-medium">Product Name</Label>
        <Input
          id="edit-name"
          value={formData.name}
          onChange={(e) => setFormData({...formData, name: e.target.value})}
          required
          className="mt-2 text-lg p-4 border-2 border-primary/20 focus:border-primary rounded-lg"
        />
      </div>
      
      {/* Two Column Layout */}
      <div className="grid grid-cols-2 gap-6">
        {/* Left Column */}
        <div className="space-y-4">
          <div>
            <Label htmlFor="edit-category" className="text-base font-medium">Category</Label>
            <Input
              id="edit-category"
              value={formData.category}
              onChange={(e) => setFormData({...formData, category: e.target.value})}
              required
              className="mt-2 p-3"
              disabled={!isAdmin}
            />
          </div>
          
          {isAdmin && (
            <div>
              <Label htmlFor="edit-cost-price" className="text-base font-medium">Cost Price (KES)</Label>
              <Input
                id="edit-cost-price"
                type="number"
                value={formData.cost_price}
                onChange={(e) => setFormData({...formData, cost_price: Number(e.target.value)})}
                required
                className="mt-2 p-3"
              />
            </div>
          )}
          
          <div>
            <Label htmlFor="edit-stock" className="text-base font-medium">Stock Quantity</Label>
            <Input
              id="edit-stock"
              type="number"
              value={formData.stock_quantity}
              onChange={(e) => setFormData({...formData, stock_quantity: Number(e.target.value)})}
              required
              className="mt-2 p-3"
            />
          </div>
        </div>
        
        {/* Right Column */}
        <div className="space-y-4">
          <div>
            <Label htmlFor="edit-unit" className="text-base font-medium">Unit</Label>
            <Input
              id="edit-unit"
              value={formData.unit}
              onChange={(e) => setFormData({...formData, unit: e.target.value})}
              required
              className="mt-2 p-3"
              disabled={!isAdmin}
            />
          </div>

          <div>
            <Label htmlFor="edit-selling-price" className="text-base font-medium">Selling Price (KES)</Label>
            <Input
              id="edit-selling-price"
              type="number"
              value={formData.selling_price}
              onChange={(e) => setFormData({...formData, selling_price: Number(e.target.value)})}
              required
              className="mt-2 p-3"
            />
          </div>

          <div>
            <Label htmlFor="edit-barcode" className="text-base font-medium">Barcode</Label>
            <Input
              id="edit-barcode"
              value={formData.barcode}
              onChange={(e) => setFormData({...formData, barcode: e.target.value})}
              className="mt-2 p-3"
            />
          </div>

          {isAdmin && (
            <div>
              <Label htmlFor="edit-reorder" className="text-base font-medium">Reorder Level</Label>
              <Input
                id="edit-reorder"
                type="number"
                value={formData.reorder_level}
                onChange={(e) => setFormData({...formData, reorder_level: Number(e.target.value)})}
                required
                className="mt-2 p-3"
              />
            </div>
          )}
        </div>
      </div>
      
      {/* Update Button */}
      <Button 
        type="submit" 
        className="w-full h-12 text-lg font-semibold bg-success hover:bg-success/90"
      >
        Update Product
      </Button>
    </form>
  );
};