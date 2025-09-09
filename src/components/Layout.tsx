import { useState } from 'react';
import { useStore } from '@/store/useStore';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  ShoppingCart, 
  Package, 
  Users, 
  MessageSquare, 
  BarChart3, 
  Settings,
  Wifi,
  WifiOff,
  RefreshCw,
  LogOut
} from 'lucide-react';
import { POSInterface } from '@/components/POS/POSInterface';
import { InventoryView } from '@/components/Inventory/InventoryView';
import { CustomersView } from '@/components/Customers/CustomersView';
import { OrdersView } from '@/components/Orders/OrdersView';
import { ReportsView } from '@/components/Reports/ReportsView';

export const Layout = () => {
  const { currentUser, logout, syncStatus } = useStore();
  const [activeTab, setActiveTab] = useState('pos');

  const getSyncIcon = () => {
    if (!syncStatus.isOnline) return <WifiOff className="h-4 w-4" />;
    if (syncStatus.pendingSales > 0) return <RefreshCw className="h-4 w-4 animate-spin" />;
    return <Wifi className="h-4 w-4" />;
  };

  const getSyncColor = () => {
    if (!syncStatus.isOnline) return 'destructive';
    if (syncStatus.pendingSales > 0) return 'warning';
    return 'success';
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <h1 className="text-xl font-bold text-primary">Wakulima Agrovet</h1>
            <p className="text-sm text-muted-foreground">Kiserian, Kenya</p>
          </div>
          
          <div className="flex items-center gap-3">
            {/* Sync Status */}
            <Badge variant={getSyncColor() as any} className="flex items-center gap-1">
              {getSyncIcon()}
              <span className="text-xs">
                {!syncStatus.isOnline 
                  ? 'Offline' 
                  : syncStatus.pendingSales > 0 
                    ? `Syncing ${syncStatus.pendingSales}`
                    : 'Online'
                }
              </span>
            </Badge>
            
            {/* User Info */}
            <div className="flex items-center gap-2">
              <div className="text-right">
                <p className="text-sm font-medium">{currentUser?.full_name}</p>
                <p className="text-xs text-muted-foreground capitalize">{currentUser?.role}</p>
              </div>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={logout}
                className="text-muted-foreground hover:text-foreground"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="container mx-auto p-4">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-5 lg:w-auto lg:grid-cols-5">
            <TabsTrigger value="pos" className="flex items-center gap-2">
              <ShoppingCart className="h-4 w-4" />
              <span className="hidden sm:inline">POS</span>
            </TabsTrigger>
            <TabsTrigger value="inventory" className="flex items-center gap-2">
              <Package className="h-4 w-4" />
              <span className="hidden sm:inline">Inventory</span>
            </TabsTrigger>
            <TabsTrigger value="customers" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              <span className="hidden sm:inline">Customers</span>
            </TabsTrigger>
            <TabsTrigger value="orders" className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              <span className="hidden sm:inline">Orders</span>
            </TabsTrigger>
            <TabsTrigger value="reports" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              <span className="hidden sm:inline">Reports</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pos" className="mt-6">
            <POSInterface />
          </TabsContent>
          
          <TabsContent value="inventory" className="mt-6">
            <InventoryView />
          </TabsContent>
          
          <TabsContent value="customers" className="mt-6">
            <CustomersView />
          </TabsContent>
          
          <TabsContent value="orders" className="mt-6">
            <OrdersView />
          </TabsContent>
          
          <TabsContent value="reports" className="mt-6">
            <ReportsView />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};