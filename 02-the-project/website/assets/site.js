/**
 * Scroll reveals.
 *
 * Rules, and they are the whole file:
 *
 *   1. Never on the hero. Above the fold must be present on first paint
 *      — an empty screen for 600ms while JavaScript boots is the worst
 *      first impression available, and on a slow connection it is longer.
 *   2. Once. Elements do not re-animate when scrolled back to. Repeated
 *      motion is the difference between a site that feels considered and
 *      one that feels like a demo.
 *   3. Off entirely under prefers-reduced-motion. Not faster — off.
 */
(function () {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const items = document.querySelectorAll("[data-reveal]");

  // No JavaScript, or motion is unwanted: everything is simply visible.
  // The CSS starts hidden only once this script confirms it can run,
  // so a failed script leaves a readable page rather than a blank one.
  if (reduced || !("IntersectionObserver" in window)) {
    items.forEach((el) => el.classList.add("is-in"));
    return;
  }

  document.documentElement.classList.add("reveal-ready");

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const delay = Number(entry.target.dataset.reveal) || 0;
        setTimeout(() => entry.target.classList.add("is-in"), delay);
        io.unobserve(entry.target);
      });
    },
    // Fires slightly before the element is fully in view, so the motion
    // has finished by the time it is being read rather than starting then.
    { rootMargin: "0px 0px -12% 0px", threshold: 0.01 }
  );

  items.forEach((el) => io.observe(el));
})();

/**
 * The conversation demo.
 *
 * Plays once when it comes into view, then rests. Not a loop — a loop
 * turns the product into wallpaper, and a visitor who looks away and
 * back should not find it mid-cycle.
 */
(function () {
  const thread = document.querySelector("[data-thread]");
  if (!thread) return;

  const rows = [...thread.querySelectorAll("[data-msg]")];
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (reduced || !("IntersectionObserver" in window)) {
    rows.forEach((r) => r.classList.add("is-in"));
    return;
  }

  rows.forEach((r) => r.classList.add("pending"));

  new IntersectionObserver((entries, obs) => {
    if (!entries[0].isIntersecting) return;
    obs.disconnect();
    rows.forEach((row, i) => {
      // Outbound messages land faster than inbound, because that is the
      // claim: the reply is quick. The timing is the argument.
      setTimeout(() => row.classList.add("is-in"), 400 + i * 620);
    });
  }, { threshold: 0.4 }).observe(thread);
})();

/**
 * Sticky nav.
 *
 * The hairline only appears once the page has scrolled. At rest the bar
 * is invisible against the ground, which is what makes the top of the
 * page feel open.
 */
(function () {
  const nav = document.querySelector("[data-nav]");
  if (!nav) return;
  const onScroll = () => nav.classList.toggle("is-stuck", window.scrollY > 8);
  onScroll();
  addEventListener("scroll", onScroll, { passive: true });
})();


/**
 * The subscribe form.
 *
 * Submits without leaving the page when JavaScript is available, and
 * posts normally when it is not — the form has a real `action` and
 * `method`, so a reader with a blocked script still gets the guide.
 *
 * Everything happens in place. No redirect to a thank-you page, because
 * a reader who has just finished an article should end up back where
 * they were rather than somewhere new.
 */
/**
 * The booking form.
 *
 * The endpoint returns field-level errors on a 422, so each message lands
 * under the field it belongs to rather than as one line at the top saying
 * "some details need checking" — which tells somebody there is a problem
 * and not where.
 *
 * `startedAt` is stamped when the page loads and sent with the
 * submission. The server rejects anything filled in under three seconds:
 * nobody types six fields that fast, and a bot always does.
 */
document.querySelectorAll("[data-demo]").forEach(function (form) {
  var startedAt = Date.now();
  var note = form.querySelector("[data-note]");
  var button = form.querySelector("button[type=submit]");
  var resting = note ? note.textContent : "";

  function fieldFor(name) {
    return form.querySelector('[data-for="' + name + '"]');
  }

  function clearErrors() {
    form.querySelectorAll("[data-for]").forEach(function (f) {
      f.removeAttribute("data-invalid");
      var slot = f.querySelector("[data-err]");
      if (slot) slot.textContent = "";
    });
  }

  /**
   * Put each message under its field, and move focus to the first one.
   * Without the focus move, a person who submits from the bottom of a
   * long form on a phone gets an error they cannot see.
   */
  function showErrors(fields) {
    var first = null;
    Object.keys(fields || {}).forEach(function (name) {
      var wrap = fieldFor(name);
      if (!wrap) return;
      var messages = fields[name];
      if (!messages || !messages.length) return;
      wrap.setAttribute("data-invalid", "");
      var slot = wrap.querySelector("[data-err]");
      if (slot) slot.textContent = messages[0];
      if (!first) first = wrap.querySelector("input, select, textarea");
    });
    if (first) first.focus();
    return first !== null;
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    clearErrors();

    var data = new FormData(form);
    var payload = {
      name: (data.get("name") || "").trim(),
      company: (data.get("company") || "").trim(),
      email: (data.get("email") || "").trim(),
      // Spaces are how people write a phone number and not how E.164
      // wants one. Strip them here rather than rejecting a number that
      // is perfectly correct apart from the way it is spaced.
      phone: (data.get("phone") || "").replace(/[\s()\-.]/g, ""),
      teamSize: data.get("teamSize"),
      // `consent` must be the boolean true, not the string "on" a
      // checkbox sends.
      consent: data.get("consent") === "on",
      website: data.get("website") || "",
      startedAt: startedAt
    };

    var message = (data.get("message") || "").trim();
    if (message) payload.message = message;

    button.disabled = true;
    if (note) { note.textContent = "Sending…"; note.removeAttribute("data-state"); }

    fetch(form.action, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (body) {
          return { status: r.status, ok: r.ok, body: body };
        });
      })
      .then(function (res) {
        if (res.ok) {
          // The form goes. Something still sitting there after a success
          // invites somebody to wonder whether it worked and send again.
          var done = document.createElement("p");
          done.className = "dform-done";
          done.setAttribute("role", "status");
          // A paragraph is not focusable on its own, and the form that
          // held focus is about to be removed — without this, focus falls
          // back to the top of the document and a screen reader user
          // loses their place entirely.
          done.setAttribute("tabindex", "-1");
          done.textContent = "Booked. We'll come back within a working day.";
          var sub = document.createElement("p");
          sub.textContent =
            "If it's urgent, hello@potatofarm.io reaches the same person faster.";
          form.replaceWith(done);
          done.after(sub);
          done.focus();
          return;
        }

        button.disabled = false;

        if (res.status === 422 && showErrors(res.body.fields)) {
          if (note) { note.textContent = res.body.error || "Some details need checking."; note.setAttribute("data-state", "error"); }
          return;
        }

        if (note) {
          note.textContent =
            res.body.error ||
            "That didn't send. Email hello@potatofarm.io and we'll book it by hand.";
          note.setAttribute("data-state", "error");
        }
      })
      .catch(function () {
        button.disabled = false;
        if (note) {
          // Says what to do instead. "Something went wrong" leaves a
          // willing lead with nowhere to go.
          note.textContent =
            "That didn't send. Email hello@potatofarm.io and we'll book it by hand.";
          note.setAttribute("data-state", "error");
        }
      });
  });

  // Clearing the error as soon as somebody starts fixing it, rather than
  // leaving it red until they submit again.
  form.addEventListener("input", function (e) {
    var wrap = e.target.closest("[data-for]");
    if (!wrap || !wrap.hasAttribute("data-invalid")) return;
    wrap.removeAttribute("data-invalid");
    var slot = wrap.querySelector("[data-err]");
    if (slot) slot.textContent = "";
    if (note && note.getAttribute("data-state") === "error") {
      note.textContent = resting;
      note.removeAttribute("data-state");
    }
  });
});

document.querySelectorAll("[data-subscribe]").forEach(function (form) {
  var note = form.querySelector("[data-note]");
  var button = form.querySelector("button");
  var original = note ? note.textContent : "";

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var email = form.querySelector("input[type=email]").value.trim();
    if (!email) return;

    button.disabled = true;
    if (note) { note.textContent = "Sending…"; note.removeAttribute("data-state"); }

    fetch(form.action, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: email,
        from: form.querySelector("[name=from]").value,
        company: form.querySelector("[name=company]").value
      })
    })
      .then(function (r) {
        if (!r.ok) throw new Error(r.status);
        // The field goes, the note stays. A form still sitting there
        // after a success invites somebody to wonder whether it worked.
        form.querySelector("input[type=email]").remove();
        button.remove();
        if (note) {
          note.textContent = "On its way. Check your junk folder if it hasn't arrived in ten minutes.";
          note.setAttribute("data-state", "done");
        }
      })
      .catch(function () {
        button.disabled = false;
        if (note) {
          // Says what to do instead. "Something went wrong" leaves a
          // willing reader with nowhere to go.
          note.textContent = "That didn't send. Email hello@potatofarm.io and we'll send it over.";
          note.setAttribute("data-state", "error");
        }
      });
  });
});
