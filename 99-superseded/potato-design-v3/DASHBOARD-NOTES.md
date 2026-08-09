# Dashboard — what I changed from the mockup, and why

Everything visual is as drawn: the midnight sidebar, the white cards on
grey, the four stat tiles, the funnel, the line chart, the agent table
and the activity feed. Four things underneath are different.

## 1. Five temperature items became one

The mockup has **Hot Potatoes, New Potatoes, Warm Potatoes, Cold Potatoes
and Dead Potatoes** as five top-level nav items.

They are the same screen filtered five ways. Five permanent items that
all open one list is how a sidebar becomes something people stop reading
— and **Dead Potatoes as a permanent destination is a link nobody clicks
twice.**

What is here instead: **Hot potatoes stays top-level with a count**,
because it is the list an agent actually lives in. The rest are filters
inside All leads.

The distinction is worth keeping: *hot* earns a permanent place because
it is a working queue. *Dead* does not, because it is an archive.

## 2. "Revenue $8.42M" became "Commission earned AED 1.84M"

**Revenue on a brokerage dashboard is ambiguous**, and the two readings
differ by roughly a factor of fifty. A principal glancing at $8.42M might
reasonably read it as money the firm made — on a 2% commission it is
property value, and the firm made about $170K.

A number a manager can misread in their favour is a number that causes a
conversation later. The label says which one it is.

Also AED, because that is what the invoices and the VAT are in.

## 3. The charts are inline SVG, not a library

A dashboard that pulls 300KB of charting code to draw eleven points is a
dashboard that is slow on the office wifi it will actually be opened on.
Both charts carry `role="img"` and a real `aria-label` describing the
trend, so a screen reader gets the shape rather than a blank box.

## 4. The agent table says what it is ranked on

**Viewings booked, not reply speed**, with the reason underneath: rank
on reply speed and within a fortnight everybody is answering "ok" at
eleven at night to move a number that then measures nothing.

Your own row is highlighted. An agent scanning a board looks for
themselves first, and making them hunt is a small unkindness repeated
forty times a day.

## One thing to be careful with

**The numbers on this screen are sample data.** That is normal and fine
for a product screenshot — nobody expects a dashboard mock to show an
empty database.

It stops being fine the moment it appears in marketing. A screenshot on a
homepage showing *34 deals closed, AED 1.84M commission* is a claim about
the company, not a picture of software, and it is the same defect as the
25K-users bar for the same reason.

**If this goes on the website, the numbers get replaced with a real
brokerage's, with their permission — or the screenshot gets cropped to
the parts with no figures in.**
