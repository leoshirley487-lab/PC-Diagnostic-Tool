// ===============================
// PC DIAGNOSTIC EXPERT SYSTEM
// ===============================

let state = {
  issue: "",
  ram: 0,
  storage: "",
  cpu: "",
  gpu: "",
  network: "",

  scores: {
    ram: 0,
    storage: 0,
    cpu: 0,
    gpu: 0,
    network: 0,
    overheating: 0
  }
};

// ===============================
// START
// ===============================

function startDiagnosis() {
  resetState();
  askMainIssue();
}

// ===============================
// RESET SYSTEM
// ===============================

function resetState() {
  state = {
    issue: "",
    ram: 0,
    storage: "",
    cpu: "",
    gpu: "",
    network: "",
    scores: {
      ram: 0,
      storage: 0,
      cpu: 0,
      gpu: 0,
      network: 0,
      overheating: 0
    }
  };
}

// ===============================
// STEP 1 - MAIN ISSUE
// ===============================

function askMainIssue() {
  document.getElementById("questionBox").innerHTML = `
    <h3>What issue are you experiencing?</h3>
    <button onclick="setIssue('slow')">Slow PC</button>
    <button onclick="setIssue('gaming')">Game Lag / FPS Drops</button>
    <button onclick="setIssue('internet')">Internet Issues</button>
  `;
}

function setIssue(type) {
  state.issue = type;

  if (type === "slow") askRAM();
  if (type === "gaming") askGPU();
  if (type === "internet") askNetwork();
}

// ===============================
// STEP 2A - SLOW PC PATH
// ===============================

function askRAM() {
  document.getElementById("questionBox").innerHTML = `
    <h3>How much RAM do you have?</h3>
    <button onclick="setRAM(4)">4GB</button>
    <button onclick="setRAM(8)">8GB</button>
    <button onclick="setRAM(16)">16GB+</button>
  `;
}

function setRAM(value) {
  state.ram = value;

  if (value <= 4) state.scores.ram += 70;
  else if (value <= 8) state.scores.ram += 40;

  askStorage();
}

function askStorage() {
  document.getElementById("questionBox").innerHTML = `
    <h3>Do you use SSD or HDD?</h3>
    <button onclick="setStorage('ssd')">SSD</button>
    <button onclick="setStorage('hdd')">HDD</button>
  `;
}

function setStorage(type) {
  state.storage = type;

  if (type === "hdd") state.scores.storage += 80;
  else state.scores.storage += 10;

  showResult();
}

// ===============================
// STEP 2B - GAMING PATH
// ===============================

function askGPU() {
  document.getElementById("questionBox").innerHTML = `
    <h3>What GPU level do you have?</h3>
    <button onclick="setGPU('low')">Integrated / Low-end</button>
    <button onclick="setGPU('mid')">Mid-range</button>
    <button onclick="setGPU('high')">High-end</button>
  `;
}

function setGPU(level) {
  state.gpu = level;

  if (level === "low") state.scores.gpu += 80;
  else if (level === "mid") state.scores.gpu += 40;

  askCPU();
}

function askCPU() {
  document.getElementById("questionBox").innerHTML = `
    <h3>What CPU level do you have?</h3>
    <button onclick="setCPU('low')">Low-end</button>
    <button onclick="setCPU('mid')">Mid-range</button>
    <button onclick="setCPU('high')">High-end</button>
  `;
}

function setCPU(level) {
  state.cpu = level;

  if (level === "low") state.scores.cpu += 70;
  else if (level === "mid") state.scores.cpu += 35;

  showResult();
}

// ===============================
// STEP 2C - INTERNET PATH
// ===============================

function askNetwork() {
  document.getElementById("questionBox").innerHTML = `
    <h3>What type of connection do you use?</h3>
    <button onclick="setNetwork('wifi')">Wi-Fi</button>
    <button onclick="setNetwork('ethernet')">Ethernet</button>
  `;
}

function setNetwork(type) {
  state.network = type;

  if (type === "wifi") state.scores.network += 60;

  showResult();
}

// ===============================
// FINAL RESULT ENGINE
// ===============================

function showResult() {

  let scores = state.scores;

  let issue = "Unknown issue";
  let fix = "";
  let confidence = 50;

  // RAM bottleneck
  if (scores.ram > scores.storage && scores.ram > scores.cpu) {
    issue = "RAM Bottleneck Detected";
    confidence = scores.ram;
    fix = "Upgrade RAM or close background apps.";
  }

  // Storage bottleneck
  else if (scores.storage > scores.ram) {
    issue = "Slow Storage (HDD detected)";
    confidence = scores.storage;
    fix = "Upgrade to SSD for major speed improvement.";
  }

  // GPU bottleneck
  else if (scores.gpu > scores.cpu) {
    issue = "GPU Limiting Performance";
    confidence = scores.gpu;
    fix = "Lower graphics settings or upgrade GPU.";
  }

  // CPU bottleneck
  else if (scores.cpu > scores.gpu) {
    issue = "CPU Bottleneck Detected";
    confidence = scores.cpu;
    fix = "Reduce background tasks or upgrade CPU.";
  }

  // Network issue
  else if (scores.network > 0) {
    issue = "Network Instability Detected";
    confidence = scores.network;
    fix = "Use Ethernet or reset router / check ISP.";
  }

  document.getElementById("resultBox").innerHTML = `
    <h2>Diagnosis Result</h2>
    <p><b>${issue}</b></p>
    <p>Confidence: ${confidence}%</p>
    <p><b>Recommended Fix:</b> ${fix}</p>
    <button onclick="startDiagnosis()">Restart</button>
  `;
}
