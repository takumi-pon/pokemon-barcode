(() => {
  "use strict";

  const REQUIRED_HITS = 3;
  const HIT_WINDOW_MS = 1600;
  const REQUEST_TIMEOUT_MS = 20000;
  const POKEAPI_URL = "https://pokeapi.co/api/v2";
  const STORAGE_KEY = "pokemon-barcode-caught-v1";
  const MAX_POKEMON_ID = 1025;
  const SHINY_RATE_PERCENT = 2;

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
    const isShiny = Boolean(pokemon.isShiny);

    const previousCount = Number(previous?.count) || 0;
    const previousShinyCount = Number(previous?.shinyCount) || 0;
    const previousNormalCount = previous?.normalCount == null
      ? Math.max(previousCount - previousShinyCount, 0)
      : Number(previous.normalCount) || 0;

    const normalCount = previousNormalCount + (isShiny ? 0 : 1);
    const shinyCount = previousShinyCount + (isShiny ? 1 : 0);
    const normalImageUrl = previous?.normalImageUrl
      || (!isShiny ? (pokemon.normalImageUrl || pokemon.imageUrl || "") : "")
      || (!previous?.shinyCount ? previous?.imageUrl || "" : "");
    const shinyImageUrl = previous?.shinyImageUrl
      || (isShiny ? (pokemon.shinyImageUrl || pokemon.imageUrl || "") : "");

    caught[key] = {
      pokemonId: pokemon.pokemonId,
      nameJa: pokemon.nameJa,
      imageUrl: normalImageUrl || previous?.imageUrl || shinyImageUrl || "",
      normalImageUrl,
      shinyImageUrl,
      typesJa: pokemon.typesJa,
      firstCaughtAt: previous?.firstCaughtAt || new Date().toISOString(),
      firstShinyCaughtAt: previous?.firstShinyCaughtAt || (isShiny ? new Date().toISOString() : ""),
      lastCaughtAt: new Date().toISOString(),
      count: previousCount + 1,
      normalCount,
      shinyCount,
      hasShiny: shinyCount > 0,
      lastCaughtWasShiny: isShiny
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

  function updateEncounterMessage(pokemon) {
    const previous = readCaughtPokemon()[String(pokemon.pokemonId)];

    if (pokemon.isShiny) {
      $("encounter-message").textContent = Number(previous?.shinyCount) > 0
        ? "✨ また色違いに会えた！"
        : "✨✨ 色違いだ！！ ✨✨";
      return;
    }

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
    image.alt = `${pokemon.isShiny ? "色違いの" : ""}${pokemon.nameJa}の画像`;
    image.classList.toggle("hidden", !pokemon.imageUrl);

    $("pokemon-name").textContent = pokemon.nameJa;
    $("pokemon-number").textContent = `No.${pokemon.pokemonId}`;

    const types = Array.isArray(pokemon.typesJa)
      ? pokemon.typesJa
      : String(pokemon.typesJa || "").split(/[,、/\s]+/).filter(Boolean);
    const typeList = $("pokemon-types");
    const badges = types.map((type) => {
      const badge = document.createElement("span");
      badge.textContent = type;
      return badge;
    });

    if (pokemon.isShiny) {
      const shinyBadge = document.createElement("span");
      shinyBadge.className = "shiny-badge";
      shinyBadge.textContent = "✨ 色違い";
      badges.push(shinyBadge);
    }

    typeList.replaceChildren(...badges);
    pokemonResult.classList.toggle("is-shiny", Boolean(pokemon.isShiny));
    resultPanel.classList.toggle("shiny-encounter", Boolean(pokemon.isShiny));

    state.currentPokemon = { ...pokemon, typesJa: types };
    state.catching = false;
    getButton.disabled = false;
    getButton.textContent = "GET！";
    $("save-message").textContent = "";
    updateEncounterMessage(state.currentPokemon);
  }

  async function barcodeToEncounter(code) {
    const bytes = new TextEncoder().encode(code);
    const hash = await crypto.subtle.digest("SHA-256", bytes);
    const view = new DataView(hash);
    const number = view.getUint32(0, false);
    const shinyRoll = view.getUint16(4, false) % 100;

    return {
      pokemonId: (number % MAX_POKEMON_ID) + 1,
      isShiny: shinyRoll < SHINY_RATE_PERCENT,
      shinyRoll
    };
  }

  async function barcodeToPokemonId(code) {
    return (await barcodeToEncounter(code)).pokemonId;
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
      const encounter = await barcodeToEncounter(code);
      const [pokemon, species] = await Promise.all([
        fetchJson(`${POKEAPI_URL}/pokemon/${encounter.pokemonId}`, controller.signal),
        fetchJson(`${POKEAPI_URL}/pokemon-species/${encounter.pokemonId}`, controller.signal)
      ]);
      const name = species.names?.find(({ language }) => language.name === "ja-Hrkt")
        || species.names?.find(({ language }) => language.name === "ja");

      const normalImageUrl = pokemon.sprites?.other?.["official-artwork"]?.front_default
        || pokemon.sprites?.front_default
        || "";
      const shinyImageUrl = pokemon.sprites?.other?.["official-artwork"]?.front_shiny
        || pokemon.sprites?.front_shiny
        || normalImageUrl;

      const pokemonData = {
        pokemonId: encounter.pokemonId,
        nameJa: name?.name || pokemon.name,
        imageUrl: encounter.isShiny ? shinyImageUrl : normalImageUrl,
        normalImageUrl,
        shinyImageUrl,
        isShiny: encounter.isShiny,
        typesJa: pokemon.types
          ?.sort((a, b) => a.slot - b.slot)
          .map(({ type }) => TYPE_NAMES_JA[type.name] || type.name)
      };

      renderPokemon(pokemonData);
      console.log("Pokemon appeared:", {
        ...pokemonData,
        shinyRoll: encounter.shinyRoll,
        shinyRatePercent: SHINY_RATE_PERCENT
      });
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
    catchOverlay.classList.toggle("is-shiny", Boolean(state.currentPokemon.isShiny));
    catchOverlay.classList.remove("hidden");
    $("catch-count").textContent = "";
    $("caught-message").textContent = "";
    $("catch-ball").className = "catch-ball catch-throw";
    console.log("Catch animation started:", {
      pokemonId: state.currentPokemon.pokemonId,
      isShiny: state.currentPokemon.isShiny
    });

    await wait(600);
    $("catch-ball").className = "catch-ball catch-shake";
    for (const count of ["1", "2", "3"]) {
      $("catch-count").textContent = count;
      if (navigator.vibrate) navigator.vibrate(45);
      await wait(430);
    }

    $("catch-count").textContent = "";
    $("caught-message").textContent = state.currentPokemon.isShiny
      ? "✨ 色違いをつかまえた！"
      : "つかまえた！";
    if (navigator.vibrate) navigator.vibrate([70, 40, 70, 40, 140]);

    const outcome = saveCaughtPokemon(state.currentPokemon);
    getButton.textContent = "GETした！";

    if (state.currentPokemon.isShiny) {
      $("encounter-message").textContent = outcome.record.shinyCount > 1
        ? `✨ 色違い ${outcome.record.shinyCount}かいめの GET！`
        : "✨ はじめての色違い GET！";
    } else {
      $("encounter-message").textContent = outcome.record.count > 1
        ? `${outcome.record.count}かいめの GET！`
        : "はじめて GET！";
    }

    if (!outcome.saved) {
      $("save-message").textContent = "きろくは できなかったけど、あそべるよ";
    }

    await wait(900);
    catchOverlay.classList.add("hidden");
    catchOverlay.classList.remove("is-shiny");
    state.catching = false;
  }

  function renderDex() {
    const caught = readCaughtPokemon();
    const caughtIds = Object.keys(caught).filter((id) => Number(id) >= 1 && Number(id) <= MAX_POKEMON_ID);
    const caughtCount = caughtIds.length;
    const shinySpeciesCount = caughtIds.filter((id) => Number(caught[id]?.shinyCount) > 0).length;

    $("dex-progress").textContent = `GET ${caughtCount} / ${MAX_POKEMON_ID} ・ ✨ ${shinySpeciesCount}`;
    const cards = [];

    for (let pokemonId = 1; pokemonId <= MAX_POKEMON_ID; pokemonId += 1) {
      const pokemon = caught[String(pokemonId)];
      const shinyCount = Number(pokemon?.shinyCount) || 0;
      const card = document.createElement("article");
      card.className = `dex-card${pokemon ? " is-caught" : ""}${shinyCount > 0 ? " has-shiny" : ""}`;

      const displayImageUrl = shinyCount > 0
        ? (pokemon?.shinyImageUrl || pokemon?.imageUrl || pokemon?.normalImageUrl)
        : (pokemon?.normalImageUrl || pokemon?.imageUrl);
      const visual = document.createElement(displayImageUrl ? "img" : "div");
      visual.className = "dex-image";

      if (displayImageUrl) {
        visual.src = displayImageUrl;
        visual.alt = `${shinyCount > 0 ? "色違いの" : ""}${pokemon.nameJa}の画像`;
        visual.loading = "lazy";
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

        if (shinyCount > 0) {
          const shiny = document.createElement("p");
          shiny.className = "dex-shiny-count";
          shiny.textContent = `✨ 色違い ${shinyCount}かい`;
          card.append(shiny);
        }
      }

      cards.push(card);
    }

    $("dex-grid").replaceChildren(...cards);
    console.log("Pokedex opened:", {
      caught: caughtCount,
      total: MAX_POKEMON_ID,
      shinySpecies: shinySpeciesCount
    });
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
    resultPanel.classList.remove("shiny-encounter");
    pokemonResult.classList.remove("is-shiny");
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
    barcodeToEncounter,
    readCaughtPokemon,
    saveCaughtPokemon,
    renderDex,
    renderPokemon,
    constants: { MAX_POKEMON_ID, SHINY_RATE_PERCENT },
    state
  };
})();
