import { useState, useMemo } from 'react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus } from 'lucide-react';
import { useStore } from '@/store/useStore';

interface CategorySelectorProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  label?: string;
  className?: string;
}

export const CategorySelector = ({ 
  value, 
  onChange, 
  disabled = false,
  label = "Category",
  className = ""
}: CategorySelectorProps) => {
  const { products } = useStore();
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  // Get unique categories from existing products
  const existingCategories = useMemo(() => {
    const categories = [...new Set(products.map(p => p.category))];
    return categories.filter(cat => cat && cat.trim() !== '').sort();
  }, [products]);

  const handleAddCategory = () => {
    if (newCategoryName.trim()) {
      onChange(newCategoryName.trim());
      setNewCategoryName('');
      setIsAddingCategory(false);
    }
  };

  const handleSelectChange = (selectedValue: string) => {
    if (selectedValue === '__add_new__') {
      setIsAddingCategory(true);
    } else {
      onChange(selectedValue);
    }
  };

  return (
    <div className={className}>
      <Label className="text-base font-medium">{label}</Label>
      <div className="flex gap-2 mt-2">
        <Select 
          value={existingCategories.includes(value) ? value : ''} 
          onValueChange={handleSelectChange}
          disabled={disabled}
        >
          <SelectTrigger className="flex-1 p-3 bg-background border-2 border-primary/20 focus:border-primary">
            <SelectValue placeholder="Select category or add new..." />
          </SelectTrigger>
          <SelectContent className="bg-background border-2 z-50 max-h-60">
            {existingCategories.map((category) => (
              <SelectItem 
                key={category} 
                value={category}
                className="hover:bg-primary/10 focus:bg-primary/10 cursor-pointer"
              >
                {category}
              </SelectItem>
            ))}
            <SelectItem 
              value="__add_new__"
              className="hover:bg-primary/10 focus:bg-primary/10 cursor-pointer border-t"
            >
              <div className="flex items-center gap-2">
                <Plus className="h-4 w-4" />
                Add new category...
              </div>
            </SelectItem>
          </SelectContent>
        </Select>

        {!disabled && (
          <Dialog open={isAddingCategory} onOpenChange={setIsAddingCategory}>
            <DialogTrigger asChild>
              <Button 
                variant="outline" 
                size="icon"
                className="p-3 border-2 border-primary/20 hover:border-primary"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-background border-2 z-50">
              <DialogHeader>
                <DialogTitle>Add New Category</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div>
                  <Label htmlFor="new-category">Category Name</Label>
                  <Input
                    id="new-category"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    placeholder="Enter category name..."
                    className="mt-2"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddCategory();
                      }
                    }}
                  />
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleAddCategory} className="flex-1">
                    Add Category
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={() => {
                      setIsAddingCategory(false);
                      setNewCategoryName('');
                    }}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Show current value if it's a custom category */}
      {value && !existingCategories.includes(value) && (
        <div className="mt-2 text-sm text-muted-foreground">
          Current: <span className="font-medium">{value}</span>
        </div>
      )}
    </div>
  );
};