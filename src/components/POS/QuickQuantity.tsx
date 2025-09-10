import { Button } from '@/components/ui/button';

interface QuickQuantityProps {
  onQuantitySelect: (quantity: number) => void;
}

export const QuickQuantity = ({ onQuantitySelect }: QuickQuantityProps) => {
  const quickQuantities = [1, 2, 5, 10];

  return (
    <div className="flex gap-1">
      {quickQuantities.map((qty) => (
        <Button
          key={qty}
          size="sm"
          variant="outline"
          onClick={() => onQuantitySelect(qty)}
          className="h-8 w-8 p-0 text-xs"
        >
          {qty}
        </Button>
      ))}
    </div>
  );
};