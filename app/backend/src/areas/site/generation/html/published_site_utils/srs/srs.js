function W(e) {
  return e.replace(/\s+/g, " ").trim();
}
function le(e) {
  return W(e.replace(/<[^>]+>/g, " "));
}
function N(e, t, r, n, o, s, w) {
  const a = W(n), m = W(o), b = le(a);
  return {
    id: t,
    siteGuid: e.siteGuid,
    pageId: e.pageId,
    sourceId: e.sourceId,
    siblingGroupKey: r,
    format: s,
    direction: w,
    promptHtml: a,
    answerHtml: m,
    searchText: b,
    contextPath: e.contextPath ?? []
  };
}
function j(e, t) {
  return e.getAttribute(t)?.trim() ?? "";
}
function ce(e, t) {
  return j(e, "sibling-group") || t;
}
function ue(e, t) {
  if (t.tagName !== "MEADOW-SRS-CARD")
    return [];
  const r = j(t, "guid"), n = j(t, "kind");
  if (!r)
    return [];
  const o = ce(t, r), s = t.querySelector("meadow-srs-prompt"), w = t.querySelector("meadow-srs-answer");
  if (!s || !w)
    return [];
  const a = s.innerHTML.trim(), m = w.innerHTML.trim();
  return !a || !m ? [] : n === "basic" ? [N(e, r, o, a, m, "single-basic", "forward")] : n === "bidirectional" ? [
    N(e, `${r}:forward`, o, a, m, "single-bidirectional", "forward"),
    N(e, `${r}:reverse`, o, m, a, "single-bidirectional", "reverse")
  ] : n === "multiline-basic" ? [N(e, r, o, a, m, "multiline-basic", "forward")] : n === "multiline-bidirectional" ? [
    N(e, `${r}:forward`, o, a, m, "multiline-bidirectional", "forward"),
    N(e, `${r}:reverse`, o, m, a, "multiline-bidirectional", "reverse")
  ] : n === "cloze" ? [N(e, r, o, a, m, "cloze", "cloze")] : [];
}
const me = "meadow:srs";
function V(e) {
  return `${me}:${e}`;
}
function fe(e = window.localStorage) {
  return {
    load: (t) => e.getItem(t),
    save: (t, r) => e.setItem(t, r),
    clear: (t) => e.removeItem(t)
  };
}
const K = 60 * 1e3, pe = 60 * K, D = 24 * pe;
function B(e) {
  return Math.min(3.2, Math.max(1.3, e));
}
function we(e, t) {
  let r = 0;
  const n = `${e}:${t}`;
  for (let o = 0; o < n.length; o += 1)
    r = (r * 31 + n.charCodeAt(o)) % 1e3;
  return r / 1e3 * 0.1 - 0.05;
}
function ge(e, t, r) {
  return e < D ? e : Math.max(D, Math.floor(e * (1 + we(t, r))));
}
function be(e, t, r) {
  const n = { ...e }, o = e.reviewCount === 0, s = Math.max(e.intervalMs, o ? 0 : D);
  return t === "again" ? (n.intervalMs = o ? 10 * K : Math.max(30 * K, Math.floor(s * 0.2)), n.easeFactor = B(e.easeFactor - 0.2), n.lapseCount += 1) : t === "hard" ? (n.intervalMs = o ? D : Math.max(D, Math.floor(s * 1.2)), n.easeFactor = B(e.easeFactor - 0.15)) : t === "good" ? n.intervalMs = o ? 2 * D : Math.max(D, Math.floor(s * e.easeFactor)) : (n.intervalMs = o ? 4 * D : Math.max(D, Math.floor(s * (e.easeFactor + 0.3) * 1.15)), n.easeFactor = B(e.easeFactor + 0.15)), n.reviewCount += 1, n.lastReviewedAt = r.toISOString(), n.intervalMs = ge(n.intervalMs, e.cardId, n.reviewCount), delete n.buriedUntil, n.dueAt = new Date(r.getTime() + n.intervalMs).toISOString(), n;
}
const Q = {
  singleLineSeparator: "::",
  bidirectionalSeparator: ":::",
  multilineSeparator: "?",
  multilineBidirectionalSeparator: "??",
  endDelimiter: "+++",
  clozePatterns: [
    "==answer==[^\\[hint\\]][\\[^123\\]]",
    "{{[123::]answer[::hint]}}",
    "**answer**"
  ],
  burySiblingCards: !0,
  showContext: !0,
  defaultReviewMode: "due"
};
function he(e) {
  return {
    ...Q,
    ...e,
    clozePatterns: e?.clozePatterns && e.clozePatterns.length > 0 ? e.clozePatterns : Q.clozePatterns
  };
}
const ve = 0, ye = 2.5, Ce = 1440 * 60 * 1e3;
function Se() {
  return {
    now: () => /* @__PURE__ */ new Date()
  };
}
function U() {
  return {
    version: 1,
    cards: {}
  };
}
function Z(e, t) {
  const r = t.load(V(e));
  if (!r)
    return U();
  try {
    const n = JSON.parse(r);
    return n.version !== 1 || typeof n.cards != "object" || n.cards === null ? U() : n;
  } catch {
    return U();
  }
}
function ee(e, t, r) {
  t.save(V(e), JSON.stringify(r));
}
function Me(e, t) {
  t.clear(V(e));
}
function ie(e, t, r) {
  const n = e.cards[t.id];
  if (n)
    return n;
  const o = {
    cardId: t.id,
    intervalMs: ve,
    easeFactor: ye,
    dueAt: r.toISOString(),
    reviewCount: 0,
    lapseCount: 0
  };
  return e.cards[t.id] = o, o;
}
function q(e, t, r) {
  const n = r.now();
  return e.map((o) => {
    const s = ie(t, o, n);
    s.buriedUntil && new Date(s.buriedUntil).getTime() <= n.getTime() && delete s.buriedUntil;
    const w = new Date(s.dueAt).getTime() - n.getTime(), a = !!s.buriedUntil && new Date(s.buriedUntil).getTime() > n.getTime();
    return {
      definition: o,
      state: s,
      due: w <= 0,
      dueInMs: w,
      newCard: s.reviewCount === 0,
      buried: a
    };
  });
}
function Ee(e, t, r, n) {
  const o = n.now(), s = e.find((a) => a.id === r);
  if (!s)
    return;
  const w = new Date(o);
  w.setUTCHours(24, 0, 0, 0);
  for (const a of e) {
    if (a.id === r || a.siblingGroupKey !== s.siblingGroupKey)
      continue;
    const m = ie(t, a, o);
    (new Date(m.dueAt).getTime() <= o.getTime() + Ce || m.reviewCount === 0) && (m.buriedUntil = w.toISOString());
  }
}
const te = 60 * 1e3;
function z(e, t, r) {
  return { atMs: e, label: t, cardId: r };
}
function _e(e, t) {
  const r = /* @__PURE__ */ new Map();
  r.set(t.getTime(), z(t.getTime(), "Current time"));
  for (const n of e) {
    const o = new Date(n.state.dueAt).getTime(), s = n.definition.searchText || n.definition.id, w = [
      z(o - te, `1 minute before "${s}" is due`, n.definition.id),
      z(o, `"${s}" becomes due`, n.definition.id),
      z(o + te, `1 minute after "${s}" is due`, n.definition.id)
    ];
    for (const a of w)
      r.set(a.atMs, a);
  }
  return [...r.values()].sort((n, o) => n.atMs - o.atMs);
}
function f(e, t) {
  const r = document.createElement(e);
  return t && (r.className = t), r;
}
function ne(e) {
  if (e.buried)
    return "Buried until tomorrow";
  if (e.newCard)
    return null;
  if (e.due)
    return "Due now";
  const t = Math.ceil(e.dueInMs / (60 * 1e3));
  if (t < 60)
    return `Due in ${t} ${t === 1 ? "minute" : "minutes"}`;
  const r = Math.ceil(t / 60);
  if (r < 24)
    return `Due in ${r} ${r === 1 ? "hour" : "hours"}`;
  const n = Math.ceil(r / 24);
  return `Due in ${n} ${n === 1 ? "day" : "days"}`;
}
function xe(e) {
  return /^H[1-6]$/.test(e.tagName);
}
function Te(e, t) {
  return [...e.slice(0, Math.max(t - 1, 0))];
}
function Ie(e) {
  return [{
    html: e.outerHTML,
    text: e.textContent?.trim() ?? ""
  }];
}
function ke(e, t, r, n, o, s) {
  const a = ue({
    siteGuid: e,
    pageId: t,
    sourceId: r,
    contextPath: s
  }, n[0]);
  return a.length === 0 ? null : {
    mountElement: f("div", "meadow-srs-upgraded"),
    sourceId: r,
    originalElements: n,
    blocks: o,
    contextPath: s,
    definitions: a
  };
}
function De(e, t, r) {
  const n = e.querySelector("main");
  if (!n)
    return [];
  const o = [];
  let s = [], w = 0;
  const a = (m) => {
    Array.from(m.children).forEach((b) => {
      if (b instanceof HTMLElement) {
        if (xe(b)) {
          const y = Number.parseInt(b.tagName.slice(1), 10), S = Te(s, y);
          S[y - 1] = b.textContent?.trim() ?? "", s = S.filter(Boolean);
          return;
        }
        if (b.tagName === "MEADOW-SRS-CARD") {
          const y = b.getAttribute("guid")?.trim() || `source-${w}`, S = ke(
            t,
            r,
            y,
            [b],
            Ie(b),
            [...s]
          );
          w += 1, S && o.push(S);
          return;
        }
        a(b);
      }
    });
  };
  return a(n), o.forEach((m) => {
    const b = m.originalElements[0];
    b.parentNode && b.parentNode.insertBefore(m.mountElement, b), m.originalElements.forEach((y) => {
      y.remove();
    });
  }), o;
}
function Le() {
  const e = globalThis.__MEADOW_SRS_CONFIG__, t = document.body.dataset, r = {};
  return t.meadowSrsEndDelimiter && (r.endDelimiter = t.meadowSrsEndDelimiter), (t.meadowSrsReviewMode === "due" || t.meadowSrsReviewMode === "cram") && (r.defaultReviewMode = t.meadowSrsReviewMode), (t.meadowSrsBurySiblings === "true" || t.meadowSrsBurySiblings === "false") && (r.burySiblingCards = t.meadowSrsBurySiblings === "true"), {
    ...e,
    ...r
  };
}
function J(e) {
  return e.replace(/\s+/g, " ").trim();
}
function Ae(e) {
  return J(e.replace(/<[^>]+>/g, " "));
}
function O(e, t, r, n, o, s, w) {
  const a = J(n), m = J(o);
  return {
    id: t,
    siteGuid: e.siteGuid,
    pageId: e.pageId,
    sourceId: e.sourceId,
    siblingGroupKey: r,
    format: s,
    direction: w,
    promptHtml: a,
    answerHtml: m,
    searchText: Ae(a),
    contextPath: e.contextPath ?? []
  };
}
function He(e) {
  const t = e.root ?? document, r = e.clock ?? Se(), n = e.persistence ?? fe(), o = he({
    ...Le(),
    ...e.settings
  }), s = De(t, e.siteGuid, e.pageId), w = s.flatMap((i) => i.definitions), a = Z(e.siteGuid, n), m = /* @__PURE__ */ new Set(), b = /* @__PURE__ */ new Set();
  let y = [], S = o.defaultReviewMode, P = "page", L = null, E = null, I = 0, R = null;
  const Y = async () => {
    if (R === null)
      try {
        const i = e.pageId.split("/").filter(Boolean).length - 1, l = "../".repeat(i) + "_mw_assets/srs/", u = await fetch(`${l}srs-all-cards.json`);
        if (!u.ok) throw new Error(`HTTP ${u.status}`);
        R = (await u.json()).cards.flatMap((c) => {
          const _ = {
            siteGuid: e.siteGuid,
            pageId: c.pageId,
            sourceId: c.guid,
            contextPath: [c.pageTitle]
          }, M = c.siblingGroup || c.guid;
          if (c.kind === "basic" || c.kind === "multiline-basic") {
            const v = c.kind === "basic" ? "single-basic" : "multiline-basic";
            return [O(_, c.guid, M, c.promptHtml, c.answerHtml, v, "forward")];
          }
          if (c.kind === "bidirectional" || c.kind === "multiline-bidirectional") {
            const v = c.kind === "bidirectional" ? "single-bidirectional" : "multiline-bidirectional";
            return [
              O(_, `${c.guid}:forward`, M, c.promptHtml, c.answerHtml, v, "forward"),
              O(_, `${c.guid}:reverse`, M, c.answerHtml, c.promptHtml, v, "reverse")
            ];
          }
          return c.kind === "cloze" ? [O(_, c.guid, M, c.promptHtml, c.answerHtml, "cloze", "cloze")] : [];
        });
      } catch {
        R = [];
      }
  }, oe = () => {
    if (P === "page" || R === null)
      return w;
    const i = new Set(w.map((u) => u.id)), l = R.filter((u) => !i.has(u.id));
    return [...w, ...l];
  }, F = () => {
    const i = [...y].sort((l, u) => {
      const C = l.due && !l.newCard ? 0 : 1, c = u.due && !u.newCard ? 0 : 1;
      return C !== c ? C - c : l.definition.searchText.localeCompare(u.definition.searchText);
    });
    return S === "cram" ? i : i.filter((l) => !l.buried && l.due && !l.newCard);
  }, ae = () => {
    e.onStateChange?.(a, y);
  }, G = (i, l) => {
    a.cards[i.definition.id] = be(i.state, l, r.now()), o.burySiblingCards && S === "due" && Ee(w, a, i.definition.id, r), ee(e.siteGuid, n, a), m.delete(i.definition.id), b.delete(i.definition.id), A();
  }, se = () => {
    L?.remove(), L = null, s.length !== 0 && (L = f("button", "meadow-srs-launcher"), L.type = "button", L.textContent = "Review", L.addEventListener("click", () => {
      E || (E = de(), e.overlayContainer ? (E.classList.add("meadow-srs-overlay--contained"), e.overlayContainer.appendChild(E)) : document.body.appendChild(E)), E.classList.add("is-open"), $();
    }), document.body.appendChild(L));
  }, X = (i, l = !1) => {
    const u = f("article", "meadow-srs-card"), C = l || !i.buried && (i.due || i.newCard) || b.has(i.definition.id), c = m.has(i.definition.id);
    if (C) {
      const p = ne(i);
      if (p) {
        const d = f("span", "meadow-srs-card__status meadow-srs-card__status--float");
        d.textContent = p, u.appendChild(d);
      }
    }
    if (!C) {
      if (u.classList.add("meadow-srs-card--dormant"), u.style.cursor = "pointer", u.addEventListener("click", () => {
        b.add(i.definition.id), A();
      }), i.buried) {
        const p = f("div", "meadow-srs-card__dormant-text");
        p.textContent = "Temporarily buried by sibling review.", u.appendChild(p);
      } else {
        const p = f("div", "meadow-srs-card__dormant-prompt"), d = f("span", "meadow-srs-card__dormant-due"), k = ne(i) || "Not yet due";
        d.textContent = k, p.appendChild(d);
        const x = f("span", "meadow-srs-card__dormant-question");
        x.innerHTML = i.definition.promptHtml, p.appendChild(x), u.appendChild(p);
      }
      return u;
    }
    if (l && P === "site" && i.definition.contextPath.length > 0) {
      const p = f("div", "meadow-srs-card__context");
      p.textContent = i.definition.contextPath.join(" > "), u.appendChild(p);
    }
    const _ = f("div", "meadow-srs-card__prompt");
    _.innerHTML = i.definition.promptHtml, u.appendChild(_);
    const M = f("div", "meadow-srs-card__answer");
    c && (M.innerHTML = i.definition.answerHtml, M.classList.add("is-visible")), u.appendChild(M);
    const v = f("div", "meadow-srs-card__controls");
    if (c)
      ["again", "hard", "good", "easy"].forEach((p) => {
        const d = f("button", `meadow-srs-button meadow-srs-button--${p}`);
        d.type = "button", d.textContent = p[0].toUpperCase() + p.slice(1), d.addEventListener("click", () => G(i, p)), v.appendChild(d);
      });
    else {
      const p = f("button", "meadow-srs-button");
      p.type = "button", p.textContent = "Show answer", p.addEventListener("click", () => {
        m.add(i.definition.id), A();
      }), v.appendChild(p);
    }
    return u.appendChild(v), u;
  }, de = () => {
    const i = f("div", "meadow-srs-overlay"), l = f("div", "meadow-srs-overlay__panel"), u = f("div", "meadow-srs-overlay__tab-bar");
    ["page", "site"].forEach((g) => {
      const T = f("button", "meadow-srs-overlay__tab");
      T.type = "button", T.dataset.scope = g, T.addEventListener("click", async () => {
        P = g, g === "site" && await Y(), I = 0, A();
      }), u.appendChild(T);
    }), Y().then(() => $());
    const C = f("button", "meadow-srs-overlay__close");
    C.type = "button", C.textContent = "×", C.addEventListener("click", () => {
      i.classList.remove("is-open");
    }), u.appendChild(C);
    const c = f("div", "meadow-srs-overlay__header"), _ = f("div", "meadow-srs-overlay__title-block"), M = f("h2", "meadow-srs-overlay__title");
    M.textContent = "Prompt Review";
    const v = f("div", "meadow-srs-overlay__subtitle");
    v.dataset.role = "overlay-subtitle", _.append(M, v);
    const p = f("div", "meadow-srs-overlay__modes");
    ["due", "cram"].forEach((g) => {
      const T = f("button", "meadow-srs-button meadow-srs-button--subtle");
      T.type = "button", T.textContent = g === "due" ? "Due" : "Cram", T.dataset.mode = g, T.addEventListener("click", () => {
        S = g, I = 0, $();
      }), p.appendChild(T);
    }), c.append(_, p);
    const d = f("div", "meadow-srs-overlay__body");
    d.dataset.role = "overlay-body";
    const k = f("div", "meadow-srs-overlay__footer"), x = f("button", "meadow-srs-button meadow-srs-button--subtle");
    x.type = "button", x.textContent = "Previous", x.addEventListener("click", () => {
      I = Math.max(0, I - 1), $();
    });
    const h = f("button", "meadow-srs-button meadow-srs-button--subtle");
    return h.type = "button", h.textContent = "Next", h.addEventListener("click", () => {
      I += 1, $();
    }), k.append(x, h), l.append(u, c, d, k), i.appendChild(l), i.addEventListener("keydown", (g) => {
      if (!i.classList.contains("is-open"))
        return;
      const T = F(), H = T[Math.min(I, Math.max(T.length - 1, 0))];
      if (H) {
        if ((g.key === " " || g.key === "Enter") && !m.has(H.definition.id)) {
          g.preventDefault(), m.add(H.definition.id), A();
          return;
        }
        if (g.key === "Escape") {
          i.classList.remove("is-open");
          return;
        }
        m.has(H.definition.id) && (g.key === "1" ? G(H, "again") : g.key === "2" ? G(H, "hard") : g.key === "3" ? G(H, "good") : g.key === "4" && G(H, "easy"));
      }
    }), i.tabIndex = -1, i;
  }, $ = () => {
    if (!E)
      return;
    const i = E.querySelector('[data-role="overlay-subtitle"]'), l = E.querySelector('[data-role="overlay-body"]');
    if (!i || !l)
      return;
    E.querySelectorAll("[data-mode]").forEach((d) => {
      d.classList.toggle("is-active", d.dataset.mode === S);
    });
    const u = q(w, a, r), C = u.filter((d) => !d.buried && d.due && !d.newCard).length, c = u.filter((d) => !d.buried && d.newCard).length;
    let _ = null, M = null;
    if (R !== null) {
      const d = new Set(w.map((h) => h.id)), k = [...w, ...R.filter((h) => !d.has(h.id))], x = q(k, a, r);
      _ = x.filter((h) => !h.buried && h.due && !h.newCard).length, M = x.filter((h) => !h.buried && h.newCard).length;
    }
    E.querySelectorAll(".meadow-srs-overlay__tab").forEach((d) => {
      d.classList.toggle("is-active", d.dataset.scope === P), d.replaceChildren();
      const k = document.createTextNode(d.dataset.scope === "page" ? "This page" : "All pages");
      d.appendChild(k);
      const x = d.dataset.scope === "page" ? C : _, h = d.dataset.scope === "page" ? c : M;
      if (x !== null) {
        const g = f("span", "meadow-srs-tab-badge");
        g.textContent = `${x} due`, d.appendChild(g);
      }
      if (h !== null && h > 0) {
        const g = f("span", "meadow-srs-tab-badge meadow-srs-tab-badge--new");
        g.textContent = `${h} new`, d.appendChild(g);
      }
    });
    const v = F();
    if (v.length === 0) {
      if (S === "due") {
        const d = y.filter((k) => !k.buried && k.newCard).length;
        d > 0 ? i.textContent = `Nothing due right now. ${d} new ${d === 1 ? "prompt" : "prompts"} available in the material.` : i.textContent = "Nothing due right now. Switch to Cram to walk every prompt.";
      } else
        i.textContent = P === "page" ? "No prompts found on this page." : "No prompts found across the site.";
      l.replaceChildren();
      return;
    }
    I = Math.min(I, v.length - 1);
    const p = v[I];
    i.textContent = `${I + 1} / ${v.length} in ${S === "due" ? "due review" : "cram review"}`, l.replaceChildren(X(p, !0)), requestAnimationFrame(() => {
      E?.focus();
    });
  }, A = () => {
    y = q(oe(), a, r), ee(e.siteGuid, n, a), s.forEach((i) => {
      i.mountElement.replaceChildren(), y.filter((l) => l.definition.sourceId === i.sourceId).forEach((l) => {
        i.mountElement.appendChild(X(l));
      });
    }), se(), $(), ae();
  };
  return A(), {
    destroy: () => {
      s.forEach((i) => {
        i.mountElement.parentNode && i.originalElements.forEach((l) => {
          i.mountElement.parentNode?.insertBefore(l, i.mountElement);
        }), i.mountElement.remove();
      }), L?.remove(), E?.remove();
    },
    refresh: A,
    clearState: () => {
      Me(e.siteGuid, n);
      const i = Z(e.siteGuid, n);
      Object.keys(a.cards).forEach((l) => {
        delete a.cards[l];
      }), Object.assign(a, i), m.clear(), b.clear(), I = 0, A();
    },
    setReviewMode: (i) => {
      S = i, I = 0, $();
    },
    getReviewMode: () => S,
    getStore: () => a,
    getRuntimeCards: () => y,
    getVisibleReviewCards: F,
    getWaypoints: () => _e(y, r.now()),
    getDebugSourceGroups: () => s.map((i) => ({
      sourceId: i.sourceId,
      mountElement: i.mountElement,
      contextPath: [...i.contextPath],
      blocks: i.blocks.map((l) => ({ ...l })),
      cardIds: i.definitions.map((l) => l.id)
    })),
    rateCard: (i, l) => {
      const u = y.find((C) => C.definition.id === i);
      u && G(u, l);
    }
  };
}
function re() {
  const e = document.body.dataset.meadowSrsSiteGuid, t = document.body.dataset.meadowSrsPageId;
  return !e || !t ? null : He({ siteGuid: e, pageId: t });
}
document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", () => {
  re();
}, { once: !0 }) : re();
