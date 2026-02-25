import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import { useAuth } from "../context/AuthContext";
import { buyCue, equipCue, getMyCoins, listShopCues } from "../services/shopService";
import { getCueVisualTheme } from "../constants/cueVisuals";
import { getCueDescriptionVi, getCueNameVi } from "../constants/cueLocale";
import type { ShopCue } from "../types/cue";
import { getErrorMessage, isInsufficientCoinsError } from "../utils/errorMessage";

export default function ShopScreen() {
  const { user } = useAuth();
  const [coins, setCoins] = useState<number>(0);
  const [cues, setCues] = useState<ShopCue[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingSlug, setProcessingSlug] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: "error" | "success"; message: string } | null>(null);

  const loadShopData = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const [coinsRes, cuesRes] = await Promise.all([getMyCoins(), listShopCues()]);
    if (coinsRes.error) {
      setNotice({ type: "error", message: getErrorMessage(coinsRes.error) });
    } else {
      setCoins(coinsRes.coins);
    }

    if (cuesRes.error) {
      setNotice({ type: "error", message: getErrorMessage(cuesRes.error) });
      setCues([]);
    } else {
      setCues(cuesRes.cues);
    }

    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (!user) {
      router.replace({ pathname: "/login", params: { redirect: "/shop" } });
      return;
    }
    void loadShopData();
  }, [user, loadShopData]);

  const handleBuyCue = async (cue: ShopCue) => {
    setProcessingSlug(cue.slug);
    const { coins: nextCoins, error } = await buyCue(cue.slug);
    setProcessingSlug(null);

    if (error) {
      if (isInsufficientCoinsError(error)) {
        setNotice({ type: "error", message: "Không đủ xu để mua gậy này." });
        return;
      }
      setNotice({ type: "error", message: getErrorMessage(error) });
      return;
    }

    setCoins(nextCoins);
    setNotice({ type: "success", message: "Mua gậy thành công." });
    await loadShopData();
  };

  const handleEquipCue = async (cue: ShopCue) => {
    setProcessingSlug(cue.slug);
    const { error } = await equipCue(cue.slug);
    setProcessingSlug(null);

    if (error) {
      setNotice({ type: "error", message: getErrorMessage(error) });
      return;
    }

    setNotice({ type: "success", message: "Trang bị gậy thành công." });
    await loadShopData();
  };

  const renderActionButton = (cue: ShopCue) => {
    const isBusy = processingSlug === cue.slug;
    const disabled = cue.equipped || isBusy;
    const onPress = cue.owned ? () => handleEquipCue(cue) : () => handleBuyCue(cue);

    return (
      <TouchableOpacity
        style={[
          styles.actionButton,
          cue.equipped && styles.actionButtonEquipped,
          !cue.owned && styles.actionButtonBuy,
          disabled && styles.actionButtonDisabled,
        ]}
        onPress={onPress}
        disabled={disabled}
      >
        {isBusy ? (
          <ActivityIndicator color="#000" />
        ) : (
          <Text style={styles.actionButtonText}>
            {cue.equipped
              ? "Đã trang bị"
              : cue.owned
                ? "Trang bị"
                : `Mua ${cue.price.toLocaleString("vi-VN")} xu`}
          </Text>
        )}
      </TouchableOpacity>
    );
  };

  const renderCuePreview = (cue: ShopCue) => {
    const theme = getCueVisualTheme(cue);
    return (
      <View style={styles.previewWrap}>
        <View style={[styles.previewCueBody, { borderColor: theme.outlineColor }]}>
          <View style={[styles.previewSegmentTip, { backgroundColor: theme.tipColor }]} />
          <View
            style={[styles.previewSegmentFerrule, { backgroundColor: theme.ferruleColor }]}
          />
          <View style={[styles.previewSegmentMain, { backgroundColor: theme.bodyColor }]}>
            <View
              style={[
                styles.previewAccent,
                {
                  backgroundColor: theme.accentColor,
                  borderStyle: theme.accentDash === "0,0" ? "solid" : "dashed",
                },
              ]}
            />
          </View>
          <View style={[styles.previewSegmentWrap, { backgroundColor: theme.wrapColor }]} />
          <View style={[styles.previewSegmentButt, { backgroundColor: theme.buttColor }]} />
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>{"<"}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Cửa hàng gậy</Text>
        <View style={styles.coinBox}>
          <Text style={styles.coinText}>XU {coins.toLocaleString("vi-VN")}</Text>
        </View>
      </View>
      {notice ? (
        <View
          style={[
            styles.noticeBox,
            notice.type === "error" ? styles.noticeBoxError : styles.noticeBoxSuccess,
          ]}
        >
          <Text style={styles.noticeText}>{notice.message}</Text>
        </View>
      ) : null}

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color="#11d452" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {cues.map((cue) => (
            <View key={cue.id} style={[styles.card, cue.equipped && styles.cardEquipped]}>
              <View style={styles.cardHeader}>
                <View>
                  <Text style={styles.cueName}>{getCueNameVi(cue)}</Text>
                  <Text style={styles.cueDesc}>{getCueDescriptionVi(cue)}</Text>
                </View>
                <View style={[styles.colorDot, { backgroundColor: cue.color }]} />
              </View>

              {renderCuePreview(cue)}

              <View style={styles.statsGrid}>
                <Text style={styles.stat}>Lực: {cue.force}</Text>
                <Text style={styles.stat}>Ngắm: {cue.aim}</Text>
                <Text style={styles.stat}>Xoáy: {cue.spin}</Text>
                <Text style={styles.stat}>Kiểm soát: {cue.control}</Text>
              </View>

              {renderActionButton(cue)}
            </View>
          ))}
        </ScrollView>
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
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#1c3024",
    alignItems: "center",
    justifyContent: "center",
  },
  backButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },
  headerTitle: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "bold",
  },
  coinBox: {
    backgroundColor: "#0f172a",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#2a4535",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  coinText: {
    color: "#facc15",
    fontSize: 12,
    fontWeight: "bold",
  },
  noticeBox: {
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 4,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  noticeBoxError: {
    backgroundColor: "rgba(239,68,68,0.15)",
    borderColor: "rgba(239,68,68,0.45)",
  },
  noticeBoxSuccess: {
    backgroundColor: "rgba(17,212,82,0.15)",
    borderColor: "rgba(17,212,82,0.45)",
  },
  noticeText: {
    color: "#e2e8f0",
    fontSize: 13,
    fontWeight: "600",
  },
  loadingBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    padding: 16,
    gap: 12,
  },
  card: {
    backgroundColor: "#1a3524",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#2a4535",
    padding: 16,
  },
  cardEquipped: {
    borderColor: "#11d452",
    backgroundColor: "rgba(17,212,82,0.1)",
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  cueName: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "bold",
  },
  cueDesc: {
    color: "#94a3b8",
    fontSize: 12,
    marginTop: 2,
  },
  colorDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
  },
  previewWrap: {
    marginBottom: 12,
    paddingVertical: 6,
  },
  previewCueBody: {
    height: 14,
    borderRadius: 999,
    borderWidth: 1,
    overflow: "hidden",
    flexDirection: "row",
    alignItems: "stretch",
  },
  previewSegmentTip: {
    width: 10,
  },
  previewSegmentFerrule: {
    width: 12,
  },
  previewSegmentMain: {
    flex: 1,
    justifyContent: "center",
  },
  previewAccent: {
    height: 2,
    marginHorizontal: 6,
    borderWidth: 0.4,
    borderColor: "rgba(255,255,255,0.35)",
  },
  previewSegmentWrap: {
    width: 48,
  },
  previewSegmentButt: {
    width: 20,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  stat: {
    color: "#cbd5e1",
    fontSize: 13,
    backgroundColor: "#0f172a",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  actionButton: {
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 12,
    backgroundColor: "#11d452",
  },
  actionButtonBuy: {
    backgroundColor: "#11d452",
  },
  actionButtonEquipped: {
    backgroundColor: "#64748b",
  },
  actionButtonDisabled: {
    opacity: 0.85,
  },
  actionButtonText: {
    color: "#000",
    fontSize: 14,
    fontWeight: "bold",
  },
});

