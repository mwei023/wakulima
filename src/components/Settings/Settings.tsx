import { useState } from 'react';
import { useStore } from '@/store/useStore';
import { useRole } from '@/hooks/useRole';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  Settings as SettingsIcon, 
  RefreshCw, 
  Download, 
  Wifi, 
  WifiOff,
  CheckCircle,
  AlertCircle
} from 'lucide-react';
import { CategoryManager } from './CategoryManager';
import { StoreManagement } from './StoreManagement';
import { EmployeeManagement } from './EmployeeManagement';
import { toast } from '@/hooks/use-toast';
import { formatCurrency } from '@/lib/utils';

export const Settings = () => {
  const { syncStatus, forceSync, sales } = useStore();
  const { isAdmin, loading: roleLoading } = useRole();
  const [issyncing, setSyncing] = useState(false);

  const handleForceSync = async () => {
    setSyncing(true);
    try {
      await forceSync();
      toast({
        title: "Sync Complete",
        description: "All pending sales have been synced",
        variant: "default"
      });
    } catch (error) {
      toast({
        title: "Sync Failed",
        description: "Unable to sync. Check your connection and try again.",
        variant: "destructive"
      });
    } finally {
      setSyncing(false);
    }
  };

  const handleExportData = () => {
    // Create CSV export of all sales
    const csvData = sales.map(sale => ({
      date: new Date(sale.timestamp).toLocaleDateString(),
      customer: sale.customer_id || 'Walk-in',
      total: sale.total_amount,
      payment: sale.payment_method,
      status: sale.status
    }));

    const csv = [
      ['Date', 'Customer', 'Total', 'Payment Method', 'Status'],
      ...csvData.map(row => [row.date, row.customer, row.total, row.payment, row.status])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wakulima-sales-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    toast({
      title: "Export Complete",
      description: "Sales data has been downloaded as CSV",
    });
  };

  const getSyncStatusIcon = () => {
    if (!syncStatus.isOnline) return <WifiOff className="h-4 w-4" />;
    if (syncStatus.pendingSales > 0) return <RefreshCw className="h-4 w-4 animate-spin" />;
    return <CheckCircle className="h-4 w-4" />;
  };

  const getSyncStatusColor = () => {
    if (!syncStatus.isOnline) return 'destructive';
    if (syncStatus.pendingSales > 0) return 'warning';
    return 'default';
  };

  return (
    <div className="space-y-6">
      {/* Sync Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <SettingsIcon className="h-5 w-5" />
            System Status & Sync
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {getSyncStatusIcon()}
              <span className="font-medium">Connection Status</span>
            </div>
            <Badge variant={getSyncStatusColor() as any}>
              {!syncStatus.isOnline 
                ? 'Offline' 
                : syncStatus.pendingSales > 0 
                  ? `${syncStatus.pendingSales} Pending`
                  : 'All Synced'
              }
            </Badge>
          </div>

          {syncStatus.pendingSales > 0 && (
            <div className="flex items-center gap-2 p-3 bg-warning/10 border border-warning/20 rounded-lg">
              <AlertCircle className="h-4 w-4 text-warning" />
              <span className="text-sm">
                {syncStatus.pendingSales} sales waiting to sync when connection is restored
              </span>
            </div>
          )}

          {syncStatus.lastSync && (
            <p className="text-sm text-muted-foreground">
              Last sync: {new Date(syncStatus.lastSync).toLocaleString()}
            </p>
          )}

          <div className="flex gap-2">
            <Button 
              onClick={handleForceSync}
              disabled={!syncStatus.isOnline || issyncing}
              variant="outline"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${issyncing ? 'animate-spin' : ''}`} />
              Force Sync
            </Button>
            <Button 
              onClick={handleExportData}
              variant="outline"
            >
              <Download className="h-4 w-4 mr-2" />
              Export Sales CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      <Separator />

      {/* Admin Only: Store Management */}
      {isAdmin && (
        <>
          <StoreManagement />
          <Separator />
        </>
      )}

      {/* Admin Only: Employee Management */}
      {isAdmin && (
        <>
          <EmployeeManagement />
          <Separator />
        </>
      )}

      {/* Category Management */}
      <CategoryManager />

      <Separator />

      {/* System Info */}
      <Card>
        <CardHeader>
          <CardTitle>System Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex justify-between">
            <span>Total Sales:</span>
            <span className="font-mono">{sales.length}</span>
          </div>
          <div className="flex justify-between">
            <span>Total Revenue:</span>
            <span className="font-mono">{formatCurrency(sales.reduce((sum, sale) => sum + sale.total_amount, 0))}</span>
          </div>
          <div className="flex justify-between">
            <span>App Version:</span>
            <span className="font-mono">1.0.0</span>
          </div>
          <div className="flex justify-between">
            <span>Install as App:</span>
            <Button size="sm" variant="outline" onClick={() => {
              if ('serviceWorker' in navigator) {
                navigator.serviceWorker.register('/sw.js').then(() => {
                  toast({
                    title: "App Ready",
                    description: "You can now install this app on your device from your browser menu",
                  });
                });
              }
            }}>
              Enable PWA
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};