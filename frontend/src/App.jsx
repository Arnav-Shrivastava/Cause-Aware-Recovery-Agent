import React, { useState, useEffect } from 'react';
import { Play, Activity, CheckCircle, XCircle, Clock, AlertTriangle, UserX, FileText } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LineChart, Line } from 'recharts';

const API_BASE = 'http://localhost:8000';

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(amount);
}

function App() {
  const [summary, setSummary] = useState(null);
  const [feed, setFeed] = useState([]);
  const [isRunning, setIsRunning] = useState(false);
  const [auditModal, setAuditModal] = useState(null);
  const [auditData, setAuditData] = useState([]);
  const [auditMessage, setAuditMessage] = useState(null);
  const [loadingAudit, setLoadingAudit] = useState(false);

  const fetchDashboardData = async () => {
    try {
      const sumRes = await fetch(`${API_BASE}/batch/1/summary`);
      const sumData = await sumRes.json();
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

  const chartData = summary ? [
    { name: 'Blind Retry', rate: Math.round(summary.naive_baseline * 100), color: '#64748B' },
    { name: 'Cause-Aware Agent', rate: Math.round(summary.recovery_rate * 100), color: '#3B82F6' }
  ] : [];

  return (
    <div className="container animate-fade-in">
      <header className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Activity className="text-accent" />
            Cause-Aware Recovery Agent
          </h1>
          <p className="text-secondary mt-2">AI-driven revenue recovery bounded by deterministic rules</p>
        </div>
        <button 
          onClick={handleRunBatch} 
          disabled={isRunning}
          className="btn btn-primary"
        >
          {isRunning ? <Clock className="animate-spin" size={20} /> : <Play size={20} />}
          {isRunning ? 'Running Batch...' : 'Run Batch (500 events)'}
        </button>
      </header>

      {summary && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-8">
            <div className="card">
              <h3 className="text-sm font-semibold text-muted uppercase">Revenue at Risk</h3>
              <div className="stat-value">{formatCurrency(summary.at_risk)}</div>
              {summary.daily_at_risk && (
                <div className="h-12 mt-2 opacity-50">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={summary.daily_at_risk}>
                      <Line type="monotone" dataKey="at_risk" stroke="#94A3B8" strokeWidth={2} dot={false} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#1E293B', border: 'none', borderRadius: '4px', fontSize: '12px', padding: '4px 8px' }}
                        labelStyle={{ display: 'none' }}
                        formatter={(val) => [formatCurrency(val), 'At Risk']}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
            <div className="card">
              <h3 className="text-sm font-semibold text-muted uppercase">Gross Recovered</h3>
              <div className="stat-value">{formatCurrency(summary.recovered)}</div>
            </div>
            <div className="card">
              <h3 className="text-sm font-semibold text-muted uppercase">Net Recovered</h3>
              <div className="stat-value highlight">{formatCurrency(summary.net_recovered)}</div>
              <div className="text-xs text-muted mt-1">Cost: {formatCurrency(summary.total_cost)}</div>
            </div>
            <div className="card">
              <h3 className="text-sm font-semibold text-muted uppercase">Recovery Rate</h3>
              <div className="stat-value">{(summary.recovery_rate * 100).toFixed(1)}%</div>
            </div>
            <div className="card">
              <h3 className="text-sm font-semibold text-muted uppercase">Uplift vs Baseline</h3>
              <div className="stat-value text-success">
                +{((summary.recovery_rate - summary.naive_baseline) * 100).toFixed(1)} pp
              </div>
            </div>
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
