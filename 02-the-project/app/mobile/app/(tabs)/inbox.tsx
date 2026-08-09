import { useState } from "react";
import { View, Text, FlatList, Pressable, StyleSheet } from "react-native";
import { router } from "expo-router";
import { t } from "@/lib/theme";

type Row = {
  id: string;
  name: string;
  last: string;
  at: string;
  windowOpen: boolean;
  hoursLeft: number | null;
  waiting: boolean;
  unread: number;
};

/**
 * The inbox.
 *
 * Deliberately thin. Most replies happen from a notification without
 * this screen opening, so its job is not to be a great inbox — it is to
 * be the place an agent goes when they want to catch up on their own
 * terms rather than being interrupted.
 *
 * **Every row shows the window state**, because a closed conversation
 * cannot be answered normally and an agent needs to know that before
 * they tap in and start typing, not after.
 */
export default function Inbox() {
  const [filter, setFilter] = useState<"waiting" | "all">("waiting");
  const rows: Row[] = [];

  return (
    <View style={s.screen}>
      <View style={s.filters}>
        {(["waiting", "all"] as const).map((f) => (
          <Pressable key={f} onPress={() => setFilter(f)} style={s.filter}
                     accessibilityRole="button"
                     accessibilityState={{ selected: filter === f }}>
            <Text style={[s.filterLabel, filter === f && s.filterOn]}>
              {f === "waiting" ? "Waiting on you" : "All"}
            </Text>
          </Pressable>
        ))}
      </View>

      <FlatList
        data={rows}
        keyExtractor={(r) => r.id}
        ListEmptyComponent={
          <View style={s.empty}>
            <Text style={s.emptyTitle}>
              {filter === "waiting" ? "Nobody is waiting." : "Nothing here yet."}
            </Text>
            {/* Says what will happen, not just that there is nothing. An
                empty inbox on day one should not look broken. */}
            <Text style={s.emptyBody}>
              New enquiries arrive as a notification you can reply to without opening this.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable style={s.row} onPress={() => router.push(`/conversation/${item.id}` as never)}>
            <View style={s.rowHead}>
              {item.unread > 0 && <View style={s.dot} />}
              <Text style={s.name}>{item.name}</Text>
              <Text style={s.time}>{item.at}</Text>
            </View>
            <Text style={s.last} numberOfLines={1}>{item.last}</Text>
            <View style={s.tags}>
              {item.waiting && <Tag urgent>Waiting on you</Tag>}
              <Tag dashed={!item.windowOpen}>
                {item.windowOpen ? `Window ${item.hoursLeft}h` : "Window closed"}
              </Tag>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

function Tag({ children, urgent, dashed }: { children: React.ReactNode; urgent?: boolean; dashed?: boolean }) {
  return (
    <View style={[s.tag, urgent && s.tagUrgent, dashed && s.tagDashed]}>
      <Text style={[s.tagLabel, urgent && s.tagLabelUrgent]}>{children}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.ground },
  filters: { flexDirection: "row", gap: 20, paddingHorizontal: 20, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: t.rule },
  filter: { minHeight: 44, justifyContent: "center" },
  filterLabel: { color: t.ink3, fontSize: 14, fontWeight: "500" },
  filterOn: { color: t.accent, fontWeight: "600" },

  row: { paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: t.rule },
  rowHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: t.accent },
  name: { color: t.ink, fontSize: 16, fontWeight: "600", flex: 1 },
  time: { color: t.ink3, fontSize: 12 },
  last: { color: t.ink2, fontSize: 14, marginTop: 4 },
  tags: { flexDirection: "row", gap: 8, marginTop: 8 },
  tag: { borderWidth: 1, borderColor: t.rule, borderRadius: 4, paddingHorizontal: 7, paddingVertical: 2 },
  tagUrgent: { borderColor: t.accent },
  tagDashed: { borderStyle: "dashed" },
  tagLabel: { color: t.ink3, fontSize: 10, letterSpacing: 0.6, textTransform: "uppercase" },
  tagLabelUrgent: { color: t.accent, fontWeight: "600" },

  empty: { padding: 32, alignItems: "center" },
  emptyTitle: { color: t.ink, fontSize: 18, fontWeight: "600" },
  emptyBody: { color: t.ink2, fontSize: 15, lineHeight: 22, textAlign: "center", marginTop: 8, maxWidth: 280 },
});
