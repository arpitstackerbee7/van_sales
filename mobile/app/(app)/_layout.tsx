import { Redirect, Slot } from 'expo-router';
import React from 'react';
import { View } from 'react-native';

import { useAuth } from '../../src/auth/AuthContext';
import { TabBar } from '../../src/ui/Chrome';
import { Loading } from '../../src/ui/kit';
import { colors } from '../../src/ui/theme';

export default function AppLayout() {
  const { ready, credentials } = useAuth();

  if (!ready) return <Loading />;
  if (!credentials) return <Redirect href="/login" />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flex: 1 }}>
        <Slot />
      </View>
      <TabBar />
    </View>
  );
}
