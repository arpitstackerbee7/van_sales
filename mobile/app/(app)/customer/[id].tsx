/**
 * Customer detail: the credit gate before any sell action.
 *
 * Limit, headroom and the oldest overdue invoice render above the buttons on
 * purpose. The rep should learn the account is blocked before they start
 * building an invoice they cannot close.
 */

import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { useApi } from '../../../src/auth/AuthContext';
import { useCart } from '../../../src/state/cart';
import { useAsync } from '../../../src/state/useAsync';
import { Header } from '../../../src/ui/Chrome';
import { money, shortDate } from '../../../src/ui/format';
import {
  Bar,
  Banner,
  Button,
  Card,
  Empty,
  Loading,
  Mono,
  Row,
  ScreenScroll,
  SectionLabel,
} from '../../../src/ui/kit';
import { colors, radius, space } from '../../../src/ui/theme';

export default function CustomerDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const customerId = decodeURIComponent(String(id ?? ''));
  const router = useRouter();
  const api = useApi();
  const cart = useCart();

  const snapshot = useAsync(() => api.customerSnapshot(customerId), [customerId]);
  const statement = useAsync(() => api.statement(customerId), [customerId]);

  const c = snapshot.data;
  const usedPct =
    c && c.credit_limit > 0 ? Math.min(100, (c.outstanding / c.credit_limit) * 100) : 0;

  function startInvoice() {
    if (!c) return;
    cart.setCustomer(c);
    // The basket screen, not the scanner. Scanning is the fast path, not the
    // only one -- sending the rep straight to a camera they may not be able
    // to use would make a secondary tool block the sale.
    router.push('/(app)/invoice');
  }

  function collect() {
    if (!c) return;
    cart.setCustomer(c);
    router.push('/(app)/payment?mode=collect');
  }

  return (
    <View style={{ flex: 1 }}>
      <Header
        title={c?.customer_name ?? customerId}
        subtitle={c ? `${c.name}${c.territory ? ` · ${c.territory}` : ''}` : undefined}
        onBack={() => router.back()}
      />

      <ScreenScroll
        refreshControl={
          <RefreshControl
            refreshing={snapshot.loading}
            onRefresh={() => {
              snapshot.reload();
              statement.reload();
            }}
          />
        }
      >
        {snapshot.loading && !c ? (
          <Loading />
        ) : snapshot.error ? (
          <Banner
            tone="danger"
            title={snapshot.offline ? 'No connection' : 'Could not load customer'}
            body={snapshot.error}
          />
        ) : c ? (
          <>
            {c.blocked && (
              <Banner
                tone="danger"
                title="Account frozen"
                body="This customer is disabled or frozen in ERPNext. No new invoice can be raised against them."
              />
            )}

            <Card>
              <Text style={s.title}>{c.customer_name}</Text>
              <Text style={s.meta}>
                {c.name}
                {c.tax_id ? ` · TRN ${c.tax_id}` : ''}
                {c.payment_terms ? ` · ${c.payment_terms}` : ''}
              </Text>

              <Row style={{ marginTop: space.md }}>
                <Stat label="Outstanding" value={money(c.outstanding)} />
                <Stat
                  label="Credit limit"
                  value={c.credit_limit > 0 ? money(c.credit_limit, 0) : 'None'}
                />
              </Row>

              {c.credit_limit > 0 && (
                <View style={{ marginTop: space.md }}>
                  <Bar
                    height={8}
                    segments={[
                      {
                        value: usedPct,
                        color: usedPct > 90 ? colors.danger : usedPct > 75 ? colors.warning : colors.success,
                      },
                      { value: 100 - usedPct, color: colors.subtle },
                    ]}
                  />
                  <View style={s.limitRow}>
                    <Text
                      style={[
                        s.limitText,
                        { color: usedPct > 90 ? colors.danger : colors.warning },
                      ]}
                    >
                      {usedPct.toFixed(0)}% used · {money(c.credit_headroom ?? 0, 0)} headroom
                    </Text>
                    {c.overdue_invoices > 0 && (
                      <Text style={[s.limitText, { color: colors.danger }]}>
                        {c.overdue_invoices} overdue
                      </Text>
                    )}
                  </View>
                </View>
              )}
            </Card>

            <Button label="New invoice" onPress={startInvoice} />
            <Row>
              <Button
                label="Collect payment"
                tone="ghost"
                compact
                onPress={collect}
                style={{ flex: 1 }}
              />
              <Button
                label="Statement"
                tone="ghost"
                compact
                onPress={() =>
                  router.push(`/(app)/statement/${encodeURIComponent(customerId)}` as never)
                }
                style={{ flex: 1 }}
              />
            </Row>

            <SectionLabel style={{ marginTop: space.xs }}>Recent activity</SectionLabel>

            {statement.loading && !statement.data ? (
              <Loading />
            ) : !statement.data?.lines.length ? (
              <Empty text="Nothing on this account in the last year." />
            ) : (
              statement.data.lines.slice(0, 6).map((line) => (
                <Pressable
                  key={`${line.doctype}-${line.name}`}
                  disabled={line.doctype !== 'Sales Invoice'}
                  onPress={() =>
                    router.push(
                      `/(app)/invoice-view/${encodeURIComponent(line.name)}` as never,
                    )
                  }
                >
                <Card style={s.line}>
                  <View style={{ flexDirection: 'row', gap: space.sm }}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Mono size={13}>{line.name}</Mono>
                      <Text style={s.lineMeta}>
                        {shortDate(line.date, true)}
                        {line.mode_of_payment ? ` · ${line.mode_of_payment}` : ''}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Mono size={14.5} color={line.amount < 0 ? colors.success : colors.text}>
                        {money(line.amount)}
                      </Mono>
                      <Text style={s.lineState}>{line.state}</Text>
                    </View>
                  </View>
                  {line.partial && (
                    <View style={s.partial}>
                      <Mono size={11.5} color={colors.success} weight="500">
                        Paid {money(line.paid)}
                      </Mono>
                      <Mono size={11.5} color="#B42318" weight="500">
                        Balance {money(line.balance)}
                      </Mono>
                    </View>
                  )}
                </Card>
                </Pressable>
              ))
            )}
          </>
        ) : null}
      </ScreenScroll>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.stat}>
      <Text style={s.statLabel}>{label}</Text>
      <Mono size={18} style={{ marginTop: 4 }}>
        {value}
      </Mono>
    </View>
  );
}

const s = StyleSheet.create({
  title: { fontSize: 19, fontWeight: '600', color: colors.text, letterSpacing: -0.4 },
  meta: { fontSize: 12.5, color: colors.muted, marginTop: 3 },
  stat: { flex: 1, backgroundColor: colors.bg, borderRadius: radius.md, padding: 11 },
  statLabel: {
    fontSize: 10.5,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    color: colors.faint,
    fontWeight: '700',
  },
  limitRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 7 },
  limitText: { fontSize: 12, fontWeight: '600' },
  line: { padding: space.md },
  lineMeta: { fontSize: 11.5, color: colors.faint, marginTop: 3 },
  lineState: { fontSize: 10.5, fontWeight: '700', color: colors.faint, marginTop: 2 },
  partial: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 9,
    paddingTop: 9,
    borderTopWidth: 1,
    borderTopColor: colors.subtle,
    borderStyle: 'dashed',
  },
});
