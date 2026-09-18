import { View, Text, Pressable, StyleSheet } from "react-native";
import { t } from "@/lib/theme";

/**
 * When a queued change collided with somebody else's.
 *
 * `CONFLICT_POLICY` said `ask` for a stage change and nothing asked. This
 * is the ask.
 *
 * The situation: an agent moved a lead to Viewing Booked while
 * underground. By the time it synced, a manager had moved the same lead
 * to Lost. Last-write-wins would silently overwrite one of them, and a
 * board that quietly loses changes is a board nobody trusts — which
 * costs more than the single lost edit ever would.
 *
 * **The system does not decide. It shows both, with who and when, and
 * the agent chooses.** Same restraint as the ownership dispute view:
 * a manager handed a ruling argues with the system, a manager handed a
 * timeline makes the call and owns it.
 */
export function ConflictSheet({
  leadName,
  yours,
  theirs,
  onKeepMine,
  onKeepTheirs,
}: {
  leadName: string;
  yours: { stage: string; at: string };
  theirs: { stage: string; at: string; who: string };
  onKeepMine: () => void;
  onKeepTheirs: () => void;
}) {
  return (
    <View style={s.sheet}>
      <Text style={s.kicker}>While you were offline</Text>
      <Text style={s.title}>{leadName} was moved twice.</Text>

      <View style={s.option}>
        <Text style={s.who}>You, {yours.at}</Text>
        <Text style={s.stage}>{yours.stage}</Text>
      </View>

      <View style={s.option}>
        <Text style={s.who}>{theirs.who}, {theirs.at}</Text>
        <Text style={s.stage}>{theirs.stage}</Text>
      </View>

      {/* No recommendation. The agent knows what happened at the viewing
          and the system does not. */}
      <Text style={s.note}>
        Both are recorded either way. This only decides where the lead sits on the board.
      </Text>

      <View style={s.actions}>
        <Pressable onPress={onKeepTheirs} style={[s.btn, s.quiet]} accessibilityRole="button">
          <Text style={s.quietLabel}>Keep theirs</Text>
        </Pressable>
        <Pressable onPress={onKeepMine} style={[s.btn, s.go]} accessibilityRole="button">
          <Text style={s.goLabel}>Keep mine</Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  sheet: { backgroundColor: t.raised, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 24, paddingBottom: 34 },
  kicker: { color: t.ink3, fontSize: 12, letterSpacing: 0.6, textTransform: "uppercase" },
  title: { color: t.ink, fontSize: 22, fontWeight: "600", letterSpacing: -0.4, marginTop: 8, marginBottom: 20 },
  option: { backgroundColor: t.sunk, borderRadius: 12, padding: 16, marginBottom: 10 },
  who: { color: t.ink3, fontSize: 13 },
  stage: { color: t.ink, fontSize: 18, fontWeight: "600", marginTop: 4 },
  note: { color: t.ink2, fontSize: 14, lineHeight: 20, marginTop: 8, marginBottom: 20 },
  actions: { flexDirection: "row", gap: 10 },
  btn: { minHeight: 48, borderRadius: 24, flex: 1, alignItems: "center", justifyContent: "center" },
  quiet: { borderWidth: 1, borderColor: t.rule },
  quietLabel: { color: t.ink, fontWeight: "500", fontSize: 15 },
  go: { backgroundColor: t.accent },
  goLabel: { color: t.onAccent, fontWeight: "600", fontSize: 15 },
});
