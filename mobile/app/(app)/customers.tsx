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

        {/* One card instead of two blocks: the headline figure, a slim
            ageing bar, and the filters as segments of the same control.
            The old version repeated the same numbers twice and put the
            filters in a separate row that read as unrelated. */}
        {!!totals && (
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <View style={{ padding: space.lg - 2 }}>
              <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.cardLabel}>Total receivable</Text>
                  <Mono size={28} style={{ marginTop: 4, letterSpacing: -0.8 }}>
                    {money(totals.outstanding)}
                  </Mono>
                </View>
                {totals.overdue > 0 && (
                  <View style={s.overduePill}>
                    <Text style={s.overduePillText}>{money(totals.overdue, 0)} overdue</Text>
                  </View>
                )}
              </Row>

              {totals.outstanding > 0 && (
                <View style={{ marginTop: space.md }}>
                  <Bar
                    height={6}
                    segments={(Object.keys(BUCKET_COLOR) as AgeingBucket[]).map((bucket) => ({
                      value: totals.ageing[bucket] ?? 0,
                      color: BUCKET_COLOR[bucket],
                    }))}
                  />
                  {/* Only buckets that actually hold money get a label, so a
                      healthy book is not four zeroes competing for attention. */}
                  <Row style={{ marginTop: space.sm, flexWrap: 'wrap' }} gap={space.md}>
                    {(Object.keys(BUCKET_COLOR) as AgeingBucket[])
                      .filter((bucket) => (totals.ageing[bucket] ?? 0) > 0)
                      .map((bucket) => (
                        <View key={bucket} style={s.legend}>
                          <View style={[s.dot, { backgroundColor: BUCKET_COLOR[bucket] }]} />
                          <Text style={s.legendText}>
                            {bucket === 'current' ? 'Current' : `${bucket} days`}
                          </Text>
                          <Mono size={11.5} color={colors.muted} weight="600">
                            {money(totals.ageing[bucket] ?? 0, 0)}
                          </Mono>
                        </View>
                      ))}
                  </Row>
                </View>
              )}
            </View>

            <View style={s.segments}>
              {SCOPES.map((option) => {
                const active = scope === option.key;
                const count =
                  option.key === 'all'
                    ? list.data?.total
                    : list.data?.customers.filter((c) =>
                        option.key === 'overdue' ? c.overdue > 0 : c.outstanding > 0,
                      ).length;
                return (
                  <Pressable
                    key={option.key}
                    onPress={() => setScope(option.key)}
                    style={[s.segment, active && s.segmentActive]}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: active }}
                  >
                    <Text style={[s.segmentText, active && s.segmentTextActive]}>
                      {option.label}
                    </Text>
                    {count !== undefined && (
                      <View style={[s.badge, active && s.badgeActive]}>
                        <Text style={[s.badgeText, active && s.badgeTextActive]}>{count}</Text>
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>
          </Card>
        )}

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
  cardLabel: {
    fontSize: 11,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    color: colors.faint,
    fontWeight: '700',
  },
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
  segments: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
  },
  segmentActive: { backgroundColor: colors.card },
  segmentText: { fontSize: 12.5, fontWeight: '600', color: colors.muted },
  segmentTextActive: { color: colors.primary, fontWeight: '700' },
  badge: {
    minWidth: 20,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: radius.pill,
    backgroundColor: colors.subtle,
    alignItems: 'center',
  },
  badgeActive: { backgroundColor: colors.primaryWash },
  badgeText: { fontSize: 10.5, fontWeight: '700', color: colors.muted },
  badgeTextActive: { color: colors.primaryDark },
  name: { fontSize: 14.5, fontWeight: '600', color: colors.text },
  due: { fontSize: 10.5, color: colors.faint, marginTop: 2 },
  state: { fontSize: 11, fontWeight: '700' },
  limit: { fontSize: 11, color: colors.faint, marginTop: 8 },
});
