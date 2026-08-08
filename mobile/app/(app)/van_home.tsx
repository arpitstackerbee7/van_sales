/**
 * The van rep's home.
 *
 * Cash on hand leads because it is the number the rep is accountable for at
 * day close, and it is derived from the Payment Entries themselves rather
 * than a running total the app keeps -- so it always matches what the
 * cashier will count.
 */

import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { useApi, useAuth } from '../../src/auth/AuthContext';
import { useAsync } from '../../src/state/useAsync';
import { Header } from '../../src/ui/Chrome';
import { compact, money } from '../../src/ui/format';
import {
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
    () => api.listCustomers({ scope: 'due', limit: 6 }),
    [van?.profile],
  );

  const loading = collections.loading || customers.loading;

  function reloadAll() {
    collections.reload();
    stock.reload();
    customers.reload();
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

        <Row>
          <Button
            label={bootstrap?.policy.barcode_scanning === false ? 'Start a sale' : 'Scan & sell'}
            onPress={() =>
              router.push(
                bootstrap?.policy.barcode_scanning === false ? '/(app)/invoice' : '/(app)/scan',
              )
            }
            style={{ flex: 1 }}
          />
          <Button
            label="Stock"
            tone="ghost"
            onPress={() => router.push('/(app)/replenish')}
            style={{ width: 110 }}
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

const s = StyleSheet.create({
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
