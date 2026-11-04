(() => {
  const params = new URLSearchParams(location.search);
  const room = (params.get("room") || "ROUND1").trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32) || "ROUND1";
  const isDisplay = location.pathname === "/display";
  const $ = (id) => document.getElementById(id);
  const socket = io();

  let currentState = null;
  let audioContext = null;
  let soundEnabled = true;

  const controller = $("controller");
  const display = $("display");

  if (isDisplay) {
    controller.classList.add("hidden");
    display.classList.remove("hidden");
  } else {
    display.classList.add("hidden");
    controller.classList.remove("hidden");

    $("roomLabel").textContent = room;

    const displayUrl = `${location.origin}/display?room=${encodeURIComponent(room)}`;

    $("openDisplay").href = displayUrl;

    $("copyDisplay").addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(displayUrl);
        $("copyDisplay").textContent = "Copied!";
      } catch {
        prompt("Copy this TV display link:", displayUrl);
      }
    });

    $("startPause").addEventListener("click", () => {
      command(currentState?.running ? "pause" : "start");
    });

    $("reset").addEventListener("click", () => command("reset"));
    $("next").addEventListener("click", () => command("next"));
    $("previous").addEventListener("click", () => command("previous"));

    $("preset").addEventListener("change", e => {
      if (e.target.value !== "custom") {
        command("set-preset", { preset: e.target.value });
      }
    });

    $("applyCustom").addEventListener("click", () => {
      command("set-custom", {
        substantiveMinutes: Number($("subMinutes").value),
        replyMinutes: Number($("replyMinutes").value),
        graceSeconds: Number($("graceSeconds").value)
      });
    });

    $("speakerSelect").addEventListener("change", e => {
      command("select-speaker", { index: Number(e.target.value) });
    });

    $("poiOverride").addEventListener("click", () => {
      command("set-poi", {
        allowed: currentState?.poiOverride === false
      });
    });

    $("soundToggle").addEventListener("change", e => {
      soundEnabled = e.target.checked;
    });

    buildSpeakerControls();
  }

  function command(action, extra = {}) {
    if (currentState) {
      socket.emit("command", { room, action, ...extra });
    }
  }

  const speakerData = [
    ["PM", "Prime Minister", "Government"],
    ["LO", "Leader of Opposition", "Opposition"],
    ["DPM", "Deputy Prime Minister", "Government"],
    ["DLO", "Deputy Leader of Opposition", "Opposition"],
    ["GW", "Government Whip", "Government"],
    ["OW", "Opposition Whip", "Opposition"],
    ["OR", "Opposition Reply", "Opposition"],
    ["GR", "Government Reply", "Government"]
  ];

  function buildSpeakerControls() {
    $("speakerSelect").innerHTML = speakerData.map((s, i) =>
      `<option value="${i}">${i + 1}. ${s[1]}</option>`
    ).join("");

    $("speakerList").innerHTML = speakerData.map((s, i) =>
      `<button class="speaker-item ${s[2] === "Government" ? "gov" : "opp"}" data-index="${i}">
        <span class="number">0${i + 1} · ${s[0]}</span>
        <strong>${s[1]}</strong>
        <small>${s[2]} · ${i < 6 ? "Substantive" : "Reply"}</small>
      </button>`
    ).join("");

    $("speakerList").querySelectorAll("button").forEach(b => {
      b.addEventListener("click", () => {
        command("select-speaker", {
          index: Number(b.dataset.index)
        });
      });
    });
  }

  function buildTvSequence(index) {
    const names = [
      "PM", "LO", "DPM", "DLO",
      "GW", "OW", "Opp Reply", "Gov Reply"
    ];

    return speakerData.map((s, i) =>
      `<div class="sequence-item ${s[2] === "Government" ? "gov" : "opp"} ${i === index ? "active" : ""}">
        <span class="seq-no">0${i + 1}</span>
        <strong>${names[i]}</strong>
        <small>${i < 6 ? "SUBSTANTIVE" : "REPLY"}</small>
      </div>`
    ).join("");
  }

  function formatTime(ms) {
    const seconds = Math.ceil(Math.max(0, ms) / 1000);

    return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  }

  function statusFor(s) {
    if (s.finished) return "TIME EXPIRED";
    if (s.inGrace) return "GRACE PERIOD · CONCLUDE YOUR SPEECH";
    if (s.running) return "SPEECH IN PROGRESS";

    return s.elapsedMs > 0 ? "PAUSED" : "READY TO BEGIN";
  }

  function render(s) {
    currentState = s;

    const speaker = s.speaker;
    const elapsed = s.elapsedMs;
    const inGrace = s.inGrace;

    const displayRemaining = inGrace
      ? Math.max(0, s.graceSeconds * 1000 - (elapsed - s.durationMs))
      : s.remainingMs;

    const timeText = formatTime(displayRemaining);
    const status = statusFor(s);
    const poi = s.poiAllowed;

    const sideName = speaker.side === "government"
      ? "GOVERNMENT"
      : "OPPOSITION";

    const phase = speaker.kind === "reply"
      ? "REPLY SPEECH"
      : "SUBSTANTIVE SPEECH";

    const progress = inGrace
      ? (s.graceSeconds > 0
          ? Math.min(100, (elapsed - s.durationMs) / (s.graceSeconds * 1000) * 100)
          : 100)
      : Math.min(100, elapsed / Math.max(1, s.durationMs) * 100);

    const timeClass = s.finished
      ? "finished"
      : inGrace
        ? "grace"
        : (!inGrace && s.remainingMs <= 60000 ? "warning" : "");

    if (!isDisplay) {
      $("speakerName").textContent = speaker.name;
      $("speakerShort").textContent = speaker.id;

      $("sideBadge").textContent = sideName;
      $("sideBadge").className = `side-badge ${speaker.side}`;

      $("phaseLabel").textContent = phase;
      $("timer").textContent = timeText;
      $("timer").className = `timer ${timeClass}`;

      $("statusText").textContent = status;
      $("progressBar").style.width = `${progress}%`;
      $("progressBar").style.background =
        speaker.side === "government" ? "#4389ff" : "#ef535e";

      $("startPause").textContent = s.running ? "Ⅱ Pause" : "▶ Start";
      $("startPause").disabled = s.finished;

      $("speakerSelect").value = String(s.speakerIndex);
      $("preset").value = s.preset;

      $("subMinutes").value = s.substantiveMinutes;
      $("replyMinutes").value = s.replyMinutes;
      $("graceSeconds").value = s.graceSeconds;

      $("poiState").textContent = poi ? "ALLOWED" : "NOT ALLOWED";

      $("poiHelp").textContent = speaker.kind === "reply"
        ? "POIs are never allowed in reply speeches"
        : (poi
            ? "Open floor for points of information"
            : "Protected time: first / final minute");

      $("poiCard").classList.toggle("allowed", poi);

      $("poiOverride").textContent = s.poiOverride === false
        ? "Re-enable automatic POI timing"
        : "Manually disable POIs";

      $("speakerList").querySelectorAll(".speaker-item").forEach((b, i) => {
        b.classList.toggle("active", i === s.speakerIndex);
      });

    } else {
      $("displayRoom").textContent = `ROOM ${room}`;

      $("displaySide").textContent = sideName;
      $("displaySide").className = `display-side ${speaker.side}`;

      $("displaySpeaker").textContent = speaker.name;
      $("displayPhase").textContent = phase;

      $("displayTimer").textContent = timeText;
      $("displayTimer").className = `display-timer ${timeClass}`;

      $("displayStatus").textContent = status;

      $("displayProgress").style.width = `${progress}%`;

      $("displayProgress").style.background = inGrace
        ? "#ff9b52"
        : (speaker.side === "government" ? "#4389ff" : "#ef535e");

      $("progressLabel").textContent = inGrace
        ? "GRACE PERIOD"
        : "SPEECH TIME";

      $("progressPercent").textContent = `${Math.round(progress)}%`;

      $("progressEndLabel").textContent = inGrace
        ? "GRACE ENDS"
        : "ALLOTTED TIME";

      const card = $("displayPoiCard");

      card.classList.toggle("allowed", poi);
      card.classList.toggle("closed", !poi);

      $("displayPoi").textContent = poi
        ? "POIs OPEN"
        : "POIs CLOSED";

      $("displayPoiDetail").textContent = speaker.kind === "reply"
        ? "Reply speeches do not allow points of information"
        : (poi
            ? "Opposition may offer brief points · speaker may accept or decline"
            : "Protected time · first and final minute");

      $("displayPoiWindow").innerHTML = speaker.kind === "reply"
        ? "REPLY SPEECH<br>NO POIs"
        : (poi
            ? "UNPROTECTED TIME<br>POINTS MAY BE OFFERED"
            : (elapsed < 60000
                ? "FIRST MINUTE<br>PROTECTED"
                : "FINAL MINUTE<br>PROTECTED"));

      $("speakerSequence").innerHTML = buildTvSequence(s.speakerIndex);
    }
  }

  function beep(kind) {
    if (!soundEnabled || isDisplay) return;

    try {
      audioContext = audioContext || new (
        window.AudioContext || window.webkitAudioContext
      )();

      if (audioContext.state === "suspended") {
        audioContext.resume();
      }

      const count = kind === "speech-end" ? 2 : 1;

      for (let i = 0; i < count; i++) {
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();

        osc.type = "sine";
        osc.frequency.value = kind === "grace-end" ? 880 : 660;

        gain.gain.setValueAtTime(
          .0001,
          audioContext.currentTime + i * .22
        );

        gain.gain.exponentialRampToValueAtTime(
          .18,
          audioContext.currentTime + i * .22 + .015
        );

        gain.gain.exponentialRampToValueAtTime(
          .0001,
          audioContext.currentTime + i * .22 + .16
        );

        osc.connect(gain);
        gain.connect(audioContext.destination);

        osc.start(audioContext.currentTime + i * .22);
        osc.stop(audioContext.currentTime + i * .22 + .18);
      }

    } catch (err) {
      console.warn("Audio signal unavailable:", err);
    }
  }

  socket.on("connect", () => {
    socket.emit("join-room", room);

    if (!isDisplay) {
      $("connectionDot").classList.add("online");
      $("connectionText").textContent = "Connected · synchronized";
    }
  });

  socket.on("disconnect", () => {
    if (!isDisplay) {
      $("connectionDot").classList.remove("online");
      $("connectionText").textContent = "Reconnecting…";
    }
  });

  socket.on("state", render);
  socket.on("tick", render);
  socket.on("signal", signal => beep(signal.name));

})();
