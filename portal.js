import { createClient } from 'https://esm.sh/@neondatabase/neon-js@0.7.0-beta?bundle';

(function () {
  const cfg = window.MONSTER_NEON || {};
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const dollars = cents => '$' + (Number(cents || 0) / 100).toFixed(2);
  const sections = ['portalAuth','portalDashboard','portalViewer','managerApp'];
  const show = id => sections.forEach(name => $(name).classList.toggle('hidden', name !== id));
  const localize = () => window.BowlingApp?.translateUI();
  const notice = message => { $('portalNotice').textContent = message;localize(); };
  const expiredNoticeVisible = () => /session expired|session has expired|sesi[oó]n expir[oó]/i.test($('portalNotice').textContent);
  const fail = error => notice(error?.message || String(error));
  let client, user, role = 'user', admin = false, superAdmin = false, current = null, competitions = [], accessUsers = [], permanentRoster = [], rosterCompetition = null, pendingRosterPreview = null, saveJob = null, saving = false, verificationEmail = '', reauth = false, sessionExpired = false, needsSessionReset = false, lastEmail = '';
  const updateAuthButton = () => {
    $('portalLogin').textContent = user && !sessionExpired ? 'Log out' : 'Log in';
    $('portalLogin').classList.remove('hidden');
    localize();
  };
  const newClient = () => createClient(cfg.url,{auth:{persistSession:true,autoRefreshToken:true,fetchOptions:{credentials:'include',cache:'no-store'}}});
  async function resetExpiredSession() {
    if (!needsSessionReset) return;
    try { await client?.auth.signOut(); } catch {}
    // Recreating the client also drops any expired session cached by the SDK.
    client = newClient();
    user = null;
    admin = false;
    sessionExpired = false;
    needsSessionReset = false;
    updateAuthButton();
  }

  async function activeToken(attempts = 5) {
    let lastError = null;
    for (let attempt = 0; attempt < attempts; attempt++) {
      const result = await client.auth.token();
      if (!result.error && result.data?.token) return result.data.token;
      lastError = result.error || lastError;
      const restored = await client.auth.getSession();
      if (restored.error) lastError = restored.error;
      if (restored.data?.user) user = restored.data.user;
      if (attempt < attempts - 1) await new Promise(resolve => setTimeout(resolve, 150 * (attempt + 1)));
    }
    throw lastError || new Error('Session expired. Sign in again.');
  }

  async function api(path, method = 'GET', body) {
    let token = null;
    if (user) {
      try {
        token = await activeToken();
      } catch (error) {
        lastEmail = user.email || lastEmail;
        sessionExpired = true;
        needsSessionReset = true;
        updateAuthButton();
        notice('Your session expired. Log in again to continue; the information on this screen is preserved.');
        throw error;
      }
    }
    const result = await fetch(cfg.apiUrl + path, {
      method,
      headers: {'content-type':'application/json',...(token ? {authorization:'Bearer '+token} : {})},
      ...(body === undefined ? {} : {body:JSON.stringify(body)})
    });
    const data = await result.json();
    if (!result.ok) {
      if (result.status === 401 && user) {
        lastEmail = user.email || lastEmail;
        sessionExpired = true;
        needsSessionReset = true;
        updateAuthButton();
        notice('Your session expired. Log in again to continue; the information on this screen is preserved.');
      }
      throw new Error(data.error || 'Request failed');
    }
    if(user){sessionExpired=false;updateAuthButton();if(expiredNoticeVisible())notice('');}
    return data;
  }

  function renderCompetitionOptions(rows, selected) {
    const select = $('loginCompetition');
    if(!select)return;
    select.innerHTML = '<option value="">Choose a league or tournament</option>' +
      rows.map(c => '<option value="' + esc(c.id) + '">' + esc(c.name) + ' (' + esc(c.kind) + ')</option>').join('');
    if (selected) select.value = selected;
    localize();
  }
  async function listCompetitions() {
    return await api('/competitions');
  }
  async function refreshDashboard() {
    const rows = await listCompetitions();
    competitions=rows;
    renderCompetitionOptions(rows.filter(c => c.status === 'open'), $('loginCompetition')?.value);
    $('dashboardHeading').textContent = admin ? 'Manage leagues and tournaments' : 'Available leagues and tournaments';
    $('createCompetition').classList.toggle('hidden', !admin);
    $('bowlerLeagues').classList.toggle('hidden',admin);
    $('usersAccess').classList.toggle('hidden',!superAdmin);
    $('accountEmail').textContent = user.email;
    const sessions=await Promise.all(rows.map(c=>api('/sessions?competition_id='+encodeURIComponent(c.id))));
    $('competitionCards').innerHTML = rows.map((c,i) =>
      '<article class="card competition-card" data-competition-search="'+esc([c.name,c.manager_name,c.manager_email,c.country,c.region,c.city,c.bowling_center].filter(Boolean).join(' ').toLowerCase())+'"><h3>' + esc(c.name||'Unnamed competition') + '</h3><p>' + esc(c.kind) +
      ' · ' + esc(c.status) + '</p><button data-open="' + esc(c.id) + '">' +
      (c.can_manage ? 'Manage current session' : 'View current session') + '</button>'+(c.can_manage?'<button type="button" class="secondary" data-linked-accounts="'+esc(c.id)+'">Manage Bowler Linked Accounts</button><button type="button" class="secondary" data-roster="'+esc(c.id)+'">Permanent roster</button><button type="button" class="secondary" data-edit-competition="'+esc(c.id)+'">Edit details</button>':'<button type="button" class="danger" data-remove-league="'+esc(c.id)+'">Remove from my dashboard</button>')+((superAdmin||c.owner_user_id===user.id)?'<button type="button" class="danger" data-delete-competition="'+esc(c.id)+'" data-competition-name="'+esc(c.name||'Unnamed competition')+'">Delete league/tournament</button>':'')+'<div class="session-list"><strong>Saved sessions · '+new Date().getFullYear()+'</strong>'+
      (sessions[i].length?sessions[i].map(x=>'<div class="session-row"><span>'+esc(x.label)+'<br><small>'+esc(String(x.session_date).slice(0,10))+'</small></span><button class="secondary" data-session="'+esc(x.id)+'">View</button></div>').join(''):'<p class="hint">No saved sessions yet.</p>')+
      '<button type="button" class="secondary" data-previous="'+esc(c.id)+'">View previous years</button><div data-previous-list="'+esc(c.id)+'"></div></div></article>'
    ).join('') || '<p>No competitions are available yet.</p>';
    if(superAdmin)await loadUsers();
    show('portalDashboard');
    if(!admin)await searchDirectory();
    localize();
  }
  function profileForName(name){return permanentRoster.find(p=>p.active&&p.name.localeCompare(name,undefined,{sensitivity:'base'})===0)||null;}
  async function loadPermanentRoster(competitionId){permanentRoster=await api('/roster?competition_id='+encodeURIComponent(competitionId));$('leagueRosterNames').innerHTML=permanentRoster.filter(p=>p.active).map(p=>'<option value="'+esc(p.name)+'"></option>').join('');return permanentRoster;}
  async function openRosterManager(competitionId){rosterCompetition=competitions.find(c=>c.id===competitionId);await loadPermanentRoster(competitionId);const imports=await api('/roster/imports?competition_id='+encodeURIComponent(competitionId));$('rosterManagerTitle').textContent='Permanent roster — '+rosterCompetition.name;$('permanentRosterTable').innerHTML='<div class="table-wrap"><table><thead><tr><th>Player ID</th><th>Name</th><th>Email</th><th>Handicap</th><th>Status</th><th>Account link</th></tr></thead><tbody>'+permanentRoster.map(p=>'<tr><td>'+esc(p.membership_number||p.id)+'</td><td>'+esc(p.name)+'</td><td>'+esc(p.email||'')+'</td><td>'+esc(p.handicap)+'</td><td>'+(p.active?'Active':'Inactive')+'</td><td>'+(p.claimed_user_id?'Linked <button class="secondary" data-reset-profile="'+esc(p.id)+'">Reset</button>':'Not linked')+'</td></tr>').join('')+'</tbody></table></div>'+(imports.length?'<h3>Import history</h3><ul>'+imports.map(x=>'<li>'+esc(x.file_name||'Roster import')+' · '+esc(String(x.created_at).slice(0,10))+(x.undone_at?' · Undone':'')+'</li>').join('')+'</ul>':'<p class="hint">No roster imports yet.</p>');$('rosterManager').classList.remove('hidden');$('rosterManager').scrollIntoView({behavior:'smooth'});}
  async function openLinkedAccounts(competitionId){
    rosterCompetition=competitions.find(c=>c.id===competitionId);
    const data=await api('/roster/links?competition_id='+encodeURIComponent(competitionId));
    $('linkedAccountsTitle').textContent='Manage Bowler Linked Accounts — '+rosterCompetition.name;
    $('linkedAccountEmails').innerHTML=data.registeredEmails.map(email=>'<option value="'+esc(email)+'"></option>').join('');
    $('linkedAccountsTable').innerHTML='<div class="table-wrap"><table><thead><tr><th>Bowler</th><th>Player ID</th><th>Roster email</th><th>Linked login email</th><th>Actions</th></tr></thead><tbody>'+data.profiles.map(p=>'<tr><td><strong>'+esc(p.name)+'</strong>'+(p.active?'':'<br><small>Inactive</small>')+'</td><td>'+esc(p.membership_number||'—')+'</td><td>'+esc(p.roster_email||'—')+'</td><td><input type="email" list="linkedAccountEmails" value="'+esc(p.linked_email||'')+'" data-link-email="'+esc(p.id)+'" placeholder="Registered email"></td><td><button type="button" data-save-link="'+esc(p.id)+'">Save link</button> <button type="button" class="danger" data-unlink="'+esc(p.id)+'" '+(p.linked_email?'':'disabled')+'>Unlink</button></td></tr>').join('')+'</tbody></table></div>';
    $('linkedAccountsManager').classList.remove('hidden');$('linkedAccountsManager').scrollIntoView({behavior:'smooth'});localize();
  }
  async function searchDirectory(){const q=$('leagueDirectorySearch').value.trim(),rows=await api('/directory?q='+encodeURIComponent(q));const mine=new Set(competitions.map(c=>c.id));$('leagueDirectoryResults').innerHTML=rows.map(c=>'<article class="card"><strong>'+esc(c.name)+'</strong><p>'+[c.bowling_center,c.city,c.region,c.country].filter(Boolean).map(esc).join(' · ')+'</p><button type="button" data-add-league="'+esc(c.id)+'" '+(mine.has(c.id)?'disabled':'')+'>'+(mine.has(c.id)?'Added':'Add to my dashboard')+'</button></article>').join('')||'<p>No matching leagues.</p>';}
  async function loadUsers() {
    if(!superAdmin)return;
    accessUsers=await api('/users');
    $('userEmailOptions').innerHTML=accessUsers.map(account=>'<option value="'+esc(account.email)+'"></option>').join('');
    $('userEmailSearch').value='';$('userSearchResults').innerHTML='';
    $('userAccessRows').innerHTML=accessUsers.length?'<p class="hint">Search for and select a registered user.</p>':'<p>No users found.</p>';
    localize();
  }
  function renderAccessUser(account) {
    if(!account){$('userAccessRows').innerHTML='<p class="hint">Search for and select a registered user.</p>';localize();return;}
    const isOwner=account.role==='superadmin',assigned=new Set(account.competition_ids||[]);
    const options=isOwner?'<option>Admin</option>':'<option value="user"'+(account.role==='user'?' selected':'')+'>User</option><option value="manager"'+(account.role==='manager'?' selected':'')+'>Manager</option>';
    const leagues=isOwner?'<span class="hint">All competitions</span>':competitions.map(c=>'<label><input type="checkbox" data-assignment="'+esc(c.id)+'" '+(assigned.has(c.id)?'checked':'')+(account.role==='manager'?'':' disabled')+'> '+esc(c.name)+'</label>').join('');
    $('userAccessRows').innerHTML='<div class="access-user card" data-user="'+esc(account.id)+'"><strong class="access-email">'+esc(account.email)+'</strong><label>Account type<select data-user-role '+(isOwner?'disabled':'')+'>'+options+'</select></label><div><strong>Managed competitions</strong><div class="league-checks">'+leagues+'</div></div>'+(isOwner?'':'<button type="button" data-save-access>Save access</button>')+'</div>';
    localize();
  }
  function searchAccessUsers() {
    const query=$('userEmailSearch').value.trim().toLowerCase(),exact=accessUsers.find(account=>account.email===query);
    if(exact){$('userSearchResults').innerHTML='';renderAccessUser(exact);return;}
    const matches=query?accessUsers.filter(account=>account.email.includes(query)).slice(0,12):[];
    $('userSearchResults').innerHTML=matches.map(account=>'<button type="button" class="secondary" data-pick-user="'+esc(account.id)+'">'+esc(account.email)+'</button>').join('');
    renderAccessUser(null);
  }
  async function identify(signedInUser, selected) {
    user = signedInUser || null;
    if (user && !user.emailVerified) {
      verificationEmail = user.email;
      $('verifyForm').classList.remove('hidden');
      await client.auth.signOut();
      user = null;
      notice('Verify your email before signing in.');
    }
    if(user){const account=await api('/me');role=account.role||'user';}else role='user';
    superAdmin=role==='superadmin';admin=superAdmin||role==='manager';
    sessionExpired = false;
    if (user?.email) lastEmail = user.email;
    updateAuthButton();
    if (!user) {
      const rows = await listCompetitions();
      renderCompetitionOptions(rows.filter(c => c.status === 'open'), selected);
      show('portalAuth');
      return;
    }
    notice('');
    if (reauth && current) {
      reauth = false;
      if (admin&&current?.can_manage) {
        show('managerApp');
        notice('Signed in again. Your competition information was preserved.');
        if (saveJob && !saving) void drainSaves();
      } else await openCompetition(current.id);
      return;
    }
    if (selected && !admin) await openCompetition(selected);
    else await refreshDashboard();
  }
  async function openCompetition(id) {
    const rows = await listCompetitions();
    const competition = rows.find(c => c.id === id);
    if (!competition) throw new Error('Competition is not available.');
    if (competition.format==='delarosa'||competition.name.trim().toLocaleLowerCase() === 'de la rosa masters') {
      // Finish any pending auth refresh before navigating so the tournament page
      // can reuse this session without presenting a second sign-in form.
      if(user){
        const handoffToken=await activeToken();
        sessionStorage.setItem('dlr-auth-handoff',JSON.stringify({token:handoffToken,user,createdAt:Date.now()}));
      }
      location.href = '/DeLaRosaMasters/?competition='+encodeURIComponent(competition.id);
      return;
    }
    current = competition;
    $('currentCompetition').textContent = competition.name;
    $('viewerCompetition').textContent = competition.name;
    $('printSavedSession').classList.add('hidden');
    if (competition.can_manage) {
      await loadPermanentRoster(id);
      const state = await api('/state?id=' + encodeURIComponent(id));
      window.BowlingApp.setState(state?.bowlers ? state : window.BowlingApp.fresh());
      show('managerApp');
      notice('Editing ' + competition.name + '. Changes save to Neon.');
      return;
    }
    const result = await api('/results?id=' + encodeURIComponent(id));
    renderViewer(result.results, result.personal,{});
    show('portalViewer');
  }
  function renderViewer(data, personal, context={}) {
    if (!data?.bowlers) {
      $('viewerContent').innerHTML = '<p>Results have not been published for this competition yet.</p>';
      localize();
      return;
    }
    const people = Object.fromEntries(data.bowlers.map(b => [b.id,b]));
    const canViewSummary=!!(user&&!sessionExpired&&admin&&current?.can_manage);
    const summary=data.summary||{handicapBrackets:data.brackets?.hdcp?.length||0,scratchBrackets:data.brackets?.scratch?.length||0,highGameEntries:data.bowlers.filter(b=>b.high).length,doublesTeams:(data.pairs||[]).length,totalIncome:0,totalPayout:(data.awards||[]).reduce((n,a)=>n+Number(a.amount||0),0),totalProfit:0};
    const summaryCard=canViewSummary?'<div class="card"><h2>Competition Summary</h2><p class="hint">Overview of entries, payouts and profit for this session.</p><div class="summary-grid">'+[['Handicap brackets played',summary.handicapBrackets],['Scratch brackets played',summary.scratchBrackets],['High Game entries',summary.highGameEntries],['Doubles teams played',summary.doublesTeams],['Total income',dollars(summary.totalIncome)],['Total payout',dollars(summary.totalPayout)],['Total profit',dollars(summary.totalProfit)]].map(([label,value],index)=>'<div class="summary-metric '+(index===6?'profit':'')+'"><span>'+esc(label)+'</span><strong class="'+(index===6?(summary.totalProfit<0?'balance-negative':summary.totalProfit>0?'balance-positive':'balance-zero'):'')+'">'+value+'</strong></div>').join('')+'</div></div>':'';
    const selected=people[personal?.id];
    const visibleBowlers=canViewSummary?data.bowlers:selected?[selected]:[];
    const visibleAwards=canViewSummary?(data.awards||[]):(personal?.winnings||[]);
    const score = (b,g) => b.scores?.['g'+g] == null ? '—' : esc(Number(b.scores['g'+g]) + Number(b.handicap || 0));
    const scoreboard = '<div class="card"><h2>Scores with handicap</h2><div class="table-wrap"><table><thead><tr><th>Bowler</th><th>Game 1</th><th>Game 2</th><th>Game 3</th></tr></thead><tbody>' +
      visibleBowlers.map(b => '<tr><td>' + esc(b.name) + '</td>' + [1,2,3].map(g => '<td>' + score(b,g) + '</td>').join('') + '</tr>').join('') +
      '</tbody></table></div></div>';
    const payoutTotals=Object.values(visibleAwards.reduce((totals,award)=>{
      const key=award.name||'Bowler';
      totals[key]??={name:key,amount:0};totals[key].amount+=Number(award.amount||0);return totals;
    },{})).sort((a,b)=>a.name.localeCompare(b.name));
    const awards = '<div class="card"><h2>Payout summary</h2>' + (payoutTotals.length
      ? '<div class="table-wrap"><table><thead><tr><th>Bowler</th><th class="money">Total winnings</th></tr></thead><tbody>'+
        payoutTotals.map(a => '<tr><td>' + esc(a.name) + '</td><td class="money balance-positive">' + dollars(a.amount) + '</td></tr>').join('') + '</tbody></table></div>'
      : '<p>Results are pending.</p>') + '</div>';
    const pairs = '<div class="card"><h2>Doubles teams</h2><ul>' + (data.pairs || []).filter(ids=>canViewSummary||ids.includes(selected?.id)).map(ids =>
      '<li>' + ids.map(id => esc(people[id]?.name || 'Bowler')).join(' &amp; ') + '</li>').join('') + '</ul></div>';
    const bracketCards = bowlerId => ['hdcp','scratch'].map(type => {
      const entries=(data.brackets?.[type]||[]).map((ids,index)=>({ids,index}))
        .filter(entry=>canViewSummary||!!bowlerId&&entry.ids.includes(bowlerId));
      return '<div class="card"><h2>'+(type==='hdcp'?'Handicap':'Scratch')+' brackets</h2>'+
        (entries.length?entries.map(entry=>'<div class="bracket-scroll">'+
          window.BowlingApp.bracketGraphic(entry.ids,type,data.bowlers,entry.index)+'</div>').join(''):
          '<p class="hint">'+(bowlerId?'This bowler is not entered in any '+(type==='hdcp'?'handicap':'scratch')+' brackets.':'No brackets generated.')+'</p>')+'</div>';
    }).join('');
    const financeCard=value=>{
      if(!value)return '<div id="balanceCard" class="card"><h2>Your balance</h2><p>Select your bowler above and choose Show my balance.</p></div>';
      const personal=value;
      const charges = personal.charges?.map(x => '<li>' + esc(x.label) + ': ' + dollars(x.amount) + '</li>').join('') || '<li>No charges</li>';
      const winnings = personal.winnings?.map(x => '<li>' + esc(x.description) + ': ' + dollars(x.amount) + '</li>').join('') || '<li>No winnings</li>';
      const settlement=personal.settlement??(personal.won-(personal.paid?0:personal.due));
      const balanceClass = settlement < 0 ? 'balance-negative' : settlement > 0 ? 'balance-positive' : 'balance-zero';
      return '<div id="balanceCard" class="card"><h2>Your balance — ' + esc(personal.name) + '</h2><h3>Entry charges</h3><ul>' + charges + '</ul><p><strong>Total charges: ' + dollars(personal.due) + '</strong> · Paid: '+(personal.paid?'Yes':'No')+' · Outstanding: '+dollars(personal.outstanding??(personal.paid?0:personal.due))+'</p><h3>Winnings</h3><ul>' + winnings + '</ul><p><strong>Total won: ' + dollars(personal.won) + '</strong></p><p class="' + balanceClass + '"><strong>Current balance: ' + dollars(settlement) + '</strong></p></div>';
    };
    let finances=financeCard(personal);
    const progress=(data.matchups||[]).map(round=>round.filter(x=>canViewSummary||x.id===selected?.id)).map((round,i)=>'<div class="card"><h2>Game '+(i+1)+' matchups</h2>'+
      (round.length?'<ul class="matchup-list">'+round.map(x=>'<li><strong>'+esc(x.name)+' ('+x.opponents.length+')</strong>: '+x.opponents.map(esc).join(', ')+'</li>').join('')+'</ul>':'<p class="hint">Matchups will appear when the previous game is decided.</p>')+
      ((data.standings?.[i]||[]).filter(x=>canViewSummary||x.name===selected?.name).length?'<h3>Standings after game '+(i+1)+'</h3><ol>'+data.standings[i].filter(x=>canViewSummary||x.name===selected?.name).map(x=>'<li>'+esc(x.name)+' — '+esc(x.score)+'</li>').join('')+'</ol>':'')+'</div>').join('');
    const notify='<div class="card no-print"><h2>Your bowler and notifications</h2><p>Choose your bowler once for this league. Confirming links this account until a Manager resets it. Notifications are optional.</p><div class="form-grid"><label>Bowler<select id="notifyBowler"'+(personal?' disabled':'')+'>'+data.bowlers.slice().sort((a,b)=>a.name.localeCompare(b.name)).map(b=>'<option value="'+esc(b.id)+'"'+(b.id===(personal?.id||context.selectedId)?' selected':'')+'>'+esc(b.name)+'</option>').join('')+'</select></label><label>Event date<input id="notifyDate" type="date" value="'+esc(context.date||new Date().toLocaleDateString('en-CA'))+'"></label></div><div class="actions"><button id="showBalance" type="button">Show my balance</button><button id="enableNotifications" class="secondary" type="button">Enable notifications</button></div><p id="notifyStatus" class="hint"></p></div>';
    $('viewerContent').innerHTML = (canViewSummary?'<nav class="tabs viewer-tabs no-print"><button type="button" data-viewer-tab="results" class="active">Results</button><button type="button" data-viewer-tab="summary">Summary</button></nav><section class="viewer-tab-panel" data-viewer-panel="summary">'+summaryCard+'</section>':'')+'<section class="viewer-tab-panel active" data-viewer-panel="results">' + notify + finances + ((selected||canViewSummary)?progress + scoreboard + '<div id="userBrackets">'+bracketCards(personal?.id)+'</div>' + pairs + awards:'') + '</section>';
    document.querySelectorAll('[data-viewer-tab]').forEach(button=>button.addEventListener('click',()=>{document.querySelectorAll('[data-viewer-tab]').forEach(x=>x.classList.toggle('active',x===button));document.querySelectorAll('[data-viewer-panel]').forEach(x=>x.classList.toggle('active',x.dataset.viewerPanel===button.dataset.viewerTab));}));
    $('notifyBowler')?.addEventListener('change',()=>{if(!canViewSummary)renderViewer(data,null,{...context,selectedId:$('notifyBowler').value,date:$('notifyDate').value});});
    $('showBalance')?.addEventListener('click',async()=>{
      try {
        const selectedBowler=data.bowlers.find(b=>b.id===$('notifyBowler').value),profiles=await api('/roster?competition_id='+encodeURIComponent(current?.id)),profile=profiles.find(p=>p.id===selectedBowler?.id||String(p.email||'').toLowerCase()===String(selectedBowler?.email||'').toLowerCase()||p.name.localeCompare(selectedBowler?.name||'',undefined,{sensitivity:'base'})===0);
        if(profile&&!personal){if(!confirm('Confirm that you are '+selectedBowler.name+'. This profile can only be changed by a Manager.'))return;await api('/roster/claim','POST',{competitionId:current.id,profileId:profile.id,confirm:true});}
        const linked=await api('/balance','POST',{competitionId:current?.id,bowlerId:$('notifyBowler').value,sessionId:context.sessionId});
        renderViewer(data,linked.personal,{...context,date:$('notifyDate').value});
        $('notifyStatus').textContent='Balance linked to '+$('notifyBowler').selectedOptions[0].textContent+'. Notifications remain off.';localize();
      } catch(error){$('notifyStatus').textContent=error.message;localize();}
    });
    $('enableNotifications')?.addEventListener('click',async()=>{
      try {
        if(!('serviceWorker' in navigator)||!('PushManager' in window)||!cfg.vapidPublicKey) throw new Error('Notifications are not available on this device yet.');
        if(await Notification.requestPermission()!=='granted') throw new Error('Notification permission was not granted.');
        const registration=await navigator.serviceWorker.ready;
        const key=Uint8Array.from(atob(cfg.vapidPublicKey.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
        const subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
        const linked=await api('/notifications','POST',{competitionId:current?.id,bowlerId:$('notifyBowler').value,eventDate:$('notifyDate').value,sessionId:context.sessionId,subscription});
        if(linked.personal)renderViewer(data,linked.personal,{...context,date:$('notifyDate').value});
        $('notifyStatus').textContent='Notifications enabled for '+$('notifyBowler').selectedOptions[0].textContent+' on '+$('notifyDate').value+'.';
        localize();
      } catch(error){$('notifyStatus').textContent=error.message;localize();}
    });
    localize();
  }
  async function openSavedSession(id) {
    const result=await api('/session?id='+encodeURIComponent(id));
    const rows=await listCompetitions(), competition=rows.find(c=>c.id===result.competitionId);
    current=competition||{id:result.competitionId,name:'Competition'};
    $('viewerCompetition').textContent=(competition?.name||'Competition')+' › '+result.label;
    renderViewer(result.results,result.personal,{sessionId:result.id,date:String(result.date).slice(0,10)});
    $('printSavedSession').classList.toggle('hidden',!(admin&&competition?.can_manage));
    show('portalViewer');
  }
  async function printSavedSession() {
    if(!(admin&&current?.can_manage))throw new Error('Manager access required.');
    const sheet=$('sessionPrintSheet'),source=$('viewerContent'),copy=source.cloneNode(true);
    copy.removeAttribute('id');copy.className='session-print-content';
    copy.querySelectorAll('.no-print,#balanceCard,button,input,select').forEach(element=>element.remove());
    copy.querySelectorAll('[id]').forEach(element=>element.removeAttribute('id'));
    const translate=value=>window.BowlingApp?.translateText(value)||value;
    const printed=new Intl.DateTimeFormat(window.BowlingApp?.language()==='es'?'es-MX':'en-US',{dateStyle:'medium',timeStyle:'short'}).format(new Date());
    sheet.innerHTML='<div class="print-brand"><img class="print-badge" src="assets/app-icon.svg" alt="ProDrillOS championship badge"><img class="print-main-logo" src="assets/brackets-logo.png?v=20260922" alt="Brackets by ProDrillOS"><div class="print-title"><h1>'+esc(translate('Saved Session Report'))+'</h1><p><strong>'+esc($('viewerCompetition').textContent)+'</strong></p><p>'+esc(translate('Printed'))+': '+esc(printed)+'</p></div></div>';
    sheet.appendChild(copy);
    sheet.insertAdjacentHTML('beforeend','<footer class="print-footer">Brackets by ProDrillOS · brackets.prodrillos.com</footer>');
    await Promise.all([...sheet.querySelectorAll('img')].map(image=>image.complete?image.decode?.().catch(()=>{}):new Promise(resolve=>{image.addEventListener('load',resolve,{once:true});image.addEventListener('error',resolve,{once:true});})));
    if(document.fonts?.ready)await document.fonts.ready;
    const cleanup=()=>document.body.classList.remove('print-saved-session');
    document.body.classList.add('print-saved-session');
    window.addEventListener('afterprint',cleanup,{once:true});
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    window.print();
    setTimeout(cleanup,60000);
  }
  function queueSave(data) {
    if (!current || !admin) return;
    const snapshot = window.BowlingApp.snapshot();
    saveJob = {p_competition_id:current.id,p_state:structuredClone(data),p_results:snapshot.publicData,p_personal:snapshot.personal};
    if (!saving) void drainSaves();
  }
  async function drainSaves() {
    saving = true;
    while (saveJob) {
      const job = saveJob;
      saveJob = null;
      try { await api('/save?id=' + encodeURIComponent(job.p_competition_id),'POST',
        {state:job.p_state,results:job.p_results,personal:job.p_personal,eventDate:new Date().toLocaleDateString('en-CA')}); }
      catch (error) { saveJob = saveJob || job; notice('Save failed: ' + error.message + '. Your edits remain on this screen.'); break; }
      notice('Saved to Neon at ' + new Date().toLocaleTimeString());
    }
    saving = false;
  }
  async function flushSaves() {
    while(saving) await new Promise(resolve=>setTimeout(resolve,50));
    if(saveJob) await drainSaves();
    while(saving) await new Promise(resolve=>setTimeout(resolve,50));
    if(saveJob) throw new Error('Neon did not confirm the save.');
    return true;
  }
  async function saveConfiguration(config) {
    if(!current||!admin) throw new Error('Open a competition as administrator first.');
    const result=await api('/config?id='+encodeURIComponent(current.id),'POST',{config});
    notice('Payout configuration saved to Neon.');
    return result;
  }
  async function savePayment(bowlerId,paid) {
    if(!current||!admin) throw new Error('Open a competition as administrator first.');
    const result=await api('/payment?id='+encodeURIComponent(current.id),'POST',{bowlerId,paid});
    notice('Payment status saved to Neon.');return result;
  }
  async function createCompetition(event) {
    event.preventDefault();
    const name = $('competitionName').value.trim(), kind = $('competitionKind').value,format=$('competitionFormat').value;
    if (!name) return;
    const data = await api('/competitions','POST',{name,kind,format,managerName:$('competitionManagerName').value,country:$('competitionCountry').value,region:$('competitionRegion').value,city:$('competitionCity').value,bowlingCenter:$('competitionCenter').value});
    $('createCompetition').reset();
    await openCompetition(data.id);
  }
  async function deleteCompetition(button) {
    if(!admin)throw new Error('Manager access required');
    const name=button.dataset.competitionName||'Unnamed competition';
    const message='Permanently delete '+name+' and all of its sessions, bowlers, brackets, scores, payouts and manager assignments? This cannot be undone.';
    if(!confirm(window.BowlingApp?.translateText(message)||message))return;
    button.disabled=true;button.textContent='Deleting…';localize();
    try{await api('/competitions/delete','POST',{competitionId:button.dataset.deleteCompetition});if(current?.id===button.dataset.deleteCompetition)current=null;notice(name+' was deleted.');await refreshDashboard();}
    catch(error){button.disabled=false;button.textContent='Delete league/tournament';localize();throw error;}
  }
  async function saveUserAccess(container) {
    const userId=container.dataset.user,select=container.querySelector('[data-user-role]'),newRole=select.value;
    await api('/users/role','POST',{userId,role:newRole});
    const competitionIds=newRole==='manager'?[...container.querySelectorAll('[data-assignment]:checked')].map(input=>input.dataset.assignment):[];
    await api('/users/assignments','POST',{userId,competitionIds});
    notice('User access saved.');await loadUsers();
  }
  async function saveSession() {
    if (!admin) throw new Error('Manager access required.');
    const label=$('sessionLabel').value.trim(),date=$('sessionDate').value;
    if(!label||!date) throw new Error('Enter a session name and date before saving.');
    // Trigger a normal JSON download while the button click still has browser
    // permission. File picker APIs lose permission after the network awaits below.
    await window.BowlingApp.exportBackup(true);
    await flushSaves();
    const state=window.BowlingApp.getState(),snapshot=window.BowlingApp.snapshot();
    await api('/sessions','POST',{competitionId:current.id,label,date,state,results:snapshot.publicData,personal:snapshot.personal});
    notice(label+' was saved. The current session remains open.');return {saved:true};
  }
  async function startFresh() {
    if(!admin)throw new Error('Manager access required.');
    await flushSaves();
    const previous=window.BowlingApp.getState(),blank=window.BowlingApp.fresh();
    blank.config={...previous.config};blank.language=previous.language;
    try {
      window.BowlingApp.setState(blank);queueSave(blank);await flushSaves();
    } catch(error) { window.BowlingApp.setState(previous);throw error; }
    $('sessionLabel').value='';$('sessionDate').value=new Date().toLocaleDateString('en-CA');
    document.querySelector('[data-tab="registration"]').click();
    notice('A new blank session is ready.');return {started:true};
  }
  window.MonsterPortal = {persist:queueSave,saveSession,startFresh,flush:flushSaves,saveConfiguration,savePayment,profileForName};

  async function boot() {
    if (!cfg.url || !cfg.apiUrl) {
      show('portalAuth');
      notice('Site setup is incomplete. The Neon project URL must be configured.');
      $('loginForm').querySelector('button[type=submit]').disabled = true;
      return;
    }
    client = newClient();
    $('sessionDate').value=new Date().toLocaleDateString('en-CA');
    if('serviceWorker' in navigator) await navigator.serviceWorker.register('/sw.js');
    let installPrompt=null;
    window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;$('installCard').classList.remove('hidden');});
    $('installApp').addEventListener('click',async()=>{if(!installPrompt)return;await installPrompt.prompt();installPrompt=null;$('installCard').classList.add('hidden');});
    $('loginForm').addEventListener('submit',async event => {
      event.preventDefault();
      try {
        const email = $('loginEmail').value.trim().toLowerCase(), password = $('loginPassword').value;
        await resetExpiredSession();
        let {data,error} = await client.auth.signIn.email({email,password});
        if (error && /expired|session/i.test(error.message || String(error))) {
          needsSessionReset = true;
          await resetExpiredSession();
          ({data,error} = await client.auth.signIn.email({email,password}));
        }
        if (error) throw error;
        needsSessionReset = false;
        $('loginPassword').value = '';
        user = data.user;
        await activeToken();
        const requestedType=localStorage.getItem('pending-account-type');
        if(requestedType){await api('/account/setup','POST',{accountType:requestedType});localStorage.removeItem('pending-account-type');}
        await identify(data.user);
      } catch (error) { fail(error); }
    });
    const showForgotPassword=showForm=>{
      $('forgotPasswordForm').classList.toggle('hidden',!showForm);
      $('loginForm').classList.toggle('hidden',showForm);
      $('authChoices').classList.toggle('hidden',showForm);
      $('registerForm').classList.add('hidden');
      $('verifyForm').classList.add('hidden');
      if(showForm){$('forgotPasswordEmail').value=$('loginEmail').value.trim()||lastEmail;$('forgotPasswordEmail').focus();}
      localize();
    };
    $('showForgotPassword').addEventListener('click',()=>showForgotPassword(true));
    $('cancelForgotPassword').addEventListener('click',()=>showForgotPassword(false));
    $('forgotPasswordForm').addEventListener('submit',async event=>{
      event.preventDefault();
      try {
        const email=$('forgotPasswordEmail').value.trim().toLowerCase();
        const {error}=await client.auth.requestPasswordReset({email,redirectTo:location.origin+location.pathname});
        if(error)throw error;
        notice('If an account exists for that email, a password reset link has been sent.');
      } catch(error){fail(error);}
    });
    $('resetPasswordForm').addEventListener('submit',async event=>{
      event.preventDefault();
      try {
        const password=$('resetPassword').value,confirmation=$('confirmResetPassword').value;
        if(password!==confirmation)throw new Error('The passwords do not match.');
        const token=new URLSearchParams(location.search).get('token');
        if(!token)throw new Error('This password reset link is invalid or has expired.');
        const {error}=await client.auth.resetPassword({newPassword:password,token});
        if(error)throw error;
        $('resetPassword').value='';$('confirmResetPassword').value='';
        history.replaceState({},'',location.pathname);
        $('resetPasswordForm').classList.add('hidden');$('loginForm').classList.remove('hidden');$('authChoices').classList.remove('hidden');
        notice('Password updated. You can now sign in.');$('loginEmail').focus();
      } catch(error){fail(error);}
    });
    $('registerForm').addEventListener('submit',async event => {
      event.preventDefault();
      try {
        const email = $('registerEmail').value.trim().toLowerCase();
        localStorage.setItem('pending-account-type',new FormData(event.currentTarget).get('accountType')||'user');
        const {data,error} = await client.auth.signUp.email({email,password:$('registerPassword').value,
          name:email.split('@')[0] || 'Bowler'});
        if (error) throw error;
        $('registerPassword').value = '';
        verificationEmail = email;
        if (!data?.user?.emailVerified) $('verifyForm').classList.remove('hidden');
        notice('Check your email for a verification code, then enter it below.');
      } catch (error) { fail(error); }
    });
    $('verifyForm').addEventListener('submit',async event => {
      event.preventDefault();
      try {
        const {error} = await client.auth.emailOtp.verifyEmail({email:verificationEmail,otp:$('verificationCode').value.trim()});
        if (error) throw error;
        $('verificationCode').value = '';
        $('verifyForm').classList.add('hidden');
        notice('Email confirmed. You can now sign in.');
      } catch (error) { fail(error); }
    });
    $('resendVerification').addEventListener('click',async () => {
      try {
        const {error} = await client.auth.sendVerificationEmail({email:verificationEmail,callbackURL:location.origin+location.pathname});
        if (error) throw error;
        notice('A new verification code has been sent.');
      } catch (error) { fail(error); }
    });
    $('showRegister').addEventListener('click',() => $('registerForm').classList.toggle('hidden'));
    $('portalLogin').addEventListener('click',async () => {
      if (user && !sessionExpired) {
        await client.auth.signOut();
        sessionStorage.removeItem('dlr-auth-handoff');
        user = null; role='user';admin = false;superAdmin=false; current = null; reauth = false; sessionExpired = false;
        updateAuthButton();
        await identify(null);
        notice('You are logged out.');
        return;
      }
      const email = user?.email || lastEmail;
      reauth = !!current;
      user = null;
      role='user';
      admin = false;
      superAdmin=false;
      sessionExpired = false;
      updateAuthButton();
      $('loginEmail').value = email;
      await identify(null,current?.id);
      notice(current ? 'Log in again to continue. Your open competition and bracket information are preserved.' : 'Log in to continue.');
      $('loginPassword').focus();
    });
    $('backDashboard').addEventListener('click',() => void refreshDashboard().catch(fail));
    $('viewerBack').addEventListener('click',() => void refreshDashboard().catch(fail));
    $('printSavedSession').addEventListener('click',()=>void printSavedSession().catch(fail));
    $('competitionCards').addEventListener('click',event => {
      const remove=event.target.closest('[data-delete-competition]');
      if(remove){void deleteCompetition(remove).catch(fail);return;}
      const button = event.target.closest('[data-open]');
      if (button) void openCompetition(button.dataset.open).catch(fail);
      const roster=event.target.closest('[data-roster]');if(roster)void openRosterManager(roster.dataset.roster).catch(fail);
      const linked=event.target.closest('[data-linked-accounts]');if(linked)void openLinkedAccounts(linked.dataset.linkedAccounts).catch(fail);
      const editCompetition=event.target.closest('[data-edit-competition]');if(editCompetition)void (async()=>{const c=competitions.find(x=>x.id===editCompetition.dataset.editCompetition),name=prompt('Competition name',c.name);if(!name)return;const country=prompt('Country',c.country||'')??c.country,region=prompt('State / Region',c.region||'')??c.region,city=prompt('City',c.city||'')??c.city,bowlingCenter=prompt('Bowling center',c.bowling_center||'')??c.bowling_center;await api('/competitions/edit','POST',{competitionId:c.id,name,kind:c.kind,country,region,city,bowlingCenter});await refreshDashboard();})().catch(fail);
      const removeLeague=event.target.closest('[data-remove-league]');if(removeLeague)void api('/memberships','DELETE',{competitionId:removeLeague.dataset.removeLeague}).then(refreshDashboard).catch(fail);
      const previous=event.target.closest('[data-previous]');if(previous)void (async()=>{const rows=await api('/sessions?competition_id='+encodeURIComponent(previous.dataset.previous)+'&all=1'),currentYear=new Date().getFullYear(),older=rows.filter(x=>Number(String(x.session_date).slice(0,4))!==currentYear),groups=Object.groupBy?Object.groupBy(older,x=>String(x.session_date).slice(0,4)):older.reduce((o,x)=>((o[String(x.session_date).slice(0,4)]??=[]).push(x),o),{});document.querySelector('[data-previous-list="'+previous.dataset.previous+'"]').innerHTML=Object.entries(groups).sort((a,b)=>b[0]-a[0]).map(([year,list])=>'<h4>'+esc(year)+'</h4>'+list.map(x=>'<div class="session-row"><span>'+esc(x.label)+'<br><small>'+esc(String(x.session_date).slice(0,10))+(x.bracket_details_purged_at?' · Financial archive':'')+'</small></span><button class="secondary" data-session="'+esc(x.id)+'">View</button></div>').join('')).join('')||'<p class="hint">No previous years.</p>';})().catch(fail);
      const session = event.target.closest('[data-session]');
      if (session) void openSavedSession(session.dataset.session).catch(fail);
    });
    $('leagueDirectorySearch').addEventListener('input',()=>void searchDirectory().catch(fail));
    $('leagueDirectoryResults').addEventListener('click',event=>{const button=event.target.closest('[data-add-league]');if(!button)return;void api('/memberships','POST',{competitionId:button.dataset.addLeague}).then(refreshDashboard).catch(fail);});
    $('closeRosterManager').addEventListener('click',()=>$('rosterManager').classList.add('hidden'));
    $('closeLinkedAccounts').addEventListener('click',()=>$('linkedAccountsManager').classList.add('hidden'));
    $('linkedAccountsTable').addEventListener('click',event=>{const save=event.target.closest('[data-save-link]'),unlink=event.target.closest('[data-unlink]'),button=save||unlink;if(!button)return;const profileId=button.dataset.saveLink||button.dataset.unlink,input=document.querySelector('[data-link-email="'+CSS.escape(profileId)+'"]'),email=unlink?'':input.value.trim();button.disabled=true;void api('/roster/link-account','POST',{competitionId:rosterCompetition.id,profileId,email}).then(()=>{notice(email?'Bowler account link saved.':'Bowler account unlinked.');return openLinkedAccounts(rosterCompetition.id)}).catch(error=>{button.disabled=false;fail(error)});});
    $('permanentRosterTable').addEventListener('click',event=>{const button=event.target.closest('[data-reset-profile]');if(!button)return;void api('/roster/reset-claim','POST',{competitionId:rosterCompetition.id,profileId:button.dataset.resetProfile}).then(()=>openRosterManager(rosterCompetition.id)).catch(fail);});
    $('downloadRosterTemplate').addEventListener('click',()=>{if(!window.XLSX)return fail(new Error('Excel tools are still loading.'));const rows=[['Bowler First Name','Bowler Last Name','Handicap'],['Juan','Pérez',15]],sheet=XLSX.utils.aoa_to_sheet(rows),book=XLSX.utils.book_new();sheet['!cols']=[{wch:22},{wch:22},{wch:12}];XLSX.utils.book_append_sheet(book,sheet,'Roster');XLSX.writeFile(book,'BracketsByProDrillOS_Roster_Template.xlsx');});
    $('rosterUpload').addEventListener('change',event=>void (async()=>{const file=event.target.files[0];if(!file||!rosterCompetition)return;const book=XLSX.read(await file.arrayBuffer(),{type:'array'}),raw=XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]],{defval:''}),rows=raw.map(x=>({firstName:String(x['Bowler First Name']??'').trim(),lastName:String(x['Bowler Last Name']??'').trim(),handicap:x.Handicap??''}));pendingRosterPreview=await api('/roster/import-preview','POST',{competitionId:rosterCompetition.id,rows});const counts=pendingRosterPreview.preview.reduce((o,x)=>(o[x.status]=(o[x.status]||0)+1,o),{}),invalid=pendingRosterPreview.preview.filter(x=>x.status==='invalid');$('rosterImportPreview').innerHTML='<h3>Import preview</h3><p>'+Object.entries(counts).map(([k,v])=>esc(k)+': '+v).join(' · ')+'</p>'+(invalid.length?'<div class="notice"><strong>Fix these rows before importing:</strong><ul>'+invalid.map(x=>'<li>'+esc([x.firstName,x.lastName].filter(Boolean).join(' ')||'Blank row')+' — '+esc(x.reason)+'</li>').join('')+'</ul></div>':'<button id="applyRosterImport" type="button">Apply roster import</button>');event.target.dataset.fileName=file.name;})().catch(fail));
    $('rosterImportPreview').addEventListener('click',event=>{if(event.target.id!=='applyRosterImport'||!pendingRosterPreview)return;void api('/roster/import','POST',{competitionId:rosterCompetition.id,fileName:$('rosterUpload').dataset.fileName,rows:pendingRosterPreview.preview}).then(()=>{pendingRosterPreview=null;$('rosterImportPreview').innerHTML='<p>Roster import saved.</p>';return openRosterManager(rosterCompetition.id);}).catch(fail);});
    $('undoRosterImport').addEventListener('click',()=>{if(!rosterCompetition||!confirm('Undo the most recent roster import?'))return;void api('/roster/import-undo','POST',{competitionId:rosterCompetition.id}).then(()=>openRosterManager(rosterCompetition.id)).catch(fail);});
    $('name').addEventListener('change',()=>{const p=profileForName($('name').value);if(!p)return;$('membershipNumber').value=p.membership_number||'';$('bowlerEmail').value=p.email||'';$('handicap').value=p.handicap;});
    $('userAccessRows').addEventListener('change',event=>{
      const select=event.target.closest('[data-user-role]');if(!select)return;
      select.closest('[data-user]').querySelectorAll('[data-assignment]').forEach(input=>input.disabled=select.value!=='manager');
    });
    $('userAccessRows').addEventListener('click',event=>{const button=event.target.closest('[data-save-access]');if(button)void saveUserAccess(button.closest('[data-user]')).catch(fail);});
    $('userEmailSearch').addEventListener('input',searchAccessUsers);
    $('userEmailSearch').addEventListener('change',searchAccessUsers);
    $('userSearchResults').addEventListener('click',event=>{const button=event.target.closest('[data-pick-user]');if(!button)return;const account=accessUsers.find(item=>item.id===button.dataset.pickUser);if(!account)return;$('userEmailSearch').value=account.email;$('userSearchResults').innerHTML='';renderAccessUser(account);});
    $('adminCompetitionSearch').addEventListener('input',event=>{const q=event.target.value.trim().toLowerCase();document.querySelectorAll('[data-competition-search]').forEach(card=>card.classList.toggle('hidden',q&&!card.dataset.competitionSearch.includes(q)));});
    $('createCompetition').addEventListener('submit',event => void createCompetition(event).catch(fail));
    const resetParams=new URLSearchParams(location.search),resetToken=resetParams.get('token'),resetError=resetParams.get('error');
    if(resetToken||resetError){
      show('portalAuth');$('loginForm').classList.add('hidden');$('authChoices').classList.add('hidden');$('resetPasswordForm').classList.toggle('hidden',!resetToken);$('forgotPasswordForm').classList.toggle('hidden',!resetError);
      notice(resetError?'This password reset link is invalid or has expired. Request a new link.':'Choose a new password to finish resetting your account.');
      localize();return;
    }
    const {data,error} = await client.auth.getSession();
    if (error) throw error;
    await identify(data?.user);
  }
  boot().catch(error => {
    // Session restoration can fail before an API request is made. Always recover
    // to a usable login screen without replacing the in-memory competition.
    user = null;role='user';
    admin = false;superAdmin=false;
    sessionExpired = true;
    needsSessionReset = true;
    show('portalAuth');
    updateAuthButton();
    notice((error?.message || 'Session expired.') + ' Use Log in to continue.');
  });
})();

