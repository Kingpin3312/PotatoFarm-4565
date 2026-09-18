"use client";

import { use } from "react";
import { Inbox } from "../inbox";

/**
 * One conversation, open.
 *
 * The route the Leads screen has always linked to and which did not
 * exist — every row there returned a 404. Same screen as `/inbox`, with
 * the thread selected, so the list stays beside it on a desktop rather
 * than the agent losing their place.
 *
 * `params` is a Promise in Next 15; `use()` unwraps it in a client
 * component.
 */
export default function InboxThreadPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = use(params);
  return <Inbox selectedId={conversationId} />;
}
