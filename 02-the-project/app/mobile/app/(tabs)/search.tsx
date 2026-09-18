import { useState } from "react";
import { View, Text, TextInput, FlatList, StyleSheet, Pressable } from "react-native";
import { t } from "@/lib/theme";

/**
 * Look up.
 *
 * One job: an agent standing in front of a buyer who has just asked
 * something they do not know. Service charge, permit number, the year it
 * was handed over.
 *
 * **Answers, not listings.** A property card with twelve fields is a
 * page to read. This returns the field they asked for, large enough to
 * read at arm's length while somebody is looking at them.
 *
 * That framing is why this tab is called Look up rather than Search. A
 * search screen invites browsing; this is for one question under mild
 * pressure.
 */
export default function LookUp() {
  const [q, setQ] = useState("");
  const results: { ref: string; field: string; value: string }[] = [];

  return (
    <View style={s.screen}>
      <View style={s.bar}>
        <TextInput
          style={s.input}
          value={q}
          onChangeText={setQ}
          placeholder="Reference, building, or a question"
          placeholderTextColor={t.ink3}
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel="Look up a property"
        />
      </View>

      <FlatList
        data={results}
        keyExtractor={(r, i) => `${r.ref}-${i}`}
        ListEmptyComponent={
          q.length === 0 ? (
            <View style={s.hint}>
              <Text style={s.hintTitle}>For when you&rsquo;re asked something on the spot.</Text>
              <Text style={s.hintBody}>
                Service charge, permit number, handover year. Type the reference or just the
                question.
              </Text>
            </View>
          ) : (
            <View style={s.hint}>
              <Text style={s.hintTitle}>Nothing found.</Text>
              {/* Never guesses. The same rule as the assistant — if the
                  answer is not on the record, say so rather than produce
                  something plausible in front of a buyer. */}
              <Text style={s.hintBody}>
                If it isn&rsquo;t in your listings, we won&rsquo;t guess at it. Better to say
                you&rsquo;ll check than to be wrong out loud.
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <Pressable style={s.answer}>
            <Text style={s.field}>{item.field}</Text>
            {/* Large on purpose — read at arm's length, standing up. */}
            <Text style={s.value}>{item.value}</Text>
            <Text style={s.ref}>{item.ref}</Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.ground },
  bar: { padding: 16, borderBottomWidth: 1, borderBottomColor: t.rule },
  input: { minHeight: 48, backgroundColor: t.sunk, borderRadius: 24,
    paddingHorizontal: 18, fontSize: 16, color: t.ink },
  hint: { padding: 32 },
  hintTitle: { color: t.ink, fontSize: 18, fontWeight: "600" },
  hintBody: { color: t.ink2, fontSize: 15, lineHeight: 22, marginTop: 8, maxWidth: 320 },
  answer: { paddingHorizontal: 20, paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: t.rule },
  field: { color: t.ink3, fontSize: 12, letterSpacing: 0.6, textTransform: "uppercase" },
  value: { color: t.ink, fontSize: 28, fontWeight: "600", letterSpacing: -0.5, marginTop: 6 },
  ref: { color: t.ink3, fontSize: 13, marginTop: 6 },
});
