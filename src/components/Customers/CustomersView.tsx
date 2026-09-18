import { useState } from 'react';
import { useStore } from '@/store/useStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Users, Search, Plus, CreditCard, AlertTriangle } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';

export const CustomersView = () => {
  const { customers, addCustomer, updateCustomerBalance } = useStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
const [selectedCustomer, setSelectedCustomer] = useState<unknown>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [newCustomer, setNewCustomer] = useState({
    name: '',
    phone: '',
    credit_limit: ''
  });

  const filteredCustomers = customers.filter(customer =>
    customer.id !== 'walk-in' && (
      customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.phone.includes(searchTerm)
    )
  );

  const customersWithCredit = customers.filter(c => c.outstanding_balance > 0 && c.id !== 'walk-in');
  const overLimitCustomers = customers.filter(c => c.outstanding_balance > c.credit_limit && c.id !== 'walk-in');

  const handleAddCustomer = () => {
    if (newCustomer.name && newCustomer.phone) {
      addCustomer({
        name: newCustomer.name,
        phone: newCustomer.phone,
        credit_limit: parseInt(newCustomer.credit_limit) || 0,
        outstanding_balance: 0
      });
      toast({
        title: "Customer Added",
        description: `${newCustomer.name} has been added successfully`,
      });
      setNewCustomer({ name: '', phone: '', credit_limit: '' });
      setShowAddDialog(false);
    }
  };

  const handlePayment = () => {
    if (selectedCustomer && paymentAmount) {
      const amount = parseFloat(paymentAmount);
      if (amount > 0) {
        updateCustomerBalance(selectedCustomer.id, -amount);
        toast({
          title: "Payment Recorded",
          description: `Payment of ${formatCurrency(amount)} recorded for ${selectedCustomer.name}`,
        });
        setPaymentAmount('');
        setShowPaymentDialog(false);
        setSelectedCustomer(null);
      }
    }
  };

  const getCreditStatus = (customer: any) => {
    if (customer.outstanding_balance === 0) {
      return { status: 'Clear', variant: 'default' };
    }
    if (customer.outstanding_balance > customer.credit_limit) {
      return { status: 'Over Limit', variant: 'destructive' };
    }
    return { status: 'Has Credit', variant: 'secondary' };
  };

  return (
    <div className="space-y-6">
      {/* Credit Alerts */}
      {(customersWithCredit.length > 0 || overLimitCustomers.length > 0) && (
        <Card className="border-warning">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-warning">
              <AlertTriangle className="h-5 w-5" />
              Credit Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            {overLimitCustomers.length > 0 && (
              <div className="mb-4">
                <h4 className="font-medium text-destructive mb-2">Over Credit Limit ({overLimitCustomers.length})</h4>
                <div className="space-y-2">
                  {overLimitCustomers.map(customer => (
                    <div key={customer.id} className="flex items-center justify-between p-2 bg-destructive/10 rounded">
                      <span>{customer.name}</span>
                      <Badge variant="destructive">
                        {formatCurrency(customer.outstanding_balance)} / {formatCurrency(customer.credit_limit)}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div>
              <h4 className="font-medium mb-2">Total Outstanding: {formatCurrency(customersWithCredit.reduce((sum, c) => sum + c.outstanding_balance, 0))}</h4>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Customer Management */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Customer Management
            </span>
            <Button onClick={() => setShowAddDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Customer
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <Input
              placeholder="Search customers by name or phone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-sm"
            />
          </div>

          <div className="grid gap-4">
            {filteredCustomers.map((customer) => {
              const creditStatus = getCreditStatus(customer);
              return (
                <div key={customer.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h4 className="font-medium">{customer.name}</h4>
                      <Badge variant={creditStatus.variant as any}>
                        {creditStatus.status}
                      </Badge>
                      {customer.outstanding_balance > customer.credit_limit && (
                        <AlertTriangle className="h-4 w-4 text-destructive" />
                      )}
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm text-muted-foreground">
                      <div>
                        <p className="font-medium">Phone</p>
                        <p>{customer.phone}</p>
                      </div>
                      <div>
                        <p className="font-medium">Credit Limit</p>
                        <p>{formatCurrency(customer.credit_limit)}</p>
                      </div>
                      <div>
                        <p className="font-medium">Outstanding Balance</p>
                        <p className={customer.outstanding_balance > 0 ? 'text-warning font-medium' : ''}>
                          {formatCurrency(customer.outstanding_balance)}
                        </p>
                      </div>
                    </div>
                  </div>
                  {customer.outstanding_balance > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedCustomer(customer);
                        setShowPaymentDialog(true);
                      }}
                    >
                      <CreditCard className="h-4 w-4 mr-2" />
                      Record Payment
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Add Customer Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Customer</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="name">Customer Name</Label>
              <Input
                id="name"
                value={newCustomer.name}
                onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })}
                placeholder="Enter customer name"
              />
            </div>
            <div>
              <Label htmlFor="phone">Phone Number</Label>
              <Input
                id="phone"
                value={newCustomer.phone}
                onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                placeholder="+254..."
              />
            </div>
            <div>
              <Label htmlFor="credit-limit">Credit Limit (KES)</Label>
              <Input
                id="credit-limit"
                type="number"
                value={newCustomer.credit_limit}
                onChange={(e) => setNewCustomer({ ...newCustomer, credit_limit: e.target.value })}
                placeholder="0"
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleAddCustomer} className="flex-1">
                Add Customer
              </Button>
              <Button variant="outline" onClick={() => setShowAddDialog(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Payment Dialog */}
      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Payment - {selectedCustomer?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Outstanding Balance</Label>
              <p className="text-lg font-semibold text-warning">
                {formatCurrency(selectedCustomer?.outstanding_balance || 0)}
              </p>
            </div>
            <div>
              <Label htmlFor="payment-amount">Payment Amount (KES)</Label>
              <Input
                id="payment-amount"
                type="number"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                placeholder="Enter payment amount"
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={handlePayment} className="flex-1">
                Record Payment
              </Button>
              <Button variant="outline" onClick={() => setShowPaymentDialog(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};