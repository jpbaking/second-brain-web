/* ==========================================================================
   lazyway-io-design — components.js
   Zero-dependency behaviors for the components in components.css.
   Load once, before </body>:  <script src="/design/components.js"></script>
   Everything auto-initialises from data-* attributes. No build step.

   Modal:        <button data-modal-open="#my-modal">  +  <dialog id="my-modal" class="modal">
                 Inside the dialog, any [data-modal-close] button closes it.
   Tabs:         <div data-tabs> containing .tab buttons (data-tab-target="#panel-id")
                 and .tab-panel sections. First tab is active unless one has .active.
   Date picker:  <input class="input" data-datepicker>   → value "2026-07-02"
   Time picker:  <input class="input" data-timepicker>   → value "14:30"
                 Both fire a normal "change" event when a value is picked.
   ========================================================================== */
(function () {
  "use strict";

  /* ---------------- Modal ---------------- */
  function initModals() {
    document.querySelectorAll("[data-modal-open]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var dlg = document.querySelector(btn.getAttribute("data-modal-open"));
        if (dlg && typeof dlg.showModal === "function") dlg.showModal();
      });
    });
    document.querySelectorAll("dialog.modal").forEach(function (dlg) {
      dlg.querySelectorAll("[data-modal-close]").forEach(function (btn) {
        btn.addEventListener("click", function () { dlg.close(); });
      });
      /* Click on the backdrop (the dialog element itself) closes it. */
      dlg.addEventListener("click", function (e) {
        if (e.target === dlg) dlg.close();
      });
    });
  }

  /* ---------------- Tabs ---------------- */
  function initTabs() {
    document.querySelectorAll("[data-tabs]").forEach(function (root) {
      var tabs = Array.prototype.slice.call(root.querySelectorAll(".tab"));
      var panels = Array.prototype.slice.call(root.querySelectorAll(".tab-panel"));
      if (!tabs.length) return;

      function activate(tab) {
        tabs.forEach(function (t) {
          var on = t === tab;
          t.classList.toggle("active", on);
          t.setAttribute("aria-selected", on ? "true" : "false");
        });
        panels.forEach(function (p) { p.hidden = true; });
        var target = root.querySelector(tab.getAttribute("data-tab-target"));
        if (target) target.hidden = false;
      }

      tabs.forEach(function (t) {
        t.setAttribute("role", "tab");
        t.addEventListener("click", function () { activate(t); });
      });
      activate(root.querySelector(".tab.active") || tabs[0]);
    });
  }

  /* ---------------- Shared popover plumbing ---------------- */
  var openPop = null;

  function closePop() {
    if (openPop) { openPop.remove(); openPop = null; }
  }

  function showPop(input, pop) {
    closePop();
    pop.className = "picker-pop";
    document.body.appendChild(pop);
    var r = input.getBoundingClientRect();
    var top = r.bottom + window.scrollY + 6;
    var left = r.left + window.scrollX;
    var maxLeft = window.scrollX + document.documentElement.clientWidth - pop.offsetWidth - 12;
    pop.style.top = top + "px";
    pop.style.left = Math.max(12, Math.min(left, maxLeft)) + "px";
    openPop = pop;
  }

  document.addEventListener("click", function (e) {
    if (openPop && !openPop.contains(e.target) &&
        !e.target.hasAttribute("data-datepicker") &&
        !e.target.hasAttribute("data-timepicker")) {
      closePop();
    }
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closePop();
  });

  function pad(n) { return (n < 10 ? "0" : "") + n; }

  function commit(input, value) {
    input.value = value;
    closePop();
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  /* ---------------- Date picker ---------------- */
  var MONTHS = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];
  var DOWS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

  function renderCalendar(input, year, month) {
    var pop = document.createElement("div");
    var selected = input.value; /* "YYYY-MM-DD" or "" */
    var today = new Date();

    var head = document.createElement("div");
    head.className = "picker-head";
    var prev = document.createElement("button");
    prev.type = "button"; prev.className = "picker-nav"; prev.textContent = "‹";
    prev.setAttribute("aria-label", "Previous month");
    var label = document.createElement("span");
    label.className = "picker-month";
    label.textContent = MONTHS[month] + " " + year;
    var next = document.createElement("button");
    next.type = "button"; next.className = "picker-nav"; next.textContent = "›";
    next.setAttribute("aria-label", "Next month");
    head.appendChild(prev); head.appendChild(label); head.appendChild(next);
    pop.appendChild(head);

    prev.addEventListener("click", function () {
      var m = month - 1, y = year;
      if (m < 0) { m = 11; y--; }
      showPop(input, renderCalendar(input, y, m));
    });
    next.addEventListener("click", function () {
      var m = month + 1, y = year;
      if (m > 11) { m = 0; y++; }
      showPop(input, renderCalendar(input, y, m));
    });

    var grid = document.createElement("div");
    grid.className = "picker-grid";
    DOWS.forEach(function (d) {
      var el = document.createElement("span");
      el.className = "picker-dow";
      el.textContent = d;
      grid.appendChild(el);
    });

    /* Monday-first offset of the 1st of the month. */
    var first = new Date(year, month, 1);
    var offset = (first.getDay() + 6) % 7;
    var start = new Date(year, month, 1 - offset);

    for (var i = 0; i < 42; i++) {
      (function (d) {
        var iso = d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "picker-day";
        btn.textContent = String(d.getDate());
        if (d.getMonth() !== month) btn.classList.add("other");
        if (d.toDateString() === today.toDateString()) btn.classList.add("today");
        if (iso === selected) btn.classList.add("selected");
        btn.addEventListener("click", function () { commit(input, iso); });
        grid.appendChild(btn);
      })(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
    }

    pop.appendChild(grid);
    return pop;
  }

  function initDatepickers() {
    document.querySelectorAll("input[data-datepicker]").forEach(function (input) {
      input.setAttribute("autocomplete", "off");
      if (!input.placeholder) input.placeholder = "YYYY-MM-DD";
      input.addEventListener("click", function () {
        var base = /^\d{4}-\d{2}-\d{2}$/.test(input.value) ? new Date(input.value + "T00:00:00") : new Date();
        showPop(input, renderCalendar(input, base.getFullYear(), base.getMonth()));
      });
    });
  }

  /* ---------------- Time picker ---------------- */
  function renderTime(input) {
    var pop = document.createElement("div");
    var step = parseInt(input.getAttribute("data-timepicker"), 10);
    if (!(step > 0)) step = 5;
    var current = /^\d{2}:\d{2}$/.test(input.value) ? input.value.split(":") : null;

    var wrap = document.createElement("div");
    wrap.className = "picker-time";

    function col(count, mul, selectedVal, onPick) {
      var c = document.createElement("div");
      c.className = "picker-col";
      for (var i = 0; i < count; i++) {
        (function (v) {
          var btn = document.createElement("button");
          btn.type = "button";
          btn.className = "picker-opt";
          btn.textContent = pad(v);
          if (selectedVal === pad(v)) btn.classList.add("selected");
          btn.addEventListener("click", function () { onPick(pad(v), btn, c); });
          c.appendChild(btn);
        })(i * mul);
      }
      return c;
    }

    var hour = current ? current[0] : null;
    var minute = current ? current[1] : null;

    function tryCommit() {
      if (hour !== null && minute !== null) commit(input, hour + ":" + minute);
    }
    function pick(setter) {
      return function (v, btn, colEl) {
        colEl.querySelectorAll(".picker-opt").forEach(function (o) { o.classList.remove("selected"); });
        btn.classList.add("selected");
        setter(v);
        tryCommit();
      };
    }

    wrap.appendChild(col(24, 1, hour, pick(function (v) { hour = v; })));
    wrap.appendChild(col(Math.floor(60 / step), step, minute, pick(function (v) { minute = v; })));
    pop.appendChild(wrap);
    return pop;
  }

  function initTimepickers() {
    document.querySelectorAll("input[data-timepicker]").forEach(function (input) {
      input.setAttribute("autocomplete", "off");
      if (!input.placeholder) input.placeholder = "HH:MM";
      input.addEventListener("click", function () {
        showPop(input, renderTime(input));
      });
    });
  }

  /* ---------------- Boot ---------------- */
  function init() {
    initModals();
    initTabs();
    initDatepickers();
    initTimepickers();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
