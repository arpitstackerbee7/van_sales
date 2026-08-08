/** Decides, once, whether the app opens on the login screen or the route. */

import { Redirect } from 'expo-router';
import React from 'react';
import { ActivityIndicator, View } from 'react-native';

import { useAuth } from '../src/auth/AuthContext';
import { colors } from '../src/ui/theme';

export default function Gate() {
  const { ready, credentials } = useAuth();

  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return <Redirect href={credentials ? '/(app)/home' : '/login'} />;
}
