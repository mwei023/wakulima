import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useRole } from '@/hooks/useRole';
import { useDataLoader } from '@/hooks/useDataLoader';
import { useStore } from '@/store/useStore';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { 
  ShoppingCart, 
  Package, 
  Users, 
  MessageSquare, 
  BarChart3, 
  Settings as SettingsIcon,
  Wifi,
  WifiOff,
  RefreshCw,
  LogOut,
  Truck,
  Database,
  Menu,
  User,
  ArrowRightLeft,
  RotateCcw,
  Shield
} from 'lucide-react';
import { POSInterface } from '@/components/POS/POSInterface';
import { InventoryView } from '@/components/Inventory/InventoryView';
import { CustomersView } from '@/components/Customers/CustomersView';
import { OrdersView } from '@/components/Orders/OrdersView';
import { AdvancedReports } from '@/components/Reports/AdvancedReports';
import { SupplierManager } from '@/components/Inventory/SupplierManager';
import { BackupManager } from '@/components/DataExport/BackupManager';
import { Settings } from '@/components/Settings/Settings';
import { StockTransfers } from '@/components/Operations/StockTransfers';
import { ReturnsRefunds } from '@/components/Operations/ReturnsRefunds';
import { AuditLog } from '@/components/Admin/AuditLog';

export const Layout = () => {
  const [activeTab, setActiveTab] = useState('pos');
  const syncStatus = useStore(state => state.syncStatus);
  const { user, signOut } = useAuth();
  const { role, isAdmin } = useRole();
  
  // Initialize data loading from Supabase
  useDataLoader();

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

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
        <div className="flex items-center justify-between px-3 py-2 sm:px-4 sm:py-3">
          <div className="flex-1 min-w-0">
            <h1 className="text-base sm:text-xl font-bold text-primary truncate">Wakulima Agrovet</h1>
            <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">Kiserian, Kenya</p>
          </div>
          
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Sync Status */}
            <Badge variant={getSyncColor() as any} className="flex items-center gap-1">
              {getSyncIcon()}
              <span className="text-xs hidden sm:inline">
                {!syncStatus.isOnline 
                  ? 'Offline' 
                  : syncStatus.pendingSales > 0 
                    ? `Syncing ${syncStatus.pendingSales}`
                    : 'Online'
                }
              </span>
            </Badge>
            
            {/* Desktop User Info */}
            <div className="hidden lg:flex items-center gap-2">
              <ThemeToggle />
              <div className="text-right">
                <p className="text-sm font-medium">{user?.user_metadata?.full_name || user?.email}</p>
                <p className="text-xs text-muted-foreground capitalize">{role || 'Loading...'}</p>
              </div>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={handleSignOut}
                className="text-muted-foreground hover:text-foreground"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>

            {/* Mobile Menu */}
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="lg:hidden h-9 w-9">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[280px]">
                <SheetHeader>
                  <SheetTitle>Account</SheetTitle>
                </SheetHeader>
                <div className="flex flex-col gap-4 mt-6">
                  <div className="flex items-center gap-3 pb-4 border-b">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <User className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{user?.user_metadata?.full_name || user?.email}</p>
                      <p className="text-xs text-muted-foreground capitalize">{role || 'Loading...'}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Theme</span>
                    <ThemeToggle />
                  </div>

                  <Button 
                    variant="outline" 
                    onClick={handleSignOut}
                    className="w-full justify-start gap-2"
                  >
                    <LogOut className="h-4 w-4" />
                    Sign Out
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="container mx-auto p-4">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-flex lg:flex-wrap gap-1">
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
            <TabsTrigger value="returns" className="flex items-center gap-2">
              <RotateCcw className="h-4 w-4" />
              <span className="hidden sm:inline">Returns</span>
            </TabsTrigger>
            {isAdmin && (
              <>
                <TabsTrigger value="suppliers" className="flex items-center gap-2">
                  <Truck className="h-4 w-4" />
                  <span className="hidden sm:inline">Suppliers</span>
                </TabsTrigger>
                <TabsTrigger value="transfers" className="flex items-center gap-2">
                  <ArrowRightLeft className="h-4 w-4" />
                  <span className="hidden sm:inline">Transfers</span>
                </TabsTrigger>
                <TabsTrigger value="orders" className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  <span className="hidden sm:inline">Orders</span>
                </TabsTrigger>
                <TabsTrigger value="reports" className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  <span className="hidden sm:inline">Reports</span>
                </TabsTrigger>
                <TabsTrigger value="backup" className="flex items-center gap-2">
                  <Database className="h-4 w-4" />
                  <span className="hidden sm:inline">Backup</span>
                </TabsTrigger>
                <TabsTrigger value="audit" className="flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  <span className="hidden sm:inline">Audit</span>
                </TabsTrigger>
                <TabsTrigger value="settings" className="flex items-center gap-2">
                  <SettingsIcon className="h-4 w-4" />
                  <span className="hidden sm:inline">Settings</span>
                </TabsTrigger>
              </>
            )}
          </TabsList>

          <TabsContent value="pos" className="mt-6">
            <POSInterface />
          </TabsContent>
          
          <TabsContent value="inventory" className="mt-6">
            <InventoryView />
          </TabsContent>
          
          <TabsContent value="suppliers" className="mt-6">
            <SupplierManager />
          </TabsContent>
          
          <TabsContent value="customers" className="mt-6">
            <CustomersView />
          </TabsContent>
          
          <TabsContent value="orders" className="mt-6">
            <OrdersView />
          </TabsContent>
          
          <TabsContent value="reports" className="mt-6">
            <AdvancedReports />
          </TabsContent>
          
          <TabsContent value="backup" className="mt-6">
            <BackupManager />
          </TabsContent>
          
          <TabsContent value="settings" className="mt-6">
            <Settings />
          </TabsContent>
          
          <TabsContent value="transfers" className="mt-6">
            <StockTransfers />
          </TabsContent>
          
          <TabsContent value="returns" className="mt-6">
            <ReturnsRefunds />
          </TabsContent>
          
          <TabsContent value="audit" className="mt-6">
            <AuditLog />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};