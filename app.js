(() => {
  "use strict";

  const REQUIRED_HITS = 3;
  const HIT_WINDOW_MS = 1600;
  const state = { code: "", hits: 0, lastSeenAt: 0, running: false, confirmed: false };

  const $ = (id) => document.getElementById(id);
  const startPanel = $("start-panel");
  const resultPanel = $("result-panel");
  const errorPanel = $("error-panel");
  const resultCode = $("result-code");
  const progress = $("progress");

  function hasValidEanCheckDigit(code) {
    if (!/^\d{8}$|^\d{13}$/.test(code)) return false;
    const digits = [...code].map(Number);
    const check = digits.pop();
    const sum = digits.reduce((total, digit, index) => {
      const positionFromRight = digits.length - index;
      return total + digit * (positionFromRight % 2 === 1 ? 3 : 1);
    }, 0);
    return (10 - (sum % 10)) % 10 === check;
  }

  function resetHits() {
    state.code = "";
    state.hits = 0;
    state.lastSeenAt = 0;
    progress.textContent = "● ○ ○";
  }

  function registerDetection(code, now = Date.now()) {
    if (!hasValidEanCheckDigit(code) || state.confirmed) return false;

    const isSameRun = code === state.code && now - state.lastSeenAt <= HIT_WINDOW_MS;
    state.hits = isSameRun ? state.hits + 1 : 1;
    state.code = code;
    state.lastSeenAt = now;
    progress.textContent = [0, 1, 2].map((i) => i < state.hits ? "●" : "○").join(" ");
    return state.hits >= REQUIRED_HITS;
  }

  function stopScanner() {
    if (!state.running) return;
    window.Quagga.stop();
    state.running = false;
  }

  function confirmCode(code) {
    state.confirmed = true;
    stopScanner();
    resultCode.textContent = code;
    resultPanel.classList.remove("hidden");
    if (navigator.vibrate) navigator.vibrate([80, 40, 120]);
  }

  function onDetected(result) {
    const code = result?.codeResult?.code;
    if (code && registerDetection(code)) confirmCode(code);
  }

  function friendlyError(error) {
    const name = error?.name || "";
    if (name === "NotAllowedError" || name === "PermissionDeniedError") {
      return "Safariの設定で<br>カメラを許可してね";
    }
    if (name === "NotFoundError" || name === "DevicesNotFoundError") {
      return "カメラが<br>みつからなかったよ";
    }
    return "ページをよみなおして<br>もういちどためしてね";
  }

  function showError(error) {
    stopScanner();
    $("error-message").innerHTML = friendlyError(error);
    errorPanel.classList.remove("hidden");
  }

  function startScanner() {
    startPanel.classList.add("hidden");
    errorPanel.classList.add("hidden");
    resultPanel.classList.add("hidden");
    state.confirmed = false;
    resetHits();

    if (!window.Quagga) {
      showError(new Error("Quagga2 failed to load"));
      return;
    }

    window.Quagga.init({
      inputStream: {
        type: "LiveStream",
        target: $("scanner"),
        constraints: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
          aspectRatio: { ideal: 1.7778 }
        },
        area: { top: "18%", right: "4%", bottom: "18%", left: "4%" }
      },
      locator: { patchSize: "medium", halfSample: true },
      numOfWorkers: Math.min(navigator.hardwareConcurrency || 2, 4),
      frequency: 12,
      decoder: {
        readers: ["ean_reader", "ean_8_reader"],
        multiple: false
      },
      locate: true,
      canvas: { createOverlay: false }
    }, (error) => {
      if (error) {
        showError(error);
        return;
      }
      window.Quagga.start();
      state.running = true;
    });
  }

  window.Quagga?.onDetected(onDetected);
  $("start-button").addEventListener("click", startScanner);
  $("retry-button").addEventListener("click", startScanner);
  $("restart-button").addEventListener("click", startScanner);
  window.addEventListener("pagehide", stopScanner);

  window.BarcodeScannerTest = { hasValidEanCheckDigit, registerDetection, resetHits, state };
})();
