/**
 * A field that holds a link to another document.
 *
 * Reads like a form field rather than a button, because that is what it is:
 * a labelled slot showing either the chosen document or a prompt, which
 * opens a picker when tapped. Anyone who has filled in a Sales Invoice on
 * the desk knows this shape immediately.
 */

import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, space } from './theme';

export function LinkField({
  label,
  value,
  description,
  placeholder = 'Select',
  required,
  disabled,
  onPress,
  onClear,
}: {
  label: string;
  value?: string | null;
  description?: string | null;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  onPress: () => void;
  onClear?: () => void;
}) {
  const filled = !!value;

  return (
    <View style={{ gap: 6 }}>
      <Text style={s.label}>
        {label}
        {required && <Text style={s.required}> *</Text>}
      </Text>

      <Pressable
        onPress={disabled ? undefined : onPress}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value ?? placeholder}`}
        style={({ pressed }) => [
          s.field,
          {
            borderColor: filled ? colors.borderStrong : colors.border,
            backgroundColor: disabled ? colors.subtle : colors.card,
            opacity: pressed ? 0.8 : 1,
          },
        ]}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            style={[s.value, !filled && { color: colors.placeholder }]}
            numberOfLines={1}
          >
            {value || placeholder}
          </Text>
          {!!description && filled && (
            <Text style={s.description} numberOfLines={1}>
              {description}
            </Text>
          )}
        </View>

        {filled && onClear && !disabled ? (
          <Pressable onPress={onClear} hitSlop={12} accessibilityLabel={`Clear ${label}`}>
            <Ionicons name="close-circle" size={19} color={colors.placeholder} />
          </Pressable>
        ) : (
          <Ionicons name="chevron-down" size={17} color={colors.placeholder} />
        )}
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  label: {
    fontSize: 11,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    color: colors.faint,
    fontWeight: '700',
  },
  required: { color: colors.danger },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 13,
    minHeight: 52,
    paddingVertical: 8,
  },
  value: { fontSize: 15.5, color: colors.text, fontWeight: '500' },
  description: { fontSize: 12, color: colors.muted, marginTop: 2 },
});
