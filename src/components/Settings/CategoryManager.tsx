import { useState } from 'react';
import { useStore } from '@/store/useStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Package } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

export const CategoryManager = () => {
  const { products, addCategory, removeCategory } = useStore();
  const [newCategory, setNewCategory] = useState('');

  // Get unique categories from products
  const categories = Array.from(new Set(products.map(p => p.category))).sort();
  
  // Count products per category
  const categoryCount = categories.map(category => ({
    name: category,
    count: products.filter(p => p.category === category).length
  }));

  const handleAddCategory = () => {
    if (!newCategory.trim()) {
      toast({
        title: "Invalid Category",
        description: "Category name cannot be empty",
        variant: "destructive"
      });
      return;
    }

    if (categories.includes(newCategory.trim())) {
      toast({
        title: "Category Exists",
        description: "This category already exists",
        variant: "destructive"
      });
      return;
    }

    addCategory(newCategory.trim());
    setNewCategory('');
    toast({
      title: "Category Added",
      description: `Category "${newCategory.trim()}" has been created`,
    });
  };

  const handleRemoveCategory = (categoryName: string) => {
    const productCount = products.filter(p => p.category === categoryName).length;
    if (productCount > 0) {
      toast({
        title: "Cannot Delete Category",
        description: `Category has ${productCount} products. Move or delete products first.`,
        variant: "destructive"
      });
      return;
    }

    removeCategory(categoryName);
    toast({
      title: "Category Removed",
      description: `Category "${categoryName}" has been deleted`,
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Package className="h-5 w-5" />
          Category Management
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add New Category */}
        <div className="flex gap-2">
          <Input
            placeholder="Enter new category name..."
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleAddCategory()}
          />
          <Button onClick={handleAddCategory}>
            <Plus className="h-4 w-4 mr-1" />
            Add
          </Button>
        </div>

        {/* Existing Categories */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium">Existing Categories</h4>
          {categoryCount.length === 0 ? (
            <p className="text-sm text-muted-foreground">No categories found</p>
          ) : (
            <div className="grid gap-2">
              {categoryCount.map((category) => (
                <div
                  key={category.name}
                  className="flex items-center justify-between p-2 border rounded-lg"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{category.name}</span>
                    <Badge variant="secondary" className="text-xs">
                      {category.count} products
                    </Badge>
                  </div>
                  {category.count === 0 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleRemoveCategory(category.name)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
