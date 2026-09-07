import { useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { enqueue } from "@/lib/queue";
import { t } from "@/lib/theme";

/**
 * "I've got this one."
 *
 * The most-requested thing in the first agent test, and the smallest to
 * build:
 *
 *   *"Can I switch it off for one buyer I'm handling carefully? I found
 *   the stop button in settings. That switches it off for everyone."*
 *
 * An agent asked to choose between "the assistant answers all my buyers"
 * and "nobody's assistant answers anybody" trusts neither. This is the
 * third option and it is why the assistant becomes something an agent
 * uses rather than something done to them.
 */
export function MuteToggle({
  conversationId,
  muted,
  leadName,
}: {
  conversationId: string;
  muted: boolean;
  leadName?: string | null;
}) {
  const [on, setOn] = useState(muted);
  const who = leadName ?? "this buyer";

  const toggle = async () => {
    const next = !on;
    // Optimistic. An agent who taps this because a negotiation just
    // turned delicate should not watch a spinner — and the queue makes
    // it true whether or not there is signal.
    setOn(next);
    await enqueue({
      kind: "conversation.mute",
      conversationId,
      muted: next,
      createdAt: new Date().toISOString(),
    } as never);
  };

  return (
    <View style={[s.wrap, on && s.wrapOn]}>
      <View style={s.text}>
        <Text style={s.title}>
          {on ? "You're handling this one" : "The assistant can reply"}
        </Text>
        <Text style={s.body}>
          {on
            ? `It won't answer ${who} until you switch this back. Everything else carries on as normal.`
            : `Switch this off if you want to handle ${who} yourself. It only affects this conversation.`}
        </Text>
      </View>
      <Pressable
        onPress={() => void toggle()}
        style={[s.btn, on ? s.btnOn : s.btnOff]}
        accessibilityRole="switch"
        accessibilityState={{ checked: on }}
        accessibilityLabel={on ? "Let the assistant reply again" : "Handle this conversation yourself"}
      >
        <Text style={[s.btnLabel, on && s.btnLabelOn]}>{on ? "Hand back" : "I've got this"}</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { backgroundColor: t.sunk, borderRadius: 14, padding: 16, marginVertical: 12 },
  // A left rule rather than a colour wash. The state has to be obvious
  // at a glance without shouting on every screen it appears.
  wrapOn: { borderLeftWidth: 3, borderLeftColor: t.accent },
  text: { marginBottom: 12 },
  title: { color: t.ink, fontSize: 16, fontWeight: "600" },
  body: { color: t.ink2, fontSize: 14, lineHeight: 20, marginTop: 4 },
  btn: { minHeight: 44, borderRadius: 22, alignSelf: "flex-start",
    paddingHorizontal: 20, justifyContent: "center" },
  btnOff: { borderWidth: 1, borderColor: t.rule },
  btnOn: { backgroundColor: t.accent },
  btnLabel: { color: t.ink, fontWeight: "500", fontSize: 15 },
  btnLabelOn: { color: t.onAccent, fontWeight: "600" },
});
