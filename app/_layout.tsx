// app/_layout.tsx - ROOT LAYOUT + AUTH + MULTIPLAYER
import { Stack } from "expo-router";
import { GameProvider } from "../context/gameContext";
import { AuthProvider } from "../context/AuthContext";

export default function RootLayout() {
  return (
    <AuthProvider>
      <GameProvider>
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
        </Stack>
      </GameProvider>
    </AuthProvider>
  );
}
