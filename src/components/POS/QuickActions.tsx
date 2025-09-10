import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Product } from '@/types';
import { formatCurrency } from '@/lib/utils';

interface QuickActionsProps {
  topProducts: Product[];
  onAddToCart: (productId: string) => void;
}

export const QuickActions = ({ topProducts, onAddToCart }: QuickActionsProps) => {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-muted-foreground">Quick Add (Top Products)</h3>
      <div className="grid grid-cols-2 gap-2">
        {topProducts.slice(0, 6).map((product) => (
          <Button
            key={product.id}
            variant="outline"
            className="h-auto p-3 flex flex-col items-start text-left"
            onClick={() => onAddToCart(product.id)}
            disabled={product.stock_quantity <= 0}
          >
            <div className="flex items-center justify-between w-full mb-1">
              <span className="font-medium text-xs truncate">{product.name}</span>
              <Badge variant={product.stock_quantity <= 0 ? 'destructive' : 'secondary'} className="text-xs">
                {product.stock_quantity}
              </Badge>
            </div>
            <span className="text-xs text-muted-foreground">{formatCurrency(product.selling_price)}</span>
          </Button>
        ))}
      </div>
    </div>
  );
};