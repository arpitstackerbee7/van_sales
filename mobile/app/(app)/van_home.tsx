/**
 * The van rep's home.
 *
 * Cash on hand leads because it is the number the rep is accountable for at
 * day close, and it is derived from the Payment Entries themselves rather
 * than a running total the app keeps -- so it always matches what the
 * cashier will count.
 */

import { useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import type { AgeingBucket } from '../../src/api/types';
import { useApi, useAuth } from '../../src/auth/AuthContext';
import { requestLocationAccess } from '../../src/state/posting';
import { useAsync } from '../../src/state/useAsync';
import { Header } from '../../src/ui/Chrome';
import { compact, money } from '../../src/ui/format';
import {
  Bar,
  Banner,
  Button,
  Card,
  Empty,
  Loading,
  Mono,
  MoneyPanel,
  Row,
  ScreenScroll,
  SectionLabel,
} from '../../src/ui/kit';
import { colors, radius, space } from '../../src/ui/theme';

export default function VanHome() {
  const router = useRouter();
  const api = useApi();
  const { bootstrap, van, refresh } = useAuth();

  const collections = useAsync(() => api.myCollections(), [van?.profile]);
  const stock = useAsync(
    async () => (van ? api.vanStock(van.warehouse) : null),
    [van?.warehouse],
  );
  const customers = useAsync(
    () => api.listCustomers({ scope: 'unpaid', limit: 6 }),
    [van?.profile],
  );
  const receivables = useAsync(() => api.receivablesSummary(), [van?.profile]);

  const loading = collections.loading || customers.loading;

  // Ask for location here, on the screen the rep opens at the start of the
  // day, so the system dialog never lands in the middle of a sale. Its
  // outcome gates nothing: refusing simply means documents post without
  // coordinates.
  useEffect(() => {
    if (bootstrap?.policy.capture_gps) requestLocationAccess().catch(() => {});
  }, [bootstrap?.policy.capture_gps]);

  function reloadAll() {
    collections.reload();
    stock.reload();
    customers.reload();
    receivables.reload();
    // Pull-to-refresh also re-reads policy and roles, so a setting changed
    // on the desk can be pulled in deliberately rather than waited for.
    refresh().catch(() => {});
  }

  return (
    <View style={{ flex: 1 }}>
      <Header
        title="Van Sales"
        subtitle={
          van
            ? `${bootstrap?.user.full_name} · ${van.vehicle ?? van.warehouse_name}`
            : bootstrap?.user.full_name
        }
      />

      <ScreenScroll
        refreshControl={<RefreshControl refreshing={loading} onRefresh={reloadAll} />}
      >
        {!van && (
          <Banner
            tone="warning"
            title="No van assigned"
            body="Your user is not on a Van Sales Profile yet, so there is no warehouse to sell from. Ask your administrator to add you to one."
          />
        )}

        <MoneyPanel>
          <View style={s.panelTop}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.panelLabel} numberOfLines={1}>
                {van ? `${van.warehouse_name}` : 'No van'}
              </Text>
              <Text style={s.panelTitle}>Cash on hand</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Mono size={26} color="#fff" weight="600">
                {money(collections.data?.cash_on_hand ?? 0, 0)}
              </Mono>
              <Text style={s.panelHint}>
                {van?.currency ?? ''} · {collections.data?.entries.length ?? 0} receipts
              </Text>
            </View>
          </View>

          <Row style={{ marginTop: space.md + 2 }}>
            <Tile label="Van stock" value={compact(stock.data?.total_value ?? 0)} />
            <Tile
              label="Collected"
              value={compact(collections.data?.total_collected ?? 0)}
            />
            <Tile label="Drafts" value={String(collections.data?.draft_count ?? 0)} />
          </Row>
        </MoneyPanel>

        {/* Receivables belong here, not two taps away on the customer
            list: what the round is owed is something the rep should meet
            before they set off, not go looking for. */}
        {!!receivables.data && (
          <Card>
            <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.cardLabel}>Total receivable</Text>
                <Mono size={26} style={{ marginTop: 4, letterSpacing: -0.7 }}>
                  {money(receivables.data.outstanding)}
                </Mono>
                <Text style={s.cardSub}>
                  {receivables.data.customers_with_balance} customer
                  {receivables.data.customers_with_balance === 1 ? '' : 's'} with a balance
                </Text>
              </View>
              {receivables.data.overdue > 0 && (
                <Pressable
                  onPress={() => router.push('/(app)/customers?scope=overdue' as never)}
                  style={s.overduePill}
                >
                  <Text style={s.overduePillText}>
                    {money(receivables.data.overdue, 0)} overdue
                  </Text>
                </Pressable>
              )}
            </Row>

            {receivables.data.outstanding > 0 && (
              <View style={{ marginTop: space.md }}>
                <Bar
                  height={6}
                  segments={(Object.keys(BUCKET_COLOR) as AgeingBucket[]).map((bucket) => ({
                    value: receivables.data!.ageing[bucket] ?? 0,
                    color: BUCKET_COLOR[bucket],
                  }))}
                />
                <Row style={{ marginTop: space.sm, flexWrap: 'wrap' }} gap={space.md}>
                  {(Object.keys(BUCKET_COLOR) as AgeingBucket[])
                    .filter((bucket) => (receivables.data!.ageing[bucket] ?? 0) > 0)
                    .map((bucket) => (
                      <View key={bucket} style={s.legend}>
                        <View style={[s.dot, { backgroundColor: BUCKET_COLOR[bucket] }]} />
                        <Text style={s.legendText}>
                          {bucket === 'current' ? 'Current' : `${bucket} days`}
                        </Text>
                        <Mono size={11.5} color={colors.muted} weight="600">
                          {money(receivables.data!.ageing[bucket] ?? 0, 0)}
                        </Mono>
                      </View>
                    ))}
                </Row>
              </View>
            )}
          </Card>
        )}

        {/* The two things a rep does at a stop. Stock has its own tab, so a
            third button here would only compete with these. */}
        <Row>
          <Button
            label="New invoice"
            onPress={() => router.push('/(app)/invoice')}
            style={{ flex: 1 }}
          />
          <Button
            label="Credit note"
            tone="danger"
            onPress={() => router.push('/(app)/credit-note/new' as never)}
            style={{ flex: 1 }}
          />
        </Row>

        <View style={s.listHead}>
          <SectionLabel>Customers with a balance</SectionLabel>
          <Pressable onPress={() => router.push('/(app)/customers')} hitSlop={8}>
            <Text style={s.link}>See all</Text>
          </Pressable>
        </View>

        {customers.loading && !customers.data ? (
          <Loading />
        ) : customers.error ? (
          <Banner
            tone="danger"
            title={customers.offline ? 'No connection' : 'Could not load customers'}
            body={customers.error}
          />
        ) : !customers.data?.customers.length ? (
          <Empty text="No customer has an open balance." />
        ) : (
          customers.data.customers.map((customer) => (
            <Pressable
              key={customer.name}
              onPress={() => router.push(`/(app)/customer/${encodeURIComponent(customer.name)}`)}
            >
              <Card>
                <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={s.name} numberOfLines={1}>
                      {customer.customer_name}
                    </Text>
                    <Text style={s.meta} numberOfLines={1}>
                      {customer.name}
                      {customer.payment_terms ? ` · ${customer.payment_terms}` : ''}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Mono
                      size={15}
                      color={customer.overdue > 0 ? colors.danger : colors.text}
                    >
                      {money(customer.outstanding)}
                    </Mono>
                    <Text
                      style={[
                        s.state,
                        { color: customer.overdue > 0 ? colors.danger : colors.faint },
                      ]}
                    >
                      {customer.overdue > 0
                        ? `${customer.overdue_invoices} overdue`
                        : `${customer.open_invoices} open`}
                    </Text>
                  </View>
                </View>
              </Card>
            </Pressable>
          ))
        )}
      </ScreenScroll>
    </View>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.tile}>
      <Text style={s.tileLabel}>{label}</Text>
      <Mono size={16} color="#fff" style={{ marginTop: 3 }}>
        {value}
      </Mono>
    </View>
  );
}

const BUCKET_COLOR: Record<AgeingBucket, string> = {
  current: '#17B26A',
  '1-30': '#84CAFF',
  '31-60': '#FDB022',
  '60+': '#F97066',
};

const s = StyleSheet.create({
  cardLabel: {
    fontSize: 11,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    color: colors.faint,
    fontWeight: '700',
  },
  cardSub: { fontSize: 12, color: colors.muted, marginTop: 3 },
  overduePill: {
    backgroundColor: colors.dangerWash,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  overduePillText: { color: '#B42318', fontSize: 11.5, fontWeight: '700' },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendText: { fontSize: 11.5, color: colors.faint },
  dot: { width: 7, height: 7, borderRadius: 4 },
  panelTop: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  panelLabel: {
    fontSize: 11,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.5)',
    fontWeight: '700',
  },
  panelTitle: { fontSize: 22, fontWeight: '600', color: '#fff', marginTop: 5, letterSpacing: -0.4 },
  panelHint: { fontSize: 11.5, color: 'rgba(255,255,255,0.5)', marginTop: 2 },
  tile: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: radius.sm + 1,
    padding: space.sm + 2,
  },
  tileLabel: {
    fontSize: 10.5,
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    fontWeight: '700',
  },
  listHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  link: { color: colors.primary, fontSize: 12.5, fontWeight: '600' },
  name: { fontSize: 15, fontWeight: '600', color: colors.text },
  meta: { fontSize: 12, color: colors.muted, marginTop: 2 },
  state: { fontSize: 11, fontWeight: '700', marginTop: 3 },
});
