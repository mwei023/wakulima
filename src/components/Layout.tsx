import { useState, lazy, Suspense } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useRole } from '@/hooks/useRole';
import { useDataLoader } from '@/hooks/useDataLoader';
import { useStore } from '@/store/useStore';
import { shouldNagForBackup } from '@/lib/backupReminder';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CloudDownload } from 'lucide-react';
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
  LogOut,
  Truck,
  Database,
  Menu,
  User,
  RotateCcw,
  Shield
} from 'lucide-react';
import { POSInterface } from '@/components/POS/POSInterface';
import { InventoryView } from '@/components/Inventory/InventoryView';
import { CustomersView } from '@/components/Customers/CustomersView';
const OrdersView = lazy(() => import('@/components/Orders/OrdersView').then(m => ({ default: m.OrdersView })));
const AdvancedReports = lazy(() => import('@/components/Reports/AdvancedReports').then(m => ({ default: m.AdvancedReports })));
const SupplierManager = lazy(() => import('@/components/Inventory/SupplierManager').then(m => ({ default: m.SupplierManager })));
const BackupManager = lazy(() => import('@/components/DataExport/BackupManager').then(m => ({ default: m.BackupManager })));
const Settings = lazy(() => import('@/components/Settings/Settings').then(m => ({ default: m.Settings })));
const ReturnsRefunds = lazy(() => import('@/components/Operations/ReturnsRefunds').then(m => ({ default: m.ReturnsRefunds })));
const AuditLog = lazy(() => import('@/components/Admin/AuditLog').then(m => ({ default: m.AuditLog })));

export const Layout = () => {
  const [activeTab, setActiveTab] = useState('pos');
  const [backupNagVisible, setBackupNagVisible] = useState(() => shouldNagForBackup());
  const isOnline = useStore(state => state.isOnline);
  const { user, signOut } = useAuth();
  const { role, isAdmin } = useRole();
  
  // Initialize data loading from the local database
  useDataLoader();

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Error signing out:', error);
    }
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
            {/* Network Status */}
            <Badge variant={isOnline ? 'success' : 'destructive'} className="flex items-center gap-1">
              {isOnline ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
              <span className="text-xs hidden sm:inline">
                {isOnline ? 'Online' : 'Offline'}
              </span>
            </Badge>
            
            {/* Desktop User Info */}
            <div className="hidden lg:flex items-center gap-2">
              <ThemeToggle />
              <div className="text-right">
                <p className="text-sm font-medium">{user?.full_name || user?.email}</p>
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
                      <p className="text-sm font-medium truncate">{user?.full_name || user?.email}</p>
                      <p className="text-xs text-muted-foreground capitalize">{role || 'Loading...'}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Theme</span>
                    <ThemeToggle />
                  </div>

                  <div className="space-y-2">
                    <h3 className="text-sm font-medium text-muted-foreground">Navigation</h3>
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        variant={activeTab === 'pos' ? 'secondary' : 'ghost'}
                        size="sm"
                        onClick={() => setActiveTab('pos')}
                        className="justify-start gap-2"
                      >
                        <ShoppingCart className="h-4 w-4" />
                        POS
                      </Button>
                      <Button
                        variant={activeTab === 'inventory' ? 'secondary' : 'ghost'}
                        size="sm"
                        onClick={() => setActiveTab('inventory')}
                        className="justify-start gap-2"
                      >
                        <Package className="h-4 w-4" />
                        Inventory
                      </Button>
                      <Button
                        variant={activeTab === 'customers' ? 'secondary' : 'ghost'}
                        size="sm"
                        onClick={() => setActiveTab('customers')}
                        className="justify-start gap-2"
                      >
                        <Users className="h-4 w-4" />
                        Customers
                      </Button>
                      <Button
                        variant={activeTab === 'returns' ? 'secondary' : 'ghost'}
                        size="sm"
                        onClick={() => setActiveTab('returns')}
                        className="justify-start gap-2"
                      >
                        <RotateCcw className="h-4 w-4" />
                        Returns
                      </Button>
                      {isAdmin && (
                        <>
                          <Button
                            variant={activeTab === 'suppliers' ? 'secondary' : 'ghost'}
                            size="sm"
                            onClick={() => setActiveTab('suppliers')}
                            className="justify-start gap-2"
                          >
                            <Truck className="h-4 w-4" />
                            Suppliers
                          </Button>
                          <Button
                            variant={activeTab === 'orders' ? 'secondary' : 'ghost'}
                            size="sm"
                            onClick={() => setActiveTab('orders')}
                            className="justify-start gap-2"
                          >
                            <MessageSquare className="h-4 w-4" />
                            Orders
                          </Button>
                          <Button
                            variant={activeTab === 'reports' ? 'secondary' : 'ghost'}
                            size="sm"
                            onClick={() => setActiveTab('reports')}
                            className="justify-start gap-2"
                          >
                            <BarChart3 className="h-4 w-4" />
                            Reports
                          </Button>
                          <Button
                            variant={activeTab === 'backup' ? 'secondary' : 'ghost'}
                            size="sm"
                            onClick={() => setActiveTab('backup')}
                            className="justify-start gap-2"
                          >
                            <Database className="h-4 w-4" />
                            Backup
                          </Button>
                          <Button
                            variant={activeTab === 'audit' ? 'secondary' : 'ghost'}
                            size="sm"
                            onClick={() => setActiveTab('audit')}
                            className="justify-start gap-2"
                          >
                            <Shield className="h-4 w-4" />
                            Audit
                          </Button>
                          <Button
                            variant={activeTab === 'settings' ? 'secondary' : 'ghost'}
                            size="sm"
                            onClick={() => setActiveTab('settings')}
                            className="justify-start gap-2"
                          >
                            <SettingsIcon className="h-4 w-4" />
                            Settings
                          </Button>
                        </>
                      )}
                    </div>
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
        {isAdmin && backupNagVisible && (
          <Alert className="mb-4 border-warning bg-warning/10">
            <CloudDownload className="h-4 w-4 text-warning" />
            <AlertDescription className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <span>
                No recent off-device backup. If this device is lost or wiped, sales history goes with it.
              </span>
              <span className="flex gap-2 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setBackupNagVisible(false);
                    setActiveTab('backup');
                  }}
                >
                  Go to Backup
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setBackupNagVisible(false)}>
                  Dismiss
                </Button>
              </span>
            </AlertDescription>
          </Alert>
        )}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="hidden lg:flex lg:w-auto lg:inline-flex lg:flex-wrap gap-1">
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
            <Suspense fallback={<div className="p-8 text-center">Loading...</div>}>
              <SupplierManager />
            </Suspense>
          </TabsContent>
          
          <TabsContent value="customers" className="mt-6">
            <CustomersView />
          </TabsContent>
          
          <TabsContent value="orders" className="mt-6">
            <Suspense fallback={<div className="p-8 text-center">Loading...</div>}>
              <OrdersView />
            </Suspense>
          </TabsContent>
          
          <TabsContent value="reports" className="mt-6">
            <Suspense fallback={<div className="p-8 text-center">Loading...</div>}>
              <AdvancedReports />
            </Suspense>
          </TabsContent>
          
          <TabsContent value="backup" className="mt-6">
            <Suspense fallback={<div className="p-8 text-center">Loading...</div>}>
              <BackupManager />
            </Suspense>
          </TabsContent>
          
          <TabsContent value="settings" className="mt-6">
            <Suspense fallback={<div className="p-8 text-center">Loading...</div>}>
              <Settings />
            </Suspense>
          </TabsContent>
          
          <TabsContent value="returns" className="mt-6">
            <Suspense fallback={<div className="p-8 text-center">Loading...</div>}>
              <ReturnsRefunds />
            </Suspense>
          </TabsContent>
          
          <TabsContent value="audit" className="mt-6">
            <Suspense fallback={<div className="p-8 text-center">Loading...</div>}>
              <AuditLog />
            </Suspense>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};