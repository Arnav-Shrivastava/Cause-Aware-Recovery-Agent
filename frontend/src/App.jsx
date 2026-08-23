import React, { useState, useEffect } from 'react';
import { Play, Activity, CheckCircle, XCircle, Clock, AlertTriangle, UserX, FileText, Phone, Mail, MessageSquare, Sun, Moon } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LineChart, Line } from 'recharts';
import { useTheme } from './components/theme-provider';
import { Button } from './components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from './components/ui/card';
import { Skeleton } from './components/ui/skeleton';
const API_BASE = 'http://localhost:8000';

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(amount);
}

function App() {
  const { theme, setTheme } = useTheme();
  const [summary, setSummary] = useState(null);
  const [feed, setFeed] = useState([]);
  const [isRunning, setIsRunning] = useState(false);
  const [auditModal, setAuditModal] = useState(null);
  const [auditData, setAuditData] = useState([]);
  const [auditMessage, setAuditMessage] = useState(null);
  const [loadingAudit, setLoadingAudit] = useState(false);

  const [demoEventId, setDemoEventId] = useState('');
  const [demoContact, setDemoContact] = useState('');
  const [demoResult, setDemoResult] = useState(null);
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoActionId, setDemoActionId] = useState(null);
  const [pollingStatus, setPollingStatus] = useState(null);

  const fetchDashboardData = async () => {
    try {
      const sumRes = await fetch(`${API_BASE}/batch/1/summary`);
      const sumData = await sumRes.json();

      const naiveRes = await fetch(`${API_BASE}/batch/run-naive?n=500&seed=42`, { method: 'POST' });
      const naiveData = await naiveRes.json();
      sumData.naive_baseline = naiveData.recovery_rate;

      setSummary(sumData);

      const feedRes = await fetch(`${API_BASE}/dashboard/feed?limit=20`);
      const feedData = await feedRes.json();
      setFeed(feedData);
    } catch (e) {
      console.error("Error fetching dashboard data:", e);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  useEffect(() => {
    let intervalId;
    if (demoActionId && pollingStatus === 'waiting') {
      const startTime = Date.now();
      const poll = async () => {
        try {
          if (Date.now() - startTime > 120000) {
             setPollingStatus('timeout');
             setDemoActionId(null);
             return;
          }
          const res = await fetch(`${API_BASE}/demo/status/${demoActionId}`);
          if (res.ok) {
            const data = await res.json();
            if (data.outcome === 'recovered') {
               setPollingStatus('recovered');
               setDemoResult(prev => ({
                 ...prev,
                 reply_text: data.reply_text,
                 recovered: true
               }));
               setDemoActionId(null);
               fetchDashboardData();
            }
          }
        } catch (e) {
          console.error("Poll error", e);
        }
      };
      intervalId = setInterval(poll, 3000);
      poll();
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [demoActionId, pollingStatus]);

  const handleRunBatch = async () => {
    setIsRunning(true);
    try {
      await fetch(`${API_BASE}/batch/run?n=500&seed=42`, { method: 'POST' });
      await fetchDashboardData();
    } catch (e) {
      console.error("Error running batch:", e);
    } finally {
      setIsRunning(false);
    }
  };

  const openAuditTrail = async (eventId) => {
    setAuditModal(eventId);
    setLoadingAudit(true);
    try {
      const res = await fetch(`${API_BASE}/audit/${eventId}`);
      const data = await res.json();
      setAuditData(data.logs || []);
      setAuditMessage(data.message_text || null);
    } catch (e) {
      console.error("Error fetching audit trail:", e);
    } finally {
      setLoadingAudit(false);
    }
  };

  const handleLiveDemo = async (channel) => {
    if (!demoEventId || !demoContact) {
      alert("Please select an event and enter a contact (phone or email)");
      return;
    }
    setDemoLoading(true);
    setDemoResult(null);
    setDemoActionId(null);
    setPollingStatus(null);
    try {
      const res = await fetch(`${API_BASE}/demo/send-real`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          failure_event_id: demoEventId,
          channel,
          target_contact: demoContact
        })
      });
      const data = await res.json();
      setDemoResult(data);
      if (data.success && data.recovery_action_id && channel === 'WhatsApp') {
         setDemoActionId(data.recovery_action_id);
         setPollingStatus('waiting');
      }
    } catch (e) {
      console.error(e);
      setDemoResult({ success: false, error: e.message });
    } finally {
      setDemoLoading(false);
    }
  };

  const chartData = summary ? [
    { name: 'Blind Retry', rate: Math.round(summary.naive_baseline * 100), color: '#64748B' },
    { name: 'Cause-Aware Agent', rate: Math.round(summary.recovery_rate * 100), color: '#3B82F6' }
  ] : [];

  return (
    <div className="container mx-auto max-w-7xl p-6 animate-fade-in">
      <header className="flex justify-between items-center mb-8 pb-4 border-b">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Activity className="text-primary" size={24} />
            <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Project Name / Track</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Cause-Aware Recovery Agent
          </h1>
          <p className="text-muted-foreground mt-2">AI-driven revenue recovery bounded by deterministic rules</p>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="p-2 rounded-full hover:bg-accent text-accent-foreground transition-colors"
          >
            {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
          </button>
          {isRunning ? (
            <Skeleton className="h-10 w-[200px]" />
          ) : (
            <Button onClick={handleRunBatch} disabled={isRunning}>
              <Play className="mr-2" size={16} />
              Run Batch (500 events)
            </Button>
          )}
        </div>
      </header>

      {summary && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-8">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">Revenue at Risk</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(summary.at_risk)}</div>
                {summary.daily_at_risk && (
                  <div className="h-12 mt-2 opacity-50">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={summary.daily_at_risk}>
                        <Line type="monotone" dataKey="at_risk" stroke="hsl(var(--muted-foreground))" strokeWidth={2} dot={false} />
                        <Tooltip 
                          contentStyle={{ backgroundColor: 'hsl(var(--popover))', borderColor: 'hsl(var(--border))', borderRadius: 'var(--radius)', fontSize: '12px', padding: '4px 8px', color: 'hsl(var(--popover-foreground))' }}
                          labelStyle={{ display: 'none' }}
                          formatter={(val) => [formatCurrency(val), 'At Risk']}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">Gross Recovered</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(summary.recovered)}</div>
              </CardContent>
            </Card>
            <Card className="border-primary/30 shadow-sm bg-primary/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold text-primary uppercase">Net Recovered</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-primary">{formatCurrency(summary.net_recovered)}</div>
                <div className="text-xs text-muted-foreground mt-1">Cost: {formatCurrency(summary.total_cost)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">Recovery Rate</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{(summary.recovery_rate * 100).toFixed(1)}%</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">Uplift vs Baseline</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600 dark:text-green-500">
                  +{((summary.recovery_rate - summary.naive_baseline) * 100).toFixed(1)} pp
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            {/* Chart */}
            <div className="card flex-col">
              <h3 className="text-lg font-semibold mb-6 flex items-center gap-2">
                <BarChart size={20} className="text-accent" /> Recovery Performance Comparison
              </h3>
              <div style={{ width: '100%', height: 300 }}>
                <ResponsiveContainer>
                  <BarChart data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                    <XAxis dataKey="name" stroke="#94A3B8" />
                    <YAxis tickFormatter={(val) => `${val}%`} stroke="#94A3B8" />
                    <Tooltip 
                      cursor={{fill: 'rgba(255,255,255,0.05)'}}
                      contentStyle={{ backgroundColor: '#1E293B', border: '1px solid #334155', borderRadius: '8px' }}
                      formatter={(value) => [`${value}%`, 'Recovery Rate']}
                    />
                    <Bar dataKey="rate" radius={[4, 4, 0, 0]}>
                      {chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="text-xs text-muted mt-4 text-center italic">
                *Naive blind retry benchmark derived from live simulation (industry average: 15-25%)
              </div>
            </div>

            {/* Breakdown */}
            <div className="card">
              <h3 className="text-lg font-semibold mb-6">Outcome Breakdown</h3>
              <div className="flex flex-col gap-4">
                {[
                  { key: 'recovered', label: 'Recovered', icon: CheckCircle, color: 'text-success' },
                  { key: 'no_response', label: 'No Response', icon: Clock, color: 'text-warning' },
                  { key: 'pending', label: 'Pending (Grace Period)', icon: Clock, color: 'text-info' },
                  { key: 'blocked', label: 'Blocked (Retry Cap)', icon: AlertTriangle, color: 'text-danger' },
                  { key: 'abandon', label: 'Abandoned (Age > 21d)', icon: UserX, color: 'text-abandon' },
                ].map(({ key, label, icon: Icon, color }) => (
                  <div key={key} className="flex items-center justify-between p-3 rounded-lg" style={{ background: 'rgba(255,255,255,0.02)' }}>
                    <div className="flex items-center gap-3">
                      <Icon className={color} size={20} />
                      <span className="font-medium">{label}</span>
                    </div>
                    <span className="font-bold text-xl">{summary.outcome_counts[key] || 0}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Live Demo Send */}
      <div className="card mb-8 border border-accent/20" style={{ background: 'linear-gradient(145deg, #1E293B 0%, #0F172A 100%)' }}>
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Play size={20} className="text-accent" /> Live Demo Send
        </h3>
        <p className="text-sm text-secondary mb-4">
          Test real integrations on a subset of verified numbers. Note: the bulk batch is fully simulated to avoid sending messages to fake numbers.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div>
            <label className="block text-xs font-semibold text-muted uppercase mb-1">Select Event to Replay</label>
            <select 
              className="w-full bg-[#151C2C] border border-[rgba(255,255,255,0.05)] rounded p-2 text-sm"
              value={demoEventId}
              onChange={(e) => setDemoEventId(e.target.value)}
            >
              <option value="">-- Choose an event from the feed --</option>
              {feed.map(f => (
                <option key={f.id} value={f.id}>{f.customer_name} ({f.cause})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted uppercase mb-1">Allowlisted Contact (Phone/Email)</label>
            <input 
              type="text"
              placeholder="+1234567890 or test@example.com"
              className="w-full bg-[#151C2C] border border-[rgba(255,255,255,0.05)] rounded p-2 text-sm"
              value={demoContact}
              onChange={(e) => setDemoContact(e.target.value)}
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-3 mb-4">
          <button 
            className="btn bg-[#25D366]/20 text-[#25D366] hover:bg-[#25D366]/30 border border-[#25D366]/30 flex-1"
            onClick={() => handleLiveDemo('WhatsApp')}
            disabled={demoLoading}
          >
            <MessageSquare size={16} /> Real WhatsApp
          </button>
          <button 
            className="btn bg-accent/20 text-accent hover:bg-accent/30 border border-accent/30 flex-1"
            onClick={() => handleLiveDemo('Voice')}
            disabled={demoLoading}
          >
            <Phone size={16} /> Real Voice Call
          </button>
          <button 
            className="btn bg-white/10 hover:bg-white/20 border border-white/20 flex-1"
            onClick={() => handleLiveDemo('Email')}
            disabled={demoLoading}
          >
            <Mail size={16} /> Real Email
          </button>
        </div>

        {demoResult && (
          <div className={`p-4 rounded-lg text-sm border ${demoResult.success ? (demoResult.provider_message_id ? 'border-success/50 bg-success/10 text-success' : 'border-warning/50 bg-warning/10 text-warning') : 'border-danger/50 bg-danger/10 text-danger'}`}>
            <div className="font-semibold mb-1">
              {demoResult.success ? (demoResult.provider_message_id ? 'Real Send Successful' : 'Fell back to simulation (Not in allowlist or missing creds)') : 'Error'}
            </div>
            {demoResult.provider_message_id && <div>Provider SID/ID: {demoResult.provider_message_id}</div>}
            {demoResult.message_sent && <div className="mt-2 text-white/80 italic">"{demoResult.message_sent}"</div>}
            {demoResult.error && <div>{demoResult.error}</div>}
            
            {pollingStatus === 'waiting' && (
              <div className="mt-4 flex items-center gap-2 text-info">
                <Clock className="animate-spin" size={16} /> Waiting for customer reply via WhatsApp...
              </div>
            )}
            {pollingStatus === 'timeout' && (
              <div className="mt-4 text-warning">
                Timed out waiting for reply (2 minutes elapsed). No reply detected yet.
              </div>
            )}
            {demoResult.recovered && (
              <div className="mt-4 p-3 rounded bg-success/20 border border-success/30 text-success">
                <div className="font-bold flex items-center gap-2"><CheckCircle size={16} /> Recovered!</div>
                {demoResult.reply_text && <div className="mt-1 italic">Customer replied: "{demoResult.reply_text}"</div>}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Feed */}
      <div className="card">
        <h3 className="text-lg font-semibold mb-4">Live Event Feed</h3>
        <p className="text-sm text-secondary mb-4">Click any row to view its deterministic reasoning trail.</p>
        
        {feed.length === 0 ? (
          <div className="text-center p-8 text-muted">No events processed yet. Run a batch to see data.</div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Identified Cause</th>
                  <th>Action Taken</th>
                  <th>Outcome</th>
                  <th className="text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {feed.map((row) => (
                  <tr key={row.id} onClick={() => openAuditTrail(row.id)}>
                    <td className="td-strong">
                      <div>{row.customer_name}</div>
                      <div className="text-xs text-muted font-normal">{row.subscription_type}</div>
                    </td>
                    <td>
                      <div>{row.cause}</div>
                      <div className="text-xs text-muted">{row.raw_decline_code}</div>
                    </td>
                    <td>{row.action_taken}</td>
                    <td><span className={`badge badge-${row.outcome}`}>{row.outcome}</span></td>
                    <td className="text-right font-medium">{formatCurrency(row.mrr_amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {auditModal && (
        <div className="modal-overlay" onClick={() => setAuditModal(null)}>
          <div className="modal-content p-6" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <FileText className="text-accent" />
                Audit Trail & Reasoning
              </h2>
              <button onClick={() => setAuditModal(null)} className="p-2 hover:bg-white/5 rounded-full">
                <XCircle size={24} className="text-muted" />
              </button>
            </div>
            
            {loadingAudit ? (
              <div className="p-8 text-center text-secondary flex items-center justify-center gap-2">
                <Clock className="animate-spin" size={20} /> Loading audit trail...
              </div>
            ) : (
              <div className="audit-timeline">
                {auditData.map((log, i) => (
                  <div key={log.id} className="audit-item">
                    <div className={`audit-dot ${log.actor}`}></div>
                    <div className="flex justify-between items-baseline mb-1">
                      <span className="font-semibold capitalize">{log.event_type}</span>
                      <span className="text-xs text-muted">{new Date(log.created_at).toLocaleTimeString()}</span>
                    </div>
                    <div className="text-sm mb-2">
                      <span className="text-muted mr-2">Actor:</span>
                      <span className={`badge badge-${log.actor === 'rules_engine' ? 'pending' : 'recovered'}`}>
                        {log.actor.replace('_', ' ')}
                      </span>
                    </div>
                    <div className="p-4 rounded-lg bg-[#151C2C] border border-[rgba(255,255,255,0.05)] text-sm">
                      {log.reason_text}
                    </div>
                  </div>
                ))}

                {auditMessage && (
                  <div className="audit-item mt-6">
                    <div className="audit-dot agent"></div>
                    <div className="flex justify-between items-baseline mb-1">
                      <span className="font-semibold capitalize">Message Sent</span>
                    </div>
                    <div className="text-sm mb-2">
                      <span className="text-muted mr-2">LLM Generated Copy</span>
                    </div>
                    <div className="p-4 rounded-b-xl rounded-tr-xl bg-accent/10 border border-accent/20 text-sm italic text-white/90 shadow-sm relative">
                      <div className="absolute top-0 left-[-8px] w-0 h-0 border-t-[8px] border-t-accent/10 border-l-[8px] border-l-transparent"></div>
                      "{auditMessage}"
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
