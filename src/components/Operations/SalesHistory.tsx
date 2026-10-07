import { useMemo, useState, useTransition } from 'react';
import { useStore } from '@/store/useStore';
import { useAuth } from '@/hooks/useAuth';
import { useRole } from '@/hooks/useRole';
import { activeSales, formatCurrency, formatDate } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Ban, CheckCircle2, Clock } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

const PAGE_SIZE = 10;

const statusBadge: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  completed: { label: 'Completed', variant: 'default' },
  voided: { label: 'Voided', variant: 'destructive' },
  pending: { label: 'Pending', variant: 'outline' },
  synced: { label: 'Synced', variant: 'secondary' },
};

export function SalesHistory() {
  const sales = useStore(s => s.sales);
  const customers = useStore(s => s.customers);
  const voidSale = useStore(s => s.voidSale);
  const { user } = useAuth();
  const { isAdmin } = useRole();
  const [page, setPage] = useState(0);
  const [voidTarget, setVoidTarget] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [pending, startTransition] = useTransition();
  const [inlineError, setInlineError] = useState<string | null>(null);

  const rows = useMemo(
    () =>
      [...sales]
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
        .map(sale => ({
          ...sale,
          customerName: customers.find(c => c.id === sale.customer_id)?.name ?? 'Walk-in',
        })),
    [sales, customers]
  );

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = rows.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const liveCount = activeSales(sales).length;
  const liveTotal = activeSales(sales).reduce((sum, s) => sum + s.total_amount, 0);

  const openVoidDialog = (saleId: string) => {
    setInlineError(null);
    setReason('');
    setVoidTarget(saleId);
  };

  const confirmVoid = () => {
    if (!voidTarget) return;
    const trimmed = reason.trim();
    if (trimmed.length < 10) {
      setInlineError('Give a short reason (at least 10 characters) — it is written to the audit log.');
      return;
    }
    startTransition(async () => {
      const error = await voidSale(voidTarget, trimmed);
      if (error) {
        setInlineError(error);
        return;
      }
      setVoidTarget(null);
      setReason('');
      toast({
        title: 'Sale voided',
        description: 'Stock restocked and totals updated.',
      });
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
        <span>
          Counted sales: <strong>{liveCount}</strong>
        </span>
        <span>
          Counted total: <strong>{formatCurrency(liveTotal)}</strong>
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-md border p-8 text-center text-muted-foreground">
          No sales recorded yet.
        </div>
      ) : (
        <div className="space-y-3">
          {pageRows.map(sale => {
            const badge = statusBadge[sale.status] ?? { label: sale.status, variant: 'outline' as const };
            return (
              <div
                key={sale.id}
                className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">{sale.id.slice(0, 8)}</span>
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                    <span className="text-sm text-muted-foreground">{formatDate(sale.timestamp)}</span>
                  </div>
                  <div className="mt-1 text-sm">
                    {sale.customerName} · {sale.payment_method} ·{' '}
                    {sale.items.map(i => `${i.quantity}× ${i.product_name}`).join(', ')}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className={`font-semibold ${sale.status === 'voided' ? 'line-through text-muted-foreground' : ''}`}>
                    {formatCurrency(sale.total_amount)}
                  </span>
                  {sale.status !== 'voided' && isAdmin && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1 text-destructive hover:text-destructive"
                      disabled={pending}
                      onClick={() => openVoidDialog(sale.id)}
                    >
                      <Ban className="h-4 w-4" />
                      Void
                    </Button>
                  )}
                  {sale.status === 'voided' && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      excluded from totals
                    </span>
                  )}
                  {sale.status !== 'voided' && !isAdmin && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <CheckCircle2 className="h-3 w-3" />
                      admin only
                    </span>
                  )}
                </div>
              </div>
            );
          })}

          {pageCount > 1 && (
            <div className="flex items-center justify-between pt-1">
              <Button variant="ghost" size="sm" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>
                Previous
              </Button>
              <span className="text-xs text-muted-foreground">
                Page {safePage + 1} of {pageCount}
              </span>
              <Button variant="ghost" size="sm" disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)}>
                Next
              </Button>
            </div>
          )}
        </div>
      )}

      <Dialog open={voidTarget !== null} onOpenChange={open => !open && setVoidTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Void sale</DialogTitle>
            <DialogDescription>
              This reverses the sale in one step: items go back into stock, credit balances shrink back, and the
              sale is marked voided and excluded from totals. The reason is written to the audit log.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="Why is this sale being voided?"
            rows={3}
          />
          {inlineError && <p className="text-sm text-destructive">{inlineError}</p>}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setVoidTarget(null)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmVoid} disabled={pending || reason.trim().length < 10}>
              {pending ? 'Voiding…' : 'Void sale'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
