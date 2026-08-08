/** What is physically on the van right now, valued at cost. */

import React, { useState } from 'react';
import { RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';

import { useApi, useAuth } from '../../src/auth/AuthContext';
import { useAsync } from '../../src/state/useAsync';
import { Header } from '../../src/ui/Chrome';
import { compact, money, qty as fmtQty } from '../../src/ui/format';
import {
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

export default function Replenish() {
  const api = useApi();
  const { van } = useAuth();
  const [search, setSearch] = useState('');

  const stock = useAsync(
    async () => (van ? api.vanStock(van.warehouse) : null),
    [van?.warehouse],
  );

  const rows = (stock.data?.items ?? []).filter((row: any) =>
    search
      ? `${row.item_name} ${row.item_code}`.toLowerCase().includes(search.toLowerCase())
      : true,
  );

  return (
    <View style={{ flex: 1 }}>
      <Header title="Van stock" subtitle={van?.warehouse_name ?? 'No van assigned'} />

      <ScreenScroll
        refreshControl={<RefreshControl refreshing={stock.loading} onRefresh={stock.reload} />}
      >
        {!van ? (
          <Banner
            tone="warning"
            title="No van assigned"
            body="Without a Van Sales Profile there is no warehouse to report stock from."
          />
        ) : (
          <>
            <MoneyPanel style={{ padding: space.lg - 1 }}>
              <Row style={{ alignItems: 'center' }}>
                <View style={{ flex: 1 }}>
                  <Text style={s.panelLabel}>Stock value on van</Text>
                  <Mono size={24} color="#fff" style={{ marginTop: 4 }}>
                    {compact(stock.data?.total_value ?? 0)}
                  </Mono>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Mono size={20} color="#fff">
                    {rows.length}
                  </Mono>
                  <Text style={s.panelHint}>items</Text>
                </View>
              </Row>
            </MoneyPanel>

            <View style={s.search}>
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Filter items"
                placeholderTextColor={colors.placeholder}
                style={s.searchInput}
              />
            </View>

            {stock.loading && !stock.data ? (
              <Loading />
            ) : stock.error ? (
              <Banner
                tone="danger"
                title={stock.offline ? 'No connection' : 'Could not load stock'}
                body={stock.error}
              />
            ) : !rows.length ? (
              <Empty text="Nothing on this van." />
            ) : (
              rows.map((row: any) => (
                <Card key={row.item_code} style={{ padding: space.md }}>
                  <Row style={{ alignItems: 'center' }}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={s.name} numberOfLines={1}>
                        {row.item_name}
                      </Text>
                      <Mono size={11.5} color={colors.faint} weight="500" style={{ marginTop: 2 }}>
                        {row.item_code}
                      </Mono>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Mono size={16} color={row.qty <= 0 ? colors.danger : colors.text}>
                        {fmtQty(row.qty)}
                      </Mono>
                      <Text style={s.uom}>{row.uom}</Text>
                    </View>
                  </Row>
                </Card>
              ))
            )}
          </>
        )}
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
  panelHint: { fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 2 },
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
  name: { fontSize: 14.5, fontWeight: '600', color: colors.text },
  uom: { fontSize: 11, color: colors.faint, marginTop: 2 },
});
