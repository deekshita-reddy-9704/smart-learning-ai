// visual.js — D3.js topic mind map with zoom/pan
"use strict";

let _svgRoot = null;
let _zoom    = null;

/* ══════════════════════════════════════════════════════════════════════════════
   GENERATE VISUAL TREE
══════════════════════════════════════════════════════════════════════════════ */
async function generateVisual() {
  showLoader("Building topic mind map…");
  const container = document.getElementById("visual-container");
  const svgEl     = document.getElementById("visual-svg");
  const hint      = document.getElementById("visual-hint");

  try {
    const data = await API.post(`/api/courses/${COURSE_ID}/generate-visual`);
    const tree = data.tree;

    if (!tree || !tree.name) {
      throw new Error("Invalid tree data from AI");
    }

    // Hide placeholder, show SVG
    container.classList.add("hidden");
    svgEl.classList.remove("hidden");
    if (hint) hint.classList.remove("hidden");

    renderD3Tree(tree, svgEl);
    showToast("Mind map ready!", "success");
  } catch (err) {
    container.classList.remove("hidden");
    svgEl.classList.add("hidden");
    container.innerHTML = `
      <div class="panel-empty">
        <i class="fa fa-triangle-exclamation empty-icon-lg" style="color:var(--accent)"></i>
        <h3>Could not build mind map</h3>
        <p>${window.escHtml ? escHtml(err.message) : err.message}</p>
        <button class="btn btn-primary" onclick="generateVisual()">
          <i class="fa fa-rotate-right"></i> Try Again
        </button>
      </div>`;
    showToast("Visual generation failed: " + err.message, "error");
  } finally {
    hideLoader();
  }
}

/* ══════════════════════════════════════════════════════════════════════════════
   D3 RENDERING
══════════════════════════════════════════════════════════════════════════════ */
function renderD3Tree(treeData, svgEl) {
  // Clear previous render
  d3.select(svgEl).selectAll("*").remove();

  const W      = svgEl.clientWidth  || 860;
  const H      = 520;
  const margin = { top: 40, right: 120, bottom: 40, left: 120 };
  const innerW = W - margin.left - margin.right;
  const innerH = H - margin.top  - margin.bottom;

  // Set viewBox
  d3.select(svgEl)
    .attr("viewBox", `0 0 ${W} ${H}`)
    .attr("preserveAspectRatio", "xMidYMid meet");

  const svg = d3.select(svgEl)
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  // ── D3 hierarchy ─────────────────────────────────────────────────────────
  const root    = d3.hierarchy(treeData);
  const layout  = d3.tree().size([innerH, innerW]);
  layout(root);

  // ── Curved links ─────────────────────────────────────────────────────────
  svg.append("g")
    .attr("class", "links")
    .selectAll("path")
    .data(root.links())
    .join("path")
    .attr("d", d3.linkHorizontal()
      .x(d => d.y)
      .y(d => d.x))
    .attr("fill", "none")
    .attr("stroke", "rgba(108,99,255,0.3)")
    .attr("stroke-width", 1.5);

  // ── Nodes ─────────────────────────────────────────────────────────────────
  const node = svg.append("g")
    .attr("class", "nodes")
    .selectAll("g")
    .data(root.descendants())
    .join("g")
    .attr("transform", d => `translate(${d.y},${d.x})`)
    .style("cursor", "pointer");

  // Determine node colours by depth
  const colours = {
    0: { fill: "#6c63ff", text: "#fff",   r: 10 },   // root
    1: { fill: "#1a1a2e", text: "#a09af8", r: 7 },    // module
    2: { fill: "#16213e", text: "#a0a0c0", r: 5 },    // subtopic
  };

  // Circles
  node.append("circle")
    .attr("r", d => (colours[d.depth] || colours[2]).r)
    .attr("fill", d => (colours[d.depth] || colours[2]).fill)
    .attr("stroke", d => d.depth === 0 ? "#8b84ff" : "rgba(108,99,255,0.25)")
    .attr("stroke-width", d => d.depth === 0 ? 2 : 1)
    .on("mouseover", function() { d3.select(this).attr("stroke", "#6c63ff").attr("stroke-width", 2); })
    .on("mouseout",  function(event, d) {
      d3.select(this)
        .attr("stroke", d.depth === 0 ? "#8b84ff" : "rgba(108,99,255,0.25)")
        .attr("stroke-width", d.depth === 0 ? 2 : 1);
    });

  // Labels
  node.append("text")
    .attr("dy", "0.32em")
    .attr("x", d => d.children ? -14 : 14)
    .attr("text-anchor", d => d.children ? "end" : "start")
    .attr("font-size", d => d.depth === 0 ? "13px" : d.depth === 1 ? "11px" : "10px")
    .attr("font-weight", d => d.depth === 0 ? "700" : d.depth === 1 ? "600" : "400")
    .attr("fill", d => (colours[d.depth] || colours[2]).text)
    .text(d => _truncate(d.data.name, d.depth === 0 ? 30 : d.depth === 1 ? 22 : 18))
    .append("title")
    .text(d => d.data.name);   // full name on hover

  // Expand/collapse on click (for deeper trees)
  node.on("click", (event, d) => {
    if (d.depth === 0) return;
    if (d._children) {
      d.children  = d._children;
      d._children = null;
    } else if (d.children) {
      d._children = d.children;
      d.children  = null;
    }
    // Re-render
    renderD3Tree(treeData, svgEl);
  });

  // ── Zoom + pan ────────────────────────────────────────────────────────────
  _zoom = d3.zoom()
    .scaleExtent([0.3, 3])
    .on("zoom", (event) => {
      svg.attr("transform", event.transform);
    });

  d3.select(svgEl).call(_zoom);
  _svgRoot = d3.select(svgEl);
}

/* Reset zoom to default */
function resetZoom() {
  if (_svgRoot && _zoom) {
    _svgRoot.transition().duration(400).call(
      _zoom.transform,
      d3.zoomIdentity.translate(120, 40)
    );
  }
}

function _truncate(str, max) {
  if (!str) return "";
  return str.length > max ? str.slice(0, max - 1) + "…" : str;
}