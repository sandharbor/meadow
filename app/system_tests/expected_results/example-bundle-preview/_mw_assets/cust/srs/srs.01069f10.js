function W(e) {
  return e.replace(/\s+/g, " ").trim();
}
function le(e) {
  return W(e.replace(/<[^>]+>/g, " "));
}
function N(e, t, r, n, i, s, w) {
  const a = W(n), m = W(i), g = le(a);
  return {
    id: t,
    bundleGuid: e.bundleGuid,
    pageId: e.pageId,
    sourceId: e.sourceId,
    siblingGroupKey: r,
    format: s,
    direction: w,
    promptHtml: a,
    answerHtml: m,
    searchText: g,
    contextPath: e.contextPath ?? []
  };
}
function j(e, t) {
  return e.getAttribute(t)?.trim() ?? "";
}
function ue(e, t) {
  return j(e, "sibling-group") || t;
}
function ce(e, t) {
  if (t.tagName !== "MEADOW-SRS-CARD")
    return [];
  const r = j(t, "guid"), n = j(t, "kind");
  if (!r)
    return [];
  const i = ue(t, r), s = t.querySelector("meadow-srs-prompt"), w = t.querySelector("meadow-srs-answer");
  if (!s || !w)
    return [];
  const a = s.innerHTML.trim(), m = w.innerHTML.trim();
  return !a || !m ? [] : n === "basic" ? [N(e, r, i, a, m, "single-basic", "forward")] : n === "bidirectional" ? [
    N(e, `${r}:forward`, i, a, m, "single-bidirectional", "forward"),
    N(e, `${r}:reverse`, i, m, a, "single-bidirectional", "reverse")
  ] : n === "multiline-basic" ? [N(e, r, i, a, m, "multiline-basic", "forward")] : n === "multiline-bidirectional" ? [
    N(e, `${r}:forward`, i, a, m, "multiline-bidirectional", "forward"),
    N(e, `${r}:reverse`, i, m, a, "multiline-bidirectional", "reverse")
  ] : n === "cloze" ? [N(e, r, i, a, m, "cloze", "cloze")] : [];
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
function F(e) {
  return Math.min(3.2, Math.max(1.3, e));
}
function we(e, t) {
  let r = 0;
  const n = `${e}:${t}`;
  for (let i = 0; i < n.length; i += 1)
    r = (r * 31 + n.charCodeAt(i)) % 1e3;
  return r / 1e3 * 0.1 - 0.05;
}
function be(e, t, r) {
  return e < D ? e : Math.max(D, Math.floor(e * (1 + we(t, r))));
}
function ge(e, t, r) {
  const n = { ...e }, i = e.reviewCount === 0, s = Math.max(e.intervalMs, i ? 0 : D);
  return t === "again" ? (n.intervalMs = i ? 10 * K : Math.max(30 * K, Math.floor(s * 0.2)), n.easeFactor = F(e.easeFactor - 0.2), n.lapseCount += 1) : t === "hard" ? (n.intervalMs = i ? D : Math.max(D, Math.floor(s * 1.2)), n.easeFactor = F(e.easeFactor - 0.15)) : t === "good" ? n.intervalMs = i ? 2 * D : Math.max(D, Math.floor(s * e.easeFactor)) : (n.intervalMs = i ? 4 * D : Math.max(D, Math.floor(s * (e.easeFactor + 0.3) * 1.15)), n.easeFactor = F(e.easeFactor + 0.15)), n.reviewCount += 1, n.lastReviewedAt = r.toISOString(), n.intervalMs = be(n.intervalMs, e.cardId, n.reviewCount), delete n.buriedUntil, n.dueAt = new Date(r.getTime() + n.intervalMs).toISOString(), n;
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
function oe(e, t, r) {
  const n = e.cards[t.id];
  if (n)
    return n;
  const i = {
    cardId: t.id,
    intervalMs: ve,
    easeFactor: ye,
    dueAt: r.toISOString(),
    reviewCount: 0,
    lapseCount: 0
  };
  return e.cards[t.id] = i, i;
}
function q(e, t, r) {
  const n = r.now();
  return e.map((i) => {
    const s = oe(t, i, n);
    s.buriedUntil && new Date(s.buriedUntil).getTime() <= n.getTime() && delete s.buriedUntil;
    const w = new Date(s.dueAt).getTime() - n.getTime(), a = !!s.buriedUntil && new Date(s.buriedUntil).getTime() > n.getTime();
    return {
      definition: i,
      state: s,
      due: w <= 0,
      dueInMs: w,
      newCard: s.reviewCount === 0,
      buried: a
    };
  });
}
function Ee(e, t, r, n) {
  const i = n.now(), s = e.find((a) => a.id === r);
  if (!s)
    return;
  const w = new Date(i);
  w.setUTCHours(24, 0, 0, 0);
  for (const a of e) {
    if (a.id === r || a.siblingGroupKey !== s.siblingGroupKey)
      continue;
    const m = oe(t, a, i);
    (new Date(m.dueAt).getTime() <= i.getTime() + Ce || m.reviewCount === 0) && (m.buriedUntil = w.toISOString());
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
    const i = new Date(n.state.dueAt).getTime(), s = n.definition.searchText || n.definition.id, w = [
      z(i - te, `1 minute before "${s}" is due`, n.definition.id),
      z(i, `"${s}" becomes due`, n.definition.id),
      z(i + te, `1 minute after "${s}" is due`, n.definition.id)
    ];
    for (const a of w)
      r.set(a.atMs, a);
  }
  return [...r.values()].sort((n, i) => n.atMs - i.atMs);
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
function ke(e, t, r, n, i, s) {
  const a = ce({
    bundleGuid: e,
    pageId: t,
    sourceId: r,
    contextPath: s
  }, n[0]);
  return a.length === 0 ? null : {
    mountElement: f("div", "meadow-srs-upgraded"),
    sourceId: r,
    originalElements: n,
    blocks: i,
    contextPath: s,
    definitions: a
  };
}
function De(e, t, r) {
  const n = e.querySelector("main");
  if (!n)
    return [];
  const i = [];
  let s = [], w = 0;
  const a = (m) => {
    Array.from(m.children).forEach((g) => {
      if (g instanceof HTMLElement) {
        if (xe(g)) {
          const y = Number.parseInt(g.tagName.slice(1), 10), S = Te(s, y);
          S[y - 1] = g.textContent?.trim() ?? "", s = S.filter(Boolean);
          return;
        }
        if (g.tagName === "MEADOW-SRS-CARD") {
          const y = g.getAttribute("guid")?.trim() || `source-${w}`, S = ke(
            t,
            r,
            y,
            [g],
            Ie(g),
            [...s]
          );
          w += 1, S && i.push(S);
          return;
        }
        a(g);
      }
    });
  };
  return a(n), i.forEach((m) => {
    const g = m.originalElements[0];
    g.parentNode && g.parentNode.insertBefore(m.mountElement, g), m.originalElements.forEach((y) => {
      y.remove();
    });
  }), i;
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
function O(e, t, r, n, i, s, w) {
  const a = J(n), m = J(i);
  return {
    id: t,
    bundleGuid: e.bundleGuid,
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
  const t = e.root ?? document, r = e.clock ?? Se(), n = e.persistence ?? fe(), i = he({
    ...Le(),
    ...e.settings
  }), s = De(t, e.bundleGuid, e.pageId), w = s.flatMap((o) => o.definitions), a = Z(e.bundleGuid, n), m = /* @__PURE__ */ new Set(), g = /* @__PURE__ */ new Set();
  let y = [], S = i.defaultReviewMode, P = "page", L = null, E = null, I = 0, R = null;
  const Y = async () => {
    if (R === null)
      try {
        const o = e.pageId.split("/").filter(Boolean).length - 1, l = "../".repeat(o) + "_mw_assets/cust/srs/", c = await fetch(`${l}srs-all-cards.json`);
        if (!c.ok) throw new Error(`HTTP ${c.status}`);
        R = (await c.json()).cards.flatMap((u) => {
          const _ = {
            bundleGuid: e.bundleGuid,
            pageId: u.pageId,
            sourceId: u.guid,
            contextPath: [u.pageTitle]
          }, M = u.siblingGroup || u.guid;
          if (u.kind === "basic" || u.kind === "multiline-basic") {
            const v = u.kind === "basic" ? "single-basic" : "multiline-basic";
            return [O(_, u.guid, M, u.promptHtml, u.answerHtml, v, "forward")];
          }
          if (u.kind === "bidirectional" || u.kind === "multiline-bidirectional") {
            const v = u.kind === "bidirectional" ? "single-bidirectional" : "multiline-bidirectional";
            return [
              O(_, `${u.guid}:forward`, M, u.promptHtml, u.answerHtml, v, "forward"),
              O(_, `${u.guid}:reverse`, M, u.answerHtml, u.promptHtml, v, "reverse")
            ];
          }
          return u.kind === "cloze" ? [O(_, u.guid, M, u.promptHtml, u.answerHtml, "cloze", "cloze")] : [];
        });
      } catch {
        R = [];
      }
  }, ie = () => {
    if (P === "page" || R === null)
      return w;
    const o = new Set(w.map((c) => c.id)), l = R.filter((c) => !o.has(c.id));
    return [...w, ...l];
  }, B = () => {
    const o = [...y].sort((l, c) => {
      const C = l.due && !l.newCard ? 0 : 1, u = c.due && !c.newCard ? 0 : 1;
      return C !== u ? C - u : l.definition.searchText.localeCompare(c.definition.searchText);
    });
    return S === "cram" ? o : o.filter((l) => !l.buried && l.due && !l.newCard);
  }, ae = () => {
    e.onStateChange?.(a, y);
  }, G = (o, l) => {
    a.cards[o.definition.id] = ge(o.state, l, r.now()), i.burySiblingCards && S === "due" && Ee(w, a, o.definition.id, r), ee(e.bundleGuid, n, a), m.delete(o.definition.id), g.delete(o.definition.id), A();
  }, se = () => {
    L?.remove(), L = null, s.length !== 0 && (L = f("button", "meadow-srs-launcher"), L.type = "button", L.textContent = "Review", L.addEventListener("click", () => {
      E || (E = de(), e.overlayContainer ? (E.classList.add("meadow-srs-overlay--contained"), e.overlayContainer.appendChild(E)) : document.body.appendChild(E)), E.classList.add("is-open"), $();
    }), document.body.appendChild(L));
  }, X = (o, l = !1) => {
    const c = f("article", "meadow-srs-card"), C = l || !o.buried && (o.due || o.newCard) || g.has(o.definition.id), u = m.has(o.definition.id);
    if (C) {
      const p = ne(o);
      if (p) {
        const d = f("span", "meadow-srs-card__status meadow-srs-card__status--float");
        d.textContent = p, c.appendChild(d);
      }
    }
    if (!C) {
      if (c.classList.add("meadow-srs-card--dormant"), c.style.cursor = "pointer", c.addEventListener("click", () => {
        g.add(o.definition.id), A();
      }), o.buried) {
        const p = f("div", "meadow-srs-card__dormant-text");
        p.textContent = "Temporarily buried by sibling review.", c.appendChild(p);
      } else {
        const p = f("div", "meadow-srs-card__dormant-prompt"), d = f("span", "meadow-srs-card__dormant-due"), k = ne(o) || "Not yet due";
        d.textContent = k, p.appendChild(d);
        const x = f("span", "meadow-srs-card__dormant-question");
        x.innerHTML = o.definition.promptHtml, p.appendChild(x), c.appendChild(p);
      }
      return c;
    }
    if (l && P === "bundle" && o.definition.contextPath.length > 0) {
      const p = f("div", "meadow-srs-card__context");
      p.textContent = o.definition.contextPath.join(" > "), c.appendChild(p);
    }
    const _ = f("div", "meadow-srs-card__prompt");
    _.innerHTML = o.definition.promptHtml, c.appendChild(_);
    const M = f("div", "meadow-srs-card__answer");
    u && (M.innerHTML = o.definition.answerHtml, M.classList.add("is-visible")), c.appendChild(M);
    const v = f("div", "meadow-srs-card__controls");
    if (u)
      ["again", "hard", "good", "easy"].forEach((p) => {
        const d = f("button", `meadow-srs-button meadow-srs-button--${p}`);
        d.type = "button", d.textContent = p[0].toUpperCase() + p.slice(1), d.addEventListener("click", () => G(o, p)), v.appendChild(d);
      });
    else {
      const p = f("button", "meadow-srs-button");
      p.type = "button", p.textContent = "Show answer", p.addEventListener("click", () => {
        m.add(o.definition.id), A();
      }), v.appendChild(p);
    }
    return c.appendChild(v), c;
  }, de = () => {
    const o = f("div", "meadow-srs-overlay"), l = f("div", "meadow-srs-overlay__panel"), c = f("div", "meadow-srs-overlay__tab-bar");
    ["page", "bundle"].forEach((b) => {
      const T = f("button", "meadow-srs-overlay__tab");
      T.type = "button", T.dataset.scope = b, T.addEventListener("click", async () => {
        P = b, b === "bundle" && await Y(), I = 0, A();
      }), c.appendChild(T);
    }), Y().then(() => $());
    const C = f("button", "meadow-srs-overlay__close");
    C.type = "button", C.textContent = "×", C.addEventListener("click", () => {
      o.classList.remove("is-open");
    }), c.appendChild(C);
    const u = f("div", "meadow-srs-overlay__header"), _ = f("div", "meadow-srs-overlay__title-block"), M = f("h2", "meadow-srs-overlay__title");
    M.textContent = "Prompt Review";
    const v = f("div", "meadow-srs-overlay__subtitle");
    v.dataset.role = "overlay-subtitle", _.append(M, v);
    const p = f("div", "meadow-srs-overlay__modes");
    ["due", "cram"].forEach((b) => {
      const T = f("button", "meadow-srs-button meadow-srs-button--subtle");
      T.type = "button", T.textContent = b === "due" ? "Due" : "Cram", T.dataset.mode = b, T.addEventListener("click", () => {
        S = b, I = 0, $();
      }), p.appendChild(T);
    }), u.append(_, p);
    const d = f("div", "meadow-srs-overlay__body");
    d.dataset.role = "overlay-body";
    const k = f("div", "meadow-srs-overlay__footer"), x = f("button", "meadow-srs-button meadow-srs-button--subtle");
    x.type = "button", x.textContent = "Previous", x.addEventListener("click", () => {
      I = Math.max(0, I - 1), $();
    });
    const h = f("button", "meadow-srs-button meadow-srs-button--subtle");
    return h.type = "button", h.textContent = "Next", h.addEventListener("click", () => {
      I += 1, $();
    }), k.append(x, h), l.append(c, u, d, k), o.appendChild(l), o.addEventListener("keydown", (b) => {
      if (!o.classList.contains("is-open"))
        return;
      const T = B(), H = T[Math.min(I, Math.max(T.length - 1, 0))];
      if (H) {
        if ((b.key === " " || b.key === "Enter") && !m.has(H.definition.id)) {
          b.preventDefault(), m.add(H.definition.id), A();
          return;
        }
        if (b.key === "Escape") {
          o.classList.remove("is-open");
          return;
        }
        m.has(H.definition.id) && (b.key === "1" ? G(H, "again") : b.key === "2" ? G(H, "hard") : b.key === "3" ? G(H, "good") : b.key === "4" && G(H, "easy"));
      }
    }), o.tabIndex = -1, o;
  }, $ = () => {
    if (!E)
      return;
    const o = E.querySelector('[data-role="overlay-subtitle"]'), l = E.querySelector('[data-role="overlay-body"]');
    if (!o || !l)
      return;
    E.querySelectorAll("[data-mode]").forEach((d) => {
      d.classList.toggle("is-active", d.dataset.mode === S);
    });
    const c = q(w, a, r), C = c.filter((d) => !d.buried && d.due && !d.newCard).length, u = c.filter((d) => !d.buried && d.newCard).length;
    let _ = null, M = null;
    if (R !== null) {
      const d = new Set(w.map((h) => h.id)), k = [...w, ...R.filter((h) => !d.has(h.id))], x = q(k, a, r);
      _ = x.filter((h) => !h.buried && h.due && !h.newCard).length, M = x.filter((h) => !h.buried && h.newCard).length;
    }
    E.querySelectorAll(".meadow-srs-overlay__tab").forEach((d) => {
      d.classList.toggle("is-active", d.dataset.scope === P), d.replaceChildren();
      const k = document.createTextNode(d.dataset.scope === "page" ? "This page" : "All pages");
      d.appendChild(k);
      const x = d.dataset.scope === "page" ? C : _, h = d.dataset.scope === "page" ? u : M;
      if (x !== null) {
        const b = f("span", "meadow-srs-tab-badge");
        b.textContent = `${x} due`, d.appendChild(b);
      }
      if (h !== null && h > 0) {
        const b = f("span", "meadow-srs-tab-badge meadow-srs-tab-badge--new");
        b.textContent = `${h} new`, d.appendChild(b);
      }
    });
    const v = B();
    if (v.length === 0) {
      if (S === "due") {
        const d = y.filter((k) => !k.buried && k.newCard).length;
        d > 0 ? o.textContent = `Nothing due right now. ${d} new ${d === 1 ? "prompt" : "prompts"} available in the material.` : o.textContent = "Nothing due right now. Switch to Cram to walk every prompt.";
      } else
        o.textContent = P === "page" ? "No prompts found on this page." : "No prompts found across the bundle.";
      l.replaceChildren();
      return;
    }
    I = Math.min(I, v.length - 1);
    const p = v[I];
    o.textContent = `${I + 1} / ${v.length} in ${S === "due" ? "due review" : "cram review"}`, l.replaceChildren(X(p, !0)), requestAnimationFrame(() => {
      E?.focus();
    });
  }, A = () => {
    y = q(ie(), a, r), ee(e.bundleGuid, n, a), s.forEach((o) => {
      o.mountElement.replaceChildren(), y.filter((l) => l.definition.sourceId === o.sourceId).forEach((l) => {
        o.mountElement.appendChild(X(l));
      });
    }), se(), $(), ae();
  };
  return A(), {
    destroy: () => {
      s.forEach((o) => {
        o.mountElement.parentNode && o.originalElements.forEach((l) => {
          o.mountElement.parentNode?.insertBefore(l, o.mountElement);
        }), o.mountElement.remove();
      }), L?.remove(), E?.remove();
    },
    refresh: A,
    clearState: () => {
      Me(e.bundleGuid, n);
      const o = Z(e.bundleGuid, n);
      Object.keys(a.cards).forEach((l) => {
        delete a.cards[l];
      }), Object.assign(a, o), m.clear(), g.clear(), I = 0, A();
    },
    setReviewMode: (o) => {
      S = o, I = 0, $();
    },
    getReviewMode: () => S,
    getStore: () => a,
    getRuntimeCards: () => y,
    getVisibleReviewCards: B,
    getWaypoints: () => _e(y, r.now()),
    getDebugSourceGroups: () => s.map((o) => ({
      sourceId: o.sourceId,
      mountElement: o.mountElement,
      contextPath: [...o.contextPath],
      blocks: o.blocks.map((l) => ({ ...l })),
      cardIds: o.definitions.map((l) => l.id)
    })),
    rateCard: (o, l) => {
      const c = y.find((C) => C.definition.id === o);
      c && G(c, l);
    }
  };
}
function re() {
  const e = document.body.dataset.meadowSrsBundleGuid, t = document.body.dataset.meadowSrsPageId;
  return !e || !t ? null : He({ bundleGuid: e, pageId: t });
}
document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", () => {
  re();
}, { once: !0 }) : re();
