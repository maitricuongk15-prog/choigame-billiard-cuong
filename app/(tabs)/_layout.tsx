// app/(tabs)/_layout.tsx - CLEANED CODE
import { Tabs } from "expo-router";
import React from "react";
import { View, Text } from "react-native";

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: "#11d452",
        headerShown: false,
        tabBarStyle: {
          display: "none", // ✅ Ẩn hoàn toàn tab bar
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          href: null, // ✅ Ẩn khỏi navigation
        }}
      />

      <Tabs.Screen
        name="explore"
        options={{
          href: null, // ✅ Ẩn khỏi navigation
        }}
      />
    </Tabs>
  );
}
