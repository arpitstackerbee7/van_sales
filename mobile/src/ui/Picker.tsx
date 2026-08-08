/**
 * The link-field picker.
 *
 * Tapping a Customer or Item field opens this: a search box and a list to
 * choose from, the same move as clicking a Link field on the desk. It is a
 * sheet rather than a route on purpose -- picking a customer should not
 * navigate away from the invoice being built and lose what is already on it.
 *
 * Rows are rendered by the caller, so the customer picker can show a balance
 * and the item picker a price and van quantity, while both keep the same
 * search-and-select behaviour.
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApiError } from '../api/client';
import { colors, radius, space } from './theme';

export interface PickerProps<T> {
  visible: boolean;
  title: string;
  placeholder?: string;
  onClose: () => void;
  /** Called with the search text; debounced by the picker. */
  fetch: (query: string) => Promise<T[]>;
  keyFor: (item: T) => string;
  renderRow: (item: T) => React.ReactNode;
  onSelect: (item: T) => void;
  emptyText?: string;
  /** Shown under the search box; use for filters. */
  header?: React.ReactNode;
}

export function Picker<T>({
  visible,
  title,
  placeholder = 'Search',
  onClose,
  fetch,
  keyFor,
  renderRow,
  onSelect,
  emptyText = 'Nothing found.',
  header,
}: PickerProps<T>) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset each time it opens, so a previous search never greets the user.
  useEffect(() => {
    if (visible) {
      setQuery('');
      setError(null);
    }
  }, [visible]);

  // Debounced so typing does not fire a request per keystroke on a phone
  // that may be on a weak connection.
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setLoading(true);

    const timer = setTimeout(() => {
      fetch(query.trim())
        .then((result) => {
          if (!cancelled) {
            setRows(result);
            setError(null);
          }
        })
        .catch((e) => {
          if (!cancelled) {
            setRows([]);
            setError(e instanceof ApiError ? e.message : 'Search failed.');
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, visible]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={s.backdrop}>
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Close" />

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={[s.sheet, { paddingBottom: insets.bottom }]}
        >
          <View style={s.grabber} />

          <View style={s.head}>
            <Text style={s.title}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={12} style={s.close}>
              <Ionicons name="close" size={20} color={colors.muted} />
            </Pressable>
          </View>

          <View style={s.search}>
            <Ionicons name="search" size={16} color={colors.placeholder} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={placeholder}
              placeholderTextColor={colors.placeholder}
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              style={s.searchInput}
            />
            {loading && <ActivityIndicator size="small" color={colors.placeholder} />}
          </View>

          {header}

          {error ? (
            <View style={s.empty}>
              <Text style={s.errorText}>{error}</Text>
            </View>
          ) : (
            <FlatList
              data={rows}
              keyExtractor={keyFor}
              keyboardShouldPersistTaps="handled"
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingBottom: space.lg }}
              ListEmptyComponent={
                loading ? null : (
                  <View style={s.empty}>
                    <Text style={s.emptyText}>{emptyText}</Text>
                  </View>
                )
              }
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => onSelect(item)}
                  style={({ pressed }) => [s.row, pressed && { backgroundColor: colors.bg }]}
                >
                  {renderRow(item)}
                </Pressable>
              )}
            />
          )}
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(16,24,40,0.45)' },
  sheet: {
    height: '82%',
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: space.lg - 2,
  },
  grabber: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderStrong,
    alignSelf: 'center',
    marginTop: space.sm + 2,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: space.md,
  },
  title: { fontSize: 17, fontWeight: '600', color: colors.text, letterSpacing: -0.2 },
  close: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    height: 46,
    marginBottom: space.sm,
  },
  searchInput: { flex: 1, fontSize: 15, color: colors.text },
  row: {
    paddingVertical: space.md,
    paddingHorizontal: 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.subtle,
  },
  empty: { padding: space.xxl, alignItems: 'center' },
  emptyText: { color: colors.faint, fontSize: 13.5, textAlign: 'center' },
  errorText: { color: colors.danger, fontSize: 13.5, textAlign: 'center' },
});
