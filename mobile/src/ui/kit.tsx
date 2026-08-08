/** Shared building blocks. Every screen is assembled from these. */

import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { TOUCH, colors, mono, radius, shadow, space } from './theme';

export function Card({
  children,
  style,
  padded = true,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
}) {
  return <View style={[s.card, padded && { padding: space.md + 1 }, style]}>{children}</View>;
}

/** The dark panel used wherever the headline number lives. */
export function MoneyPanel({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[s.panel, style]}>{children}</View>;
}

export function SectionLabel({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[s.sectionLabel, style]}>{children}</Text>;
}

export function Mono({
  children,
  size = 14,
  color = colors.text,
  weight = '600',
  style,
}: {
  children: React.ReactNode;
  size?: number;
  color?: string;
  weight?: TextStyle['fontWeight'];
  style?: StyleProp<TextStyle>;
}) {
  return (
    <Text style={[{ fontFamily: mono, fontSize: size, color, fontWeight: weight }, style]}>
      {children}
    </Text>
  );
}

type ButtonTone = 'primary' | 'success' | 'dark' | 'ghost' | 'danger';

export function Button({
  label,
  onPress,
  tone = 'primary',
  disabled,
  loading,
  style,
  compact: isCompact,
}: {
  label: string;
  onPress?: () => void;
  tone?: ButtonTone;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
}) {
  const tones: Record<ButtonTone, { bg: string; fg: string; border: string }> = {
    primary: { bg: colors.primary, fg: colors.white, border: colors.primary },
    success: { bg: colors.success, fg: colors.white, border: colors.success },
    dark: { bg: colors.ink, fg: colors.white, border: colors.ink },
    ghost: { bg: colors.card, fg: colors.text, border: colors.borderStrong },
    danger: { bg: colors.card, fg: colors.danger, border: colors.dangerBorder },
  };
  const t = tones[tone];
  const isOff = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isOff, busy: !!loading }}
      onPress={isOff ? undefined : onPress}
      style={({ pressed }) => [
        s.button,
        {
          height: isCompact ? TOUCH : 54,
          backgroundColor: isOff ? colors.subtle : t.bg,
          borderColor: isOff ? colors.border : t.border,
          opacity: pressed ? 0.85 : 1,
        },
        tone !== 'ghost' && tone !== 'danger' && !isOff && shadow.button,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={isOff ? colors.placeholder : t.fg} />
      ) : (
        <Text
          style={[s.buttonLabel, { color: isOff ? colors.placeholder : t.fg }]}
          numberOfLines={1}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export function Row({
  children,
  gap = space.sm + 1,
  style,
}: {
  children: React.ReactNode;
  gap?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[{ flexDirection: 'row', gap }, style]}>{children}</View>;
}

/** Coloured status word: overdue, PDC held, picked, and so on. */
export function Pill({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info';
}) {
  const map = {
    neutral: { bg: colors.subtle, fg: colors.muted },
    success: { bg: colors.successWash, fg: colors.successInk },
    warning: { bg: colors.warningWash, fg: colors.warningInk },
    danger: { bg: colors.dangerWash, fg: colors.dangerInk },
    info: { bg: colors.primaryWash, fg: colors.primaryDark },
  }[tone];

  return (
    <View style={[s.pill, { backgroundColor: map.bg }]}>
      <Text style={[s.pillText, { color: map.fg }]}>{label}</Text>
    </View>
  );
}

/** Horizontal ageing / progress bar built from weighted segments. */
export function Bar({
  segments,
  height = 7,
}: {
  segments: { value: number; color: string }[];
  height?: number;
}) {
  const total = segments.reduce((sum, seg) => sum + Math.max(0, seg.value), 0);

  return (
    <View style={[s.bar, { height }]}>
      {total <= 0 ? (
        <View style={{ flex: 1, backgroundColor: colors.subtle }} />
      ) : (
        segments.map((seg, i) =>
          seg.value > 0 ? (
            <View key={i} style={{ flex: seg.value, backgroundColor: seg.color }} />
          ) : null,
        )
      )}
    </View>
  );
}

export function Banner({
  tone,
  title,
  body,
  children,
}: {
  tone: 'warning' | 'danger' | 'info' | 'success';
  title: string;
  body?: string;
  children?: React.ReactNode;
}) {
  const map = {
    warning: { bg: colors.warningWash, border: colors.warningBorder, fg: colors.warningInk },
    danger: { bg: colors.dangerWash, border: colors.dangerBorder, fg: colors.dangerInk },
    info: { bg: colors.primaryWash, border: colors.primaryBorder, fg: colors.primaryDark },
    success: { bg: colors.successWash, border: colors.successBorder, fg: colors.successInk },
  }[tone];

  return (
    <View style={[s.banner, { backgroundColor: map.bg, borderColor: map.border }]}>
      <Text style={[s.bannerTitle, { color: map.fg }]}>{title}</Text>
      {!!body && <Text style={[s.bannerBody, { color: map.fg }]}>{body}</Text>}
      {children}
    </View>
  );
}

export function Empty({ text }: { text: string }) {
  return (
    <View style={s.empty}>
      <Text style={s.emptyText}>{text}</Text>
    </View>
  );
}

export function Loading({ text }: { text?: string }) {
  return (
    <View style={s.loading}>
      <ActivityIndicator color={colors.primary} />
      {!!text && <Text style={s.loadingText}>{text}</Text>}
    </View>
  );
}

export function ScreenScroll({
  children,
  refreshControl,
}: {
  children: React.ReactNode;
  refreshControl?: React.ComponentProps<typeof ScrollView>['refreshControl'];
}) {
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: space.lg - 2, paddingBottom: space.xxl, gap: space.md }}
      keyboardShouldPersistTaps="handled"
      refreshControl={refreshControl}
    >
      {children}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    ...shadow.card,
  },
  panel: {
    backgroundColor: '#131C36',
    borderRadius: radius.xl,
    padding: space.lg,
    ...shadow.raised,
  },
  sectionLabel: {
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.faint,
    fontWeight: '700',
  },
  button: {
    borderRadius: radius.md + 1,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.md,
  },
  buttonLabel: { fontSize: 16, fontWeight: '700' },
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm },
  pillText: { fontSize: 11, fontWeight: '700' },
  bar: { flexDirection: 'row', borderRadius: 4, overflow: 'hidden', backgroundColor: colors.subtle },
  banner: { borderWidth: 1, borderRadius: radius.md, padding: space.md },
  bannerTitle: { fontSize: 13.5, fontWeight: '700' },
  bannerBody: { fontSize: 12.5, marginTop: 3, lineHeight: 18, opacity: 0.9 },
  empty: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
    borderRadius: radius.lg,
    paddingVertical: 34,
    paddingHorizontal: space.lg,
    alignItems: 'center',
  },
  emptyText: { color: colors.faint, fontSize: 13.5, textAlign: 'center' },
  loading: { padding: space.xxl, alignItems: 'center', gap: space.sm },
  loadingText: { color: colors.muted, fontSize: 13 },
});
