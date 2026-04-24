// ==UserScript==
// @name         Godville Duel Entity
// @version      1.135
// @namespace    Godville Duel Entity
// @description  Tactical radar for Godville Arena
// @description:en  Tactical radar for Godville Arena
// @description:ru  Тактический радар для дуэлей в Godville
// @author       Gilt3x
// @license      GNU General Public License v3.0, Copyright Gilt3x
// @match        *://godville.net/superhero*
// @match        *://godville.net/duels*
// @icon         https://google.com
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
        "рикошетом", "ударило обоих", "в другую сторону", "ударило по обоим",
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
    
    // === ИСТОРИЯ LUCK ДЛЯ ТРЕНДА (ПОСЛЕДНИЕ 10 РАУНДОВ) ===
    let myLuckHistory = [], opLuckHistory = [];
    const TREND_WINDOW = 10;

    const debugMode = true;
    const log = (msg) => { if (debugMode) console.log('[GODVILLE LUCK]', msg); };

    // === ОЖИДАЕМЫЕ ЗНАЧЕНИЯ (ИЗ СТАТИСТИКИ) ===
    const EXPECTED = {
        hit: 9.5,       // средний белый удар (5-14%)
        voice: 9.5,     // средний глас (5-14%)
        influence: 19.5 // среднее влияние (18-21%)
    };

    // UI Main
    const gui = document.createElement('div');
    gui.style = "position: fixed; bottom: 20px; left: 20px; z-index: 10000; background: rgba(0,0,0,0.9); color: #eee; padding: 12px; border: 1px solid #555; font-family: monospace; border-radius: 8px; width: 320px; box-shadow: 0 0 15px rgba(0,0,0,0.5);";
    gui.innerHTML = `
        <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
            <div>
                <button id="scanBtn" style="background:#444; color:#fff; cursor:pointer; font-size:10px; padding:3px 8px; border:1px solid #777;">SCAN</button>
                <button id="cycleBtn" style="background:#444; color:#fff; cursor:pointer; font-size:10px; padding:3px 8px; border:1px solid #777; margin-left:4px;">C:6</button>
                <button id="logBtn" style="background:#448; color:#fff; cursor:pointer; font-size:10px; padding:3px 8px; border:1px solid #777; margin-left:4px;">LOG</button>
            </div>
            <button id="resBtn" style="background:#622; color:#fff; cursor:pointer; font-size:10px; padding:3px 8px; border:1px solid #777;">RESET</button>
        </div>
        <div style="margin-bottom:12px;">
            <div style="margin-bottom:4px; font-size:11px;"><span style="color:#5af; font-weight:bold;">MY PLAYER&nbsp;&nbsp;Luck <span id="mLuck" style="font-weight:900;">0.00</span></span></div>
            <div style="display:flex; align-items:center; gap:5px;"><span id="mCur">------</span><span id="mH" style="font-size:10px; color:#666;"></span></div>
            <div style="display:flex; align-items:baseline; gap:6px; margin-top:2px;">
                <span id="mP" style="font-size:24px; font-weight:bold;">0%</span>
                <span style="font-size:16px; color:#aaa;"><span id="mE_val">0</span><span style="font-size:9px; opacity:0.7;">э</span>/<span id="mV_val">0</span><span style="font-size:9px; opacity:0.7;">г</span></span>
            </div>
        </div>
        <div style="margin-bottom:12px;">
            <div style="margin-bottom:4px; font-size:11px;"><span style="color:#f55; font-weight:bold;">OPPONENT&nbsp;&nbsp;Luck <span id="oLuck" style="font-weight:900;">0.00</span></span></div>
            <div style="display:flex; align-items:center; gap:5px;"><span id="oCur">------</span><span id="oH" style="font-size:10px; color:#666;"></span></div>
            <div style="display:flex; align-items:baseline; gap:6px; margin-top:2px;">
                <span id="oP" style="font-size:24px; font-weight:bold;">0%</span>
                <span style="font-size:16px; color:#aaa;"><span id="oE_val">0</span><span style="font-size:9px; opacity:0.7;">э</span>/<span id="oV_val">0</span><span style="font-size:9px; opacity:0.7;">г</span></span>
            </div>
        </div>
        <div style="text-align:right; font-size:9px; color:#666; border-top:1px solid #333; padding-top:4px;">Gilt3x v1.135</div>
    `;
    document.body.appendChild(gui);

    const sideLog = document.createElement('div');
    sideLog.id = "gv_side_log";
    sideLog.style = "position: fixed; bottom: 20px; left: 450px; z-index: 9999; background: rgba(0,0,0,0.95); color: #ccc; padding: 15px; border: 1px solid #555; font-family: monospace; border-radius: 8px; display: none; max-height: 80vh; width: 600px; overflow-x: auto; box-shadow: 5px 5px 15px rgba(0,0,0,0.5);";
    document.body.appendChild(sideLog);

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
        document.getElementById('mH').innerText = myHistory.length ? " | " + [...myHistory].reverse().slice(0,3).join(' | ') : "";
        document.getElementById('oCur').innerText = opSeq.padEnd(maxCycle, '-');
        document.getElementById('oP').innerText = prob(opSeq) + "%";
        document.getElementById('oP').style.color = opSeq.includes('X') ? "#0f0" : (prob(opSeq) >= 100 ? "#f00" : "#fff");
        document.getElementById('oE_val').innerText = opE;
        document.getElementById('oV_val').innerText = opV;
        document.getElementById('oH').innerText = opHistory.length ? " | " + [...opHistory].reverse().slice(0,3).join(' | ') : "";

        // === LUCK: ТРЕНД (10 РАУНДОВ) + СТАТИСТИКА (ВСЕ) ===
        const myTrend = myLuckHistory.length > 0 ? (myLuckHistory.reduce((a, b) => a + b, 0) / myLuckHistory.length) : 0;
        const opTrend = opLuckHistory.length > 0 ? (opLuckHistory.reduce((a, b) => a + b, 0) / opLuckHistory.length) : 0;
        const myAvg = myValidRounds > 0 ? (myTotalEff / myValidRounds) : 0;
        const opAvg = opValidRounds > 0 ? (opTotalEff / opValidRounds) : 0;
        
        const mE = document.getElementById('mLuck'), oE = document.getElementById('oLuck');
        
        // Формат: "Тренд (Статистика)"
        mE.innerText = `${myTrend.toFixed(2)} (${myAvg.toFixed(2)})`;
        oE.innerText = `${opTrend.toFixed(2)} (${opAvg.toFixed(2)})`;
        
        // Цвет по ТРЕНДУ (текущая тенденция)
        if (myTrend > opTrend && Math.abs(myTrend - opTrend) > 0.5) {
            mE.style.color = "#00ff00";
            oE.style.color = "#ff0000";
        }
        else if (opTrend > myTrend && Math.abs(opTrend - myTrend) > 0.5) {
            oE.style.color = "#00ff00";
            mE.style.color = "#ff0000";
        }
        else {
            mE.style.color = "#ffff00";
            oE.style.color = "#ffff00";
        }
    };

    const process = () => {
        // === 1. ТВОИ ДЕЙСТВИЯ + АРХИВ (ЯДРО - ОРИГИНАЛ 100%) ===
        document.querySelectorAll('.m_infl, .infl, .opp_infl, .le_my, .le_opp').forEach(el => {
            if (processedNodes.has(el)) return;
            const text = el.innerText;
            const isMy = el.classList.contains('m_infl') || el.classList.contains('infl') || el.classList.contains('le_my');
            const isForced = INFLUENCE_WITH_QUOTES.some(iq => text.includes(iq));
            const parent = el.closest('.new_line');
            const t = parent ? parent.getAttribute('data-t') : null;

            if (text.includes('➥')) { isMy ? myE++ : opE++; addEvent(t, isMy?1:0, "э"); }
            else if (text.includes('«') && !isForced) { isMy ? myV++ : opV++; addEvent(t, isMy?1:0, "г"); }
            else {
                const sym = BACKFIRE_WORDS.some(w => text.toLowerCase().includes(w.toLowerCase())) ? "X" : "0";
                if (isMy) { if (mySeq.length >= maxCycle) { myHistory.push(mySeq); mySeq = ""; } mySeq += sym; }
                else { if (opSeq.length >= maxCycle) { opHistory.push(opSeq); opSeq = ""; } opSeq += sym; }
                addEvent(t, isMy?1:0, sym);
            }
            processedNodes.add(el);
        });

        // === 2. ОППОНЕНТ В LIVE (ЯДРО - ОРИГИНАЛ 100%) ===
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

        // === 3. УДАЧА — v1.135 (ТРЕНД + СТАТИСТИКА) ===
        const curMy = getHP(1), curOp = getHP(0);

        const roundSelector = document.querySelector('.new_line') ? '.new_line' : '.line';
        log(`Селектор: ${roundSelector}`);

        if (curMy === null || curOp === null) {}
        else if (baselineMyHP === null) {
            baselineMyHP = curMy;
            baselineOpHP = curOp;
            log('✅ Baseline установлен');
        }
        else {
            const hpDeltaMy = curMy - baselineMyHP;
            const hpDeltaOp = curOp - baselineOpHP;

            const lastLine = document.querySelector(`${roundSelector}:last-of-type`);

            if (lastLine) {
                const lastLineText = lastLine.innerText.toLowerCase();
                const hasBackfire = BACKFIRE_WORDS.some(w => lastLineText.includes(w.toLowerCase()));

                const hasVoiceEffect = lastLineText.includes('➥');
                const hasInfluence = lastLine.querySelector('.m_infl, .infl, .opp_infl') !== null;
                const hasHpChange = (Math.abs(hpDeltaMy) >= 0.01 || Math.abs(hpDeltaOp) >= 0.01);
                const hasAnyAction = hasVoiceEffect || hasInfluence || hasHpChange;

                log(`Действия: ➥=${hasVoiceEffect}, вл=${hasInfluence}, HP=${hasHpChange}, крив=${hasBackfire}`);

                if (!hasBackfire && hasAnyAction) {
                    let myExpected = EXPECTED.hit;
                    let opExpected = EXPECTED.hit;

                    const hasMyAction = lastLine.querySelector('.m_infl, .infl, .le_my') !== null;

                    if (hasMyAction) {
                        if (hasVoiceEffect) myExpected += EXPECTED.voice;
                        if (hasInfluence) myExpected += EXPECTED.influence;
                    } else {
                        if (hasVoiceEffect) opExpected += EXPECTED.voice;
                        if (hasInfluence) opExpected += EXPECTED.influence;
                    }

                    const myProfit = (-hpDeltaOp) + Math.max(0, hpDeltaMy);
                    const opProfit = (-hpDeltaMy) + Math.max(0, hpDeltaOp);

                    const myLuck = myProfit - myExpected;
                    const opLuck = opProfit - opExpected;

                    log(`Ожидаемый: мой=${myExpected}, оп=${opExpected}`);
                    log(`Профит: мой=${myProfit.toFixed(1)}, оп=${opProfit.toFixed(1)}`);
                    log(`Luck: мой=${myLuck.toFixed(1)}, оп=${opLuck.toFixed(1)}`);

                    if (!firstTurnDetected) {
                        firstTurnDetected = true;
                        turnCounter = hasMyAction ? 0 : 1;
                        log(`🎯 Первый ход: ${turnCounter === 0 ? 'МОЙ' : 'ОП'}`);
                    }

                    // === НАКОПЛЕНИЕ ДЛЯ СТАТИСТИКИ (ВСЕ РАУНДЫ) ===
                    if (turnCounter === 0) {
                        myTotalEff += myLuck;
                        myValidRounds++;
                        
                        // === ИСТОРИЯ ДЛЯ ТРЕНДА (ПОСЛЕДНИЕ 10) ===
                        myLuckHistory.push(myLuck);
                        if (myLuckHistory.length > TREND_WINDOW) myLuckHistory.shift();
                        
                        const myTrend = myLuckHistory.reduce((a, b) => a + b, 0) / myLuckHistory.length;
                        log(`➕ Мой: +${myLuck.toFixed(2)} (тренд: ${myTrend.toFixed(2)}, стат: ${(myTotalEff/myValidRounds).toFixed(2)})`);
                    } else {
                        opTotalEff += opLuck;
                        opValidRounds++;
                        
                        opLuckHistory.push(opLuck);
                        if (opLuckHistory.length > TREND_WINDOW) opLuckHistory.shift();
                        
                        const opTrend = opLuckHistory.reduce((a, b) => a + b, 0) / opLuckHistory.length;
                        log(`➕ Оп: +${opLuck.toFixed(2)} (тренд: ${opTrend.toFixed(2)}, стат: ${(opTotalEff/opValidRounds).toFixed(2)})`);
                    }

                    turnCounter = 1 - turnCounter;
                }
                else {
                    log('⏸️ Пропуск, ход НЕ переключён');
                }

                baselineMyHP = curMy;
                baselineOpHP = curOp;
            }
        }

        updateUI();
    };

    // === КНОПКИ UI ===
    document.getElementById('cycleBtn').onclick = () => {
        maxCycle = (maxCycle === 6) ? 4 : 6;
        document.getElementById('cycleBtn').innerText = "C:" + maxCycle;
        mySeq = ""; opSeq = "";
        updateUI();
    };
    document.getElementById('resBtn').onclick = () => { location.reload(); };
    document.getElementById('logBtn').onclick = () => {
        const s = document.getElementById('gv_side_log');
        if (s.style.display === "none") {
            const turns = Object.keys(duelFullLog).map(Number).sort((a, b) => a - b);
            let html = '<div style="display:flex; gap:30px; padding-bottom:10px;">';
            for (let i = 0; i < turns.length; i += 20) {
                html += '<div style="min-width:130px; border-right:1px solid #333; padding-right:15px; flex-shrink:0;">';
                turns.slice(i, i + 20).forEach(t => {
                    html += `<div style="white-space:nowrap; margin-bottom:2px; font-size:11px;"><span style="color:#777;">${String(t).padStart(2, '0')} - </span><span style="color:#5af">${(duelFullLog[t].my||[]).join('')}</span> | <span style="color:#f55">${(duelFullLog[t].op||[]).join('')}</span></div>`;
                });
                html += '</div>';
            }
            s.innerHTML = `<div style="color:#fff; border-bottom:1px solid #444; margin-bottom:10px; padding-bottom:5px; font-weight:bold;">BATTLE LOG</div>${html}</div>`;
            s.style.display = "block";
        } else s.style.display = "none";
    };

    setInterval(process, 1000);
})();