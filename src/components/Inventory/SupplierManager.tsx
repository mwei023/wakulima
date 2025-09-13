import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useStore } from '@/store/useStore';
import { formatCurrency, formatDate } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { 
  Plus, Edit, Trash2, Phone, Mail, MapPin, 
  TrendingUp, Package, AlertTriangle, CheckCircle, DollarSign 
} from 'lucide-react';

interface Supplier {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  category: string;
  paymentTerms: string;
  rating: number;
  status: 'active' | 'inactive';
  created_at: string;
}

interface PurchaseOrder {
  id: string;
  supplier_id: string;
  status: 'pending' | 'ordered' | 'received' | 'cancelled';
  total_amount: number;
  created_at: string;
  expected_date?: string;
  items: {
    product_id: string;
    product_name: string;
    quantity: number;
    unit_price: number;
    total: number;
  }[];
}

export const SupplierManager = () => {
  const { products } = useStore();
  const [suppliers, setSuppliers] = useState<Supplier[]>([
    {
      id: 'sup-1',
      name: 'Agro Supply Ltd',
      email: 'info@agrosupply.co.ke',
      phone: '+254 700 123456',
      address: 'Industrial Area, Nairobi',
      category: 'Seeds & Fertilizers',
      paymentTerms: '30 days',
      rating: 4.5,
      status: 'active',
      created_at: new Date().toISOString()
    },
    {
      id: 'sup-2',
      name: 'Farm Tools Kenya',
      email: 'sales@farmtools.co.ke',
      phone: '+254 700 654321',
      address: 'Nakuru Town',
      category: 'Tools & Equipment',
      paymentTerms: '15 days',
      rating: 4.2,
      status: 'active',
      created_at: new Date().toISOString()
    }
  ]);

  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [isAddingSupplier, setIsAddingSupplier] = useState(false);
  const [isCreatingPO, setIsCreatingPO] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [newSupplier, setNewSupplier] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    category: '',
    paymentTerms: '30 days',
    rating: 5
  });

  // Low stock alerts
  const lowStockProducts = products.filter(p => p.stock_quantity <= p.reorder_level);

  const handleAddSupplier = () => {
    if (!newSupplier.name.trim() || !newSupplier.email.trim() || !newSupplier.phone.trim()) {
      toast({
        title: "Error",
        description: "Please fill in all required fields",
        variant: "destructive"
      });
      return;
    }

    const supplier: Supplier = {
      ...newSupplier,
      id: `sup-${Date.now()}`,
      status: 'active' as const,
      created_at: new Date().toISOString()
    };

    setSuppliers([...suppliers, supplier]);
    setNewSupplier({
      name: '',
      email: '',
      phone: '',
      address: '',
      category: '',
      paymentTerms: '30 days',
      rating: 5
    });
    setIsAddingSupplier(false);

    toast({
      title: "Supplier Added",
      description: `${supplier.name} has been added successfully`
    });
  };

  const handleUpdateSupplier = (updatedSupplier: Supplier) => {
    setSuppliers(suppliers.map(s => s.id === updatedSupplier.id ? updatedSupplier : s));
    setEditingSupplier(null);
    toast({
      title: "Supplier Updated",
      description: "Supplier information has been updated"
    });
  };

  const handleDeleteSupplier = (supplierId: string) => {
    setSuppliers(suppliers.filter(s => s.id !== supplierId));
    toast({
      title: "Supplier Removed",
      description: "Supplier has been removed from the system"
    });
  };

  const createPurchaseOrder = (supplierId: string, items: any[]) => {
    const totalAmount = items.reduce((sum, item) => sum + item.total, 0);
    
    const po: PurchaseOrder = {
      id: `PO-${Date.now()}`,
      supplier_id: supplierId,
      status: 'pending',
      total_amount: totalAmount,
      created_at: new Date().toISOString(),
      expected_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days from now
      items
    };

    setPurchaseOrders([...purchaseOrders, po]);
    toast({
      title: "Purchase Order Created",
      description: `PO ${po.id} created for ${formatCurrency(totalAmount)}`
    });
  };

  const getSupplierStats = (supplierId: string) => {
    const supplierPOs = purchaseOrders.filter(po => po.supplier_id === supplierId);
    const totalOrders = supplierPOs.length;
    const totalValue = supplierPOs.reduce((sum, po) => sum + po.total_amount, 0);
    const pendingOrders = supplierPOs.filter(po => po.status === 'pending').length;
    
    return { totalOrders, totalValue, pendingOrders };
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Supplier Management</h2>
          <p className="text-muted-foreground">Manage suppliers and purchase orders</p>
        </div>
        <Dialog open={isAddingSupplier} onOpenChange={setIsAddingSupplier}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Supplier
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Add New Supplier</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="name">Supplier Name *</Label>
                <Input
                  id="name"
                  value={newSupplier.name}
                  onChange={(e) => setNewSupplier({...newSupplier, name: e.target.value})}
                  placeholder="Enter supplier name"
                />
              </div>
              <div>
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  value={newSupplier.email}
                  onChange={(e) => setNewSupplier({...newSupplier, email: e.target.value})}
                  placeholder="supplier@example.com"
                />
              </div>
              <div>
                <Label htmlFor="phone">Phone *</Label>
                <Input
                  id="phone"
                  value={newSupplier.phone}
                  onChange={(e) => setNewSupplier({...newSupplier, phone: e.target.value})}
                  placeholder="+254 700 000000"
                />
              </div>
              <div>
                <Label htmlFor="address">Address</Label>
                <Textarea
                  id="address"
                  value={newSupplier.address}
                  onChange={(e) => setNewSupplier({...newSupplier, address: e.target.value})}
                  placeholder="Enter address"
                />
              </div>
              <div>
                <Label htmlFor="category">Category</Label>
                <Input
                  id="category"
                  value={newSupplier.category}
                  onChange={(e) => setNewSupplier({...newSupplier, category: e.target.value})}
                  placeholder="e.g., Seeds & Fertilizers"
                />
              </div>
              <div>
                <Label htmlFor="payment-terms">Payment Terms</Label>
                <Select value={newSupplier.paymentTerms} onValueChange={(value) => setNewSupplier({...newSupplier, paymentTerms: value})}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash on Delivery</SelectItem>
                    <SelectItem value="15 days">15 Days</SelectItem>
                    <SelectItem value="30 days">30 Days</SelectItem>
                    <SelectItem value="60 days">60 Days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2">
                <Button onClick={handleAddSupplier} className="flex-1">
                  Add Supplier
                </Button>
                <Button variant="outline" onClick={() => setIsAddingSupplier(false)} className="flex-1">
                  Cancel
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stock Alerts */}
      {lowStockProducts.length > 0 && (
        <Card className="border-warning">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-warning">
              <AlertTriangle className="h-5 w-5" />
              Stock Alerts ({lowStockProducts.length} items)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 max-h-32 overflow-y-auto">
              {lowStockProducts.slice(0, 5).map(product => (
                <div key={product.id} className="flex justify-between items-center p-2 bg-warning/10 rounded">
                  <div>
                    <p className="font-medium text-sm">{product.name}</p>
                    <p className="text-xs text-muted-foreground">{product.category}</p>
                  </div>
                  <Badge variant={product.stock_quantity === 0 ? "destructive" : "secondary"}>
                    {product.stock_quantity} left
                  </Badge>
                </div>
              ))}
              {lowStockProducts.length > 5 && (
                <p className="text-sm text-muted-foreground text-center">
                  +{lowStockProducts.length - 5} more items need restocking
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="suppliers" className="w-full">
        <TabsList>
          <TabsTrigger value="suppliers">Suppliers</TabsTrigger>
          <TabsTrigger value="orders">Purchase Orders</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="suppliers" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {suppliers.map(supplier => {
              const stats = getSupplierStats(supplier.id);
              return (
                <Card key={supplier.id} className={supplier.status === 'inactive' ? 'opacity-60' : ''}>
                  <CardHeader className="pb-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="text-lg">{supplier.name}</CardTitle>
                        <Badge variant={supplier.status === 'active' ? 'default' : 'secondary'}>
                          {supplier.status}
                        </Badge>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditingSupplier(supplier)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDeleteSupplier(supplier.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        <span>{supplier.email}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4 text-muted-foreground" />
                        <span>{supplier.phone}</span>
                      </div>
                      {supplier.address && (
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-muted-foreground" />
                          <span className="text-xs">{supplier.address}</span>
                        </div>
                      )}
                    </div>
                    
                    <div className="pt-2 border-t">
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <p className="text-muted-foreground">Category</p>
                          <p className="font-medium">{supplier.category || 'General'}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Payment</p>
                          <p className="font-medium">{supplier.paymentTerms}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Total Orders</p>
                          <p className="font-medium">{stats.totalOrders}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Total Value</p>
                          <p className="font-medium">{formatCurrency(stats.totalValue)}</p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="orders" className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Purchase Orders</h3>
            <Button variant="outline">
              <Plus className="h-4 w-4 mr-2" />
              Create PO
            </Button>
          </div>
          
          {purchaseOrders.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-semibold mb-2">No Purchase Orders</h3>
                <p className="text-muted-foreground mb-4">
                  Create your first purchase order to start managing inventory procurement
                </p>
                <Button>Create Purchase Order</Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {purchaseOrders.map(po => {
                const supplier = suppliers.find(s => s.id === po.supplier_id);
                return (
                  <Card key={po.id}>
                    <CardHeader>
                      <div className="flex justify-between items-start">
                        <div>
                          <CardTitle className="text-lg">{po.id}</CardTitle>
                          <p className="text-muted-foreground">{supplier?.name}</p>
                        </div>
                        <Badge variant={
                          po.status === 'pending' ? 'secondary' :
                          po.status === 'ordered' ? 'default' :
                          po.status === 'received' ? 'success' : 'destructive'
                        }>
                          {po.status}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-muted-foreground">Total Amount</p>
                          <p className="font-semibold">{formatCurrency(po.total_amount)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Created</p>
                          <p className="font-semibold">{formatDate(po.created_at)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Items</p>
                          <p className="font-semibold">{po.items.length} products</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Expected</p>
                          <p className="font-semibold">
                            {po.expected_date ? formatDate(po.expected_date) : 'Not set'}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Suppliers</CardTitle>
                <Package className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{suppliers.length}</div>
                <p className="text-xs text-muted-foreground">
                  {suppliers.filter(s => s.status === 'active').length} active
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Purchase Orders</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{purchaseOrders.length}</div>
                <p className="text-xs text-muted-foreground">
                  {purchaseOrders.filter(po => po.status === 'pending').length} pending
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Procurement</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatCurrency(purchaseOrders.reduce((sum, po) => sum + po.total_amount, 0))}
                </div>
                <p className="text-xs text-muted-foreground">
                  All time value
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Stock Alerts</CardTitle>
                <AlertTriangle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-warning">
                  {lowStockProducts.length}
                </div>
                <p className="text-xs text-muted-foreground">
                  Products need restocking
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Edit Supplier Dialog */}
      {editingSupplier && (
        <Dialog open={!!editingSupplier} onOpenChange={() => setEditingSupplier(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Edit Supplier</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="edit-name">Supplier Name</Label>
                <Input
                  id="edit-name"
                  value={editingSupplier.name}
                  onChange={(e) => setEditingSupplier({...editingSupplier, name: e.target.value})}
                />
              </div>
              <div>
                <Label htmlFor="edit-email">Email</Label>
                <Input
                  id="edit-email"
                  type="email"
                  value={editingSupplier.email}
                  onChange={(e) => setEditingSupplier({...editingSupplier, email: e.target.value})}
                />
              </div>
              <div>
                <Label htmlFor="edit-phone">Phone</Label>
                <Input
                  id="edit-phone"
                  value={editingSupplier.phone}
                  onChange={(e) => setEditingSupplier({...editingSupplier, phone: e.target.value})}
                />
              </div>
              <div>
                <Label htmlFor="edit-status">Status</Label>
                <Select 
                  value={editingSupplier.status} 
                  onValueChange={(value: 'active' | 'inactive') => setEditingSupplier({...editingSupplier, status: value})}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2">
                <Button onClick={() => handleUpdateSupplier(editingSupplier)} className="flex-1">
                  Update Supplier
                </Button>
                <Button variant="outline" onClick={() => setEditingSupplier(null)} className="flex-1">
                  Cancel
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};