import { describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';
import { db, seedLocal, processLocalSale, createLocalReturn } from '@/lib/db';
import { STORE_ID } from '@/lib/backend';

// The return cap + refund math is the fiddliest money logic in the codebase.
// These properties pin it against arbitrary sequences of return attempts:
//  1. A return succeeds iff its quantity fits in what is still returnable
//     (purchased qty minus non-rejected prior returns) — never a unit more.
//  2. Rejected-status returns do not consume returnable units.
//  3. Every successful refund is exactly unit_price × quantity (integer cents,
//     exact), and total refunded never exceeds what was paid for the line.

async function clearAll() {
  await db.transaction('rw', [db.localProducts, db.localCustomers, db.localSales, db.localReturns, db.localAudit], async () => {
    await db.localProducts.clear();
    await db.localCustomers.clear();
    await db.localSales.clear();
    await db.localReturns.clear();
    await db.localAudit.clear();
  });
}

beforeEach(async () => {
  await clearAll();
  await seedLocal();
});

describe('return math properties', () => {
  it('caps returns at purchased quantity and refunds exactly unit_price × qty for arbitrary sequences', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 40 }), // sale quantity
        fc.integer({ min: 1, max: 500_000 }), // unit price in integer cents (≤ KES 5,000)
        fc.array(
          fc.record({
            qty: fc.integer({ min: 1, max: 12 }),
            status: fc.constantFrom('pending', 'approved', 'rejected', 'completed'),
          }),
          { maxLength: 12 }
        ),
        async (saleQty, unitPrice, attempts) => {
          const product = (await db.localProducts.toArray())[0];
          // Fresh stock per run so the sale always fits.
          await db.localProducts.update(product.id, { stock_quantity: saleQty + 100 });

          const saleId = await processLocalSale(
            STORE_ID,
            null,
            'cash',
            [{
              product_id: product.id,
              product_name: product.name,
              quantity: saleQty,
              unit_price: unitPrice,
              total_line: unitPrice * saleQty,
            }],
            unitPrice * saleQty
          );

          // Fold the expected model in lockstep with the database.
          let remaining = saleQty;
          let refundedTotal = 0;
          for (const attempt of attempts) {
            if (attempt.qty <= remaining) {
              const ret = await createLocalReturn({
                sale_id: saleId,
                product_id: product.id,
                quantity: attempt.qty,
                reason: 'property test',
                return_type: 'refund',
                notes: '',
                status: attempt.status,
              });
              expect(ret.refund_amount).toBe(unitPrice * attempt.qty);
              expect(Number.isSafeInteger(ret.refund_amount)).toBe(true);
              if (attempt.status !== 'rejected') {
                remaining -= attempt.qty;
                refundedTotal += ret.refund_amount;
              }
            } else {
              await expect(
                createLocalReturn({
                  sale_id: saleId,
                  product_id: product.id,
                  quantity: attempt.qty,
                  reason: 'property test',
                  return_type: 'refund',
                  notes: '',
                  status: attempt.status,
                })
              ).rejects.toThrow(/still returnable/);
            }
          }

          // Total refunded never exceeds what was actually paid, and the
          // returnable window is exhausted exactly as the model predicts.
          expect(refundedTotal).toBe(unitPrice * (saleQty - remaining));
          expect(refundedTotal).toBeLessThanOrEqual(unitPrice * saleQty);

          const stored = await db.localReturns.where('sale_id').equals(saleId).toArray();
          const nonRejectedQty = stored.filter(r => r.status !== 'rejected').reduce((s, r) => s + r.quantity, 0);
          expect(nonRejectedQty).toBe(saleQty - remaining);

          // The model must never allow over-returning.
          expect(nonRejectedQty).toBeLessThanOrEqual(saleQty);
        }
      ),
      { numRuns: 50 }
    );
  });
});
