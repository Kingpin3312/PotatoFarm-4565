"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  currentSubscription, describe, deviceLabel, owner, subscribe, support, type Support,
} from "@/lib/push-client";

/**
 * Phone alerts: turning them on, on the phone in the agent's hand.
 *
 * Until this existed no alert had ever reached a phone. They were built
 * for a native app that cannot build, so a new lead, a buyer waiting
 * mid-conversation and a viewing in an hour all landed on a list the
 * agent had to go and look at. This is the installed web app doing it
 * instead, by the Web Push standard.
 *
 * Every state that stops it working is said in words, with what to do,
 * because each one fails silently otherwise: an iPhone that has not
 * added the app to its Home Screen, a browser that blocked the request,
 * a server without its keys, or "Push to my phone" switched off below.
 */

/** Why a device in the list is not receiving, in the agent's words. */
function why(reason: string | null) {
  if (!reason) return "Not receiving";
  if (/signed out/.test(reason)) return "Signed out there";
  if (/answered 40[34]|answered 410|refused|no encryption|could not encrypt/.test(reason)) return "The browser stopped them";
  return "Not receiving";
}

export function PhoneAlerts() {
  const setup = api.org.pushSetup.useQuery();
  const prefs = api.org.notifications.useQuery();
  const utils = api.useUtils();

  const [sup, setSup] = useState<Support | null>(null);
  const [perm, setPerm] = useState<NotificationPermission | null>(null);
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<{ text: string; bad?: boolean } | null>(null);

  useEffect(() => {
    void (async () => {
      const s = await support();
      setSup(s);
      if ("Notification" in window) setPerm(Notification.permission);
      if (s === "ok") setEndpoint((await currentSubscription())?.endpoint ?? null);
    })();
  }, []);

  const subscribeM = api.org.pushSubscribe.useMutation();
  const forget = api.org.pushForget.useMutation({ onSuccess: () => void utils.org.pushSetup.invalidate() });
  const test = api.org.pushTest.useMutation({
    onSuccess: (r) => {
      setSaid(r.sent
        ? { text: `Sent to ${r.sent === 1 ? "your phone" : `${r.sent} devices`}. It should arrive within a few seconds.` }
        : r.noDevice
          ? { text: "No phone has alerts on any more. Turn them on here again.", bad: true }
          : { text: "Your phone's alert service didn't accept it. Turn alerts on again here; if that doesn't fix it, tell whoever runs PotatoFarm for your brokerage.", bad: true });
      void utils.org.pushSetup.invalidate();
    },
    onError: (e) => setSaid({ text: e.message, bad: true }),
  });

  if (!setup.data || !sup) return null;
  const { publicKey, me, devices } = setup.data;
  const here = devices.find((d) => d.thisSignIn && d.working);
  const on = !!endpoint && !!here;

  async function turnOn() {
    setBusy(true);
    setSaid(null);
    try {
      // Asked inside the tap, because Safari refuses to ask otherwise.
      const p = await Notification.requestPermission();
      setPerm(p);
      if (p !== "granted") {
        setSaid({
          text: p === "denied"
            ? "Notifications are blocked for this site. Allow them in the browser's or the phone's settings, then come back here."
            : "The question was closed without an answer, so nothing changed.",
          bad: true,
        });
        return;
      }
      const sub = await subscribe(publicKey!);
      await subscribeM.mutateAsync({ ...describe(sub), label: deviceLabel() });
      owner.set(me);
      setEndpoint(sub.endpoint);
      await utils.org.pushSetup.invalidate();
      setSaid({ text: "Alerts are on for this phone. Send a test to see what one looks like." });
    } catch (e) {
      const server = e instanceof Error && "data" in e;
      setSaid({
        text: server && e.message ? e.message : "This browser couldn't reach its alert service. Try again in a moment.",
        bad: true,
      });
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    setSaid(null);
    try {
      const sub = await currentSubscription();
      if (sub) {
        await forget.mutateAsync({ endpoint: sub.endpoint });
        await sub.unsubscribe().catch(() => {});
      }
      owner.clear();
      setEndpoint(null);
      setSaid({ text: "Alerts are off for this phone. They still appear on your notification list in the app." });
    } catch (e) {
      setSaid({ text: e instanceof Error && e.message ? e.message : "Couldn't turn them off. Try again.", bad: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-12" aria-labelledby="alerts-h" data-phone-alerts={on ? "on" : "off"}>
      <h2 id="alerts-h" className="font-sans font-semibold text-section text-ink mb-1">Phone alerts</h2>
      <p className="text-sm text-ink-2 max-w-[52ch]">
        A new lead, a buyer waiting for you, a viewing coming up: sent to your phone the moment it
        happens, outside the quiet hours you set below.
      </p>

      {said && (
        <p role={said.bad ? "alert" : "status"}
           className={said.bad ? "mt-4 px-3 py-2.5 bg-ink text-ground text-sm rounded-[3px] max-w-[60ch]" : "mt-4 px-3 py-2.5 border border-rule text-sm rounded-[3px] text-ink-2 max-w-[60ch]"}>
          {said.text}
        </p>
      )}

      <div className="border-t border-rule-strong mt-5 pt-5 flex flex-col gap-4 max-w-[60ch]">
        {!publicKey ? (
          <p className="text-sm text-ink">
            Phone alerts aren&apos;t set up on this server yet. Everything still arrives on your
            notification list in the app.
          </p>
        ) : sup === "ios-not-installed" ? (
          <div className="text-sm text-ink">
            <p>On an iPhone, alerts come to the app on your Home Screen, not to Safari:</p>
            <ol className="mt-2 ms-5 list-decimal flex flex-col gap-1 text-ink-2">
              <li>Tap <b className="text-ink">Share</b> at the bottom of Safari.</li>
              <li>Tap <b className="text-ink">Add to Home Screen</b>.</li>
              <li>Open PotatoFarm from your Home Screen, and come back to this page.</li>
            </ol>
          </div>
        ) : sup === "unsupported" ? (
          <p className="text-sm text-ink">
            This browser can&apos;t receive alerts. On Android use Chrome; on an iPhone, Safari, from the
            app on your Home Screen.
          </p>
        ) : sup === "no-worker" ? (
          <p className="text-sm text-ink">
            Alerts need the app&apos;s background helper, which isn&apos;t running here. Reload the page; if this
            stays, open the app from your Home Screen.
          </p>
        ) : perm === "denied" ? (
          <p className="text-sm text-ink">
            Notifications are blocked for PotatoFarm in this browser. Allow them in the browser&apos;s or the
            phone&apos;s settings, then come back here.
          </p>
        ) : on ? (
          <>
            <p className="text-ui text-ink" role="status">Alerts are on for this {here!.label === "This browser" ? "browser" : here!.label}.</p>
            {prefs.data && !prefs.data.push && (
              <p className="text-sm text-ink">
                <b>Push to my phone</b> is off below, so nothing will be sent here until you turn it back on.
              </p>
            )}
            <div className="flex flex-wrap gap-3">
              <Button variant="primary" loading={test.isPending} onClick={() => { setSaid(null); test.mutate(); }}>Send a test</Button>
              <Button variant="secondary" loading={busy} onClick={() => void turnOff()}>Turn off on this phone</Button>
            </div>
          </>
        ) : (
          <div>
            <Button variant="primary" loading={busy} onClick={() => void turnOn()} data-alerts-on>Turn on alerts on this phone</Button>
            <p className="mt-2 text-note text-ink-3 leading-snug">
              Your phone will ask whether PotatoFarm may send notifications. Choose Allow.
            </p>
          </div>
        )}

        {devices.length > 0 && (
          <div>
            <h3 className="t-label text-ink-3 mb-2">Where your alerts go</h3>
            <ul className="border-t border-rule">
              {devices.map((d) => (
                <li key={d.id} className="py-3 border-b border-rule flex items-center gap-3 flex-wrap" data-device={d.thisSignIn ? "this" : "other"}>
                  <span className="text-ui text-ink">{d.label}</span>
                  {d.thisSignIn && <span className="t-label text-accent-deep">This phone</span>}
                  <span className="text-note text-ink-3">{d.working ? "Receiving" : why(d.why)}</span>
                  {!d.thisSignIn && (
                    <button type="button" className="btn-inline min-h-11 ms-auto"
                            disabled={forget.isPending} onClick={() => forget.mutate({ id: d.id })}>
                      Remove
                    </button>
                  )}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-note text-ink-3 leading-snug">
              Signing a phone out, in Settings → Security, stops its alerts too. Use it for a lost phone.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
