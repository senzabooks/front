// /public/scripts/works-unlock.js
// ✅ Works unlock overlay controller (ViewTransitions-safe)
// ✅ No duplicate listeners
// ✅ Locked projects do NOTHING when locked
// ✅ Unlock form submits via AJAX (wrong password stays open)

(() => {
  const STORAGE_KEY = "private_ui_until";
  const TEN_MIN = 10 * 60 * 1000;

  const elTarget = (e) =>
    e?.target instanceof Element ? e.target : e?.target?.parentElement;

  function getOverlay() {
    return document.querySelector("[data-unlock-overlay]");
  }

  function openOverlay() {
    const overlay = getOverlay();
    if (!overlay) return;

    overlay.classList.add("is-open");
    overlay.setAttribute("aria-hidden", "false");

    const input = overlay.querySelector("input[name='password']");
    if (input) setTimeout(() => input.focus(), 0);
  }

  function closeOverlay() {
    const overlay = getOverlay();
    if (!overlay) return;

    overlay.classList.remove("is-open");
    overlay.setAttribute("aria-hidden", "true");

    // hide error when closing
    const err = overlay.querySelector("[data-unlock-error]");
    if (err) err.hidden = true;
  }

  function setUnlockedFor10Min() {
    localStorage.setItem(STORAGE_KEY, String(Date.now() + TEN_MIN));
  }

  function isUnlockedNow() {
    const until = Number(localStorage.getItem(STORAGE_KEY) || 0);
    if (!until) return false;

    const ok = Date.now() < until;
    if (!ok) localStorage.removeItem(STORAGE_KEY);
    return ok;
  }

  function syncUnlockedUI() {
    document.documentElement.classList.toggle("works-unlocked", isUnlockedNow());
  }

  function handleUnlockRedirectParams() {
    const url = new URL(window.location.href);

    if (url.searchParams.get("unlock") === "open") {
      openOverlay();
      url.searchParams.delete("unlock");
      window.history.replaceState({}, "", url.pathname + url.search);
    }

    if (url.searchParams.get("unlock") === "ok") {
      setUnlockedFor10Min();
      syncUnlockedUI(); // ✅ IMPORTANT: reflect unlock immediately
      url.searchParams.delete("unlock");
      window.history.replaceState({}, "", url.pathname + url.search);
    }

    if (url.searchParams.get("unlock") === "fail") {
      openOverlay();
      url.searchParams.delete("unlock");
      window.history.replaceState({}, "", url.pathname + url.search);
    }
  }

  function bindUnlockFormOnce() {
    const overlay = getOverlay();
    if (!overlay) return;

    const form = overlay.querySelector("[data-unlock-form]");
    if (!form || form.__bound) return;
    form.__bound = true;

    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      const errorEl = overlay.querySelector("[data-unlock-error]");
      if (errorEl) errorEl.hidden = true;

      const input = form.querySelector("input[name='password']");
      const btn = form.querySelector("button[type='submit']");
      if (btn) btn.disabled = true;

      try {
        const body = new URLSearchParams(new FormData(form)).toString();

        const res = await fetch(form.action, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Accept: "application/json",
          },
          body,
          credentials: "include",
        });

        const data = await res.json().catch(() => null);

        if (!data?.ok) {
          if (errorEl) errorEl.hidden = false;
          if (input) {
            input.focus();
            input.select();
          }
          return;
        }

        // ✅ success: unlock
        setUnlockedFor10Min();
        syncUnlockedUI();

        if (input) input.value = "";
        closeOverlay();
      } catch (err) {
        console.warn("Unlock submit error:", err);
        if (errorEl) {
          errorEl.hidden = false;
          errorEl.textContent = "Error. Try again.";
        }
      } finally {
        if (btn) btn.disabled = false;
      }
    });
  }

  function initOnEveryNavigation() {
    closeOverlay();
    handleUnlockRedirectParams();
    syncUnlockedUI();
    bindUnlockFormOnce();
  }

  // ✅ ONE global delegated click handler
  function onClick(e) {
    const t = elTarget(e);
    if (!t) return;

    // footer unlock button
    if (t.closest?.("[data-open-unlock]")) {
      openOverlay();
      return;
    }

    // 🔒 locked item click → do nothing (no overlay, no navigation)
    const lockedLink = t.closest?.("a[data-locked='true']");
    if (
      lockedLink &&
      !document.documentElement.classList.contains("works-unlocked")
    ) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    // backdrop closes
    if (t.closest?.("[data-unlock-backdrop]")) {
      closeOverlay();
      return;
    }
  }

  function onKeydown(e) {
    if (e.key === "Escape") closeOverlay();
  }

  // ✅ bind listeners once
  if (!window.__worksUnlockBound) {
    document.addEventListener("click", onClick);
    window.addEventListener("keydown", onKeydown);
    window.__worksUnlockBound = true;
  }

  // ✅ initial + after ViewTransitions
  document.addEventListener("astro:page-load", initOnEveryNavigation);
  initOnEveryNavigation();
})();
