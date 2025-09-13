import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useStore } from '@/store/useStore';
import { formatDate, formatCurrency } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { 
  Download, Upload, Database, FileText, Shield,
  Calendar, CheckCircle, AlertCircle, Clock
} from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';

interface BackupRecord {
  id: string;
  type: 'manual' | 'auto';
  timestamp: string;
  size: string;
  status: 'completed' | 'failed' | 'in-progress';
  includes: string[];
}

export const BackupManager = () => {
  const { products, customers, sales, pendingOrders } = useStore();
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [backupHistory] = useState<BackupRecord[]>([
    {
      id: 'backup-1',
      type: 'manual',
      timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      size: '2.4 MB',
      status: 'completed',
      includes: ['products', 'customers', 'sales']
    },
    {
      id: 'backup-2',
      type: 'auto',
      timestamp: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      size: '2.1 MB',
      status: 'completed',
      includes: ['products', 'customers', 'sales', 'orders']
    }
  ]);

  const exportToExcel = async (dataType: 'all' | 'products' | 'customers' | 'sales') => {
    setIsExporting(true);
    setExportProgress(0);

    try {
      const wb = XLSX.utils.book_new();

      if (dataType === 'all' || dataType === 'products') {
        setExportProgress(25);
        const productsData = products.map(product => ({
          ID: product.id,
          Name: product.name,
          Category: product.category,
          Unit: product.unit,
          'Selling Price': product.selling_price,
          'Cost Price': product.cost_price,
          'Stock Quantity': product.stock_quantity,
          'Reorder Level': product.reorder_level,
          Barcode: product.barcode || '',
          'Created Date': formatDate(product.created_at),
          'Updated Date': formatDate(product.updated_at)
        }));
        const ws1 = XLSX.utils.json_to_sheet(productsData);
        XLSX.utils.book_append_sheet(wb, ws1, 'Products');
      }

      if (dataType === 'all' || dataType === 'customers') {
        setExportProgress(50);
        const customersData = customers
          .filter(c => c.id !== 'walk-in')
          .map(customer => ({
            ID: customer.id,
            Name: customer.name,
            Phone: customer.phone,
            'Credit Limit': customer.credit_limit,
            'Outstanding Balance': customer.outstanding_balance,
            'Created Date': formatDate(customer.created_at)
          }));
        const ws2 = XLSX.utils.json_to_sheet(customersData);
        XLSX.utils.book_append_sheet(wb, ws2, 'Customers');
      }

      if (dataType === 'all' || dataType === 'sales') {
        setExportProgress(75);
        const salesData = sales.map(sale => ({
          'Sale ID': sale.id,
          'Customer ID': sale.customer_id || 'Walk-in',
          'Total Amount': sale.total_amount,
          'Payment Method': sale.payment_method,
          Status: sale.status,
          Date: formatDate(sale.timestamp),
          'Items Count': sale.items.length
        }));
        const ws3 = XLSX.utils.json_to_sheet(salesData);
        XLSX.utils.book_append_sheet(wb, ws3, 'Sales');

        // Sales Items Detail
        const salesItemsData = sales.flatMap(sale => 
          sale.items.map(item => ({
            'Sale ID': sale.id,
            'Product ID': item.product_id,
            'Product Name': item.product_name,
            Quantity: item.quantity,
            'Unit Price': item.unit_price,
            'Line Total': item.total_line,
            'Sale Date': formatDate(sale.timestamp)
          }))
        );
        const ws4 = XLSX.utils.json_to_sheet(salesItemsData);
        XLSX.utils.book_append_sheet(wb, ws4, 'Sales Items');
      }

      setExportProgress(100);
      
      const filename = `wakulima_backup_${dataType}_${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(wb, filename);

      toast({
        title: "Export Successful",
        description: `Data exported to ${filename}`,
      });

    } catch (error) {
      console.error('Export error:', error);
      toast({
        title: "Export Failed",
        description: "An error occurred during export",
        variant: "destructive"
      });
    } finally {
      setIsExporting(false);
      setExportProgress(0);
    }
  };

  const generateBusinessReport = () => {
    const doc = new jsPDF();
    const pageHeight = doc.internal.pageSize.height;
    let yPos = 20;

    // Header
    doc.setFontSize(24);
    doc.text('Wakulima AgroVet - Business Report', 20, yPos);
    yPos += 15;
    
    doc.setFontSize(12);
    doc.text(`Generated: ${formatDate(new Date().toISOString())}`, 20, yPos);
    yPos += 20;

    // Business Summary
    doc.setFontSize(16);
    doc.text('Business Summary', 20, yPos);
    yPos += 10;
    
    doc.setFontSize(12);
    const totalSales = sales.reduce((sum, sale) => sum + sale.total_amount, 0);
    const totalProfit = sales.reduce((sum, sale) => {
      return sum + sale.items.reduce((itemSum, item) => {
        const product = products.find(p => p.id === item.product_id);
        return itemSum + (product ? (item.unit_price - product.cost_price) * item.quantity : 0);
      }, 0);
    }, 0);
    const stockValue = products.reduce((sum, product) => 
      sum + (product.stock_quantity * product.cost_price), 0
    );

    const summaryData = [
      `Total Products: ${products.length}`,
      `Total Customers: ${customers.filter(c => c.id !== 'walk-in').length}`,
      `Total Sales: ${formatCurrency(totalSales)}`,
      `Total Profit: ${formatCurrency(totalProfit)}`,
      `Stock Value: ${formatCurrency(stockValue)}`,
      `Total Transactions: ${sales.length}`,
      `Profit Margin: ${totalSales > 0 ? ((totalProfit / totalSales) * 100).toFixed(1) : 0}%`
    ];

    summaryData.forEach(line => {
      if (yPos > pageHeight - 30) {
        doc.addPage();
        yPos = 20;
      }
      doc.text(line, 20, yPos);
      yPos += 8;
    });

    yPos += 10;

    // Top Products
    doc.setFontSize(16);
    doc.text('Top 10 Products by Revenue', 20, yPos);
    yPos += 10;

    const productSales = sales.reduce((acc, sale) => {
      sale.items.forEach(item => {
        if (!acc[item.product_id]) {
          acc[item.product_id] = {
            name: item.product_name,
            revenue: 0,
            quantity: 0
          };
        }
        acc[item.product_id].revenue += item.total_line;
        acc[item.product_id].quantity += item.quantity;
      });
      return acc;
    }, {} as Record<string, { name: string; revenue: number; quantity: number }>);

    const topProducts = Object.values(productSales)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    doc.setFontSize(12);
    topProducts.forEach((product, index) => {
      if (yPos > pageHeight - 30) {
        doc.addPage();
        yPos = 20;
      }
      doc.text(`${index + 1}. ${product.name}: ${formatCurrency(product.revenue)} (${product.quantity} units)`, 25, yPos);
      yPos += 8;
    });

    // Save
    const filename = `business_report_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(filename);

    toast({
      title: "Report Generated",
      description: `Business report saved as ${filename}`,
    });
  };

  const createFullBackup = async () => {
    setIsExporting(true);
    setExportProgress(0);

    try {
      // Create comprehensive backup data
      const backupData = {
        timestamp: new Date().toISOString(),
        version: '1.0',
        data: {
          products: products,
          customers: customers.filter(c => c.id !== 'walk-in'),
          sales: sales,
          pendingOrders: pendingOrders
        },
        metadata: {
          totalProducts: products.length,
          totalCustomers: customers.filter(c => c.id !== 'walk-in').length,
          totalSales: sales.length,
          totalRevenue: sales.reduce((sum, sale) => sum + sale.total_amount, 0)
        }
      };

      setExportProgress(50);

      // Convert to JSON and create downloadable file
      const jsonString = JSON.stringify(backupData, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `wakulima_full_backup_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setExportProgress(100);

      toast({
        title: "Backup Created",
        description: "Full system backup has been downloaded",
      });

    } catch (error) {
      console.error('Backup error:', error);
      toast({
        title: "Backup Failed",
        description: "An error occurred during backup creation",
        variant: "destructive"
      });
    } finally {
      setIsExporting(false);
      setExportProgress(0);
    }
  };

  const getBackupStats = () => {
    const totalSize = products.length + customers.length + sales.length + pendingOrders.length;
    const stockValue = products.reduce((sum, product) => 
      sum + (product.stock_quantity * product.cost_price), 0
    );
    const totalRevenue = sales.reduce((sum, sale) => sum + sale.total_amount, 0);

    return {
      totalRecords: totalSize,
      stockValue,
      totalRevenue,
      lastSale: sales.length > 0 ? sales[sales.length - 1].timestamp : null
    };
  };

  const stats = getBackupStats();

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Data Export & Backup</h2>
          <p className="text-muted-foreground">Export data and manage system backups</p>
        </div>
      </div>

      {/* System Overview */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Records</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalRecords}</div>
            <p className="text-xs text-muted-foreground">
              Across all tables
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Stock Value</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.stockValue)}</div>
            <p className="text-xs text-muted-foreground">
              Inventory worth
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.totalRevenue)}</div>
            <p className="text-xs text-muted-foreground">
              All time sales
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Last Activity</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold">
              {stats.lastSale ? formatDate(stats.lastSale).split(',')[0] : 'No sales'}
            </div>
            <p className="text-xs text-muted-foreground">
              Most recent sale
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Export Progress */}
      {isExporting && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <div className="space-y-2">
              <p>Export in progress... {exportProgress}%</p>
              <Progress value={exportProgress} className="w-full" />
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Quick Actions */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Download className="h-5 w-5" />
              Data Export
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Export specific data tables in Excel format for analysis or backup
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button 
                onClick={() => exportToExcel('products')} 
                variant="outline" 
                size="sm"
                disabled={isExporting}
              >
                Products
              </Button>
              <Button 
                onClick={() => exportToExcel('customers')} 
                variant="outline" 
                size="sm"
                disabled={isExporting}
              >
                Customers
              </Button>
              <Button 
                onClick={() => exportToExcel('sales')} 
                variant="outline" 
                size="sm"
                disabled={isExporting}
              >
                Sales
              </Button>
              <Button 
                onClick={() => exportToExcel('all')} 
                variant="default" 
                size="sm"
                disabled={isExporting}
              >
                All Data
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Reports
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Generate comprehensive business reports in PDF format
            </p>
            <div className="space-y-2">
              <Button 
                onClick={generateBusinessReport} 
                variant="outline" 
                className="w-full"
                disabled={isExporting}
              >
                Business Summary Report
              </Button>
              <Button 
                onClick={createFullBackup} 
                variant="default" 
                className="w-full"
                disabled={isExporting}
              >
                <Shield className="h-4 w-4 mr-2" />
                Create Full Backup
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Backup History */}
      <Card>
        <CardHeader>
          <CardTitle>Backup History</CardTitle>
        </CardHeader>
        <CardContent>
          {backupHistory.length === 0 ? (
            <div className="text-center py-8">
              <Database className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">No Backups Yet</h3>
              <p className="text-muted-foreground mb-4">
                Create your first backup to secure your business data
              </p>
              <Button onClick={createFullBackup}>Create Backup</Button>
            </div>
          ) : (
            <div className="space-y-3">
              {backupHistory.map(backup => (
                <div key={backup.id} className="flex items-center justify-between p-3 border rounded">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-full bg-primary/10">
                      {backup.status === 'completed' ? (
                        <CheckCircle className="h-4 w-4 text-success" />
                      ) : backup.status === 'failed' ? (
                        <AlertCircle className="h-4 w-4 text-destructive" />
                      ) : (
                        <Clock className="h-4 w-4 text-warning" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">
                          {backup.type === 'manual' ? 'Manual Backup' : 'Auto Backup'}
                        </span>
                        <Badge variant={backup.status === 'completed' ? 'default' : 'secondary'}>
                          {backup.status}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {formatDate(backup.timestamp)} • {backup.size} • {backup.includes.join(', ')}
                      </p>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm">
                    <Download className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};