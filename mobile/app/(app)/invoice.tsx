/**
 * The basket.
 *
 * Totals are never computed here. Every change asks the server to price the
 * basket, so the tax and total the rep reads are the exact figures the
 * invoice will post with, pricing rules and all. The subtotal shown while
 * that request is in flight is the only local arithmetic, and it is
 * labelled as a running figure rather than the total.
 */

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ApiError } from '../../src/api/client';
import type { Quote } from '../../src/api/types';
import { useApi, useAuth } from '../../src/auth/AuthContext';
import { useCart } from '../../src/state/cart';
import { Header } from '../../src/ui/Chrome';
import { money, qty as fmtQty } from '../../src/ui/format';
import {
  Banner,
  Button,
  Card,
  Empty,
  Mono,
  Row,
  ScreenScroll,
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

  const scanning = bootstrap?.policy.barcode_scanning ?? true;
  const manualSearch = bootstrap?.policy.manual_item_search ?? true;

  // Reprice whenever the basket changes. Cheap enough to do eagerly, and it
  // means the payment screen never has to wait.
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
        subtitle={cart.customer?.customer_name ?? 'Pick a customer first'}
        onBack={() => router.back()}
      />

      <ScreenScroll>
        {!cart.customer && (
          <Banner
            tone="info"
            title="No customer yet"
            body="An invoice needs a customer before it can be priced. Pick one from the customer list."
          />
        )}

        {/* Both inputs are server-controlled. A site with scanning off must
            not show a scan button that cannot work, and one that requires
            scanning must not offer a way around it -- but there must always
            be at least one way to add a line. */}
        <Row>
          {scanning && (
            <Button
              label="Scan"
              tone="dark"
              compact
              onPress={() => router.push('/(app)/scan')}
              style={{ flex: 1 }}
            />
          )}
          {manualSearch && (
            <Button
              label={scanning ? 'Search' : 'Add item'}
              tone={scanning ? 'ghost' : 'dark'}
              compact
              onPress={() => router.push('/(app)/items')}
              style={{ flex: 1 }}
            />
          )}
        </Row>
        <Button
          label={cart.customer ? `Customer · ${cart.customer.customer_name}` : 'Choose customer'}
          tone="ghost"
          compact
          onPress={() => router.push('/(app)/customers')}
        />

        {!scanning && !manualSearch && (
          <Banner
            tone="warning"
            title="No way to add items"
            body="Both barcode scanning and manual search are turned off in Van Sales Settings. Ask your administrator to enable one of them."
          />
        )}

        {cart.lines.length === 0 ? (
          <Empty
            text={
              scanning && manualSearch
                ? 'Scan an item, or search for one, to start the invoice.'
                : scanning
                  ? 'Scan an item to start the invoice.'
                  : manualSearch
                    ? 'Add an item to start the invoice.'
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

        {!!error && <Banner tone="danger" title="Pricing failed" body={error} />}
      </ScreenScroll>

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
