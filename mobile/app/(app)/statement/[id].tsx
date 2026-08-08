/**
 * Statement of account.
 *
 * Invoice-level rather than a single balance: each invoice shows what was
 * paid against it and what remains, so a part-payment or a credit note is
 * visible instead of being netted into one number the customer disputes.
 */

import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { useApi } from '../../../src/auth/AuthContext';
import { useAsync } from '../../../src/state/useAsync';
import { Header } from '../../../src/ui/Chrome';
import { money, shortDate } from '../../../src/ui/format';
import {
  Banner,
  Card,
  Empty,
  Loading,
  Mono,
  Row,
  ScreenScroll,
  SectionLabel,
} from '../../../src/ui/kit';
import { colors, radius, space } from '../../../src/ui/theme';

const STATE_TONE: Record<string, string> = {
  OVERDUE: colors.danger,
  PARTIAL: colors.warning,
  RECEIPT: colors.success,
  'DRAFT RECEIPT': colors.primary,
  CREDIT: colors.success,
  PAID: colors.success,
};

export default function StatementScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const customerId = decodeURIComponent(String(id ?? ''));
  const router = useRouter();
  const api = useApi();

  const statement = useAsync(() => api.statement(customerId), [customerId]);
  const d = statement.data;

  return (
    <View style={{ flex: 1 }}>
      <Header title="Statement" subtitle={customerId} onBack={() => router.back()} />

      <ScreenScroll
        refreshControl={
          <RefreshControl refreshing={statement.loading} onRefresh={statement.reload} />
        }
      >
        {statement.loading && !d ? (
          <Loading />
        ) : statement.error ? (
          <Banner
            tone="danger"
            title={statement.offline ? 'No connection' : 'Could not load the statement'}
            body={statement.error}
          />
        ) : d ? (
          <>
            <Card>
              <Row>
                <Total label="Billed" value={money(d.billed)} bg={colors.bg} fg={colors.text} />
                <Total
                  label="Paid"
                  value={money(d.paid)}
                  bg={colors.successWash}
                  fg="#067647"
                />
                <Total
                  label="Due"
                  value={money(d.outstanding)}
                  bg={colors.dangerWash}
                  fg="#B42318"
                />
              </Row>
            </Card>

            <SectionLabel>Last 12 months</SectionLabel>

            {!d.lines.length ? (
              <Empty text="No activity on this account." />
            ) : (
              d.lines.map((line) => {
                const openable = line.doctype === 'Sales Invoice';
                const card = (
                <Card
                  key={`${line.doctype}-${line.name}`}
                  style={[
                    s.line,
                    { borderLeftWidth: 3, borderLeftColor: STATE_TONE[line.state] ?? colors.placeholder },
                  ]}
                >
                  <View style={{ flexDirection: 'row', gap: space.sm + 2 }}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Mono size={13}>{line.name}</Mono>
                      <Text style={s.meta}>
                        {shortDate(line.date, true)}
                        {line.due_date ? ` · due ${shortDate(line.due_date)}` : ''}
                        {line.reference_no ? ` · ${line.reference_no}` : ''}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Mono size={15} color={line.amount < 0 ? '#067647' : colors.text}>
                        {money(line.amount)}
                      </Mono>
                      <Text
                        style={[
                          s.state,
                          { color: STATE_TONE[line.state] ?? colors.placeholder },
                        ]}
                      >
                        {line.state}
                      </Text>
                    </View>
                  </View>

                  {line.partial && (
                    <View style={s.partial}>
                      <Mono size={11.5} color="#067647" weight="500">
                        Paid {money(line.paid)}
                      </Mono>
                      <Mono size={11.5} color="#B42318" weight="500">
                        Balance {money(line.balance)}
                      </Mono>
                    </View>
                  )}
                </Card>
                );
                // Only invoices have a screen to open; a payment entry row
                // stays flat rather than pretending to be tappable.
                return openable ? (
                  <Pressable
                    key={`${line.doctype}-${line.name}`}
                    onPress={() =>
                      router.push(
                        `/(app)/invoice-view/${encodeURIComponent(line.name)}` as never,
                      )
                    }
                  >
                    {card}
                  </Pressable>
                ) : (
                  card
                );
              })
            )}
          </>
        ) : null}
      </ScreenScroll>
    </View>
  );
}

function Total({
  label,
  value,
  bg,
  fg,
}: {
  label: string;
  value: string;
  bg: string;
  fg: string;
}) {
  return (
    <View style={[s.total, { backgroundColor: bg }]}>
      <Text style={[s.totalLabel, { color: fg }]}>{label}</Text>
      <Mono size={16} color={fg} style={{ marginTop: 4 }}>
        {value}
      </Mono>
    </View>
  );
}

const s = StyleSheet.create({
  total: { flex: 1, borderRadius: radius.md, padding: 11 },
  totalLabel: {
    fontSize: 10.5,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    fontWeight: '700',
  },
  line: { padding: space.md },
  meta: { fontSize: 11.5, color: colors.faint, marginTop: 3 },
  state: { fontSize: 10.5, fontWeight: '700', marginTop: 2 },
  partial: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 9,
    paddingTop: 9,
    borderTopWidth: 1,
    borderTopColor: colors.subtle,
  },
});
