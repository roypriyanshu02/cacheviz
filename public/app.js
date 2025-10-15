// Cache Configuration
const CACHE_SIZE = 8;
const BLOCK_SIZE = 16;
const MEMORY_BANKS = 4;
const CELLS_PER_BANK = 4;
const ASSOCIATIVITY = 2; // For N-Way Set-Associative mode

// Animation speeds (in milliseconds) - optimized for snappier experience
const ANIMATION_SPEED = {
  PULSE_TRAVEL: 600, // Reduced from 900
  CACHE_FLASH: 350, // Reduced from 500
  MEMORY_DELAY: 300, // Reduced from 450
  STEP_DELAY: 150, // Reduced from 240
  CPU_PROCESS: 400, // Reduced from 600
};

const LOG_ICONS = {
  hit: "✅",
  miss: "⚠️",
  replace: "🔄",
  info: "ℹ️",
};

// Global State
const state = {
  cache: [],
  memory: [],
  hits: 0,
  misses: 0,
  isAnimating: false,
  nextReplacement: 0,
  step: 0,
  mode: "fully-associative", // 'direct', 'set-associative', 'fully-associative'
  setReplacementCounters: [], // For N-way set-associative replacement policy
};

let tooltipElement = null;
let announcementElement = null;

// Screen reader announcement function
function announceToScreenReader(message, priority = "polite") {
  if (!announcementElement) {
    announcementElement = document.createElement("div");
    announcementElement.setAttribute("aria-live", "polite");
    announcementElement.setAttribute("aria-atomic", "true");
    announcementElement.className = "sr-only";
    announcementElement.id = "sr-announcements";
    document.body.appendChild(announcementElement);
  }

  announcementElement.setAttribute("aria-live", priority);
  announcementElement.textContent = message;

  // Clear after a delay to allow re-announcement
  setTimeout(() => {
    announcementElement.textContent = "";
  }, 1000);
}
function generateRandomHexData() {
  const hexValues = [
    "DEADBEEF",
    "CAFEF00D",
    "BAADF00D",
    "FEEDFACE",
    "C0FFEE00",
    "ABAD1DEA",
    "DEFACED0",
    "FACADE00",
    "DECAFBAD",
    "BEEFCAFE",
    "F00DFACE",
    "C0DEC0DE",
    "BADCAB1E",
    "FACE1E55",
    "DEED5EED",
    "BEEF5EED",
  ];
  return hexValues[Math.floor(Math.random() * hexValues.length)];
}

// Initialize main memory with data
function initializeMemory() {
  state.memory = [];
  const totalCells = MEMORY_BANKS * CELLS_PER_BANK;
  for (let i = 0; i < totalCells; i++) {
    state.memory.push({
      address: i * BLOCK_SIZE,
      data: generateRandomHexData(),
    });
  }
  renderMemoryCells();
}

// Render memory cell data
function renderMemoryCells() {
  state.memory.forEach((memBlock, index) => {
    const bankIndex = Math.floor(index / CELLS_PER_BANK);
    const cellIndex = index % CELLS_PER_BANK;
    const bankGroup =
      document.querySelectorAll(".memory-bank-group")[bankIndex];
    if (bankGroup) {
      const cell = bankGroup.querySelectorAll(".memory-cell")[cellIndex];
      if (cell) {
        const cellX = parseFloat(cell.getAttribute("x"));

        // Add main hex text if it doesn't exist
        let textEl = cell.nextElementSibling;
        if (!textEl || !textEl.classList.contains("memory-cell-text")) {
          textEl = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "text",
          );
          textEl.classList.add("memory-cell-text");
          textEl.setAttribute("x", cellX + 25);
          textEl.setAttribute("y", 38);
          cell.parentNode.insertBefore(textEl, cell.nextSibling);
        }
        textEl.textContent = memBlock.data.substring(0, 6);

        // Add "data" label below hex text
        let labelEl = textEl.nextElementSibling;
        if (!labelEl || !labelEl.classList.contains("memory-cell-label")) {
          labelEl = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "text",
          );
          labelEl.classList.add("memory-cell-label");
          labelEl.setAttribute("x", cellX + 25);
          labelEl.setAttribute("y", 52);
          labelEl.textContent = "(data)";
          cell.parentNode.insertBefore(labelEl, textEl.nextSibling);
        }
      }
    }
  });
}

// Initialize cache with empty lines
function initializeCache() {
  state.cache = [];
  for (let i = 0; i < CACHE_SIZE; i++) {
    state.cache.push({
      valid: false,
      tag: null,
      data: null,
      lastAccess: null,
    });
  }

  // Initialize set replacement counters for set-associative mode
  const numSets = CACHE_SIZE / ASSOCIATIVITY;
  state.setReplacementCounters = [];
  for (let i = 0; i < numSets; i++) {
    state.setReplacementCounters.push(0);
  }

  renderCacheLines();
}

// Parse memory address from hex string
function parseAddress(addrStr) {
  // Remove 0x prefix if present
  const cleaned = addrStr.replace(/0x/i, "");
  return parseInt(cleaned, 16);
}

// Get offset bits (always log2(BLOCK_SIZE))
function getOffset(address) {
  return address % BLOCK_SIZE;
}

// Get number of offset bits
function _getOffsetBits() {
  return Math.log2(BLOCK_SIZE);
}

// Get number of index bits for direct mapped
function _getIndexBits() {
  return Math.log2(CACHE_SIZE);
}

// Get number of set bits for set-associative
function _getSetBits() {
  const numSets = CACHE_SIZE / ASSOCIATIVITY;
  return Math.log2(numSets);
}

// Get index for direct mapped cache
function getIndex(address) {
  const blockNumber = Math.floor(address / BLOCK_SIZE);
  return blockNumber % CACHE_SIZE;
}

// Get set number for set-associative cache
function getSet(address) {
  const blockNumber = Math.floor(address / BLOCK_SIZE);
  const numSets = CACHE_SIZE / ASSOCIATIVITY;
  return blockNumber % numSets;
}

// Extract tag from address (varies by mode)
function getTag(address) {
  const blockNumber = Math.floor(address / BLOCK_SIZE);

  if (state.mode === "direct") {
    // Tag = block number / cache size
    return Math.floor(blockNumber / CACHE_SIZE);
  } else if (state.mode === "set-associative") {
    // Tag = block number / number of sets
    const numSets = CACHE_SIZE / ASSOCIATIVITY;
    return Math.floor(blockNumber / numSets);
  } else {
    // Fully associative - entire block number is tag
    return blockNumber;
  }
}

// Search cache for tag (mode-aware)
function searchCache(tag, address) {
  if (state.mode === "direct") {
    // Direct mapped: only one possible location
    const index = getIndex(address);
    if (state.cache[index].valid && state.cache[index].tag === tag) {
      return index;
    }
    return -1;
  } else if (state.mode === "set-associative") {
    // Set-associative: search within the set
    const setNum = getSet(address);
    const startIdx = setNum * ASSOCIATIVITY;
    const endIdx = startIdx + ASSOCIATIVITY;

    for (let i = startIdx; i < endIdx; i++) {
      if (state.cache[i].valid && state.cache[i].tag === tag) {
        return i;
      }
    }
    return -1;
  } else {
    // Fully associative: search all lines
    for (let i = 0; i < state.cache.length; i++) {
      if (state.cache[i].valid && state.cache[i].tag === tag) {
        return i;
      }
    }
    return -1;
  }
}

// Find empty cache line or select victim for replacement (mode-aware)
function findVictimLine(address) {
  if (state.mode === "direct") {
    // Direct mapped: always replace at index
    return getIndex(address);
  } else if (state.mode === "set-associative") {
    // Set-associative: search within the set
    const setNum = getSet(address);
    const startIdx = setNum * ASSOCIATIVITY;
    const endIdx = startIdx + ASSOCIATIVITY;

    // First, try to find an invalid line in the set
    for (let i = startIdx; i < endIdx; i++) {
      if (!state.cache[i].valid) {
        return i;
      }
    }

    // If all lines in set are valid, use round-robin within the set
    const victim = startIdx + state.setReplacementCounters[setNum];
    state.setReplacementCounters[setNum] =
      (state.setReplacementCounters[setNum] + 1) % ASSOCIATIVITY;
    return victim;
  } else {
    // Fully associative: search all lines
    for (let i = 0; i < state.cache.length; i++) {
      if (!state.cache[i].valid) {
        return i;
      }
    }

    // If all lines are valid, use round-robin replacement
    const victim = state.nextReplacement;
    state.nextReplacement = (state.nextReplacement + 1) % CACHE_SIZE;
    return victim;
  }
}

// Update cache line
function updateCacheLine(lineIndex, tag, data) {
  state.cache[lineIndex] = {
    valid: true,
    tag,
    data,
    lastAccess: state.step,
  };
  renderCacheLine(lineIndex);
}

// Update address breakdown display with smooth transitions
function updateAddressBreakdown(address) {
  const breakdownDiv = document.getElementById("address-breakdown");

  // Show/hide based on mode with smooth transitions
  if (state.mode === "fully-associative") {
    if (breakdownDiv.classList.contains("visible")) {
      breakdownDiv.classList.remove("visible");
      setTimeout(() => {
        breakdownDiv.style.display = "none";
      }, 300); // Match transition duration
    }
    return;
  }

  // Update values
  const tag = getTag(address);
  const offset = getOffset(address);

  document.getElementById("tag-value").textContent = `0x${
    tag.toString(16).toUpperCase()
  }`;
  document.getElementById("offset-value").textContent = `0x${
    offset.toString(16).toUpperCase()
  }`;

  if (state.mode === "direct") {
    const index = getIndex(address);
    document.getElementById("index-set-label").textContent = "INDEX";
    document.getElementById("index-set-value").textContent = index.toString();
  } else if (state.mode === "set-associative") {
    const setNum = getSet(address);
    document.getElementById("index-set-label").textContent = "SET";
    document.getElementById("index-set-value").textContent = setNum.toString();
  }

  // Show with transition
  if (breakdownDiv.style.display === "none") {
    breakdownDiv.style.display = "block";
    // Force reflow to enable transition
    breakdownDiv.offsetHeight;
    requestAnimationFrame(() => {
      breakdownDiv.classList.add("visible");
    });
  }
}

// Clear address breakdown highlighting
function clearAddressBreakdown() {
  document.querySelectorAll(".bit-group").forEach((el) =>
    el.classList.remove("highlight")
  );
}

// Highlight specific part of address breakdown
function highlightAddressBreakdown(part) {
  clearAddressBreakdown();
  if (part === "index" || part === "set") {
    document.querySelector(".bit-index-set").classList.add("highlight");
  } else if (part === "tag") {
    document.querySelector(".bit-tag").classList.add("highlight");
  }
}

// Render set grouping backgrounds for set-associative mode
function renderSetGrouping() {
  const container = document.getElementById("cache-lines");

  // Remove existing set backgrounds
  container.querySelectorAll(".cache-set-background, .cache-set-divider")
    .forEach((el) => el.remove());

  if (state.mode !== "set-associative") {
    return;
  }

  const numSets = CACHE_SIZE / ASSOCIATIVITY;

  for (let setIdx = 0; setIdx < numSets; setIdx++) {
    const y = setIdx * ASSOCIATIVITY * 56;
    const height = ASSOCIATIVITY * 56 - 4; // Small gap between sets

    // Create background rectangle for the set
    const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    bg.setAttribute("x", "-8");
    bg.setAttribute("y", y);
    bg.setAttribute("width", "246");
    bg.setAttribute("height", height);
    bg.classList.add("cache-set-background");
    if (setIdx % 2 === 1) {
      bg.classList.add("alternate");
    }
    container.insertBefore(bg, container.firstChild);

    // Add divider line between sets (except after last set)
    if (setIdx < numSets - 1) {
      const divider = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "line",
      );
      divider.setAttribute("x1", "-8");
      divider.setAttribute("y1", y + height + 2);
      divider.setAttribute("x2", "238");
      divider.setAttribute("y2", y + height + 2);
      divider.classList.add("cache-set-divider");
      container.appendChild(divider);
    }
  }
}

// Render all cache lines in SVG
function renderCacheLines() {
  const container = document.getElementById("cache-lines");
  container.innerHTML = "";
  renderSetGrouping();
  for (let i = 0; i < CACHE_SIZE; i++) {
    renderCacheLine(i);
  }
}

// Render individual cache line
function renderCacheLine(index) {
  const container = document.getElementById("cache-lines");
  const line = state.cache[index];
  const y = index * 56;
  let group = document.getElementById(`cache-line-${index}`);
  if (!group) {
    group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    group.id = `cache-line-${index}`;
    group.classList.add("cache-line-group");
    group.dataset.index = index;
    container.appendChild(group);
  }
  group.innerHTML = "";
  group.setAttribute("transform", `translate(0, ${y})`);

  const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  rect.setAttribute("x", "0");
  rect.setAttribute("y", "0");
  rect.setAttribute("width", "230");
  rect.setAttribute("height", "52");
  rect.setAttribute("class", line.valid ? "cache-line" : "cache-line empty");
  group.appendChild(rect);

  // Column 1: Metadata (Line Number + Valid Bit)
  const lineNum = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "text",
  );
  lineNum.setAttribute("x", "10");
  lineNum.setAttribute("y", "20");
  lineNum.setAttribute("class", "cache-line-label");
  lineNum.textContent = `L${index}`;
  group.appendChild(lineNum);

  const validText = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "text",
  );
  validText.setAttribute("x", "10");
  validText.setAttribute("y", "38");
  validText.setAttribute("class", "cache-line-valid");
  validText.setAttribute(
    "fill",
    line.valid ? "var(--color-hit)" : "var(--text-secondary)",
  );
  validText.textContent = line.valid ? "V: 1" : "V: 0";
  group.appendChild(validText);

  // Column 2: Tag
  const tagLabel = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "text",
  );
  tagLabel.setAttribute("x", "50");
  tagLabel.setAttribute("y", "20");
  tagLabel.setAttribute("class", "cache-line-label");
  tagLabel.textContent = "TAG";
  group.appendChild(tagLabel);

  const tagValue = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "text",
  );
  tagValue.setAttribute("x", "50");
  tagValue.setAttribute("y", "38");
  tagValue.setAttribute("class", "cache-line-text");
  tagValue.textContent = line.valid
    ? `0x${line.tag.toString(16).toUpperCase()}`
    : "-";
  group.appendChild(tagValue);

  // Column 3: Data
  const dataLabel = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "text",
  );
  dataLabel.setAttribute("x", "115");
  dataLabel.setAttribute("y", "20");
  dataLabel.setAttribute("class", "cache-line-label");
  dataLabel.textContent = "DATA";
  group.appendChild(dataLabel);

  const dataValue = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "text",
  );
  dataValue.setAttribute("x", "115");
  dataValue.setAttribute("y", "38");
  dataValue.setAttribute("class", "cache-line-text");
  dataValue.setAttribute("font-size", "11");
  // Truncate data text if too long (max 18 chars) to prevent overflow
  let displayData = line.valid ? line.data : "-";
  if (displayData.length > 18) {
    displayData = displayData.substring(0, 18) + "…";
  }
  dataValue.textContent = displayData;
  group.appendChild(dataValue);

  group.dataset.tag = line.valid
    ? `0x${line.tag.toString(16).toUpperCase()}`
    : "—";
  group.dataset.data = line.valid ? line.data : "—";
  group.dataset.access = line.lastAccess != null ? line.lastAccess : "—";

  if (!group.dataset.bound) {
    group.addEventListener("mouseenter", handleCacheLineEnter);
    group.addEventListener("mousemove", handleCacheLineMove);
    group.addEventListener("mouseleave", hideTooltip);
    group.dataset.bound = "true";
  }
  group.classList.toggle("hoverable", line.valid);
}

// Update statistics display (optimized with smooth animations)
function updateStats() {
  const hitCountEl = document.querySelector(".hit-count");
  const missCountEl = document.querySelector(".miss-count");
  const hitRateEl = document.querySelector(".hit-rate");

  const newHitCount = state.hits.toString();
  const newMissCount = state.misses.toString();

  if (hitCountEl.textContent !== newHitCount) {
    hitCountEl.textContent = newHitCount;
    hitCountEl.classList.add("updated");
    setTimeout(() => hitCountEl.classList.remove("updated"), 300);
  }

  if (missCountEl.textContent !== newMissCount) {
    missCountEl.textContent = newMissCount;
    missCountEl.classList.add("updated");
    setTimeout(() => missCountEl.classList.remove("updated"), 300);
  }

  const total = state.hits + state.misses;
  const hitRate = total > 0 ? ((state.hits / total) * 100).toFixed(1) : 0;
  const newHitRate = `${hitRate}%`;

  if (hitRateEl.textContent !== newHitRate) {
    hitRateEl.textContent = newHitRate;
    hitRateEl.classList.add("updated");
    setTimeout(() => hitRateEl.classList.remove("updated"), 300);
  }
}

// Add entry to event log
function addLogEntry(message, type = "info") {
  const log = document.getElementById("event-log");
  const entry = document.createElement("div");
  entry.className = `log-entry ${type}`;
  const icon = document.createElement("div");
  icon.className = "log-entry-icon";
  icon.textContent = LOG_ICONS[type] || LOG_ICONS.info;
  const textWrap = document.createElement("div");
  textWrap.className = "log-text";
  const messageEl = document.createElement("div");
  messageEl.className = "log-message";
  messageEl.textContent = message;
  const timestampEl = document.createElement("div");
  timestampEl.className = "log-timestamp";
  timestampEl.textContent = new Date().toLocaleTimeString();
  textWrap.appendChild(messageEl);
  textWrap.appendChild(timestampEl);
  entry.appendChild(icon);
  entry.appendChild(textWrap);
  log.insertBefore(entry, log.firstChild);
  while (log.children.length > 50) {
    log.removeChild(log.lastChild);
  }

  // Announce important events to screen readers
  if (type === "hit" || type === "miss" || type === "replace") {
    announceToScreenReader(message, "assertive");
  }
}

function animatePulse(pulseId, pathId, duration, variant, reverse = false) {
  return new Promise((resolve) => {
    const pulseGroup = document.getElementById(pulseId);
    const head = pulseGroup.querySelector(".pulse-head");
    const tail = pulseGroup.querySelector(".pulse-tail");
    const path = document.getElementById(pathId);
    const pathLength = path.getTotalLength();
    pulseGroup.style.display = "block";
    if (variant) {
      head.classList.add(variant);
      tail.classList.add(variant);
    }
    const startTime = performance.now();
    function step(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = progress < 0.5
        ? 2 * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 2) / 2;
      const headLength = reverse
        ? pathLength * (1 - eased)
        : pathLength * eased;
      const tailLength = reverse
        ? Math.min(headLength + 60, pathLength)
        : Math.max(headLength - 60, 0);
      const headPoint = path.getPointAtLength(headLength);
      const tailPoint = path.getPointAtLength(tailLength);
      head.setAttribute("cx", headPoint.x);
      head.setAttribute("cy", headPoint.y);
      tail.setAttribute("x1", tailPoint.x);
      tail.setAttribute("y1", tailPoint.y);
      tail.setAttribute("x2", headPoint.x);
      tail.setAttribute("y2", headPoint.y);
      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        pulseGroup.style.display = "none";
        if (variant) {
          head.classList.remove(variant);
          tail.classList.remove(variant);
        }
        resolve();
      }
    }
    requestAnimationFrame(step);
  });
}

// CPU Processing Animation
function animateCPUProcessing() {
  return new Promise((resolve) => {
    const cpuCore = document.getElementById("cpu-core");
    const coreLines = document.getElementById("cpu-core-lines");
    cpuCore.classList.add("cpu-processing");
    coreLines.classList.add("cpu-core-processing");

    setTimeout(() => {
      cpuCore.classList.remove("cpu-processing");
      coreLines.classList.remove("cpu-core-processing");
      resolve();
    }, 600);
  });
}

// Activate wire
function activateWire(wireId) {
  const wire = document.getElementById(wireId);
  if (wire) {
    wire.classList.add("active");
    setTimeout(() => {
      wire.classList.remove("active");
    }, ANIMATION_SPEED.PULSE_TRAVEL);
  }
}

// Flash cache line on hit
function flashCacheLine(lineIndex) {
  return new Promise((resolve) => {
    const group = document.getElementById(`cache-line-${lineIndex}`);
    const rect = group.querySelector(".cache-line");
    rect.classList.add("hit-animation");

    setTimeout(() => {
      rect.classList.remove("hit-animation");
      resolve();
    }, ANIMATION_SPEED.CACHE_FLASH);
  });
}

// Flash cache on miss
function shakeCacheOnMiss() {
  return new Promise((resolve) => {
    const cacheBody = document.querySelector(".cache-body");
    const originalStroke = cacheBody.style.stroke;
    cacheBody.style.stroke = "rgba(253, 126, 20, 0.8)";
    cacheBody.style.strokeWidth = "3";
    cacheBody.style.animation = "missShake 0.4s ease-in-out";
    setTimeout(() => {
      cacheBody.style.animation = "";
      cacheBody.style.stroke = originalStroke;
      cacheBody.style.strokeWidth = "";
      resolve();
    }, 400);
  });
}

function triggerCpuProcessing() {
  return new Promise((resolve) => {
    const core = document.getElementById("cpu-core");
    const lines = document.getElementById("cpu-core-lines");
    core.classList.add("processing");
    lines.classList.add("processing");
    setTimeout(() => {
      core.classList.remove("processing");
      lines.classList.remove("processing");
      resolve();
    }, ANIMATION_SPEED.CPU_PROCESS);
  });
}

function highlightMemory(address) {
  const blockIndex = Math.floor(address / BLOCK_SIZE);
  const bankIndex = Math.floor(blockIndex / CELLS_PER_BANK) % MEMORY_BANKS;
  const cellIndex = blockIndex % CELLS_PER_BANK;
  document.querySelectorAll(".memory-bank-group").forEach((group, idx) => {
    if (idx === bankIndex) {
      group.classList.add("highlight");
      group.querySelectorAll(".memory-cell").forEach((cell, cellIdx) => {
        cell.classList.toggle("highlight", cellIdx === cellIndex);
      });
    } else {
      group.classList.remove("highlight");
      group.querySelectorAll(".memory-cell").forEach((cell) =>
        cell.classList.remove("highlight")
      );
    }
  });
}

function clearMemoryHighlight() {
  document.querySelectorAll(".memory-bank-group").forEach((group) => {
    group.classList.remove("highlight");
    group.querySelectorAll(".memory-cell").forEach((cell) =>
      cell.classList.remove("highlight")
    );
  });
}

// Highlight target cache line(s) based on mode
function highlightTargetLines(address) {
  return new Promise((resolve) => {
    if (state.mode === "direct") {
      // Highlight the single target line
      const index = getIndex(address);
      const group = document.getElementById(`cache-line-${index}`);
      const rect = group.querySelector(".cache-line");
      rect.classList.add("target-line");
      setTimeout(() => {
        rect.classList.remove("target-line");
        resolve();
      }, 1000);
    } else if (state.mode === "set-associative") {
      // Highlight all lines in the target set
      const setNum = getSet(address);
      const startIdx = setNum * ASSOCIATIVITY;
      const endIdx = startIdx + ASSOCIATIVITY;

      for (let i = startIdx; i < endIdx; i++) {
        const group = document.getElementById(`cache-line-${i}`);
        group.classList.add("in-set-highlight");
      }

      setTimeout(() => {
        for (let i = startIdx; i < endIdx; i++) {
          const group = document.getElementById(`cache-line-${i}`);
          group.classList.remove("in-set-highlight");
        }
        resolve();
      }, 1000);
    } else {
      // Fully associative - no specific target highlighting
      resolve();
    }
  });
}

async function animateCacheHit(lineIndex, address, actionVerb) {
  // Step 1: CPU Processing
  await animateCPUProcessing();

  // Step 2: CPU -> Cache request on address bus
  activateWire("wire-cpu-cache-addr");
  await animatePulse(
    "pulse-cpu-cache-req",
    "wire-cpu-cache-addr",
    ANIMATION_SPEED.PULSE_TRAVEL,
    null,
    false,
  );
  await new Promise((resolve) =>
    setTimeout(resolve, ANIMATION_SPEED.STEP_DELAY)
  );

  // Step 2.5: For direct/set-associative, highlight index/set first
  if (state.mode === "direct" || state.mode === "set-associative") {
    highlightAddressBreakdown(state.mode === "direct" ? "index" : "set");
    await highlightTargetLines(address);
    clearAddressBreakdown();
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  // Step 3: Cache hit flash
  await flashCacheLine(lineIndex);
  addLogEntry(
    `${actionVerb} 0x${
      address.toString(16).toUpperCase()
    } -> HIT (Line ${lineIndex})`,
    "hit",
  );
  await new Promise((resolve) =>
    setTimeout(resolve, ANIMATION_SPEED.STEP_DELAY)
  );

  // Step 4: Cache -> CPU data return on data bus
  activateWire("wire-cpu-cache-data");
  await animatePulse(
    "pulse-cache-cpu-data",
    "wire-cpu-cache-data",
    ANIMATION_SPEED.PULSE_TRAVEL,
    "hit",
    true,
  );
}

async function animateCacheMiss(
  lineIndex,
  address,
  tag,
  actionVerb,
  replacedTag,
) {
  // Step 1: CPU Processing
  await animateCPUProcessing();

  // Step 2: CPU -> Cache request on address bus
  activateWire("wire-cpu-cache-addr");
  await animatePulse(
    "pulse-cpu-cache-req",
    "wire-cpu-cache-addr",
    ANIMATION_SPEED.PULSE_TRAVEL,
    null,
    false,
  );
  await new Promise((resolve) => setTimeout(resolve, 200));

  // Step 2.5: For direct/set-associative, highlight index/set first
  if (state.mode === "direct" || state.mode === "set-associative") {
    highlightAddressBreakdown(state.mode === "direct" ? "index" : "set");
    await highlightTargetLines(address);
    clearAddressBreakdown();
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  // Step 3: Cache indicates MISS
  await shakeCacheOnMiss();
  addLogEntry(
    `${actionVerb} 0x${address.toString(16).toUpperCase()} -> MISS`,
    "miss",
  );
  await new Promise((resolve) => setTimeout(resolve, 200));

  // Step 4: Show fade-out of replaced line if valid
  if (replacedTag != null) {
    const group = document.getElementById(`cache-line-${lineIndex}`);
    const rect = group.querySelector(".cache-line");
    rect.classList.add("replacing");
    addLogEntry(
      `REPLACE Line ${lineIndex} (was 0x${
        replacedTag.toString(16).toUpperCase()
      })`,
      "replace",
    );
    await new Promise((resolve) => setTimeout(resolve, 500));
    rect.classList.remove("replacing");
  }

  // Step 5: Cache -> Memory request on address bus
  activateWire("wire-cache-memory-addr");
  await animatePulse(
    "pulse-cache-memory-req",
    "wire-cache-memory-addr",
    ANIMATION_SPEED.PULSE_TRAVEL,
    "miss",
    false,
  );
  await new Promise((resolve) => setTimeout(resolve, 200));

  // Step 6: Highlight correct block in Main Memory
  highlightMemory(address);
  await new Promise((resolve) =>
    setTimeout(resolve, ANIMATION_SPEED.MEMORY_DELAY)
  );

  // Step 7: Memory -> Cache data on data bus
  activateWire("wire-cache-memory-data");
  await animatePulse(
    "pulse-memory-cache-data",
    "wire-cache-memory-data",
    ANIMATION_SPEED.PULSE_TRAVEL,
    "miss",
    true,
  );
  await new Promise((resolve) => setTimeout(resolve, 200));

  // Step 8: Cache line visibly updates with fade-in
  updateCacheLine(
    lineIndex,
    tag,
    `Block@0x${address.toString(16).toUpperCase()}`,
  );
  const group = document.getElementById(`cache-line-${lineIndex}`);
  const rect = group.querySelector(".cache-line");
  rect.classList.add("updating");
  await flashCacheLine(lineIndex);
  addLogEntry(
    `FETCH 0x${
      address.toString(16).toUpperCase()
    } -> Stored in Line ${lineIndex}`,
    "info",
  );
  await new Promise((resolve) => setTimeout(resolve, 500));
  rect.classList.remove("updating");

  // Step 9: Clear memory highlight and deliver to CPU on data bus
  clearMemoryHighlight();
  await new Promise((resolve) => setTimeout(resolve, 200));
  activateWire("wire-cpu-cache-data");
  await animatePulse(
    "pulse-cache-cpu-data",
    "wire-cpu-cache-data",
    ANIMATION_SPEED.PULSE_TRAVEL,
    "hit",
    true,
  );
}

// Process memory access command
async function processMemoryAccess(operation, address) {
  if (state.isAnimating) {
    addLogEntry("Animation in progress, please wait...", "info");
    return;
  }
  state.isAnimating = true;
  document.getElementById("execute-btn").disabled = true;
  state.step += 1;
  clearMemoryHighlight();

  // Update address breakdown display
  updateAddressBreakdown(address);

  await triggerCpuProcessing();
  const tag = getTag(address);
  const lineIndex = searchCache(tag, address);
  const actionVerb = operation === "STORE" ? "WRITE" : "READ";
  if (lineIndex !== -1) {
    state.hits++;
    state.cache[lineIndex].lastAccess = state.step;
    if (operation === "STORE") {
      state.cache[lineIndex].data = `Write@0x${
        address.toString(16).toUpperCase()
      }`;
    }
    renderCacheLine(lineIndex);
    await animateCacheHit(lineIndex, address, actionVerb);
  } else {
    state.misses++;
    const victimLine = findVictimLine(address);
    const replacedTag = state.cache[victimLine].valid
      ? state.cache[victimLine].tag
      : null;
    await animateCacheMiss(victimLine, address, tag, actionVerb, replacedTag);
  }
  updateStats();
  state.isAnimating = false;
  document.getElementById("execute-btn").disabled = false;
}

// Parse and execute single command
function executeSingleCommand(command) {
  const trimmed = command.trim();
  if (!trimmed) return null;

  // Parse commands like: LOAD R1, 0x1A4 or STORE R2, 0x2B0
  const regex = /^(LOAD|STORE)\s+R(\d+),\s*0x([0-9A-Fa-f]+)$/i;
  const match = trimmed.match(regex);

  if (!match) {
    return null;
  }

  const operation = match[1].toUpperCase();
  const registerNum = parseInt(match[2], 10);
  const addressHex = match[3];

  // Validate register number (reasonable range)
  if (registerNum < 0 || registerNum > 31) {
    throw new Error(
      `Invalid register number R${registerNum}. Must be between R0 and R31.`,
    );
  }

  // Validate address length (reasonable hex address)
  if (addressHex.length < 1 || addressHex.length > 8) {
    throw new Error(`Invalid address 0x${addressHex}. Must be 1-8 hex digits.`);
  }

  try {
    const address = parseAddress(addressHex);
    return { operation, address };
  } catch (error) {
    throw new Error(`Invalid address 0x${addressHex}: ${error.message}`);
  }
}

// Execute multi-line commands sequentially with visual error feedback
async function executeCommand(commandText) {
  const inputElement = document.getElementById("command-input");

  // Clear previous error state
  inputElement.classList.remove("error");

  const trimmed = commandText.trim();
  if (!trimmed) return;

  // Split by newlines and filter empty lines
  const lines = trimmed.split("\n").map((line) => line.trim()).filter((line) =>
    line.length > 0
  );

  if (lines.length === 0) return;

  // Check if already animating
  if (state.isAnimating) {
    addLogEntry("Animation in progress, please wait...", "info");
    return;
  }

  // Parse all commands first to validate
  const commands = [];
  for (let i = 0; i < lines.length; i++) {
    try {
      const parsed = executeSingleCommand(lines[i]);
      if (!parsed) {
        // Show visual error feedback
        inputElement.classList.add("error");
        addLogEntry(
          `❌ Invalid command on line ${i + 1}: "${
            lines[i]
          }". Use: LOAD/STORE Rn, 0xADDR`,
          "info",
        );

        // Clear error state after animation
        setTimeout(() => {
          inputElement.classList.remove("error");
        }, 1000);
        return;
      }
      commands.push(parsed);
    } catch (error) {
      // Show visual error feedback
      inputElement.classList.add("error");
      addLogEntry(`❌ Error on line ${i + 1}: ${error.message}`, "info");

      // Clear error state after animation
      setTimeout(() => {
        inputElement.classList.remove("error");
      }, 1000);
      return;
    }
  }

  // Execute commands sequentially
  for (let i = 0; i < commands.length; i++) {
    const { operation, address } = commands[i];
    try {
      await processMemoryAccess(operation, address);
    } catch (error) {
      addLogEntry(
        `❌ Runtime error executing "${operation} R?, 0x${
          address.toString(16).toUpperCase()
        }": ${error.message}`,
        "info",
      );
      return;
    }

    // Add delay between commands if there are more
    if (i < commands.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }
}

// Show reset confirmation modal with focus management
function showResetModal() {
  if (state.isAnimating) {
    addLogEntry("Cannot reset during animation", "info");
    return;
  }
  const modal = document.getElementById("reset-modal");
  modal.style.display = "flex";

  // Store previously focused element
  modal.dataset.previousFocus = document.activeElement.id || "";

  // Focus the cancel button for accessibility
  setTimeout(() => {
    document.getElementById("modal-cancel").focus();
  }, 100);
}

// Hide reset confirmation modal and restore focus
function hideResetModal() {
  const modal = document.getElementById("reset-modal");
  const previousFocusId = modal.dataset.previousFocus;

  modal.style.display = "none";

  // Restore focus to previous element
  if (previousFocusId) {
    const previousElement = document.getElementById(previousFocusId);
    if (previousElement) {
      previousElement.focus();
    }
  }
}

// Reset simulation with complete state cleanup
function resetSimulation() {
  // Reset all state variables
  state.hits = 0;
  state.misses = 0;
  state.nextReplacement = 0;
  state.step = 0;
  state.isAnimating = false;

  // Clear any input errors
  const inputElement = document.getElementById("command-input");
  if (inputElement) {
    inputElement.classList.remove("error");
  }

  // Re-initialize cache and memory
  initializeCache();
  initializeMemory();

  // Update UI
  updateStats();
  document.getElementById("event-log").innerHTML = "";

  // Clear all visual states
  clearMemoryHighlight();
  clearAddressBreakdown();
  hideTooltip();

  // Remove any active animations
  document.querySelectorAll(".wire").forEach((wire) =>
    wire.classList.remove("active")
  );
  document.querySelectorAll(".cache-line").forEach((line) => {
    line.classList.remove(
      "hit-animation",
      "miss-animation",
      "replacing",
      "updating",
      "target-line",
    );
  });

  // Re-enable execute button
  document.getElementById("execute-btn").disabled = false;

  // Log reset
  addLogEntry("RESET -> Simulation ready", "info");
  addLogEntry(`MODE -> ${state.mode.replace("-", " ").toUpperCase()}`, "info");

  hideResetModal();
}

// Handle mode change with complete state cleanup
function handleModeChange(newMode) {
  if (state.isAnimating) {
    addLogEntry("Cannot change mode during animation", "info");
    // Revert radio button
    document.querySelector(`input[name="cache-mode"][value="${state.mode}"]`)
      .checked = true;
    return;
  }

  state.mode = newMode;

  // Perform complete reset when mode changes
  state.hits = 0;
  state.misses = 0;
  state.nextReplacement = 0;
  state.step = 0;
  state.isAnimating = false;

  // Clear any input errors
  const inputElement = document.getElementById("command-input");
  if (inputElement) {
    inputElement.classList.remove("error");
  }

  // Re-initialize cache and memory
  initializeCache();
  initializeMemory();

  // Update UI
  updateStats();
  document.getElementById("event-log").innerHTML = "";

  // Clear all visual states
  clearMemoryHighlight();
  clearAddressBreakdown();
  hideTooltip();

  // Remove any active animations
  document.querySelectorAll(".wire").forEach((wire) =>
    wire.classList.remove("active")
  );
  document.querySelectorAll(".cache-line").forEach((line) => {
    line.classList.remove(
      "hit-animation",
      "miss-animation",
      "replacing",
      "updating",
      "target-line",
    );
  });
  document.querySelectorAll(".cache-line-group").forEach((group) => {
    group.classList.remove("in-set-highlight");
  });

  // Re-enable execute button
  document.getElementById("execute-btn").disabled = false;

  // Log mode change
  addLogEntry("MODE CHANGED -> Simulation reset", "info");
  addLogEntry(`MODE -> ${state.mode.replace("-", " ").toUpperCase()}`, "info");

  if (state.mode === "set-associative") {
    addLogEntry(`CONFIG -> ${ASSOCIATIVITY}-Way Set-Associative`, "info");
  }
}

// Event Listeners
document.addEventListener("DOMContentLoaded", () => {
  // Initialize
  initializeCache();
  initializeMemory();
  updateStats();
  addLogEntry("INIT -> CacheViz ready", "info");
  addLogEntry(`CONFIG -> ${CACHE_SIZE} lines, ${BLOCK_SIZE}B blocks`, "info");
  addLogEntry(`MODE -> ${state.mode.replace("-", " ").toUpperCase()}`, "info");

  // Mode change listeners
  document.querySelectorAll('input[name="cache-mode"]').forEach((radio) => {
    radio.addEventListener("change", (e) => {
      if (e.target.checked) {
        handleModeChange(e.target.value);
      }
    });
  });

  // Execute button
  document.getElementById("execute-btn").addEventListener("click", () => {
    const input = document.getElementById("command-input");
    executeCommand(input.value);
  });

  // Ctrl+Enter or Cmd+Enter in textarea to execute
  document.getElementById("command-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      executeCommand(e.target.value);
    }
  });

  // Reset button - show modal
  document.getElementById("reset-btn").addEventListener(
    "click",
    showResetModal,
  );

  // Modal handlers
  document.getElementById("modal-cancel").addEventListener(
    "click",
    hideResetModal,
  );
  document.getElementById("modal-confirm").addEventListener(
    "click",
    resetSimulation,
  );
  document.querySelector(".modal-overlay").addEventListener(
    "click",
    hideResetModal,
  );

  // Keyboard support for modal (Escape key)
  document.addEventListener("keydown", (e) => {
    const modal = document.getElementById("reset-modal");
    if (e.key === "Escape" && modal.style.display === "flex") {
      e.preventDefault();
      hideResetModal();
    }
  });

  // Example items - click and keyboard support
  document.querySelectorAll(".example-item").forEach((item) => {
    const loadExample = () => {
      // Decode HTML entities (&#10; = newline)
      const command = item.getAttribute("data-command").replace(/&#10;/g, "\n");
      document.getElementById("command-input").value = command;
      executeCommand(command);
    };

    item.addEventListener("click", loadExample);

    // Keyboard support (Enter or Space)
    item.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        loadExample();
      }
    });
  });
  tooltipElement = document.createElement("div");
  tooltipElement.className = "tooltip";
  tooltipElement.style.display = "none";
  document.body.appendChild(tooltipElement);
});

function handleCacheLineEnter(event) {
  const index = Number(event.currentTarget.dataset.index);
  const line = state.cache[index];
  if (!line.valid) {
    hideTooltip();
    return;
  }
  showTooltip(event, line);
}

function handleCacheLineMove(event) {
  const index = Number(event.currentTarget.dataset.index);
  const line = state.cache[index];
  if (!line.valid) {
    hideTooltip();
    return;
  }
  showTooltip(event, line);
}

function showTooltip(event, line) {
  if (!tooltipElement) return;
  tooltipElement.innerHTML = `
        <div><strong>Full Tag:</strong> 0x${
    line.tag.toString(16).toUpperCase()
  }</div>
        <div><strong>Data:</strong> ${line.data}</div>
        <div><strong>Last Accessed:</strong> ${line.lastAccess}</div>
    `;
  tooltipElement.style.display = "block";
  tooltipElement.style.left = `${event.clientX + 16}px`;
  tooltipElement.style.top = `${event.clientY + 16}px`;
}

function hideTooltip() {
  if (tooltipElement) {
    tooltipElement.style.display = "none";
  }
}
