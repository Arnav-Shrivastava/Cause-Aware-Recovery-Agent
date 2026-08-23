import React, { useState, useEffect } from 'react';
import { Play, Activity, CheckCircle, XCircle, Clock, AlertTriangle, UserX, FileText, Phone, Mail, MessageSquare, Sun, Moon } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LineChart, Line } from 'recharts';
import { useTheme } from './components/theme-provider';
import { Button } from './components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from './components/ui/card';
import { Skeleton } from './components/ui/skeleton';
import { Input } from './components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './components/ui/table';
import { Badge } from './components/ui/badge';
import { Separator } from './components/ui/separator';
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
            <Card className="flex flex-col">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <BarChart size={20} className="text-primary" /> Recovery Performance Comparison
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div style={{ width: '100%', height: 300 }}>
                  <ResponsiveContainer>
                    <BarChart data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                      <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" />
                      <YAxis tickFormatter={(val) => `${val}%`} stroke="hsl(var(--muted-foreground))" />
                      <Tooltip 
                        cursor={{fill: 'hsl(var(--muted)/0.5)'}}
                        contentStyle={{ backgroundColor: 'hsl(var(--popover))', borderColor: 'hsl(var(--border))', borderRadius: 'var(--radius)' }}
                        formatter={(value) => [`${value}%`, 'Recovery Rate']}
                      />
                      <Bar dataKey="rate" radius={[4, 4, 0, 0]}>
                        {chartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={index === 0 ? 'hsl(var(--muted-foreground))' : 'hsl(var(--primary))'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="text-xs text-muted-foreground mt-4 text-center italic">
                  *Naive blind retry benchmark derived from live simulation (industry average: 15-25%)
                </div>
              </CardContent>
            </Card>

            {/* Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Outcome Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-4">
                  {[
                    { key: 'recovered', label: 'Recovered', icon: CheckCircle, color: 'text-green-500' },
                    { key: 'no_response', label: 'No Response', icon: Clock, color: 'text-yellow-500' },
                    { key: 'pending', label: 'Pending (Grace Period)', icon: Clock, color: 'text-blue-500' },
                    { key: 'blocked', label: 'Blocked (Retry Cap)', icon: AlertTriangle, color: 'text-red-500' },
                    { key: 'abandon', label: 'Abandoned (Age > 21d)', icon: UserX, color: 'text-muted-foreground' },
                  ].map(({ key, label, icon: Icon, color }) => (
                    <div key={key} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                      <div className="flex items-center gap-3">
                        <Icon className={color} size={20} />
                        <span className="font-medium text-sm">{label}</span>
                      </div>
                      <span className="font-bold text-lg">{summary.outcome_counts[key] || 0}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {/* Live Demo Send */}
      <Card className="mb-8 border-primary/20 bg-primary/5">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Play size={20} className="text-primary" /> Live Demo Send
          </CardTitle>
          <div className="text-sm text-muted-foreground">
            Test real integrations on a subset of verified numbers. Note: the bulk batch is fully simulated to avoid sending messages to fake numbers.
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground uppercase">Select Event to Replay</label>
              <Select value={demoEventId} onValueChange={setDemoEventId}>
                <SelectTrigger>
                  <SelectValue placeholder="-- Choose an event from the feed --" />
                </SelectTrigger>
                <SelectContent>
                  {feed.map(f => (
                    <SelectItem key={f.id} value={f.id.toString()}>{f.customer_name} ({f.cause})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground uppercase">Allowlisted Contact (Phone/Email)</label>
              <Input 
                placeholder="+1234567890 or test@example.com"
                value={demoContact}
                onChange={(e) => setDemoContact(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-3 mb-6">
            <Button 
              variant="outline" 
              className="flex-1 border-[#25D366]/30 text-[#25D366] hover:bg-[#25D366]/10 hover:text-[#25D366]"
              onClick={() => handleLiveDemo('WhatsApp')}
              disabled={demoLoading}
            >
              <MessageSquare size={16} className="mr-2" /> Real WhatsApp
            </Button>
            <Button 
              variant="outline" 
              className="flex-1 border-primary/30 text-primary hover:bg-primary/10 hover:text-primary"
              onClick={() => handleLiveDemo('Voice')}
              disabled={demoLoading}
            >
              <Phone size={16} className="mr-2" /> Real Voice Call
            </Button>
            <Button 
              variant="outline" 
              className="flex-1"
              onClick={() => handleLiveDemo('Email')}
              disabled={demoLoading}
            >
              <Mail size={16} className="mr-2" /> Real Email
            </Button>
          </div>

          {demoResult && (
            <div className={`p-4 rounded-md border text-sm ${demoResult.success ? (demoResult.provider_message_id ? 'border-green-500/50 bg-green-500/10 text-green-700 dark:text-green-400' : 'border-yellow-500/50 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400') : 'border-destructive/50 bg-destructive/10 text-destructive'}`}>
              <div className="font-semibold mb-1">
                {demoResult.success ? (demoResult.provider_message_id ? 'Real Send Successful' : 'Fell back to simulation (Not in allowlist or missing creds)') : 'Error'}
              </div>
              {demoResult.provider_message_id && <div className="font-mono text-xs mt-1">Provider SID/ID: {demoResult.provider_message_id}</div>}
              {demoResult.message_sent && <div className="mt-3 text-muted-foreground italic border-l-2 border-current pl-3 py-1">"{demoResult.message_sent}"</div>}
              {demoResult.error && <div className="mt-2">{demoResult.error}</div>}
              
              {pollingStatus === 'waiting' && (
                <div className="mt-4 flex items-center gap-2 text-blue-600 dark:text-blue-400">
                  <Clock className="animate-spin" size={16} /> Waiting for customer reply via WhatsApp...
                </div>
              )}
              {pollingStatus === 'timeout' && (
                <div className="mt-4 text-yellow-600 dark:text-yellow-400">
                  Timed out waiting for reply (2 minutes elapsed). No reply detected yet.
                </div>
              )}
              {demoResult.recovered && (
                <div className="mt-4 p-3 rounded-md border border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-400">
                  <div className="font-bold flex items-center gap-2"><CheckCircle size={16} /> Recovered!</div>
                  {demoResult.reply_text && <div className="mt-1 italic">Customer replied: "{demoResult.reply_text}"</div>}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Feed */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Live Event Feed</CardTitle>
          <div className="text-sm text-muted-foreground">Click any row to view its deterministic reasoning trail.</div>
        </CardHeader>
        <CardContent>
          {feed.length === 0 ? (
            <div className="text-center p-8 text-muted-foreground border rounded-md border-dashed">No events processed yet. Run a batch to see data.</div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead>Identified Cause</TableHead>
                    <TableHead>Action Taken</TableHead>
                    <TableHead>Outcome</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {feed.map((row) => (
                    <TableRow 
                      key={row.id} 
                      onClick={() => openAuditTrail(row.id)}
                      className="cursor-pointer hover:bg-muted/50 transition-colors"
                    >
                      <TableCell>
                        <div className="font-medium">{row.customer_name}</div>
                        <div className="text-xs text-muted-foreground">{row.subscription_type}</div>
                      </TableCell>
                      <TableCell>
                        <div>{row.cause}</div>
                        <div className="text-xs text-muted-foreground font-mono">{row.raw_decline_code}</div>
                      </TableCell>
                      <TableCell>{row.action_taken}</TableCell>
                      <TableCell>
                        <Badge 
                          variant={row.outcome === 'recovered' ? 'default' : (row.outcome === 'blocked' ? 'destructive' : (row.outcome === 'abandon' ? 'outline' : 'secondary'))}
                          className={row.outcome === 'recovered' ? 'bg-green-500 hover:bg-green-600' : ''}
                        >
                          {row.outcome}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(row.mrr_amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal */}
      <Dialog open={!!auditModal} onOpenChange={(open) => !open && setAuditModal(null)}>
        <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <FileText className="text-primary" />
              Audit Trail & Reasoning
            </DialogTitle>
            <DialogDescription>
              Deterministic execution steps and LLM boundary crossing.
            </DialogDescription>
          </DialogHeader>
          
          <div className="mt-4">
            {loadingAudit ? (
              <div className="py-8 text-center text-muted-foreground flex items-center justify-center gap-2">
                <Clock className="animate-spin" size={20} /> Loading audit trail...
              </div>
            ) : (
              <div className="space-y-6 pl-4 border-l-2 border-muted ml-2 py-2">
                {auditData.map((log, i) => (
                  <div key={log.id} className="relative">
                    <div className={`absolute -left-[23px] top-1 h-3 w-3 rounded-full border-2 border-background ${log.actor === 'rules_engine' ? 'bg-blue-500' : 'bg-primary'}`}></div>
                    <div className="flex justify-between items-baseline mb-1">
                      <span className="font-semibold capitalize text-foreground">{log.event_type}</span>
                      <span className="text-xs text-muted-foreground font-mono">{new Date(log.created_at).toLocaleTimeString()}</span>
                    </div>
                    <div className="text-sm mb-2 flex items-center gap-2">
                      <span className="text-muted-foreground">Actor:</span>
                      <Badge variant="outline" className="text-xs font-mono bg-background">
                        {log.actor.replace('_', ' ')}
                      </Badge>
                    </div>
                    <div className="p-3 mt-2 rounded-md bg-muted/50 border text-sm font-mono text-muted-foreground leading-relaxed">
                      {log.reason_text}
                    </div>
                  </div>
                ))}

                {auditMessage && (
                  <div className="relative mt-8">
                    <div className="absolute -left-[23px] top-1 h-3 w-3 rounded-full border-2 border-background bg-green-500"></div>
                    <div className="flex justify-between items-baseline mb-1">
                      <span className="font-semibold capitalize text-foreground">Message Sent</span>
                    </div>
                    <div className="text-sm mb-2 flex items-center gap-2">
                      <span className="text-muted-foreground">Actor:</span>
                      <Badge variant="secondary" className="bg-primary/10 text-primary hover:bg-primary/20 text-xs font-mono">
                        llm_agent
                      </Badge>
                    </div>
                    <div className="p-4 mt-2 rounded-lg rounded-tl-none bg-primary/5 border border-primary/20 text-sm italic text-foreground shadow-sm">
                      "{auditMessage}"
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default App;
