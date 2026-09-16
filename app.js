// --- STATE MANAGEMENT ---
let bowlers = [];
let brackets = { hdcp: [], scratch: [] };

// --- TAB NAVIGATION ---
function switchTab(tabId) {
    const tabs = ['setup', 'roster', 'brackets', 'scoring'];
    tabs.forEach(t => {
        document.getElementById(`sec-${t}`).classList.add('section-hidden');
        document.getElementById(`tab-${t}`).className = 'tab-btn tab-inactive py-3 rounded shadow uppercase tracking-wide text-sm';
    });
    document.getElementById(`sec-${tabId}`).classList.remove('section-hidden');
    document.getElementById(`tab-${tabId}`).className = 'tab-btn tab-active py-3 rounded shadow uppercase tracking-wide text-sm';

    if (tabId === 'scoring') renderScoringTable();
    if (tabId === 'brackets') {
        renderBrackets(brackets.hdcp, 'hdcpBracketDisplay', 'HDCP Bracket', 'hdcp');
        renderBrackets(brackets.scratch, 'scratchBracketDisplay', 'Scratch Bracket', 'scratch');
    }
}

// --- ROSTER MANAGEMENT ---
document.getElementById('addBowlerForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const newBowler = {
        id: Date.now().toString(),
        name: document.getElementById('addName').value.trim(),
        hdcp: parseInt(document.getElementById('addHdcp').value) || 0,
        hdcpCount: parseInt(document.getElementById('addHdcpCount').value) || 0,
        scratchCount: parseInt(document.getElementById('addScratchCount').value) || 0,
        scores: { g1: 0, g2: 0, g3: 0 }
    };
    
    bowlers.push(newBowler);
    e.target.reset();
    document.getElementById('addName').focus(); 
    renderRoster();
});

function removeBowler(id) {
    bowlers = bowlers.filter(b => b.id !== id);
    renderRoster();
}

function renderRoster() {
    const tbody = document.getElementById('rosterTableBody');
    tbody.innerHTML = '';
    
    bowlers.forEach(b => {
        tbody.innerHTML += `
            <tr class="border-b border-slate-100 hover:bg-slate-50">
                <td class="py-3 px-4 font-bold">${b.name}</td>
                <td class="py-3 px-4">${b.hdcp}</td>
                <td class="py-3 px-4 font-bold">${b.hdcpCount}</td>
                <td class="py-3 px-4 font-bold">${b.scratchCount}</td>
                <td class="py-3 px-4">
                    <button onclick="removeBowler('${b.id}')" class="text-red-700 hover:text-white hover:bg-red-700 text-xs font-bold px-3 py-1 rounded border border-red-700 transition-colors">REMOVE</button>
                </td>
            </tr>
        `;
    });
}

// --- BRACKET GENERATOR (Greedy + Shuffle) ---
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

function generateAllBrackets() {
    brackets.hdcp = buildBrackets('hdcpCount');
    brackets.scratch = buildBrackets('scratchCount');
    
    renderBrackets(brackets.hdcp, 'hdcpBracketDisplay', 'HDCP Bracket', 'hdcp');
    renderBrackets(brackets.scratch, 'scratchBracketDisplay', 'Scratch Bracket', 'scratch');
    switchTab('brackets');
}

function buildBrackets(countProperty) {
    let pool = bowlers.map(b => ({ id: b.id, name: b.name, remaining: b[countProperty] })).filter(b => b.remaining > 0);
    let generatedBrackets = [];

    while (true) {
        pool.sort((a, b) => b.remaining - a.remaining);
        let available = pool.filter(b => b.remaining > 0);
        if (available.length < 8) break; 
        
        let selectedForBracket = [];
        for (let i = 0; i < 8; i++) {
            selectedForBracket.push({ id: available[i].id, name: available[i].name });
            available[i].remaining--; 
        }
        
        shuffleArray(selectedForBracket);
        generatedBrackets.push(selectedForBracket);
    }
    return generatedBrackets;
}

// --- VISUAL BRACKET RENDERER & SCORING ---
function getBowlerScore(id, gameNum, type) {
    let b = bowlers.find(x => x.id === id);
    if (!b) return 0;
    let score = b.scores[`g${gameNum}`] || 0;
    if (type === 'hdcp' && score > 0) score += b.hdcp;
    return score;
}

function getWinners(players, gameNum, type) {
    if (!players || players.length === 0) return [];
    let scoredPlayers = players.map(p => ({ p, score: getBowlerScore(p.id, gameNum, type) }));
    let maxScore = Math.max(...scoredPlayers.map(sp => sp.score));
    if (maxScore === 0) return []; 
    return scoredPlayers.filter(sp => sp.score === maxScore).map(sp => sp.p);
}

function renderMatch(players, gameNum, winners, type) {
    if (players.length === 0) {
        return `<div class="match-group"><div class="pending-box">Pending</div></div>`;
    }
    return `
        <div class="match-group">
            ${players.map(p => `
                <div class="player-slot ${winners.some(w => w.id === p.id) ? 'winner' : ''}">
                    <div class="player-name">${p.name}</div>
                    <div class="player-score">${getBowlerScore(p.id, gameNum, type) || '-'}</div>
                </div>
            `).join('')}
        </div>
    `;
}

function renderBrackets(bracketList, elementId, titlePrefix, type) {
    const container = document.getElementById(elementId);
    if (bracketList.length === 0) {
        container.innerHTML = `<p class="text-slate-500 italic text-center py-4 bg-white border border-slate-200 rounded">Not enough entries.</p>`;
        return;
    }

    let html = '';
    
    bracketList.forEach((bracket, index) => {
        let r1 = bracket; 
        
        let m1 = [r1[0], r1[1]]; let m2 = [r1[2], r1[3]];
        let m3 = [r1[4], r1[5]]; let m4 = [r1[6], r1[7]];

        let m1_w = getWinners(m1, 1, type); let m2_w = getWinners(m2, 1, type);
        let m3_w = getWinners(m3, 1, type); let m4_w = getWinners(m4, 1, type);

        let m5 = [...m1_w, ...m2_w]; let m6 = [...m3_w, ...m4_w];
        let m5_w = getWinners(m5, 2, type); let m6_w = getWinners(m6, 2, type);

        let m7 = [...m5_w, ...m6_w];
        let champs = getWinners(m7, 3, type);

        html += `
        <div class="mb-12">
            <h4 class="font-black text-[#0f172a] text-md mb-2 tracking-wide">${titlePrefix} #${index + 1}</h4>
            
            <div class="bracket-container">
                <div class="bracket-column col-g1">
                    <div class="text-[10px] font-bold text-slate-400 uppercase mb-1">Game 1</div>
                    ${renderMatch(m1, 1, m1_w, type)}
                    ${renderMatch(m2, 1, m2_w, type)}
                    ${renderMatch(m3, 1, m3_w, type)}
                    ${renderMatch(m4, 1, m4_w, type)}
                </div>

                <div class="bracket-column col-g2">
                    <div class="text-[10px] font-bold text-slate-400 uppercase mb-1">Game 2 (Semifinals)</div>
                    ${renderMatch(m5, 2, m5_w, type)}
                    ${renderMatch(m6, 2, m6_w, type)}
                </div>

                <div class="bracket-column col-finals">
                    <div class="text-[10px] font-bold text-slate-400 uppercase mb-1">Game 3 (Finals)</div>
                    <div class="match-group justify-center h-full">
                        ${champs.length > 0 
                            ? champs.map(c => `
                                <div class="player-slot champion">
                                    <div class="player-name">Final Winner</div>
                                    <div class="player-score">${c.name}</div>
                                </div>
                              `).join('')
                            : `<div class="player-slot champion" style="border-color:#e2e8f0; background:white; color:#94a3b8;"><div class="player-name" style="color:#94a3b8;">Pending</div></div>`
                        }
                    </div>
                </div>
            </div>
        </div>
        `;
    });
    container.innerHTML = html;
}

// --- CENTRAL SCORING SYSTEM ---
function renderScoringTable() {
    const tbody = document.getElementById('scoringTableBody');
    tbody.innerHTML = '';
    
    let sortedBowlers = [...bowlers].sort((a, b) => a.name.localeCompare(b.name));
    
    sortedBowlers.forEach(b => {
        let scrSeries = (b.scores.g1 + b.scores.g2 + b.scores.g3);
        let hdcpSeries = scrSeries > 0 ? scrSeries + (b.hdcp * 3) : 0;
        
        tbody.innerHTML += `
            <tr class="border-b border-slate-200 hover:bg-[#fdfbf7]">
                <td class="py-3 px-4 flex items-center gap-2">
                    <span>${b.name}</span>
                    <span class="bg-[#d4af37] text-white text-[10px] px-2 py-0.5 rounded font-black">+${b.hdcp}</span>
                </td>
                <td class="py-2 px-2 text-center"><input type="number" onchange="updateScore('${b.id}', 'g1', this.value)" value="${b.scores.g1 || ''}" class="gold-input w-16 px-1 py-1 rounded text-center"></td>
                <td class="py-2 px-2 text-center"><input type="number" onchange="updateScore('${b.id}', 'g2', this.value)" value="${b.scores.g2 || ''}" class="gold-input w-16 px-1 py-1 rounded text-center"></td>
                <td class="py-2 px-2 text-center"><input type="number" onchange="updateScore('${b.id}', 'g3', this.value)" value="${b.scores.g3 || ''}" class="gold-input w-16 px-1 py-1 rounded text-center"></td>
                <td class="py-3 px-2 text-center text-slate-500">${scrSeries > 0 ? scrSeries : '-'}</td>
                <td class="py-3 px-2 text-center text-[#7a141b] font-black">${hdcpSeries > 0 ? hdcpSeries : '-'}</td>
            </tr>
        `;
    });
}

function updateScore(id, game, val) {
    let bowler = bowlers.find(b => b.id === id);
    if(bowler) {
        bowler.scores[game] = parseInt(val) || 0;
    }
}

function calculateWinners() {
    renderScoringTable(); 
    renderBrackets(brackets.hdcp, 'hdcpBracketDisplay', 'HDCP Bracket', 'hdcp');
    renderBrackets(brackets.scratch, 'scratchBracketDisplay', 'Scratch Bracket', 'scratch');
    switchTab('brackets');
}