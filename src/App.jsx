import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Play, Square, RotateCcw, Activity, Shield, Users, Globe, 
  Settings, History, BarChart3, Moon, Sun, Download, Trash2,
  AlertTriangle, CheckCircle2, Info, Bell
} from 'lucide-react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, AreaChart, Area, Legend 
} from 'recharts';

// --- Types & Constants ---
const LIMIT_TYPES = {
  SESSION: 'session',
  USER: 'user',
  SERVER: 'server'
};

// --- Custom Components ---

const Toast = ({ message, type, id, onDismiss }) => {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(id), 4000);
    return () => clearTimeout(timer);
  }, [id, onDismiss]);

  const icons = {
    success: <CheckCircle2 size={18} style={{ color: 'var(--success)' }} />,
    error: <AlertTriangle size={18} style={{ color: 'var(--error)' }} />,
    warning: <AlertTriangle size={18} style={{ color: 'var(--warning)' }} />,
    info: <Info size={18} style={{ color: 'var(--accent-primary)' }} />
  };

  const borderClass = type === 'success' ? 'border-emerald-500' : type === 'warning' ? 'border-amber-500' : 'border-rose-500';

  return (
    <div className={`toast-item animate-fade p-3 mb-2 rounded-lg border flex items-center gap-3 ${borderClass}`} 
      style={{ 
        minWidth: '220px', 
        maxWidth: '300px',
        backgroundColor: 'var(--bg-secondary)', 
        boxShadow: '0 10px 15px -3px rgba(0,0,0,0.5)',
        zIndex: 1000
      }}>
      {icons[type]}
      <div className="flex-1 text-sm font-bold truncate">{message}</div>
      <button onClick={() => onDismiss(id)} className="text-tertiary hover:text-primary">
        <Trash2 size={14} />
      </button>
    </div>
  );
};

export default function App() {
  // --- States ---
  const [theme, setTheme] = useState('dark');
  const [isRunning, setIsRunning] = useState(false);
  const [showConfig, setShowConfig] = useState(true); // For mobile/small screens toggle
  
  const [config, setConfig] = useState({
    url: 'https://api.mock.test/v1/resource',
    limitType: LIMIT_TYPES.SESSION,
    maxRequests: 10,
    window: 10, // seconds
    userId: 'user-123',
    sessionId: 'sess-abc',
    concurrency: 2,
    interval: 500, // ms
    mockMode: true,
    method: 'GET',
    headers: '',
    body: '',
    showOnlyErrors: false,
    enableToasts: true
  });

  const [logs, setLogs] = useState([]);
  const [metrics, setMetrics] = useState({
    total: 0,
    success: 0,
    blocked: 0,
    avgLatency: 0
  });
  const [chartData, setChartData] = useState([]);
  const [toasts, setToasts] = useState([]);
  
  const runIdRef = useRef(0);
  const activeLimitRef = useRef(new Map());

  // --- Effects ---
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // --- Mock Engine Logic ---
  const simulateApiCall = async (id) => {
    const startTime = Date.now();
    const { maxRequests, window: timeWindow, mockMode, url, limitType, userId, sessionId } = config;

    if (mockMode) {
      await new Promise(r => setTimeout(r, Math.random() * 200 + 50));
      const now = Date.now();
      const windowMs = timeWindow * 1000;
      const key = limitType === LIMIT_TYPES.USER ? userId : limitType === LIMIT_TYPES.SESSION ? sessionId : 'global';
      
      if (!activeLimitRef.current.has(key)) {
        activeLimitRef.current.set(key, []);
      }
      
      let history = activeLimitRef.current.get(key);
      history = history.filter(t => now - t < windowMs);
      
      const isBlocked = history.length >= maxRequests;
      const latency = Date.now() - startTime;

      if (!isBlocked) {
        history.push(now);
        activeLimitRef.current.set(key, history);
        return { status: 200, latency, id, timestamp: new Date().toISOString() };
      } else {
        return { status: 429, latency, id, timestamp: new Date().toISOString() };
      }
    } else {
      try {
        const fetchOptions = {
          method: config.method,
          headers: {}
        };
        
        if (config.headers) {
          try {
            // Support "Key: Value" or "Authorization: Bearer ..."
            const lines = config.headers.split('\n');
            lines.forEach(line => {
              const [key, ...val] = line.split(':');
              if (key && val.length) fetchOptions.headers[key.trim()] = val.join(':').trim();
            });
          } catch (e) { console.error("Header parse error", e); }
        }

        if (config.method !== 'GET' && config.body) {
          fetchOptions.body = config.body;
        }

        const res = await fetch(url, fetchOptions);
        const latency = Date.now() - startTime;
        return { status: res.status, latency, id, timestamp: new Date().toISOString() };
      } catch (err) {
        return { status: 500, latency: Date.now() - startTime, id, timestamp: new Date().toISOString(), error: err.message };
      }
    }
  };

  // --- Controls ---
  const startTest = async () => {
    setIsRunning(true);
    runIdRef.current += 1;
    const currentRun = runIdRef.current;
    
    let count = 0;
    const executeBatch = async () => {
      // Use a local check for isRunning since the state might not have updated yet in this closure
      // but runIdRef helps identify if a reset happened.
      const run = async () => {
        if (runIdRef.current !== currentRun) return;

        const promises = [];
        for(let i=0; i < config.concurrency; i++) {
          promises.push(simulateApiCall(Date.now() + i + Math.random()));
        }

        const results = await Promise.all(promises);
        
        results.forEach(res => {
          setLogs(prev => [res, ...prev.slice(0, 49)]);
          updateMetrics(res);
          triggerToast(res);
        });

        if (runIdRef.current === currentRun) {
          setTimeout(run, config.interval);
        }
      };
      run();
    };

    executeBatch();
  };

  const stopTest = () => {
    setIsRunning(false);
    runIdRef.current += 1;
  };

  const resetTest = () => {
    stopTest();
    setLogs([]);
    setMetrics({ total: 0, success: 0, blocked: 0, avgLatency: 0 });
    setChartData([]);
    activeLimitRef.current = new Map();
  };

  // --- Helpers ---
  const triggerToast = (res) => {
    if (!config.enableToasts) return;
    if (config.showOnlyErrors && res.status === 200) return;
    
    const type = res.status === 200 ? 'success' : res.status === 429 ? 'warning' : 'error';
    const msg = res.status === 429 ? 'Rate Limited' : res.status === 200 ? 'Success' : `Failed (${res.status})`;
    
    setToasts(prev => [
      { id: Math.random(), message: `${msg} - ${res.latency}ms`, type },
      ...prev.slice(0, 2)
    ]);
  };

  const updateMetrics = (res) => {
    setMetrics(prev => {
      const isSuccess = res.status === 200;
      const isBlocked = res.status === 429;
      const newTotal = prev.total + 1;
      return {
        total: newTotal,
        success: prev.success + (isSuccess ? 1 : 0),
        blocked: prev.blocked + (isBlocked ? 1 : 0),
        avgLatency: Math.floor((prev.avgLatency * prev.total + res.latency) / newTotal)
      };
    });

    setChartData(prev => {
      const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const last = prev[prev.length - 1];
      if (last && last.time === now) {
        return prev.map((d, i) => i === prev.length - 1 ? { 
          ...d, 
          req: d.req + 1, 
          success: d.success + (res.status === 200 ? 1 : 0),
          fail: d.fail + (res.status !== 200 ? 1 : 0)
        } : d);
      }
      return [...prev.slice(-15), { time: now, req: 1, success: res.status === 200 ? 1 : 0, fail: res.status !== 200 ? 1 : 0 }];
    });
  };

  const dismissToast = (id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  const exportLogs = (format) => {
    const data = format === 'csv' 
      ? "Timestamp,Status,Latency\n" + logs.map(l => `${l.timestamp},${l.status},${l.latency}`).join("\n")
      : JSON.stringify(logs, null, 2);
    
    const blob = new Blob([data], { type: format === 'csv' ? 'text/csv' : 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `api_logs_${Date.now()}.${format}`;
    a.click();
  };

  const filteredLogs = useMemo(() => {
    return config.showOnlyErrors ? logs.filter(l => l.status !== 200) : logs;
  }, [logs, config.showOnlyErrors]);

  return (
    <div className="flex h-screen w-full bg-bg-primary overflow-hidden">
      <aside className="w-80 border-r bg-bg-secondary flex flex-col p-6 overflow-y-auto z-20 shadow-lg">
        <div className="flex items-center gap-3 mb-8">
          <div className="p-2 bg-accent-primary rounded-lg text-white shadow-lg shadow-accent-primary/20">
            <Shield size={24} />
          </div>
          <h1 className="text-xl font-bold tracking-tight">LimitTester</h1>
        </div>

        <div className="flex-1 space-y-8">
          <section className="space-y-4">
            <label className="text-xs font-bold text-tertiary uppercase tracking-widest">General</label>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-secondary">Endpoint URL</label>
                <input 
                  type="text" 
                  value={config.url} 
                  onChange={e => setConfig({...config, url: e.target.value})}
                  disabled={isRunning}
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                   <label className="text-sm font-semibold text-secondary">Method</label>
                   <select value={config.method} onChange={e => setConfig({...config, method: e.target.value})} disabled={isRunning}>
                      <option value="GET">GET</option>
                      <option value="POST">POST</option>
                      <option value="PUT">PUT</option>
                      <option value="DELETE">DELETE</option>
                   </select>
                </div>
                <div className="flex items-center gap-2 pt-6">
                   <input 
                    type="checkbox" 
                    checked={config.mockMode} 
                    onChange={e => setConfig({...config, mockMode: e.target.checked})}
                    style={{ width: 'auto' }}
                    disabled={isRunning}
                  />
                  <span className="text-sm font-medium">Auto-sim</span>
                </div>
              </div>

              {!config.mockMode && (
                <div className="space-y-4 animate-fade">
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold text-secondary">Headers (Key: Value)</label>
                    <textarea 
                      className="w-full text-xs font-mono p-2 bg-bg-tertiary rounded border border-border-color"
                      rows="2"
                      placeholder="Authorization: Bearer ..."
                      value={config.headers}
                      onChange={e => setConfig({...config, headers: e.target.value})}
                    />
                  </div>
                  {config.method !== 'GET' && (
                    <div className="space-y-1.5">
                      <label className="text-sm font-semibold text-secondary">Request Body (JSON)</label>
                      <textarea 
                        className="w-full text-xs font-mono p-2 bg-bg-tertiary rounded border border-border-color"
                        rows="2"
                        placeholder='{"key": "value"}'
                        value={config.body}
                        onChange={e => setConfig({...config, body: e.target.value})}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>

          <section className="space-y-4">
            <label className="text-xs font-bold text-tertiary uppercase tracking-widest">Strategy</label>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-secondary">Target Level</label>
                <select 
                  value={config.limitType}
                  onChange={e => setConfig({...config, limitType: e.target.value})}
                  disabled={isRunning}
                >
                  <option value={LIMIT_TYPES.SESSION}>Session</option>
                  <option value={LIMIT_TYPES.USER}>User</option>
                  <option value={LIMIT_TYPES.SERVER}>Global Server</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-secondary">Limit (Req)</label>
                  <input 
                    type="number" 
                    value={config.maxRequests}
                    onChange={e => setConfig({...config, maxRequests: parseInt(e.target.value) || 0})}
                    disabled={isRunning}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-secondary">Window (s)</label>
                  <input 
                    type="number" 
                    value={config.window}
                    onChange={e => setConfig({...config, window: parseInt(e.target.value) || 0})}
                    disabled={isRunning}
                  />
                </div>
              </div>
              {config.limitType !== LIMIT_TYPES.SERVER && (
                 <div className="space-y-1.5 animate-fade">
                    <label className="text-sm font-semibold text-secondary">{config.limitType === LIMIT_TYPES.USER ? 'User ID' : 'Session ID'}</label>
                    <input 
                      type="text" 
                      value={config.limitType === LIMIT_TYPES.USER ? config.userId : config.sessionId} 
                      onChange={e => setConfig({...config, [config.limitType === LIMIT_TYPES.USER ? 'userId' : 'sessionId']: e.target.value})} 
                      disabled={isRunning} 
                    />
                 </div>
              )}
            </div>
          </section>

          <section className="space-y-4">
            <label className="text-xs font-bold text-tertiary uppercase tracking-widest">Flow</label>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-secondary">Batch Size</label>
                <input 
                  type="number" 
                  value={config.concurrency}
                  onChange={e => setConfig({...config, concurrency: parseInt(e.target.value) || 1})}
                  disabled={isRunning}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-secondary">Delay (ms)</label>
                <input 
                  type="number" 
                  value={config.interval}
                  onChange={e => setConfig({...config, interval: parseInt(e.target.value) || 0})}
                  disabled={isRunning}
                />
              </div>
            </div>
          </section>
        </div>

        <div className="pt-6 border-t border-border-color space-y-3 mt-6">
          {!isRunning ? (
            <button 
              onClick={startTest}
              className="w-full flex items-center justify-center gap-2 bg-accent-primary text-white py-2.5 rounded-lg font-bold hover:bg-accent-hover transition-all shadow-lg shadow-accent-primary/30"
            >
              <Play size={18} fill="currentColor" /> Start Simulation
            </button>
          ) : (
            <button 
              onClick={stopTest}
              className="w-full flex items-center justify-center gap-2 bg-error text-white py-2.5 rounded-lg font-bold hover:brightness-110"
            >
              <Square size={18} fill="currentColor" /> Stop Test
            </button>
          )}
          <button 
            onClick={resetTest}
            className="w-full flex items-center justify-center gap-2 bg-bg-tertiary text-primary py-2.5 rounded-lg font-bold hover:bg-border-color"
          >
            <RotateCcw size={18} /> Reset All
          </button>
        </div>
      </aside>

      {/* --- Main Dashboard Area --- */}
      <main className="flex-1 flex flex-col min-w-0 bg-bg-primary overflow-hidden">
        <header className="h-16 border-b px-8 flex items-center justify-between bg-glass-bg backdrop-blur-md z-30">
          <div className="flex items-center gap-4">
             <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent-soft border border-accent-primary/20">
               <span className={`w-2.5 h-2.5 rounded-full ${isRunning ? 'bg-success animate-pulse' : 'bg-tertiary'}`}></span>
               <span className="text-[10px] font-bold uppercase tracking-tighter text-secondary">
                 {isRunning ? 'Running Live Simulation' : 'Ready to Test'}
               </span>
             </div>
          </div>
          
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="p-2 rounded-full hover:bg-bg-tertiary text-secondary transition-colors"
            >
              {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
            </button>
          </div>
        </header>

        <div className="flex-1 p-8 overflow-y-auto space-y-8 scroll-smooth">
          {/* --- Metrics --- */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <MetricCard label="Requests" value={metrics.total} color="var(--accent-primary)" icon={<Globe size={20}/>} />
            <MetricCard label="Passed" value={metrics.success} color="var(--success)" icon={<CheckCircle2 size={20}/>} />
            <MetricCard label="Rate Limited" value={metrics.blocked} color="var(--warning)" icon={<AlertTriangle size={20}/>} />
            <MetricCard label="Latency" value={`${metrics.avgLatency}ms`} color="var(--text-tertiary)" icon={<Activity size={20}/>} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* --- Chart Area --- */}
            <div className="lg:col-span-2 space-y-8">
              <div className="glass-card p-6 rounded-xl relative overflow-hidden">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="font-bold text-primary flex items-center gap-2">
                    <BarChart3 size={18} className="text-accent-primary" />
                    Throughput Analysis
                  </h3>
                  <div className="flex gap-4 text-[10px] font-bold uppercase text-tertiary">
                    <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-accent-primary"></span> Successes</span>
                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full border border-error bg-transparent" style={{borderStyle: 'dashed'}}></span> Blocked</span>
                  </div>
                </div>
                <div className="w-full h-300 mt-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorSuccess" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--accent-primary)" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="var(--accent-primary)" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
                      <XAxis dataKey="time" stroke="var(--text-tertiary)" fontSize={10} axisLine={false} tickLine={false} dy={10} />
                      <YAxis stroke="var(--text-tertiary)" fontSize={10} axisLine={false} tickLine={false} dx={-10} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '12px', boxShadow: 'var(--card-shadow)' }}
                        itemStyle={{ fontSize: '12px', fontWeight: 'bold' }}
                      />
                      <Area type="monotone" dataKey="success" stroke="var(--accent-primary)" fillOpacity={1} fill="url(#colorSuccess)" strokeWidth={3} animationDuration={300} />
                      <Area type="monotone" dataKey="fail" stroke="var(--error)" fill="transparent" strokeWidth={2} strokeDasharray="4 4" animationDuration={300} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Logs */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold flex items-center gap-2">
                    <History size={18} className="text-secondary" />
                    API Trace Stream
                  </h3>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 text-xs font-bold text-tertiary cursor-pointer uppercase tracking-tighter hover:text-secondary transition-colors">
                      <input type="checkbox" checked={config.showOnlyErrors} onChange={e => setConfig({...config, showOnlyErrors: e.target.checked})} />
                      Show Errors Only
                    </label>
                    <div className="flex gap-1">
                       <button onClick={() => exportLogs('csv')} className="p-2 hover:bg-bg-tertiary rounded-lg text-tertiary transition-colors" title="Export CSV"><Download size={16} /></button>
                       <button onClick={() => setLogs([])} className="p-2 hover:bg-bg-tertiary rounded-lg text-tertiary transition-colors" title="Clear Stream"><Trash2 size={16} /></button>
                    </div>
                  </div>
                </div>

                <div className="glass-card rounded-xl overflow-hidden">
                  <div className="overflow-x-auto" style={{ maxHeight: '320px' }}>
                    <table className="w-full text-left text-sm">
                      <thead className="bg-bg-secondary sticky top-0 z-10 border-b">
                        <tr>
                          <th className="px-6 py-4 font-bold text-tertiary uppercase text-[10px]">Time</th>
                          <th className="px-6 py-4 font-bold text-tertiary uppercase text-[10px]">Status</th>
                          <th className="px-6 py-4 font-bold text-tertiary uppercase text-[10px]">Latency</th>
                          <th className="px-6 py-4 font-bold text-tertiary uppercase text-[10px]">Result</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border-color">
                        {filteredLogs.map((log) => (
                          <tr key={log.id} className="hover:bg-accent-soft transition-colors animate-fade">
                            <td className="px-6 py-3.5 font-mono text-[11px] text-secondary">
                              {new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute:'2-digit', second:'2-digit', fractionalSecondDigits: 1 })}
                            </td>
                            <td className="px-6 py-3.5">
                              <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                                log.status === 200 ? 'bg-success/10 text-success' : 
                                log.status === 429 ? 'bg-warning/10 text-warning' : 
                                'bg-error/10 text-error'
                              }`}>
                                {log.status}
                              </span>
                            </td>
                            <td className="px-6 py-3.5 font-bold text-secondary">{log.latency}ms</td>
                            <td className="px-6 py-3.5">
                              <span className="text-[10px] font-bold text-tertiary uppercase italic">
                                {log.status === 200 ? 'Authorized' : log.status === 429 ? 'Throttled' : 'System Error'}
                              </span>
                            </td>
                          </tr>
                        ))}
                        {filteredLogs.length === 0 && (
                          <tr>
                            <td colSpan="4" className="px-6 py-20 text-center text-tertiary text-sm italic">
                              Queue empty. Awaiting signals...
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>

            {/* --- Info Column --- */}
            <div className="space-y-6">
              <section className="p-6 bg-accent-soft rounded-xl border border-accent-primary/20 space-y-4">
                <h4 className="font-bold text-sm text-accent-primary uppercase tracking-tighter">System Intelligence</h4>
                <ul className="space-y-3 text-xs">
                   <li className="flex gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-accent-primary mt-1 flex-shrink-0"></div>
                      <p className="text-secondary leading-relaxed"><strong>Token Bucket Simulation</strong> fires based on the batch size and delay configured in the sidebar.</p>
                   </li>
                   <li className="flex gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-accent-primary mt-1 flex-shrink-0"></div>
                      <p className="text-secondary leading-relaxed"><strong>Visual feedback</strong> peaks when request concurrency exceeds the server's threshold.</p>
                   </li>
                </ul>
              </section>
            </div>
          </div>
        </div>
      </main>

      {/* --- Notification Portals (Moved to Top Right and limited) --- */}
      <div className="fixed top-4 right-4 flex flex-col items-end pointer-events-none" style={{ zIndex: 99999 }}>
        {toasts.map(toast => (
          <div key={toast.id} className="pointer-events-auto">
            <Toast {...toast} onDismiss={dismissToast} />
          </div>
        ))}
      </div>
    </div>
  );
}

function MetricCard({ label, value, color, icon }) {
  return (
    <div className="glass-card p-6 rounded-xl relative overflow-hidden group">
      <div className="absolute -right-2 -bottom-2 opacity-5 group-hover:scale-125 transition-transform duration-500" style={{ color }}>
         {React.cloneElement(icon, { size: 80 })}
      </div>
      <div className="flex flex-col gap-1 relative z-10">
        <span className="text-[10px] font-bold text-tertiary uppercase tracking-widest">{label}</span>
        <div className="text-3xl font-bold tracking-tighter" style={{ color: 'var(--text-primary)' }}>{value}</div>
      </div>
      <div className="h-1 w-8 rounded-full mt-4" style={{ backgroundColor: color }}></div>
    </div>
  );
}
