/**
 * My Profile.
 *
 * The screen is honest about who owns each piece of data. Contact details
 * are editable because they are the user's own. The employment block --
 * designation, department, joining date, reporting line -- is shown but
 * locked, because it is HR's record; letting a rep edit their own
 * designation on a phone is not profile management.
 *
 * Which fields are editable is not decided here. The server returns an
 * `editable` list and this screen renders against it, so tightening the
 * policy on the server tightens the UI at the next sync rather than needing
 * a new build.
 */

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import Constants from 'expo-constants';
import {
  Alert,
  Image,
  Linking,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { ApiError } from '../../src/api/client';
import type { Profile } from '../../src/api/types';
import { useApi, useAuth } from '../../src/auth/AuthContext';
import { useAsync } from '../../src/state/useAsync';
import { Header } from '../../src/ui/Chrome';
import { shortDate } from '../../src/ui/format';
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

type Draft = Record<string, string>;

const PERSONA_LABELS: Record<string, string> = {
  van: 'Van Sales',
  pre_sales: 'Pre-Sales',
  team_leader: 'Team Leader',
  driver: 'Logistics',
  store: 'Store In-charge',
  management: 'Management',
};

export default function ProfileScreen() {
  const api = useApi();
  const router = useRouter();
  const { signOut, refresh, credentials, bootstrap, persona, setPersona } = useAuth();

  const profile = useAsync(() => api.getProfile(), []);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>({});
  const [employeeDraft, setEmployeeDraft] = useState<Draft>({});
  const [saving, setSaving] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const d: Profile | null = profile.data;

  // Seed the form from the server every time fresh data lands, so an edit
  // that was cancelled or that failed never leaves stale values behind.
  useEffect(() => {
    if (!d) return;
    setDraft({
      first_name: d.user.first_name ?? '',
      last_name: d.user.last_name ?? '',
      mobile_no: d.user.mobile_no ?? '',
      phone: d.user.phone ?? '',
      location: d.user.location ?? '',
    });
    setEmployeeDraft({
      cell_number: d.employee?.cell_number ?? '',
      personal_email: d.employee?.personal_email ?? '',
      current_address: d.employee?.current_address ?? '',
      emergency_phone_number: d.employee?.emergency_phone_number ?? '',
    });
  }, [d]);

  const canEditUser = (field: string) => !!d?.editable.user.includes(field);
  const canEditEmployee = (field: string) => !!d?.editable.employee.includes(field);

  async function save() {
    if (!d) return;
    setSaving(true);
    setError(null);
    setSaved(false);

    try {
      // Only send what the server said it accepts. Anything else would be
      // dropped anyway; not sending it keeps the intent obvious.
      const payload: Record<string, unknown> = {};
      for (const [field, value] of Object.entries(draft)) {
        if (canEditUser(field)) payload[field] = value;
      }

      const employee: Record<string, unknown> = {};
      for (const [field, value] of Object.entries(employeeDraft)) {
        if (canEditEmployee(field)) employee[field] = value;
      }
      if (Object.keys(employee).length) payload.employee = employee;

      await api.updateProfile(payload);
      await profile.reload();
      // The header and greeting read from bootstrap, so pull that again or
      // a changed name would keep showing the old one until next sign-in.
      await refresh();

      setEditing(false);
      setSaved(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save your profile.');
    } finally {
      setSaving(false);
    }
  }

  function confirmSignOut() {
    Alert.alert(
      'Sign out?',
      'Anything still queued on this device has not reached the server yet and will be lost.',
      [
        { text: 'Stay signed in', style: 'cancel' },
        {
          text: 'Sign out',
          style: 'destructive',
          onPress: async () => {
            await signOut();
            router.replace('/login');
          },
        },
      ],
    );
  }

  /**
   * For a handset that has been lost or stolen. Signing out normally only
   * clears the key from *this* device, which is no help when the problem is
   * a phone you no longer hold. This drops the key pair on the server, so
   * every device holding it stops working at its next request.
   *
   * Signing in again mints a fresh pair, so the user is not locked out --
   * only whoever has the old handset is.
   */
  function confirmRevokeAll() {
    Alert.alert(
      'Sign out all devices?',
      'Every phone signed in as you stops working immediately, including this one. Use this if a handset has been lost or stolen.\n\nSigning in again will get this phone working; the lost one stays locked out.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign out everywhere',
          style: 'destructive',
          onPress: async () => {
            setRevoking(true);
            setError(null);
            try {
              await api.revokeAllDevices();
              // Local credentials are now dead server-side; clearing them
              // keeps the app from retrying with a token that cannot work.
              await signOut();
              router.replace('/login');
            } catch (e) {
              setError(
                e instanceof ApiError ? e.message : 'Could not sign out the other devices.',
              );
            } finally {
              setRevoking(false);
            }
          },
        },
      ],
    );
  }

  const initials = (d?.user.full_name ?? '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

  return (
    <View style={{ flex: 1 }}>
      <Header
        title="My Profile"
        subtitle={d?.user.email}
        right={
          d && !editing ? (
            <Pressable onPress={() => setEditing(true)} hitSlop={10} style={s.editBtn}>
              <Text style={s.editText}>Edit</Text>
            </Pressable>
          ) : undefined
        }
      />

      <ScreenScroll
        refreshControl={
          <RefreshControl refreshing={profile.loading} onRefresh={profile.reload} />
        }
      >
        {profile.loading && !d ? (
          <Loading />
        ) : profile.error ? (
          <Banner
            tone="danger"
            title={profile.offline ? 'No connection' : 'Could not load your profile'}
            body={profile.error}
          />
        ) : d ? (
          <>
            <MoneyPanel>
              <Row style={{ alignItems: 'center' }}>
                {d.user.user_image ? (
                  <Image
                    source={{ uri: `${credentials?.site}${d.user.user_image}` }}
                    style={s.avatar}
                  />
                ) : (
                  <View style={[s.avatar, s.avatarFallback]}>
                    <Text style={s.initials}>{initials}</Text>
                  </View>
                )}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.name} numberOfLines={1}>
                    {d.user.full_name}
                  </Text>
                  <Text style={s.email} numberOfLines={1}>
                    {d.employee?.designation ?? d.user.email}
                  </Text>
                  {!!d.employee && (
                    <Mono size={11.5} color="rgba(255,255,255,0.5)" weight="500">
                      {d.employee.name}
                      {d.employee.department ? ` · ${d.employee.department}` : ''}
                    </Mono>
                  )}
                </View>
              </Row>
            </MoneyPanel>

            {saved && (
              <Banner tone="success" title="Profile updated" body="Saved to ERPNext." />
            )}
            {!!error && <Banner tone="danger" title="Not saved" body={error} />}

            {/* Contact ------------------------------------------------- */}
            <SectionLabel>Contact</SectionLabel>
            <Card>
              <Field
                label="First name"
                value={draft.first_name}
                editing={editing && canEditUser('first_name')}
                onChange={(v) => setDraft((p) => ({ ...p, first_name: v }))}
              />
              <Field
                label="Last name"
                value={draft.last_name}
                editing={editing && canEditUser('last_name')}
                onChange={(v) => setDraft((p) => ({ ...p, last_name: v }))}
              />
              <Field
                label="Mobile"
                value={draft.mobile_no}
                editing={editing && canEditUser('mobile_no')}
                keyboardType="phone-pad"
                onChange={(v) => setDraft((p) => ({ ...p, mobile_no: v }))}
              />
              <Field
                label="Phone"
                value={draft.phone}
                editing={editing && canEditUser('phone')}
                keyboardType="phone-pad"
                onChange={(v) => setDraft((p) => ({ ...p, phone: v }))}
              />
              <Field
                label="Location"
                value={draft.location}
                editing={editing && canEditUser('location')}
                last
                onChange={(v) => setDraft((p) => ({ ...p, location: v }))}
              />
            </Card>

            {/* Employment ---------------------------------------------- */}
            {!!d.employee && (
              <>
                <SectionLabel>Employment</SectionLabel>
                <Card>
                  <Field label="Employee ID" value={d.employee.name} editing={false} mono />
                  <Field
                    label="Designation"
                    value={d.employee.designation ?? '—'}
                    editing={false}
                  />
                  <Field label="Department" value={d.employee.department ?? '—'} editing={false} />
                  <Field label="Branch" value={d.employee.branch ?? '—'} editing={false} />
                  <Field
                    label="Joined"
                    value={shortDate(d.employee.date_of_joining, true)}
                    editing={false}
                  />
                  <Field
                    label="Reports to"
                    value={d.employee.reports_to_name ?? d.employee.reports_to ?? '—'}
                    editing={false}
                    last
                  />
                </Card>
                <Text style={s.hint}>
                  Employment details are maintained by HR in ERPNext and cannot be changed from
                  the app.
                </Text>

                <SectionLabel>Personal &amp; emergency</SectionLabel>
                <Card>
                  <Field
                    label="Personal email"
                    value={employeeDraft.personal_email}
                    editing={editing && canEditEmployee('personal_email')}
                    keyboardType="email-address"
                    onChange={(v) => setEmployeeDraft((p) => ({ ...p, personal_email: v }))}
                  />
                  <Field
                    label="Personal mobile"
                    value={employeeDraft.cell_number}
                    editing={editing && canEditEmployee('cell_number')}
                    keyboardType="phone-pad"
                    onChange={(v) => setEmployeeDraft((p) => ({ ...p, cell_number: v }))}
                  />
                  <Field
                    label="Emergency contact"
                    value={employeeDraft.emergency_phone_number}
                    editing={editing && canEditEmployee('emergency_phone_number')}
                    keyboardType="phone-pad"
                    onChange={(v) =>
                      setEmployeeDraft((p) => ({ ...p, emergency_phone_number: v }))
                    }
                  />
                  <Field
                    label="Address"
                    value={employeeDraft.current_address}
                    editing={editing && canEditEmployee('current_address')}
                    multiline
                    last
                    onChange={(v) => setEmployeeDraft((p) => ({ ...p, current_address: v }))}
                  />
                </Card>
              </>
            )}

            {/* Which job am I doing right now ------------------------- */}
            {(bootstrap?.personas.length ?? 0) > 1 && (
              <>
                <SectionLabel>Working as</SectionLabel>
                <Card style={{ padding: space.sm }}>
                  {bootstrap!.personas.map((p) => {
                    const active = p === persona;
                    return (
                      <Pressable
                        key={p}
                        onPress={() => {
                          setPersona(p);
                          router.replace('/(app)/home');
                        }}
                        style={[s.personaRow, active && { backgroundColor: colors.primaryWash }]}
                      >
                        <Ionicons
                          name={active ? 'radio-button-on' : 'radio-button-off'}
                          size={19}
                          color={active ? colors.primary : colors.placeholder}
                        />
                        <Text
                          style={[
                            s.personaLabel,
                            active && { color: colors.primaryDark, fontWeight: '700' },
                          ]}
                        >
                          {PERSONA_LABELS[p] ?? p}
                        </Text>
                      </Pressable>
                    );
                  })}
                </Card>
                <Text style={s.hint}>
                  You hold more than one role, so the app can show more than one job. Switching
                  changes the tabs and the home screen, not your permissions.
                </Text>
              </>
            )}

            {/* Work context -------------------------------------------- */}
            <SectionLabel>Access</SectionLabel>
            <Card>
              {!!d.van && (
                <>
                  <Field label="Van" value={d.van.profile} editing={false} mono />
                  <Field label="Warehouse" value={d.van.warehouse_name} editing={false} />
                  <Field label="Company" value={d.van.company} editing={false} />
                  <Field label="Price list" value={d.van.price_list} editing={false} />
                </>
              )}
              <View style={{ paddingTop: space.sm }}>
                <Text style={s.fieldLabel}>Roles</Text>
                <View style={s.chips}>
                  {d.roles.map((role) => (
                    <View key={role} style={s.chip}>
                      <Text style={s.chipText}>{role}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </Card>
            <Text style={s.hint}>
              Roles decide which screens this app shows you. They are set in ERPNext and take
              effect at your next sync.
            </Text>

            {editing ? (
              <Row>
                <Button
                  label="Cancel"
                  tone="ghost"
                  compact
                  onPress={() => {
                    setEditing(false);
                    setError(null);
                    profile.reload();
                  }}
                  style={{ flex: 1 }}
                />
                <Button
                  label="Save"
                  compact
                  loading={saving}
                  onPress={save}
                  style={{ flex: 1 }}
                />
              </Row>
            ) : (
              <>
                <Card style={s.meta}>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <Text style={s.metaLabel}>Last sign-in</Text>
                    <Mono size={12} color={colors.muted} weight="500">
                      {shortDate(d.user.last_login, true)}
                    </Mono>
                  </Row>
                  <Row style={{ justifyContent: 'space-between', marginTop: 6 }}>
                    <Text style={s.metaLabel}>Site</Text>
                    <Mono size={12} color={colors.muted} weight="500">
                      {credentials?.site.replace(/^https?:\/\//, '')}
                    </Mono>
                  </Row>
                </Card>

                <SectionLabel>About</SectionLabel>
                <Card style={s.meta}>
                  <Row style={{ alignItems: 'center', gap: space.md }}>
                    <Image
                      source={require('../../assets/logo.png')}
                      style={s.aboutLogo}
                      resizeMode="contain"
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={s.aboutTitle}>Van Sales</Text>
                      <Text style={s.aboutBy}>by Yasir Shaikh</Text>
                      <Text
                        style={s.aboutLink}
                        onPress={() => Linking.openURL('mailto:erp.yasirshaikh@gmail.com')}
                      >
                        erp.yasirshaikh@gmail.com
                      </Text>
                    </View>
                    <Mono size={12} color={colors.faint} weight="500">
                      v{Constants.expoConfig?.version ?? '—'}
                    </Mono>
                  </Row>
                </Card>

                <Pressable onPress={confirmSignOut} style={s.signOut}>
                  <Ionicons name="log-out-outline" size={18} color={colors.danger} />
                  <Text style={s.signOutText}>Sign out</Text>
                </Pressable>

                <Pressable
                  onPress={revoking ? undefined : confirmRevokeAll}
                  style={[s.revokeAll, revoking && { opacity: 0.5 }]}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: revoking, busy: revoking }}
                >
                  <Ionicons name="phone-portrait-outline" size={16} color={colors.muted} />
                  <Text style={s.revokeAllText}>
                    {revoking ? 'Signing out everywhere…' : 'Sign out all devices'}
                  </Text>
                </Pressable>
                <Text style={s.hint}>
                  Use this if a phone has been lost or stolen. It stops every device signed in as
                  you, including this one.
                </Text>
              </>
            )}
          </>
        ) : null}
      </ScreenScroll>
    </View>
  );
}

function Field({
  label,
  value,
  editing,
  onChange,
  keyboardType,
  multiline,
  mono,
  last,
}: {
  label: string;
  value?: string | null;
  editing: boolean;
  onChange?: (v: string) => void;
  keyboardType?: 'default' | 'phone-pad' | 'email-address';
  multiline?: boolean;
  mono?: boolean;
  last?: boolean;
}) {
  return (
    <View style={[s.field, !last && s.fieldDivider]}>
      <Text style={s.fieldLabel}>{label}</Text>
      {editing ? (
        <TextInput
          value={value ?? ''}
          onChangeText={onChange}
          keyboardType={keyboardType ?? 'default'}
          autoCapitalize={keyboardType === 'email-address' ? 'none' : 'sentences'}
          multiline={multiline}
          style={[s.input, multiline && { height: 68, textAlignVertical: 'top' }]}
          placeholderTextColor={colors.placeholder}
          placeholder="—"
        />
      ) : mono ? (
        <Mono size={14}>{value || '—'}</Mono>
      ) : (
        <Text style={s.value}>{value || '—'}</Text>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  editBtn: { paddingHorizontal: 12, paddingVertical: 7 },
  editText: { color: colors.primary, fontSize: 14, fontWeight: '700' },
  avatar: { width: 58, height: 58, borderRadius: 29 },
  avatarFallback: {
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: { color: '#fff', fontSize: 20, fontWeight: '700' },
  name: { color: '#fff', fontSize: 19, fontWeight: '600', letterSpacing: -0.3 },
  email: { color: 'rgba(255,255,255,0.65)', fontSize: 13, marginTop: 2, marginBottom: 3 },
  field: { paddingVertical: 10 },
  fieldDivider: { borderBottomWidth: 1, borderBottomColor: colors.subtle },
  fieldLabel: {
    fontSize: 11,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    color: colors.faint,
    fontWeight: '700',
  },
  value: { fontSize: 15, color: colors.text, marginTop: 4 },
  input: {
    fontSize: 15,
    color: colors.text,
    marginTop: 4,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  hint: { fontSize: 12, color: colors.faint, lineHeight: 17, marginTop: -space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 7 },
  chip: {
    backgroundColor: colors.primaryWash,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    borderRadius: radius.sm,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  chipText: { fontSize: 11.5, color: colors.primaryDark, fontWeight: '600' },
  meta: { padding: space.md },
  metaLabel: { fontSize: 12.5, color: colors.muted },
  personaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
    paddingHorizontal: 10,
    borderRadius: radius.sm + 1,
  },
  personaLabel: { fontSize: 15, color: colors.text, fontWeight: '500' },
  aboutLogo: { width: 46, height: 46 },
  aboutTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  aboutBy: { fontSize: 12.5, color: colors.muted, marginTop: 1 },
  aboutLink: { fontSize: 12, color: colors.primary, marginTop: 2 },
  signOut: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 52,
    borderRadius: radius.md + 1,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    backgroundColor: colors.card,
  },
  signOutText: { color: colors.danger, fontSize: 15, fontWeight: '700' },
  revokeAll: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 46,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
  },
  revokeAllText: { color: colors.muted, fontSize: 13.5, fontWeight: '600' },
});
