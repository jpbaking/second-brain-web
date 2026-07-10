/* ==========================================================================
   lazyway-io-design — charts.js
   Zero-dependency SVG charts styled by the chart tokens (tokens/charts.css)
   and the .chart chrome in components.css. No build step, no library.

   Load once:  <script src="/design/charts.js"></script>
   Then call (element or "#selector"):

     lwCharts.bar("#el",  { labels: ["Jan","Feb"], series: [{ name: "Sales", values: [12, 19] }] });
     lwCharts.line("#el", { labels: [...], series: [{ name, values }, ...] });
     lwCharts.donut("#el",{ slices: [{ label: "API", value: 41 }, ...] });
     lwCharts.sparkline("#el", { values: [3,5,4,...] });   // for stat tiles

   Common options: height (px), format (function n => string).
   Series colors are assigned from --chart-1..5 IN ORDER — pass no colors.
   A 6th+ series is folded into "Other" automatically (donut) or rejected
   (bar/line) — split into two charts instead.
   Every chart appends a screen-reader data table; tooltips appear on hover.
   ========================================================================== */
(function () {
  "use strict";

  var NS = "http://www.w3.org/2000/svg";
  var MAX_SERIES = 5;

  /* ---------- helpers ---------- */
  function el(target) {
    var node = typeof target === "string" ? document.querySelector(target) : target;
    if (!node) throw new Error("lwCharts: element not found: " + target);
    node.innerHTML = "";
    return node;
  }

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function palette(n) {
    var out = [];
    for (var i = 1; i <= Math.min(n, MAX_SERIES); i++) out.push(cssVar("--chart-" + i));
    return out;
  }

  function svgEl(tag, attrs) {
    var node = document.createElementNS(NS, tag);
    for (var k in attrs) node.setAttribute(k, attrs[k]);
    return node;
  }

  /* Chart SVGs are hover surfaces — never text-selection targets (a drag or
     double-click would paint a selection box over labels). */
  function noSelect(svg) {
    svg.style.userSelect = "none";
    svg.style.webkitUserSelect = "none";
    return svg;
  }

  function defaultFormat(n) {
    if (Math.abs(n) >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, "") + "M";
    if (Math.abs(n) >= 10000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "K";
    return String(Math.round(n * 100) / 100).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  /* Clean axis max + ticks: steps of 1/2/5 × 10^k. */
  function niceTicks(maxValue, count) {
    if (maxValue <= 0) maxValue = 1;
    var rough = maxValue / count;
    var mag = Math.pow(10, Math.floor(Math.log(rough) / Math.LN10));
    var step = [1, 2, 5, 10].map(function (m) { return m * mag; })
      .filter(function (s) { return s >= rough; })[0] || 10 * mag;
    var ticks = [];
    for (var v = 0; v <= maxValue + step * 0.999; v += step) ticks.push(v);
    return ticks;
  }

  function maxOf(series) {
    var m = 0;
    series.forEach(function (s) {
      s.values.forEach(function (v) { if (v > m) m = v; });
    });
    return m;
  }

  /* Legend for >= 2 series only (single series: title carries identity). */
  function legend(container, series, colors, center) {
    if (series.length < 2) return;
    var box = document.createElement("div");
    box.className = "chart-legend";
    if (center) box.style.justifyContent = "center";
    series.forEach(function (s, i) {
      var key = document.createElement("span");
      key.className = "chart-key";
      key.style.setProperty("--key-color", colors[i]);
      key.textContent = s.name;
      box.appendChild(key);
    });
    container.appendChild(box);
  }

  /* Accessible fallback: a visually-hidden data table. */
  function srTable(container, labels, series, format) {
    var tbl = document.createElement("table");
    tbl.className = "sr-only";
    var html = "<thead><tr><th></th>";
    series.forEach(function (s) { html += "<th>" + s.name + "</th>"; });
    html += "</tr></thead><tbody>";
    labels.forEach(function (lab, i) {
      html += "<tr><th>" + lab + "</th>";
      series.forEach(function (s) { html += "<td>" + format(s.values[i]) + "</td>"; });
      html += "</tr>";
    });
    tbl.innerHTML = html + "</tbody>";
    container.appendChild(tbl);
  }

  /* ---------- tooltip (one shared node) ---------- */
  var tip = null;
  function showTip(x, y, html) {
    if (!tip) {
      tip = document.createElement("div");
      tip.className = "chart-tooltip";
      document.body.appendChild(tip);
    }
    tip.innerHTML = html;
    tip.style.display = "block";
    var w = tip.offsetWidth, h = tip.offsetHeight;
    var left = Math.min(x + 14, document.documentElement.clientWidth - w - 8);
    var top = y - h - 12 < 8 ? y + 16 : y - h - 12;
    tip.style.left = left + "px";
    tip.style.top = top + "px";
  }
  function hideTip() { if (tip) tip.style.display = "none"; }

  function tipHtml(label, rows) {
    var html = '<span class="tt-label">' + label + "</span>";
    rows.forEach(function (r) {
      html += '<span style="display:flex;align-items:center;gap:6px;">' +
        '<span style="width:8px;height:8px;border-radius:2px;background:' + r.color + ';flex-shrink:0;"></span>' +
        r.name + ":&nbsp;<strong>" + r.value + "</strong></span>";
    });
    return html;
  }

  /* ---------- shared frame: grid + axes + y ticks ---------- */
  function frame(svg, W, H, pad, ticks, yOf, format) {
    ticks.forEach(function (t) {
      var y = yOf(t);
      svg.appendChild(svgEl("line", {
        x1: pad.l, y1: y, x2: W - pad.r, y2: y,
        stroke: t === 0 ? cssVar("--chart-axis") : cssVar("--chart-grid"),
        "stroke-width": 1, "shape-rendering": "crispEdges",
      }));
      var txt = svgEl("text", { x: pad.l - 8, y: y + 4, "text-anchor": "end", "class": "tick-value" });
      txt.textContent = format(t);
      svg.appendChild(txt);
    });
  }

  function guardSeries(series) {
    if (series.length > MAX_SERIES) {
      throw new Error("lwCharts: max " + MAX_SERIES + " series — split into two charts or fold into 'Other'.");
    }
  }

  /* ---------- BAR (grouped columns) ---------- */
  function bar(target, opts) {
    var node = el(target);
    var labels = opts.labels, series = opts.series;
    guardSeries(series);
    var format = opts.format || defaultFormat;
    var colors = palette(series.length);
    var H = opts.height || 260;
    var W = Math.max(node.clientWidth || 560, 280);
    var pad = { l: 46, r: 8, t: 10, b: 26 };

    var ticks = niceTicks(maxOf(series), 4);
    var yMax = ticks[ticks.length - 1];
    function yOf(v) { return pad.t + (H - pad.t - pad.b) * (1 - v / yMax); }

    var svg = noSelect(svgEl("svg", { viewBox: "0 0 " + W + " " + H, width: "100%", role: "img" }));
    if (opts.title) svg.setAttribute("aria-label", opts.title);
    frame(svg, W, H, pad, ticks, yOf, format);

    var plotW = W - pad.l - pad.r;
    var slot = plotW / labels.length;
    var gap = 2; /* surface gap between touching bars */
    var barW = Math.min(24, (slot * 0.7 - gap * (series.length - 1)) / series.length);
    var groupW = barW * series.length + gap * (series.length - 1);

    labels.forEach(function (lab, i) {
      var x0 = pad.l + slot * i + (slot - groupW) / 2;

      series.forEach(function (s, si) {
        var v = s.values[i];
        var x = x0 + si * (barW + gap);
        var y = yOf(v);
        var h = yOf(0) - y;
        var r = Math.min(4, barW / 2, h); /* rounded data-end, square baseline */
        var d = "M" + x + "," + (y + h) +
          " L" + x + "," + (y + r) +
          " Q" + x + "," + y + " " + (x + r) + "," + y +
          " L" + (x + barW - r) + "," + y +
          " Q" + (x + barW) + "," + y + " " + (x + barW) + "," + (y + r) +
          " L" + (x + barW) + "," + (y + h) + " Z";
        var path = svgEl("path", { d: d, fill: colors[si] });
        path.addEventListener("mousemove", function (e) {
          showTip(e.clientX, e.clientY, tipHtml(lab, [{ name: s.name, value: format(v), color: colors[si] }]));
        });
        path.addEventListener("mouseleave", hideTip);
        svg.appendChild(path);
      });

      var txt = svgEl("text", { x: pad.l + slot * i + slot / 2, y: H - 8, "text-anchor": "middle" });
      txt.textContent = lab;
      svg.appendChild(txt);
    });

    node.appendChild(svg);
    legend(node, series, colors);
    srTable(node, labels, series, format);
  }

  /* ---------- LINE (multi-series, crosshair tooltip) ---------- */
  function line(target, opts) {
    var node = el(target);
    var labels = opts.labels, series = opts.series;
    guardSeries(series);
    var format = opts.format || defaultFormat;
    var colors = palette(series.length);
    var H = opts.height || 260;
    var W = Math.max(node.clientWidth || 560, 280);
    var pad = { l: 46, r: 14, t: 10, b: 26 };

    var ticks = niceTicks(maxOf(series), 4);
    var yMax = ticks[ticks.length - 1];
    function yOf(v) { return pad.t + (H - pad.t - pad.b) * (1 - v / yMax); }
    function xOf(i) {
      return labels.length === 1 ? (pad.l + W - pad.r) / 2
        : pad.l + (W - pad.l - pad.r) * (i / (labels.length - 1));
    }

    var svg = noSelect(svgEl("svg", { viewBox: "0 0 " + W + " " + H, width: "100%", role: "img" }));
    if (opts.title) svg.setAttribute("aria-label", opts.title);
    frame(svg, W, H, pad, ticks, yOf, format);

    /* x labels — thin out so they never collide */
    var every = Math.ceil(labels.length / Math.floor(W / 64));
    labels.forEach(function (lab, i) {
      if (i % every !== 0 && i !== labels.length - 1) return;
      var txt = svgEl("text", { x: xOf(i), y: H - 8, "text-anchor": "middle" });
      txt.textContent = lab;
      svg.appendChild(txt);
    });

    var surface = cssVar("--base") || "#FFFFFF";

    series.forEach(function (s, si) {
      var pts = s.values.map(function (v, i) { return xOf(i) + "," + yOf(v); }).join(" ");
      if (opts.area && series.length === 1) {
        var poly = svgEl("polygon", {
          points: pad.l + "," + yOf(0) + " " + pts + " " + xOf(s.values.length - 1) + "," + yOf(0),
          fill: colors[si], opacity: cssVar("--chart-area-opacity") || 0.1,
        });
        svg.appendChild(poly);
      }
      svg.appendChild(svgEl("polyline", {
        points: pts, fill: "none", stroke: colors[si],
        "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round",
      }));
      /* end marker: >=8px dot with a 2px surface ring */
      var lastI = s.values.length - 1;
      svg.appendChild(svgEl("circle", {
        cx: xOf(lastI), cy: yOf(s.values[lastI]), r: 4,
        fill: colors[si], stroke: surface, "stroke-width": 2,
      }));
    });

    /* crosshair + tooltip across all series */
    var cross = svgEl("line", {
      x1: 0, y1: pad.t, x2: 0, y2: yOf(0),
      stroke: cssVar("--chart-axis"), "stroke-width": 1, "display": "none",
    });
    svg.appendChild(cross);
    var dots = series.map(function (s, si) {
      var c = svgEl("circle", { r: 4, fill: colors[si], stroke: surface, "stroke-width": 2, display: "none" });
      svg.appendChild(c);
      return c;
    });

    svg.addEventListener("mousemove", function (e) {
      var rect = svg.getBoundingClientRect();
      var mx = (e.clientX - rect.left) * (W / rect.width);
      var i = Math.round((mx - pad.l) / ((W - pad.l - pad.r) / Math.max(labels.length - 1, 1)));
      i = Math.max(0, Math.min(labels.length - 1, i));
      var x = xOf(i);
      cross.setAttribute("x1", x); cross.setAttribute("x2", x);
      cross.removeAttribute("display");
      series.forEach(function (s, si) {
        dots[si].setAttribute("cx", x);
        dots[si].setAttribute("cy", yOf(s.values[i]));
        dots[si].removeAttribute("display");
      });
      showTip(e.clientX, e.clientY, tipHtml(labels[i], series.map(function (s, si) {
        return { name: s.name, value: format(s.values[i]), color: colors[si] };
      })));
    });
    svg.addEventListener("mouseleave", function () {
      cross.setAttribute("display", "none");
      dots.forEach(function (d) { d.setAttribute("display", "none"); });
      hideTip();
    });

    node.appendChild(svg);
    legend(node, series, colors);
    srTable(node, labels, series, format);
  }

  /* ---------- DONUT (parts of a whole, max 5 slices then "Other") ---------- */
  function donut(target, opts) {
    var node = el(target);
    var format = opts.format || defaultFormat;
    var slices = opts.slices.slice().sort(function (a, b) { return b.value - a.value; });
    if (slices.length > MAX_SERIES) {
      var rest = slices.slice(MAX_SERIES - 1).reduce(function (t, s) { return t + s.value; }, 0);
      slices = slices.slice(0, MAX_SERIES - 1);
      slices.push({ label: "Other", value: rest, _other: true });
    }
    var colors = palette(slices.length);
    if (slices[slices.length - 1] && slices[slices.length - 1]._other) {
      colors[slices.length - 1] = cssVar("--chart-other");
    }

    var size = opts.height || 200;
    var cx = size / 2, cy = size / 2, r = size / 2 - 6, inner = r * 0.62;
    var total = slices.reduce(function (t, s) { return t + s.value; }, 0);
    var surface = cssVar("--base") || "#FFFFFF";

    var svg = noSelect(svgEl("svg", { viewBox: "0 0 " + size + " " + size, width: size, role: "img" }));
    if (opts.title) svg.setAttribute("aria-label", opts.title);
    /* A donut is a compact mark in a wide card — centre it. */
    svg.style.display = "block";
    svg.style.marginInline = "auto";

    var angle = -Math.PI / 2;
    slices.forEach(function (s, i) {
      var frac = total ? s.value / total : 0;
      var a2 = angle + frac * Math.PI * 2;
      var large = frac > 0.5 ? 1 : 0;
      function pt(rad, a) { return (cx + rad * Math.cos(a)) + " " + (cy + rad * Math.sin(a)); }
      var d = "M" + pt(r, angle) + " A" + r + " " + r + " 0 " + large + " 1 " + pt(r, a2) +
        " L" + pt(inner, a2) + " A" + inner + " " + inner + " 0 " + large + " 0 " + pt(inner, angle) + " Z";
      /* 2px surface stroke = the gap between touching slices */
      var path = svgEl("path", { d: d, fill: colors[i], stroke: surface, "stroke-width": 2 });
      path.addEventListener("mousemove", function (e) {
        var pct = total ? Math.round(1000 * s.value / total) / 10 : 0;
        showTip(e.clientX, e.clientY, tipHtml(s.label,
          [{ name: format(s.value), value: pct + "%", color: colors[i] }]));
      });
      path.addEventListener("mouseleave", hideTip);
      svg.appendChild(path);
      angle = a2;
    });

    /* center total — ink, never a series color */
    var t1 = svgEl("text", { x: cx, y: cy, "text-anchor": "middle" });
    t1.setAttribute("style", "font-family:var(--font-sans);font-size:20px;font-weight:700;fill:var(--chart-value);");
    t1.textContent = format(total);
    svg.appendChild(t1);
    var t2 = svgEl("text", { x: cx, y: cy + 16, "text-anchor": "middle" });
    t2.textContent = opts.totalLabel || "total";
    svg.appendChild(t2);

    node.appendChild(svg);
    legend(node, slices.map(function (s) { return { name: s.label }; }), colors, true);
    srTable(node, slices.map(function (s) { return s.label; }),
      [{ name: opts.totalLabel || "value", values: slices.map(function (s) { return s.value; }) }], format);
  }

  /* ---------- SPARKLINE (for stat tiles; de-emphasis hue, accent endpoint) ---------- */
  function sparkline(target, opts) {
    var node = el(target);
    var values = opts.values;
    var W = opts.width || 96, H = opts.height || 28, p = 3;
    var min = Math.min.apply(null, values), max = Math.max.apply(null, values);
    var span = max - min || 1;
    function xOf(i) { return p + (W - 2 * p) * (i / (values.length - 1)); }
    function yOf(v) { return p + (H - 2 * p) * (1 - (v - min) / span); }
    var pts = values.map(function (v, i) { return xOf(i) + "," + yOf(v); }).join(" ");

    var svg = noSelect(svgEl("svg", { viewBox: "0 0 " + W + " " + H, width: W, height: H, "aria-hidden": "true" }));
    svg.appendChild(svgEl("polyline", {
      points: pts, fill: "none", stroke: cssVar("--chart-seq-3"),
      "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round",
    }));
    svg.appendChild(svgEl("circle", {
      cx: xOf(values.length - 1), cy: yOf(values[values.length - 1]), r: 3,
      fill: cssVar("--chart-1"), stroke: cssVar("--base") || "#FFFFFF", "stroke-width": 2,
    }));
    node.appendChild(svg);
  }

  window.lwCharts = { bar: bar, line: line, donut: donut, sparkline: sparkline };
})();
