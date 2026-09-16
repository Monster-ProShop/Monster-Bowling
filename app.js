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
        // Re-render brackets to ensure scores are visually updated if switching tabs
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
    document.getElementById('addName').focus(); // Keep focus for rapid entry
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
        // Sort descending so bowlers needing the most brackets are seated first
        pool.sort((a, b) => b.remaining - a.remaining);
        let available = pool.filter(b => b.remaining > 0);
        
        if (available.length < 8) break; 
        
        let selectedForBracket = [];
        for (let i = 0; i < 8; i++) {
            selectedForBracket.push({ id: available[i].id, name: available[i].name });
            available[i].remaining--; 
        }
        
        // Shuffle to ensure randomized matchups in Game 1
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
    // Apply handicap if it's an HDCP bracket and they actually bowled a score > 0
    if (type === 'hdcp' && score > 0) score += b.hdcp;
    return score;
}

function renderBrackets(bracketList, elementId, titlePrefix, type) {
    const container = document.getElementById(elementId);
    if (bracketList.length === 0) {
        container.innerHTML = `<p class="text-slate-500 italic text-center py-4">Not enough entries to form an 8-person bracket.</p>`;
        return;
    }

    let html = '';
    
    bracketList.forEach((bracket, index) => {
        let r1 = bracket; 
        let r2 = [];      
        let r3 = [];      
        let champ = null; 

        // Round 2 Advancements (From Game 1)
        for(let i = 0; i < 8; i += 2) {
            let s1 = getBowlerScore(r1[i].id, 1, type);
            let s2 = getBowlerScore(r1[i+1].id, 1, type);
            let winner = (s1 < s2 && s2 > 0) ? r1[i+1] : r1[i]; 
            r2.push(winner);
        }

        // Round 3 Advancements (From Game 2)
        for(let i = 0; i < 4; i += 2) {
            let s1 = getBowlerScore(r2[i].id, 2, type);
            let s2 = getBowlerScore(r2[i+1].id, 2, type);
            let winner = (s1 < s2 && s2 > 0) ? r2[i+1] : r2[i];
            r3.push(winner);
        }

        // Champion (From Game 3)
        let sF1 = getBowlerScore(r3[0].id, 3, type);
        let sF2 = getBowlerScore(r3[1].id, 3, type);
        champ = (sF1 < sF2 && sF2 > 0) ? r3[1] : r3[0];

        // Build the HTML Tree
        html += `
        <div class="border border-slate-200 rounded-xl p-4 bg-white shadow-sm overflow-hidden">
            <h4 class="font-black text-slate-700 text-md mb-4 bg-slate-100 py-1 px-3 rounded inline-block border">${titlePrefix} Bracket #${index + 1}</h4>
            
            <div class="bracket-wrapper">
                <!-- Quarterfinals (Game 1) -->
                <div class="bracket-column gap-1">
                    ${r1.map(p => `
                        <div class="player-slot ${r2.some(w => w.id === p.id) && getBowlerScore(p.id, 1, type) > 0 ? 'winner' : ''}">
                            <span class="truncate pr-2">${p.name}</span>
                            <span class="text-slate-400 font-medium">${getBowlerScore(p.id, 1, type) || '-'}</span>
                        </div>
                    `).join('')}
                </div>

                <!-- Semifinals (Game 2) -->
                <div class="bracket-column justify-around">
                    ${r2.map(p => `
                        <div class="player-slot ${r3.some(w => w.id === p.id) && getBowlerScore(p.id, 2, type) > 0 ? 'winner' : ''}">
                            <span class="truncate pr-2">${p.name}</span>
                            <span class="text-slate-400 font-medium">${getBowlerScore(p.id, 2, type) || '-'}</span>
                        </div>
                    `).join('')}
                </div>

                <!-- Finals (Game 3) -->
                <div class="bracket-column justify-around">
                    ${r3.map(p => `
                        <div class="player-slot ${champ.id === p.id && getBowlerScore(p.id, 3, type) > 0 ? 'winner' : ''}">
                            <span class="truncate pr-2">${p.name}</span>
                            <span class="text-slate-400 font-medium">${getBowlerScore(p.id, 3, type) || '-'}</span>
                        </div>
                    `).join('')}
                </div>

                <!-- Winner -->
                <div class="bracket-column justify-center pl-2">
                    <div class="text-[10px] font-bold text-slate-400 uppercase text-center mb-1 tracking-wider">Champion</div>
                    <div class="player-slot champion">
                        ${getBowlerScore(champ.id, 3, type) > 0 ? champ.name : 'TBD'}
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
    
    // Sort bowlers alphabetically for the scoring sheet
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
                <td class="py-2 px-2"><input type="number" onchange="updateScore('${b.id}', 'g1', this.value)" value="${b.scores.g1 || ''}" class="w-20 px-2 py-2 border rounded-lg text-center bg-white shadow-inner focus:ring-2 focus:ring-lime-400 outline-none"></td>
                <td class="py-2 px-2"><input type="number" onchange="updateScore('${b.id}', 'g2', this.value)" value="${b.scores.g2 || ''}" class="w-20 px-2 py-2 border rounded-lg text-center bg-white shadow-inner focus:ring-2 focus:ring-lime-400 outline-none"></td>
                <td class="py-2 px-2"><input type="number" onchange="updateScore('${b.id}', 'g3', this.value)" value="${b.scores.g3 || ''}" class="w-20 px-2 py-2 border rounded-lg text-center bg-white shadow-inner focus:ring-2 focus:ring-lime-400 outline-none"></td>
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
    renderScoringTable(); // Update the series totals in the table
    // Re-render brackets to visually show the advancements based on the new scores
    renderBrackets(brackets.hdcp, 'hdcpBracketDisplay', 'HDCP', 'hdcp');
    renderBrackets(brackets.scratch, 'scratchBracketDisplay', 'Scratch', 'scratch');
    
    // Switch to brackets tab automatically to view results
    switchTab('brackets');
}