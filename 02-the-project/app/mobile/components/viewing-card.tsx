import { View, Text, Pressable, StyleSheet } from "react-native";
import { directionsUrl, dial, open, apart } from "@/lib/contact";
import { t } from "@/lib/theme";

/**
 * A viewing on a phone.
 *
 * This is the version that matters. The desktop card is for a manager
 * looking at a day; this is for an agent in a car with one thumb, and
 * every decision follows from that.
 *
 * **Building name is the largest thing on the card.** Not the buyer's
 * name, not the time — the building, because that is what an agent
 * glances at while driving and Marina has six towers with nearly the
 * same name.
 */
export function ViewingCard({
  viewing,
  previous,
}: {
  viewing: {
    id: string; scheduledAt: string; durationMins: number;
    leadName: string | null; leadPhone: string | null;
    building: string | null; address: string | null;
    lat: number | null; lng: number | null; accessNote: string | null;
  };
  previous?: { lat: number | null; lng: number | null; scheduledAt: string } | null;
}) {
  const at = new Date(viewing.scheduledAt);
  const map = directionsUrl(viewing);
  const tel = dial(viewing.leadPhone);

  const km = previous ? apart(previous, viewing) : null;
  const gap = previous
    ? Math.round((at.getTime() - new Date(previous.scheduledAt).getTime()) / 60_000)
    : null;
  // Deliberately pessimistic. Dubai traffic is not 60km/h and an agent
  // told "you're fine" who then isn't will stop trusting the warning.
  const tight = km != null && gap != null && (km / 25) * 60 > gap - 30;

  return (
    <View style={s.card}>
      <View style={s.head}>
        <Text style={s.time}>{fmt(at)}</Text>
        <Text style={s.dur}>{viewing.durationMins}m</Text>
      </View>

      <Text style={s.building}>{viewing.building ?? "Location not set"}</Text>
      {viewing.address && <Text style={s.address}>{viewing.address}</Text>}
      <Text style={s.who}>{viewing.leadName ?? viewing.leadPhone ?? "Buyer"}</Text>

      {viewing.accessNote && <Text style={s.note}>{viewing.accessNote}</Text>}

      {tight && (
        <Text style={s.tight} accessibilityRole="alert">
          {km}km from your last one, {gap} minutes apart. That&rsquo;s tight.
        </Text>
      )}

      <View style={s.actions}>
        {map && (
          <Pressable
            style={[s.btn, s.go]}
            onPress={() => void open(map, `https://maps.google.com/?q=${encodeURIComponent(
              [viewing.building, viewing.address].filter(Boolean).join(", ") + ", Dubai")}`)}
            accessibilityRole="button"
            accessibilityLabel="Directions to this viewing"
          >
            <Text style={s.goLabel}>Directions</Text>
          </Pressable>
        )}
        {tel && (
          <Pressable
            style={[s.btn, s.quiet]}
            onPress={() => void open(tel)}
            accessibilityRole="button"
            accessibilityLabel={`Call ${viewing.leadName ?? "the buyer"}`}
          >
            <Text style={s.quietLabel}>Call</Text>
          </Pressable>
        )}
      </View>

      {!map && (
        <Text style={s.missing}>
          No address on this one. Worth adding before you set off.
        </Text>
      )}
    </View>
  );
}

const fmt = (d: Date) =>
  new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit", minute: "2-digit", timeZone: "Asia/Dubai",
  }).format(d);

const s = StyleSheet.create({
  card: { paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: t.rule },
  head: { flexDirection: "row", alignItems: "baseline", marginBottom: 6 },
  time: { color: t.ink, fontSize: 17, fontWeight: "700", fontVariant: ["tabular-nums"] },
  dur: { color: t.ink3, fontSize: 12, marginLeft: "auto" },
  // The largest thing on the card, on purpose.
  building: { color: t.ink, fontSize: 21, fontWeight: "600", letterSpacing: -0.4, lineHeight: 26 },
  address: { color: t.ink2, fontSize: 15, marginTop: 2 },
  who: { color: t.ink2, fontSize: 15, marginTop: 6 },
  note: { color: t.ink2, fontSize: 14, lineHeight: 20, marginTop: 10,
    paddingLeft: 12, borderLeftWidth: 2, borderLeftColor: t.rule },
  tight: { color: t.danger, fontSize: 14, fontWeight: "500", marginTop: 10 },
  actions: { flexDirection: "row", gap: 10, marginTop: 14 },
  // 52pt. Above the minimum because this is pressed one-handed, often
  // while walking, sometimes in a hurry.
  btn: { minHeight: 52, borderRadius: 26, flex: 1, alignItems: "center", justifyContent: "center" },
  go: { backgroundColor: t.accent },
  goLabel: { color: t.onAccent, fontWeight: "600", fontSize: 16 },
  quiet: { borderWidth: 1, borderColor: t.rule },
  quietLabel: { color: t.ink, fontWeight: "500", fontSize: 16 },
  missing: { color: t.ink3, fontSize: 13, marginTop: 10 },
});
