import { loginSchema } from '@lifeos/validation';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError } from '@/api';
import { useAuth } from '@/auth';
import { useTheme } from '@/theme';
import { PrimaryButton } from '@/ui';

export default function Login() {
  const t = useTheme();
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit() {
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message);
    setBusy(true);
    setError(undefined);
    try {
      await signIn(parsed.data.email, parsed.data.password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Couldn’t reach LifeOS. Check your connection.');
    } finally {
      setBusy(false);
    }
  }

  const input = [styles.input, { backgroundColor: t.raised, color: t.primary, borderColor: t.separator }];
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.canvas }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.wrap}>
        <Text accessibilityRole="header" style={[styles.title, { color: t.primary }]}>
          Sign in to LifeOS
        </Text>
        <Text style={{ color: t.secondary, fontSize: 17, marginBottom: 28 }}>Your day, planned around what matters.</Text>
        <View style={{ gap: 12 }}>
          <TextInput
            accessibilityLabel="Email"
            placeholder="Email"
            placeholderTextColor={t.tertiary}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="username"
            value={email}
            onChangeText={setEmail}
            style={input}
          />
          <TextInput
            accessibilityLabel="Password"
            placeholder="Password"
            placeholderTextColor={t.tertiary}
            secureTextEntry
            autoComplete="current-password"
            textContentType="password"
            value={password}
            onChangeText={setPassword}
            onSubmitEditing={submit}
            style={input}
          />
          {error ? (
            <Text accessibilityRole="alert" style={{ color: t.critical, fontSize: 15 }}>
              {error}
            </Text>
          ) : null}
          <PrimaryButton title="Sign in" onPress={submit} busy={busy} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
  title: { fontSize: 32, fontWeight: '700', letterSpacing: -0.5, marginBottom: 6 },
  input: { height: 50, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, fontSize: 17 },
});
