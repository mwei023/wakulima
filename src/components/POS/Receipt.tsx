import React, { forwardRef } from 'react';
import { Sale, Customer } from '@/types';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Separator } from '@/components/ui/separator';

interface ReceiptProps {
  sale: Sale;
  customer: Customer | null;
  businessInfo: {
    name: string;
    address: string;
    phone: string;
    email: string;
  };
}

export const Receipt = forwardRef<HTMLDivElement, ReceiptProps>(
  ({ sale, customer, businessInfo }, ref) => {
    const receiptNumber = `RCP-${sale.id.slice(-6).toUpperCase()}`;
    
    return (
      <div ref={ref} className="max-w-sm mx-auto bg-white p-4 text-black font-mono text-sm">
        {/* Header */}
        <div className="text-center mb-4">
          <h1 className="text-lg font-bold">{businessInfo.name}</h1>
          <p className="text-xs">{businessInfo.address}</p>
          <p className="text-xs">Tel: {businessInfo.phone}</p>
          <p className="text-xs">Email: {businessInfo.email}</p>
        </div>
        
        <Separator className="my-2" />
        
        {/* Receipt Info */}
        <div className="mb-4">
          <div className="flex justify-between">
            <span>Receipt #:</span>
            <span>{receiptNumber}</span>
          </div>
          <div className="flex justify-between">
            <span>Date:</span>
            <span>{formatDate(sale.timestamp)}</span>
          </div>
          <div className="flex justify-between">
            <span>Cashier:</span>
            <span>Admin</span>
          </div>
          {customer && customer.id !== 'walk-in' && (
            <div className="flex justify-between">
              <span>Customer:</span>
              <span>{customer.name}</span>
            </div>
          )}
        </div>
        
        <Separator className="my-2" />
        
        {/* Items */}
        <div className="mb-4">
          <div className="flex justify-between font-bold mb-2">
            <span>Item</span>
            <span>Qty</span>
            <span>Price</span>
            <span>Total</span>
          </div>
          <Separator className="mb-2" />
          
          {sale.items.map((item, index) => (
            <div key={index} className="mb-2">
              <div className="flex justify-between">
                <span className="flex-1 truncate">{item.product_name}</span>
                <span className="w-8 text-center">{item.quantity}</span>
                <span className="w-16 text-right">{formatCurrency(item.unit_price)}</span>
                <span className="w-16 text-right">{formatCurrency(item.total_line)}</span>
              </div>
            </div>
          ))}
        </div>
        
        <Separator className="my-2" />
        
        {/* Totals */}
        <div className="mb-4">
          <div className="flex justify-between">
            <span>Subtotal:</span>
            <span>{formatCurrency(sale.total_amount)}</span>
          </div>
          <div className="flex justify-between">
            <span>Tax (0%):</span>
            <span>{formatCurrency(0)}</span>
          </div>
          <div className="flex justify-between font-bold text-lg">
            <span>Total:</span>
            <span>{formatCurrency(sale.total_amount)}</span>
          </div>
          <div className="flex justify-between">
            <span>Payment:</span>
            <span className="capitalize">{sale.payment_method}</span>
          </div>
        </div>
        
        <Separator className="my-2" />
        
        {/* Footer */}
        <div className="text-center text-xs">
          <p className="mb-1">Thank you for your business!</p>
          <p>Goods sold are not returnable</p>
          <p className="mt-2">Powered by Wakulima AgroVet POS</p>
        </div>
      </div>
    );
  }
);

Receipt.displayName = 'Receipt';