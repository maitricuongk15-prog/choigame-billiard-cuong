// app/gameResultScreen.tsx - ĐÚNG VỊ TRÍ ROOT LEVEL
import React, { useEffect, useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Modal,
  Animated,
  Dimensions,
} from "react-native";

interface GameResultProps {
  visible: boolean;
  winner: {
    id: number;
    name: string;
    score: number;
    avatar: string;
    totalBallsPocketed: number;
  };
  loser: {
    id: number;
    name: string;
    score: number;
    avatar: string;
    totalBallsPocketed: number;
  };
  gameStats: {
    totalTurns: number;
    duration: string;
    winReason: "normal" | "forfeit" | "ball8_early" | "ball8_win";
  };
  onBackToLobby: () => void;
  onExit: () => void;
}

export default function GameResultScreen({
  visible,
  winner,
  loser,
  gameStats,
  onBackToLobby,
  onExit,
}: GameResultProps) {
  const [fadeAnim] = useState(new Animated.Value(0));
  const [scaleAnim] = useState(new Animated.Value(0.8));
  const [slideAnim] = useState(new Animated.Value(50));

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          tension: 50,
          friction: 7,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      fadeAnim.setValue(0);
      scaleAnim.setValue(0.8);
      slideAnim.setValue(50);
    }
  }, [visible]);

  const getWinReasonText = () => {
    switch (gameStats.winReason) {
      case "forfeit":
        return `${loser.name} đã rời bàn!`;
      case "ball8_early":
        return `${loser.name} đánh bi 8 quá sớm!`;
      case "ball8_win":
        return "Hoàn thành xuất sắc!";
      default:
        return "Chiến thắng xứng đáng!";
    }
  };

  const getWinReasonIcon = () => {
    switch (gameStats.winReason) {
      case "forfeit":
        return "🚪";
      case "ball8_early":
        return "💀";
      case "ball8_win":
        return "🎯";
      default:
        return "🏆";
    }
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="none"
      onRequestClose={onBackToLobby}
    >
      <Animated.View
        style={[
          styles.overlay,
          {
            opacity: fadeAnim,
          },
        ]}
      >
        <Animated.View
          style={[
            styles.container,
            {
              transform: [{ scale: scaleAnim }, { translateY: slideAnim }],
            },
          ]}
        >
          {/* Background Pattern */}
          <View style={styles.backgroundPattern} />

          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity style={styles.closeButton} onPress={onExit}>
              <Text style={styles.closeIcon}>✕</Text>
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Kết quả trận đấu</Text>
            <View style={styles.closeButton} />
          </View>

          {/* Content */}
          <View style={styles.content}>
            {/* Trophy Icon */}
            <View style={styles.trophyContainer}>
              <View style={styles.glowEffect} />
              <Text style={styles.trophyIcon}>🏆</Text>
            </View>

            {/* Winner Announcement */}
            <Text style={styles.victoryText}>
              {winner.id === 1 ? "BẠN ĐÃ THẮNG!" : `${winner.name} THẮNG!`}
            </Text>
            <Text style={styles.reasonText}>
              {getWinReasonIcon()} {getWinReasonText()}
            </Text>

            {/* Winner Profile */}
            <View style={styles.winnerProfile}>
              <View style={styles.avatarGlow} />
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{winner.avatar}</Text>
              </View>
              <View style={styles.winnerBadge}>
                <Text style={styles.winnerBadgeText}>WINNER</Text>
              </View>
            </View>

            <Text style={styles.winnerName}>{winner.name}</Text>
            <Text style={styles.rewardText}>+150 Điểm thưởng</Text>

            {/* Scoreboard */}
            <View style={styles.scoreboard}>
              <View style={styles.scoreboardContent}>
                {/* Player 1 */}
                <View style={styles.playerColumn}>
                  <View
                    style={[
                      styles.playerAvatar,
                      winner.id === 1 && styles.winnerAvatar,
                    ]}
                  >
                    <Text style={styles.playerAvatarText}>{winner.avatar}</Text>
                  </View>
                  <Text
                    style={[
                      styles.playerName,
                      winner.id === 1 && styles.winnerPlayerName,
                    ]}
                  >
                    {winner.id === 1 ? "Bạn" : winner.name}
                  </Text>
                </View>

                {/* Score */}
                <View style={styles.scoreContainer}>
                  <View style={styles.scoreRow}>
                    <Text style={styles.scoreWinner}>{winner.score}</Text>
                    <Text style={styles.scoreDivider}>-</Text>
                    <Text style={styles.scoreLoser}>{loser.score}</Text>
                  </View>
                  <Text style={styles.scoreLabel}>Tỉ số chung cuộc</Text>
                </View>

                {/* Player 2 */}
                <View style={styles.playerColumn}>
                  <View
                    style={[
                      styles.playerAvatar,
                      winner.id === 2 && styles.winnerAvatar,
                      loser.id === 1 && styles.loserAvatar,
                    ]}
                  >
                    <Text style={styles.playerAvatarText}>{loser.avatar}</Text>
                  </View>
                  <Text
                    style={[
                      styles.playerName,
                      loser.id === 1 && styles.loserPlayerName,
                    ]}
                  >
                    {loser.id === 1 ? "Bạn" : loser.name}
                  </Text>
                </View>
              </View>

              {/* Stats */}
              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Text style={styles.statLabel}>Bi vào lỗ</Text>
                  <Text style={styles.statValue}>
                    {winner.totalBallsPocketed} - {loser.totalBallsPocketed}
                  </Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statLabel}>Thời gian</Text>
                  <Text style={styles.statValue}>{gameStats.duration}</Text>
                </View>
              </View>
            </View>

            {/* Rank Up Banner (if applicable) */}
            {gameStats.winReason !== "forfeit" && winner.id === 1 && (
              <View style={styles.rankUpBanner}>
                <View style={styles.rankUpIcon}>
                  <Text style={styles.rankUpIconText}>📈</Text>
                </View>
                <View style={styles.rankUpText}>
                  <Text style={styles.rankUpTitle}>Thăng hạng!</Text>
                  <Text style={styles.rankUpSubtitle}>
                    Bạn đã đạt hạng Chuyên Nghiệp II
                  </Text>
                </View>
              </View>
            )}
          </View>

          {/* Footer Actions */}
          <View style={styles.footer}>
            <View style={styles.secondaryButtons}>
              <TouchableOpacity
                style={styles.lobbyButton}
                onPress={onBackToLobby}
              >
                <Text style={styles.lobbyIcon}>🏠</Text>
                <Text style={styles.lobbyText}>Về Phòng Chờ</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.exitButton} onPress={onExit}>
                <Text style={styles.exitIcon}>🚪</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.85)",
    justifyContent: "center",
    alignItems: "center",
  },
  container: {
    width: "90%",
    maxWidth: 400,
    maxHeight: "90%",
    backgroundColor: "#102216",
    borderRadius: 24,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  backgroundPattern: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.1,
    backgroundColor: "transparent",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.05)",
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  closeIcon: {
    fontSize: 20,
    color: "rgba(255, 255, 255, 0.5)",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#fff",
  },
  content: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 8,
  },
  trophyContainer: {
    position: "relative",
    marginBottom: 16,
  },
  glowEffect: {
    position: "absolute",
    top: "50%",
    left: "50%",
    width: 80,
    height: 80,
    backgroundColor: "rgba(17, 212, 82, 0.2)",
    borderRadius: 40,
    transform: [{ translateX: -40 }, { translateY: -40 }],
    opacity: 0.5,
  },
  trophyIcon: {
    fontSize: 64,
  },
  victoryText: {
    fontSize: 32,
    fontWeight: "900",
    color: "#11d452",
    textAlign: "center",
    marginBottom: 8,
    textShadowColor: "rgba(17, 212, 82, 0.5)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 20,
  },
  reasonText: {
    fontSize: 14,
    color: "rgba(255, 255, 255, 0.6)",
    marginBottom: 24,
    textAlign: "center",
  },
  winnerProfile: {
    position: "relative",
    marginBottom: 12,
  },
  avatarGlow: {
    position: "absolute",
    top: "50%",
    left: "50%",
    width: 140,
    height: 140,
    backgroundColor: "rgba(17, 212, 82, 0.15)",
    borderRadius: 70,
    transform: [{ translateX: -70 }, { translateY: -70 }],
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "#1a3524",
    borderWidth: 4,
    borderColor: "#11d452",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#11d452",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
  },
  avatarText: {
    fontSize: 48,
  },
  winnerBadge: {
    position: "absolute",
    bottom: -12,
    left: "50%",
    transform: [{ translateX: -35 }],
    backgroundColor: "#11d452",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#102216",
  },
  winnerBadgeText: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#000",
  },
  winnerName: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#fff",
    marginTop: 8,
    marginBottom: 4,
  },
  rewardText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#11d452",
    marginBottom: 24,
  },
  scoreboard: {
    width: "100%",
    backgroundColor: "rgba(26, 53, 36, 0.5)",
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  scoreboardContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  playerColumn: {
    flex: 1,
    alignItems: "center",
    gap: 8,
  },
  playerAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#1a3524",
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  winnerAvatar: {
    borderColor: "#11d452",
    borderWidth: 3,
  },
  loserAvatar: {
    opacity: 0.6,
  },
  playerAvatarText: {
    fontSize: 24,
  },
  playerName: {
    fontSize: 12,
    fontWeight: "600",
    color: "rgba(255, 255, 255, 0.7)",
  },
  winnerPlayerName: {
    color: "#fff",
    fontWeight: "bold",
  },
  loserPlayerName: {
    color: "rgba(255, 255, 255, 0.5)",
  },
  scoreContainer: {
    flex: 1.5,
    alignItems: "center",
  },
  scoreRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  scoreWinner: {
    fontSize: 40,
    fontWeight: "900",
    color: "#11d452",
  },
  scoreDivider: {
    fontSize: 24,
    color: "rgba(255, 255, 255, 0.2)",
  },
  scoreLoser: {
    fontSize: 40,
    fontWeight: "900",
    color: "rgba(255, 255, 255, 0.4)",
  },
  scoreLabel: {
    fontSize: 10,
    color: "rgba(255, 255, 255, 0.4)",
    marginTop: 4,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  statsRow: {
    flexDirection: "row",
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.1)",
    gap: 12,
  },
  statItem: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  statLabel: {
    fontSize: 11,
    color: "rgba(255, 255, 255, 0.4)",
  },
  statValue: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#fff",
  },
  rankUpBanner: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(17, 212, 82, 0.1)",
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(17, 212, 82, 0.2)",
    gap: 12,
  },
  rankUpIcon: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: "rgba(17, 212, 82, 0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  rankUpIconText: {
    fontSize: 20,
  },
  rankUpText: {
    flex: 1,
  },
  rankUpTitle: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 2,
  },
  rankUpSubtitle: {
    fontSize: 11,
    color: "rgba(255, 255, 255, 0.6)",
  },
  footer: {
    padding: 24,
    paddingBottom: 32,
    backgroundColor: "rgba(16, 34, 22, 0.9)",
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.05)",
    gap: 12,
  },
  secondaryButtons: {
    flexDirection: "row",
    gap: 12,
  },
  lobbyButton: {
    flex: 1,
    height: 48,
    flexDirection: "row",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  lobbyIcon: {
    fontSize: 18,
  },
  lobbyText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
  },
  exitButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(244, 67, 54, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(244, 67, 54, 0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  exitIcon: {
    fontSize: 20,
  },
});
