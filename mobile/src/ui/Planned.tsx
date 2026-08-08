/**
 * Placeholder for a screen whose backend is not built yet.
 *
 * It names what the screen will do rather than showing a fake one, so a
 * demo never implies working functionality that is not there.
 */

import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Header } from './Chrome';
import { Card, ScreenScroll } from './kit';
import { colors, space } from './theme';

export function Planned({
  title,
  subtitle,
  summary,
  bullets,
}: {
  title: string;
  subtitle?: string;
  summary: string;
  bullets: string[];
}) {
  return (
    <View style={{ flex: 1 }}>
      <Header title={title} subtitle={subtitle} />
      <ScreenScroll>
        <Card>
          <View style={s.head}>
            <Ionicons name="construct-outline" size={18} color={colors.warning} />
            <Text style={s.badge}>Not built yet</Text>
          </View>
          <Text style={s.summary}>{summary}</Text>
        </Card>

        <Card>
          <Text style={s.label}>What this screen will do</Text>
          <View style={{ gap: space.sm, marginTop: space.sm }}>
            {bullets.map((bullet, i) => (
              <View key={i} style={s.row}>
                <View style={s.dot} />
                <Text style={s.bullet}>{bullet}</Text>
              </View>
            ))}
          </View>
        </Card>
      </ScreenScroll>
    </View>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  badge: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.warning,
  },
  summary: { fontSize: 14, color: colors.text, lineHeight: 21, marginTop: space.sm },
  label: {
    fontSize: 11,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    color: colors.faint,
    fontWeight: '700',
  },
  row: { flexDirection: 'row', gap: space.sm + 2 },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.placeholder,
    marginTop: 7,
  },
  bullet: { flex: 1, fontSize: 13.5, color: colors.muted, lineHeight: 20 },
});
