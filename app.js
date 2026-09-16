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
                    <button onclick="removeBowler('${b.id}')" class="text-red-500 hover:text-red-700 text-sm font-bold">X REMOVE</button>
                </td>
            </tr>
        `;
    });
}

// --- BRACKET GENERATOR (Greedy Algorithm) ---
function generateAllBrackets() {
    brackets.hdcp = buildBrackets('hdcpCount');
    brackets.scratch = buildBrackets('scratchCount');
    
    renderBrackets(brackets.hdcp, 'hdcpBracketDisplay', 'HDCP Bracket');
    renderBrackets(brackets.scratch, 'scratchBracketDisplay', 'Scratch Bracket');
}

function buildBrackets(countProperty) {
    // 1. Create a pool tracking how many brackets each bowler still needs
    let pool = bowlers.map(b => ({ id: b.id, name: b.name, remaining: b[countProperty] }))
                      .filter(b => b.remaining > 0);
    
    let generatedBrackets = [];

    // 2. Loop until we can no longer form a full 8-person bracket
    while (true) {
        // Sort pool descending by remaining requested brackets. 
        // This distributes heavy players first to avoid collisions.
        pool.sort((a, b) => b.remaining - a.remaining);
        
        // Filter out anyone who has 0 remaining entries
        let available = pool.filter(b => b.remaining > 0);
        
        // If we don't have 8 distinct players left, we must stop mathematically.
        if (available.length < 8) break; 
        
        let newBracket = [];
        // Pull the top 8 distinct players for this bracket
        for (let i = 0; i < 8; i++) {
            newBracket.push({ id: available[i].id, name: available[i].name });
            available[i].remaining--; // Decrement their requested count
        }
        
        generatedBrackets.push(newBracket);
    }
    
    return generatedBrackets;
}

function renderBrackets(bracketList, elementId, titlePrefix) {
    const container = document.getElementById(elementId);
    if (bracketList.length === 0) {
        container.innerHTML = `<p class="text-slate-500 italic text-center">No brackets generated or not enough entries for 8 players.</p>`;
        return;
    }

    container.innerHTML = bracketList.map((bracket, index) => `
        <div class="border border-slate-200 rounded-lg p-3 bg-white shadow-sm mb-4">
            <h4 class="font-bold text-slate-800 border-b pb-1 mb-2">${titlePrefix} #${index + 1}</h4>
            <ol class="list-decimal list-inside text-sm text-slate-600 grid grid-cols-2 gap-1">
                ${bracket.map(player => `<li>${player.name}</li>`).join('')}
            </ol>
        </div>
    `).join('');
}

// --- SCORING SYSTEM ---
function renderScoringTable() {
    const tbody = document.getElementById('scoringTableBody');
    tbody.innerHTML = '';
    
    // Sort alphabetically for scoring ease
    let sortedBowlers = [...bowlers].sort((a, b) => a.name.localeCompare(b.name));
    
    sortedBowlers.forEach(b => {
        let scrSeries = (b.scores.g1 + b.scores.g2 + b.scores.g3);
        let hdcpSeries = scrSeries + (b.hdcp * 3);
        
        tbody.innerHTML += `
            <tr class="border-b border-slate-100 hover:bg-slate-50">
                <td class="py-3 px-4 flex items-center gap-2">
                    <span class="text-slate-800">${b.name}</span>
                    <span class="bg-lime-100 text-lime-800 text-xs px-2 py-1 rounded-full">+${b.hdcp}</span>
                </td>
                <td class="py-2 px-2"><input type="number" onchange="updateScore('${b.id}', 'g1', this.value)" value="${b.scores.g1 || ''}" class="w-16 px-2 py-1 border rounded text-center bg-white"></td>
                <td class="py-2 px-2"><input type="number" onchange="updateScore('${b.id}', 'g2', this.value)" value="${b.scores.g2 || ''}" class="w-16 px-2 py-1 border rounded text-center bg-white"></td>
                <td class="py-2 px-2"><input type="number" onchange="updateScore('${b.id}', 'g3', this.value)" value="${b.scores.g3 || ''}" class="w-16 px-2 py-1 border rounded text-center bg-white"></td>
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
        // Optional: Call renderScoringTable() here if you want live series updating, 
        // but it forces loss of focus on the input field. Better to re-render on save.
    }
}

function calculateWinners() {
    renderScoringTable();
    alert('Scores saved globally! Ready to resolve generated brackets in Phase 2.');
}