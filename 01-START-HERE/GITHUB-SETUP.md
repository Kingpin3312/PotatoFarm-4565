# Putting this on GitHub

Written for somebody who has never used GitHub. No command line.

## First — do you even need it?

**You can use Claude Code right now without GitHub.** It works on the
folder on your computer.

But you want GitHub anyway, for one reason: **if your laptop dies or the
folder gets deleted, the work is gone.** GitHub is the backup. It also
means you can see what changed and undo mistakes.

Twenty minutes, once.

---

## The one rule

**Make the repository PRIVATE.**

There is a moment in the setup where it asks Public or Private. Private
means only you can see it. Public means anybody on the internet can read
every file.

There are no passwords in this project — I checked. But you will add
some later, and a private repository from day one is the habit that
protects you.

---

## Step 1 — Make a GitHub account

1. Go to **github.com**
2. Click **Sign up**
3. Use your work email
4. Pick any username — it does not matter
5. Confirm the email they send you

Free is fine. Private repositories are included.

## Step 2 — Install GitHub Desktop

This is the app that does the technical part for you.

1. Go to **desktop.github.com**
2. Click **Download**
3. Install it like any other app
4. Open it and sign in with the account from Step 1

## Step 3 — Get the project folder ready

1. Find the `POTATOFARM-COMPLETE.zip` you downloaded
2. Double-click to unzip it — you get a folder called **handover**
3. **Rename that folder to `potatofarm`**
4. Move it somewhere sensible — Documents is fine

## Step 4 — Turn the folder into a repository

In GitHub Desktop:

1. **File** → **Add local repository**
2. Click **Choose** and select your `potatofarm` folder
3. It will say *"this directory does not appear to be a Git
   repository"* — this is expected. Click **create a repository**
4. Name: `potatofarm`
5. Leave everything else as it is
6. Click **Create repository**

It will now list every file it is about to save. That is right.

## Step 5 — Save the first version

At the bottom left:

1. In the **Summary** box type: `Initial project`
2. Click **Commit to main**

That saves a snapshot on your computer. Nothing is online yet.

## Step 6 — Put it online, privately

1. Click **Publish repository** at the top
2. **Make sure "Keep this code private" is TICKED.** This is the
   important step
3. Click **Publish repository**

Done. Your work is now backed up.

---

## From now on

Every time you finish something in Claude Code, go to GitHub Desktop:

1. Type a few words in the Summary box saying what you did
2. Click **Commit to main**
3. Click **Push origin**

Three clicks. Do it at the end of each session and you can always go
back.

---

## What NOT to do

**Never put real passwords or API keys in a file called `.env` and then
commit it.** There is a `.gitignore` file in this project that prevents
it automatically — do not delete it.

If you ever think a key has been uploaded by mistake: **do not just
delete the file.** The history keeps it. Go to the service it belongs to
(Stripe, Anthropic, whichever) and generate a new key. That is the only
real fix.

---

## Then connect Claude Code

Open Claude Code, point it at your `potatofarm` folder, and say:

> Read PROJECT_CONTEXT.md, then read app/CLAUDE.md. Don't change
> anything yet — tell me what you've understood.

That gets it up to speed on everything without you having to explain it.
