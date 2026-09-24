const KEY = 'monster-bowling-v2';
const LANGUAGE_KEY = 'monster-bowling-language';
const DEFAULT_CONFIG = {hdcpBuyin:10,hdcpFirstAmount:250,hdcpSecondAmount:100,scratchBuyin:10,scratchFirstAmount:250,scratchSecondAmount:100,highBuyin:20,highPayoutAmount:250,pairsBuyin:20,pairsGamePayoutAmount:250,pairsSeriesPayoutAmount:250,pairsHighEnabled:true,pairsSeriesEnabled:true};
const CONFIG_IDS = Object.keys(DEFAULT_CONFIG);
const MONEY_IDS = CONFIG_IDS.filter(id=>id.endsWith('Buyin')||id.endsWith('Amount'));
const NUMBER_IDS = CONFIG_IDS.filter(id=>typeof DEFAULT_CONFIG[id]==='number');
const PERCENT_IDS = [];
const money = cents => '$' + (cents / 100).toFixed(2);
const cents = value => Math.round(Number(value) * 100);
const safe = value => String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const num = (value, fallback=0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const blankScores = () => ({g1:null,g2:null,g3:null});
const ES = {
  'Registration, brackets, scoring and payouts':'Registro, llaves, puntuación y premios',
  '/ MANAGER':'/ ADMINISTRADOR',
  'Registration & configuration':'Registro y configuración','Brackets':'Llaves','High Game':'Juego alto',
  'Doubles':'Parejas','Scoring':'Puntuación','Reports & payouts':'Reportes y premios',
  'Buy-ins and payouts':'Inscripciones y premios','Buy-ins are per bowler or bracket entry. All awards use the fixed payout amounts saved below.':'Los costos son por jugador o por entrada a una llave. Todos los premios usan las cantidades fijas guardadas abajo.',
  'Handicap bracket':'Llave con hándicap','Scratch bracket':'Llave scratch','Handicap High Game Pot':'Pozo de juego alto con hándicap',
  'Buy-in ($)':'Inscripción ($)','1st place (%)':'1.er lugar (%)','2nd place (%)':'2.º lugar (%)',
  'Winner payout (%)':'Premio al ganador (%)','Highest game plus handicap wins. Tied winners split the payout equally.':'Gana el juego más alto con hándicap. Si hay empate, se divide el premio.',
  'Buy-in per team entry, per bowler ($)':'Inscripción por equipo, por jugador ($)',
  'Pay highest combined game':'Premiar el juego combinado más alto','High Game payout (%)':'Premio de juego alto (%)',
  'Pay highest combined series':'Premiar la serie combinada más alta','Series payout (%)':'Premio de serie (%)',
  "Each partner's handicap is included in every game. You may pay either prize or both. Enabled payouts together cannot exceed 100% of Doubles buy-ins.":'Se suma el hándicap de ambos jugadores en cada juego. Puede premiar uno o ambos resultados. Los premios activos no pueden superar el 100% de las inscripciones de Parejas.',
  'Register a bowler':'Registrar jugador','Bracket numbers are the maximum each bowler is willing to play. Doubles charges depend on the teams added in the Doubles tab.':'Los números de llaves son el máximo que cada jugador desea jugar. El costo de Parejas depende de los equipos agregados en esa pestaña.',
  'Name':'Nombre','Handicap per game':'Hándicap por juego','Max handicap brackets':'Máximo de llaves con hándicap','Max scratch brackets':'Máximo de llaves scratch',
  'Handicap brackets':'Llaves con hándicap','Scratch brackets':'Llaves scratch','High Game Pot':'Pozo de juego alto',
  'Add bowler':'Agregar jugador','Save changes':'Guardar cambios','Cancel edit':'Cancelar edición','Roster':'Participantes',
  'Bowler':'Jugador','Handicap':'Hándicap','Max HDCP':'Máx. hándicap','Max scratch':'Máx. scratch','Doubles teams':'Equipos de Parejas',
  'Actions':'Acciones','Edit':'Editar','Remove':'Eliminar','Yes':'Sí','No':'No',
  "The draw maximizes eight-slot brackets within each bowler's limit. With seven entrants, each bracket has one first-round bye. Fewer than seven entrants cannot form a bracket. Unused willingness is not charged.":'El sorteo maximiza las llaves de ocho lugares sin superar el límite de cada jugador. Con siete participantes hay un pase libre por llave. Con menos de siete no se forma una llave. Los lugares no usados no se cobran.',
  'Generate brackets':'Generar llaves','Handicap brackets':'Llaves con hándicap','Scratch brackets':'Llaves scratch',
  'GAME 1':'JUEGO 1','GAME 2 · SEMIFINAL':'JUEGO 2 · SEMIFINAL','GAME 3 · FINAL':'JUEGO 3 · FINAL','WINNER':'GANADOR',
  'Blue circle = winner   •   Red X = loser   •   BYE = automatic advance':'Círculo azul = ganador   •   X roja = perdedor   •   LIBRE = avance automático',
  'BYE':'LIBRE','PENDING':'PENDIENTE',
  'All three games are shown with handicap added. A green circle marks the leader of each game. The highest single handicap game wins the pot; ties share the payout.':'Se muestran los tres juegos con hándicap. Un círculo verde marca al líder de cada juego. El juego individual más alto gana el pozo; los empates comparten el premio.',
  'Generate / update standings':'Generar / actualizar resultados','Best game':'Mejor juego','Pot result':'Resultado del pozo',
  'Add each two-bowler team here. A bowler may play on multiple different teams and pays one buy-in for each team. Both bowlers must already be in the roster.':'Agregue aquí cada equipo de dos jugadores. Un jugador puede participar en varios equipos distintos y paga una inscripción por cada uno. Ambos deben estar registrados.',
  'First bowler':'Primer jugador','Second bowler':'Segundo jugador','Add Doubles Team':'Agregar pareja','Please register bowler.':'Por favor, registre al jugador.',
  "Enter each bowler's scratch games once. Those scores update every bracket and Doubles team that includes that bowler. Handicap is added per game.":'Ingrese una vez los juegos scratch de cada jugador. Los resultados actualizan todas sus llaves y parejas. El hándicap se suma por juego.',
  'Scores':'Puntuaciones','Game 1':'Juego 1','Game 2':'Juego 2','Game 3':'Juego 3','Scratch series':'Serie scratch','HDCP series':'Serie con hándicap',
  'Doubles match totals':'Totales de Parejas','Team':'Equipo','Combined series':'Serie combinada','Combined':'Combinado','Series':'Serie',
  'Tournament summary':'Resumen del torneo','Event columns show winnings minus buy-ins. Red is a loss; green is a gain. Overall balance is total winnings minus total charges.':'Las columnas por evento muestran premios menos inscripciones. Rojo indica pérdida y verde ganancia. El saldo total es premios menos cargos.',
  'Why they pay':'Motivo del cargo','Total due':'Total a pagar','Winnings and why':'Premios y motivo','Total won':'Total ganado','Scratch':'Scratch','Balance':'Saldo',
  'Total charges':'Cargos totales','Total winnings':'Premios totales','Combined bowler balance':'Saldo combinado de jugadores',
  'Competition data':'Datos de la competencia',"Starting a new competition downloads a JSON backup, then clears this browser's tournament data after you confirm the download is saved.":'Iniciar una competencia descarga una copia JSON y después borra los datos de este navegador cuando confirme que se guardó.',
  'Start New Competition':'Iniciar nueva competencia','Restore a JSON backup':'Restaurar copia JSON','Print report':'Imprimir reporte',
  'No Doubles teams added yet.':'Todavía no hay parejas agregadas.','Remove team':'Eliminar equipo',
  'Add a team above to see its game results.':'Agregue una pareja arriba para ver sus resultados.',
  'Payout is pending until every entrant has all three scores.':'El premio está pendiente hasta que todos tengan tres puntuaciones.',
  'No bowlers registered for High Game Pot.':'No hay jugadores registrados para el pozo de juego alto.',
  'No brackets generated. At least seven different bowlers must select this event.':'No se generaron llaves. Se necesitan al menos siete jugadores distintos en este evento.',
  'No participants.':'Sin participantes.','No winnings':'Sin premios','No entries':'Sin inscripciones',
  'No bowlers registered yet.':'Todavía no hay jugadores registrados.','No Doubles teams added yet.':'Todavía no hay parejas agregadas.',
  'Payouts appear after every team bowler has all three scores.':'Los premios aparecerán cuando todos los integrantes tengan tres puntuaciones.',
  'Doubles results':'Resultados de Parejas','Best combined game:':'Mejor juego combinado:',
  'Doubles bowlers without a team are not charged.':'Los jugadores sin pareja no pagan inscripción.',
  'Generate brackets to determine actual bracket charges.':'Genere las llaves para calcular los cargos reales.',
  'Bowler saved. Generate brackets again after roster changes.':'Jugador guardado. Genere las llaves de nuevo después de cambiar la lista.',
  'Doubles team added.':'Pareja agregada.','Doubles team removed.':'Pareja eliminada.',
  'A Doubles team needs two different bowlers.':'Una pareja necesita dos jugadores diferentes.',
  'This Doubles team is already registered.':'Esta pareja ya está registrada.',
  'Score saved.':'Puntuación guardada.','Configuration saved.':'Configuración guardada.',
  'High Game standings updated.':'Resultados de juego alto actualizados.',
  'Competition data was kept.':'Se conservaron los datos de la competencia.',
  'Backup restored.':'Copia restaurada.','Could not read the JSON backup.':'No se pudo leer la copia JSON.',
  'This is not a valid Monster Bowling backup.':'Esta copia JSON de Monster Bowling no es válida.',
  'Download SVG image':'Descargar imagen SVG',
  'New competition started. Previous data is in your JSON backup.':'Nueva competencia iniciada. Los datos anteriores están en la copia JSON.',
  'Backup was not saved. Competition data was kept.':'No se guardó la copia. Se conservaron los datos.',
  'Check the buy-ins and fixed payout amounts.':'Revise las inscripciones y las cantidades fijas de los premios.',
  'Doubles needs all three scores for every team bowler.':'Parejas necesita las tres puntuaciones de cada integrante.',
  'Language / Idioma':'Idioma / Language','Language':'Idioma','English':'Inglés','Log in':'Iniciar sesión','Log out':'Cerrar sesión',
  'Sign in':'Iniciar sesión','Select a league or tournament to view its results. The administrator can sign in to manage all competitions.':'Seleccione una liga o torneo para ver sus resultados. El administrador puede iniciar sesión para gestionar todas las competencias.',
  'Email':'Correo electrónico','Password':'Contraseña','League / tournament':'Liga / torneo','Choose a league or tournament':'Seleccione una liga o torneo',
  'Create an account':'Crear una cuenta','Register with email':'Registrarse con correo electrónico','Confirm the email we send you before signing in. No administrator approval is needed.':'Confirme el correo que le enviaremos antes de iniciar sesión. No necesita aprobación del administrador.',
  'Register':'Registrarse','Verify your email':'Verifique su correo electrónico','Enter the code sent to your email.':'Ingrese el código enviado a su correo electrónico.',
  'Verification code':'Código de verificación','Verify email':'Verificar correo','Send another code':'Enviar otro código',
  'Leagues and tournaments':'Ligas y torneos','Manage leagues and tournaments':'Administrar ligas y torneos','Available leagues and tournaments':'Ligas y torneos disponibles',
  'Install Brackets':'Instalar Brackets','Install this webapp on your phone for quick access to sessions and results.':'Instale esta aplicación web en su teléfono para acceder rápidamente a sesiones y resultados.','Install app':'Instalar aplicación',
  'Competition name':'Nombre de la competencia','Type':'Tipo','League':'Liga','Tournament':'Torneo','Create competition':'Crear competencia','Back to dashboard':'Volver al panel',
  'Manage current session':'Administrar sesión actual','View current session':'Ver sesión actual','Saved sessions':'Sesiones guardadas','View':'Ver','No saved sessions yet.':'Todavía no hay sesiones guardadas.','No competitions are available yet.':'Todavía no hay competencias disponibles.',
  'Payout method: Fixed amount':'Método de premio: cantidad fija','1st place fixed ($)':'1.er lugar fijo ($)','2nd place fixed ($)':'2.º lugar fijo ($)','Winner fixed payout ($)':'Premio fijo al ganador ($)',
  'Highest game plus handicap wins. Tied winners split the fixed payout equally.':'Gana el juego más alto con hándicap. Los ganadores empatados dividen el premio fijo por partes iguales.',
  'High Game fixed team payout ($)':'Premio fijo por equipo para juego alto ($)','Series fixed team payout ($)':'Premio fijo por equipo para serie ($)',
  "Each partner's handicap is included in every game. Fixed team payouts are split equally between both partners.":'El hándicap de cada integrante se incluye en cada juego. Los premios fijos del equipo se dividen por igual entre ambos.',
  'Save payout configuration':'Guardar configuración de premios','Bowler login email':'Correo de acceso del jugador',
  "Bracket numbers are the maximum each bowler is willing to play. Doubles charges depend on the teams added in the Doubles tab. Add the bowler's login email so they can see their personal balance.":'Los números de llaves son el máximo que cada jugador está dispuesto a jugar. Los cargos de Parejas dependen de los equipos agregados en esa pestaña. Agregue el correo de acceso del jugador para que pueda ver su saldo personal.',
  'Paid':'Pagado','Outstanding':'Pendiente','Settle now':'Liquidar ahora','Payments received':'Pagos recibidos','Total to settle now':'Total por liquidar ahora',
  'Event columns show what must be settled now. Paid bowlers receive their full winnings; unpaid entry charges are deducted. Red is owed and green is payable to the bowler.':'Las columnas muestran lo que debe liquidarse ahora. Los jugadores que pagaron reciben todos sus premios; a quienes no pagaron se les descuentan las inscripciones. Rojo indica deuda y verde indica pago al jugador.',
  'Save this session':'Guardar esta sesión','Save the scores and payouts under this league, then begin the next bowling date with the same roster.':'Guarde las puntuaciones y premios en esta liga y luego inicie la siguiente fecha con la misma lista de jugadores.',
  'Session name':'Nombre de la sesión','Session date':'Fecha de la sesión','Save session & start next':'Guardar sesión e iniciar la siguiente',
  'Scores with handicap':'Puntuaciones con hándicap','Payout summary':'Resumen de premios','Results are pending.':'Los resultados están pendientes.',
  'Your balance':'Su saldo','Select your bowler above and choose Show my balance.':'Seleccione su jugador arriba y elija Mostrar mi saldo.',
  'Entry charges':'Cargos de inscripción','Winnings':'Premios','Current balance':'Saldo actual','Your bowler and notifications':'Su jugador y notificaciones',
  'Choose your bowler to view the correct balance and only the brackets that include you. Notifications are optional.':'Seleccione su jugador para ver el saldo correcto y solamente las llaves en las que participa. Las notificaciones son opcionales.',
  'Event date':'Fecha del evento','Show my balance':'Mostrar mi saldo','Enable notifications':'Activar notificaciones',
  'Matchups will appear when the previous game is decided.':'Los enfrentamientos aparecerán cuando se decida el juego anterior.',
  'This bowler is not entered in any handicap brackets.':'Este jugador no está inscrito en ninguna llave con hándicap.',
  'This bowler is not entered in any scratch brackets.':'Este jugador no está inscrito en ninguna llave scratch.',
  'No brackets generated.':'No se generaron llaves.','No charges':'Sin cargos','Competition':'Competencia','open':'abierta','league':'liga','tournament':'torneo',
  'Results have not been published for this competition yet.':'Todavía no se han publicado resultados para esta competencia.',
  'Total winnings':'Premios totales','Total won':'Total ganado','Paid:':'Pagado:','Outstanding:':'Pendiente:',
  'Configuration changed. Select Save payout configuration to keep it.':'La configuración cambió. Seleccione Guardar configuración de premios para conservarla.',
  'Changes not saved yet.':'Los cambios todavía no se han guardado.','Saving…':'Guardando…','Saved to Neon.':'Guardado en Neon.',
  'Could not save.':'No se pudo guardar.','Try again.':'Inténtelo de nuevo.','Payout configuration saved.':'Configuración de premios guardada.',
  'Payout configuration was not saved.':'No se guardó la configuración de premios.','Check the fixed payout amounts.':'Revise las cantidades fijas de los premios.',
  'Check the payout configuration.':'Revise la configuración de premios.','Check the name, handicap and bracket counts.':'Revise el nombre, el hándicap y las cantidades de llaves.',
  'A bowler with that name is already registered.':'Ya existe un jugador registrado con ese nombre.','That login email is already linked to another bowler.':'Ese correo de acceso ya está vinculado a otro jugador.',
  'Saving payment status…':'Guardando estado de pago…','Payment status saved to Neon.':'Estado de pago guardado en Neon.',
  'Bowler and their Doubles teams removed. Generate brackets again.':'Se eliminaron el jugador y sus parejas. Genere las llaves nuevamente.',
  'Enter a whole game score from 0 to 300.':'Ingrese una puntuación entera entre 0 y 300.','Register bowlers first.':'Registre jugadores primero.',
  'Select High Game during registration, then generate the standings.':'Seleccione Juego alto durante el registro y luego genere las posiciones.',
  'Unknown':'Desconocido','Full winnings are now payable.':'Ahora corresponde pagar todos los premios.','Entry charges will be deducted from winnings.':'Los cargos de inscripción se descontarán de los premios.',
  'Notifications are not available on this device yet.':'Las notificaciones todavía no están disponibles en este dispositivo.','Notification permission was not granted.':'No se concedió permiso para las notificaciones.',
  'Verify your email before signing in.':'Verifique su correo electrónico antes de iniciar sesión.','Signed in again. Your competition information was preserved.':'Sesión iniciada nuevamente. Se conservó la información de la competencia.',
  'Check your email for a verification code, then enter it below.':'Revise su correo para obtener el código de verificación e ingréselo abajo.','Email confirmed. You can now sign in.':'Correo confirmado. Ya puede iniciar sesión.',
  'A new verification code has been sent.':'Se envió un nuevo código de verificación.','You are logged out.':'Su sesión se cerró.','Log in to continue.':'Inicie sesión para continuar.',
  'Payout configuration saved to Neon.':'Configuración de premios guardada en Neon.','Site setup is incomplete. The Neon project URL must be configured.':'La configuración del sitio está incompleta. Debe configurarse la dirección del proyecto Neon.',
  'Competition is not available.':'La competencia no está disponible.','Enter a session name and date before saving.':'Ingrese un nombre y una fecha para la sesión antes de guardarla.',
  'Neon did not confirm the save.':'Neon no confirmó el guardado.','Open a competition as administrator first.':'Abra primero una competencia como administrador.',
  'Request failed':'La solicitud falló','Session expired':'La sesión expiró','Session expired.':'La sesión expiró.','Session expired. Sign in again.':'La sesión expiró. Inicie sesión nuevamente.',
  'Your session expired. Log in again to continue; the information on this screen is preserved.':'Su sesión expiró. Inicie sesión nuevamente para continuar; la información de esta pantalla se conservó.',
  'Session expired. Use Log in to continue.':'La sesión expiró. Use Iniciar sesión para continuar.',
  'Competitions':'Competencias','Users & access':'Usuarios y acceso','Change an account between User and Manager, then assign the leagues or tournaments that Manager can edit.':'Cambie una cuenta entre Usuario y Encargado y luego asigne las ligas o torneos que puede editar.',
  'Account type':'Tipo de cuenta','User':'Usuario','Manager':'Encargado','Admin':'Administrador','Managed competitions':'Competencias administradas','All competitions':'Todas las competencias','Save access':'Guardar acceso','No users found.':'No se encontraron usuarios.','User access saved.':'Acceso del usuario guardado.'
};
const originalText=new WeakMap();
const originalAttributes=new WeakMap();
function translateText(original) {
  if(state.language!=='es') return original;
  const trimmed=original.trim();
  let translated=ES[trimmed];
  if(!translated) translated=trimmed
    .replace(/^Game (\d+) matchups$/,'Enfrentamientos del juego $1')
    .replace(/^Standings after game (\d+)$/,'Posiciones después del juego $1')
    .replace(/^Your balance — /,'Su saldo — ')
    .replace(/^Total charges: /,'Cargos totales: ').replace(/ · Paid: /,' · Pagado: ').replace(/ · Outstanding: /,' · Pendiente: ')
    .replace(/^Total won: /,'Total ganado: ').replace(/^Current balance: /,'Saldo actual: ')
    .replace(/^Balance linked to (.+)\. Notifications remain off\.$/,'Saldo vinculado a $1. Las notificaciones permanecen desactivadas.')
    .replace(/^Notifications enabled for (.+) on (.+)\.$/,'Notificaciones activadas para $1 el $2.')
    .replace(/^Editing (.+)\. Changes save to Neon\.$/,'Editando $1. Los cambios se guardan en Neon.')
    .replace(/^Saved to Neon at (.+)$/,'Guardado en Neon a las $1')
    .replace(/^Save failed: (.+)\. Your edits remain on this screen\.$/,'Error al guardar: $1. Sus cambios permanecen en esta pantalla.')
    .replace(/Session expired\. Sign in again\./g,'La sesión expiró. Inicie sesión nuevamente.')
    .replace(/^(.+) Use Log in to continue\.$/,'$1 Use Iniciar sesión para continuar.')
    .replace(/^(.+) was saved\. The next session is ready with the roster preserved\.$/,'Se guardó $1. La siguiente sesión está lista con la misma lista de jugadores.')
    .replace(/\bleague\b/g,'liga').replace(/\btournament\b/g,'torneo').replace(/\bopen\b/g,'abierta')
    .replace(/\bYes\b/g,'Sí').replace(/\bNo\b/g,'No')
    .replace(/^(.+) marked paid\. Full winnings are now payable\.$/,'$1 marcado como pagado. Ahora corresponde pagar todos los premios.')
    .replace(/^(.+) marked unpaid\. Entry charges will be deducted from winnings\.$/,'$1 marcado como no pagado. Los cargos de inscripción se descontarán de los premios.')
    .replace(/^Remove (.+) and their Doubles teams\?$/,'¿Eliminar a $1 y sus equipos de Parejas?')
    .replace(/^(\d+) brackets? generated\.$/,'Se generaron $1 llaves.')
    .replace(/^Team #(\d+)/,'Equipo n.º $1').replace(/^Pair #(\d+)/,'Pareja n.º $1')
    .replace(/Doubles high game/g,'Juego alto de Parejas').replace(/Doubles series/g,'Serie de Parejas')
    .replace(/Doubles team(s)?/g,(_,plural)=>plural?'equipos de Parejas':'equipo de Parejas')
    .replace(/Handicap bracket(s)?/g,(_,plural)=>plural?'llaves con hándicap':'llave con hándicap')
    .replace(/Scratch bracket(s)?/g,(_,plural)=>plural?'llaves scratch':'llave scratch')
    .replace(/HDCP High Game Pot/g,'Pozo de juego alto con hándicap')
    .replace(/Registered for Doubles but not on a team, so not charged:/g,'Registrados para Parejas pero sin equipo, por lo que no pagan:')
    .replace(/Unused bracket willingness is not charged:/g,'Los lugares no usados en las llaves no se cobran:')
    .replace(/Willingness above the available full brackets:/g,'Lugares ofrecidos por encima de las llaves disponibles:')
    .replace(/Best combined game:/g,'Mejor juego combinado:').replace(/Winning game:/g,'Juego ganador:').replace(/Payout:/g,'Premio:')
    .replace(/Balances may change when pending results are entered\./g,'Los saldos pueden cambiar cuando se ingresen los resultados pendientes.')
    .replace(/No winnings/g,'Sin premios').replace(/No entries/g,'Sin inscripciones');
  return original.replace(trimmed,translated);
}
function translateUI() {
  if(typeof document==='undefined') return;
  const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
  while(walker.nextNode()) {
    const node=walker.currentNode;if(['SCRIPT','STYLE'].includes(node.parentElement?.tagName))continue;
    if(!originalText.has(node)) originalText.set(node,node.nodeValue);
    const original=originalText.get(node);node.nodeValue=translateText(original);
  }
  document.querySelectorAll('[placeholder],[title],[aria-label]').forEach(element=>{
    if(!originalAttributes.has(element)) originalAttributes.set(element,Object.fromEntries(['placeholder','title','aria-label'].filter(name=>element.hasAttribute(name)).map(name=>[name,element.getAttribute(name)])));
    for(const [name,value] of Object.entries(originalAttributes.get(element))) element.setAttribute(name,translateText(value));
  });
  document.documentElement.lang=state.language;
}
function preferredLanguage() { try{return localStorage.getItem(LANGUAGE_KEY)==='es'?'es':'en';}catch{return 'en';} }
function fresh() { return {config:{...DEFAULT_CONFIG},bowlers:[],brackets:{hdcp:[],scratch:[]},generated:false,highGenerated:false,pairs:[],pairsGenerated:false,language:preferredLanguage()}; }
function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    if (!raw || !Array.isArray(raw.bowlers)) return fresh();
    const config={...DEFAULT_CONFIG};
    CONFIG_IDS.forEach(id=>{if(raw.config && Object.hasOwn(raw.config,id)) config[id]=raw.config[id];});
    return {config,bowlers:raw.bowlers.map(({quin,...b})=>({...b,email:typeof b.email==='string'?b.email:'',paid:!!b.paid,high:!!b.high,pairs:!!b.pairs,scores:{...blankScores(),...b.scores}})),brackets:raw.brackets || {hdcp:[],scratch:[]},generated:!!raw.generated,highGenerated:!!raw.highGenerated,pairs:Array.isArray(raw.pairs)?raw.pairs:[],pairsGenerated:!!raw.pairsGenerated,language:raw.language==='es'?'es':'en'};
  } catch { return fresh(); }
}
let state = typeof localStorage === 'undefined' || globalThis.MONSTER_PORTAL_MODE ? fresh() : load();
let editingId = null;
function persist() {
  if (globalThis.MONSTER_PORTAL_MODE) {
    globalThis.MonsterPortal?.persist(state);
  } else if (typeof localStorage !== 'undefined') localStorage.setItem(KEY,JSON.stringify(state));
}
function configured(c) {
  for (const id of NUMBER_IDS) if (typeof c[id]!=='number'||!Number.isFinite(c[id]) || c[id] < 0 || (PERCENT_IDS.includes(id) && c[id] > 100)) return false;
  if(typeof c.pairsHighEnabled!=='boolean'||typeof c.pairsSeriesEnabled!=='boolean') return false;
  return c.pairsHighEnabled || c.pairsSeriesEnabled;
}
function totalEntries(type) { return state.brackets[type].reduce((n,b)=>n+b.length,0); }
function assignedCount(type,id) { return state.brackets[type].reduce((n,b)=>n+b.filter(p=>p===id).length,0); }
function shuffle(a) { for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; }
function buildBrackets(bowlers,type) {
  const prop = type==='hdcp'?'hdcpCount':'scratchCount';
  const pool = bowlers.map(b=>({id:b.id,limit:Math.max(0,Math.floor(Number(b[prop])||0)),assigned:0}));
  const eligible=pool.filter(b=>b.limit>0).length;
  if(eligible<7) return [];
  const spots=eligible===7?7:8;
  const total = pool.reduce((n,b)=>n+b.limit,0);
  let low=0, high=Math.floor(total/spots);
  // A bowler can appear only once in each bracket. This condition gives the
  // maximum number of brackets possible under everyone's limits. A seven
  // bowler field gets one first-round bye in each eight-slot bracket.
  while(low<high) {
    const mid=Math.ceil((low+high)/2);
    if(pool.reduce((n,b)=>n+Math.min(b.limit,mid),0)>=spots*mid) low=mid;
    else high=mid-1;
  }
  const count=low, entries=count*spots;
  if(!count) return [];
  // Spread spots across bowlers first, then use the remaining capacity.
  for(let i=0;i<entries;i++) {
    const eligible=pool.filter(b=>b.assigned<Math.min(b.limit,count));
    const chosen=shuffle(eligible).sort((a,b)=>(a.assigned/Math.min(a.limit,count))-(b.assigned/Math.min(b.limit,count)))[0];
    chosen.assigned++;
  }
  // Place the largest assignments first into the emptiest brackets.
  const result=Array.from({length:count},()=>[]);
  shuffle(pool).sort((a,b)=>b.assigned-a.assigned).forEach(b=>{
    const available=shuffle(result.map((ids,index)=>({ids,index}))).sort((a,b)=>a.ids.length-b.ids.length);
    available.slice(0,b.assigned).forEach(slot=>slot.ids.push(b.id));
  });
  return result.map(ids=>shuffle(spots===7?[...ids,null]:ids));
}
function pairCount(data,id) { return data.pairs.filter(ids=>ids.includes(id)).length; }
function addTeamByNames(data,name1,name2) {
  const find=name=>data.bowlers.find(b=>b.name.toLocaleLowerCase()===name.trim().toLocaleLowerCase());
  const a=find(name1),b=find(name2);
  if(!a||!b) return 'not_registered';
  if(a.id===b.id) return 'same_bowler';
  if(data.pairs.some(ids=>ids.includes(a.id)&&ids.includes(b.id))) return 'duplicate_team';
  data.pairs.push([a.id,b.id]);a.pairs=true;b.pairs=true;data.pairsGenerated=true;
  return 'added';
}
function complete(b) { return ['g1','g2','g3'].every(g=>b.scores[g]!==null && b.scores[g]!=='' && Number.isFinite(Number(b.scores[g]))); }
function hasGame(b,g) { return b.scores['g'+g]!==null && b.scores['g'+g]!=='' && Number.isFinite(Number(b.scores['g'+g])); }
function game(b,g,handicap=false) { return Number(b.scores['g'+g])+(handicap?Number(b.handicap):0); }
function series(b,handicap=false) { return [1,2,3].reduce((n,g)=>n+game(b,g,handicap),0); }
function bestGame(b,handicap=false) { return Math.max(...[1,2,3].map(g=>game(b,g,handicap))); }
function pairGame(team,g) { return team.reduce((n,b)=>n+game(b,g,true),0); }
function pairSeries(team) { return [1,2,3].reduce((n,g)=>n+pairGame(team,g),0); }
function pairBest(team) { return Math.max(...[1,2,3].map(g=>pairGame(team,g))); }
function pairedTeams(data) {
  const byId=new Map(data.bowlers.map(b=>[b.id,b]));
  return data.pairs.map(ids=>ids.map(id=>byId.get(id))).filter(team=>team.length===2&&team.every(Boolean));
}
function rankAwards(players,value,pool,percentages,description,category) {
  const sorted=[...players].sort((a,b)=>value(b)-value(a)||a.name.localeCompare(b.name));
  const awards=[];
  let rank=0;
  for(let i=0;i<sorted.length && rank<percentages.length;){
    const tied=sorted.filter(p=>value(p)===value(sorted[i]));
    const first=i, last=i+tied.length;
    const amount=percentages.slice(first,Math.min(last,percentages.length)).reduce((n,p)=>n+Math.round(pool*p/100),0);
    if(amount>0) {
      const share=Math.floor(amount/tied.length), remainder=amount%tied.length;
      tied.forEach((p,j)=>awards.push({id:p.id,category,description:description+' · '+(first+1)+(tied.length>1?' tie':'')+' ('+value(p)+')',amount:share+(j<remainder?1:0)}));
    }
    i=last;rank=i;
  }
  return awards;
}
function pairAwards(teams,value,amount,description) {
  if(!teams.length||amount<=0) return [];
  const top=Math.max(...teams.map(value)), winners=teams.filter(team=>value(team)===top);
  const teamShare=Math.floor(amount/winners.length), teamRemainder=amount%winners.length;
  return winners.flatMap((team,i)=>{
    const payout=teamShare+(i<teamRemainder?1:0), half=Math.floor(payout/2);
    return team.map((b,j)=>({id:b.id,category:'pairs',description:description+' · '+team.map(x=>x.name).join(' & ')+' ('+top+')'+(winners.length>1?' tie':''),amount:half+(j===0?payout%2:0)}));
  });
}
function bracketFinalists(ids,type,bowlers) {
  const byId=new Map(bowlers.map(b=>[b.id,b]));
  const players=ids.map(id=>id===null?null:byId.get(id));
  if(players.some((p,i)=>ids[i]!==null&&(!p||!complete(p)))) return null;
  const hdcp=type==='hdcp';
  const winners=(group,g)=>{const active=group.filter(Boolean);if(active.length<=1)return active;const max=Math.max(...active.map(p=>game(p,g,hdcp)));return active.filter(p=>game(p,g,hdcp)===max);};
  const round1=[0,2,4,6].map(i=>winners(players.slice(i,i+2),1));
  const semi=[winners([...round1[0],...round1[1]],2),winners([...round1[2],...round1[3]],2)];
  return [...semi[0],...semi[1]];
}
function bracketGraphic(ids,type,bowlers,index) {
  const byId=new Map(bowlers.map(b=>[b.id,b]));
  const entrants=ids.map(id=>id===null?null:byId.get(id)).filter((_,i)=>i<8);
  const hdcp=type==='hdcp';
  const outcome=(members,gameNumber,ready=true)=>{
    if(!ready) return {winners:[],decided:false};
    const active=members.filter(Boolean);
    if(active.length===1) return {winners:active,decided:true};
    if(!active.length||active.some(b=>b.scores['g'+gameNumber]===null)) return {winners:[],decided:false};
    const top=Math.max(...active.map(b=>game(b,gameNumber,hdcp)));
    return {winners:active.filter(b=>game(b,gameNumber,hdcp)===top),decided:true};
  };
  const first=Array.from({length:4},(_,i)=>outcome(entrants.slice(i*2,i*2+2),1));
  const second=Array.from({length:2},(_,i)=>outcome([...first[i*2].winners,...first[i*2+1].winners],2,first[i*2].decided&&first[i*2+1].decided));
  const final=outcome([...second[0].winners,...second[1].winners],3,second.every(x=>x.decided));
  const xs=[20,300,590,870], width=210, height=34;
  const ys1=Array.from({length:8},(_,i)=>70+i*54);
  const centers1=ys1.map(y=>y+height/2);
  const centers2=Array.from({length:4},(_,i)=>(centers1[i*2]+centers1[i*2+1])/2);
  const centers3=Array.from({length:2},(_,i)=>(centers2[i*2]+centers2[i*2+1])/2);
  const center4=(centers3[0]+centers3[1])/2;
  const line=(x1,y1,x2,y2)=>'<path d="M'+x1+' '+y1+' L'+x2+' '+y2+'" fill="none" stroke="#9b8254" stroke-width="2.5"/>';
  const links=(fromX,toX,centers)=>centers.reduce((out,y,i)=>{
    if(i%2)return out;
    const y2=centers[i+1], mid=(y+y2)/2, joint=fromX+27;
    return out+line(fromX,y,joint,y)+line(fromX,y2,joint,y2)+line(joint,y,joint,y2)+line(joint,mid,toX,mid);
  },'');
  const box=(x,y,people,g,result,placeholder='PENDING')=>{
    const one=people.filter(Boolean), bye=!one.length;
    const label=bye?placeholder:one.map(b=>b.name).join(' / ');
    const score=one.length===1&&one[0].scores['g'+g]!==null?'  '+game(one[0],g,hdcp):'';
    const shown=(label+score).length>27?(label+score).slice(0,26)+'…':label+score;
    const won=result.decided&&one.length>0&&one.every(b=>result.winners.some(w=>w.id===b.id));
    const lost=result.decided&&one.length>0&&one.every(b=>!result.winners.some(w=>w.id===b.id));
    const bg=bye?'#eeeae3':'#fffaf0';
    let mark='';
    if(won) mark='<ellipse cx="'+(x+width/2)+'" cy="'+(y+height/2)+'" rx="'+(width/2+5)+'" ry="'+(height/2+5)+'" fill="none" stroke="#1d67d6" stroke-width="3.5"/>';
    if(lost) mark='<path d="M'+(x+width-26)+' '+(y+8)+' l16 18 M'+(x+width-10)+' '+(y+8)+' l-16 18" fill="none" stroke="#c53038" stroke-width="4" stroke-linecap="round"/>';
    return '<g><title>'+safe(label)+'</title><rect x="'+x+'" y="'+y+'" width="'+width+'" height="'+height+'" rx="8" fill="'+bg+'" stroke="#bdac8b"/><text x="'+(x+12)+'" y="'+(y+22)+'" font-size="14" font-weight="700" fill="'+(bye?'#777':'#17212e')+'">'+safe(shown)+'</text>'+mark+'</g>';
  };
  let svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1110 550" role="img" aria-label="'+safe((hdcp?'Handicap':'Scratch')+' bracket '+(index+1))+'" class="bracket-svg"><rect width="1110" height="550" fill="#fffdf9"/>';
  ['GAME 1','GAME 2 · SEMIFINAL','GAME 3 · FINAL','WINNER'].forEach((t,i)=>svg+='<text x="'+xs[i]+'" y="38" fill="#073a82" font-size="16" font-weight="800">'+t+'</text>');
  svg+=links(xs[0]+width,xs[1],centers1)+links(xs[1]+width,xs[2],centers2);
  svg+=line(xs[2]+width,centers3[0],xs[2]+width+27,centers3[0])+line(xs[2]+width,centers3[1],xs[2]+width+27,centers3[1])+line(xs[2]+width+27,centers3[0],xs[2]+width+27,centers3[1])+line(xs[2]+width+27,center4,xs[3],center4);
  entrants.forEach((p,i)=>svg+=box(xs[0],ys1[i],p?[p]:[],1,first[Math.floor(i/2)],'BYE'));
  first.forEach((r,i)=>svg+=box(xs[1],centers2[i]-height/2,r.winners,2,second[Math.floor(i/2)]));
  second.forEach((r,i)=>svg+=box(xs[2],centers3[i]-height/2,r.winners,3,final));
  svg+=box(xs[3],center4-height/2,final.winners,3,{winners:final.winners,decided:final.decided});
  svg+='<text x="20" y="530" fill="#596578" font-size="13">Blue circle = winner   •   Red X = loser   •   BYE = automatic advance</text></svg>';
  return svg;
}
function calculate(state) {
  const c=state.config, bowlers=state.bowlers, awards=[], pending=[];
  if(!configured(c)) return {awards,pending:['Fix the payout amounts before calculating payouts.']};
  for(const type of ['hdcp','scratch']) {
    for(const [i,ids] of state.brackets[type].entries()) {
      const finalists=bracketFinalists(ids,type,bowlers);
      if(!finalists){pending.push(type+' bracket #'+(i+1)+' needs all three scores for every entrant.');continue;}
      const pool=cents(c[type+'Buyin'])*ids.filter(Boolean).length;
      const value=p=>game(p,3,type==='hdcp');
      const payouts=[cents(c[type+'FirstAmount']),cents(c[type+'SecondAmount'])];
      awards.push(...rankAwards(finalists,value,100,payouts,(type==='hdcp'?'HDCP':'Scratch')+' bracket #'+(i+1),type));
    }
  }
  const high=bowlers.filter(b=>b.high);
  if(high.length && high.every(complete)) {
    awards.push(...rankAwards(high,b=>bestGame(b,true),100,[cents(c.highPayoutAmount)],'HDCP High Game Pot','high'));
  } else if(high.length) pending.push('High Game Pot needs all three scores for every entrant.');
  const teams=pairedTeams(state);
  if(teams.length && teams.every(team=>team.every(complete))) {
    if(c.pairsHighEnabled) awards.push(...pairAwards(teams,pairBest,cents(c.pairsGamePayoutAmount),'Doubles high game'));
    if(c.pairsSeriesEnabled) awards.push(...pairAwards(teams,pairSeries,cents(c.pairsSeriesPayoutAmount),'Doubles series'));
  } else if(teams.length) pending.push('Doubles needs all three scores for every team bowler.');
  return {awards,pending};
}
function reportSummary(data) {
  const c=data.config, result=calculate(data);
  const count=(type,id)=>(data.brackets[type]||[]).reduce((n,ids)=>n+ids.filter(x=>x===id).length,0);
  const rows=data.bowlers.map(b=>{
    const h=count('hdcp',b.id), s=count('scratch',b.id);
    const paired=(data.pairs||[]).filter(ids=>ids.includes(b.id)).length;
    const charges=[
      ...(h?[{category:'hdcp',label:h+' handicap bracket'+(h===1?'':'s')+' × '+money(cents(c.hdcpBuyin)),amount:h*cents(c.hdcpBuyin)}]:[]),
      ...(s?[{category:'scratch',label:s+' scratch bracket'+(s===1?'':'s')+' × '+money(cents(c.scratchBuyin)),amount:s*cents(c.scratchBuyin)}]:[]),
      ...(b.high?[{category:'high',label:'Handicap High Game Pot',amount:cents(c.highBuyin)}]:[]),
      ...(paired?[{category:'pairs',label:paired+' Doubles team'+(paired===1?'':'s')+' × '+money(cents(c.pairsBuyin)),amount:paired*cents(c.pairsBuyin)}]:[])
    ];
    const winnings=result.awards.filter(a=>a.id===b.id);
    const due=charges.reduce((n,x)=>n+x.amount,0), won=winnings.reduce((n,x)=>n+x.amount,0);
    const paid=!!b.paid, outstanding=paid?0:due;
    const eventNet=Object.fromEntries(['hdcp','scratch','high','pairs'].map(type=>[type,winnings.filter(x=>x.category===type).reduce((n,x)=>n+x.amount,0)-(paid?0:charges.filter(x=>x.category===type).reduce((n,x)=>n+x.amount,0))]));
    return {id:b.id,name:b.name,paid,charges,due,outstanding,winnings,won,eventNet,net:won-due,settlement:won-outstanding};
  });
  const collected=rows.reduce((n,r)=>n+r.due,0), received=rows.reduce((n,r)=>n+(r.paid?r.due:0),0), outstanding=collected-received, awarded=rows.reduce((n,r)=>n+r.won,0),settlement=rows.reduce((n,r)=>n+r.settlement,0);
  return {rows,collected,received,outstanding,awarded,net:awarded-collected,settlement,pending:result.pending};
}
function balanceText(amount) { return (amount<0?'−':amount>0?'+':'')+money(Math.abs(amount)); }
function balanceClass(amount) { return amount<0?'balance-negative':amount>0?'balance-positive':'balance-zero'; }
function summarizedWinnings(items) {
  const labels={hdcp:'Handicap brackets',scratch:'Scratch brackets',high:'High Game Pot',pairs:'Doubles'};
  return Object.entries(items.reduce((totals,item)=>({...totals,[item.category]:(totals[item.category]||0)+item.amount}),{}))
    .map(([category,amount])=>({label:labels[category]||category,amount}));
}
function status(message) { document.getElementById('status').textContent=message;translateUI(); }
function marked(value,winner) { return winner?'<span class="winner-circle">'+value+'</span>':String(value); }
function renderHighGame() {
  const players=state.bowlers.filter(b=>b.high);
  if(!state.highGenerated) {
    document.getElementById('highNotice').innerHTML='<p class="hint">Select High Game during registration, then generate the standings.</p>';
    document.getElementById('highRows').innerHTML='';
    document.getElementById('highResult').innerHTML='';
    return;
  }
  const ready=[1,2,3].map(g=>players.length>0&&players.every(b=>hasGame(b,g)));
  const top=[1,2,3].map((g,i)=>ready[i]?Math.max(...players.map(b=>game(b,g,true))):null);
  const finished=players.length>0&&players.every(complete);
  const best=finished?Math.max(...players.map(b=>bestGame(b,true))):null;
  document.getElementById('highNotice').innerHTML=players.length?(!finished?'<p class="notice">Payout is pending until every entrant has all three scores.</p>':''):'<p class="notice">No bowlers registered for High Game Pot.</p>';
  document.getElementById('highRows').innerHTML=players.map(b=>'<tr><td>'+safe(b.name)+' (+'+b.handicap+')</td>'+[1,2,3].map((g,i)=>'<td>'+(hasGame(b,g)?marked(game(b,g,true),ready[i]&&game(b,g,true)===top[i]):'—')+'</td>').join('')+'<td>'+(complete(b)?marked(bestGame(b,true),finished&&bestGame(b,true)===best):'—')+'</td></tr>').join('')||'<tr><td colspan="5">No participants.</td></tr>';
  const payouts=calculate(state).awards.filter(a=>a.category==='high');
  document.getElementById('highResult').innerHTML=finished?'<h3>Pot result</h3><p>Winning game: '+marked(best,true)+'. Payout: '+payouts.map(a=>safe(players.find(b=>b.id===a.id)?.name||'Unknown')+' '+money(a.amount)).join(' · ')+'.</p>':'';
}
function renderPairs() {
  const interested=state.bowlers.filter(b=>b.pairs), teams=pairedTeams(state);
  document.getElementById('registeredBowlers').innerHTML=state.bowlers.map(b=>'<option value="'+safe(b.name)+'"></option>').join('');
  document.getElementById('teamList').innerHTML=teams.map((team,i)=>'<li>'+safe(team.map(b=>b.name).join(' & '))+' <button type="button" class="danger no-print" data-remove-pair="'+i+'">Remove team</button></li>').join('')||'<li>No Doubles teams added yet.</li>';
  const pairedIds=new Set(state.pairs.flat()), unmatched=interested.filter(b=>!pairedIds.has(b.id));
  document.getElementById('pairsNotice').innerHTML=unmatched.length?'<p class="notice">Registered for Doubles but not on a team, so not charged: '+safe(unmatched.map(b=>b.name).join(', '))+'.</p>':'';
  const ready=[1,2,3].map(g=>teams.length>0&&teams.every(t=>t.every(b=>hasGame(b,g))));
  const tops=[1,2,3].map((g,i)=>ready[i]?Math.max(...teams.map(t=>pairGame(t,g))):null);
  const finished=teams.length>0&&teams.every(t=>t.every(complete));
  const bestGameScore=finished?Math.max(...teams.map(pairBest)):null;
  const bestSeriesScore=finished?Math.max(...teams.map(pairSeries)):null;
  document.getElementById('pairsRows').innerHTML=teams.map((team,i)=>{
    const row=b=>'<tr><td>'+safe(b.name)+' (+'+b.handicap+')</td>'+[1,2,3].map(g=>'<td>'+(hasGame(b,g)?game(b,g,true):'—')+'</td>').join('')+'<td>'+(complete(b)?series(b,true):'—')+'</td></tr>';
    const total='<tr class="pair-total"><td>Combined</td>'+[1,2,3].map((g,j)=>'<td>'+(team.every(b=>hasGame(b,g))?marked(pairGame(team,g),ready[j]&&pairGame(team,g)===tops[j]):'—')+'</td>').join('')+'<td>'+(team.every(complete)?marked(pairSeries(team),finished&&state.config.pairsSeriesEnabled&&pairSeries(team)===bestSeriesScore):'—')+'</td></tr>';
    const high=team.every(complete)?'<p>Best combined game: '+marked(pairBest(team),finished&&state.config.pairsHighEnabled&&pairBest(team)===bestGameScore)+'</p>':'';
    return '<div class="pair-card"><h3>Pair #'+(i+1)+': '+safe(team.map(b=>b.name).join(' & '))+'</h3><div class="table-wrap"><table class="event-table"><thead><tr><th>Bowler</th><th>Game 1</th><th>Game 2</th><th>Game 3</th><th>Series</th></tr></thead><tbody>'+team.map(row).join('')+total+'</tbody></table></div>'+high+'</div>';
  }).join('')||'<p class="hint">Add a team above to see its game results.</p>';
  const payouts=calculate(state).awards.filter(a=>a.category==='pairs');
  document.getElementById('pairsResult').innerHTML=finished?'<h3>Doubles results</h3><p>'+payouts.map(a=>safe(state.bowlers.find(b=>b.id===a.id)?.name||'Unknown')+' — '+safe(a.description)+' '+money(a.amount)).join('<br>')+'</p>':teams.length?'<p class="hint">Payouts appear after every team bowler has all three scores.</p>':'';
}
function render() {
  CONFIG_IDS.forEach(id=>{const el=document.getElementById(id); if(el.type==='checkbox') el.checked=!!state.config[id]; else if(document.activeElement!==el) el.value=state.config[id];});
  document.getElementById('language').value=state.language;
  document.getElementById('rosterRows').innerHTML=state.bowlers.map(b=>'<tr><td>'+safe(b.name)+(b.email?'<br><small>'+safe(b.email)+'</small>':'')+'</td><td>'+b.handicap+'</td><td>'+b.hdcpCount+'</td><td>'+b.scratchCount+'</td><td>'+(b.high?'Yes':'No')+'</td><td>'+pairCount(state,b.id)+'</td><td><label class="paid-toggle"><input type="checkbox" data-paid="'+safe(b.id)+'" '+(b.paid?'checked':'')+'> Paid</label></td><td><button class="secondary" data-edit="'+safe(b.id)+'">Edit</button> <button class="danger" data-remove="'+safe(b.id)+'">Remove</button></td></tr>').join('') || '<tr><td colspan="8">No bowlers registered yet.</td></tr>';
  for(const type of ['hdcp','scratch']) {
    document.getElementById(type+'Brackets').innerHTML=state.brackets[type].map((ids,i)=>'<div class="bracket"><div class="bracket-head"><strong>'+(type==='hdcp'?'Handicap':'Scratch')+' bracket #'+(i+1)+'</strong><button class="secondary no-print" data-download="'+type+':'+i+'">Download SVG image</button></div><div class="bracket-scroll">'+bracketGraphic(ids,type,state.bowlers,i)+'</div></div>').join('') || '<p class="hint">No brackets generated. At least seven different bowlers must select this event.</p>';
  }
  const unused=state.bowlers.flatMap(b=>['hdcp','scratch'].map(t=>{const n=b[t+'Count']-assignedCount(t,b.id);return n>0?b.name+': '+n+' unused '+t+' '+(n===1?'spot':'spots'):null;})).filter(Boolean);
  document.getElementById('bracketNotice').innerHTML=state.generated&&unused.length?'<p class="notice">Willingness above the available full brackets: '+safe(unused.join(' · '))+'</p>':'';
  document.getElementById('scoreRows').innerHTML=state.bowlers.map(b=>'<tr><td>'+safe(b.name)+' (+'+b.handicap+')</td>'+[1,2,3].map(g=>'<td><input aria-label="'+safe(b.name)+' game '+g+'" data-score="'+safe(b.id)+'" data-game="g'+g+'" type="number" min="0" max="300" step="1" value="'+(b.scores['g'+g]??'')+'"></td>').join('')+'<td>'+(complete(b)?series(b):'—')+'</td><td>'+(complete(b)?series(b,true):'—')+'</td></tr>').join('')||'<tr><td colspan="6">Register bowlers first.</td></tr>';
  document.getElementById('scorePairsRows').innerHTML=pairedTeams(state).map((team,i)=>'<tr><td>Team #'+(i+1)+' — '+safe(team.map(b=>b.name).join(' & '))+'</td>'+[1,2,3].map(g=>'<td>'+(team.every(b=>hasGame(b,g))?pairGame(team,g):'—')+'</td>').join('')+'<td>'+(team.every(complete)?pairBest(team):'—')+'</td><td>'+(team.every(complete)?pairSeries(team):'—')+'</td></tr>').join('')||'<tr><td colspan="6">No Doubles teams added yet.</td></tr>';
  renderHighGame();
  renderPairs();
  const report=reportSummary(state);
  const notes=[
    ...(!state.generated&&state.bowlers.some(b=>b.hdcpCount||b.scratchCount)?['Generate brackets to determine actual bracket charges.']:[]),
    ...(state.generated&&unused.length?['Unused bracket willingness is not charged: '+unused.join(' · ')]:[]),
    ...(state.bowlers.some(b=>b.pairs&&!state.pairs.flat().includes(b.id))?['Doubles bowlers without a team are not charged.']:[]),
    ...report.pending
  ];
  document.getElementById('reportNotice').innerHTML=notes.length?'<p class="notice">'+safe(notes.join(' · '))+(report.pending.length?' Balances may change when pending results are entered.':'')+'</p>':'';
  const list=(items,label)=>items.length?'<ul class="breakdown">'+items.map(x=>'<li>'+safe(x.label||x.description)+' <span class="detail-amount">'+money(x.amount)+'</span></li>').join('')+'</ul>':'<span class="hint">'+label+'</span>';
  document.getElementById('reportRows').innerHTML=report.rows.map(r=>'<tr><td><strong>'+safe(r.name)+'</strong></td><td>'+list(r.charges,'No entries')+'</td><td class="money">'+money(r.due)+'</td><td>'+(r.paid?'Yes':'No')+'</td><td class="money balance-negative">'+money(r.outstanding)+'</td><td>'+list(summarizedWinnings(r.winnings),'No winnings')+'</td><td class="money">'+money(r.won)+'</td>'+['hdcp','scratch','high','pairs'].map(t=>'<td class="money '+balanceClass(r.eventNet[t])+'">'+balanceText(r.eventNet[t])+'</td>').join('')+'<td class="money '+balanceClass(r.settlement)+'">'+balanceText(r.settlement)+'</td></tr>').join('')||'<tr><td colspan="12">No bowlers registered yet.</td></tr>';
  document.getElementById('reportTotals').innerHTML='<div>Total charges<strong>'+money(report.collected)+'</strong></div><div>Payments received<strong>'+money(report.received)+'</strong></div><div>Outstanding<strong>'+money(report.outstanding)+'</strong></div><div>Total winnings<strong>'+money(report.awarded)+'</strong></div><div>Total to settle now<strong class="'+balanceClass(report.settlement)+'">'+balanceText(report.settlement)+'</strong></div>';
  translateUI();
}
function resetForm() {
  editingId=null;document.getElementById('bowlerForm').reset();document.getElementById('handicap').value=0;
  document.getElementById('hdcpCount').value=1;document.getElementById('scratchCount').value=1;
  document.getElementById('saveBowler').textContent='Add bowler';document.getElementById('cancelEdit').classList.add('hidden');toggleCounts();
}
function toggleCounts() {
  for(const t of ['Hdcp','Scratch']) {
    const on=document.getElementById('join'+t).checked;
    document.getElementById(t.toLowerCase()+'CountWrap').classList.toggle('hidden',!on);
    document.getElementById(t.toLowerCase()+'Count').required=on;
  }
}
function backupPackage(data) {
  return {format:'monster-bowling-backup',version:3,exportedAt:new Date().toISOString(),competition:data};
}
function validBackup(packageData) {
  const data=packageData?.competition;
  if(packageData?.format!=='monster-bowling-backup'||!data?.config||!configured(data.config)||!Array.isArray(data.bowlers)||!Array.isArray(data.pairs)||!Array.isArray(data.brackets?.hdcp)||!Array.isArray(data.brackets?.scratch)) return false;
  const ids=new Set();
  for(const b of data.bowlers) {
    if(typeof b.id!=='string'||typeof b.name!=='string'||!b.name.trim()||ids.has(b.id)||!Number.isInteger(b.handicap)||b.handicap<0||b.handicap>300||!b.scores) return false;
    if(!['g1','g2','g3'].every(g=>b.scores[g]===null||(Number.isInteger(b.scores[g])&&b.scores[g]>=0&&b.scores[g]<=300))) return false;
    ids.add(b.id);
  }
  return [...data.brackets.hdcp,...data.brackets.scratch].every(bracket=>Array.isArray(bracket)&&bracket.length===8&&bracket.every(id=>id===null||ids.has(id)))&&
    data.pairs.every(pair=>Array.isArray(pair)&&pair.length===2&&pair[0]!==pair[1]&&pair.every(id=>ids.has(id)));
}
async function downloadBackup() {
  const json=JSON.stringify(backupPackage(state),null,2),name='monster-bowling-backup-'+new Date().toISOString().slice(0,10)+'.json';
  if(window.showSaveFilePicker) {
    const handle=await window.showSaveFilePicker({suggestedName:name,types:[{description:'JSON backup',accept:{'application/json':['.json']}}]});
    const writer=await handle.createWritable();await writer.write(json);await writer.close();
    return true;
  }
  const url=URL.createObjectURL(new Blob([json],{type:'application/json'}));
  const link=document.createElement('a');link.href=url;link.download=name;link.click();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
  return false;
}
function setup() {
  document.getElementById('language').addEventListener('change',e=>{state.language=e.target.value==='es'?'es':'en';try{localStorage.setItem(LANGUAGE_KEY,state.language);}catch{}persist();render();});
  document.querySelectorAll('[data-tab]').forEach(btn=>btn.addEventListener('click',()=>{
    document.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('active',x===btn));
    document.querySelectorAll('.panel').forEach(x=>x.classList.toggle('active',x.id===btn.dataset.tab));render();
  }));
  CONFIG_IDS.forEach(id=>document.getElementById(id).addEventListener('change',e=>{
    const value=e.target.type==='checkbox'?e.target.checked:num(e.target.value,NaN);
    const candidate={...state.config,[id]:value};
    if((e.target.type!=='checkbox'&&!e.target.value)||!configured(candidate)){status('Check the buy-ins and fixed payout amounts.');if(e.target.type==='checkbox')e.target.checked=state.config[id];else e.target.value=state.config[id];return;}
    state.config=candidate;render();
    document.getElementById('configSaveState').textContent='Changes not saved yet.';
    status('Configuration changed. Select Save payout configuration to keep it.');
  }));
  document.getElementById('saveConfig').addEventListener('click',async()=>{
    const candidate={...state.config};
    for(const id of CONFIG_IDS) {
      const el=document.getElementById(id);
      candidate[id]=el.type==='checkbox'?el.checked:num(el.value,NaN);
    }
    const saveState=document.getElementById('configSaveState');
    if(!configured(candidate)){saveState.textContent='Check the fixed payout amounts.';status('Check the payout configuration.');return;}
    saveState.textContent='Saving…';
    try {
      state.config=candidate;
      if(globalThis.MONSTER_PORTAL_MODE) await globalThis.MonsterPortal.saveConfiguration(candidate);
      else localStorage.setItem(KEY,JSON.stringify(state));
      saveState.textContent='Saved to Neon.';status('Payout configuration saved.');
    } catch(error) {
      saveState.textContent='Could not save. '+(error.message||'Try again.');status('Payout configuration was not saved.');
    }
  });
  ['Hdcp','Scratch'].forEach(t=>document.getElementById('join'+t).addEventListener('change',toggleCounts));
  document.getElementById('bowlerForm').addEventListener('submit',e=>{
    e.preventDefault();
    const name=document.getElementById('name').value.trim(),email=document.getElementById('bowlerEmail').value.trim().toLowerCase(),handicap=Number(document.getElementById('handicap').value);
    const hdcpCount=document.getElementById('joinHdcp').checked?Number(document.getElementById('hdcpCount').value):0;
    const scratchCount=document.getElementById('joinScratch').checked?Number(document.getElementById('scratchCount').value):0;
    if(!name || !Number.isInteger(handicap)||handicap<0||handicap>300||![hdcpCount,scratchCount].every(n=>Number.isInteger(n)&&n>=0)||
      (document.getElementById('joinHdcp').checked&&hdcpCount<1)||(document.getElementById('joinScratch').checked&&scratchCount<1)){status('Check the name, handicap and bracket counts.');return;}
    if(!editingId && state.bowlers.some(b=>b.name.toLowerCase()===name.toLowerCase())){status('A bowler with that name is already registered.');return;}
    if(editingId && state.bowlers.some(b=>b.id!==editingId&&b.name.toLowerCase()===name.toLowerCase())){status('A bowler with that name is already registered.');return;}
    const prior=state.bowlers.find(b=>b.id===editingId);
    const onTeam=editingId&&pairCount(state,editingId)>0;
    if(email&&state.bowlers.some(b=>b.id!==editingId&&b.email===email)){status('That login email is already linked to another bowler.');return;}
    const bowler={id:editingId||String(Date.now())+Math.random().toString(36).slice(2),name,email,handicap,hdcpCount,scratchCount,high:document.getElementById('joinHigh').checked,pairs:document.getElementById('joinPairs').checked||!!onTeam,scores:prior?.scores||blankScores(),paid:prior?.paid||false};
    if(prior) state.bowlers[state.bowlers.indexOf(prior)]=bowler;else state.bowlers.push(bowler);
    // Registration changes invalidate the bracket draw; manually added teams keep their member IDs.
    state.brackets={hdcp:[],scratch:[]};state.generated=false;
    persist();resetForm();render();status('Bowler saved. Generate brackets again after roster changes.');
  });
  document.getElementById('cancelEdit').addEventListener('click',resetForm);
  document.getElementById('rosterRows').addEventListener('click',e=>{
    const edit=e.target.closest('[data-edit]'),remove=e.target.closest('[data-remove]'),paid=e.target.closest('[data-paid]');
    if(paid){const b=state.bowlers.find(x=>x.id===paid.dataset.paid);if(!b)return;const previous=!!b.paid;b.paid=paid.checked;render();status('Saving payment status…');
      void (async()=>{try{if(globalThis.MONSTER_PORTAL_MODE)await globalThis.MonsterPortal.savePayment(b.id,b.paid);else localStorage.setItem(KEY,JSON.stringify(state));status(b.name+(b.paid?' marked paid. Full winnings are now payable.':' marked unpaid. Entry charges will be deducted from winnings.'));}catch(error){b.paid=previous;render();status('Payment status was not saved: '+(error.message||'Try again.'));}})();return;}
    if(edit){const b=state.bowlers.find(x=>x.id===edit.dataset.edit);if(!b)return;editingId=b.id;document.getElementById('name').value=b.name;document.getElementById('bowlerEmail').value=b.email||'';document.getElementById('handicap').value=b.handicap;document.getElementById('joinHdcp').checked=b.hdcpCount>0;document.getElementById('joinScratch').checked=b.scratchCount>0;document.getElementById('joinHigh').checked=b.high;document.getElementById('joinPairs').checked=b.pairs;document.getElementById('hdcpCount').value=b.hdcpCount||1;document.getElementById('scratchCount').value=b.scratchCount||1;document.getElementById('saveBowler').textContent='Save changes';document.getElementById('cancelEdit').classList.remove('hidden');toggleCounts();document.getElementById('name').focus();}
    if(remove){const b=state.bowlers.find(x=>x.id===remove.dataset.remove);if(!b||!confirm('Remove '+b.name+' and their Doubles teams?'))return;state.bowlers=state.bowlers.filter(x=>x.id!==b.id);state.brackets={hdcp:[],scratch:[]};state.generated=false;state.pairs=state.pairs.filter(ids=>!ids.includes(b.id));persist();render();status('Bowler and their Doubles teams removed. Generate brackets again.');}
  });
  document.getElementById('generate').addEventListener('click',()=>{
    state.brackets={hdcp:buildBrackets(state.bowlers,'hdcp'),scratch:buildBrackets(state.bowlers,'scratch')};state.generated=true;persist();render();
    const total=state.brackets.hdcp.length+state.brackets.scratch.length;
    status(total?total+' bracket'+(total===1?'':'s')+' generated.':'No brackets generated. At least seven different bowlers must join an event.');
  });
  document.getElementById('generateHigh').addEventListener('click',()=>{state.highGenerated=true;persist();render();status('High Game standings updated.');});
  const pairMessage=(id)=>{
    const input=document.getElementById('pairName'+id),help=document.getElementById('pairHelp'+id),value=input.value.trim().toLocaleLowerCase();
    help.textContent=value&&!state.bowlers.some(b=>b.name.toLocaleLowerCase().startsWith(value))?'Please register bowler.':'';
    translateUI();
  };
  [1,2].forEach(i=>{
    document.getElementById('pairName'+i).addEventListener('input',()=>pairMessage(i));
    document.getElementById('pairName'+i).addEventListener('blur',e=>{
      const value=e.target.value.trim();
      if(value&&!state.bowlers.some(b=>b.name.toLocaleLowerCase()===value.toLocaleLowerCase())){document.getElementById('pairHelp'+i).textContent='Please register bowler.';translateUI();}
    });
  });
  document.getElementById('addPairForm').addEventListener('submit',e=>{
    e.preventDefault();
    const result=addTeamByNames(state,document.getElementById('pairName1').value,document.getElementById('pairName2').value);
    if(result==='not_registered'){
      [1,2].forEach(i=>{
        const value=document.getElementById('pairName'+i).value.trim().toLocaleLowerCase();
        document.getElementById('pairHelp'+i).textContent=state.bowlers.some(b=>b.name.toLocaleLowerCase()===value)?'':'Please register bowler.';
      });
      status('Please register bowler.');return;
    }
    if(result==='same_bowler'){status('A Doubles team needs two different bowlers.');return;}
    if(result==='duplicate_team'){status('This Doubles team is already registered.');return;}
    persist();e.target.reset();document.getElementById('pairHelp1').textContent='';document.getElementById('pairHelp2').textContent='';render();status('Doubles team added.');
  });
  document.getElementById('teamList').addEventListener('click',e=>{
    const button=e.target.closest('[data-remove-pair]');if(!button)return;
    const index=Number(button.dataset.removePair),ids=state.pairs[index];
    if(!ids||!confirm('Remove this Doubles team?'))return;
    state.pairs.splice(index,1);persist();render();status('Doubles team removed.');
  });
  document.getElementById('brackets').addEventListener('click',e=>{
    const button=e.target.closest('[data-download]');if(!button)return;
    const svg=button.closest('.bracket').querySelector('svg');
    const file=new Blob([new XMLSerializer().serializeToString(svg)],{type:'image/svg+xml;charset=utf-8'});
    const link=document.createElement('a');link.href=URL.createObjectURL(file);
    link.download='monster-bowling-'+button.dataset.download.replace(':','-')+'.svg';link.click();
    setTimeout(()=>URL.revokeObjectURL(link.href),1000);
  });
  document.getElementById('scoreRows').addEventListener('change',e=>{
    const id=e.target.dataset.score;if(!id)return;const b=state.bowlers.find(x=>x.id===id);if(!b)return;
    const raw=e.target.value;
    if(raw!==''&&(!Number.isInteger(Number(raw))||Number(raw)<0||Number(raw)>300)){status('Enter a whole game score from 0 to 300.');render();return;}
    b.scores[e.target.dataset.game]=raw===''?null:Number(raw);persist();render();status('Score saved.');
  });
  document.getElementById('startNew').addEventListener('click',async()=>{
    if(globalThis.MONSTER_PORTAL_MODE){ try{await globalThis.MonsterPortal?.startNew();}catch(error){status(error.message||'Could not save the session.');} return; }
    let confirmedSave=false;
    try { confirmedSave=await downloadBackup(); }
    catch(e) { status('Backup was not saved. Competition data was kept.');return; }
    const prompt=confirmedSave?'Backup saved. Clear this competition and start from scratch?':'Check that the JSON backup downloaded successfully. Clear this competition and start from scratch?';
    if(!confirm(prompt)){status('Competition data was kept.');return;}
    const language=state.language;state=fresh();state.language=language;persist();resetForm();document.getElementById('addPairForm').reset();document.getElementById('pairHelp1').textContent='';document.getElementById('pairHelp2').textContent='';document.querySelector('[data-tab="registration"]').click();status('New competition started. Previous data is in your JSON backup.');
  });
  document.getElementById('restoreBackup').addEventListener('change',async e=>{
    const file=e.target.files?.[0];if(!file)return;
    try {
      const packageData=JSON.parse(await file.text());
      if(!validBackup(packageData)){status('This is not a valid Monster Bowling backup.');return;}
      if(!confirm('Replace the current competition with this backup?'))return;
      if(globalThis.MONSTER_PORTAL_MODE){state=packageData.competition;persist();}
      else {localStorage.setItem(KEY,JSON.stringify(packageData.competition));state=load();}
      resetForm();document.getElementById('addPairForm').reset();render();status('Backup restored.');
    } catch { status('Could not read the JSON backup.'); }
    finally { e.target.value=''; }
  });
  toggleCounts();render();
}
function matchupSummary(data) {
  const names=Object.fromEntries(data.bowlers.map(b=>[b.id,b.name]));
  const rounds=[new Map(),new Map(),new Map()];
  const add=(round,a,b)=>{if(!a||!b)return;for(const [x,y] of [[a,b],[b,a]]){if(!rounds[round].has(x))rounds[round].set(x,[]);rounds[round].get(x).push(names[y]);}};
  for(const type of ['hdcp','scratch']) for(const ids of data.brackets[type]||[]) {
    for(let i=0;i<8;i+=2)add(0,ids[i],ids[i+1]);
    const first=[];for(let i=0;i<8;i+=2){const r=match([ids[i],ids[i+1]],1,type==='hdcp',data.bowlers);first.push(r.winners.length===1?r.winners[0].id:null);}
    add(1,first[0],first[1]);add(1,first[2],first[3]);
    const second=[match(first.slice(0,2),2,type==='hdcp',data.bowlers),match(first.slice(2,4),2,type==='hdcp',data.bowlers)].map(r=>r.winners.length===1?r.winners[0].id:null);add(2,second[0],second[1]);
  }
  return rounds.map(map=>[...map].map(([id,opponents])=>({id,name:names[id],opponents})).sort((a,b)=>a.name.localeCompare(b.name)));
}
if(typeof window!=='undefined') window.BowlingApp={
  fresh,
  setState(data){
    if(!data||!Array.isArray(data.bowlers)||!data.config) throw new Error('Invalid competition data');
    const language=state.language;state={...fresh(),...data,language,config:{...DEFAULT_CONFIG,...data.config}};
    resetForm();render();
  },
  getState(){return structuredClone(state);},
  exportBackup:downloadBackup,
  bracketGraphic,
  snapshot(){
    const report=reportSummary(state),awards=calculate(state).awards;
    const names=Object.fromEntries(state.bowlers.map(b=>[b.id,b.name]));
    const publicData={
      updatedAt:new Date().toISOString(),
      bowlers:state.bowlers.map(({id,name,handicap,scores,high})=>({id,name,handicap,scores,high})),
      brackets:state.brackets,
      pairs:state.pairs,
      awards:awards.map(({id,category,description,amount})=>({name:names[id]||'Bowler',category,description,amount})),
      pending:report.pending,
      matchups:matchupSummary(state),
      standings:[1,2,3].map(g=>state.bowlers.filter(b=>hasGame(b,g)).map(b=>({name:b.name,score:game(b,g,true)})).sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name)))
    };
    const personal=state.bowlers.filter(b=>b.email).map(b=>({
      email:b.email.trim().toLowerCase(),
      data:report.rows.find(r=>r.id===b.id)
    }));
    return {publicData,personal};
  },
  translateUI,
  translateText,
  language:()=>state.language
};
if(typeof document!=='undefined') setup();
if(typeof module!=='undefined') module.exports={fresh,buildBrackets,addTeamByNames,pairCount,bracketGraphic,calculate,reportSummary,backupPackage,validBackup,rankAwards,configured,complete,assignedCount};

