import { useState, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Users, Plus, Trash2, Store } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface Employee {
  id: string;
  email: string;
  full_name?: string;
  role: string;
  stores: Array<{ id: string; name: string }>;
}

export const EmployeeManagement = () => {
  const { stores } = useStore();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<string>('');
  const [selectedStore, setSelectedStore] = useState<string>('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadEmployees();
  }, []);

  const loadEmployees = async () => {
    try {
      // Get all users with their roles
      const { data: userRoles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, role');

      if (rolesError) throw rolesError;

      // Get all user-store assignments
      const { data: userStores, error: storesError } = await supabase
        .from('user_stores')
        .select('user_id, store_id, stores(id, name)');

      if (storesError) throw storesError;

      // Get profiles for all users
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, username, full_name');

      if (profilesError) throw profilesError;

      // Combine the data
      const employeeMap = new Map<string, Employee>();

      userRoles?.forEach((ur) => {
        const profile = profiles?.find(p => p.id === ur.user_id);
        const userStoreAssignments = userStores?.filter(us => us.user_id === ur.user_id) || [];
        
        employeeMap.set(ur.user_id, {
          id: ur.user_id,
          email: profile?.username || 'Unknown',
          full_name: profile?.full_name,
          role: ur.role,
          stores: userStoreAssignments.map(us => ({
            id: (us.stores as any).id,
            name: (us.stores as any).name
          }))
        });
      });

      setEmployees(Array.from(employeeMap.values()));
    } catch (error: any) {
      console.error('Error loading employees:', error);
      toast({
        title: "Error",
        description: "Failed to load employees",
        variant: "destructive",
      });
    }
  };

  const handleAssignStore = async () => {
    if (!selectedEmployee || !selectedStore) {
      toast({
        title: "Error",
        description: "Please select both an employee and a store",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase
        .from('user_stores')
        .insert([{ user_id: selectedEmployee, store_id: selectedStore }]);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Employee assigned to store successfully",
      });

      await loadEmployees();
      setIsOpen(false);
      setSelectedEmployee('');
      setSelectedStore('');
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveStore = async (userId: string, storeId: string) => {
    try {
      const { error } = await supabase
        .from('user_stores')
        .delete()
        .eq('user_id', userId)
        .eq('store_id', storeId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Store assignment removed",
      });

      await loadEmployees();
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
            <Users className="h-5 w-5" />
            Employee Management
          </div>
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Assign Store
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Assign Employee to Store</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Employee</Label>
                  <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select employee" />
                    </SelectTrigger>
                    <SelectContent>
                      {employees.map((emp) => (
                        <SelectItem key={emp.id} value={emp.id}>
                          {emp.full_name || emp.email} - {emp.role}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Store</Label>
                  <Select value={selectedStore} onValueChange={setSelectedStore}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select store" />
                    </SelectTrigger>
                    <SelectContent>
                      {stores.map((store) => (
                        <SelectItem key={store.id} value={store.id}>
                          {store.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-2 justify-end">
                  <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleAssignStore} disabled={loading}>
                    Assign
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {employees.map((employee) => (
            <div
              key={employee.id}
              className="flex items-start justify-between p-4 border rounded-lg"
            >
              <div className="space-y-2">
                <div>
                  <p className="font-medium">{employee.full_name || employee.email}</p>
                  <p className="text-sm text-muted-foreground">{employee.email}</p>
                </div>
                <Badge variant="outline">{employee.role}</Badge>
                <div className="flex flex-wrap gap-2 mt-2">
                  {employee.stores.map((store) => (
                    <Badge key={store.id} variant="secondary" className="flex items-center gap-1">
                      <Store className="h-3 w-3" />
                      {store.name}
                      <button
                        onClick={() => handleRemoveStore(employee.id, store.id)}
                        className="ml-1 hover:text-destructive"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                  {employee.stores.length === 0 && (
                    <span className="text-sm text-muted-foreground">No stores assigned</span>
                  )}
                </div>
              </div>
            </div>
          ))}
          {employees.length === 0 && (
            <p className="text-center text-muted-foreground py-4">
              No employees found. Users will appear here once they sign up.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
