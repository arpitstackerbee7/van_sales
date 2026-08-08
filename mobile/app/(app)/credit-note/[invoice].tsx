/**
 * Raising a credit note.
 *
 * Two shapes, one screen. Against an invoice, the lines come from that
 * invoice and quantities are capped at what was sold -- referencing the
 * parent is what ties the credit to a price the customer actually paid and
 * lets ERPNext settle the original. Standalone, the rep picks the customer
 * and the items themselves, for the cases a reference cannot cover: goods
 * sold before the system went live, a negotiated allowance, or a return
 * whose invoice cannot be found at the door.
 *
 * The reason on each line decides where the goods land: good stock returns
 * to the van and can be sold again, damaged or expired does not. Getting
 * that wrong quietly puts spoiled foodstuff back into saleable inventory,
 * so it is asked per line rather than once for the document.
 */

import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ApiError } from '../../../src/api/client';
import type { CatalogItem, CustomerRow } from '../../../src/api/types';
import { useApi, useAuth } from '../../../src/auth/AuthContext';
import { captureGeo, capturedAt, newClientUid } from '../../../src/state/posting';
import { useAsync } from '../../../src/state/useAsync';
import { Header } from '../../../src/ui/Chrome';
import { LinkField } from '../../../src/ui/LinkField';
import { Picker } from '../../../src/ui/Picker';
import { money, qty as fmtQty, shortDate } from '../../../src/ui/format';
import {
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

const REASONS = [
  { key: 'good', label: 'Good stock', hint: 'Returns to the van and can be sold again' },
  { key: 'damaged', label: 'Damaged', hint: 'Does not go back into saleable stock' },
  { key: 'expired', label: 'Expired', hint: 'Does not go back into saleable stock' },
] as const;

type Reason = (typeof REASONS)[number]['key'];

interface Line {
  item_code: string;
  item_name: string;
  uom: string;
  rate: number;
  /** How many were sold. Absent on a standalone credit, which has no cap. */
  sold?: number;
}

export default function CreditNote() {
  const { invoice } = useLocalSearchParams<{ invoice: string }>();
  const raw = decodeURIComponent(String(invoice ?? ''));
  const standalone = raw === 'new' || !raw;
  const against = standalone ? '' : raw;

  const router = useRouter();
  const api = useApi();
  const { bootstrap, van } = useAuth();

  const doc = useAsync(
    async () => (standalone ? null : api.invoiceForPrint(against)),
    [against, standalone],
  );
  const d = doc.data;

  const [customer, setCustomer] = useState<CustomerRow | null>(null);
  const [picked, setPicked] = useState<CatalogItem[]>([]);
  const [picking, setPicking] = useState<null | 'customer' | 'item'>(null);
  const [qtys, setQtys] = useState<Record<string, number>>({});
  const [reasons, setReasons] = useState<Record<string, Reason>>({});
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fixed for the life of the screen so a retry cannot credit twice.
  const clientUid = useMemo(() => newClientUid(), []);

  const source: Line[] = standalone
    ? picked.map((i) => ({
        item_code: i.item_code,
        item_name: i.item_name,
        uom: i.uom,
        rate: i.rate,
      }))
    : (d?.items ?? []).map((i) => ({
        item_code: i.item_code,
        item_name: i.item_name,
        uom: i.uom,
        rate: i.rate,
        sold: i.qty,
      }));

  const lines = source.map((item) => ({
    ...item,
    returning: qtys[item.item_code] ?? 0,
    reason: reasons[item.item_code] ?? ('good' as Reason),
  }));

  const creditTotal = lines.reduce((sum, l) => sum + l.returning * l.rate, 0);
  const anything = lines.some((l) => l.returning > 0);
  const ready = anything && (!standalone || !!customer);

  function setQty(code: string, next: number, cap?: number) {
    setQtys((prev) => ({
      ...prev,
      [code]: Math.max(0, cap === undefined ? next : Math.min(cap, next)),
    }));
  }

  async function post() {
    if (!ready) return;
    setPosting(true);
    setError(null);

    try {
      const geo = await captureGeo(!!bootstrap?.policy.capture_gps);
      const result = await api.createReturn({
        client_uid: clientUid,
        return_against: standalone ? undefined : against,
        customer: standalone ? customer?.name : undefined,
        profile: standalone ? van?.profile : undefined,
        items: lines
          .filter((l) => l.returning > 0)
          .map((l) => ({ item_code: l.item_code, qty: l.returning, reason: l.reason })),
        submit: 1,
        geo,
        captured_at: capturedAt(),
      });

      router.replace(`/(app)/invoice-view/${encodeURIComponent(result.name)}` as never);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not raise the credit note.');
    } finally {
      setPosting(false);
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <Header
        title="Credit note"
        subtitle={standalone ? 'No invoice reference' : `Against ${against}`}
        onBack={() => router.back()}
      />

      <ScreenScroll>
        {!standalone && doc.loading && !d ? (
          <Loading />
        ) : !standalone && doc.error ? (
          <Banner
            tone="danger"
            title={doc.offline ? 'No connection' : 'Could not load the invoice'}
            body={doc.error}
          />
        ) : (
          <>
            {standalone ? (
              <>
                <Card>
                  <LinkField
                    label="Customer"
                    required
                    value={customer?.customer_name}
                    description={customer ? customer.name : undefined}
                    placeholder="Select a customer"
                    onPress={() => setPicking('customer')}
                    onClear={() => setCustomer(null)}
                  />
                </Card>
                <Banner
                  tone="info"
                  title="No invoice behind this credit"
                  body="It posts as an open credit on the customer's account. Where an invoice exists, raise the credit from that invoice instead so ERPNext can settle it."
                />
              </>
            ) : d ? (
              <Card>
                <Text style={s.title}>{d.customer_name}</Text>
                <Mono size={12} color={colors.faint} weight="500" style={{ marginTop: 3 }}>
                  {d.name} · {shortDate(d.posting_date, true)} · {money(d.rounded_total)}
                </Mono>
              </Card>
            ) : null}

            <SectionLabel>What is coming back</SectionLabel>

            {lines.length === 0 ? (
              <Empty text="Add the items being credited." />
            ) : (
              lines.map((line) => (
                <Card key={line.item_code}>
                  <Row style={{ alignItems: 'flex-start' }}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={s.name}>{line.item_name}</Text>
                      <Mono size={11.5} color={colors.faint} weight="500" style={{ marginTop: 3 }}>
                        {line.sold !== undefined
                          ? `Sold ${fmtQty(line.sold)} ${line.uom} @ ${money(line.rate)}`
                          : `${line.uom} @ ${money(line.rate)}`}
                      </Mono>
                    </View>
                    <Mono size={15} color={line.returning > 0 ? colors.text : colors.placeholder}>
                      {money(line.returning * line.rate)}
                    </Mono>
                  </Row>

                  <View style={s.qtyRow}>
                    <View style={s.stepper}>
                      <Pressable
                        onPress={() => setQty(line.item_code, line.returning - 1, line.sold)}
                        style={s.step}
                        accessibilityLabel="Credit one fewer"
                      >
                        <Ionicons name="remove" size={20} color={colors.text} />
                      </Pressable>
                      <View style={s.qtyBox}>
                        <Mono size={16}>{fmtQty(line.returning)}</Mono>
                      </View>
                      <Pressable
                        onPress={() => setQty(line.item_code, line.returning + 1, line.sold)}
                        style={s.step}
                        accessibilityLabel="Credit one more"
                      >
                        <Ionicons name="add" size={20} color={colors.text} />
                      </Pressable>
                    </View>

                    {line.sold !== undefined ? (
                      <Pressable
                        onPress={() => setQty(line.item_code, line.sold!, line.sold)}
                        hitSlop={8}
                      >
                        <Text style={s.all}>Return all</Text>
                      </Pressable>
                    ) : (
                      <Pressable
                        onPress={() => {
                          setPicked((prev) =>
                            prev.filter((i) => i.item_code !== line.item_code),
                          );
                          setQtys((prev) => {
                            const next = { ...prev };
                            delete next[line.item_code];
                            return next;
                          });
                        }}
                        hitSlop={8}
                      >
                        <Text style={[s.all, { color: colors.danger }]}>Remove</Text>
                      </Pressable>
                    )}
                  </View>

                  {line.returning > 0 && (
                    <View style={{ marginTop: space.md }}>
                      <Text style={s.reasonLabel}>Reason</Text>
                      <Row gap={6} style={{ marginTop: 6 }}>
                        {REASONS.map((r) => {
                          const active = line.reason === r.key;
                          return (
                            <Pressable
                              key={r.key}
                              onPress={() =>
                                setReasons((prev) => ({ ...prev, [line.item_code]: r.key }))
                              }
                              style={[
                                s.reason,
                                {
                                  backgroundColor: active ? colors.ink : colors.bg,
                                  borderColor: active ? colors.ink : colors.border,
                                },
                              ]}
                            >
                              <Text style={[s.reasonText, { color: active ? '#fff' : '#3B4658' }]}>
                                {r.label}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </Row>
                      <Text style={s.reasonHint}>
                        {REASONS.find((r) => r.key === line.reason)?.hint}
                      </Text>
                    </View>
                  )}
                </Card>
              ))
            )}

            {standalone && (
              <Button
                label="Add item"
                tone="dark"
                compact
                onPress={() => setPicking('item')}
              />
            )}

            {!!error && <Banner tone="danger" title="Not posted" body={error} />}
          </>
        )}
      </ScreenScroll>

      {anything && (
        <View style={s.footer}>
          <Row style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
            <Text style={s.totalLabel}>Credit total</Text>
            <Mono size={22}>{money(creditTotal)}</Mono>
          </Row>
          <Text style={s.footNote}>
            {standalone && !customer
              ? 'Select a customer to continue.'
              : 'Tax is recalculated by the server when the credit note posts.'}
          </Text>
          <Button
            label="Raise credit note"
            tone="danger"
            loading={posting}
            disabled={posting || !ready}
            onPress={post}
            style={{ marginTop: space.md }}
          />
        </View>
      )}

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
        onSelect={(c) => {
          setCustomer(c);
          setPicking(null);
        }}
        renderRow={(c) => (
          <View>
            <Text style={s.pickName}>{c.customer_name}</Text>
            <Mono size={11.5} color={colors.faint} weight="500" style={{ marginTop: 2 }}>
              {c.name}
            </Mono>
          </View>
        )}
      />

      <Picker<CatalogItem>
        visible={picking === 'item'}
        title="Add item to credit"
        placeholder="Item name or code"
        onClose={() => setPicking(null)}
        emptyText="No sales item matches that search."
        fetch={async (q) =>
          (
            await api.searchItems({
              query: q || undefined,
              warehouse: van?.warehouse,
              customer: customer?.name,
              price_list: van?.price_list,
              company: van?.company,
              currency: van?.currency,
              limit: 40,
            })
          ).items
        }
        keyFor={(i) => i.item_code}
        onSelect={(item) => {
          setPicked((prev) =>
            prev.some((i) => i.item_code === item.item_code) ? prev : [...prev, item],
          );
          setQty(item.item_code, Math.max(1, qtys[item.item_code] ?? 0));
          setPicking(null);
        }}
        renderRow={(item) => (
          <Row style={{ alignItems: 'center' }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.pickName} numberOfLines={2}>
                {item.item_name}
              </Text>
              <Mono size={11.5} color={colors.faint} weight="500" style={{ marginTop: 2 }}>
                {item.item_code} · {item.uom}
              </Mono>
            </View>
            <Mono size={14}>{money(item.rate)}</Mono>
          </Row>
        )}
      />
    </View>
  );
}

const s = StyleSheet.create({
  title: { fontSize: 16.5, fontWeight: '600', color: colors.text },
  name: { fontSize: 14.5, fontWeight: '600', color: colors.text, lineHeight: 19 },
  pickName: { fontSize: 14.5, fontWeight: '600', color: colors.text },
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
  all: { color: colors.primary, fontSize: 13.5, fontWeight: '700' },
  reasonLabel: {
    fontSize: 11,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    color: colors.faint,
    fontWeight: '700',
  },
  reason: {
    flex: 1,
    height: 38,
    borderRadius: radius.sm + 1,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reasonText: { fontSize: 12, fontWeight: '700' },
  reasonHint: { fontSize: 11.5, color: colors.muted, marginTop: 7, lineHeight: 16 },
  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
    padding: space.md + 2,
    paddingBottom: space.lg,
  },
  totalLabel: { fontSize: 15, fontWeight: '600', color: colors.text },
  footNote: { fontSize: 11.5, color: colors.faint, marginTop: 4 },
});
