import { useEffect, useState } from 'react';
import { useStore } from '@/store/useStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  Settings as SettingsIcon, 
  Download, 
  WifiOff,
  CheckCircle,
  HardDrive,
  ShieldAlert,
  ShieldCheck
} from 'lucide-react';
import { CategoryManager } from './CategoryManager';
import { toast } from '@/hooks/use-toast';
import { formatCurrency } from '@/lib/utils';
import { getStorageStatus, formatBytes, StorageStatus as StorageStatusInfo } from '@/lib/storage';
import { daysSinceLastOffDeviceBackup } from '@/lib/backupReminder';
import type { BadgeProps } from '@/components/ui/badge';

export const Settings = () => {
  const { isOnline, sales } = useStore();
  const [storage, setStorage] = useState<StorageStatusInfo | null>(null);

  useEffect(() => {
    void getStorageStatus().then(setStorage);
  }, []);

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
    if (!isOnline) return <WifiOff className="h-4 w-4" />;
    return <CheckCircle className="h-4 w-4" />;
  };

  const getSyncStatusColor = () => {
    if (!isOnline) return 'destructive';
    return 'default';
  };

  return (
    <div className="space-y-6">
      {/* Sync Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <SettingsIcon className="h-5 w-5" />
            System Status
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {getSyncStatusIcon()}
              <span className="font-medium">Connection Status</span>
            </div>
            <Badge variant={getSyncStatusColor() as BadgeProps['variant']}>
              {isOnline ? 'Online' : 'Offline'}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            All data is stored on this device. Sales work with or without internet.
          </p>

          {/* Data safety: persistence + last off-device backup */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <HardDrive className="h-4 w-4" />
              <span className="font-medium">Data Protection</span>
            </div>
            {storage === null ? (
              <Badge>Checking…</Badge>
            ) : storage.persisted ? (
              <Badge variant="success">Protected</Badge>
            ) : (
              <Badge variant="destructive">Eviction possible</Badge>
            )}
          </div>
          {storage !== null && (
            <p className="text-sm text-muted-foreground">
              {storage.persisted
                ? 'The browser will not delete your sales data to free space.'
                : 'The browser MAY delete all app data under storage pressure. Install the app as a PWA and reopen it to grant persistent storage.'}
              {storage.usageBytes !== null && storage.quotaBytes !== null && (
                <> Using {formatBytes(storage.usageBytes)} of {formatBytes(storage.quotaBytes)}.</>
              )}
            </p>
          )}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {daysSinceLastOffDeviceBackup() === null ? <ShieldAlert className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
              <span className="font-medium">Last off-device backup</span>
            </div>
            <Badge variant={daysSinceLastOffDeviceBackup() === null ? 'destructive' : 'secondary'}>
              {daysSinceLastOffDeviceBackup() === null
                ? 'Never'
                : `${daysSinceLastOffDeviceBackup()} day${daysSinceLastOffDeviceBackup() === 1 ? '' : 's'} ago`}
            </Badge>
          </div>

          <div className="flex gap-2">
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
              // VitePWA (autoUpdate) registers the service worker in production
              // builds; there is no hand-rolled /sw.js anymore.
              if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
                toast({
                  title: "App Ready",
                  description: "You can now install this app on your device from your browser menu",
                });
              } else {
                toast({
                  title: "Production build required",
                  description: "Run npm run build and serve the dist/ folder, then the app can be installed",
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