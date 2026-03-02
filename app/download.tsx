import React from "react";
import {
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import { apkReleases } from "../data/apkReleases";

function formatReleaseDate(dateString: string): string {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString;
  return date.toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

async function openExternalUrl(url: string) {
  const supported = await Linking.canOpenURL(url);
  if (!supported) return;
  await Linking.openURL(url);
}

export default function DownloadPage() {
  const latest = apkReleases[0];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.push("/")}>
          <Text style={styles.backButtonText}>← Về lobby</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Trang tải APK</Text>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentInner}>
        <View style={styles.heroCard}>
          <Text style={styles.heroEyebrow}>BILLIARD GAME MOBILE</Text>
          <Text style={styles.heroTitle}>Pool Multiplayer Việt Nam</Text>
          <Text style={styles.heroDesc}>
            Trò chơi bi-a online với tạo phòng, đặt cược xu, cửa hàng gậy và nhiệm vụ hằng ngày.
            Tải trực tiếp file APK mới nhất bên dưới.
          </Text>

          <View style={styles.heroStats}>
            <View style={styles.heroStatItem}>
              <Text style={styles.heroStatLabel}>Phiên bản mới nhất</Text>
              <Text style={styles.heroStatValue}>v{latest.version}</Text>
            </View>
            <View style={styles.heroStatItem}>
              <Text style={styles.heroStatLabel}>Kích thước</Text>
              <Text style={styles.heroStatValue}>{latest.sizeMb.toLocaleString("vi-VN")} MB</Text>
            </View>
            <View style={styles.heroStatItem}>
              <Text style={styles.heroStatLabel}>Yêu cầu</Text>
              <Text style={styles.heroStatValue}>{latest.minAndroid}</Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => void openExternalUrl(latest.apkUrl)}
          >
            <Text style={styles.primaryButtonText}>Tải APK mới nhất</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Lịch sử phiên bản</Text>
          <Text style={styles.sectionHint}>{apkReleases.length} bản phát hành</Text>
        </View>

        {apkReleases.map((release, index) => (
          <View key={`${release.version}-${release.buildNumber}`} style={styles.versionCard}>
            <View style={styles.versionTopRow}>
              <View>
                <Text style={styles.versionTitle}>
                  v{release.version} (build {release.buildNumber})
                </Text>
                <Text style={styles.versionDate}>
                  Phát hành: {formatReleaseDate(release.releaseDate)}
                </Text>
              </View>
              {index === 0 ? (
                <View style={styles.latestBadge}>
                  <Text style={styles.latestBadgeText}>Mới nhất</Text>
                </View>
              ) : null}
            </View>

            <Text style={styles.versionMeta}>
              {release.sizeMb.toLocaleString("vi-VN")} MB • {release.minAndroid}
            </Text>

            <View style={styles.noteList}>
              {release.notes.map((note) => (
                <Text key={note} style={styles.noteItem}>
                  • {note}
                </Text>
              ))}
            </View>

            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => void openExternalUrl(release.apkUrl)}
            >
              <Text style={styles.secondaryButtonText}>Tải bản này</Text>
            </TouchableOpacity>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0b1720",
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(148,163,184,0.2)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#102216",
  },
  backButton: {
    backgroundColor: "rgba(17,212,82,0.18)",
    borderWidth: 1,
    borderColor: "rgba(17,212,82,0.45)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  backButtonText: {
    color: "#bbf7d0",
    fontSize: 13,
    fontWeight: "700",
  },
  headerTitle: {
    color: "#f8fafc",
    fontSize: 18,
    fontWeight: "800",
  },
  content: {
    flex: 1,
  },
  contentInner: {
    padding: 16,
    gap: 14,
  },
  heroCard: {
    backgroundColor: "#102216",
    borderWidth: 1,
    borderColor: "rgba(17,212,82,0.35)",
    borderRadius: 18,
    padding: 16,
  },
  heroEyebrow: {
    color: "#22d3ee",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1,
    marginBottom: 6,
  },
  heroTitle: {
    color: "#f8fafc",
    fontSize: 26,
    fontWeight: "800",
    marginBottom: 6,
  },
  heroDesc: {
    color: "#cbd5e1",
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 14,
  },
  heroStats: {
    gap: 8,
    marginBottom: 14,
  },
  heroStatItem: {
    backgroundColor: "#0b1720",
    borderWidth: 1,
    borderColor: "#1e293b",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  heroStatLabel: {
    color: "#94a3b8",
    fontSize: 12,
  },
  heroStatValue: {
    color: "#f8fafc",
    fontSize: 14,
    fontWeight: "700",
  },
  primaryButton: {
    backgroundColor: "#11d452",
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#03210d",
    fontSize: 15,
    fontWeight: "800",
  },
  sectionHeader: {
    marginTop: 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 2,
  },
  sectionTitle: {
    color: "#f8fafc",
    fontSize: 18,
    fontWeight: "800",
  },
  sectionHint: {
    color: "#94a3b8",
    fontSize: 12,
    fontWeight: "600",
  },
  versionCard: {
    backgroundColor: "#111827",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 14,
    padding: 12,
    gap: 8,
  },
  versionTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  versionTitle: {
    color: "#f8fafc",
    fontSize: 16,
    fontWeight: "800",
  },
  versionDate: {
    color: "#94a3b8",
    fontSize: 12,
  },
  latestBadge: {
    backgroundColor: "rgba(17,212,82,0.2)",
    borderWidth: 1,
    borderColor: "rgba(17,212,82,0.45)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  latestBadgeText: {
    color: "#86efac",
    fontSize: 11,
    fontWeight: "700",
  },
  versionMeta: {
    color: "#facc15",
    fontSize: 12,
    fontWeight: "700",
  },
  noteList: {
    gap: 4,
  },
  noteItem: {
    color: "#e2e8f0",
    fontSize: 13,
    lineHeight: 18,
  },
  secondaryButton: {
    marginTop: 4,
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#22c55e",
    backgroundColor: "rgba(34,197,94,0.16)",
  },
  secondaryButtonText: {
    color: "#bbf7d0",
    fontSize: 12,
    fontWeight: "700",
  },
});

