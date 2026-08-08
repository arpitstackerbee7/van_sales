/**
 * Item search -- the path to a line when scanning is off or a barcode will
 * not read.
 *
 * Deliberately the secondary way in, but it has to exist: a torn label or a
 * site with scanning disabled must not leave the rep unable to sell. It is
 * priced by the same endpoint the scanner uses, so a line added here is
 * identical to a scanned one.
 */

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { CatalogItem } from '../../src/api/types';
import { useApi, useAuth } from '../../src/auth/AuthContext';
import { useCart } from '../../src/state/cart';
import { useAsync } from '../../src/state/useAsync';
import { Header } from '../../src/ui/Chrome';
import { money, qty as fmtQty } from '../../src/ui/format';
import {
  Banner,
  Card,
  Empty,
  Loading,
  Mono,
  Row,
  ScreenScroll,
} from '../../src/ui/kit';
import { colors, radius, space } from '../../src/ui/theme';

export default function Items() {
  const api = useApi();
  const router = useRouter();
  const { van, bootstrap } = useAuth();
  const cart = useCart();

  const [query, setQuery] = useState('');
  const [applied, setApplied] = useState('');
  const [added, setAdded] = useState<string | null>(null);

  const allowed = bootstrap?.policy.manual_item_search ?? true;

  const items = useAsync(
    async () =>
      allowed
        ? api.searchItems({
            query: applied || undefined,
            warehouse: van?.warehouse,
            customer: cart.customer?.name,
            price_list: van?.price_list,
            company: van?.company,
            currency: van?.currency,
            limit: 50,
          })
        : { items: [] },
    [applied, allowed, van?.warehouse, cart.customer?.name],
  );

  function add(item: CatalogItem) {
    cart.addItem(item, 1);
    setAdded(item.item_code);
    setTimeout(() => setAdded(null), 1400);
  }

  return (
    <View style={{ flex: 1 }}>
      <Header
        title="Add item"
        subtitle={cart.customer?.customer_name ?? van?.warehouse_name}
        onBack={() => router.back()}
      />

      <ScreenScroll>
        {!allowed ? (
          <Banner
            tone="warning"
            title="Manual search is turned off"
            body="This site requires items to be scanned. Ask your administrator if a barcode will not read."
          />
        ) : (
          <>
            <View style={s.search}>
              <Ionicons name="search" size={16} color={colors.placeholder} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                onSubmitEditing={() => setApplied(query.trim())}
                returnKeyType="search"
                placeholder="Item name or code"
                placeholderTextColor={colors.placeholder}
                autoCapitalize="none"
                autoFocus
                style={s.searchInput}
              />
              {!!query && (
                <Pressable
                  onPress={() => {
                    setQuery('');
                    setApplied('');
                  }}
                  hitSlop={10}
                >
                  <Ionicons name="close-circle" size={18} color={colors.placeholder} />
                </Pressable>
              )}
            </View>

            {items.loading && !items.data ? (
              <Loading />
            ) : items.error ? (
              <Banner
                tone="danger"
                title={items.offline ? 'No connection' : 'Could not load items'}
                body={items.error}
              />
            ) : !items.data?.items.length ? (
              <Empty
                text={applied ? `Nothing matches "${applied}".` : 'No sales items found.'}
              />
            ) : (
              items.data.items.map((item) => {
                const inCart = cart.lines.find((l) => l.item_code === item.item_code);
                const justAdded = added === item.item_code;
                return (
                  <Pressable key={item.item_code} onPress={() => add(item)}>
                    <Card
                      style={
                        justAdded
                          ? { borderColor: colors.success, backgroundColor: colors.successWash }
                          : undefined
                      }
                    >
                      <Row style={{ alignItems: 'center' }}>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={s.name} numberOfLines={2}>
                            {item.item_name}
                          </Text>
                          <Mono
                            size={11.5}
                            color={colors.faint}
                            weight="500"
                            style={{ marginTop: 3 }}
                          >
                            {item.item_code} · {item.uom}
                          </Mono>
                          <View
                            style={[
                              s.stockTag,
                              item.van_qty > 0 ? s.stockIn : s.stockOut,
                            ]}
                          >
                            <View
                              style={[
                                s.stockDot,
                                {
                                  backgroundColor:
                                    item.van_qty > 0 ? colors.success : colors.danger,
                                },
                              ]}
                            />
                            <Text
                              style={[
                                s.stockTagText,
                                { color: item.van_qty > 0 ? colors.successInk : '#B42318' },
                              ]}
                            >
                              {item.van_qty > 0
                                ? `Available in van: ${fmtQty(item.van_qty)} ${item.uom}`
                                : 'Out of stock'}
                            </Text>
                          </View>
                        </View>

                        <View style={{ alignItems: 'flex-end', gap: 6 }}>
                          <Mono size={16}>{money(item.rate)}</Mono>
                          <View
                            style={[
                              s.add,
                              justAdded && { backgroundColor: colors.success },
                            ]}
                          >
                            <Ionicons
                              name={justAdded ? 'checkmark' : 'add'}
                              size={18}
                              color="#fff"
                            />
                          </View>
                          {!!inCart && (
                            <Text style={s.inCart}>{fmtQty(inCart.qty)} in cart</Text>
                          )}
                        </View>
                      </Row>
                    </Card>
                  </Pressable>
                );
              })
            )}
          </>
        )}
      </ScreenScroll>

      {cart.lines.length > 0 && (
        <View style={s.footer}>
          <Pressable onPress={() => router.push('/(app)/invoice')} style={s.done}>
            <Text style={s.doneText}>
              Done · {cart.lines.length} {cart.lines.length === 1 ? 'line' : 'lines'}
            </Text>
            <Mono size={15} color="#fff">
              {money(cart.subtotal)}
            </Mono>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 13,
    height: 48,
  },
  searchInput: { flex: 1, fontSize: 15, color: colors.text },
  chip: {
    flex: 1,
    height: 38,
    borderRadius: radius.sm + 1,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: { fontSize: 12.5, fontWeight: '700' },
  name: { fontSize: 14.5, fontWeight: '600', color: colors.text, lineHeight: 19 },
  stockTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginTop: 6,
  },
  stockIn: { backgroundColor: colors.successWash },
  stockOut: { backgroundColor: colors.dangerWash },
  stockDot: { width: 6, height: 6, borderRadius: 3 },
  stockTagText: { fontSize: 11.5, fontWeight: '700' },
  add: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inCart: { fontSize: 10.5, color: colors.muted, fontWeight: '600' },
  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
    padding: space.md,
  },
  done: {
    height: 52,
    borderRadius: radius.md + 1,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
  },
  doneText: { color: '#fff', fontSize: 15.5, fontWeight: '700' },
});
