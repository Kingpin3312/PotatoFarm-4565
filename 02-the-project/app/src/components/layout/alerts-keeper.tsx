"use client";

import { useEffect, useRef } from "react";
import { api } from "@/lib/trpc";
import { currentSubscription, describe, deviceLabel, owner, subscribe, support } from "@/lib/push-client";

/**
 * Keeps this phone's alerts working, on every app open, without asking.
 *
 * Two things quietly break a working subscription. A new sign-in on the
 * same phone (alerts follow the sign-in, so the server has to hear which
 * one this is now), and the browser replacing the subscription itself,
 * which it may do at any time. Both are repaired here — but only for the
 * person who turned alerts on with this phone. Somebody else signing in
 * on it gets nothing until they choose it on their own Me page.
 *
 * Silent by design: when something is wrong, the Me page says what.
 */
export function AlertsKeeper() {
  const setup = api.org.pushSetup.useQuery(undefined, { staleTime: 5 * 60_000, retry: false });
  const refresh = api.org.pushRefresh.useMutation();
  const resubscribe = api.org.pushSubscribe.useMutation();
  const done = useRef(false);

  useEffect(() => {
    const d = setup.data;
    if (done.current || !d?.publicKey) return;
    done.current = true;
    void (async () => {
      try {
        if (!("Notification" in window) || Notification.permission !== "granted") return;
        if ((await support()) !== "ok") return;
        const sub = await currentSubscription();
        if (sub && (await refresh.mutateAsync({ endpoint: sub.endpoint })).known) return;
        if (owner.get() !== d.me) return;
        const fresh = await subscribe(d.publicKey!);
        await resubscribe.mutateAsync({ ...describe(fresh), label: deviceLabel() });
      } catch {
        /* the Me page explains; the shell stays quiet */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setup.data]);

  return null;
}
