// REX Clock — terminal POS rejestracji czasu pracy (WorkRhythm · Time & Attendance).
// UI wg eksportu REX-Clock-POS v1; dane: wspólny backend REX Cloud (konta + grafik + clock).
import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ArrowRight, Check, CheckCircle2, ChevronLeft, Clock3, Cloud,
  Coffee, CreditCard, KeyRound, LogIn, LogOut, Monitor,
  PauseCircle, RefreshCw, ShieldCheck, TimerReset, User as UserRound, Wifi, WifiOff, X,
} from 'lucide-react';
import './pos.css';

const API_BASE = String(import.meta.env.VITE_API_BASE || 'https://rex-cloud-backend.vercel.app/api').replace(/\/$/, '');
const TERMINAL_ID = new URLSearchParams(location.search).get('terminal')
  || localStorage.getItem('rex_clock_terminal') || 'K003-POS-01';
try { localStorage.setItem('rex_clock_terminal', TERMINAL_ID); } catch {}

const actionCopy = {
  clock_in: { title: 'Clock in', description: 'Rozpoczęcie zmiany' },
  clock_out: { title: 'Clock out', description: 'Zakończenie zmiany' },
  break_start: { title: 'Start break', description: 'Rozpoczęcie przerwy' },
  break_end: { title: 'End break', description: 'Zakończenie przerwy' },
};
const FUNKCJA = { CREW: 'Pracownik restauracji', JSM: 'Młodszy kierownik zmiany', SM: 'Kierownik zmiany', ASM: 'Zastępca kierownika', RGM: 'Kierownik restauracji', REST: 'Konto restauracji' };

const Brand = () => (
  <div className="brand"><span className="brand-mark"><Cloud size={26} /></span><div><strong>REX</strong><b>Clock</b><small>WORKRHYTHM</small></div></div>
);
const formatNow = (d) => d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
const statusLabel = (s) => (s === 'working' ? 'W pracy' : s === 'break' ? 'Na przerwie' : 'Poza zmianą');
const clientEventId = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

function App() {
  const [now, setNow] = useState(null);
  const [screen, setScreen] = useState('identify');
  const [method, setMethod] = useState('card');
  const [employeeNumber, setEmployeeNumber] = useState('');
  const [pin, setPin] = useState('');
  const [activeField, setActiveField] = useState('number');
  const [cardBuffer, setCardBuffer] = useState('');
  const [employee, setEmployee] = useState(null);
  const [token, setToken] = useState('');
  const [workState, setWorkState] = useState('off');
  const [pendingAction, setPendingAction] = useState(null);
  const [breakType, setBreakType] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [online, setOnline] = useState(true);
  const [successTime, setSuccessTime] = useState('');

  useEffect(() => {
    const t0 = window.setTimeout(() => setNow(new Date()), 0);
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    const syncNet = () => setOnline(navigator.onLine);
    syncNet(); window.addEventListener('online', syncNet); window.addEventListener('offline', syncNet);
    return () => { window.clearTimeout(t0); window.clearInterval(timer); window.removeEventListener('online', syncNet); window.removeEventListener('offline', syncNet); };
  }, []);

  // czytnik kart magnetycznych działający jak klawiatura
  useEffect(() => {
    if (screen !== 'identify' || method !== 'card') return;
    let reader = ''; let resetTimer = 0;
    const onKey = (event) => {
      window.clearTimeout(resetTimer);
      if (event.key === 'Enter') {
        if (reader.length >= 6) void authenticateCard(reader);
        reader = ''; setCardBuffer(''); return;
      }
      if (event.key.length === 1) {
        reader = (reader + event.key).replace(/[^a-zA-Z0-9]/g, '').slice(-40); setCardBuffer(reader);
        resetTimer = window.setTimeout(() => { reader = ''; setCardBuffer(''); }, 1200);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); window.clearTimeout(resetTimer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, method]);

  const operationalDay = useMemo(() => {
    if (!now) return '—';
    const adjusted = new Date(now);
    const hour = Number(new Intl.DateTimeFormat('pl-PL', { timeZone: 'Europe/Warsaw', hour: '2-digit', hourCycle: 'h23' }).format(now));
    if (hour < 6) adjusted.setDate(adjusted.getDate() - 1);
    return adjusted.toLocaleDateString('pl-PL', { day: '2-digit', month: 'short' });
  }, [now]);

  async function parseResponse(response) {
    const data = await response.json();
    if (!response.ok || data.success === false) throw new Error(String(data.error || 'Nie udało się połączyć z backendem.'));
    return data;
  }

  async function authenticate(payload) {
    if (!online) { setError('Terminal jest offline. Sprawdź połączenie z siecią.'); return; }
    setBusy(true); setError('');
    try {
      const response = await fetch(`${API_BASE}/clock?action=auth`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, terminalId: TERMINAL_ID }) });
      const data = await parseResponse(response);
      setEmployee(data.employee); setToken(String(data.token)); setWorkState(data.state); setScreen('actions');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Nie udało się zidentyfikować pracownika.'); }
    finally { setBusy(false); }
  }
  async function authenticateCard(value) { setMethod('card'); await authenticate({ method: 'card', cardToken: value }); }
  function authenticateCode() {
    if (employeeNumber.length < 4 || pin.length < 4) { setError('Wpisz Employee ID oraz co najmniej 4 cyfry kodu.'); return; }
    void authenticate({ method: 'code', employeeNumber, pin });
  }
  function addDigit(v) {
    setError('');
    if (activeField === 'number') setEmployeeNumber((c) => (c + v).slice(0, 12));
    else setPin((c) => (c + v).slice(0, 8));
  }
  function addChar(v) { setError(''); if (activeField === 'number') setEmployeeNumber((c) => (c + v).slice(0, 12)); }
  function deleteDigit() {
    if (activeField === 'number') setEmployeeNumber((c) => c.slice(0, -1));
    else setPin((c) => c.slice(0, -1));
  }
  function chooseAction(action) { setError(''); setPendingAction(action); setScreen(action === 'break_start' ? 'break' : 'confirm'); }

  async function submitEvent() {
    if (!pendingAction) return;
    setBusy(true); setError('');
    try {
      const response = await fetch(`${API_BASE}/clock?action=event`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, action: pendingAction, breakType, method, terminalId: TERMINAL_ID, clientEventId: clientEventId() }) });
      const data = await parseResponse(response);
      setWorkState(data.state);
      setSuccessTime(new Date(String(data.occurredAt)).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      setScreen('success');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Nie udało się zapisać zdarzenia.'); }
    finally { setBusy(false); }
  }

  function resetTerminal() {
    setScreen('identify'); setMethod('card'); setEmployeeNumber(''); setPin(''); setCardBuffer(''); setEmployee(null);
    setToken(''); setPendingAction(null); setBreakType(null); setError(''); setSuccessTime('');
  }

  const plannedShift = employee && employee.plannedStart && employee.plannedEnd ? `${employee.plannedStart}–${employee.plannedEnd}` : 'Brak opublikowanej zmiany';

  return (
    <main className="kiosk-shell">
      <header className="kiosk-header">
        <Brand />
        <div className="terminal-time">
          <span className={online ? 'online' : 'offline'}>{online ? <Wifi size={15} /> : <WifiOff size={15} />} {online ? 'Online' : 'Offline'}</span>
          <strong>{now ? formatNow(now) : '--:--'}</strong>
          <small>{now ? now.toLocaleDateString('pl-PL', { weekday: 'long', day: '2-digit', month: 'long' }) : 'Łączenie z zegarem…'}</small>
        </div>
        <div className="terminal-meta"><span>RESTAURACJA</span><strong>PLK 201043 · Galeria Krakowska</strong><small>Terminal {TERMINAL_ID} · doba 06:00–06:00</small></div>
      </header>
      <section className="kiosk-content">
        {screen === 'identify' && (
          <div className="identify-screen">
            <div className="screen-heading"><span>REX CLOCK</span><h1>Zarejestruj czas pracy</h1><p>Przeciągnij kartę pracowniczą lub wpisz swój login i PIN.</p></div>
            <div className="method-tabs">
              <button className={method === 'card' ? 'active' : ''} onClick={() => { setMethod('card'); setError(''); }}><CreditCard size={22} /> Karta magnetyczna</button>
              <button className={method === 'code' ? 'active' : ''} onClick={() => { setMethod('code'); setError(''); }}><KeyRound size={22} /> Login + PIN</button>
            </div>
            {method === 'card' ? (
              <div className="swipe-card">
                <div className={`swipe-animation ${cardBuffer ? 'reading' : ''}`}><CreditCard size={60} /><i /><ArrowRight size={30} /></div>
                <h2>{busy ? 'Sprawdzanie karty…' : cardBuffer ? 'Odczytywanie…' : 'Przeciągnij kartę'}</h2>
                <p>Czytnik rozpozna pracownika po kodzie karty lub loginie i pokaże dostępne akcje.</p>
              </div>
            ) : (
              <div className="code-card">
                <div className="code-fields">
                  <button className={activeField === 'number' ? 'active' : ''} onClick={() => setActiveField('number')}><small>Login</small><strong>{employeeNumber || '— — — — — —'}</strong></button>
                  <button className={activeField === 'pin' ? 'active' : ''} onClick={() => setActiveField('pin')}><small>PIN</small><strong>{pin ? '• '.repeat(pin.length) : '— — — —'}</strong></button>
                </div>
                <div className="keypad">
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((v) => <button key={v} onClick={() => addDigit(v)}>{v}</button>)}
                  <button className="key-small" onClick={() => (activeField === 'number' ? setEmployeeNumber('') : setPin(''))}>Wyczyść</button>
                  <button onClick={() => addDigit('0')}>0</button>
                  <button className="key-small" onClick={deleteDigit}>Usuń</button>
                </div>
                {activeField === 'number' && (
                  <div className="keypad letters">
                    {'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((l) => <button key={l} className="key-letter" onClick={() => addChar(l)}>{l}</button>)}
                  </div>
                )}
                <div className="code-actions">
                  <button className="primary-button" disabled={busy || employeeNumber.length < 4 || pin.length < 4} onClick={authenticateCode}>{busy ? <RefreshCw className="spin" size={20} /> : <Check size={20} />} Zatwierdź</button>
                </div>
              </div>
            )}
            {error && <div className="error-message"><X size={18} /><span>{error}</span></div>}
            <div className="privacy-note"><ShieldCheck size={17} /><span>Dane trafiają bezpośrednio do centralnego rejestru WorkRhythm (REX Cloud).</span></div>
          </div>
        )}
        {screen === 'actions' && employee && (
          <div className="actions-screen">
            <div className="employee-card">
              <div className="employee-avatar"><UserRound size={56} /><i className={workState} /></div>
              <div className="employee-copy"><span>WITAJ</span><h1>{employee.fullName}</h1><p>{FUNKCJA[employee.role] || employee.role} · {employee.employeeNumber}</p></div>
              <div className={`state-card ${workState}`}><small>STATUS</small><strong>{statusLabel(workState)}</strong><span>{workState === 'off' ? 'Gotowy do rozpoczęcia' : workState === 'break' ? 'Przerwa w toku' : 'Zmiana w toku'}</span></div>
            </div>
            <div className="plan-strip">
              <Clock3 size={22} />
              <div><span>ZMIANA Z GRAFIKU · DZIŚ</span><strong>{plannedShift}</strong><small>{employee.station ? `${employee.station} · ` : ''}Schedule → Actual</small></div>
              <em>{workState === 'off' ? 'OCZEKUJE' : 'ACTIVE'}</em>
            </div>
            <div className={`action-grid ${workState}`}>
              {workState === 'off' && <button className="action-button clock-in" onClick={() => chooseAction('clock_in')}><span><LogIn size={38} /></span><strong>Clock in</strong><small>Rozpocznij zmianę</small></button>}
              {workState === 'working' && (<>
                <button className="action-button break-action" onClick={() => chooseAction('break_start')}><span><PauseCircle size={38} /></span><strong>Start break</strong><small>Rozpocznij przerwę</small></button>
                <button className="action-button clock-out" onClick={() => chooseAction('clock_out')}><span><LogOut size={38} /></span><strong>Clock out</strong><small>Zakończ zmianę</small></button>
              </>)}
              {workState === 'break' && <button className="action-button clock-in" onClick={() => chooseAction('break_end')}><span><TimerReset size={38} /></span><strong>End break</strong><small>Zakończ przerwę</small></button>}
            </div>
            <button className="change-user" onClick={resetTerminal}><UserRound size={18} /> To nie ja — zmień pracownika</button>
          </div>
        )}
        {screen === 'break' && (
          <div className="choice-screen">
            <button className="back-button" onClick={() => setScreen('actions')}><ChevronLeft size={20} /> Wróć</button>
            <div className="screen-heading"><span>START BREAK</span><h1>Wybierz rodzaj przerwy</h1><p>Rodzaj przerwy wpływa na czas netto widoczny w panelu administratora.</p></div>
            <div className="break-options">
              <button onClick={() => { setBreakType('unpaid'); setScreen('confirm'); }}><span className="unpaid"><Coffee size={32} /></span><div><strong>Meal break</strong><small>Przerwa niepłatna</small></div><em>UNPAID</em></button>
              <button onClick={() => { setBreakType('paid'); setScreen('confirm'); }}><span className="paid"><PauseCircle size={32} /></span><div><strong>Rest break</strong><small>Przerwa płatna</small></div><em>PAID</em></button>
            </div>
            <div className="break-info"><ShieldCheck size={20} /><div><strong>Pełna historia zdarzeń</strong><span>Korekta błędnego odbicia odbywa się wyłącznie w panelu administratora i zostaje zapisana.</span></div></div>
          </div>
        )}
        {screen === 'confirm' && pendingAction && employee && (
          <div className="confirm-screen">
            <div className={`confirm-icon ${pendingAction}`}>{pendingAction === 'clock_in' ? <LogIn size={48} /> : pendingAction === 'clock_out' ? <LogOut size={48} /> : pendingAction === 'break_end' ? <TimerReset size={48} /> : <Coffee size={48} />}</div>
            <span>POTWIERDŹ ZDARZENIE</span>
            <h1>{actionCopy[pendingAction].title}</h1>
            <p>{actionCopy[pendingAction].description}{pendingAction === 'break_start' ? ` · ${breakType === 'paid' ? 'płatna' : 'niepłatna'}` : ''}</p>
            <div className="confirm-grid">
              <div><small>Pracownik</small><strong>{employee.fullName}</strong></div>
              <div><small>Czas terminala</small><strong>{now ? formatNow(now) : '--:--'}</strong></div>
              <div><small>Metoda</small><strong>{method === 'card' ? 'Karta magnetyczna' : 'Login + PIN'}</strong></div>
              <div><small>Doba operacyjna</small><strong>{operationalDay} · 06:00–06:00</strong></div>
            </div>
            {error && <div className="error-message"><X size={18} /><span>{error}</span></div>}
            <div className="confirm-actions">
              <button className="cancel-button" disabled={busy} onClick={() => setScreen('actions')}><X size={24} /> Anuluj</button>
              <button className="accept-button" disabled={busy} onClick={() => void submitEvent()}>{busy ? <RefreshCw className="spin" size={27} /> : <Check size={30} />} Potwierdzam</button>
            </div>
          </div>
        )}
        {screen === 'success' && pendingAction && employee && (
          <div className="success-screen">
            <div className="success-icon"><CheckCircle2 size={66} /></div>
            <span>ZDARZENIE ZAPISANE</span>
            <h1>{actionCopy[pendingAction].title}</h1>
            <p>{employee.fullName} · {successTime}</p>
            <div className="sync-note"><Cloud size={20} /><div><strong>Przekazano do centralnego rejestru</strong><span>REX Cloud zapisał zdarzenie dla doby {operationalDay}.</span></div></div>
            <button className="primary-button finish" onClick={resetTerminal}>Gotowe · następny pracownik <ArrowRight size={20} /></button>
          </div>
        )}
      </section>
      <footer className="kiosk-footer"><span><Monitor size={15} /> {TERMINAL_ID}</span><span>REX WorkRhythm · Time & Attendance</span><span><ShieldCheck size={15} /> Central backend</span></footer>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
