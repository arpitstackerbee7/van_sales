/** Sends the user to whichever home their roles earned them. */

import { Redirect } from 'expo-router';
import React from 'react';

import { useAuth } from '../../src/auth/AuthContext';
import { Loading } from '../../src/ui/kit';

export default function Home() {
  const { bootstrap, persona } = useAuth();

  if (!bootstrap) return <Loading text="Loading your session" />;

  const home =
    (persona && bootstrap.tabs[persona]?.[0]?.route) || bootstrap.home || 'van_home';

  return <Redirect href={`/(app)/${home}` as never} />;
}
