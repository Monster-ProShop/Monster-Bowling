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
  let client, user, admin = false, current = null, saveJob = null, saving = false, verificationEmail = '', reauth = false, sessionExpired = false, lastEmail = '';
  const updateAuthButton = () => {
    $('portalLogin').textContent = user && !sessionExpired ? 'Log out' : 'Log in';
    $('portalLogin').classList.remove('hidden');
  };

  async function api(path, method = 'GET', body) {
    let token = null;
    if (user) {
      const result = await client.auth.token();
      if (result.error || !result.data?.token) {
        lastEmail = user.email || lastEmail;
        sessionExpired = true;
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
    $('competitionCards').innerHTML = rows.map(c =>
      '<article class="card competition-card"><h3>' + esc(c.name) + '</h3><p>' + esc(c.kind) +
      ' · ' + esc(c.status) + '</p><button data-open="' + esc(c.id) + '">' +
      (admin ? 'Manage competition' : 'View results') + '</button></article>'
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
    await api('/join?id=' + encodeURIComponent(id), 'POST', {});
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
    const awards = '<div class="card"><h2>Payouts</h2>' + (data.awards?.length
      ? '<ul>' + data.awards.map(a => '<li>' + esc(a.name) + ': ' + esc(a.description) + ' — ' + dollars(a.amount) + '</li>').join('') + '</ul>'
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
    $('viewerContent').innerHTML = finances + scoreboard + brackets + pairs + awards;
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
        {state:job.p_state,results:job.p_results,personal:job.p_personal}); }
      catch (error) { saveJob = saveJob || job; notice('Save failed: ' + error.message + '. Your edits remain on this screen.'); break; }
      notice('Saved to Neon at ' + new Date().toLocaleTimeString());
    }
    saving = false;
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
    await window.BowlingApp.exportBackup();
    await refreshDashboard();
    notice('Backup downloaded. Create another competition from the dashboard.');
  }
  window.MonsterPortal = {persist:queueSave,startNew};

  async function boot() {
    if (!cfg.url || !cfg.apiUrl) {
      show('portalAuth');
      notice('Site setup is incomplete. The Neon project URL must be configured.');
      $('loginForm').querySelector('button[type=submit]').disabled = true;
      return;
    }
    client = createClient(cfg.url,{auth:{fetchOptions:{credentials:'include'}}});
    $('loginForm').addEventListener('submit',async event => {
      event.preventDefault();
      try {
        const email = $('loginEmail').value.trim().toLowerCase(), password = $('loginPassword').value;
        const selected = $('loginCompetition').value;
        if (!selected && email !== 'monsterproshop@outlook.com') throw new Error('Choose a league or tournament.');
        const {data,error} = await client.auth.signIn.email({email,password});
        if (error) throw error;
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
    show('portalAuth');
    updateAuthButton();
    notice((error?.message || 'Session expired.') + ' Use Log in to continue.');
  });
})();
