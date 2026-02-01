import React, { useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useAuth } from "../context/AuthContext";

export default function RegisterScreen() {
  const { signUp } = useAuth();
  const params = useLocalSearchParams<{ redirect?: string }>();
  const redirect = params.redirect as string | undefined;

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleRegister = async () => {
    setError("");
    if (!email.trim()) {
      setError("Vui lòng nhập email");
      return;
    }
    if (password.length < 6) {
      setError("Mật khẩu tối thiểu 6 ký tự");
      return;
    }
    if (password !== confirmPassword) {
      setError("Mật khẩu xác nhận không khớp");
      return;
    }
    setLoading(true);
    const { error: err } = await signUp(email.trim(), password, displayName.trim() || undefined);
    setLoading(false);
    if (err) {
      setError(err.message || "Đăng ký thất bại");
      return;
    }
    setSuccess(true);
    setTimeout(() => {
      if (redirect) {
        router.replace(redirect as any);
      } else {
        router.replace("/");
      }
    }, 1500);
  };

  if (success) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.successBox}>
          <Text style={styles.successTitle}>✅ Đăng ký thành công!</Text>
          <Text style={styles.successText}>
            Kiểm tra email để xác thực (nếu bật trong Supabase). Đang chuyển...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboard}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <Text style={styles.title}>🎱 Tạo tài khoản</Text>
            <Text style={styles.subtitle}>Chơi multiplayer với bạn bè</Text>
          </View>

          <View style={styles.form}>
            <Text style={styles.label}>Tên hiển thị (tùy chọn)</Text>
            <TextInput
              style={styles.input}
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Alex Nguyen"
              placeholderTextColor="#64748b"
              autoCapitalize="words"
            />

            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="email@example.com"
              placeholderTextColor="#64748b"
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
            />

            <Text style={styles.label}>Mật khẩu (tối thiểu 6 ký tự)</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor="#64748b"
              secureTextEntry
              autoCapitalize="none"
              autoComplete="password-new"
            />

            <Text style={styles.label}>Xác nhận mật khẩu</Text>
            <TextInput
              style={styles.input}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="••••••••"
              placeholderTextColor="#64748b"
              secureTextEntry
              autoCapitalize="none"
            />

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <TouchableOpacity
              style={[styles.button, styles.primaryButton]}
              onPress={handleRegister}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#000" />
              ) : (
                <Text style={styles.primaryButtonText}>Đăng ký</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.linkButton}
              onPress={() =>
                router.push({
                  pathname: "/login",
                  params: redirect ? { redirect } : {},
                })
              }
            >
              <Text style={styles.linkText}>Đã có tài khoản? Đăng nhập</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>← Quay lại</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f172a",
  },
  keyboard: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  header: {
    alignItems: "center",
    marginBottom: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: "#94a3b8",
  },
  form: {
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#cbd5e1",
    marginBottom: 8,
  },
  input: {
    backgroundColor: "#1e293b",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: "#fff",
    borderWidth: 2,
    borderColor: "#334155",
    marginBottom: 16,
  },
  errorText: {
    color: "#f87171",
    fontSize: 14,
    marginBottom: 12,
  },
  button: {
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    marginBottom: 12,
  },
  primaryButton: {
    backgroundColor: "#11d452",
  },
  primaryButtonText: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#000",
  },
  linkButton: {
    alignItems: "center",
    paddingVertical: 12,
  },
  linkText: {
    color: "#11d452",
    fontSize: 16,
  },
  backButton: {
    alignSelf: "center",
    paddingVertical: 12,
  },
  backButtonText: {
    color: "#94a3b8",
    fontSize: 16,
  },
  successBox: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  successTitle: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#11d452",
    marginBottom: 12,
  },
  successText: {
    fontSize: 16,
    color: "#94a3b8",
    textAlign: "center",
  },
});
