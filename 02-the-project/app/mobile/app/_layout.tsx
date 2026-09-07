import { useEffect } from "react";
import { Stack } from "expo-router";
import { attach, registerCategories } from "@/lib/notifications";
import { watch } from "@/lib/queue";

/**
 * Root.
 *
 * Two things happen before anything renders, and the order matters.
 *
 * **Categories are registered first.** A notification that arrives before
 * its category exists has no reply field — the agent taps it, the app
 * opens, and the fast path we built the whole strategy around silently
 * does not happen. It is registered at launch rather than lazily for
 * exactly that reason.
 *
 * **The queue watcher starts second**, so anything typed while the app
 * was closed goes as soon as there is signal.
 */
export default function Root() {
  useEffect(() => {
    void registerCategories();
    const sub = attach();
    const unwatch = watch();
    return () => { sub.remove(); unwatch(); };
  }, []);

  return <Stack screenOptions={{ headerShown: false }} />;
}
