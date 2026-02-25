import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import {
  getCoinLeaderboard,
  type CoinRankingPlayer,
} from "../services/rankingService";
import { getAvatarEmoji, normalizeAvatarUrl } from "../utils/avatar";

export default function RankingScreen() {
  const [players, setPlayers] = useState<CoinRankingPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadRanking = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { players: list, error: err } = await getCoinLeaderboard(100);
    if (err) {
      setError(err.message || "Không thể tải bảng xếp hạng");
      setPlayers([]);
    } else {
      setPlayers(list);
    }
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadRanking();
    }, [loadRanking])
  );

  const renderRankBadge = (rank: number) => {
    if (rank === 1) return "🥇";
    if (rank === 2) return "🥈";
    if (rank === 3) return "🥉";
    return `#${rank}`;
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Xếp Hạng Xu</Text>
        <TouchableOpacity style={styles.refreshButton} onPress={() => void loadRanking()}>
          <Text style={styles.refreshButtonText}>Làm mới</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color="#11d452" />
          <Text style={styles.loadingText}>Đang tải bảng xếp hạng...</Text>
        </View>
      ) : error ? (
        <View style={styles.centerBox}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => void loadRanking()}>
            <Text style={styles.retryText}>Thử lại</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={players}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item, index }) => {
            const rank = index + 1;
            const avatarUrl = normalizeAvatarUrl(item.avatarUrl);
            const avatarEmoji = getAvatarEmoji(`${item.id}:${item.displayName}`);
            return (
              <View style={styles.row}>
                <View style={styles.rankBox}>
                  <Text style={styles.rankText}>{renderRankBadge(rank)}</Text>
                </View>
                <View style={styles.avatarBox}>
                  {avatarUrl ? (
                    <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
                  ) : (
                    <Text style={styles.avatarEmoji}>{avatarEmoji}</Text>
                  )}
                </View>
                <View style={styles.playerBox}>
                  <Text style={styles.playerName}>{item.displayName}</Text>
                  <Text style={styles.playerSub}>Hạng {rank}</Text>
                </View>
                <View style={styles.coinBox}>
                  <Text style={styles.coinText}>
                    {item.coins.toLocaleString("vi-VN")} xu
                  </Text>
                </View>
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={styles.centerBox}>
              <Text style={styles.loadingText}>Chưa có dữ liệu xếp hạng.</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#102216",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  backButtonText: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "700",
  },
  title: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "800",
  },
  refreshButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(17, 212, 82, 0.18)",
    borderWidth: 1,
    borderColor: "rgba(17, 212, 82, 0.45)",
  },
  refreshButtonText: {
    color: "#bbf7d0",
    fontSize: 12,
    fontWeight: "700",
  },
  listContent: {
    padding: 16,
    gap: 10,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1a3524",
    borderWidth: 1,
    borderColor: "#2a4535",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  rankBox: {
    width: 56,
    alignItems: "center",
    justifyContent: "center",
  },
  rankText: {
    color: "#facc15",
    fontSize: 18,
    fontWeight: "800",
  },
  avatarBox: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#1f2937",
    borderWidth: 2,
    borderColor: "#11d452",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    marginRight: 10,
  },
  avatarImage: {
    width: "100%",
    height: "100%",
  },
  avatarEmoji: {
    fontSize: 26,
  },
  playerBox: {
    flex: 1,
  },
  playerName: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  playerSub: {
    color: "#94a3b8",
    fontSize: 12,
    marginTop: 2,
  },
  coinBox: {
    minWidth: 110,
    alignItems: "flex-end",
  },
  coinText: {
    color: "#facc15",
    fontSize: 14,
    fontWeight: "800",
  },
  centerBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  loadingText: {
    color: "#cbd5e1",
    marginTop: 12,
    fontSize: 14,
  },
  errorText: {
    color: "#f87171",
    fontSize: 14,
    textAlign: "center",
    marginBottom: 12,
  },
  retryButton: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: "#11d452",
  },
  retryText: {
    color: "#000",
    fontWeight: "700",
  },
});
