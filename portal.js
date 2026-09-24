import { createClient } from 'https://esm.sh/@neondatabase/neon-js@0.7.0-beta?bundle';

(function () {
  const cfg = window.MONSTER_NEON || {};
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const dollars = cents => '$' + (Number(cents || 0) / 100).toFixed(2);
  const sections = ['portalAuth','portalDashboard','portalViewer','managerApp'];
  const show = id => sections.forEach(name => $(name).classList.toggle('hidden', name !== id));
  const notice = message => { $('portalNotice').textContent = message; };
  const fail = error => notice(error?.message || String(error));
  let client, user, admin = false, current = null, saveJob = null, saving = false, verificationEmail = '', reauth = false, sessionExpired = false, needsSessionReset = false, lastEmail = '';
  const updateAuthButton = () => {
    $('portalLogin').textContent = user && !sessionExpired ? 'Log out' : 'Log in';
    $('portalLogin').classList.remove('hidden');
  };
  const newClient = () => createClient(cfg.url,{auth:{fetchOptions:{credentials:'include',cache:'no-store'}}});
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

  async function api(path, method = 'GET', body) {
    let token = null;
    if (user) {
      const result = await client.auth.token();
      if (result.error || !result.data?.token) {
        lastEmail = user.email || lastEmail;
        sessionExpired = true;
        needsSessionReset = true;
        updateAuthButton();
        notice('Your session expired. Log in again to continue; the information on this screen is preserved.');
        throw result.error || new Error('Session expired. Sign in again.');
      }
      token = result.data.token;
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
    return data;
  }

  function renderCompetitionOptions(rows, selected) {
    const select = $('loginCompetition');
    select.innerHTML = '<option value="">Choose a league or tournament</option>' +
      rows.map(c => '<option value="' + esc(c.id) + '">' + esc(c.name) + ' (' + esc(c.kind) + ')</option>').join('');
    if (selected) select.value = selected;
  }
  async function listCompetitions() {
    return await api('/competitions');
  }
  async function refreshDashboard() {
    const rows = await listCompetitions();
    renderCompetitionOptions(rows.filter(c => c.status === 'open'), $('loginCompetition').value);
    $('dashboardHeading').textContent = admin ? 'Manage leagues and tournaments' : 'Available leagues and tournaments';
    $('createCompetition').classList.toggle('hidden', !admin);
    $('accountEmail').textContent = user.email;
    const sessions=await Promise.all(rows.map(c=>api('/sessions?competition_id='+encodeURIComponent(c.id))));
    $('competitionCards').innerHTML = rows.map((c,i) =>
      '<article class="card competition-card"><h3>' + esc(c.name) + '</h3><p>' + esc(c.kind) +
      ' · ' + esc(c.status) + '</p><button data-open="' + esc(c.id) + '">' +
      (admin ? 'Manage current session' : 'View current session') + '</button><div class="session-list"><strong>Saved sessions</strong>'+
      (sessions[i].length?sessions[i].map(x=>'<div class="session-row"><span>'+esc(x.label)+'<br><small>'+esc(String(x.session_date).slice(0,10))+'</small></span><button class="secondary" data-session="'+esc(x.id)+'">View</button></div>').join(''):'<p class="hint">No saved sessions yet.</p>')+
      '</div></article>'
    ).join('') || '<p>No competitions are available yet.</p>';
    show('portalDashboard');
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
    admin = !!(user && user.email?.toLowerCase() === 'monsterproshop@outlook.com' && user.emailVerified);
    sessionExpired = false;
    if (user?.email) lastEmail = user.email;
    updateAuthButton();
    if (!user) {
      const rows = await listCompetitions();
      renderCompetitionOptions(rows.filter(c => c.status === 'open'), selected);
      show('portalAuth');
      return;
    }
    if (reauth && current) {
      reauth = false;
      if (admin) {
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
    current = competition;
    $('currentCompetition').textContent = competition.name;
    $('viewerCompetition').textContent = competition.name;
    if (admin) {
      const state = await api('/state?id=' + encodeURIComponent(id));
      window.BowlingApp.setState(state?.bowlers ? state : window.BowlingApp.fresh());
      show('managerApp');
      notice('Editing ' + competition.name + '. Changes save to Neon.');
      return;
    }
    const result = await api('/results?id=' + encodeURIComponent(id));
    renderViewer(result.results, result.personal);
    show('portalViewer');
  }
  function renderViewer(data, personal) {
    if (!data?.bowlers) {
      $('viewerContent').innerHTML = '<p>Results have not been published for this competition yet.</p>';
      return;
    }
    const people = Object.fromEntries(data.bowlers.map(b => [b.id,b]));
    const score = (b,g) => b.scores?.['g'+g] == null ? '—' : esc(Number(b.scores['g'+g]) + Number(b.handicap || 0));
    const scoreboard = '<div class="card"><h2>Scores with handicap</h2><div class="table-wrap"><table><thead><tr><th>Bowler</th><th>Game 1</th><th>Game 2</th><th>Game 3</th></tr></thead><tbody>' +
      data.bowlers.map(b => '<tr><td>' + esc(b.name) + '</td>' + [1,2,3].map(g => '<td>' + score(b,g) + '</td>').join('') + '</tr>').join('') +
      '</tbody></table></div></div>';
    const payoutTotals=Object.values((data.awards||[]).reduce((totals,award)=>{
      const key=award.name||'Bowler';
      totals[key]??={name:key,amount:0};totals[key].amount+=Number(award.amount||0);return totals;
    },{})).sort((a,b)=>a.name.localeCompare(b.name));
    const awards = '<div class="card"><h2>Payout summary</h2>' + (payoutTotals.length
      ? '<div class="table-wrap"><table><thead><tr><th>Bowler</th><th class="money">Total winnings</th></tr></thead><tbody>'+
        payoutTotals.map(a => '<tr><td>' + esc(a.name) + '</td><td class="money balance-positive">' + dollars(a.amount) + '</td></tr>').join('') + '</tbody></table></div>'
      : '<p>Results are pending.</p>') + '</div>';
    const pairs = '<div class="card"><h2>Doubles teams</h2><ul>' + (data.pairs || []).map(ids =>
      '<li>' + ids.map(id => esc(people[id]?.name || 'Bowler')).join(' &amp; ') + '</li>').join('') + '</ul></div>';
    const brackets = ['hdcp','scratch'].map(type => '<div class="card"><h2>' + (type === 'hdcp' ? 'Handicap' : 'Scratch') + ' brackets</h2>' +
      (data.brackets?.[type] || []).map((ids,i) => '<div class="bracket-scroll">' +
        window.BowlingApp.bracketGraphic(ids,type,data.bowlers,i) + '</div>').join('') + '</div>').join('');
    let finances = '<div class="card"><h2>Your balance</h2><p>Your email has not been linked to a bowler in this competition yet.</p></div>';
    if (personal) {
      const charges = personal.charges?.map(x => '<li>' + esc(x.label) + ': ' + dollars(x.amount) + '</li>').join('') || '<li>No charges</li>';
      const winnings = personal.winnings?.map(x => '<li>' + esc(x.description) + ': ' + dollars(x.amount) + '</li>').join('') || '<li>No winnings</li>';
      const balanceClass = personal.net < 0 ? 'balance-negative' : personal.net > 0 ? 'balance-positive' : 'balance-zero';
      finances = '<div class="card"><h2>Your balance — ' + esc(personal.name) + '</h2><h3>Entry charges</h3><ul>' + charges + '</ul><p>Total due: ' + dollars(personal.due) + '</p><h3>Winnings</h3><ul>' + winnings + '</ul><p>Total won: ' + dollars(personal.won) + '</p><p class="' + balanceClass + '">Balance: ' + dollars(personal.net) + '</p></div>';
    }
    const progress=(data.matchups||[]).map((round,i)=>'<div class="card"><h2>Game '+(i+1)+' matchups</h2>'+
      (round.length?'<ul class="matchup-list">'+round.map(x=>'<li><strong>'+esc(x.name)+' ('+x.opponents.length+')</strong>: '+x.opponents.map(esc).join(', ')+'</li>').join('')+'</ul>':'<p class="hint">Matchups will appear when the previous game is decided.</p>')+
      ((data.standings?.[i]||[]).length?'<h3>Standings after game '+(i+1)+'</h3><ol>'+data.standings[i].map(x=>'<li>'+esc(x.name)+' — '+esc(x.score)+'</li>').join('')+'</ol>':'')+'</div>').join('');
    const notify='<div class="card no-print"><h2>Notifications for this event</h2><p>Choose the bowler whose updates you want for this bowling date.</p><div class="form-grid"><label>Bowler<select id="notifyBowler">'+data.bowlers.slice().sort((a,b)=>a.name.localeCompare(b.name)).map(b=>'<option value="'+esc(b.id)+'">'+esc(b.name)+'</option>').join('')+'</select></label><label>Event date<input id="notifyDate" type="date" value="'+new Date().toLocaleDateString('en-CA')+'"></label><button id="enableNotifications" type="button">Notify me</button></div><p id="notifyStatus" class="hint"></p></div>';
    $('viewerContent').innerHTML = notify + finances + progress + scoreboard + brackets + pairs + awards;
    $('enableNotifications')?.addEventListener('click',async()=>{
      try {
        if(!('serviceWorker' in navigator)||!('PushManager' in window)||!cfg.vapidPublicKey) throw new Error('Notifications are not available on this device yet.');
        if(await Notification.requestPermission()!=='granted') throw new Error('Notification permission was not granted.');
        const registration=await navigator.serviceWorker.ready;
        const key=Uint8Array.from(atob(cfg.vapidPublicKey.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
        const subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
        await api('/notifications','POST',{competitionId:current?.id,bowlerId:$('notifyBowler').value,eventDate:$('notifyDate').value,subscription});
        $('notifyStatus').textContent='Notifications enabled for '+$('notifyBowler').selectedOptions[0].textContent+' on '+$('notifyDate').value+'.';
      } catch(error){$('notifyStatus').textContent=error.message;}
    });
  }
  async function openSavedSession(id) {
    const result=await api('/session?id='+encodeURIComponent(id));
    const rows=await listCompetitions(), competition=rows.find(c=>c.id===result.competitionId);
    current=competition||{id:result.competitionId,name:'Competition'};
    $('viewerCompetition').textContent=(competition?.name||'Competition')+' › '+result.label;
    renderViewer(result.results,result.personal);show('portalViewer');
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
  async function createCompetition(event) {
    event.preventDefault();
    const name = $('competitionName').value.trim(), kind = $('competitionKind').value;
    if (!name) return;
    const data = await api('/competitions','POST',{name,kind});
    $('createCompetition').reset();
    await openCompetition(data.id);
  }
  async function startNew() {
    if (!admin) return;
    const label=$('sessionLabel').value.trim(),date=$('sessionDate').value;
    if(!label||!date) throw new Error('Enter a session name and date before saving.');
    await drainSaves();
    const state=window.BowlingApp.getState(),snapshot=window.BowlingApp.snapshot();
    await api('/sessions','POST',{competitionId:current.id,label,date,state,results:snapshot.publicData,personal:snapshot.personal});
    await window.BowlingApp.exportBackup();
    state.bowlers=state.bowlers.map(b=>({...b,scores:{g1:null,g2:null,g3:null},paid:false}));
    state.brackets={hdcp:[],scratch:[]};state.generated=false;state.highGenerated=false;
    window.BowlingApp.setState(state);queueSave(state);await drainSaves();
    $('sessionLabel').value='';notice(label+' was saved. The next session is ready with the roster preserved.');
  }
  window.MonsterPortal = {persist:queueSave,startNew,flush:flushSaves,saveConfiguration};

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
        const selected = $('loginCompetition').value;
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
        await identify(data.user,selected);
      } catch (error) { fail(error); }
    });
    $('registerForm').addEventListener('submit',async event => {
      event.preventDefault();
      try {
        const email = $('registerEmail').value.trim().toLowerCase();
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
        user = null; admin = false; current = null; reauth = false; sessionExpired = false;
        updateAuthButton();
        await identify(null);
        notice('You are logged out.');
        return;
      }
      const email = user?.email || lastEmail;
      reauth = !!current;
      user = null;
      admin = false;
      sessionExpired = false;
      updateAuthButton();
      $('loginEmail').value = email;
      await identify(null,current?.id);
      notice(current ? 'Log in again to continue. Your open competition and bracket information are preserved.' : 'Log in to continue.');
      $('loginPassword').focus();
    });
    $('backDashboard').addEventListener('click',() => void refreshDashboard().catch(fail));
    $('viewerBack').addEventListener('click',() => void refreshDashboard().catch(fail));
    $('competitionCards').addEventListener('click',event => {
      const button = event.target.closest('[data-open]');
      if (button) void openCompetition(button.dataset.open).catch(fail);
      const session = event.target.closest('[data-session]');
      if (session) void openSavedSession(session.dataset.session).catch(fail);
    });
    $('createCompetition').addEventListener('submit',event => void createCompetition(event).catch(fail));
    const {data,error} = await client.auth.getSession();
    if (error) throw error;
    await identify(data?.user);
  }
  boot().catch(error => {
    // Session restoration can fail before an API request is made. Always recover
    // to a usable login screen without replacing the in-memory competition.
    user = null;
    admin = false;
    sessionExpired = true;
    needsSessionReset = true;
    show('portalAuth');
    updateAuthButton();
    notice((error?.message || 'Session expired.') + ' Use Log in to continue.');
  });
})();
