import { useEffect, useState } from "react";
import { View, Text, FlatList, Pressable, StyleSheet, RefreshControl } from "react-native";
import { pending, flush, stale, watch, type Item } from "@/lib/queue";
import { ViewingCard } from "@/components/viewing-card";
import { t } from "@/lib/theme";

/**
 * Today.
 *
 * The only screen that opens by default, and it answers one question:
 * **what needs me right now.**
 *
 * Not a dashboard. Not a pipeline board — that is a desktop artefact and
 * cramming it into 375px produces three columns nobody can read, which
 * is the mistake Reapit and Goyzer both made.
 *
 * Four things live here: who is waiting, what is queued and stuck,
 * today's viewings, and nothing else.
 */
export default function Today() {
  const [queued, setQueued] = useState(0);
  const [stuck, setStuck] = useState<Item[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  /**
   * Has anything ever happened here?
   *
   * Not "is it quiet today" — has this brokerage ever received a lead
   * through us. A first-run agent and an agent on a slow Tuesday see the
   * same empty screen otherwise, and only one of them should be
   * reassured by it.
   */
  const [everActive, setEverActive] = useState<boolean | null>(null);
  const [viewings, setViewings] = useState<
    React.ComponentProps<typeof ViewingCard>["viewing"][]
  >([]);

  useEffect(() => {
    const unwatch = watch();
    void refresh();
    // Checked on a timer as well as on reconnect, because a message
    // sitting unsent for two minutes needs saying whether or not the
    // network state changed.
    const timer = setInterval(() => void refresh(), 30_000);
    return () => { unwatch(); clearInterval(timer); };
  }, []);

  async function refresh() {
    await flush();
    setQueued(await pending());
    setStuck(await stale());
  }

  return (
    <FlatList
      style={s.screen}
      data={[]}
      renderItem={null}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => { setRefreshing(true); await refresh(); setRefreshing(false); }}
          tintColor={t.ink3}
        />
      }
      ListHeaderComponent={
        <View style={s.pad}>
          <Text style={s.eyebrow}>Today</Text>

          {/**
            * Stuck sends come first, above everything.
            *
            * An agent who typed a reply on a lock screen believes it was
            * sent. If it was not, that is the most urgent thing on this
            * phone — more urgent than a new lead, because they are not
            * going to check.
            */}
          {stuck.length > 0 && (
            <View style={s.alert}>
              <Text style={s.alertTitle}>
                {stuck.length === 1 ? "A reply hasn't sent" : `${stuck.length} replies haven't sent`}
              </Text>
              <Text style={s.alertBody}>
                Typed more than two minutes ago and still waiting. Usually signal — it will go
                on its own when you have a bar.
              </Text>
              <Pressable style={s.alertBtn} onPress={() => void refresh()}>
                <Text style={s.alertBtnLabel}>Try now</Text>
              </Pressable>
            </View>
          )}

          {everActive === false ? (
            <>
              <Text style={s.h1}>You&rsquo;re set up.</Text>
              <Text style={s.lead}>
                Nothing has come through yet. The first enquiry will arrive as a
                notification you can reply to without opening this app.
              </Text>
              {/* One concrete thing they can do, so the screen is not a
                  dead end on the day it matters most. */}
              <Pressable style={s.check} onPress={() => void refresh()}>
                <Text style={s.checkLabel}>Send yourself a test message</Text>
              </Pressable>
              <Text style={s.checkHint}>
                Message your brokerage&rsquo;s WhatsApp number from your own phone. It should
                appear here within seconds.
              </Text>
            </>
          ) : (
            <>
              <Text style={s.h1}>Nothing is waiting on you.</Text>
              <Text style={s.lead}>
                New enquiries arrive as a notification you can reply to without opening this.
              </Text>
            </>
          )}

          {queued > 0 && stuck.length === 0 && (
            <Text style={s.quiet}>{queued} queued, syncing</Text>
          )}

          {/**
            * The day, in full, on the screen that opens by default.
            *
            * It was a card saying "No viewings today" that you had to
            * tap. An agent checking whether they can take a call at
            * eleven should not have to navigate to find out — this is
            * the question the screen exists to answer.
            */}
          <View style={s.day}>
            <Text style={s.dayHead}>
              {viewings.length === 0
                ? "Nothing booked today"
                : `${viewings.length} viewing${viewings.length === 1 ? "" : "s"} today`}
            </Text>
            {viewings.length === 0 ? (
              <Text style={s.dayNote}>
                When the assistant books one it appears here with the address and a route,
                so you can leave without opening anything else.
              </Text>
            ) : (
              viewings.map((v, i) => (
                <ViewingCard key={v.id} viewing={v} previous={i > 0 ? viewings[i - 1]! : null} />
              ))
            )}
          </View>
        </View>
      }
    />
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.ground },
  pad: { padding: 20, paddingTop: 12 },
  eyebrow: { color: t.ink3, fontSize: 13, marginBottom: 10 },
  h1: { color: t.ink, fontSize: 30, fontWeight: "600", letterSpacing: -0.7, lineHeight: 34 },
  lead: { color: t.ink2, fontSize: 16, lineHeight: 23, marginTop: 10, maxWidth: 320 },
  quiet: { color: t.ink3, fontSize: 13, marginTop: 16 },

  alert: { backgroundColor: t.sunk, borderLeftWidth: 3, borderLeftColor: t.danger,
    borderRadius: 12, padding: 16, marginBottom: 24 },
  alertTitle: { color: t.ink, fontWeight: "600", fontSize: 16 },
  alertBody: { color: t.ink2, fontSize: 14, lineHeight: 20, marginTop: 4 },
  alertBtn: { minHeight: 44, borderRadius: 22, backgroundColor: t.accent, alignSelf: "flex-start",
    paddingHorizontal: 20, justifyContent: "center", marginTop: 12 },
  alertBtnLabel: { color: t.onAccent, fontWeight: "600", fontSize: 15 },

  check: { minHeight: 48, borderRadius: 24, backgroundColor: t.accent,
    alignSelf: "flex-start", paddingHorizontal: 22, justifyContent: "center", marginTop: 22 },
  checkLabel: { color: t.onAccent, fontWeight: "600", fontSize: 15 },
  checkHint: { color: t.ink3, fontSize: 13, lineHeight: 19, marginTop: 10, maxWidth: 300 },

  day: { marginTop: 34, borderTopWidth: 1, borderTopColor: t.rule, paddingTop: 20 },
  dayHead: { color: t.ink, fontSize: 18, fontWeight: "600", marginBottom: 4 },
  dayNote: { color: t.ink2, fontSize: 15, lineHeight: 22, marginTop: 6, maxWidth: 320 },

  card: { backgroundColor: t.sunk, borderRadius: 14, padding: 18, marginTop: 28 },
  cardKicker: { color: t.ink3, fontSize: 12, letterSpacing: 0.6, textTransform: "uppercase" },
  cardTitle: { color: t.ink, fontSize: 18, fontWeight: "500", marginTop: 6 },
});
