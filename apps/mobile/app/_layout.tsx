import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { Redirect, Slot, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '@/auth';
import { useTheme } from '@/theme';

// Offline-friendly: the last fetched data is kept on the device for a day and
// shown immediately (marked stale) while the network catches up.
const queryClient = new QueryClient({
  defaultOptions: { queries: { gcTime: 24 * 3_600_000, staleTime: 30_000, retry: 1 }, mutations: { retry: 0 } },
});
const persister = createAsyncStoragePersister({ storage: AsyncStorage, key: 'lifeos-cache' });

function Gate() {
  const { status } = useAuth();
  const segments = useSegments();
  const t = useTheme();
  if (status === 'loading') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.canvas }}>
        <ActivityIndicator />
      </View>
    );
  }
  const onLogin = segments[0] === 'login';
  if (status === 'signedOut' && !onLogin) return <Redirect href="/login" />;
  if (status === 'signedIn' && onLogin) return <Redirect href="/" />;
  return <Slot />;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <PersistQueryClientProvider client={queryClient} persistOptions={{ persister, maxAge: 24 * 3_600_000 }}>
        <AuthProvider>
          <StatusBar style="auto" />
          <Gate />
        </AuthProvider>
      </PersistQueryClientProvider>
    </SafeAreaProvider>
  );
}
