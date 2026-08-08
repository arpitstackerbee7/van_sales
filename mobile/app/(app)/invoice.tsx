/**
 * The invoice being built.
 *
 * Shaped like a Sales Invoice on the desk: a Customer link field at the top,
 * then item rows, then totals. Tapping Customer or Add item opens a picker
 * rather than navigating away, so the document on screen is never lost while
 * choosing something for it. Anyone who fills in a Sales Invoice in ERPNext
 * should recognise the flow without being taught it.
 *
 * Totals are never computed here. Every change asks the server to price the
 * basket, so the tax and total the rep reads are the figures the invoice will
 * post with, pricing rules and all.
 */

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ApiError } from '../../src/api/client';
import type { CatalogItem, CustomerRow, Quote } from '../../src/api/types';
import { useApi, useAuth } from '../../src/auth/AuthContext';
import { useCart } from '../../src/state/cart';
import { Header } from '../../src/ui/Chrome';
import { LinkField } from '../../src/ui/LinkField';
import { Picker } from '../../src/ui/Picker';
import { money, qty as fmtQty } from '../../src/ui/format';
import {
  Banner,
  Button,
  Card,
  Empty,
  Mono,
  Row,
  ScreenScroll,
  SectionLabel,
} from '../../src/ui/kit';
import { colors, radius, space } from '../../src/ui/theme';

export default function Invoice() {
  const router = useRouter();
  const api = useApi();
  const { van, bootstrap } = useAuth();
  const cart = useCart();

  const [quote, setQuote] = useState<Quote | null>(null);
  const [pricing, setPricing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState<null | 'customer' | 'item'>(null);
  const [onVanOnly, setOnVanOnly] = useState(true);

  const scanning = bootstrap?.policy.barcode_scanning ?? true;
  const manualSearch = bootstrap?.policy.manual_item_search ?? true;

  useEffect(() => {
    let cancelled = false;

    if (!cart.customer || cart.lines.length === 0) {
      setQuote(null);
      return;
    }

    setPricing(true);
    setError(null);

    api
      .quote({
        customer: cart.customer.name,
        profile: van?.profile,
        items: cart.toPayloadItems(),
      })
      .then((result) => {
        if (!cancelled) setQuote(result);
      })
      .catch((e) => {
        if (!cancelled) {
          setQuote(null);
          setError(e instanceof ApiError ? e.message : 'Could not price this basket.');
        }
      })
      .finally(() => {
        if (!cancelled) setPricing(false);
      });

    return () => {
      cancelled = true;
    };
  }, [api, cart.customer, cart.lines, cart.toPayloadItems, van?.profile]);

  const canContinue = !!cart.customer && cart.lines.length > 0 && !!quote && !pricing;

  return (
    <View style={{ flex: 1 }}>
      <Header
        title="New invoice"
        subtitle={van ? `${van.profile} · ${van.warehouse_name}` : undefined}
      />

      <ScreenScroll>
        {/* Customer -------------------------------------------------- */}
        <Card>
          <LinkField
            label="Customer"
            required
            value={cart.customer?.customer_name}
            description={
              cart.customer
                ? `${cart.customer.name} · ${money(cart.customer.outstanding)} outstanding`
                : undefined
            }
            placeholder="Select a customer"
            onPress={() => setPicking('customer')}
            onClear={() => cart.setCustomer(null)}
          />

          {!!cart.customer && cart.customer.credit_limit > 0 && (
            <Text style={s.credit}>
              Limit {money(cart.customer.credit_limit, 0)} · headroom{' '}
              {money(cart.customer.credit_headroom ?? 0, 0)}
            </Text>
          )}
        </Card>

        {/* Items ----------------------------------------------------- */}
        <View style={s.itemsHead}>
          <SectionLabel>Items</SectionLabel>
          {cart.lines.length > 0 && (
            <Text style={s.count}>
              {cart.lines.length} {cart.lines.length === 1 ? 'line' : 'lines'}
            </Text>
          )}
        </View>

        {cart.lines.length === 0 ? (
          <Empty
            text={
              scanning || manualSearch
                ? 'No items yet. Add one to start the invoice.'
                : 'No way to add items is enabled on this site.'
            }
          />
        ) : (
          cart.lines.map((line) => {
            const over = line.qty > line.van_qty;
            return (
              <Card key={line.item_code}>
                <View style={{ flexDirection: 'row', gap: space.sm + 2 }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={s.name}>{line.item_name}</Text>
                    <Mono size={11.5} color={colors.faint} weight="500" style={{ marginTop: 3 }}>
                      {line.item_code} · {line.uom} · {money(line.rate)}
                    </Mono>
                  </View>
                  <Pressable
                    onPress={() => cart.remove(line.item_code)}
                    hitSlop={8}
                    style={s.remove}
                    accessibilityLabel={`Remove ${line.item_name}`}
                  >
                    <Ionicons name="close" size={15} color={colors.faint} />
                  </Pressable>
                </View>

                <View style={s.qtyRow}>
                  <View style={s.stepper}>
                    <Pressable
                      onPress={() => cart.increment(line.item_code, -1)}
                      style={s.step}
                      accessibilityLabel="Decrease quantity"
                    >
                      <Ionicons name="remove" size={20} color={colors.text} />
                    </Pressable>
                    <View style={s.qtyBox}>
                      <Mono size={16}>{fmtQty(line.qty)}</Mono>
                    </View>
                    <Pressable
                      onPress={() => cart.increment(line.item_code, 1)}
                      style={s.step}
                      accessibilityLabel="Increase quantity"
                    >
                      <Ionicons name="add" size={20} color={colors.text} />
                    </Pressable>
                  </View>

                  <View style={{ alignItems: 'flex-end' }}>
                    <Mono size={17}>{money(line.rate * line.qty)}</Mono>
                    <Text style={[s.stock, { color: over ? colors.warning : colors.placeholder }]}>
                      {over ? 'over van stock' : `van ${fmtQty(line.van_qty)}`}
                    </Text>
                  </View>
                </View>
              </Card>
            );
          })
        )}

        {/* Adding a line. Scanning is the fast path when it is on, but
            there is always a way in that does not depend on it. */}
        <Row>
          {manualSearch && (
            <Button
              label="Add item"
              tone={scanning ? 'ghost' : 'dark'}
              compact
              onPress={() => setPicking('item')}
              style={{ flex: 1 }}
            />
          )}
          {scanning && (
            <Button
              label="Scan"
              tone="dark"
              compact
              onPress={() => router.push('/(app)/scan')}
              style={{ flex: 1 }}
            />
          )}
        </Row>

        {!!error && <Banner tone="danger" title="Pricing failed" body={error} />}
      </ScreenScroll>

      {/* Totals ------------------------------------------------------ */}
      {cart.lines.length > 0 && (
        <View style={s.footer}>
          <SummaryRow
            label={quote ? 'Net total' : 'Running subtotal'}
            value={money(quote?.net_total ?? cart.subtotal)}
          />
          {quote?.taxes.map((tax, i) => (
            <SummaryRow key={i} label={tax.description} value={money(tax.amount)} />
          ))}

          <View style={s.totalRow}>
            <Text style={s.totalLabel}>Total</Text>
            <Mono size={24} style={{ letterSpacing: -0.5 }}>
              {pricing && !quote ? '—' : money(quote?.grand_total ?? cart.subtotal)}
            </Mono>
          </View>

          {quote?.credit.over_limit && (
            <View style={{ marginTop: space.sm }}>
              <Banner
                tone="warning"
                title={`Exceeds credit limit by ${money(quote.credit.over_by)}`}
                body={
                  quote.credit.blocks_credit_sale
                    ? 'Cash settlement is allowed. A credit sale will be refused.'
                    : 'A credit sale is allowed but will be flagged.'
                }
              />
            </View>
          )}

          <Button
            label={pricing ? 'Pricing…' : 'Continue to payment'}
            loading={pricing && !quote}
            disabled={!canContinue}
            onPress={() => router.push('/(app)/payment')}
            style={{ marginTop: space.md }}
          />
        </View>
      )}

      {/* Customer picker --------------------------------------------- */}
      <Picker<CustomerRow>
        visible={picking === 'customer'}
        title="Select customer"
        placeholder="Name, code or TRN"
        onClose={() => setPicking(null)}
        fetch={async (q) =>
          (await api.listCustomers({ search: q || undefined, limit: 40 })).customers
        }
        keyFor={(c) => c.name}
        emptyText="No customer matches that search."
        onSelect={async (c) => {
          setPicking(null);
          // The list row is enough to display, but the sell flow needs the
          // full credit position, so read the same snapshot the customer
          // screen uses.
          try {
            const full = await api.customerSnapshot(c.name);
            cart.setCustomer(full);
          } catch {
            cart.setCustomer({ ...c, default_price_list: null, blocked: false });
          }
        }}
        renderRow={(c) => (
          <View style={{ flexDirection: 'row', gap: space.md }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.pickName} numberOfLines={1}>
                {c.customer_name}
              </Text>
              <Mono size={11.5} color={colors.faint} weight="500" style={{ marginTop: 2 }}>
                {c.name}
                {c.payment_terms ? ` · ${c.payment_terms}` : ''}
              </Mono>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Mono size={14} color={c.overdue > 0 ? colors.danger : colors.text}>
                {money(c.outstanding)}
              </Mono>
              <Text style={s.pickMeta}>
                {c.overdue > 0 ? `${c.overdue_invoices} overdue` : 'due'}
              </Text>
            </View>
          </View>
        )}
      />

      {/* Item picker -------------------------------------------------- */}
      <Picker<CatalogItem>
        visible={picking === 'item'}
        title="Add item"
        placeholder="Item name or code"
        onClose={() => setPicking(null)}
        emptyText={
          onVanOnly
            ? 'Nothing on the van matches. Try All items.'
            : 'No sales item matches that search.'
        }
        header={
          <Row gap={7} style={{ marginBottom: space.sm }}>
            {[
              { key: true, label: 'On the van' },
              { key: false, label: 'All items' },
            ].map((opt) => {
              const active = onVanOnly === opt.key;
              return (
                <Pressable
                  key={String(opt.key)}
                  onPress={() => setOnVanOnly(opt.key)}
                  style={[
                    s.chip,
                    {
                      backgroundColor: active ? colors.text : colors.card,
                      borderColor: active ? colors.text : colors.border,
                    },
                  ]}
                >
                  <Text style={[s.chipText, { color: active ? '#fff' : '#3B4658' }]}>
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </Row>
        }
        fetch={async (q) =>
          (
            await api.searchItems({
              query: q || undefined,
              warehouse: van?.warehouse,
              customer: cart.customer?.name,
              price_list: van?.price_list,
              company: van?.company,
              currency: van?.currency,
              in_stock_only: onVanOnly ? 1 : 0,
              limit: 40,
            })
          ).items
        }
        keyFor={(i) => i.item_code}
        onSelect={(item) => {
          cart.addItem(item, 1);
          setPicking(null);
        }}
        renderRow={(item) => (
          <View style={{ flexDirection: 'row', gap: space.md }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.pickName} numberOfLines={2}>
                {item.item_name}
              </Text>
              <Mono size={11.5} color={colors.faint} weight="500" style={{ marginTop: 2 }}>
                {item.item_code} · {item.uom}
              </Mono>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Mono size={14}>{money(item.rate)}</Mono>
              <Text
                style={[
                  s.pickMeta,
                  { color: item.van_qty > 0 ? colors.success : colors.warning },
                ]}
              >
                {item.van_qty > 0 ? `van ${fmtQty(item.van_qty)}` : 'not on van'}
              </Text>
            </View>
          </View>
        )}
      />
    </View>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.summaryRow}>
      <Text style={s.summaryLabel}>{label}</Text>
      <Mono size={13} color={colors.muted} weight="500">
        {value}
      </Mono>
    </View>
  );
}

const s = StyleSheet.create({
  credit: { fontSize: 12, color: colors.muted, marginTop: space.sm },
  itemsHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  count: { fontSize: 12, color: colors.faint, fontWeight: '600' },
  name: { fontSize: 14.5, fontWeight: '600', color: colors.text, lineHeight: 19 },
  remove: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 11,
  },
  stepper: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  step: { width: 46, height: 42, alignItems: 'center', justifyContent: 'center' },
  qtyBox: {
    width: 54,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: colors.subtle,
  },
  stock: { fontSize: 11, fontWeight: '600', marginTop: 2 },
  chip: {
    flex: 1,
    height: 36,
    borderRadius: radius.sm + 1,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: { fontSize: 12.5, fontWeight: '700' },
  pickName: { fontSize: 14.5, fontWeight: '600', color: colors.text },
  pickMeta: { fontSize: 11, color: colors.faint, marginTop: 2, fontWeight: '600' },
  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
    padding: space.md + 2,
    paddingBottom: space.lg,
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  summaryLabel: { fontSize: 13, color: colors.muted },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: 9,
    paddingTop: 9,
    borderTopWidth: 1,
    borderTopColor: colors.subtle,
  },
  totalLabel: { fontSize: 15, fontWeight: '600', color: colors.text },
});
