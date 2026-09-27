# The training manual's words. One entry per section:
# (id, part, title, roles, image(s), intro, steps, tips)
# Everything here was written against the screens as captured, in the
# seeded demonstration brokerage (Marina Bay Properties).

PARTS = [
    ("start", "Getting started", "Signing in, finding your way round, and setting the brokerage up."),
    ("day", "Your working day", "Where agents spend their time: Today, the Inbox, leads, the people behind them, and the diary."),
    ("deals", "Properties and deals", "Listings, owners, the pipeline, offers, deals and the money that follows."),
    ("manage", "Running the brokerage", "Reports, the assistant's record, the team, documents and compliance."),
    ("settings", "Settings", "Every switch an owner or manager can change, and what each one does."),
    ("phone", "On your phone", "The same system in your pocket, built for a thumb."),
    ("ref", "Routines and reference", "Checklists for each role, what to do when something looks wrong, and the words we use."),
]

ROLES = {
    "all": "Everyone",
    "agent": "Agents",
    "manager": "Managers",
    "owner": "Owners and admins",
    "mlro": "Compliance officer",
}

S = []
def sec(id, part, title, roles, imgs, intro, steps=(), tips=(), note=None):
    S.append(dict(id=id, part=part, title=title, roles=roles, imgs=imgs, intro=intro, steps=list(steps), tips=list(tips), note=note))

# ----------------------------------------------------------------- start
sec("signin", "start", "Signing in", ["all"], [("pub-signin", "The sign-in screen. There is no password.")],
    "PotatoFarm.io has no passwords. You type your work email and we send you a link that signs you straight in. The link works once and lasts ten minutes, so a forwarded email is never a standing key to your brokerage.",
    ["Go to the sign-in page and type your work email.",
     "Press <b>Email me a link</b>.",
     "Open the email on this device (or your phone) and tap the link. You are signed in.",
     "Nothing after a minute or two? Look in Junk or Other: it is the first message we have sent you, so it has no history to be judged on."],
    ["New brokerage? Use <b>Start a trial</b> under the sign-in button. Existing brokerage? Ask your owner or manager to invite you from the Team screen.",
     "Stay signed in on your own phone and laptop only. You can see every device you are signed in on under Settings → Security."])

sec("checkmail", "start", "Check your email, and two-step sign-in", ["all"],
    [("pub-check-email", "After pressing Email me a link."), ("pub-two-step", "Two-step sign-in, if it is on for you.")],
    "If you have turned on two-step sign-in (strongly recommended for owners and managers), you are asked for a six-digit code from your authenticator app after the email link. Somebody who gets into your email still cannot get into your brokerage.",
    ["Open the email link as usual.",
     "When asked for <b>One more step</b>, open your authenticator app (Google Authenticator, Microsoft Authenticator, 1Password and similar).",
     "Type the six-digit code shown for PotatoFarm and press <b>Finish signing in</b>.",
     "Lost your phone? Use one of the recovery codes you saved when you turned it on."],
    ["Your owner cannot switch two-step off for you. That is deliberate: if they could, so could anybody who got into their account. Email hello@potatofarm.io from your sign-in address instead."])

sec("layout", "start", "Finding your way round", ["all"],
    [("today", "The top bar on a desktop: Today, Inbox, Leads, Listings, Pipeline, Diary and Settings.")],
    "Every screen sits inside the same frame. Along the top: the seven places you go most, a search box, and the name of the brokerage you are working in. On a phone the same places move to a bar at the bottom, within reach of your thumb (see <i>On your phone</i>).",
    ["<b>Today</b>: what to do next, in order.",
     "<b>Inbox</b>: every WhatsApp conversation.",
     "<b>Leads</b>: everybody who has enquired, with filters.",
     "<b>Listings</b>: your properties, permits and portals.",
     "<b>Pipeline</b>: the board, by stage.",
     "<b>Diary</b>: viewings.",
     "<b>Settings</b>: everything else, including Offers, Deals, Commission, Reports, Compliance and Team."],
    ["The brokerage name on the right tells you which brokerage you are in. If you work for two, check it before you message anybody.",
     "If the assistant has been stopped, the top bar says <b>Assistant stopped</b>. Its absence is the normal state."])

sec("palette", "start", "Search anything (Ctrl K)", ["all"],
    [("x-palette", "Press Ctrl K (⌘K on a Mac) anywhere and start typing.")],
    "The quickest way to anything. Press <b>Ctrl K</b> (or <b>⌘K</b> on a Mac), or click <b>Search</b> in the top bar, and type a name, a number, a building or a reference. People, owners, properties and screens all come up in one list.",
    ["Press <b>Ctrl K</b> from any screen.",
     "Type part of a name, a phone number, a listing reference such as <i>MG-202</i>, or a screen name such as <i>commission</i>.",
     "Use the arrow keys and <b>Enter</b>, or click, to open it.",
     "Press <b>Esc</b> to close it."],
    ["For questions rather than names (\"3 bed in Dubai Marina under 3m\"), use <b>Find anyone</b>, the first entry in the list."])

sec("setup", "start", "Setting up a new brokerage", ["owner"],
    [("setup", "Setup: nine steps, in the order that saves the most time.")],
    "Setup is the owner's checklist for a new brokerage. The steps are ordered so that the slow one, WhatsApp verification with Meta, starts first and runs in the background while you do the rest.",
    ["<b>Company details</b>: name, timezone and currency. Two minutes.",
     "<b>Connect your WhatsApp number</b>: you are handed to Meta to verify the business. This usually takes two to three working days and none of it is in our hands, so start it first.",
     "<b>Invite your agents</b>: they can use the inbox before WhatsApp is live.",
     "<b>Set your working hours</b>, including the weekend. Viewings are only offered inside them.",
     "<b>Import your listings</b> from a CSV export or your existing portal feed. You see what was found before anything is saved.",
     "<b>Connect your portals</b> once you have partner credentials from Property Finder, Bayut or Dubizzle.",
     "<b>Write your qualifying questions</b>: the questions you would want asked on a first call.",
     "<b>Record where you are today</b>: we measure your current reply times before the assistant does anything, so the difference is yours to check.",
     "<b>Switch the assistant on</b>."],
    ["Each step says <b>Do it</b> and takes you to the right screen. A step you have finished stays ticked."])

# ----------------------------------------------------------------- day
sec("today", "day", "Today", ["all"],
    [("today", "Today for the owner: the day in one line, five things to do, deals to keep moving and follow-ups.")],
    "Today is the first screen you open. It is not a dashboard of numbers. It is a short list of what to do next, in order, each with the reason it is there. An offer about to lapse outranks a warm lead, because that is the deal you actually lose.",
    ["Read the line at the top: viewings today, people waiting on a reply, follow-ups due, and what is live.",
     "Work down <b>Today</b> from 1 to 5. Each item says what to do (Negotiate, Follow up, Send, Log outcome) and why.",
     "Press <b>Done</b> when it is done, or <b>Not now</b> to move it out of the way for today.",
     "Check <b>Deals to keep moving</b>: completions that are no longer achievable, and what to agree.",
     "Clear <b>Follow-ups</b>. Some carry a draft message; press <b>Show the draft</b> to read it before you send anything.",
     "Use the box at the top, <i>Tell me what happened, or what you need</i>, to record something quickly by typing or with <b>Speak</b>."],
    ["\"Reply to Stefan before the window shuts\" means the WhatsApp reply window is about to close. After that a normal message is accepted by WhatsApp and never delivered. Reply first, tidy up later.",
     "Managers and owners also see the whole brokerage's figures on the right: live pipeline, running hot, waiting on a reply and viewings today."])

sec("inbox", "day", "The Inbox", ["agent", "manager"],
    [("inbox", "The conversation list. Tags show the budget, whether a reply is ready, and how long the reply window has left.")],
    "Every WhatsApp conversation with a buyer or an owner, newest first. Each row tells you what you need before you open it: the last message, the budget, <b>Reply ready</b> if the assistant has drafted one, <b>Handover</b> if a person is needed, and the reply window.",
    ["Use the filters along the top: <b>All</b>, <b>Unread</b>, <b>Handover</b> (the assistant has asked for a person) and <b>Mine</b>.",
     "A pink dot means unread.",
     "<b>Window 11h</b> means you can message normally for 11 more hours. <b>Window closed</b> (dashed) means a normal message will not arrive: use an approved template, or ring them.",
     "Click a conversation to open it on the right."],
    ["The reply window is WhatsApp's rule, not ours: businesses may send free-form messages only within 24 hours of the customer's last message. PotatoFarm.io checks it before every send."])

sec("thread", "day", "A conversation, and the assistant's replies", ["agent", "manager"],
    [("inbox-thread", "Sarah's conversation. The assistant qualified her; Omar took over; the assistant has drafted a reply for Omar to send.")],
    "Open a conversation to see the whole thread, who wrote what (the buyer, the assistant, or you), the reply window, and any reply the assistant has prepared.",
    ["<b>While a new buyer is being qualified</b>, the assistant replies by itself in their language, one question at a time, if your owner has switched that on (Settings → Assistant). It never claims to be a person.",
     "<b>Once you have written in a conversation</b>, or the buyer is qualified, the assistant stops sending and drafts instead. The draft appears above the reply box as <i>Suggested reply</i>.",
     "Press <b>Send as written</b> to send it, <b>Edit</b> to change it first, or <b>Discard</b> to throw it away.",
     "To write your own, type in <b>Write a reply…</b> and press <b>Send</b>. <b>Attach</b> sends a brochure, floor plan or document.",
     "<b>I've got this</b> silences the assistant on this conversation only, for a delicate negotiation. <b>Hand back</b> gives it back.",
     "<b>Call</b> and <b>WhatsApp</b> at the top open your phone's dialler or WhatsApp with the number ready."],
    ["Below the thread: <b>Identity</b> shows whether a compliance file is needed (one opens by itself when an offer is accepted), and <b>How this came to you</b> shows why the lead was routed to you. If it should have gone to somebody else, say so there; it goes to a manager with the routing decision attached.",
     "What you do with each draft (sent as written, edited, discarded) is recorded. It is how your owner decides how much to trust the assistant."])

sec("leads", "day", "Leads", ["agent", "manager"],
    [("leads", "Leads: tabs, filters, score bands and every person with their source, agent and what is happening.")],
    "Everybody who has enquired, from every source, in one list. Agents see their own leads; managers and owners see everybody's.",
    ["Use the tabs: <b>Everyone</b>, <b>Nobody's</b> (unassigned), <b>Waiting on us</b> (they wrote last) and <b>Gone quiet</b>.",
     "Search by name or number, and filter by <b>Source</b>, <b>Score</b>, <b>Stage</b>, agent (<b>With</b>) and <b>Tag</b>. <b>Sort</b> by newest, score, name or last changed.",
     "The score bands (Golden, Hot, Warm, Cold) show how likely each person is to transact. The line under each name says why: \"warming — up 19 points this week · 1 offer made\".",
     "Click a name to open their page.",
     "Tick several people (or <b>Select all shown</b>) to act on them together: give them to an agent, move them to a stage, tag them, archive them or delete them.",
     "<b>Showing</b> switches between current leads, archived ones and recently deleted ones (which can be restored)."],
    ["<b>Import</b> and <b>Export</b> (managers) bring a spreadsheet of leads in, or take one out."])

sec("addlead", "day", "Adding a lead", ["agent", "manager"],
    [("x-add-lead", "Add a lead: somebody who walked in, rang, or was referred.")],
    "Most leads arrive by themselves, from WhatsApp, the portals, your website form or Facebook and Instagram lead ads. Add one by hand for a walk-in, a phone call or a referral.",
    ["On Leads, press <b>Add a lead</b>.",
     "Type their <b>mobile</b> number with the country code (+971…). A number is enough: it is how WhatsApp knows them, and how they are recognised next time.",
     "Add their name and email if you have them, choose <b>How they came to us</b> (walked in, referral, phone call and so on), and note <b>What they said</b>.",
     "Press <b>Add them</b>. They go on the board and to whoever routing picks.",
     "If the number is already on the book, you are told who has them rather than getting a duplicate."],
    ["A walk-in you add yourself stays with you."])

sec("import", "day", "Importing and exporting leads", ["manager", "owner"],
    [("leads-import", "Import leads from a CSV. Nothing is added until you press Import at the end.")],
    "Bring your book across from another CRM, a portal or a spreadsheet. Save it from Excel or Google Sheets as a CSV first.",
    ["On Leads, press <b>Import</b>, then choose the file.",
     "Match your columns to ours on screen: name, phone, email, source, budget and so on.",
     "Check what will be created, and which rows will not come across and why.",
     "Press <b>Import</b>. Every import is recorded with a count.",
     "To take a copy out, press <b>Export</b> on Leads."],
    ["Only managers and owners can import and export. An export is every client's number in one file."])

sec("person", "day", "A person's page", ["agent", "manager"],
    [("person", "David Chen: contact details, what he wants, other business with him, next step, private notes and everything that has happened.")],
    "Everything about one person on one page. Open it from Leads, the Inbox, the Pipeline or search.",
    ["The three buttons under the name, <b>Call</b>, <b>Message</b> and <b>Next step</b>, are the things you do most.",
     "<b>Edit</b> changes their details: language, budget, what they are looking to do, when, how they are paying, and a visa renewal date if they mentioned it (never ask for it). The phone number is fixed: it is their WhatsApp identity.",
     "<b>What they're looking for</b> is the search that matches them to properties. The assistant fills it in from the conversation; yours wins once you change it. <b>Add another search</b> if they want two things.",
     "<b>Other business with them</b>: the buyer who is also letting their villa. Add it, give it a value and an agent, and move it along its own column on the board.",
     "<b>Next step</b>: add a task. <b>Nurture plan</b>: put somebody who is \"six months away\" on a plan of reminders.",
     "<b>Your note</b> is private to you. No manager sees it.",
     "Underneath is the whole history: messages, viewings, offers and emails, newest first."],
    ["If the reply window has closed, the page says so. Use an approved template, or ring them."])

sec("tasks", "day", "Tasks and follow-ups", ["agent", "manager"],
    [("tasks", "Tasks: yours, the ones you asked others for, and the whole team's.")],
    "Everything you have said you will do, and the follow-ups PotatoFarm.io has put on your list: asking how a viewing went, checking in at a visa renewal, the next step of a nurture plan. Many come with a draft message; nothing is ever sent by itself.",
    ["Switch between <b>Mine</b>, <b>I asked others</b> and <b>Whole team</b>.",
     "Press <b>Add a task</b> to write one, for yourself or a colleague, with a due date.",
     "Read the draft if there is one, send it yourself, then press <b>Done</b>.",
     "<b>Show done</b> brings back what you have finished."],
    ["\"Don't mention the visa or the date\" on a renewal task is deliberate: it reads as a file on them. Just check in."])

sec("addtask", "day", "Adding a task", ["agent", "manager"],
    [("x-add-task", "Add a task: what, for whom, and when.")],
    "A task is a promise with a date on it. Give it to yourself, or ask a colleague.",
    ["Press <b>Add a task</b>.",
     "Write <b>What</b> needs doing, pick the <b>Day</b> and <b>Time</b>, and choose <b>For</b>: yourself or a colleague.",
     "Add a note if it helps, and press <b>Add it</b>. It appears on their Today and their Tasks.",
     "To add a task about a particular person, use <b>Next step</b> on their page instead: it is linked to them."])

sec("diary", "day", "The diary and booking viewings", ["agent", "manager"],
    [("viewings", "The diary: today's viewings, in order."), ("viewings-book", "Book a viewing: only times you can actually get to.")],
    "Every viewing, by day. Booking only offers times inside your brokerage's working hours and times you can actually reach, so you are never offered a slot that leaves you crossing the city in twenty minutes.",
    ["Open <b>Diary</b> to see today's viewings in order: the time, the client, the property and its reference.",
     "Each viewing has <b>Directions</b>, <b>WhatsApp</b> and <b>Call</b>. <b>Move it</b> changes the time.",
     "To book, pick a time from the offered slots and press <b>Book it</b>.",
     "After the viewing, record what happened: they came, they did not, and what they thought. Today reminds you (\"How did the viewing go?\") until you do.",
     "The owner's weekly report counts the feedback; the buyer's own words stay with you."],
    ["Your viewings can appear in your own phone calendar: Settings → <b>Create my calendar link</b>."])

sec("ask", "day", "Say it: record by voice or text", ["agent"],
    [("ask", "Say it: tell it what happened, and it works out what should happen next.")],
    "The fastest way to get something out of your head and into the system, between viewings or in the car. Type or speak a sentence and it works out what to record and what to do next.",
    ["Open <b>Ask</b> (from Search, or the box on Today).",
     "Type, or press <b>Speak</b> and talk: \"Met Sarah today, after a four-bed villa in Dubai Hills around twelve million, moving within three months.\"",
     "Press <b>Go</b>. You see what it understood, and it is kept under <b>Earlier</b>."],
    ["It prepares; you confirm. It never sends anything to a client."])

sec("find", "day", "Find anyone", ["all"],
    [("search", "Find anyone: ask the way you would ask a colleague.")],
    "Search in plain words, across people, owners and properties at once.",
    ["Type a question the way you would ask a colleague: <i>3 bed in Dubai Marina under 3m</i>, <i>sellers in Palm Jumeirah</i>, <i>anyone relocating</i>.",
     "Press <b>Find</b>. Results are grouped by people, owners and properties."],
    ["Area names are understood as places: \"Dubai Hills\" finds listings filed under \"Dubai Hills Estate\"."])

sec("blackbook", "day", "Your blackbook", ["agent"],
    [("blackbook", "Your blackbook: your own contacts, notes and tags.")],
    "Your personal book of contacts: the developer's sales manager, the mortgage broker, the building manager. Your notes and tags are yours. No manager sees this page, and you can export it and take it with you if you ever leave.",
    ["Press <b>Add somebody</b>, give them a name, number, tags and a note.",
     "Filter by tag, or star the ones you call most.",
     "<b>Export your book</b> downloads your notes, nicknames and tags."],
    ["Client records and compliance files belong to the brokerage and stay with it. Your blackbook is yours."])

sec("me", "day", "My figures, availability and alerts", ["agent"],
    [("me", "Yours: your figures for the last 30 days, whether you are taking new leads, and when not to buzz you.")],
    "Your own page: what you are owed, where you rank, whether you are taking new leads, and when alerts may reach you.",
    ["See what you are owed, what has been paid and what is forecast.",
     "<b>Send me new leads</b>: switch off and routing skips you. Leads you already have are not taken away.",
     "<b>Away</b>: set the first and last day you are off, with an optional note.",
     "<b>When not to buzz you</b>: quiet hours and days off. Anything that arrives then is held and sent once you are back, in one message. <b>Let urgent things through anyway</b> keeps a buyer waiting mid-conversation from being held."],
    ["Quiet hours are in Dubai time, so they do not move when you travel."])

# ----------------------------------------------------------------- deals
sec("listings", "deals", "Listings", ["agent", "manager"],
    [("listings", "Listings: permits about to expire, portal rejections, filters and every property.")],
    "Every property on the book, with its price, portals and Trakheesi permit. The two panels at the top are the ones that cost money when missed: permits expiring inside 14 days, and listings a portal has rejected.",
    ["Filter by status, sale or rent, area, type, ready or off-plan, bedrooms, price and agent.",
     "Each row shows days left on the permit. An expired Trakheesi permit means the listing is pulled and you are advertising illegally until someone notices.",
     "<b>Edit</b> changes the details. <b>Check wording</b> checks the advert for claims that break the rules. <b>Who wants it</b> lists buyers whose search matches. <b>Publish</b> queues it for the portals. <b>Owner</b> sets who owns it and which agent looks after it.",
     "<b>Export</b> downloads the list."],
    ["A listing will not publish without a valid permit."])

sec("addprop", "deals", "Adding a property", ["manager"],
    [("x-add-property", "Add a property: the details a buyer asks about first, and the permit.")],
    "Add a property by hand, or import many at once (Settings → Import).",
    ["On Listings, press <b>Add a property</b>. A reference and a name are enough to start; everything else can follow.",
     "Add the community, building, bedrooms, bathrooms, area and price, then the type, ready or off-plan, for sale or to rent, and its status.",
     "Under <b>Trakheesi permit</b>, enter the permit number and expiry, and the RERA broker card. The permit is needed before it can be advertised.",
     "Off-plan and rental details are further down if they apply.",
     "Press <b>Add it</b>. It appears on Listings, and <b>Who wants it</b> immediately lists matching buyers."])

sec("public", "deals", "The page a buyer sees", ["all"],
    [("pub-listing", "A listing's public page: what a buyer sees from a link you send.")],
    "Every available listing has a public page you can send to a buyer. It shows the facts, the permit and RERA numbers, and a button to ask about it, which arrives as an enquiry.",
    ["Open the listing and copy its link, or send it from a conversation.",
     "When the buyer presses <b>Ask about this property</b>, it arrives in your Inbox like any other enquiry."])

sec("owners", "deals", "Owners (vendors)", ["agent", "manager"],
    [("vendor", "An owner's page: their properties, and what has happened since you last spoke."), ("vendor-new", "Add an owner, and how they want to hear from you.")],
    "The seller side. Each owner has a page with their properties, viewings and offers, and the weekly report they receive.",
    ["Open an owner from a listing's <b>Owner</b> button, or add one with <b>Add an owner</b>.",
     "Choose how they want to hear from you: <b>WhatsApp</b>, <b>a call</b> (the report is prepared and put on your list; we do not ring people), <b>email</b>, or <b>only when there's an offer</b>.",
     "Pick the day for their weekly report. A quiet week is still worth sending: an owner who hears nothing assumes you have stopped trying."],
    ["\"Only when there's an offer\" is a real instruction. Ringing that owner for a chat is the fastest way to lose the property.",
     "An owner who writes to your WhatsApp number lands on their own conversation, not as a new buyer."])

sec("pipeline", "deals", "The pipeline", ["agent", "manager"],
    [("pipeline", "The board: where things stop moving, then every column with its people and value.")],
    "The board, by stage: New, Qualifying, Viewing booked, Negotiating, Won and Lost. At the top, <b>Where it stops moving</b> shows how many people and how much value sit in each stage, so you can see where the pipeline is stuck.",
    ["Each card shows the person, their budget, where they came from and their agent.",
     "<b>Untouched 3 days</b> means nobody has done anything for that long. Those are the ones to look at.",
     "Move a card by dragging it to another column, or change the column from the person's page.",
     "Other business with a person (a letting alongside a purchase) appears as its own card in its own column."],
    ["Agents see their own cards; managers see everyone's."])

sec("offers", "deals", "Offers", ["agent", "manager"],
    [("offers", "Offers on the table, soonest to expire first."), ("offers-listing", "One property's offers, strongest first.")],
    "Every live offer, soonest to expire first, because an offer that lapses while you were looking at a bigger one is a deal lost to a calendar. Open a property to see its offers ranked by strength, not price.",
    ["Open <b>Offers</b> to see everything on the table and how long each has left.",
     "Click a property. Offers are ordered by whether the buyer can actually complete: cash with no conditions beats a higher offer subject to a mortgage nobody has applied for.",
     "Press <b>Counter</b> to record the owner's counter. Offers are never edited: each move is kept, so the negotiation is on record.",
     "Press <b>Accept</b> when the owner agrees. A deal is created and, if needed, a compliance file opens."],
    ["\"Strongest, not highest\" is the label to show an owner. It is the conversation that wins you the instruction next time."])

sec("offernew", "deals", "Recording an offer", ["agent"],
    [("offers-new", "Record an offer: the amount, how they are paying, conditions and when it expires.")],
    "Record every offer the moment you hear it, so it is ranked, timed and on the owner's report.",
    ["Enter the amount in dirhams.",
     "Choose how they are paying: cash, mortgage, or not said. Tick if the seller has a mortgage on the property; it changes how long the transfer takes.",
     "Add conditions (\"subject to selling their own villa\").",
     "Set how many days it is open for. We mark it lapsed and tell you when it runs out.",
     "Press <b>Record it</b>."])

sec("deals-sec", "deals", "Deals", ["agent", "manager"],
    [("deals", "Deals: every agreed sale, and whether its completion date is still achievable.")],
    "An accepted offer becomes a deal, planned backwards from the completion date on the Form F. The screen tells you which deals are at risk and why.",
    ["<b>At risk</b> means the agreed completion date is no longer achievable. The line says by how many working days.",
     "<b>On track</b> means nothing is late, or no date has been agreed yet.",
     "Click a deal to see its steps to transfer at the DLD. Tick each step as it is done, or mark it blocked with the reason, so everyone can see what is holding it up."],
    ["A mortgaged buyer against a mortgaged seller takes roughly 47 working days. A 30-day Form F is about 22. Agree realistic dates early."])

sec("commission", "deals", "Commission", ["agent"],
    [("commission", "Commission: what you are owed, what has been paid, and every deal.")],
    "What you are owed, what has been paid, what is invoiced and what is forecast, deal by deal.",
    ["<b>Owed to you</b>: the brokerage has been paid and your share has not yet been paid out.",
     "<b>Paid</b>: paid to you. <b>Forecast</b>: deals not yet invoiced.",
     "Each deal shows its reference, amount and state: forecast, invoiced, received or paid."],
    ["If your share looks wrong, check your commission plan with your manager (Settings → Commission)."])

sec("revenue", "deals", "Revenue", ["owner", "manager"],
    [("revenue", "Revenue: what the brokerage has actually been paid, and what is still to settle.")],
    "What the brokerage has actually earned, dated by when the money arrived. Owners and admins also move fees along from here.",
    ["See what was received in the last twelve months, what is invoiced and not yet paid, and what is forecast.",
     "Under <b>To settle</b>: press <b>Mark invoiced</b> when you bill a fee and <b>Mark received</b> when the money arrives. <b>Write off</b> if it never will.",
     "Once received, press <b>Mark paid</b> against each agent's share when you pay them.",
     "<b>By month</b> shows every month, including the quiet ones."],
    ["Only owners and admins can mark money received or paid. A manager can read the book."])

sec("documents", "deals", "Documents: permits, cards and licences", ["all"],
    [("documents", "Documents: what needs renewing, and what stops work when it lapses.")],
    "The register of documents with an expiry date: Trakheesi permits, RERA broker cards, the brokerage licence. It tells you what needs renewing, and which lapses stop work.",
    ["Filter by <b>Needs renewing</b>.",
     "Each entry says what happens when it lapses. A broker card: that agent cannot legally act on a transaction.",
     "Press <b>Record one</b> to add a document and its expiry, with a scan if you have it.",
     "Press <b>I have seen it</b> to confirm a document you have checked."],
    ["Agents can always record their own broker card."])

# ----------------------------------------------------------------- manage
sec("reports", "manage", "Reports", ["manager", "owner"],
    [("reports", "Reports: response time, by hour, by source, the weighted pipeline and who has gone quiet.")],
    "How the brokerage is doing, starting with the number the product exists to improve: how quickly enquiries are answered.",
    ["<b>Response time</b>: the median first reply.",
     "<b>Capture this week as your baseline</b> before switching the assistant on. It freezes the current numbers, so the difference afterwards can be measured.",
     "<b>By hour of day</b>: when enquiries arrive and how quickly they are answered. The gap after six in the evening is usually the whole story.",
     "<b>Where they come from</b>: each source's share of your enquiries as a ring, and how quickly each is first answered. With only one source, a sentence says so.",
     "<b>The business</b>: the pipeline weighted by stage, commission on its way, enquiry-to-completion time, leads, wins and conversion by source, and who has gone quiet, by agent."],
    ["Choose the period: last 30 days, 90 days or year."])

sec("activity", "manage", "What the assistant did", ["manager", "owner"],
    [("activity", "What it did: everything the assistant has done for you, why, and how to take it back.")],
    "A record of everything the assistant has done on your behalf, why it did it, and how to undo it. This is also where you choose how much it may do on its own.",
    ["<b>Copilot</b>: it tells you what to do; you do all of it.",
     "<b>Assisted</b>: it prepares what it can and waits for you.",
     "<b>Autopilot</b>: it handles reversible, internal things on its own, and still asks before anything it starts reaches a client.",
     "Under <b>Recently</b>, each entry says what it did and gives you the way to take it back."],
    ["Replying to a new buyer while qualifying is a separate switch: Settings → Assistant."])

sec("team", "manage", "Team", ["owner", "manager"],
    [("team", "Team: who is here, who gets which leads, and what agents see of each other.")],
    "Invite people, set their role, choose who gets which leads, and decide what agents can see of each other.",
    ["Type an email under <b>Invite by email</b>, choose Agent or Manager, and press <b>Send</b>. Their seat starts today; you pay for the days they use.",
     "<b>Remove</b> someone and you are asked who takes their book. Leads, viewings and follow-ups move in one go, and their seat stops.",
     "<b>Who gets what</b>: each agent's capacity, languages and communities for routing.",
     "<b>What agents see about each other</b>: the whole board, or just their own figures and rank."],
    ["Managers and owners always see the whole team."])

sec("compliance", "manage", "Compliance (for the compliance officer)", ["mlro"],
    [("compliance", "The compliance officer's desk: decisions waiting, reportable transactions and reviews due."), ("compliance-file", "A compliance file: screening, risk rating and the decision.")],
    "Every UAE brokerage that concludes a sale is a DNFBP, with anti-money-laundering duties. This screen belongs to the compliance officer (MLRO). Owners and admins cannot open it, by law: telling a client a report has been filed is itself an offence.",
    ["<b>Waiting on a decision</b>: files that need you. <b>Not checked</b> means no sanctions or PEP list was consulted: the file is unscreened.",
     "Open a file. Run the screening, set the risk rating, and enter the transaction value.",
     "Record your decision: no filing, or STR, SAR, REAR, CNMR or FFR. Write why, in at least a sentence. This is the part an inspector reads.",
     "A decision not to report still needs a reason.",
     "Press <b>Record the decision</b>. Your name and the time are recorded permanently; the log cannot be edited or deleted."],
    ["Nothing is ever auto-cleared. A possible match is always a person's decision.",
     "Records are kept for five years, even if the sale never completed. An erasure request waits for that to expire."])

# ----------------------------------------------------------------- settings
sec("set-general", "settings", "Settings: the assistant's brake, calendar and listing feed", ["owner", "manager"],
    [("settings", "Settings: the assistant's status and stop button, your calendar link, and your listing feed."),
     ("settings-drafts", "Its drafts, last 30 days: what happened to every draft somebody decided about.")],
    "The first Settings screen: whether the assistant is running, how its drafts are received, the button that stops it, your calendar link, and the feed address a portal collects your listings from.",
    ["<b>Its drafts, last 30 days</b>: a ring of the drafts somebody decided about (sent as written, changed first, thrown away), with the share sent as written in the middle. The closer that is to all of them, the stronger the case for automatic replies. Drafts overtaken or still waiting are listed underneath, not counted.",
     "<b>Stop the assistant</b> halts every conversation in the brokerage at once: no delay, no cache, no messages still going out. Press it again to start.",
     "<b>Create my calendar link</b> puts every viewing booked for you in the calendar you already use (Apple, Google or Outlook). It is read-only.",
     "<b>Your feed address</b> is what a portal collects your available, permitted listings from. Copy it and give it to Property Finder, Bayut or Dubizzle once your agreement is signed."],
    ["Treat the feed address like a password. Anyone with it can read every property you have for sale or rent."])

sec("set-assistant", "settings", "The assistant: questions, tone and automatic replies", ["owner"],
    [("set-assistant", "Settings → Assistant: replies while qualifying, the five questions, and the tone.")],
    "What the assistant asks a new buyer, how it sounds, and whether it replies by itself while it qualifies them.",
    ["<b>Replies while qualifying</b>: on, the assistant replies to new buyers by itself within seconds (read receipt, \"typing…\", then the reply), asks your questions one at a time, and hands over to their agent. Off, every reply is drafted for an agent to send.",
     "Beside the switch: how many of the assistant's drafts agents sent exactly as written. That is the evidence to look at before you turn it on.",
     "<b>What it asks</b>: five questions, in order: budget, timeline, financing, purpose and a viewing. Change the wording; what each question is for stays fixed, because the answers feed the pipeline.",
     "<b>Tone</b>: how it should sound, in your words.",
     "Press <b>Save</b>. The next enquiry uses it."],
    ["It never claims to be a person, and says it is the brokerage's assistant if asked. \"Stop everything\" and \"I've got this\" still stop it at once.",
     "Nothing you write in Tone can make it quote a price nobody gave it, or negotiate for you."])

sec("set-channels", "settings", "Channels", ["owner"],
    [("set-channels", "Channels: where enquiries come from, and whether each can reply."), ("x-connect-channel", "Connect a channel.")],
    "Where enquiries come from: your WhatsApp number, your website form, Facebook and Instagram lead ads, and the portals. A feed that stops does not throw an error, it just sends fewer leads. This is where that becomes visible.",
    ["Press <b>Connect a channel</b> and choose the type.",
     "WhatsApp: enter the phone number ID and access token from Meta. Without the token, messages arrive but replies will not send, and the channel says so.",
     "Website form: you are given an address to post your website's enquiry form to.",
     "Each channel shows when it last received something. <b>Disconnect</b> stops it."])

sec("set-routing", "settings", "Lead routing", ["owner", "manager"],
    [("set-routing", "Lead routing: how new leads are shared out, and who would get the next one.")],
    "How new leads are shared between agents. Every agent can see this page, because a rule nobody can see is a rule everybody suspects.",
    ["Choose a rule: <b>In turn</b>, <b>Whoever has fewest</b>, <b>Whoever replies fastest</b>, <b>Always one person</b>, or a <b>Shared pool</b> where the first to claim it owns it.",
     "<b>Who would get the next one</b> shows every agent, their current load and capacity.",
     "An agent who thinks a lead went to the wrong person raises it from the lead itself; it reaches a manager with the routing decision attached."])

sec("set-hours", "settings", "Working hours", ["owner"],
    [("set-hours", "Working hours: your week, including the weekend.")],
    "The hours viewings can be offered in. A day with nothing set is treated as closed.",
    ["Set a start and end time for each day, or tick <b>Closed</b>.",
     "Remember Saturday: most viewings happen at the weekend.",
     "Press <b>Save the week</b>."])

sec("set-plans", "settings", "Nurture plans", ["manager"],
    [("set-plans", "Nurture plans: for somebody who said \"in about six months\".")],
    "A plan puts the next thing to do on an agent's list at the right time, for somebody who is not ready yet. Nothing is sent by itself, and a reply from them pauses the plan until the agent decides to carry on.",
    ["Press <b>New plan</b>, or start from the ready-made six-touch buyer plan.",
     "Add steps: what to do, and how many days after the last one.",
     "Agents put somebody on a plan from that person's page."])

sec("set-commission", "settings", "Commission plans", ["owner"],
    [("set-commission", "Commission plans: each person's bands for the year.")],
    "Each agent's commission bands. Bands are cumulative over the calendar year: an agent earns the share of the highest band they have passed.",
    ["Press <b>Set a plan</b> next to a person.",
     "Add bands: up to a year-to-date amount, and the share above it.",
     "Save. Changing a plan never rewrites the old one; the previous bands stay on record."])

sec("set-email", "settings", "Email", ["agent", "manager"],
    [("set-email", "Email: connect your Gmail or Outlook mailbox.")],
    "Connect your mailbox so mail with your clients appears on their page beside WhatsApp. Only mail with somebody already on the book is kept, and only who it was with, when, the subject and a line of it. Never the whole message, and nothing else from your inbox.",
    ["Press <b>Connect Google</b> or <b>Connect Microsoft</b>.",
     "Sign in to your mailbox and allow read-only access.",
     "Your mailbox appears under <b>Connected</b>. Disconnect it here at any time."])

sec("set-import", "settings", "Import your history", ["owner"],
    [("set-import", "Import: bring your history across from your current system.")],
    "Bring listings and history across from your current system as a CSV export with a header row. You see exactly which records will not come across, and why, before anything is written.",
    ["Choose <b>Your export file</b>.",
     "Match the columns and check the preview.",
     "Press <b>Import</b>."])

sec("set-security", "settings", "Security and two-step sign-in", ["all"],
    [("set-security", "Security: two-step sign-in, and every device you are signed in on.")],
    "Protect your account. Two-step sign-in adds a code from an app on your phone, so somebody who gets into your email still cannot get in here.",
    ["Press <b>Turn on two-step sign-in</b>.",
     "Install an authenticator app (Google Authenticator, Microsoft Authenticator or 1Password). On your phone, tap <b>open it in the app</b>; on a computer, choose \"enter a setup key\" in the app and type the key shown.",
     "Type the code the app shows and press <b>Turn on</b>. Save the recovery codes you are given somewhere safe.",
     "<b>Where you're signed in</b> lists every device. Do not recognise one? Sign it out, then turn on two-step sign-in."],
    ["Owners and managers can see every client and every commission. Please turn it on."])

sec("set-access", "settings", "Support access", ["owner"],
    [("set-access", "Support access: nobody at PotatoFarm.io can see your data unless you grant it.")],
    "Nobody at PotatoFarm.io can see your data unless you grant it. A grant names one person, lasts 72 hours and expires on its own.",
    ["Type the one named person who needs access.",
     "Write why. It goes on the permanent record next to their name.",
     "Press <b>Grant for 72 hours</b>. You can revoke it early."],
    ["If you cannot name the person, do not grant it."])

sec("set-privacy", "settings", "Privacy requests", ["owner"],
    [("set-privacy", "Privacy requests: a copy of what you hold on somebody, or erasing them.")],
    "When somebody asks what you hold on them, or asks to be erased.",
    ["Type their WhatsApp number.",
     "<b>Build the file</b> gives you everything you hold on them, in plain language, to send to them.",
     "<b>Erase</b> scrubs their personal details and keeps the audit trail. If there is a live compliance file, erasure waits: UAE rules require five years of due-diligence records, and we tell them when it expires.",
     "<b>Past requests</b> lists every request and what was done."])

sec("set-billing", "settings", "Billing and invoices", ["owner"],
    [("set-billing", "Billing: this month so far, your card, and invoices."), ("set-invoice", "An invoice, ready to print or save.")],
    "What this month will cost, your payment card, the details on your invoices, and every invoice.",
    ["<b>This month so far</b> shows agents, conversations answered and the running total. You pay per agent per month; conversations beyond the included allowance are charged per conversation.",
     "<b>Add a card</b>: it goes straight to our payment provider and we never see it.",
     "Enter your billing address and, if you are VAT-registered, your 15-digit TRN.",
     "Open an invoice to print it or save it as a PDF."],
    ["Add someone mid-month and you pay for the days they use. Remove them and it stops the same way."])

# ----------------------------------------------------------------- phone
sec("phone", "phone", "Using PotatoFarm.io on your phone", ["agent"],
    [("m-today", "Today."), ("m-inbox", "The Inbox."), ("m-person", "A person: Call, Message and Next step first."), ("x-m-more", "More: everything else.")],
    "Everything works on a phone, in the browser, and it installs to your home screen like an app. Navigation moves to a bar at the bottom, within reach of your thumb: <b>Today</b>, <b>Inbox</b>, <b>Diary</b>, <b>Pipeline</b> and <b>More</b>.",
    ["<b>Install it</b>: open PotatoFarm.io in Safari (iPhone) or Chrome (Android), then choose <b>Share → Add to Home Screen</b> (iPhone) or <b>Install app</b> (Android). It opens full-screen from the icon.",
     "Turn on notifications when asked, so a buyer waiting reaches you.",
     "In the Inbox, open a conversation; <b>← All conversations</b> takes you back.",
     "On a person's page, <b>Call</b>, <b>Message</b> and <b>Next step</b> are the first things under the name.",
     "<b>More</b> opens everything else: Leads, Listings, Offers, Deals, Commission, Reports and Settings.",
     "No signal? You are told you are offline rather than shown a broken page. Anything already saved is safe; try again when you are back."])

# ----------------------------------------------------------------- ref
ROUTINES = [
    ("Agent: every morning", ["Open Today and work 1 to 5.", "Clear Reply ready and Handover in the Inbox.", "Reply to anybody whose window is about to close.", "Check today's viewings in the Diary."]),
    ("Agent: after every viewing", ["Record the outcome: came, no-show, and what they thought.", "Update what they are looking for if it changed.", "Add a next step with a date."]),
    ("Agent: when an offer comes in", ["Record it at once, with how they are paying and any conditions.", "Tell the owner the same day.", "Watch the expiry on Offers."]),
    ("Manager: every week", ["Look at Nobody's and Gone quiet on Leads.", "Check Untouched cards on the Pipeline.", "Read Reports: response time by hour and by source.", "Review Deals at risk with the agents on them."]),
    ("Owner: every month", ["Reports and Revenue: what was earned and what is owed.", "Mark fees invoiced and received; pay agents' shares.", "Team: who is joining, who is leaving.", "Documents: anything due for renewal."]),
    ("Compliance officer: every week", ["Clear Waiting on a decision on Compliance.", "Record a reason for every decision, including not filing.", "Check Reviews due."]),
]

TROUBLE = [
    ("A buyer says they never got my message.", "Check the reply window on the conversation. After 24 hours without a message from them, WhatsApp accepts a normal message and never delivers it. Use an approved template, or ring them."),
    ("The assistant did not reply to someone.", "Check the top bar for <b>Assistant stopped</b>, the conversation for <b>I've got this</b> or <b>Handover</b>, and whether the buyer wrote STOP. Past qualification, or once an agent has written, it drafts rather than sends."),
    ("A lead went to the wrong agent.", "Open the conversation and use <b>This should have gone to someone else</b>. It reaches a manager with the routing decision attached."),
    ("My sign-in link does not arrive.", "Look in Junk or Other. The link lasts ten minutes; request another if it has expired."),
    ("A listing is not on the portals.", "Check its Trakheesi permit on Listings. Without a valid one it is held back. Check Rejected by a portal at the top."),
    ("The Channels screen says a channel can't reply.", "Its WhatsApp access token is missing or has expired. Reconnect it with the token from Meta."),
    ("I can't open Compliance.", "By design. Only the compliance officer can, because telling a client a report has been filed is an offence."),
    ("I think a figure is wrong.", "Every screen says where its number comes from. Commission is dated by when money arrived; the pipeline is weighted by stage. Ask your manager, or email hello@potatofarm.io."),
]

GLOSSARY = [
    ("24-hour window", "WhatsApp's rule: a business may send free-form messages only within 24 hours of the customer's last message."),
    ("Handover", "The assistant has asked for a person to take a conversation."),
    ("I've got this", "Silences the assistant on one conversation."),
    ("Stop everything", "Halts the assistant across the whole brokerage, immediately."),
    ("Replies while qualifying", "The owner's switch that lets the assistant reply to new buyers by itself."),
    ("Draft / Reply ready", "A reply the assistant has written for an agent to send."),
    ("Score (Golden, Hot, Warm, Cold)", "How likely a lead is to transact, recalculated every night, with the reasons shown."),
    ("Trakheesi", "Dubai Land Department's advertising permit. No permit, no listing."),
    ("Form F", "The sale agreement; its completion date is what a deal is planned back from."),
    ("DLD", "Dubai Land Department, where transfer happens."),
    ("DNFBP", "Designated non-financial business or profession: a UAE brokerage concluding a sale is one, with AML duties."),
    ("MLRO", "Money laundering reporting officer: the compliance officer."),
    ("STR / SAR / REAR", "Suspicious transaction report, suspicious activity report, real-estate activity report."),
    ("PEP", "Politically exposed person."),
    ("Nurture plan", "A timed list of reminders for somebody not ready yet. Nothing is sent by itself."),
    ("Blackbook", "Your personal contacts and notes. Yours, not the brokerage's."),
    ("Baseline", "Your reply times before the assistant was switched on, frozen so the difference can be measured."),
]
