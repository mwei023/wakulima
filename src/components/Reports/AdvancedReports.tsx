import React, { useState } from 'react';
import { useStore } from '@/store/useStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { DatePickerWithRange } from '@/components/ui/date-range-picker';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Area, AreaChart
} from 'recharts';
import { 
  TrendingUp, DollarSign, Users, Package, AlertTriangle, 
  Calendar, Download, FileText, BarChart3 
} from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';
import { DateRange } from 'react-day-picker';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';

export const AdvancedReports = () => {
  const { sales, customers, products } = useStore();
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [selectedReport, setSelectedReport] = useState('overview');

  // Filter data by date range
  const getFilteredSales = () => {
    if (!dateRange?.from) return sales;
    
    return sales.filter(sale => {
      const saleDate = new Date(sale.timestamp);
      const fromDate = dateRange.from!;
      const toDate = dateRange.to || dateRange.from!;
      
      return saleDate >= fromDate && saleDate <= toDate;
    });
  };

  const filteredSales = getFilteredSales();

  // Advanced Analytics
  const getDailySalesData = () => {
    const dailyData: { [key: string]: { sales: number; profit: number; transactions: number } } = {};
    
    filteredSales.forEach(sale => {
      const date = new Date(sale.timestamp).toISOString().split('T')[0];
      const profit = sale.items.reduce((sum, item) => {
        const product = products.find(p => p.id === item.product_id);
        return sum + (product ? (item.unit_price - product.cost_price) * item.quantity : 0);
      }, 0);
      
      if (!dailyData[date]) {
        dailyData[date] = { sales: 0, profit: 0, transactions: 0 };
      }
      
      dailyData[date].sales += sale.total_amount;
      dailyData[date].profit += profit;
      dailyData[date].transactions += 1;
    });
    
    return Object.entries(dailyData)
      .map(([date, data]) => ({
        date: new Date(date).toLocaleDateString(),
        sales: data.sales,
        profit: data.profit,
        transactions: data.transactions
      }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  };

  const getPaymentMethodData = () => {
    const paymentData: { [key: string]: number } = {};
    
    filteredSales.forEach(sale => {
      paymentData[sale.payment_method] = (paymentData[sale.payment_method] || 0) + sale.total_amount;
    });
    
    return Object.entries(paymentData).map(([method, amount]) => ({
      name: method.charAt(0).toUpperCase() + method.slice(1),
      value: amount
    }));
  };

  const getCategoryPerformance = () => {
    const categoryData: { [key: string]: { sales: number; quantity: number } } = {};
    
    filteredSales.forEach(sale => {
      sale.items.forEach(item => {
        const product = products.find(p => p.id === item.product_id);
        if (product) {
          if (!categoryData[product.category]) {
            categoryData[product.category] = { sales: 0, quantity: 0 };
          }
          categoryData[product.category].sales += item.total_line;
          categoryData[product.category].quantity += item.quantity;
        }
      });
    });
    
    return Object.entries(categoryData).map(([category, data]) => ({
      category,
      sales: data.sales,
      quantity: data.quantity
    }));
  };

  const getTopCustomers = () => {
    const customerData: { [key: string]: { sales: number; transactions: number; customer: any } } = {};
    
    filteredSales.forEach(sale => {
      if (sale.customer_id && sale.customer_id !== 'walk-in') {
        const customer = customers.find(c => c.id === sale.customer_id);
        if (customer) {
          if (!customerData[sale.customer_id]) {
            customerData[sale.customer_id] = { sales: 0, transactions: 0, customer };
          }
          customerData[sale.customer_id].sales += sale.total_amount;
          customerData[sale.customer_id].transactions += 1;
        }
      }
    });
    
    return Object.values(customerData)
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 10);
  };

  const getInventoryInsights = () => {
    const stockValue = products.reduce((sum, product) => 
      sum + (product.stock_quantity * product.cost_price), 0
    );
    
    const lowStockCount = products.filter(p => p.stock_quantity <= p.reorder_level).length;
    const outOfStockCount = products.filter(p => p.stock_quantity === 0).length;
    
    const fastMovingProducts = products
      .map(product => {
        const totalSold = filteredSales.reduce((sum, sale) => {
          const item = sale.items.find(item => item.product_id === product.id);
          return sum + (item ? item.quantity : 0);
        }, 0);
        return { ...product, totalSold };
      })
      .sort((a, b) => b.totalSold - a.totalSold)
      .slice(0, 5);
    
    return {
      stockValue,
      lowStockCount,
      outOfStockCount,
      fastMovingProducts
    };
  };

  // Export functions
  const exportToExcel = (data: any[], filename: string) => {
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Report');
    XLSX.writeFile(wb, `${filename}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const generatePDFReport = () => {
    const doc = new jsPDF();
    const dailyData = getDailySalesData();
    const totalSales = filteredSales.reduce((sum, sale) => sum + sale.total_amount, 0);
    const totalProfit = filteredSales.reduce((sum, sale) => {
      return sum + sale.items.reduce((itemSum, item) => {
        const product = products.find(p => p.id === item.product_id);
        return itemSum + (product ? (item.unit_price - product.cost_price) * item.quantity : 0);
      }, 0);
    }, 0);

    // Header
    doc.setFontSize(20);
    doc.text('Business Report', 20, 20);
    
    doc.setFontSize(12);
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, 20, 35);
    doc.text(`Period: ${dateRange?.from?.toLocaleDateString() || 'All time'} - ${dateRange?.to?.toLocaleDateString() || 'Present'}`, 20, 45);
    
    // Summary
    doc.setFontSize(16);
    doc.text('Summary', 20, 65);
    
    doc.setFontSize(12);
    doc.text(`Total Sales: ${formatCurrency(totalSales)}`, 20, 80);
    doc.text(`Total Profit: ${formatCurrency(totalProfit)}`, 20, 90);
    doc.text(`Total Transactions: ${filteredSales.length}`, 20, 100);
    doc.text(`Profit Margin: ${totalSales > 0 ? ((totalProfit / totalSales) * 100).toFixed(1) : 0}%`, 20, 110);
    
    // Save
    doc.save(`business_report_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const dailyData = getDailySalesData();
  const paymentData = getPaymentMethodData();
  const categoryData = getCategoryPerformance();
  const topCustomers = getTopCustomers();
  const inventoryInsights = getInventoryInsights();

  const colors = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'];

  return (
    <div className="space-y-6">
      {/* Header with Date Range and Export */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Advanced Reports</h2>
          <p className="text-muted-foreground">Comprehensive business analytics and insights</p>
        </div>
        <div className="flex gap-2">
          <DatePickerWithRange date={dateRange} setDate={setDateRange} />
          <Button onClick={generatePDFReport} variant="outline" size="sm">
            <FileText className="h-4 w-4 mr-2" />
            PDF
          </Button>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(filteredSales.reduce((sum, sale) => sum + sale.total_amount, 0))}
            </div>
            <p className="text-xs text-muted-foreground">
              {filteredSales.length} transactions
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Inventory Value</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(inventoryInsights.stockValue)}
            </div>
            <p className="text-xs text-muted-foreground">
              {products.length} products
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Customers</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {customers.filter(c => c.id !== 'walk-in').length}
            </div>
            <p className="text-xs text-muted-foreground">
              {topCustomers.length} repeat customers
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Stock Alerts</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">
              {inventoryInsights.lowStockCount}
            </div>
            <p className="text-xs text-muted-foreground">
              {inventoryInsights.outOfStockCount} out of stock
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts and Analytics */}
      <Tabs value={selectedReport} onValueChange={setSelectedReport} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="sales">Sales</TabsTrigger>
          <TabsTrigger value="inventory">Inventory</TabsTrigger>
          <TabsTrigger value="customers">Customers</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Daily Sales Trend</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={dailyData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                    <Area type="monotone" dataKey="sales" stroke="#10b981" fill="#10b981" fillOpacity={0.6} />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Payment Methods</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={paymentData}
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    >
                      {paymentData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="sales" className="space-y-6">
          <div className="grid gap-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Sales vs Profit Analysis</CardTitle>
                <Button 
                  onClick={() => exportToExcel(dailyData, 'sales_analysis')}
                  size="sm" 
                  variant="outline"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </Button>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={400}>
                  <LineChart data={dailyData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                    <Line type="monotone" dataKey="sales" stroke="#3b82f6" strokeWidth={2} />
                    <Line type="monotone" dataKey="profit" stroke="#10b981" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Category Performance</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={categoryData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="category" />
                    <YAxis />
                    <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                    <Bar dataKey="sales" fill="#10b981" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="inventory" className="space-y-6">
          <div className="grid gap-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Fast Moving Products</CardTitle>
                <Button 
                  onClick={() => exportToExcel(inventoryInsights.fastMovingProducts, 'fast_moving_products')}
                  size="sm" 
                  variant="outline"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </Button>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {inventoryInsights.fastMovingProducts.map((product, index) => (
                    <div key={product.id} className="flex items-center justify-between p-3 border rounded">
                      <div>
                        <p className="font-medium">{product.name}</p>
                        <p className="text-sm text-muted-foreground">{product.category}</p>
                      </div>
                      <div className="text-right">
                        <Badge variant="secondary">{product.totalSold} sold</Badge>
                        <p className="text-xs text-muted-foreground">
                          {product.stock_quantity} remaining
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="customers" className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Top Customers by Revenue</CardTitle>
              <Button 
                onClick={() => exportToExcel(topCustomers, 'top_customers')}
                size="sm" 
                variant="outline"
              >
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {topCustomers.map((customerData, index) => (
                  <div key={customerData.customer.id} className="flex items-center justify-between p-3 border rounded">
                    <div>
                      <p className="font-medium">{customerData.customer.name}</p>
                      <p className="text-sm text-muted-foreground">{customerData.customer.phone}</p>
                    </div>
                    <div className="text-right">
                      <Badge variant="default">{formatCurrency(customerData.sales)}</Badge>
                      <p className="text-xs text-muted-foreground">
                        {customerData.transactions} transactions
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};