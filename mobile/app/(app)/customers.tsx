/**
 * Customers.
 *
 * Two ways in, because reps arrive here with two different intentions. If
 * they know who they want, the Customer field opens a searchable picker and
 * goes straight there -- the same move as a Link field on the desk. If they
 * are working through the round, the list below filters by ERPNext's own
 * invoice statuses, so "Overdue" here means exactly what it means on the
 * desk rather than something this app decided for itself.
 *
 * The total receivable used to sit at the top of this screen. It lives on
 * the route screen now: what the round is owed is something to meet on
 * opening the app, not to go looking for.
 */

import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { CustomerRow } from '../../src/api/types';
import { useApi } from '../../src/auth/AuthContext';
import { useAsync } from '../../src/state/useAsync';
import { Header } from '../../src/ui/Chrome';
import { LinkField } from '../../src/ui/LinkField';
import { Picker } from '../../src/ui/Picker';
import { money } from '../../src/ui/format';
import { Bar, Banner, Card, Empty, Loading, Mono, ScreenScroll } from '../../src/ui/kit';
import { colors, radius, space } from '../../src/ui/theme';

/** Mirrors ERPNext's Sales Invoice status vocabulary. */
const SCOPES = [
  { key: 'all', label: 'All' },
  { key: 'paid', label: 'Paid' },
  { key: 'unpaid', label: 'Unpaid' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'credit_note', label: 'Credit Note' },
  { key: 'return', label: 'Return' },
] as const;

type Scope = (typeof SCOPES)[number]['key'];

export default function Customers() {
  const router = useRouter();
  const api = useApi();
  const params = useLocalSearchParams<{ scope?: string }>();

  const [scope, setScope] = useState<Scope>('all');
  const [picking, setPicking] = useState(false);

  // The route screen links here with a scope already in mind.
  useEffect(() => {
    const wanted = SCOPES.find((x) => x.key === params.scope)?.key;
    if (wanted) setScope(wanted);
  }, [params.scope]);

  const list = useAsync(() => api.listCustomers({ scope, limit: 100 }), [scope]);

  return (
    <View style={{ flex: 1 }}>
      <Header title="Customers" subtitle="Receivables · live from ERPNext" />

      <ScreenScroll
        refreshControl={<RefreshControl refreshing={list.loading} onRefresh={list.reload} />}
      >
        <Card>
          <LinkField
            label="Customer"
            placeholder="Search and open a customer"
            onPress={() => setPicking(true)}
          />
        </Card>

        {/* Six statuses do not fit across a phone, so the row scrolls
            rather than squeezing each one into an unreadable stub. */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 7, paddingRight: space.lg }}
        >
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
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
              >
                <Text style={[s.chipText, { color: active ? '#fff' : '#3B4658' }]}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {list.loading && !list.data ? (
          <Loading />
        ) : list.error ? (
          <Banner
            tone="danger"
            title={list.offline ? 'No connection' : 'Could not load customers'}
            body={list.error}
          />
        ) : !list.data?.customers.length ? (
          <Empty
            text={
              scope === 'all'
                ? 'No customers found.'
                : `No customer has an invoice marked ${
                    SCOPES.find((x) => x.key === scope)?.label
                  }.`
            }
          />
        ) : (
          <>
            <Text style={s.count}>
              {list.data.total} customer{list.data.total === 1 ? '' : 's'}
            </Text>
            {list.data.customers.map((customer) => (
              <CustomerCard
                key={customer.name}
                customer={customer}
                onPress={() =>
                  router.push(`/(app)/customer/${encodeURIComponent(customer.name)}`)
                }
              />
            ))}
          </>
        )}
      </ScreenScroll>

      <Picker<CustomerRow>
        visible={picking}
        title="Select customer"
        placeholder="Name, code or TRN"
        onClose={() => setPicking(false)}
        fetch={async (q) =>
          (await api.listCustomers({ search: q || undefined, limit: 40 })).customers
        }
        keyFor={(c) => c.name}
        emptyText="No customer matches that search."
        onSelect={(c) => {
          setPicking(false);
          router.push(`/(app)/customer/${encodeURIComponent(c.name)}`);
        }}
        renderRow={(c) => (
          <View style={{ flexDirection: 'row', gap: space.md }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.name} numberOfLines={1}>
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
              <Text style={s.due}>due</Text>
            </View>
          </View>
        )}
      />
    </View>
  );
}

function CustomerCard({ customer, onPress }: { customer: CustomerRow; onPress: () => void }) {
  const settled = Math.max(0, customer.outstanding - customer.overdue);

  return (
    <Pressable onPress={onPress}>
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
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.sm,
              marginTop: 11,
            }}
          >
            <View style={{ flex: 1 }}>
              <Bar
                height={6}
                segments={[
                  { value: settled, color: colors.success },
                  { value: customer.overdue, color: '#F97066' },
                ]}
              />
            </View>
            <Text style={[s.state, { color: customer.overdue > 0 ? '#B42318' : colors.faint }]}>
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
}

const s = StyleSheet.create({
  chip: {
    height: 38,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: { fontSize: 13, fontWeight: '700' },
  count: {
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.faint,
    fontWeight: '700',
  },
  name: { fontSize: 14.5, fontWeight: '600', color: colors.text },
  due: { fontSize: 10.5, color: colors.faint, marginTop: 2 },
  state: { fontSize: 11, fontWeight: '700' },
  limit: { fontSize: 11, color: colors.faint, marginTop: 8 },
});
