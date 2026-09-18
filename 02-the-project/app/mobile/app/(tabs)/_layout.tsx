import { Tabs } from "expo-router";
import { t } from "@/lib/theme";

/**
 * Three tabs. Not five.
 *
 * The phone does four things — reply, log an outcome, look up a fact,
 * know what is next. Reporting, settings, the pipeline board and listings
 * management all open the web app.
 *
 * Every competitor's mobile app has a tab bar full of things nobody taps,
 * because shipping a full CRM on a phone looks more complete in a demo.
 * It is worse to use.
 */
export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: t.accent,
        tabBarInactiveTintColor: t.ink3,
        tabBarStyle: { backgroundColor: t.ground, borderTopColor: t.rule },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Today" }} />
      <Tabs.Screen name="inbox" options={{ title: "Inbox" }} />
      <Tabs.Screen name="search" options={{ title: "Look up" }} />
    </Tabs>
  );
}
