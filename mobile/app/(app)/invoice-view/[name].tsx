/**
 * Viewing a posted invoice.
 *
 * Reachable from anywhere an invoice number appears -- a customer's
 * statement, their recent activity, or straight after a sale. Before this
 * existed the number was printed on screen but could not be opened, which
 * is the sort of dead end that makes a rep phone the office.
 *
 * Printing is offered here, never required. It is a secondary action and
 * its absence must not stop anyone reading, sharing or acting on the
 * invoice.
 */

import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { RefreshControl, Share, StyleSheet, Text, View } from 'react-native';

import { useApi } from '../../../src/auth/AuthContext';
import { useAsync } from '../../../src/state/useAsync';
import { Header } from '../../../src/ui/Chrome';
import { money, qty as fmtQty, shortDate } from '../../../src/ui/format';
import {
  Banner,
  Button,
  Card,
  Loading,
  Mono,
  MoneyPanel,
  Pill,
  Row,
  ScreenScroll,
  SectionLabel,
} from '../../../src/ui/kit';
import { colors, radius, space } from '../../../src/ui/theme';

function toneFor(status: string): 'success' | 'warning' | 'danger' | 'neutral' {
  const s = (status || '').toLowerCase();
  if (s.includes('paid') && !s.includes('unpaid')) return 'success';
  if (s.includes('overdue')) return 'danger';
  if (s.includes('unpaid') || s.includes('partly')) return 'warning';
  return 'neutral';
}

export default function InvoiceView() {
  const { name } = useLocalSearchParams<{ name: string }>();
  const invoiceName = decodeURIComponent(String(name ?? ''));
  const router = useRouter();
  const api = useApi();

  const doc = useAsync(() => api.invoiceForPrint(invoiceName), [invoiceName]);
  const d = doc.data;

  async function share() {
    if (!d) return;
    const lines = d.items
      .map((i) => `${i.item_name}  ${fmtQty(i.qty)} x ${money(i.rate)}  ${money(i.amount)}`)
      .join('\n');
    await Share.share({
      message:
        `${d.company.company_name}\n${d.name} · ${shortDate(d.posting_date, true)}\n` +
        `${d.customer_name}\n\n${lines}\n\n` +
        `Total ${d.currency} ${money(d.rounded_total)}\n` +
        `Outstanding ${money(d.outstanding_amount)}`,
    }).catch(() => {});
  }

  return (
    <View style={{ flex: 1 }}>
      <Header
        title={invoiceName}
        subtitle={d?.customer_name}
        onBack={() => router.back()}
      />

      <ScreenScroll
        refreshControl={<RefreshControl refreshing={doc.loading} onRefresh={doc.reload} />}
      >
        {doc.loading && !d ? (
          <Loading />
        ) : doc.error ? (
          <Banner
            tone="danger"
            title={doc.offline ? 'No connection' : 'Could not load this invoice'}
            body={doc.error}
          />
        ) : d ? (
          <>
            <MoneyPanel>
              <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.panelLabel}>
                    {d.is_return ? 'Credit note' : 'Tax invoice'}
                  </Text>
                  <Mono size={15} color="#fff" style={{ marginTop: 4 }}>
                    {d.name}
                  </Mono>
                  <Text style={s.panelSub}>
                    {shortDate(d.posting_date, true)}
                    {d.due_date ? ` · due ${shortDate(d.due_date, true)}` : ''}
                  </Text>
                </View>
                <Pill label={d.status || '—'} tone={toneFor(d.status)} />
              </Row>

              <Row style={{ marginTop: space.lg, justifyContent: 'space-between' }}>
                <View>
                  <Text style={s.panelLabel}>Total</Text>
                  <Mono size={24} color="#fff" style={{ marginTop: 3 }}>
                    {money(d.rounded_total)}
                  </Mono>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={s.panelLabel}>Outstanding</Text>
                  <Mono
                    size={24}
                    color={d.outstanding_amount > 0 ? '#FDA29B' : '#6BD9A6'}
                    style={{ marginTop: 3 }}
                  >
                    {money(d.outstanding_amount)}
                  </Mono>
                </View>
              </Row>
            </MoneyPanel>

            <SectionLabel>Lines</SectionLabel>
            <Card>
              {d.items.map((item, i) => (
                <View
                  key={i}
                  style={[s.line, i < d.items.length - 1 && s.lineDivider]}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={s.itemName}>{item.item_name}</Text>
                    <Mono size={11.5} color={colors.faint} weight="500" style={{ marginTop: 2 }}>
                      {item.item_code} · {fmtQty(item.qty)} {item.uom} @ {money(item.rate)}
                    </Mono>
                  </View>
                  <Mono size={15}>{money(item.amount)}</Mono>
                </View>
              ))}
            </Card>

            <Card>
              <Row style={{ justifyContent: 'space-between' }}>
                <Text style={s.totalLabel}>Net total</Text>
                <Mono size={13} color={colors.muted} weight="500">
                  {money(d.net_total)}
                </Mono>
              </Row>
              {d.taxes.map((tax, i) => (
                <Row key={i} style={{ justifyContent: 'space-between', marginTop: 5 }}>
                  <Text style={s.totalLabel}>{tax.description}</Text>
                  <Mono size={13} color={colors.muted} weight="500">
                    {money(tax.amount)}
                  </Mono>
                </Row>
              ))}
              <Row style={s.grand}>
                <Text style={s.grandLabel}>Total {d.currency}</Text>
                <Mono size={20}>{money(d.rounded_total)}</Mono>
              </Row>
            </Card>

            {d.payments.length > 0 && (
              <>
                <SectionLabel>Payment</SectionLabel>
                <Card>
                  {d.payments.map((p, i) => (
                    <Row
                      key={i}
                      style={{ justifyContent: 'space-between', paddingVertical: 6 }}
                    >
                      <Text style={s.totalLabel}>
                        {p.mode_of_payment}
                        {p.reference_no ? ` · ${p.reference_no}` : ''}
                      </Text>
                      <Mono size={14}>{money(p.amount)}</Mono>
                    </Row>
                  ))}
                  {d.change_amount > 0 && (
                    <Row style={{ justifyContent: 'space-between', paddingVertical: 6 }}>
                      <Text style={s.totalLabel}>Change given</Text>
                      <Mono size={14} color={colors.success}>
                        {money(d.change_amount)}
                      </Mono>
                    </Row>
                  )}
                </Card>
              </>
            )}

            {/* A credit note only makes sense against a submitted sale, and
                never against another credit note. */}
            {d.docstatus === 1 && !d.is_return && (
              <Button
                label="Create credit note"
                tone="danger"
                onPress={() =>
                  router.push(
                    `/(app)/credit-note/${encodeURIComponent(d.name)}` as never,
                  )
                }
              />
            )}

            <Row>
              <Button label="Share" tone="ghost" compact onPress={share} style={{ flex: 1 }} />
              <Button
                label="Print"
                tone="ghost"
                compact
                disabled
                style={{ flex: 1 }}
              />
            </Row>
            <View style={s.note}>
              <Ionicons name="information-circle-outline" size={15} color={colors.faint} />
              <Text style={s.noteText}>
                Printing needs a paired thermal printer, which is not built yet. Share sends the
                same details as text in the meantime.
              </Text>
            </View>
          </>
        ) : null}
      </ScreenScroll>
    </View>
  );
}

const s = StyleSheet.create({
  panelLabel: {
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.5)',
    fontWeight: '700',
  },
  panelSub: { fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 3 },
  line: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 9 },
  lineDivider: { borderBottomWidth: 1, borderBottomColor: colors.subtle },
  itemName: { fontSize: 14.5, fontWeight: '600', color: colors.text, lineHeight: 19 },
  totalLabel: { fontSize: 13, color: colors.muted },
  grand: {
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: 9,
    paddingTop: 9,
    borderTopWidth: 1,
    borderTopColor: colors.subtle,
  },
  grandLabel: { fontSize: 15, fontWeight: '600', color: colors.text },
  note: { flexDirection: 'row', gap: 7, paddingHorizontal: 2 },
  noteText: { flex: 1, fontSize: 11.5, color: colors.faint, lineHeight: 16 },
});
