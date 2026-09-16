// --- STATE MANAGEMENT ---
let bowlers = [];
let brackets = {
    hdcp: [],
    scratch: []
};

// --- TAB NAVIGATION ---
function switchTab(tabId) {
    const tabs = ['setup', 'roster', 'brackets', 'scoring'];
    tabs.forEach(t => {
        document.getElementById(`sec-${t}`).classList.add('section-hidden');
        document.getElementById(`tab-${t}`).className = 'tab-inactive pb-2 transition-all';
    });
    document.getElementById(`sec-${tabId}`).classList.remove('section-hidden');
    document.getElementById(`tab-${tabId}`).className = 'tab-active pb-2 transition-all';

    if (tabId === 'scoring') renderScoringTable();
    if (tabId === 'brackets') {
        renderBrackets(brackets.hdcp, 'hdcpBracketDisplay', 'HDCP', 'hdcp');
        renderBrackets(brackets.scratch, 'scratchBracketDisplay', 'Scratch', 'scratch');
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
                <td class="py-3 px-4 font-bold text-slate-800">${b.name}</td>
                <td class="py-3 px-4">${b.hdcp}</td>
                <td class="py-3 px-4 text-cyan-600 font-bold">${b.hdcpCount}</td>
                <td class="py-3 px-4 text-blue-600 font-bold">${b.scratchCount}</td>
                <td class="py-3 px-4">
                    <button onclick="removeBowler('${b.id}')" class="text-red-500 hover:text-red-700 text-sm font-bold bg-red-50 px-2 py-1 rounded">X REMOVE</button>
                </td>
            </tr>
        `;
    });
}

// --- BRACKET GENERATOR (Greedy + Random Shuffle) ---
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

function generateAllBrackets() {
    brackets.hdcp = buildBrackets('hdcpCount');
    brackets.scratch = buildBrackets('scratchCount');
    
    renderBrackets(brackets.hdcp, 'hdcpBracketDisplay', 'HDCP', 'hdcp');
    renderBrackets(brackets.scratch, 'scratchBracketDisplay', 'Scratch', 'scratch');
}

function buildBrackets(countProperty) {
    let pool = bowlers.map(b => ({ id: b.id, name: b.name, remaining: b[countProperty] }))
                      .filter(b => b.remaining > 0);
    
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

// Tie-breaker evaluator: Returns ALL players who tie for the highest score in a specific match
function getWinners(players, gameNum, type) {
    if (!players || players.length === 0) return [];
    
    // Map players to their scores for this specific game
    let scoredPlayers = players.map(p => ({ p, score: getBowlerScore(p.id, gameNum, type) }));
    
    // Find the max score among the group
    let maxScore = Math.max(...scoredPlayers.map(sp => sp.score));
    
    // If the max score is 0, we assume the game hasn't been played yet (pending)
    if (maxScore === 0) return []; 
    
    // Return all players who tied the max score
    return scoredPlayers.filter(sp => sp.score === maxScore).map(sp => sp.p);
}

// Visual HTML builder for a match group container
function renderMatch(players, gameNum, winners, type) {
    if (players.length === 0) {
        return `<div class="match-group"><div class="text-xs text-slate-400 font-medium text-center py-2 italic">Pending...</div></div>`;
    }
    return `
        <div class="match-group shadow-sm">
            ${players.map(p => `
                <div class="player-slot ${winners.some(w => w.id === p.id) ? 'winner' : ''}">
                    <span class="truncate pr-2">${p.name}</span>
                    <span class="text-slate-400 font-black">${getBowlerScore(p.id, gameNum, type) || '-'}</span>
                </div>
            `).join('')}
        </div>
    `;
}

function renderBrackets(bracketList, elementId, titlePrefix, type) {
    const container = document.getElementById(elementId);
    if (bracketList.length === 0) {
        container.innerHTML = `<p class="text-slate-500 italic text-center py-4 border rounded-xl bg-slate-50">Not enough entries to form an 8-person bracket.</p>`;
        return;
    }

    let html = '';
    
    bracketList.forEach((bracket, index) => {
        let r1 = bracket; 
        
        // Define Game 1 Matches (Head-to-head)
        let m1 = [r1[0], r1[1]];
        let m2 = [r1[2], r1[3]];
        let m3 = [r1[4], r1[5]];
        let m4 = [r1[6], r1[7]];

        // Evaluate Game 1 Winners (Multiple can advance if they tie)
        let m1_w = getWinners(m1, 1, type);
        let m2_w = getWinners(m2, 1, type);
        let m3_w = getWinners(m3, 1, type);
        let m4_w = getWinners(m4, 1, type);

        // Define Game 2 Matches (Top bracket half vs Bottom bracket half)
        let m5 = [...m1_w, ...m2_w];
        let m6 = [...m3_w, ...m4_w];

        // Evaluate Game 2 Winners
        let m5_w = getWinners(m5, 2, type);
        let m6_w = getWinners(m6, 2, type);

        // Define Game 3 Match (Finals)
        let m7 = [...m5_w, ...m6_w];
        
        // Evaluate Champion(s)
        let champs = getWinners(m7, 3, type);

        // Build the HTML Tree
        html += `
        <div class="border border-slate-200 rounded-2xl p-5 bg-white shadow-sm overflow-hidden mb-8">
            <div class="flex items-center justify-between mb-4 border-b pb-3">
                <h4 class="font-black text-slate-800 text-lg uppercase">${titlePrefix} Bracket #${index + 1}</h4>
            </div>
            
            <div class="bracket-wrapper">
                <!-- Game 1 -->
                <div class="bracket-column">
                    <div class="text-xs font-bold text-slate-400 uppercase text-center tracking-wider">Game 1</div>
                    ${renderMatch(m1, 1, m1_w, type)}
                    ${renderMatch(m2, 1, m2_w, type)}
                    ${renderMatch(m3, 1, m3_w, type)}
                    ${renderMatch(m4, 1, m4_w, type)}
                </div>

                <!-- Game 2 -->
                <div class="bracket-column">
                    <div class="text-xs font-bold text-slate-400 uppercase text-center tracking-wider">Game 2</div>
                    ${renderMatch(m5, 2, m5_w, type)}
                    ${renderMatch(m6, 2, m6_w, type)}
                </div>

                <!-- Game 3 (Finals) -->
                <div class="bracket-column justify-center">
                    <div class="text-xs font-bold text-slate-400 uppercase text-center tracking-wider">Game 3</div>
                    ${renderMatch(m7, 3, champs, type)}
                </div>

                <!-- Champion -->
                <div class="bracket-column justify-center">
                    <div class="text-xs font-bold text-slate-400 uppercase text-center mb-1 tracking-wider">Champion</div>
                    <div class="match-group bg-amber-50 border-amber-200">
                        ${champs.length > 0 
                            ? champs.map(c => `<div class="player-slot champion">${c.name}</div>`).join('')
                            : `<div class="player-slot text-slate-400 justify-center">TBD</div>`
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
        let hdcpSeries = scrSeries + (b.hdcp * 3);
        
        tbody.innerHTML += `
            <tr class="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                <td class="py-3 px-4 flex items-center gap-2">
                    <span class="text-slate-800">${b.name}</span>
                    <span class="bg-lime-100 text-lime-800 text-xs px-2 py-0.5 rounded-full font-bold">+${b.hdcp}</span>
                </td>
                <td class="py-2 px-2"><input type="number" onchange="updateScore('${b.id}', 'g1', this.value)" value="${b.scores.g1 || ''}" class="w-20 px-2 py-2 border rounded-lg text-center bg-white shadow-inner focus:ring-2 focus:ring-lime-400 outline-none font-bold"></td>
                <td class="py-2 px-2"><input type="number" onchange="updateScore('${b.id}', 'g2', this.value)" value="${b.scores.g2 || ''}" class="w-20 px-2 py-2 border rounded-lg text-center bg-white shadow-inner focus:ring-2 focus:ring-lime-400 outline-none font-bold"></td>
                <td class="py-2 px-2"><input type="number" onchange="updateScore('${b.id}', 'g3', this.value)" value="${b.scores.g3 || ''}" class="w-20 px-2 py-2 border rounded-lg text-center bg-white shadow-inner focus:ring-2 focus:ring-lime-400 outline-none font-bold"></td>
                <td class="py-3 px-2 text-slate-400">${scrSeries > 0 ? scrSeries : '-'}</td>
                <td class="py-3 px-2 text-lime-600 font-black">${scrSeries > 0 ? hdcpSeries : '-'}</td>
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
    renderBrackets(brackets.hdcp, 'hdcpBracketDisplay', 'HDCP', 'hdcp');
    renderBrackets(brackets.scratch, 'scratchBracketDisplay', 'Scratch', 'scratch');
    switchTab('brackets');
}