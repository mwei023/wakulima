import { useState } from 'react';
import { useStore } from '@/store/useStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Store, Plus, Edit, Trash2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

export const StoreManagement = () => {
  const { stores, loadData } = useStore();
  const [isOpen, setIsOpen] = useState(false);
  const [editingStore, setEditingStore] = useState<any>(null);
  const [formData, setFormData] = useState({ name: '', location: '' });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      if (editingStore) {
        // Update existing store
        const { error } = await supabase
          .from('stores')
          .update({ name: formData.name, location: formData.location })
          .eq('id', editingStore.id);

        if (error) throw error;
        
        toast({
          title: "Store Updated",
          description: "Store details have been updated successfully",
        });
      } else {
        // Add new store
        const { data, error } = await supabase
          .from('stores')
          .insert([{ name: formData.name, location: formData.location }])
          .select()
          .single();

        if (error) throw error;
        
        toast({
          title: "Store Added",
          description: "New store has been added successfully",
        });
      }
      
      await loadData();
      setIsOpen(false);
      setFormData({ name: '', location: '' });
      setEditingStore(null);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleEdit = (store: any) => {
    setEditingStore(store);
    setFormData({ name: store.name, location: store.location || '' });
    setIsOpen(true);
  };

  const handleDelete = async (storeId: string) => {
    if (!confirm('Are you sure you want to delete this store? This cannot be undone.')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('stores')
        .delete()
        .eq('id', storeId);

      if (error) throw error;

      await loadData();
      
      toast({
        title: "Store Deleted",
        description: "Store has been removed successfully",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Store className="h-5 w-5" />
            Store Management
          </div>
          <Dialog open={isOpen} onOpenChange={(open) => {
            setIsOpen(open);
            if (!open) {
              setEditingStore(null);
              setFormData({ name: '', location: '' });
            }
          }}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Add Store
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {editingStore ? 'Edit Store' : 'Add New Store'}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="name">Store Name *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                    placeholder="e.g., Main Branch"
                  />
                </div>
                <div>
                  <Label htmlFor="location">Location</Label>
                  <Input
                    id="location"
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    placeholder="e.g., Downtown, Nairobi"
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit">
                    {editingStore ? 'Update' : 'Add'} Store
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {stores.map((store) => (
            <div
              key={store.id}
              className="flex items-center justify-between p-3 border rounded-lg"
            >
              <div>
                <p className="font-medium">{store.name}</p>
                {store.location && (
                  <p className="text-sm text-muted-foreground">{store.location}</p>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleEdit(store)}
                >
                  <Edit className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleDelete(store.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
          {stores.length === 0 && (
            <p className="text-center text-muted-foreground py-4">
              No stores yet. Add your first store to get started.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
