/**
 * Customer list with the receivables position already on the row.
 *
 * The ageing bar is the point of this screen: a rep should be able to tell
 * a healthy account from a 60-day one without opening anything.
 */

import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';

import type { AgeingBucket } from '../../src/api/types';
import { useApi } from '../../src/auth/AuthContext';
import { useAsync } from '../../src/state/useAsync';
import { Header } from '../../src/ui/Chrome';
import { money } from '../../src/ui/format';
import {
  Bar,
  Banner,
  Card,
  Empty,
  Loading,
  Mono,
  MoneyPanel,
  Row,
  ScreenScroll,
} from '../../src/ui/kit';
import { colors, radius, space } from '../../src/ui/theme';

const BUCKET_COLOR: Record<AgeingBucket, string> = {
  current: '#17B26A',
  '1-30': '#84CAFF',
  '31-60': '#FDB022',
  '60+': '#F97066',
};

const SCOPES = [
  { key: 'all', label: 'All' },
  { key: 'due', label: 'With balance' },
  { key: 'overdue', label: 'Overdue' },
] as const;

export default function Customers() {
  const router = useRouter();
  const api = useApi();

  const [scope, setScope] = useState<(typeof SCOPES)[number]['key']>('all');
  const [search, setSearch] = useState('');
  const [applied, setApplied] = useState('');

  const list = useAsync(
    () => api.listCustomers({ scope, search: applied || undefined, limit: 100 }),
    [scope, applied],
  );

  const totals = list.data?.totals;

  return (
    <View style={{ flex: 1 }}>
      <Header title="Customers" subtitle="Receivables · live from ERPNext" />

      <ScreenScroll
        refreshControl={<RefreshControl refreshing={list.loading} onRefresh={list.reload} />}
      >
        <View style={s.search}>
          <TextInput
            value={search}
            onChangeText={setSearch}
            onSubmitEditing={() => setApplied(search.trim())}
            returnKeyType="search"
            placeholder="Search customer, TRN or code"
            placeholderTextColor={colors.placeholder}
            autoCapitalize="none"
            style={s.searchInput}
          />
        </View>

        {!!totals && (
          <MoneyPanel style={{ padding: space.lg - 1 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.md }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.panelLabel}>Total receivable</Text>
                <Mono size={26} color="#fff" style={{ marginTop: 5 }}>
                  {money(totals.outstanding, 0)}
                </Mono>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Mono size={17} color="#FDA29B">
                  {money(totals.overdue, 0)}
                </Mono>
                <Text style={s.panelHint}>overdue</Text>
              </View>
            </View>

            <View style={{ marginTop: space.md + 2 }}>
              <Bar
                segments={(Object.keys(BUCKET_COLOR) as AgeingBucket[]).map((bucket) => ({
                  value: totals.ageing[bucket] ?? 0,
                  color: BUCKET_COLOR[bucket],
                }))}
              />
            </View>

            <Row style={{ marginTop: space.sm + 2 }}>
              {(Object.keys(BUCKET_COLOR) as AgeingBucket[]).map((bucket) => (
                <View key={bucket} style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <View style={[s.dot, { backgroundColor: BUCKET_COLOR[bucket] }]} />
                    <Text style={s.bucketLabel}>{bucket}</Text>
                  </View>
                  <Mono size={12.5} color="#fff" weight="500" style={{ marginTop: 3 }}>
                    {money(totals.ageing[bucket] ?? 0, 0)}
                  </Mono>
                </View>
              ))}
            </Row>
          </MoneyPanel>
        )}

        <Row gap={7}>
          {SCOPES.map((option) => {
            const active = scope === option.key;
            return (
              <Pressable
                key={option.key}
                onPress={() => setScope(option.key)}
                style={[
                  s.chip,
                  {
                    backgroundColor: active ? colors.text : colors.card,
                    borderColor: active ? colors.text : colors.border,
                  },
                ]}
              >
                <Text style={[s.chipText, { color: active ? '#fff' : '#3B4658' }]}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </Row>

        {list.loading && !list.data ? (
          <Loading />
        ) : list.error ? (
          <Banner
            tone="danger"
            title={list.offline ? 'No connection' : 'Could not load customers'}
            body={list.error}
          />
        ) : !list.data?.customers.length ? (
          <Empty text="No customers match this filter." />
        ) : (
          list.data.customers.map((customer) => {
            const paid = Math.max(0, customer.outstanding - customer.overdue);
            return (
              <Pressable
                key={customer.name}
                onPress={() =>
                  router.push(`/(app)/customer/${encodeURIComponent(customer.name)}`)
                }
              >
                <Card>
                  <View style={{ flexDirection: 'row', gap: space.md }}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={s.name} numberOfLines={1}>
                        {customer.customer_name}
                      </Text>
                      <Mono size={11.5} color={colors.faint} weight="500" style={{ marginTop: 3 }}>
                        {customer.name}
                        {customer.payment_terms ? ` · ${customer.payment_terms}` : ''}
                      </Mono>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Mono
                        size={16}
                        color={
                          customer.outstanding <= 0
                            ? colors.success
                            : customer.overdue > 0
                              ? '#B42318'
                              : colors.text
                        }
                      >
                        {money(customer.outstanding)}
                      </Mono>
                      <Text style={s.due}>due</Text>
                    </View>
                  </View>

                  {customer.outstanding > 0 && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: 11 }}>
                      <View style={{ flex: 1 }}>
                        <Bar
                          height={6}
                          segments={[
                            { value: paid, color: colors.success },
                            { value: customer.overdue, color: '#F97066' },
                          ]}
                        />
                      </View>
                      <Text
                        style={[
                          s.state,
                          { color: customer.overdue > 0 ? '#B42318' : colors.faint },
                        ]}
                      >
                        {customer.overdue > 0 ? `${customer.overdue_invoices} overdue` : 'Current'}
                      </Text>
                    </View>
                  )}

                  {customer.credit_limit > 0 && (
                    <Text style={s.limit}>
                      Limit {money(customer.credit_limit, 0)} · headroom{' '}
                      {money(customer.credit_headroom ?? 0, 0)}
                    </Text>
                  )}
                </Card>
              </Pressable>
            );
          })
        )}
      </ScreenScroll>
    </View>
  );
}

const s = StyleSheet.create({
  search: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 13,
    height: 46,
    justifyContent: 'center',
  },
  searchInput: { fontSize: 14.5, color: colors.text },
  panelLabel: {
    fontSize: 11,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.5)',
    fontWeight: '700',
  },
  panelHint: { fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 2 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  bucketLabel: { fontSize: 10, color: 'rgba(255,255,255,0.5)', letterSpacing: 0.4 },
  chip: {
    flex: 1,
    height: 38,
    borderRadius: radius.sm + 1,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: { fontSize: 12.5, fontWeight: '700' },
  name: { fontSize: 14.5, fontWeight: '600', color: colors.text },
  due: { fontSize: 10.5, color: colors.faint, marginTop: 2 },
  state: { fontSize: 11, fontWeight: '700' },
  limit: { fontSize: 11, color: colors.faint, marginTop: 8 },
});
