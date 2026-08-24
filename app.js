(() => {
  "use strict";

  const REQUIRED_HITS = 3;
  const HIT_WINDOW_MS = 1600;
  const REQUEST_TIMEOUT_MS = 20000;
  const POKEAPI_URL = "https://pokeapi.co/api/v2";
  const STORAGE_KEY = "pokemon-barcode-caught-v1";
  const TYPE_NAMES_JA = {
    normal: "ノーマル", fire: "ほのお", water: "みず", electric: "でんき",
    grass: "くさ", ice: "こおり", fighting: "かくとう", poison: "どく",
    ground: "じめん", flying: "ひこう", psychic: "エスパー", bug: "むし",
    rock: "いわ", ghost: "ゴースト", dragon: "ドラゴン", dark: "あく",
    steel: "はがね", fairy: "フェアリー"
  };
  const state = {
    code: "", hits: 0, lastSeenAt: 0, running: false, confirmed: false,
    currentPokemon: null, catching: false, dexReturn: "start"
  };

  const $ = (id) => document.getElementById(id);
  const startPanel = $("start-panel");
  const resultPanel = $("result-panel");
  const errorPanel = $("error-panel");
  const resultCode = $("result-code");
  const progress = $("progress");
  const pokemonLoading = $("pokemon-loading");
  const pokemonResult = $("pokemon-result");
  const pokemonError = $("pokemon-error");
  const restartButton = $("restart-button");
  const resultActions = $("result-actions");
  const getButton = $("get-button");
  const dexPanel = $("dex-panel");
  const catchOverlay = $("catch-overlay");

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

  function setPokemonView(view) {
    pokemonLoading.classList.toggle("hidden", view !== "loading");
    pokemonResult.classList.toggle("hidden", view !== "result");
    pokemonError.classList.toggle("hidden", view !== "error");
    resultActions.classList.toggle("hidden", view === "loading");
  }

  function readCaughtPokemon() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch (error) {
      console.warn("Could not read caught Pokemon:", error);
      return {};
    }
  }

  function saveCaughtPokemon(pokemon) {
    const caught = readCaughtPokemon();
    const key = String(pokemon.pokemonId);
    const previous = caught[key];
    caught[key] = {
      pokemonId: pokemon.pokemonId,
      nameJa: pokemon.nameJa,
      imageUrl: pokemon.imageUrl || "",
      typesJa: pokemon.typesJa,
      firstCaughtAt: previous?.firstCaughtAt || new Date().toISOString(),
      count: (Number(previous?.count) || 0) + 1
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(caught));
      console.log("Pokemon caught:", caught[key]);
      return { saved: true, record: caught[key] };
    } catch (error) {
      console.warn("Could not save caught Pokemon:", error);
      return { saved: false, record: caught[key] };
    }
  }

  function updateEncounterMessage(pokemonId) {
    const previous = readCaughtPokemon()[String(pokemonId)];
    $("encounter-message").textContent = previous
      ? `また会えた！ GET ${previous.count}かい`
      : "はじめまして！";
  }

  function renderPokemon(pokemon) {
    if (!pokemon || pokemon.pokemonId == null || !pokemon.nameJa) {
      throw new Error("ポケモンのデータが足りません。");
    }

    const image = $("pokemon-image");
    if (pokemon.imageUrl) image.src = pokemon.imageUrl;
    else image.removeAttribute("src");
    image.alt = `${pokemon.nameJa}の画像`;
    image.classList.toggle("hidden", !pokemon.imageUrl);
    $("pokemon-name").textContent = pokemon.nameJa;
    $("pokemon-number").textContent = `No.${pokemon.pokemonId}`;

    const types = Array.isArray(pokemon.typesJa)
      ? pokemon.typesJa
      : String(pokemon.typesJa || "").split(/[,、/\s]+/).filter(Boolean);
    const typeList = $("pokemon-types");
    typeList.replaceChildren(...types.map((type) => {
      const badge = document.createElement("span");
      badge.textContent = type;
      return badge;
    }));
    state.currentPokemon = { ...pokemon, typesJa: types };
    state.catching = false;
    getButton.disabled = false;
    getButton.textContent = "GET！";
    $("save-message").textContent = "";
    updateEncounterMessage(pokemon.pokemonId);
  }

  async function barcodeToPokemonId(code) {
    const bytes = new TextEncoder().encode(code);
    const hash = await crypto.subtle.digest("SHA-256", bytes);
    const number = new DataView(hash).getUint32(0, false);
    return (number % 151) + 1;
  }

  async function fetchJson(url, signal) {
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`通信エラー (${response.status})`);
    return response.json();
  }

  async function findPokemon(code) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const pokemonId = await barcodeToPokemonId(code);
      const [pokemon, species] = await Promise.all([
        fetchJson(`${POKEAPI_URL}/pokemon/${pokemonId}`, controller.signal),
        fetchJson(`${POKEAPI_URL}/pokemon-species/${pokemonId}`, controller.signal)
      ]);
      const name = species.names?.find(({ language }) => language.name === "ja-Hrkt")
        || species.names?.find(({ language }) => language.name === "ja");

      const pokemonData = {
        pokemonId,
        nameJa: name?.name,
        imageUrl: pokemon.sprites?.other?.["official-artwork"]?.front_default
          || pokemon.sprites?.front_default,
        typesJa: pokemon.types
          ?.sort((a, b) => a.slot - b.slot)
          .map(({ type }) => TYPE_NAMES_JA[type.name] || type.name)
      };
      renderPokemon(pokemonData);
      console.log("Pokemon appeared:", pokemonData);
      setPokemonView("result");
    } catch (error) {
      console.error("Failed to find Pokemon:", error);
      $("pokemon-error-message").textContent = error?.name === "AbortError"
        ? "つうしんに じかんが かかってるみたい"
        : "つうしんを かくにんしてね";
      setPokemonView("error");
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  function confirmCode(code) {
    state.confirmed = true;
    stopScanner();
    resultCode.textContent = code;
    setPokemonView("loading");
    resultPanel.classList.remove("hidden");
    if (navigator.vibrate) navigator.vibrate([80, 40, 120]);
    console.log("Barcode confirmed:", code);
    findPokemon(code);
  }

  const wait = (milliseconds) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

  async function catchPokemon() {
    if (!state.currentPokemon || state.catching) return;
    state.catching = true;
    getButton.disabled = true;
    catchOverlay.classList.remove("hidden");
    $("catch-count").textContent = "";
    $("caught-message").textContent = "";
    $("catch-ball").className = "catch-ball catch-throw";
    console.log("Catch animation started:", state.currentPokemon.pokemonId);

    await wait(600);
    $("catch-ball").className = "catch-ball catch-shake";
    for (const count of ["1", "2", "3"]) {
      $("catch-count").textContent = count;
      if (navigator.vibrate) navigator.vibrate(45);
      await wait(430);
    }

    $("catch-count").textContent = "";
    $("caught-message").textContent = "つかまえた！";
    if (navigator.vibrate) navigator.vibrate([70, 40, 70, 40, 140]);
    const outcome = saveCaughtPokemon(state.currentPokemon);
    getButton.textContent = "GETした！";
    $("encounter-message").textContent = outcome.record.count > 1
      ? `${outcome.record.count}かいめの GET！`
      : "はじめて GET！";
    if (!outcome.saved) {
      $("save-message").textContent = "きろくは できなかったけど、あそべるよ";
    }
    await wait(900);
    catchOverlay.classList.add("hidden");
    state.catching = false;
  }

  function renderDex() {
    const caught = readCaughtPokemon();
    const caughtCount = Object.keys(caught).filter((id) => Number(id) >= 1 && Number(id) <= 151).length;
    $("dex-progress").textContent = `GET ${caughtCount} / 151`;
    const cards = [];
    for (let pokemonId = 1; pokemonId <= 151; pokemonId += 1) {
      const pokemon = caught[String(pokemonId)];
      const card = document.createElement("article");
      card.className = `dex-card${pokemon ? " is-caught" : ""}`;
      const visual = document.createElement(pokemon?.imageUrl ? "img" : "div");
      visual.className = "dex-image";
      if (pokemon?.imageUrl) {
        visual.src = pokemon.imageUrl;
        visual.alt = `${pokemon.nameJa}の画像`;
      } else {
        visual.textContent = "?";
        visual.setAttribute("aria-hidden", "true");
      }
      const number = document.createElement("p");
      number.className = "dex-number";
      number.textContent = `No.${pokemonId}`;
      const name = document.createElement("p");
      name.className = "dex-name";
      name.textContent = pokemon?.nameJa || "???";
      card.append(visual, number, name);
      if (pokemon) {
        const count = document.createElement("p");
        count.className = "dex-count";
        count.textContent = `GET ${pokemon.count}かい`;
        card.append(count);
      }
      cards.push(card);
    }
    $("dex-grid").replaceChildren(...cards);
    console.log("Pokedex opened:", { caught: caughtCount, total: 151 });
  }

  function openDex() {
    state.dexReturn = startPanel.classList.contains("hidden") ? "scan" : "start";
    stopScanner();
    startPanel.classList.add("hidden");
    resultPanel.classList.add("hidden");
    errorPanel.classList.add("hidden");
    $("scan-dex-button").classList.add("hidden");
    renderDex();
    dexPanel.classList.remove("hidden");
    dexPanel.scrollTop = 0;
  }

  function closeDex() {
    dexPanel.classList.add("hidden");
    if (state.dexReturn === "start") {
      startPanel.classList.remove("hidden");
      $("scan-dex-button").classList.remove("hidden");
    } else {
      startScanner();
    }
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
    dexPanel.classList.add("hidden");
    $("scan-dex-button").classList.remove("hidden");
    state.confirmed = false;
    state.currentPokemon = null;
    state.catching = false;
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
      console.log("Scanner started");
    });
  }

  window.Quagga?.onDetected(onDetected);
  $("start-button").addEventListener("click", startScanner);
  $("retry-button").addEventListener("click", startScanner);
  restartButton.addEventListener("click", startScanner);
  getButton.addEventListener("click", catchPokemon);
  document.querySelectorAll(".dex-button").forEach((button) => button.addEventListener("click", openDex));
  $("scan-dex-button").addEventListener("click", openDex);
  $("dex-back-button").addEventListener("click", closeDex);
  window.addEventListener("pagehide", stopScanner);

  window.BarcodeScannerTest = {
    hasValidEanCheckDigit,
    registerDetection,
    resetHits,
    barcodeToPokemonId,
    readCaughtPokemon,
    saveCaughtPokemon,
    renderDex,
    renderPokemon,
    state
  };
})();
