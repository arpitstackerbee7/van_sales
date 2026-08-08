/**
 * Settle the sale.
 *
 * One document. The payment goes on the invoice itself, so a cash sale is a
 * single post that either succeeds completely or leaves nothing behind --
 * there is no window where the customer has an invoice but no receipt, or a
 * receipt against an invoice that failed.
 *
 * The client UID is generated once when this screen opens, so a retry after
 * a timeout resolves to that same invoice rather than charging twice.
 */

import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ApiError } from '../../src/api/client';
import type { Quote } from '../../src/api/types';
import { useApi, useAuth } from '../../src/auth/AuthContext';
import { useCart } from '../../src/state/cart';
import { captureGeo, capturedAt, newClientUid } from '../../src/state/posting';
import { Header } from '../../src/ui/Chrome';
import { money } from '../../src/ui/format';
import {
  Banner,
  Button,
  Card,
  Loading,
  Mono,
  MoneyPanel,
  Row,
  ScreenScroll,
  SectionLabel,
} from '../../src/ui/kit';
import { colors, radius, space } from '../../src/ui/theme';

type Tender = 'cash' | 'cheque' | 'credit';

export default function Payment() {
  const router = useRouter();
  const api = useApi();
  const { van, bootstrap } = useAuth();
  const cart = useCart();
  const params = useLocalSearchParams<{ mode?: string }>();

  const [tender, setTender] = useState<Tender>('cash');
  const [tendered, setTendered] = useState('');
  const [chequeNo, setChequeNo] = useState('');
  const [valueDate, setValueDate] = useState('');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fixed for the life of this screen: a retry must reuse it, or the server
  // cannot tell the retry from a second sale.
  const invoiceUid = useRef(newClientUid());

  useEffect(() => {
    if (!cart.customer || !cart.lines.length) return;
    api
      .quote({
        customer: cart.customer.name,
        profile: van?.profile,
        items: cart.toPayloadItems(),
      })
      .then(setQuote)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not price the basket.'));
  }, [api, cart.customer, cart.lines, cart.toPayloadItems, van?.profile]);

  const total = quote?.grand_total ?? cart.subtotal;
  const tenderedValue = Number(tendered.replace(/,/g, '')) || 0;
  const change = Math.max(0, tenderedValue - total);

  const modeName = useMemo(() => {
    const modes = van?.payment_modes ?? [];
    if (tender === 'cash') {
      return modes.find((m) => /cash/i.test(m.mode_of_payment))?.mode_of_payment ?? 'Cash';
    }
    return modes.find((m) => /cheque|check/i.test(m.mode_of_payment))?.mode_of_payment ?? 'Cheque';
  }, [tender, van?.payment_modes]);

  const creditBlocked =
    tender === 'credit' && !!quote?.credit.over_limit && !!quote?.credit.blocks_credit_sale;

  async function post() {
    if (!cart.customer || !van) return;

    setBusy(true);
    setError(null);

    try {
      const geo = await captureGeo(!!bootstrap?.policy.capture_gps);
      const stamp = capturedAt();

      // Cash and cheque ride on the invoice itself, so the sale is one
      // document that comes back Paid. A credit sale carries no payment and
      // is simply left outstanding, which is the point of terms.
      //
      // Cash is sent as tendered, not capped at the total: ERPNext works out
      // the change from it, and the receipt should show what the customer
      // actually handed over.
      const payments =
        tender === 'credit'
          ? []
          : [
              {
                mode_of_payment: modeName,
                amount: tender === 'cash' ? tenderedValue || total : total,
                reference_no: tender === 'cheque' ? chequeNo || undefined : undefined,
                reference_date: tender === 'cheque' ? valueDate || undefined : undefined,
              },
            ];

      const invoice = await api.createInvoice({
        client_uid: invoiceUid.current,
        customer: cart.customer.name,
        profile: van.profile,
        items: cart.toPayloadItems(),
        payments,
        on_credit: tender === 'credit',
        submit: 1,
        geo,
        captured_at: stamp,
      });

      cart.clear();
      router.replace(`/(app)/receipt?invoice=${encodeURIComponent(invoice.name)}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not post the sale.');
    } finally {
      setBusy(false);
    }
  }

  if (!cart.customer) {
    return (
      <View style={{ flex: 1 }}>
        <Header title="Payment" onBack={() => router.back()} />
        <ScreenScroll>
          <Banner
            tone="info"
            title="Nothing to settle"
            body="Pick a customer and scan at least one item first."
          />
        </ScreenScroll>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <Header
        title="Payment"
        subtitle={cart.customer.customer_name}
        onBack={() => router.back()}
      />

      <ScreenScroll>
        <MoneyPanel style={{ alignItems: 'center' }}>
          <Text style={s.panelLabel}>Amount due</Text>
          <Mono size={40} color="#fff" style={{ marginTop: 6, letterSpacing: -1 }}>
            {money(total)}
          </Mono>
          <Text style={s.panelHint}>
            {van?.currency} · {cart.lines.length} lines
          </Text>
        </MoneyPanel>

        <Row gap={space.sm}>
          {(['cash', 'cheque', 'credit'] as Tender[]).map((option) => {
            const active = tender === option;
            return (
              <Pressable
                key={option}
                onPress={() => setTender(option)}
                style={[
                  s.mode,
                  {
                    backgroundColor: active ? colors.primaryWash : colors.card,
                    borderColor: active ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text style={[s.modeText, { color: active ? colors.primaryDark : colors.text }]}>
                  {option === 'cash' ? 'Cash' : option === 'cheque' ? 'Cheque' : 'Credit'}
                </Text>
              </Pressable>
            );
          })}
        </Row>

        {tender === 'cash' && (
          <Card>
            <SectionLabel>Cash tendered</SectionLabel>
            <TextInput
              value={tendered}
              onChangeText={setTendered}
              keyboardType="decimal-pad"
              placeholder={money(total)}
              placeholderTextColor={colors.placeholder}
              style={s.amountInput}
            />
            <Row gap={7} style={{ marginTop: space.md }}>
              {[total, 500, 1000, 2000].map((value, i) => (
                <Pressable
                  key={i}
                  onPress={() => setTendered(String(Math.round(value)))}
                  style={s.chip}
                >
                  <Mono size={13.5}>{i === 0 ? 'Exact' : money(value, 0)}</Mono>
                </Pressable>
              ))}
            </Row>
            <View style={s.changeRow}>
              <Text style={s.changeLabel}>Change due</Text>
              <Mono size={16} color={colors.success}>
                {money(change)}
              </Mono>
            </View>
          </Card>
        )}

        {tender === 'cheque' && (
          <Card>
            <SectionLabel>Cheque details</SectionLabel>
            <View style={{ gap: space.md, marginTop: space.sm }}>
              <View>
                <Text style={s.fieldLabel}>Cheque number</Text>
                <TextInput
                  value={chequeNo}
                  onChangeText={setChequeNo}
                  placeholder="004518"
                  placeholderTextColor={colors.placeholder}
                  style={s.input}
                />
              </View>
              <View>
                <Text style={s.fieldLabel}>Value date</Text>
                <TextInput
                  value={valueDate}
                  onChangeText={setValueDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.placeholder}
                  autoCapitalize="none"
                  style={s.input}
                />
              </View>
            </View>
            <Text style={s.note}>
              Leave the value date today for a cheque you are banking now. A future date makes it
              post-dated, and a post-dated cheque cannot settle the invoice — record it from the
              customer's Collect payment screen instead, so it is held until it clears.
            </Text>
          </Card>
        )}

        {tender === 'credit' && quote && (
          <Banner
            tone={quote.credit.over_limit ? 'warning' : 'info'}
            title={
              quote.credit.over_limit
                ? `Balance after this sale: ${money(quote.credit.balance_after)}`
                : 'Posting on terms'
            }
            body={
              quote.credit.over_limit
                ? `That is ${money(quote.credit.over_by)} past the ${money(
                    quote.credit.limit,
                    0,
                  )} limit. ${
                    quote.credit.blocks_credit_sale
                      ? 'The server will refuse this sale on credit.'
                      : 'It will post but be flagged.'
                  }`
                : 'The invoice stays outstanding against the customer, with no receipt raised.'
            }
          />
        )}

        {!!error && <Banner tone="danger" title="Not posted" body={error} />}

        <Button
          label={
            tender === 'credit' ? 'Post on credit' : 'Post & print receipt'
          }
          tone={tender === 'credit' ? 'primary' : 'success'}
          loading={busy}
          disabled={busy || creditBlocked || !quote}
          onPress={post}
        />

        {!quote && !error && <Loading text="Pricing the basket" />}
      </ScreenScroll>
    </View>
  );
}

const s = StyleSheet.create({
  panelLabel: {
    fontSize: 11,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.5)',
    fontWeight: '700',
  },
  panelHint: { fontSize: 12.5, color: 'rgba(255,255,255,0.5)', marginTop: 2 },
  mode: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: radius.md + 1,
    borderWidth: 1.5,
    alignItems: 'center',
  },
  modeText: { fontSize: 13.5, fontWeight: '700' },
  amountInput: {
    fontSize: 30,
    fontWeight: '600',
    color: colors.text,
    paddingVertical: space.sm,
  },
  chip: {
    flex: 1,
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  changeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 13,
    paddingTop: 11,
    borderTopWidth: 1,
    borderTopColor: colors.subtle,
  },
  changeLabel: { fontSize: 15, fontWeight: '600', color: colors.text },
  fieldLabel: { fontSize: 12, color: colors.muted, marginBottom: 5 },
  input: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    paddingHorizontal: 13,
    height: 48,
    fontSize: 15.5,
    color: colors.text,
  },
  note: { fontSize: 12.5, color: colors.muted, lineHeight: 18, marginTop: space.md },
});
