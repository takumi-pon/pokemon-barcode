(() => {
  'use strict';

  const STORAGE_KEY = 'financialEscapeStage01';
  const LIMIT_MS = 24 * 60 * 60 * 1000;

  const puzzles = [
    {
      id: 1,
      title: '利益の赤信号',
      subtitle: 'P/L ROOM',
      memo: '「売上は約2兆円ある。規模が大きい会社は簡単には危なくならない。」',
      headers: ['項目', '前期', '当期'],
      rows: [
        ['営業収益', '2,230,416', '1,951,158'],
        ['営業費用', '2,140,403', '2,002,043'],
        ['営業利益', '90,013', '▲50,884'],
        ['当期純利益', '16,921', '▲63,194']
      ],
      question: 'Kの説明を数字で検証せよ。当期の「営業損失率」を営業収益に対する絶対値で小数1位まで求め、小数点を除いた2桁を入力せよ。例：3.4% → 34。',
      hint: '営業損失率 = |営業利益| ÷ 営業収益 × 100。売上規模ではなく、売上からどれだけ損失が出ているかを見る。',
      answer: 26,
      fragment: '26',
      success: '営業利益率は約▲2.6%。前年の黒字から赤字へ反転している。'
    },
    {
      id: 2,
      title: '流動性の扉',
      subtitle: 'B/S ROOM',
      memo: '「総資産は1.7兆円もある。短期の支払いなんて問題ない。」',
      headers: ['項目', '前期', '当期'],
      rows: [
        ['流動資産', '810,315', '487,029'],
        ['固定資産', '1,310,534', '1,262,580'],
        ['流動負債', '661,229', '649,897'],
        ['負債合計', '1,651,713', '1,553,907']
      ],
      question: '総資産ではなく短期支払能力を確認する。当期の流動比率を計算し、四捨五入した整数を入力せよ。',
      hint: '流動比率 = 流動資産 ÷ 流動負債 × 100。100%を下回ると、少なくとも単純比較では流動負債が流動資産を上回る。',
      answer: 75,
      fragment: '75',
      success: '流動比率は約74.9%、四捨五入で75%。「総資産が大きい」は短期流動性の答えではない。'
    },
    {
      id: 3,
      title: '消えた現金',
      subtitle: 'CASH ROOM',
      memo: '「現金は減ったが、せいぜい3割程度だ。投資をしている証拠でもある。」',
      headers: ['項目', '前期', '当期'],
      rows: [
        ['現金及び定期預金', '354,977', '163,696'],
        ['売上債権', '241,349', '170,912'],
        ['流動資産合計', '810,315', '487,029']
      ],
      question: '現金及び定期預金は前期末から何%減少したか。減少率を四捨五入した整数で入力せよ。',
      hint: '減少率 = (前期 − 当期) ÷ 前期 × 100。「何円減ったか」ではなく「元の残高の何割が消えたか」。',
      answer: 54,
      fragment: '54',
      success: '約53.9%減、四捨五入で54%。1年で現金・定期預金がほぼ半減している。'
    },
    {
      id: 4,
      title: '一年以内の請求書',
      subtitle: 'DEBT ROOM',
      memo: '「負債は前年より減っている。むしろ財務は改善している。」',
      headers: ['流動負債の内訳', '当期'],
      rows: [
        ['買掛金', '190,045'],
        ['短期借入金', '2,911'],
        ['1年以内償還予定の社債', '52,000'],
        ['1年以内返済予定の長期借入金', '128,426'],
        ['デリバティブ負債', '126,259'],
        ['その他', '146,734'],
        ['現金及び定期預金', '163,696']
      ],
      question: 'まず「1年以内に返済・償還が来る有利子負債」を抽出して合計せよ。次に、現金及び定期預金がその合計の何%をカバーするか計算し、四捨五入した整数を入力せよ。',
      hint: 'ここでは短期借入金 + 1年以内償還予定社債 + 1年以内返済予定長期借入金を対象にする。買掛金やデリバティブ負債はこの設問の「有利子負債」から除外。',
      answer: 89,
      fragment: '89',
      success: '対象債務は183,337百万円。現金・定期預金163,696百万円 ÷ 183,337百万円 ≒ 89.3%。'
    },
    {
      id: 5,
      title: '黒字キャッシュの罠',
      subtitle: 'C/F ROOM',
      memo: '「営業CFはプラス31,755。営業で現金を稼げているのだから問題ない。」',
      headers: ['キャッシュフロー', '前期', '当期'],
      rows: [
        ['営業活動CF', '157,331', '31,755'],
        ['投資活動CF', '▲26,229', '▲105,653'],
        ['財務活動CF', '36,896', '▲116,767'],
        ['期末現金同等物', '354,037', '161,751']
      ],
      question: '「プラスかマイナスか」だけで判断するな。営業活動CFは前期から何%減少したか。四捨五入した整数を入力せよ。',
      hint: '営業CF減少率 = (前期営業CF − 当期営業CF) ÷ 前期営業CF × 100。プラスでも急減していれば情報量は大きい。',
      answer: 80,
      fragment: '80',
      success: '営業CFは約79.8%減、四捨五入で80%。プラスという符号だけを見ると変化量を見落とす。'
    },
    {
      id: 6,
      title: '最後のクッション',
      subtitle: 'SOLVENCY ROOM',
      memo: '「負債が97,806減っている。これだけ負債を減らせたなら、財務体質は改善だ。」',
      headers: ['項目', '前期', '当期'],
      rows: [
        ['総資産', '2,122,784', '1,750,679'],
        ['負債合計', '1,651,713', '1,553,907'],
        ['純資産', '471,070', '196,771'],
        ['自己資本比率', '21.4%', '10.0%'],
        ['D/Eレシオ', '2.0倍', '4.6倍']
      ],
      question: '負債だけでなく、損失を吸収するクッションを見る。純資産は前期から何%減少したか。四捨五入した整数を入力せよ。',
      hint: '純資産減少率 = (前期純資産 − 当期純資産) ÷ 前期純資産 × 100。負債が減っても、それ以上に純資産が毀損すれば安全性は改善とは限らない。',
      answer: 58,
      fragment: '58',
      success: '純資産は約58.2%減。自己資本比率も21.4%から10.0%へ低下し、D/Eレシオは悪化している。'
    }
  ];

  const $ = (selector) => document.querySelector(selector);
  const state = loadState();
  let timerId = null;
  let currentPuzzle = state.currentPuzzle || 1;

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { startedAt: null, solved: {}, currentPuzzle: 1, escaped: false };
      const parsed = JSON.parse(raw);
      return {
        startedAt: parsed.startedAt || null,
        solved: parsed.solved || {},
        currentPuzzle: parsed.currentPuzzle || 1,
        escaped: Boolean(parsed.escaped)
      };
    } catch (error) {
      console.debug('[FinancialEscape] state load failed', error);
      return { startedAt: null, solved: {}, currentPuzzle: 1, escaped: false };
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      console.debug('[FinancialEscape] progress saved', state);
    } catch (error) {
      console.debug('[FinancialEscape] state save failed', error);
    }
  }

  function setScreen(id) {
    document.querySelectorAll('.screen').forEach((screen) => screen.classList.remove('active'));
    $(id).classList.add('active');
  }

  function startGame() {
    if (!state.startedAt || Date.now() - state.startedAt >= LIMIT_MS) {
      state.startedAt = Date.now();
      state.solved = {};
      state.escaped = false;
      currentPuzzle = 1;
      state.currentPuzzle = 1;
    }
    saveState();
    setScreen('#game');
    renderAll();
    startTimer();
    console.log('[FinancialEscape] Stage 01 started');
  }

  function startTimer() {
    clearInterval(timerId);
    updateTimer();
    timerId = setInterval(updateTimer, 1000);
  }

  function updateTimer() {
    if (!state.startedAt || state.escaped) return;
    const left = Math.max(0, LIMIT_MS - (Date.now() - state.startedAt));
    const hours = Math.floor(left / 3600000);
    const minutes = Math.floor((left % 3600000) / 60000);
    const seconds = Math.floor((left % 60000) / 1000);
    $('#timer').textContent = [hours, minutes, seconds].map((n) => String(n).padStart(2, '0')).join(':');
    if (left === 0) {
      clearInterval(timerId);
      $('#timer').textContent = '00:00:00';
      alert('TIME OVER\n資金は尽きた。STAGE 01をリセットして再挑戦してください。');
    }
  }

  function renderAll() {
    renderFragments();
    renderNav();
    renderPuzzle(currentPuzzle);
    renderVault();
  }

  function renderFragments() {
    $('#fragments').innerHTML = puzzles.map((p) => {
      const solved = state.solved[p.id];
      return `<span class="fragment ${solved ? 'solved' : ''}">${solved ? p.fragment : '??'}</span>`;
    }).join('');
    $('#solvedCount').textContent = Object.keys(state.solved).length;
  }

  function renderNav() {
    $('#roomNav').innerHTML = puzzles.map((p) => {
      const classes = ['room-button'];
      if (p.id === currentPuzzle) classes.push('active');
      if (state.solved[p.id]) classes.push('done');
      return `<button type="button" class="${classes.join(' ')}" data-room="${p.id}">${state.solved[p.id] ? '✓ ' : ''}${String(p.id).padStart(2, '0')}</button>`;
    }).join('');

    $('#roomNav').querySelectorAll('[data-room]').forEach((button) => {
      button.addEventListener('click', () => {
        currentPuzzle = Number(button.dataset.room);
        state.currentPuzzle = currentPuzzle;
        saveState();
        renderAll();
      });
    });
  }

  function renderPuzzle(id) {
    const p = puzzles.find((item) => item.id === id);
    const solved = Boolean(state.solved[id]);
    const rows = p.rows.map((row) => `<tr>${row.map((cell, index) => `<td class="${String(cell).includes('▲') ? 'negative' : ''}">${cell}</td>`).join('')}</tr>`).join('');
    const headers = `<tr>${p.headers.map((h) => `<th>${h}</th>`).join('')}</tr>`;

    $('#puzzleHost').innerHTML = `
      <article class="puzzle-card">
        <p class="puzzle-kicker">ROOM ${String(p.id).padStart(2, '0')} / ${p.subtitle}</p>
        <h2>${p.title}</h2>
        <div class="memo"><strong>K'S MEMO</strong><br>${p.memo}</div>
        <div class="data-table-wrap"><table><thead>${headers}</thead><tbody>${rows}</tbody></table></div>
        <div class="question"><p>${p.question}</p></div>
        <form id="answerForm">
          <div class="answer-row">
            <input id="answerInput" inputmode="decimal" autocomplete="off" aria-label="回答" placeholder="数字を入力" ${solved ? 'disabled' : ''}>
            <button class="primary" type="submit" ${solved ? 'disabled' : ''}>解析する</button>
          </div>
          <p id="feedback" class="feedback ${solved ? 'ok' : ''}" aria-live="polite">${solved ? `解除済み。暗証片［${p.fragment}］ ${p.success}` : ''}</p>
        </form>
        <button id="hintButton" class="hint-button" type="button">ヒントを見る</button>
        <p id="hint" class="hint">${p.hint}</p>
      </article>`;

    $('#hintButton').addEventListener('click', () => {
      $('#hint').classList.toggle('show');
    });

    $('#answerForm').addEventListener('submit', (event) => {
      event.preventDefault();
      if (solved) return;
      const input = $('#answerInput').value.trim().replace(/[%％,，\s]/g, '');
      const value = Number(input);
      const feedback = $('#feedback');
      if (!Number.isFinite(value)) {
        feedback.textContent = '数字として読めない。資料を見直せ。';
        feedback.className = 'feedback error';
        return;
      }
      if (value === p.answer) {
        state.solved[p.id] = true;
        saveState();
        console.log(`[FinancialEscape] Room ${p.id} solved -> ${p.fragment}`);
        renderAll();
      } else {
        feedback.textContent = 'LOCKED。Kの説明に引っ張られていないか。計算と分母を確認せよ。';
        feedback.className = 'feedback error';
      }
    });
  }

  function renderVault() {
    const solved = Object.keys(state.solved).length;
    const open = solved === puzzles.length;
    $('#vault').classList.toggle('locked', !open);
    $('#vault').classList.toggle('open', open);
    $('#escapeButton').disabled = !open;
    $('#vaultMessage').textContent = open
      ? `暗証片 ${puzzles.map((p) => p.fragment).join(' - ')} が揃った。扉のロックが解除できる。`
      : `あと ${puzzles.length - solved} 個の暗証片が必要。`;
  }

  function escape() {
    if (Object.keys(state.solved).length !== puzzles.length) return;
    state.escaped = true;
    saveState();
    clearInterval(timerId);
    setScreen('#ending');
    console.log('[FinancialEscape] Stage 01 escaped');
  }

  function resetGame() {
    localStorage.removeItem(STORAGE_KEY);
    state.startedAt = null;
    state.solved = {};
    state.currentPuzzle = 1;
    state.escaped = false;
    currentPuzzle = 1;
    $('#timer').textContent = '24:00:00';
    setScreen('#intro');
    console.log('[FinancialEscape] Stage 01 reset');
  }

  $('#startButton').addEventListener('click', startGame);
  $('#escapeButton').addEventListener('click', escape);
  $('#resetButton').addEventListener('click', resetGame);

  if (state.escaped) {
    setScreen('#ending');
  } else if (state.startedAt && Date.now() - state.startedAt < LIMIT_MS) {
    setScreen('#game');
    renderAll();
    startTimer();
  } else {
    setScreen('#intro');
  }
})();
