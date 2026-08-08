/**
 * Posted invoice + the 58mm receipt preview.
 *
 * The preview is rendered from the posted document, never from the basket.
 * The rep must be looking at what ERPNext actually recorded -- including the
 * document number and the tax it applied -- rather than at the app's idea of
 * the sale.
 *
 * Bluetooth printing is not built yet; the layout below is the exact
 * content that will be fed to the ESC/POS encoder when it is.
 */

import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useApi } from '../../src/auth/AuthContext';
import { useAsync } from '../../src/state/useAsync';
import { Header } from '../../src/ui/Chrome';
import { money, qty as fmtQty, shortDate } from '../../src/ui/format';
import {
  Banner,
  Button,
  Card,
  Loading,
  Mono,
  Row,
  ScreenScroll,
} from '../../src/ui/kit';
import { colors, mono, radius, space } from '../../src/ui/theme';

export default function Receipt() {
  const { invoice } = useLocalSearchParams<{ invoice?: string }>();
  const name = decodeURIComponent(String(invoice ?? ''));
  const router = useRouter();
  const api = useApi();

  const doc = useAsync(() => api.invoiceForPrint(name), [name]);
  const d = doc.data;

  return (
    <View style={{ flex: 1 }}>
      <Header title="Invoice posted" subtitle={name} />

      <ScreenScroll>
        <Banner tone="success" title={`Posted · ${name}`} body="Recorded in ERPNext." />

        {doc.loading && !d ? (
          <Loading />
        ) : doc.error ? (
          <Banner tone="danger" title="Could not load the receipt" body={doc.error} />
        ) : d ? (
          <View style={s.paperWrap}>
            <View style={s.paper}>
              <Text style={s.center}>{d.company.company_name.toUpperCase()}</Text>
              {!!d.company.tax_id && <Text style={s.centerSmall}>TRN {d.company.tax_id}</Text>}
              <Text style={s.centerSmall}>TAX INVOICE</Text>

              <View style={s.rule} />

              <PaperRow label="No" value={d.name} />
              <PaperRow label="Date" value={`${shortDate(d.posting_date, true)}`} />
              <PaperRow label="Cust" value={d.customer} />
              {!!d.customer_tax_id && <PaperRow label="TRN" value={d.customer_tax_id} />}

              <View style={s.rule} />

              {d.items.map((item, i) => (
                <View key={i} style={{ marginBottom: 5 }}>
                  <Text style={s.paperText} numberOfLines={1}>
                    {item.item_name}
                  </Text>
                  <View style={s.paperRow}>
                    <Text style={s.paperText}>
                      {fmtQty(item.qty)} x {money(item.rate)}
                    </Text>
                    <Text style={s.paperText}>{money(item.amount)}</Text>
                  </View>
                </View>
              ))}

              <View style={s.rule} />

              <PaperRow label="Subtotal" value={money(d.net_total)} />
              {d.taxes.map((tax, i) => (
                <PaperRow key={i} label={tax.description} value={money(tax.amount)} />
              ))}
              <View style={[s.paperRow, { marginTop: 4 }]}>
                <Text style={[s.paperText, s.bold]}>TOTAL {d.currency}</Text>
                <Text style={[s.paperText, s.bold]}>{money(d.rounded_total)}</Text>
              </View>

              <View style={s.rule} />

              <PaperRow
                label="Outstanding"
                value={money(d.outstanding_amount)}
              />

              <Text style={[s.centerSmall, { marginTop: 12 }]}>
                Goods once sold are not returnable{'\n'}without prior approval
              </Text>
              <View style={s.barcode} />
              <Text style={[s.centerSmall, { marginTop: 4 }]}>{d.name}</Text>
            </View>
          </View>
        ) : null}

        <Card>
          <Row style={{ alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Text style={s.printerTitle}>Thermal printer</Text>
              <Text style={s.printerBody}>
                Not connected. Bluetooth ESC/POS printing is planned but not built yet.
              </Text>
            </View>
          </Row>
        </Card>

        <Row>
          <Button
            label="Next customer"
            tone="ghost"
            compact
            onPress={() => router.replace('/(app)/van_home')}
            style={{ flex: 1 }}
          />
          <Button
            label="View invoice"
            tone="dark"
            compact
            onPress={() =>
              router.push(`/(app)/invoice-view/${encodeURIComponent(name)}` as never)
            }
            style={{ flex: 1 }}
          />
        </Row>
      </ScreenScroll>
    </View>
  );
}

function PaperRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.paperRow}>
      <Text style={s.paperText}>{label}</Text>
      <Text style={s.paperText}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  paperWrap: { alignItems: 'center' },
  paper: {
    width: 232,
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    paddingTop: 16,
    paddingBottom: 22,
    shadowColor: '#000',
    shadowOpacity: 0.09,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  center: { fontFamily: mono, fontSize: 12.5, fontWeight: '700', textAlign: 'center' },
  centerSmall: { fontFamily: mono, fontSize: 10, textAlign: 'center', marginTop: 2 },
  rule: { borderTopWidth: 1, borderColor: '#C6CDD8', borderStyle: 'dashed', marginVertical: 9 },
  paperRow: { flexDirection: 'row', justifyContent: 'space-between' },
  paperText: { fontFamily: mono, fontSize: 11, color: colors.text, lineHeight: 17 },
  bold: { fontWeight: '700', fontSize: 12.5 },
  barcode: { height: 34, marginTop: 10, backgroundColor: colors.text, opacity: 0.85 },
  printerTitle: { fontSize: 13.5, fontWeight: '600', color: colors.text },
  printerBody: { fontSize: 11.5, color: colors.faint, marginTop: 2, lineHeight: 16 },
});
