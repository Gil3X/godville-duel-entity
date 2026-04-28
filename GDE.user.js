// ==UserScript==
// @name         Godville Duel Entity
// @version      1.139
// @namespace    Godville Duel Entity
// @description  Tactical radar for Godville Arena
// @description:en  Tactical radar for Godville Arena
// @description:ru  Тактический радар для дуэлей в Godville
// @author       Gilt3x
// @license      GNU General Public License v3.0, Copyright Gilt3x
// @match        *://godville.net/superhero*
// @match        *://godville.net/duels*
// @icon         https://howt0.top/images/PP_boll-opt.svg
// @grant        none
// @updateURL    https://raw.githubusercontent.com/Gil3X/godville-duel-entity/main/GDE.user.js
// @downloadURL  https://raw.githubusercontent.com/Gil3X/godville-duel-entity/main/GDE.user.js
// ==/UserScript==

(function() {
    'use strict';

    // === 1. ЯДРО (ЗАМОРОЖЕНО: НИКОГДА НЕ МЕНЯТЬ) ===
    let maxCycle = 6, mySeq = "", opSeq = "", myHistory = [], opHistory = [], myV = 0, myE = 0, opV = 0, opE = 0;
    let processedNodes = new WeakSet();

    const BACKFIRE_WORDS = [
        "рикошетом", "обоих соперников", "ударило обоих", "в другую сторону", "ударило по обоим",
        "искать огнетушитель", "пасущемуся неподалеку", "досталась мирно пасущемуся",
        "предназначавшуюся противнику", "смятую незабудку",
        "заполняться попкорном", "танец с саблями", "апоплексический удар",
        "поток лавы", "заменят рефери", "раскат грома отвлёк",
        "соперники поскальзываются", "неземная благодать", "зрители негодуют",
        "в ту сторону", "вылечил обоих", "разворачивает ход времени",
        "яркая радуга возникла", "проклинает меткого хозяина", "ниспосланное испытание",
        "скрежет зубов"
    ];

    const INFLUENCE_WITH_QUOTES = ["Табло ярко вспыхнуло", "выдало: «", "начертано: «"];
    const SYSTEM_EXCEPTIONS = ["судья не приемлет", "закончить бой ничьей"];

    // === 2. МОДУЛЬ УДАЧИ (ПЕРЕМЕННЫЕ) ===
    let myTotalEff = 0, myValidRounds = 0, opTotalEff = 0, opValidRounds = 0;
    let baselineMyHP = null, baselineOpHP = null;
    let turnCounter = 0;
    let firstTurnDetected = false;
    let duelFullLog = {};
    let myLuckHistory = [], opLuckHistory = [];
    const TREND_WINDOW = 10;

    const debugMode = true;
    const log = (msg) => { if (debugMode) console.log('[GODVILLE LUCK]', msg); };

    const EXPECTED = {
        hit: 9.5,
        voice: 10.0,
        influence: 19.5
    };

    // === 3. ВЫДВИЖНОЙ UI (Hero Wars Style) ===
    const isLogPage = window.location.href.includes('/duels/log');

    // === 1. Создаём ВСЕ элементы ===
    const wrapper = document.createElement('div');
    wrapper.style = "position: fixed; bottom: 20px; left: 0px; z-index: 10000; display: flex; align-items: flex-end; font-family: monospace;";

    const toggleBtn = document.createElement('div');
    toggleBtn.innerHTML = "►";
    toggleBtn.style = "background: linear-gradient(90deg, rgba(0,0,0,0.95) 0%, rgba(68,68,68,0.9) 100%); color: #5af; cursor: pointer; width: 24px; height: 50px; display: flex; align-items: center; justify-content: center; border: 1px solid #555; border-left: none; border-radius: 0 4px 4px 0; font-weight: bold; font-size: 14px; box-shadow: 2px 0 8px rgba(0,0,0,0.6); transition: all 0.2s ease;";
    toggleBtn.onmouseover = () => { toggleBtn.style.background = "linear-gradient(90deg, rgba(0,0,0,0.95) 0%, rgba(85,85,85,0.9) 100%)"; toggleBtn.style.color = "#0f0"; };
    toggleBtn.onmouseout = () => { toggleBtn.style.background = "linear-gradient(90deg, rgba(0,0,0,0.95) 0%, rgba(68,68,68,0.9) 100%)"; toggleBtn.style.color = "#5af"; };

    const gui = document.createElement('div');
    gui.style = "background: rgba(0,0,0,0.95); color: #eee; padding: 10px; border: 1px solid #555; border-left: none; border-radius: 0 6px 6px 0; width: 300px; box-shadow: 3px 0 12px rgba(0,0,0,0.7); display: none;";

    gui.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; padding-bottom:6px; border-bottom:1px solid #333;">
            <div style="font-size:11px; color:#5af; font-weight:bold;">GDE v1.139</div>
            <button id="closeBtn" style="background:#622; color:#fff; cursor:pointer; font-size:12px; padding:2px 6px; border:1px solid #777; border-radius:3px;">✕</button>
        </div>
        <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
            <button id="scanBtn" style="background:#444; color:#fff; cursor:pointer; font-size:9px; padding:4px 8px; border:1px solid #777; border-radius:3px; flex:1; margin-right:4px;">SCAN</button>
            <button id="cycleBtn" style="background:#444; color:#fff; cursor:pointer; font-size:9px; padding:4px 8px; border:1px solid #777; border-radius:3px; flex:1; margin:0 2px;">C:6</button>
            <button id="logBtn" style="background:#448; color:#fff; cursor:pointer; font-size:9px; padding:4px 8px; border:1px solid #777; border-radius:3px; flex:1; margin-left:4px;">LOG</button>
        </div>
        <div style="margin-bottom:10px; padding:6px; background:rgba(68,68,68,0.3); border-radius:4px;">
            <div style="margin-bottom:4px; font-size:10px;"><span style="color:#5af; font-weight:bold;">MY PLAYER&nbsp;&nbsp;Luck <span id="mLuck" style="font-weight:900;">0.00</span></span></div>
            <div style="display:flex; align-items:center; gap:5px;"><span id="mCur" style="font-size:10px;">------</span></div>
            <div style="display:flex; align-items:baseline; gap:6px; margin-top:2px;">
                <span id="mP" style="font-size:18px; font-weight:bold;">0%</span>
                <span style="font-size:12px; color:#aaa;"><span id="mE_val">0</span><span style="font-size:8px; opacity:0.7;">э</span>/<span id="mV_val">0</span><span style="font-size:8px; opacity:0.7;">г</span></span>
            </div>
        </div>
        <div style="margin-bottom:8px; padding:6px; background:rgba(68,68,68,0.3); border-radius:4px;">
            <div style="margin-bottom:4px; font-size:10px;"><span style="color:#f55; font-weight:bold;">OPPONENT&nbsp;&nbsp;Luck <span id="oLuck" style="font-weight:900;">0.00</span></span></div>
            <div style="display:flex; align-items:center; gap:5px;"><span id="oCur" style="font-size:10px;">------</span></div>
            <div style="display:flex; align-items:baseline; gap:6px; margin-top:2px;">
                <span id="oP" style="font-size:18px; font-weight:bold;">0%</span>
                <span style="font-size:12px; color:#aaa;"><span id="oE_val">0</span><span style="font-size:8px; opacity:0.7;">э</span>/<span id="oV_val">0</span><span style="font-size:8px; opacity:0.7;">г</span></span>
            </div>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center; font-size:9px; color:#666; border-top:1px solid #333; padding-top:4px;">
            <span id="gde_mode" style="color:#5af; font-weight:bold;">[?]</span>
            <span style="font-size:8px;">Gilt3x Tactical Radar</span>
        </div>
    `;

    const sideLog = document.createElement('div');
    sideLog.id = "gv_side_log";
    sideLog.style = "position: fixed; bottom: 20px; left: 340px; z-index: 9999; background: rgba(0,0,0,0.95); color: #ccc; padding: 15px; border: 1px solid #555; font-family: monospace; border-radius: 8px; display: none; max-height: 80vh; width: 600px; overflow-x: auto; box-shadow: 5px 5px 15px rgba(0,0,0,0.5);";

    const logControls = document.createElement('div');
    logControls.id = "gv_log_controls";
    logControls.style = "position: absolute; top: 5px; right: 5px; display: flex; gap: 4px; z-index: 10;";
    logControls.innerHTML = `
        <button id="logPosBtn" style="background:#448; color:#fff; cursor:pointer; font-size:10px; padding:2px 5px; border:1px solid #777; border-radius:3px;" title="Переместить вниз-влево">⬇</button>
        <button id="logCloseBtn" style="background:#622; color:#fff; cursor:pointer; font-size:12px; padding:2px 6px; border:1px solid #777; border-radius:3px;" title="Закрыть">✕</button>
    `;
    sideLog.appendChild(logControls);

    const logContent = document.createElement('div');
    logContent.id = "gv_log_content";
    logContent.style = "padding-top: 25px;";
    sideLog.appendChild(logContent);

    // === 2. Добавляем ВСЁ в DOM ===
    wrapper.appendChild(gui);
    wrapper.appendChild(toggleBtn);
    document.body.appendChild(wrapper);
    document.body.appendChild(sideLog);

    // === 3. ТОЛЬКО ТЕПЕРЬ вешаем обработчики ===
    let isOpen = false;
    const toggle = (force) => {
        isOpen = (force !== undefined) ? force : !isOpen;
        gui.style.display = isOpen ? "block" : "none";
        toggleBtn.innerHTML = isOpen ? "◄" : "►";
        toggleBtn.style.width = isOpen ? "20px" : "24px";
    };

    const closeBtn = document.getElementById('closeBtn');
    if (closeBtn) closeBtn.onclick = () => toggle(false);

    toggleBtn.onclick = () => toggle();

    // === LOG кнопки ===
    let logPos = 0;

    const updateLogContent = () => {
        const content = document.getElementById('gv_log_content');
        const turns = Object.keys(duelFullLog).map(Number).sort((a, b) => a - b);

        if (turns.length === 0) {
            content.innerHTML = '<div style="color:#888; padding:20px; text-align:center;">Бой ещё не начался<br>Данные появятся после первых раундов</div>';
        } else {
            let html = '<div style="white-space:nowrap; padding-bottom:10px; overflow-x:auto; max-width:100%;">';
            for (let i = 0; i < turns.length; i += 20) {
                html += '<div style="display:inline-block; width:85px; border-right:1px solid #444; padding-right:2px; margin-right:2px; vertical-align:top;">';
                turns.slice(i, i + 20).forEach(t => {
                    const myData = duelFullLog[t].my || [];
                    const opData = duelFullLog[t].op || [];
                    html += `<div style="white-space:nowrap; margin-bottom:1px; font-size:10px; font-family:monospace;"><span style="color:#777;">${String(t).padStart(3, '0')} - </span><span style="color:#5af">${myData.join('')}</span><span style="color:#444;"> | </span><span style="color:#f55">${opData.join('')}</span></div>`;
                });
                html += '</div>';
            }
            html += '</div>';
            content.innerHTML = `<div style="color:#fff; border-bottom:1px solid #444; margin-bottom:10px; padding-bottom:5px; font-weight:bold;">BATTLE LOG</div>${html}`;
        }
    };

    const logBtn = document.getElementById('logBtn');
    if (logBtn) {
        logBtn.onclick = () => {
            const s = sideLog;
            if (s.style.display === "none" || s.style.display === "") {
                updateLogContent();
                s.style.display = "block";
                logPos = 0;
                const posBtn = document.getElementById('logPosBtn');
                if (posBtn) posBtn.innerText = "⬇";
            } else {
                s.style.display = "none";
            }
        };
    }

    const logCloseBtn = document.getElementById('logCloseBtn');
    if (logCloseBtn) {
        logCloseBtn.onclick = () => { sideLog.style.display = "none"; };
    }

    const logPosBtn = document.getElementById('logPosBtn');
    if (logPosBtn) {
        logPosBtn.onclick = () => {
            const s = sideLog;
            if (logPos === 0) {
                s.style.bottom = "80px";
                s.style.left = "20px";
                s.style.width = "300px";
                logPosBtn.innerText = "➡";
                logPos = 1;
            } else {
                s.style.bottom = "20px";
                s.style.left = "340px";
                s.style.width = "600px";
                logPosBtn.innerText = "⬇";
                logPos = 0;
            }
        };
    }

    // === SCAN кнопка ===
    const scanBtn = document.getElementById('scanBtn');
    if (scanBtn) {
        scanBtn.onclick = () => {
            log('🔄 SCAN: Перечитываю все данные боя...');
            processedNodes = new WeakSet();
            duelFullLog = {};
            process();
            if (sideLog.style.display === "block") {
                setTimeout(updateLogContent, 500);
            }
            log('✅ SCAN: Готово!');
        };
    }

    // === Cycle кнопка ===
    const cycleBtn = document.getElementById('cycleBtn');
    if (cycleBtn) {
        cycleBtn.onclick = () => {
            maxCycle = (maxCycle === 6) ? 4 : 6;
            cycleBtn.innerText = "C:" + maxCycle;
            mySeq = ""; opSeq = "";
            updateUI();
        };
    }

    // === Reset кнопка ===
    const resBtn = document.getElementById('resBtn');
    if (resBtn) {
        resBtn.onclick = () => { location.reload(); };
    }

    if (isLogPage) {
        setTimeout(() => toggle(true), 500);
        setTimeout(() => {
            log('📄 Страница лога — сканирую бой...');
            processedNodes = new WeakSet();
            duelFullLog = {};
            process();
            setTimeout(() => {
                log(`📊 Найдено раундов: ${Object.keys(duelFullLog).length}`);
                log(`📊 myV=${myV}, myE=${myE}, opV=${opV}, opE=${opE}`);
            }, 1000);
        }, 1000);
    }

    const getHP = (side) => {
        const el = document.querySelector(side === 1 ? '#hk_health .l_val' : '#o_hl1 .l_val');
        if (el && el.title) {
            const val = parseFloat(el.title.replace(/[^0-9.]/g, ''));
            return isNaN(val) ? null : val;
        }
        return null;
    };

    const addEvent = (turn, side, symbol) => {
        if (!turn) return;
        if (!duelFullLog[turn]) duelFullLog[turn] = { my: [], op: [] };
        duelFullLog[turn][side === 1 ? "my" : "op"].push(symbol);
    };

    const updateUI = () => {
        const prob = (s) => (s.includes('X') ? 0 : (maxCycle - s.length <= 1 ? 100 : Math.floor(100/(maxCycle - s.length))));
        document.getElementById('mCur').innerText = mySeq.padEnd(maxCycle, '-');
        document.getElementById('mP').innerText = prob(mySeq) + "%";
        document.getElementById('mP').style.color = mySeq.includes('X') ? "#0f0" : (prob(mySeq) >= 100 ? "#f00" : "#fff");
        document.getElementById('mE_val').innerText = myE;
        document.getElementById('mV_val').innerText = myV;
        document.getElementById('oCur').innerText = opSeq.padEnd(maxCycle, '-');
        document.getElementById('oP').innerText = prob(opSeq) + "%";
        document.getElementById('oP').style.color = opSeq.includes('X') ? "#0f0" : (prob(opSeq) >= 100 ? "#f00" : "#fff");
        document.getElementById('oE_val').innerText = opE;
        document.getElementById('oV_val').innerText = opV;

        const myTrend = myLuckHistory.length > 0 ? (myLuckHistory.reduce((a, b) => a + b, 0) / myLuckHistory.length) : 0;
        const opTrend = opLuckHistory.length > 0 ? (opLuckHistory.reduce((a, b) => a + b, 0) / opLuckHistory.length) : 0;
        const myAvg = myValidRounds > 0 ? (myTotalEff / myValidRounds) : 0;
        const opAvg = opValidRounds > 0 ? (opTotalEff / opValidRounds) : 0;

        const mE = document.getElementById('mLuck'), oE = document.getElementById('oLuck');
        if (mE && oE) {
            mE.innerText = `${myTrend.toFixed(2)} (${myAvg.toFixed(2)})`;
            oE.innerText = `${opTrend.toFixed(2)} (${opAvg.toFixed(2)})`;

            if (myTrend > opTrend && Math.abs(myTrend - opTrend) > 0.5) {
                mE.style.color = "#00ff00"; oE.style.color = "#ff0000";
            } else if (opTrend > myTrend && Math.abs(opTrend - myTrend) > 0.5) {
                oE.style.color = "#00ff00"; mE.style.color = "#ff0000";
            } else {
                mE.style.color = "#ffff00"; oE.style.color = "#ffff00";
            }
        }
    };

    const process = () => {
        // === 1. ЯДРО ===

    // === 0. MODE DETECTION (Move this to the top!) ===
    const isLogPage = window.location.href.includes('/duels/log');
    const isTraining = window.location.href.includes('/superhero');
    const roundSelector = isTraining ? '.line' : '.new_line';
        document.querySelectorAll('.m_infl, .infl, .opp_infl, .le_my, .le_opp').forEach(el => {
            if (processedNodes.has(el)) return;
            const text = el.innerText;
            const isMy = el.classList.contains('m_infl') || el.classList.contains('infl') || el.classList.contains('le_my');
            const isForced = INFLUENCE_WITH_QUOTES.some(iq => text.includes(iq));
            const parent = el.closest('.new_line') || el.closest('.line');
            const t = parent ? parent.getAttribute('data-t') : null;

            if (text.includes('➥')) {
                isMy ? myE++ : opE++;
                addEvent(t, isMy?1:0, "э");
            }
            else if (text.includes('«') && !isForced) {
                isMy ? myV++ : opV++;
                addEvent(t, isMy?1:0, "г");
            }
            else {
                const sym = BACKFIRE_WORDS.some(w => text.toLowerCase().includes(w.toLowerCase())) ? "X" : "0";
                if (isMy) { if (mySeq.length >= maxCycle) { myHistory.push(mySeq); mySeq = ""; } mySeq += sym; }
                else { if (opSeq.length >= maxCycle) { opHistory.push(opSeq); opSeq = ""; } opSeq += sym; }
                addEvent(t, isMy?1:0, sym);
            }
            processedNodes.add(el);
        });

        // === 2. ОППОНЕНТ (ЯДРО) ===
        document.querySelectorAll('.new_line').forEach(round => {
            if (processedNodes.has(round)) return;
            const t = round.getAttribute('data-t');
            const opDMsgs = Array.from(round.querySelectorAll('.d_msg')).filter(n => !n.classList.contains('m_infl') && !n.querySelector('.d_turn') && !processedNodes.has(n));
            const cleanOpNodes = [];
            opDMsgs.forEach(node => {
                if (processedNodes.has(node)) return;
                const text = node.innerText, isF = INFLUENCE_WITH_QUOTES.some(iq => text.includes(iq));
                if (text.includes('➥')) { opE++; addEvent(t, 0, "э"); processedNodes.add(node); }
                else if (text.includes('«') && !isF) { opV++; addEvent(t, 0, "г"); processedNodes.add(node); }
                else if (!SYSTEM_EXCEPTIONS.some(ex => text.includes(ex)) && text.trim().length > 0) cleanOpNodes.push(node);
            });
            if (cleanOpNodes.length > 0) {
                const allText = cleanOpNodes.map(n => n.innerText).join(' ').toLowerCase();
                const sym = BACKFIRE_WORDS.some(w => allText.includes(w)) ? "X" : "0";
                if (opSeq.length >= maxCycle) { opHistory.push(opSeq); opSeq = ""; }
                opSeq += sym; addEvent(t, 0, sym);
            }
            cleanOpNodes.forEach(n => processedNodes.add(n));
            processedNodes.add(round);
        });

// ────────────────────────────────────────────────
// Section 3: Event Tracking & Luck Hybrid (v1.139 Final)
// ────────────────────────────────────────────────

// --- 3a. CORE EVENT TRACKING (Always active) ---
    document.querySelectorAll('.m_infl, .opp_infl, .le_my, .le_opp, .d_msg').forEach(el => {
        if (processedNodes.has(el)) return;

        const parent = el.closest('.new_line') || el.closest('.line');
        if (!parent) return;

        const text = el.innerText;
        // Now isTraining is defined and accessible here
        const isMy = el.classList.contains('m_infl') || el.classList.contains('le_my') || el.querySelector('.m_infl');
        const isOp = el.classList.contains('opp_infl') || el.classList.contains('le_opp') || el.querySelector('.opp_infl');
        const t = parent.getAttribute('data-t') || (isLogPage ? "L" : (isTraining ? "T" : "?"));

        // Energy (Influences)
        if (el.classList.contains('m_infl') || el.classList.contains('opp_infl')) {
            isMy ? myE++ : opE++;
            addEvent(t, isMy ? 1 : 0, text.includes('X') ? 'X' : '0');
        }
        // Voices
        else if (text.includes('«')) {
            isMy ? myV++ : opV++;
            addEvent(t, isMy ? 1 : 0, "г");
        }
        // Voice Effects
        else if (text.includes('➥')) {
            addEvent(t, isMy ? 1 : 0, "э");
        }

        processedNodes.add(el);
    });

    // --- 3b. LUCK DEVIATION (HP Change Trigger) ---
    const curMy = getHP(1), curOp = getHP(0);
    if (curMy !== null && curOp !== null) {
    if (baselineMyHP === null) {
        baselineMyHP = curMy;
        baselineOpHP = curOp;
    } else {
        const hpDeltaMy = curMy - baselineMyHP;
        const hpDeltaOp = curOp - baselineOpHP;
        const hasHpChange = Math.abs(hpDeltaMy) >= 0.01 || Math.abs(hpDeltaOp) >= 0.01;

        if (hasHpChange && !isLogPage) {
            let blockLines = [];
            const roundSelector = document.querySelector('.new_line') ? '.new_line' : '.line';

            // Gather the block for math analysis
            let current = document.querySelector(`${roundSelector}:last-of-type`);
            if (current) {
                while (current) {
                    blockLines.unshift(current);
                    let prev = current.previousElementSibling;
                    while (prev && !prev.matches(roundSelector)) { prev = prev.previousElementSibling; }
                    if (!prev || prev.classList.contains('turn_separator')) break;
                    current = prev;
                }
            }

            const blockText = blockLines.map(l => l.innerText).join(' ').toLowerCase();
            const hasBackfire = BACKFIRE_WORDS.some(w => blockText.includes(w.toLowerCase()));

            if (!hasBackfire) {
                const hasMyInfl = blockLines.some(l => l.querySelector('.m_infl') || l.classList.contains('m_infl'));
                const hasOpInfl = blockLines.some(l => l.classList.contains('opp_infl'));
                const hasMyVoiceEff = blockLines.some(l => l.innerText.includes('➥') && (l.querySelector('.m_infl') || l.classList.contains('m_infl')));
                const hasOpVoiceEff = blockLines.some(l => l.innerText.includes('➥') && l.classList.contains('opp_infl'));

                // Attribution: Who actually hit/healed?
                const myHitOccured = Math.abs(hpDeltaOp) >= 0.01;
                const opHitOccured = Math.abs(hpDeltaMy) >= 0.01;

                // Cumulative Weighting
                let myExp = myHitOccured ? EXPECTED.hit : 0;
                if (hasMyInfl) myExp += EXPECTED.influence;
                if (hasMyVoiceEff) myExp += EXPECTED.voice;

                let opExp = opHitOccured ? EXPECTED.hit : 0;
                if (hasOpInfl) opExp += EXPECTED.influence;
                if (hasOpVoiceEff) opExp += EXPECTED.voice;

                const myProfit = (-hpDeltaOp) + Math.max(0, hpDeltaMy);
                const opProfit = (-hpDeltaMy) + Math.max(0, hpDeltaOp);

                if (myExp > 0) {
                    const myLuck = myProfit - myExp;
                    myTotalEff += myLuck; myValidRounds++;
                    myLuckHistory.push(myLuck);
                    if (myLuckHistory.length > TREND_WINDOW) myLuckHistory.shift();
                }

                if (opExp > 0) {
                    const opLuck = opProfit - opExp;
                    opTotalEff += opLuck; opValidRounds++;
                    opLuckHistory.push(opLuck);
                    if (opLuckHistory.length > TREND_WINDOW) opLuckHistory.shift();
                }
            }
            baselineMyHP = curMy;
            baselineOpHP = curOp;
        }
    }
}

// Update the UI at the end of every process interval
updateUI();
        };

    setInterval(process, 1000);
})();