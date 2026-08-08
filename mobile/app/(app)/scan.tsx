/**
 * Barcode scanning.
 *
 * One scan has to resolve the item, its UOM, the price for this customer and
 * what is on the van -- so the rep never types. Two details matter:
 *
 * - The same barcode is debounced. A laser scanner fires the same code many
 *   times a second, and without the guard a single trigger pull adds five
 *   cartons.
 * - A hit that is not on the van is shown, not hidden. The rep may still
 *   sell it if the van count is wrong, but they are told first.
 */

import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApiError } from '../../src/api/client';
import type { CatalogItem } from '../../src/api/types';
import { useApi, useAuth } from '../../src/auth/AuthContext';
import { useCart } from '../../src/state/cart';
import { money, qty as fmtQty } from '../../src/ui/format';
import { Button, Mono } from '../../src/ui/kit';
import { colors, radius, space } from '../../src/ui/theme';

/** A scanner repeats the same code many times a second. */
const SAME_CODE_COOLDOWN_MS = 1800;

export default function Scan() {
  const router = useRouter();
  const api = useApi();
  const { van } = useAuth();
  const cart = useCart();

  const [permission, requestPermission] = useCameraPermissions();
  const insets = useSafeAreaInsets();

  const [hit, setHit] = useState<CatalogItem | null>(null);
  const [miss, setMiss] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const lastCode = useRef<{ code: string; at: number } | null>(null);

  const onScanned = useCallback(
    async ({ data }: { data: string }) => {
      const code = String(data ?? '').trim();
      if (!code || busy) return;

      const now = Date.now();
      if (lastCode.current?.code === code && now - lastCode.current.at < SAME_CODE_COOLDOWN_MS) {
        return;
      }
      lastCode.current = { code, at: now };

      setBusy(true);
      setMiss(null);
      try {
        const result = await api.resolveBarcode({
          barcode: code,
          warehouse: van?.warehouse,
          customer: cart.customer?.name,
          price_list: van?.price_list,
          company: van?.company,
          currency: van?.currency,
        });

        if (result.found && result.item) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          setHit(result.item);
        } else {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
          setHit(null);
          setMiss(code);
        }
      } catch (e) {
        setHit(null);
        setMiss(e instanceof ApiError ? e.message : 'Lookup failed.');
      } finally {
        setBusy(false);
      }
    },
    [api, busy, cart.customer?.name, van],
  );

  function addToInvoice() {
    if (!hit) return;
    cart.addItem(hit, 1);
    setHit(null);
    lastCode.current = null;
    router.push('/(app)/invoice');
  }

  if (!permission) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={[s.center, { padding: space.xl, gap: space.md }]}>
        <Ionicons name="camera-outline" size={40} color={colors.placeholder} />
        <Text style={s.permTitle}>Camera access is needed to scan</Text>
        <Text style={s.permBody}>
          Scanning is how items reach an invoice. Without the camera every line has to be typed.
        </Text>
        <Button label="Allow camera" onPress={requestPermission} style={{ alignSelf: 'stretch' }} />
        <Button
          label="Back"
          tone="ghost"
          compact
          onPress={() => router.back()}
          style={{ alignSelf: 'stretch' }}
        />
      </View>
    );
  }

  return (
    <View style={s.root}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{
          barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'itf14', 'qr'],
        }}
        onBarcodeScanned={onScanned}
      />

      <View style={[s.topBar, { paddingTop: insets.top + space.sm }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={s.close}>
          <Ionicons name="close" size={22} color="#fff" />
        </Pressable>
        <Text style={s.topText} numberOfLines={1}>
          {cart.customer ? cart.customer.customer_name : 'No customer selected'}
        </Text>
      </View>

      <View style={s.reticleWrap} pointerEvents="none">
        <View style={s.reticle} />
        <Text style={s.hint}>Align the barcode inside the frame</Text>
      </View>

      <View style={[s.sheet, { paddingBottom: insets.bottom + space.lg }]}>
        {busy && !hit && <ActivityIndicator color="#8FB0FF" />}

        {!!miss && !hit && (
          <View style={s.miss}>
            <Text style={s.missTitle}>No item for that code</Text>
            <Text style={s.missBody} numberOfLines={2}>
              {miss}
            </Text>
          </View>
        )}

        {hit && (
          <View style={s.hitCard}>
            <Text style={s.hitLabel}>
              Matched · van {fmtQty(hit.van_qty)} {hit.uom}
            </Text>
            <Text style={s.hitName}>{hit.item_name}</Text>
            <Mono size={12} color="rgba(255,255,255,0.55)" weight="500" style={{ marginTop: 3 }}>
              {hit.item_code} · {money(hit.rate)} / {hit.uom}
            </Mono>
            {hit.van_qty <= 0 && (
              <Text style={s.hitWarn}>Not on this van — selling it will drive stock negative.</Text>
            )}
          </View>
        )}

        <View style={{ flexDirection: 'row', gap: space.sm + 1, marginTop: space.md }}>
          <Button
            label="Cancel"
            tone="ghost"
            compact
            onPress={() => router.back()}
            style={{ width: 110 }}
          />
          <Button
            label={hit ? 'Add to invoice' : 'Waiting for scan'}
            disabled={!hit}
            compact
            onPress={addToInvoice}
            style={{ flex: 1 }}
          />
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0A1020' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  permTitle: { fontSize: 16, fontWeight: '600', color: colors.text, textAlign: 'center' },
  permBody: { fontSize: 13, color: colors.muted, textAlign: 'center', lineHeight: 19 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingBottom: space.sm,
  },
  close: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topText: { color: '#fff', fontSize: 14, fontWeight: '600', flex: 1 },
  reticleWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  reticle: {
    width: 260,
    height: 150,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  hint: { color: 'rgba(255,255,255,0.6)', fontSize: 13, marginTop: space.lg },
  sheet: { backgroundColor: '#141C2E', padding: space.lg, gap: space.sm },
  hitCard: {
    backgroundColor: 'rgba(30,94,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(30,94,255,0.4)',
    borderRadius: radius.md + 1,
    padding: 13,
  },
  hitLabel: {
    fontSize: 11,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    color: '#8FB0FF',
    fontWeight: '700',
  },
  hitName: { fontSize: 16, fontWeight: '600', color: '#fff', marginTop: 5 },
  hitWarn: { fontSize: 12, color: '#FDB022', marginTop: 6, lineHeight: 17 },
  miss: {
    backgroundColor: 'rgba(217,45,32,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(242,199,199,0.3)',
    borderRadius: radius.md,
    padding: 13,
  },
  missTitle: { color: '#FDA29B', fontSize: 14, fontWeight: '700' },
  missBody: { color: 'rgba(253,162,155,0.8)', fontSize: 12, marginTop: 3 },
});
