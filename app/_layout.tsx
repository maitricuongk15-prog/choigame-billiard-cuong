// app/_layout.tsx - ROOT LAYOUT + AUTH + MULTIPLAYER
import { Stack } from "expo-router";
import { View } from "react-native";
import { GameProvider } from "../context/gameContext";
import { AuthProvider } from "../context/AuthContext";
import InviteNotifications from "../components/inviteNotifications";

export default function RootLayout() {
  return (
    <AuthProvider>
      <GameProvider>
        <View style={{ flex: 1 }}>
          <Stack>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen
              name="create-room"
              options={{
                headerShown: false,
                presentation: "card",
                animation: "slide_from_right",
              }}
            />
            <Stack.Screen
              name="waiting-room"
              options={{
                headerShown: false,
                presentation: "card",
                animation: "slide_from_right",
              }}
            />
            <Stack.Screen
              name="login"
              options={{
                headerShown: false,
                presentation: "modal",
                animation: "slide_from_bottom",
              }}
            />
            <Stack.Screen
              name="register"
              options={{
                headerShown: false,
                presentation: "modal",
                animation: "slide_from_bottom",
              }}
            />
            <Stack.Screen
              name="shop"
              options={{
                headerShown: false,
                presentation: "card",
                animation: "slide_from_right",
              }}
            />
            <Stack.Screen
              name="ranking"
              options={{
                headerShown: false,
                presentation: "card",
                animation: "slide_from_right",
              }}
            />
            <Stack.Screen
              name="friends"
              options={{
                headerShown: false,
                presentation: "card",
                animation: "slide_from_right",
              }}
            />
            <Stack.Screen
              name="download"
              options={{
                headerShown: false,
                presentation: "card",
                animation: "slide_from_right",
              }}
            />
          </Stack>
          <InviteNotifications />
        </View>
      </GameProvider>
    </AuthProvider>
  );
}
