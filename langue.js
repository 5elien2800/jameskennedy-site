/* Changement de langue sur place (comportements.md §3).
   Le lien « en » / « fr » est un vrai lien vers la traduction. Avec JavaScript, le clic est intercepté :
   la page de l'autre langue est chargée en arrière-plan, puis chaque élément marqué data-i18n reçoit son texte,
   avec le même fondu que les textes (effet fl), sans recharger ni bouger la page.
   Modes : (aucun) contenu remplacé · t = seuls les textes directs (champs, images gardés) · a = attributs seuls
           x = élément propre à une langue · ancre = repère pour réinsérer un élément propre à une langue.
   Les textes tenus par les scripts viennent de la table JKT (même table dans les deux langues). */
(function () {
  const H = document.documentElement;
  const ATTRS = ["alt", "aria-label", "title", "placeholder", "data-credit", "src"];   /* src : image propre à une langue (logo du Conseil des arts) */
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const cache = {};
  const charger = (url) => (cache[url] = cache[url] || fetch(url, { credentials: "same-origin" }).then((r) => { if (!r.ok) throw r; return r.text(); }).then((t) => new DOMParser().parseFromString(t, "text/html")));
  const lienLangue = () => document.querySelector("a.lang");

  /* préchargement : au survol, au toucher, puis quand le navigateur est libre */
  const cible = (a) => a.getAttribute("data-i18n-src") || a.getAttribute("href");
  addEventListener("pointerover", (e) => { const a = e.target.closest && e.target.closest("a.lang"); if (a) charger(cible(a)).catch(() => {}); }, { passive: true });
  addEventListener("touchstart", (e) => { const a = e.target.closest && e.target.closest("a.lang"); if (a) charger(cible(a)).catch(() => {}); }, { passive: true, capture: true });
  addEventListener("load", () => { const go = () => { const a = lienLangue(); if (a) charger(cible(a)).catch(() => {}); }; "requestIdleCallback" in window ? requestIdleCallback(go, { timeout: 4000 }) : setTimeout(go, 2000); });

  /* clic sur le lien de langue : intercepté avant les autres scripts (départ de page, menu) */
  addEventListener("click", (e) => {
    const a = e.target.closest && e.target.closest("a.lang");
    if (!a || e.button > 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || !window.fetch || !window.DOMParser) return;
    e.preventDefault(); e.stopImmediatePropagation();
    changer(a.getAttribute("data-i18n-src") || a.getAttribute("href"), !a.hasAttribute("data-i18n-src"));
  }, true);

  /* Précédent / Suivant entre les deux langues : sur place aussi */
  try { history.replaceState(Object.assign({}, history.state, { jkLangue: H.lang }), ""); } catch (e) {}
  /* Précédent juste après un changement, sans avoir défilé : retour exact à la position d'avant */
  let yApres = null;
  addEventListener("popstate", (e) => { if (e.state && e.state.jkLangue && e.state.jkLangue !== H.lang) changer(location.pathname + location.search + location.hash, false, yApres !== null && Math.abs(scrollY - yApres) < 2 && typeof e.state.yAvant === "number" ? e.state.yAvant : null); });

  let enCours = false;
  async function changer(url, pousser, yRetour = null) {
    if (enCours) return; enCours = true;
    /* fondus encore en cours : terminés tout de suite (les enveloppes temporaires sont retirées) */
    document.querySelectorAll("span.jkl").forEach((sp) => { const p = sp.parentNode; sp.getAnimations().forEach((x) => x.cancel()); sp.replaceWith(document.createTextNode(sp.textContent)); p && p.normalize(); });
    let doc;
    try { doc = await charger(url); } catch (err) { enCours = false; location.href = url; return; }
    const de = H.lang === "en" ? "en" : "fr", vers = de === "en" ? "fr" : "en";

    /* repère : l'élément au tiers de l'écran et sa position, pour que la page ne bouge pas */
    /* l'ancrage automatique du navigateur est suspendu : la correction est faite ici, une seule fois */
    const ancrage = H.style.overflowAnchor; H.style.overflowAnchor = "none"; document.body.style.overflowAnchor = "none";
    const enHaut = scrollY < 1, y0 = scrollY;
    const repere = enHaut ? null : trouverRepere(), haut0 = repere ? hautNet(repere) : 0;
    /* toutes les lectures avant toute écriture ; la page garde sa hauteur pendant les remplacements */
    const minH = document.body.style.minHeight; document.body.style.minHeight = H.scrollHeight + "px";
    vus = new Set([...document.querySelectorAll("[data-i18n]")].filter(visible));

    /* 1. éléments marqués */
    const cibles = {}; doc.querySelectorAll("[data-i18n]").forEach((x) => (cibles[x.getAttribute("data-i18n")] = x));
    const ici = [...document.querySelectorAll("[data-i18n]")];
    const aFondre = [];
    correspondances = new Map();
    for (const el of ici) {
      const k = el.getAttribute("data-i18n"), m = el.getAttribute("data-i18n-m") || "", src = cibles[k];
      if (m === "x") { if (!src) retirer(el); continue; }
      if (!src) continue;
      for (const at of ATTRS) { const v = src.getAttribute(at), v0 = el.getAttribute(at); if (v !== null && v0 !== v) { if (v0) correspondances.set(v0, v); el.setAttribute(at, v); } }
      if (m === "a" || m === "ancre") continue;
      if (m === "t") { textesDirects(el, src, aFondre); continue; }
      remplacerContenu(el, src, aFondre);
    }
    /* éléments propres à la langue d'arrivée : insérés après leur repère */
    for (const [k, src] of Object.entries(cibles)) {
      if (src.getAttribute("data-i18n-m") !== "x" || document.querySelector(`[data-i18n="${k}"]`)) continue;
      const prec = src.previousElementSibling, ancre = prec && prec.getAttribute("data-i18n") && document.querySelector(`[data-i18n="${prec.getAttribute("data-i18n")}"]`);
      if (!ancre) continue;
      const neuf = document.importNode(src, true); ancre.after(neuf); neuf.querySelectorAll("*").forEach(() => {});
      if (visible(neuf) && !reduce) neuf.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 2600, easing: "cubic-bezier(.2,.7,.3,1)" });
    }

    /* 2. textes tenus par les scripts (encadré Œuvres, visionneuse, bouton du menu, messages…) */
    H.lang = vers;
    if (window.JKT) { balayer(window.JKT[de], window.JKT[vers]); observer(); }

    /* 3. adresses internes, langue, titre, lien de langue */
    const plan = window.JKT && window.JKT.adresses ? window.JKT.adresses : {};
    const traduireAdr = (u) => { const [p, h] = u.split("#"); const t = plan[de] && plan[de].indexOf(p); return t >= 0 ? plan[vers][t] + (h !== undefined ? "#" + h : "") : u; };
    document.querySelectorAll("a[href^='/'], [data-href^='/']").forEach((a) => {
      if (a.matches("a.lang")) return;
      if (a.hasAttribute("href")) a.setAttribute("href", traduireAdr(a.getAttribute("href")));
      if (a.hasAttribute("data-href")) a.setAttribute("data-href", traduireAdr(a.getAttribute("data-href")));
    });
    document.querySelectorAll("input[type=hidden][name=page]").forEach((i) => (i.value = traduireAdr(i.value)));
    const ll = lienLangue(), llSrc = doc.querySelector("a.lang");
    if (ll && llSrc) { ll.setAttribute("href", llSrc.getAttribute("href")); ll.setAttribute("title", llSrc.getAttribute("title")); ll.textContent = llSrc.textContent;
      if (llSrc.hasAttribute("data-i18n-src")) ll.setAttribute("data-i18n-src", llSrc.getAttribute("data-i18n-src")); }
    document.title = doc.title;
    const d1 = document.querySelector('meta[name="description"]'), d2 = doc.querySelector('meta[name="description"]');
    if (d1 && d2) d1.setAttribute("content", d2.getAttribute("content"));

    /* 4. menu du téléphone refermé */
    const nav = document.getElementById("nav"), btn = document.getElementById("menuBtn");
    if (nav && nav.classList.contains("open")) { nav.classList.remove("open"); if (btn) { btn.setAttribute("aria-expanded", "false"); btn.textContent = "menu"; } }

    /* 5. la page ne bouge pas */
    window.__jkDernier = { repere: repere && (repere.tagName + "." + repere.className + " « " + (repere.textContent || "").trim().slice(0, 40) + " »"), haut0, avant: repere && hautNet(repere) };
    if (yRetour !== null) { const s = H.style.scrollBehavior; H.style.scrollBehavior = "auto"; scrollTo({ top: yRetour, left: 0, behavior: "instant" }); H.style.scrollBehavior = s; }
    else if (repere) { const d = hautNet(repere) - haut0; if (Math.abs(d) > 0.5) { const s = H.style.scrollBehavior; H.style.scrollBehavior = "auto"; scrollTo({ top: scrollY + d, left: 0, behavior: "instant" }); H.style.scrollBehavior = s; } }

    document.body.style.minHeight = minH;
    requestAnimationFrame(() => { H.style.overflowAnchor = ancrage; document.body.style.overflowAnchor = ""; });
    /* 6. fondu des textes visibles, ligne par ligne */
    if (!reduce) fondre(aFondre);
    dispatchEvent(new Event("scroll"));
    if (pousser) { try { history.replaceState(Object.assign({}, history.state, { yAvant: y0 }), ""); } catch (e) {} history.pushState({ jkLangue: vers, yAvant: scrollY }, "", url); }
    else history.replaceState(Object.assign({}, history.state, { jkLangue: vers }), "");
    yApres = scrollY;
    enCours = false;
  }

  function trouverRepere() {
    /* un élément de la page, jamais la barre, le menu ouvert ou l'encadré (fixes à l'écran) */
    /* menu du téléphone ouvert : la page est descendue ; on vise l'endroit qui sera au tiers de l'écran, menu refermé */
    const m = document.querySelector("body > main"), tr = m ? getComputedStyle(m).transform : "none";
    const ty = tr === "none" ? 0 : new DOMMatrixReadOnly(tr).m42;
    let el = document.elementsFromPoint(innerWidth / 2, Math.min(innerHeight - 2, innerHeight / 3 + ty)).find((x) => !x.closest("#nav, #soon, .lb") && x !== document.body && x !== H);
    if (!el) return null;
    /* un élément dont le contenu va être remplacé : on garde l'élément marqué lui-même */
    const k = el.closest("[data-i18n]:not([data-i18n-m])");
    return k || el;
  }
  /* position à l'écran sans le glissement de la page sous le menu du téléphone (transform de main, sections, pied) */
  function hautNet(el) {
    const bloc = el.closest("body > main, body > section, body > footer");
    const ty = bloc ? new DOMMatrixReadOnly(getComputedStyle(bloc).transform === "none" ? undefined : getComputedStyle(bloc).transform).m42 : 0;
    return el.getBoundingClientRect().top - ty;
  }
  let vus = new Set();
  const visible = (el) => { const r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight && r.width > 0; };

  /* contenu remplacé ; enveloppes posées par les scripts (titre masqué .mki, mots .w, unités .ln) refaites */
  function remplacerContenu(el, src, aFondre) {
    let cible = el;
    const mki = el.children.length === 1 && el.firstElementChild.classList.contains("mki") ? el.firstElementChild : null;
    if (mki) cible = mki;
    const rv = el.querySelector(".w") ? el : null;
    const vu = vus.has(el);
    cible.innerHTML = src.innerHTML;
    /* apparitions : si l'élément n'est pas encore apparu, ses unités seront recalculées au bon moment */
    const ap = el.closest(".ap"); if (ap && !ap.classList.contains("on")) delete ap._u;
    if (rv) envelopperMots(el);
    /* mot défilant de l'Accueil : un seul mot visible dans un cadre d'une ligne ; il change d'un bloc, avec un fondu
       de l'ensemble, sans découpage en lignes (sinon une partie du mot seulement s'affiche pendant le fondu) */
    if (el.closest("#roller")) { if (vu && !reduce) el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 2600, easing: "cubic-bezier(.2,.7,.3,1)" }); return; }
    if (vu) aFondre.push(el);
  }
  function textesDirects(el, src, aFondre) {
    const a = [...el.childNodes].filter((n) => n.nodeType === 3 && n.data.trim()), b = [...src.childNodes].filter((n) => n.nodeType === 3 && n.data.trim());
    a.forEach((n, i) => { if (b[i] && n.data !== b[i].data) n.data = b[i].data; });
    if (vus.has(el)) aFondre.push(el);
  }
  function retirer(el) {
    if (reduce || !vus.has(el)) { el.remove(); return; }
    el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 600, easing: "ease" }).onfinish = () => el.remove();
  }
  /* éclairage des mots (.rv) : mêmes enveloppes « w », remises dans le tableau du script de la page */
  function envelopperMots(el) {
    const tableaux = window.JKRV || [];
    const tab = tableaux.find((t) => t.some((s) => !s.isConnected)) || tableaux[0];
    if (tab) for (let i = tab.length - 1; i >= 0; i--) if (!tab[i].isConnected) tab.splice(i, 1);
    (function wrap(node) { [...node.childNodes].forEach((n) => {
      if (n.nodeType === 3) { const f = document.createDocumentFragment(); n.textContent.split(/(\s+)/).forEach((t) => { if (/^\s+$/.test(t) || !t) f.appendChild(document.createTextNode(t)); else { const s = document.createElement("span"); s.className = "w"; s.textContent = t; f.appendChild(s); if (tab) tab.push(s); } }); n.replaceWith(f); }
      else wrap(n); }); })(el);
  }
  /* fondu du clair à la couleur, ligne par ligne (effet fl : 2,6 s, cubic-bezier(.2,.7,.3,1), 0,24 s par ligne) */
  function fondre(els) {
    for (const el of els) {
      const unites = [];
      (function wrap(node) { [...node.childNodes].forEach((n) => {
        if (n.nodeType === 3) { if (!n.data.trim()) return;
          /* dans une grille ou une boîte flexible, chaque élément serait une case : le texte reste d'un seul bloc */
          if (/grid|flex/.test(getComputedStyle(n.parentElement).display)) { const s = document.createElement("span"); s.className = "jkl"; s.textContent = n.data; n.replaceWith(s); unites.push(s); return; }
          const f = document.createDocumentFragment(); n.data.split(/(\s+)/).forEach((t) => { if (!t) return; if (/^\s+$/.test(t)) f.appendChild(document.createTextNode(t)); else { const s = document.createElement("span"); s.className = "jkl"; s.textContent = t; f.appendChild(s); unites.push(s); } }); n.replaceWith(f); }
        else if (n.nodeType === 1 && n.classList.contains("w")) unites.push(n);
        else if (n.nodeType === 1 && !n.matches("input,select,textarea,img,svg,video,canvas")) wrap(n); }); })(el);
      const gap = el.closest(".slow") ? 0.4 : 0.24;
      let ligne = -1, haut = -1e9;
      const fins = unites.map((u) => [u, u.getBoundingClientRect().top]).sort((a, b) => a[1] - b[1]).map(([u, t]) => { if (t > haut + 4) { ligne++; haut = t; } return u.animate([{ opacity: 0 }, { opacity: getComputedStyle(u).opacity }], { duration: 2600, delay: ligne * gap * 1000, easing: "cubic-bezier(.2,.7,.3,1)", fill: "backwards" }).finished; });
      /* les enveloppes temporaires sont retirées à la fin */
      Promise.allSettled(fins).then(() => { el.querySelectorAll("span.jkl").forEach((s) => s.replaceWith(document.createTextNode(s.textContent))); el.normalize(); });
    }
  }
  let correspondances = new Map();
  /* un texte d'une langue → l'autre : table des scripts, puis anciens attributs (crédits photo) ; texte composé « préfixe + reste » aussi */
  function traduireTexte(v, de, vers, idx) {
    const t = v.trim(); if (!t) return v;
    if (idx.has(t)) return v.replace(t, vers[idx.get(t)]);
    if (correspondances.has(t)) return v.replace(t, correspondances.get(t));
    for (const [x, i] of idx) if (v.startsWith(x + " ")) { const reste = v.slice(x.length + 1); return vers[i] + " " + (correspondances.get(reste) || (idx.has(reste) ? vers[idx.get(reste)] : reste)); }
    return v;
  }
  /* après un changement : tout texte écrit plus tard par un script dans l'autre langue est traduit aussitôt */
  let obs = null;
  function observer() {
    if (obs || !window.MutationObserver) return;
    const tr = (v) => { const en = H.lang === "en"; const de = en ? window.JKT.fr : window.JKT.en, vers = en ? window.JKT.en : window.JKT.fr; return traduireTexte(v, de, vers, new Map(de.map((t, i) => [t, i]))); };
    obs = new MutationObserver((ms) => {
      for (const m of ms) {
        if (m.type === "attributes") { const v = m.target.getAttribute(m.attributeName); if (v) { const n = tr(v); if (n !== v) m.target.setAttribute(m.attributeName, n); } continue; }
        const noeuds = m.type === "characterData" ? [m.target] : [...m.addedNodes];
        for (const n of noeuds) {
          if (n.nodeType === 3) { if (!n.parentElement || n.parentElement.closest("[data-i18n]:not([data-i18n-m='a']):not([data-i18n-m='ancre'])")) continue; const x = tr(n.data); if (x !== n.data) n.data = x; }
          else if (n.nodeType === 1 && !n.closest("[data-i18n]:not([data-i18n-m='a']):not([data-i18n-m='ancre'])")) { const w = document.createTreeWalker(n, NodeFilter.SHOW_TEXT); while (w.nextNode()) { const t = w.currentNode, x = tr(t.data); if (x !== t.data) t.data = x; } [n, ...n.querySelectorAll("*")].forEach((e) => ATTRS.forEach((at) => { const v = e.getAttribute(at); if (v) { const x = tr(v); if (x !== v) e.setAttribute(at, x); } })); }
        }
      }
    });
    obs.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["aria-label", "title", "alt"] });
  }
  /* textes hors éléments marqués (créés par les scripts) : remplacés s'ils figurent dans la table */
  function balayer(de, vers) {
    const idx = new Map(de.map((t, i) => [t, i]));
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const noeuds = []; while (w.nextNode()) noeuds.push(w.currentNode);
    for (const n of noeuds) {
      if (n.parentElement && n.parentElement.closest("[data-i18n]:not([data-i18n-m='a']):not([data-i18n-m='ancre']), script, style")) continue;
      const x = traduireTexte(n.data, de, vers, idx); if (x !== n.data) n.data = x;
    }
    document.querySelectorAll("body *:not([data-i18n])").forEach((el) => {
      for (const at of ATTRS) { const v = el.getAttribute(at); if (v === null) continue; const x = traduireTexte(v, de, vers, idx); if (x !== v) el.setAttribute(at, x); }
    });
  }
})();
