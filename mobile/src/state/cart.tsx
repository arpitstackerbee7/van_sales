/**
 * The invoice being built at a stop.
 *
 * Deliberately dumb about money: it tracks what was scanned and how many,
 * and asks the server for the priced total. The only figure it computes
 * locally is the subtotal, which is a hint while the rep is still scanning.
 */

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

import type { CatalogItem, CustomerSnapshot } from '../api/types';

export interface CartLine {
  item_code: string;
  item_name: string;
  uom: string;
  rate: number;
  qty: number;
  van_qty: number;
  batch_no?: string | null;
}

interface CartValue {
  customer: CustomerSnapshot | null;
  lines: CartLine[];
  subtotal: number;
  count: number;
  setCustomer: (customer: CustomerSnapshot | null) => void;
  addItem: (item: CatalogItem, qty?: number) => void;
  setQty: (itemCode: string, qty: number) => void;
  increment: (itemCode: string, by: number) => void;
  remove: (itemCode: string) => void;
  clear: () => void;
  /** Lines in the shape the API expects. */
  toPayloadItems: () => Record<string, unknown>[];
}

const CartContext = createContext<CartValue | null>(null);

export function useCart(): CartValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside <CartProvider>');
  return ctx;
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [customer, setCustomerState] = useState<CustomerSnapshot | null>(null);
  const [lines, setLines] = useState<CartLine[]>([]);

  const setCustomer = useCallback((next: CustomerSnapshot | null) => {
    setCustomerState((current) => {
      // Switching customer mid-basket would silently reprice everything, so
      // the basket is dropped rather than carried across.
      if (current && next && current.name !== next.name) setLines([]);
      return next;
    });
  }, []);

  const addItem = useCallback((item: CatalogItem, qty = 1) => {
    setLines((current) => {
      const existing = current.findIndex((line) => line.item_code === item.item_code);
      if (existing >= 0) {
        const copy = [...current];
        copy[existing] = { ...copy[existing], qty: copy[existing].qty + qty };
        return copy;
      }
      return [
        ...current,
        {
          item_code: item.item_code,
          item_name: item.item_name,
          uom: item.uom,
          rate: item.rate,
          qty,
          van_qty: item.van_qty,
        },
      ];
    });
  }, []);

  const setQty = useCallback((itemCode: string, qty: number) => {
    setLines((current) =>
      current
        .map((line) => (line.item_code === itemCode ? { ...line, qty: Math.max(0, qty) } : line))
        .filter((line) => line.qty > 0),
    );
  }, []);

  const increment = useCallback((itemCode: string, by: number) => {
    setLines((current) =>
      current
        .map((line) =>
          line.item_code === itemCode ? { ...line, qty: Math.max(0, line.qty + by) } : line,
        )
        .filter((line) => line.qty > 0),
    );
  }, []);

  const remove = useCallback((itemCode: string) => {
    setLines((current) => current.filter((line) => line.item_code !== itemCode));
  }, []);

  const clear = useCallback(() => {
    setLines([]);
    setCustomerState(null);
  }, []);

  const subtotal = useMemo(
    () => lines.reduce((sum, line) => sum + line.rate * line.qty, 0),
    [lines],
  );

  const toPayloadItems = useCallback(
    () =>
      lines.map((line) => ({
        item_code: line.item_code,
        qty: line.qty,
        uom: line.uom,
        batch_no: line.batch_no ?? undefined,
      })),
    [lines],
  );

  const value = useMemo<CartValue>(
    () => ({
      customer,
      lines,
      subtotal,
      count: lines.length,
      setCustomer,
      addItem,
      setQty,
      increment,
      remove,
      clear,
      toPayloadItems,
    }),
    [
      customer,
      lines,
      subtotal,
      setCustomer,
      addItem,
      setQty,
      increment,
      remove,
      clear,
      toPayloadItems,
    ],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
