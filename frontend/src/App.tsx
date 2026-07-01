import React, { useState, useEffect, useRef } from 'react';
import { RefreshCw, Plus, Moon, Sun, Trash2, ExternalLink, X, Check, Terminal, FileText, Download, Mail, ClipboardCopy, ClipboardCheck, Info, Sparkles, ArrowRight, Briefcase, Mic, Activity, StopCircle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
// @ts-ignore
import html2pdf from 'html2pdf.js';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import confetti from 'canvas-confetti';

interface Application {
  id: string;
  company: string;
  role: string;
  status: 'scouted' | 'applied' | 'interviewing' | 'offered' | 'rejected';
  job_url?: string;
  resume_changes?: string;
  outreach_draft?: string;
  interview_notes?: string;
  created_at?: string;
}

interface TelemetryLog {
  timestamp: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'telemetry';
}

export default function App() {
  const [apps, setApps] = useState<Application[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedApp, setSelectedApp] = useState<Application | null>(null);
  
  // Theme state (default dark)
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');

  // Resume Export Ref
  const resumeRef = React.useRef<HTMLDivElement>(null);
  const boardRef = React.useRef<HTMLDivElement>(null);

  // Form states
  const [company, setCompany] = useState('');
  const [role, setRole] = useState('');
  const [jobUrl, setJobUrl] = useState('');
  const [inputType, setInputType] = useState<'url' | 'text'>('url');
  const [jobText, setJobText] = useState('');
  const [resumePath, setResumePath] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  
  // UI Tab states for details view
  const [activeTab, setActiveTab] = useState<'resume' | 'outreach' | 'interview'>('resume');
  const [copied, setCopied] = useState(false);

  // Telemetry logs state
  const [logs, setLogs] = useState<TelemetryLog[]>([]);
  const [showLogs, setShowLogs] = useState(false);

  // Voice AI State
  const [isPracticing, setIsPracticing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [feedback, setFeedback] = useState<any>(null);
  
  const recognitionRef = useRef<any>(null);
  const transcriptRef = useRef("");
  const intentRecordingRef = useRef(false);

  const backendUrl = 'http://localhost:3000';

  // Analytics Calculations
  const totalApps = apps.length;
  const interviewingApps = apps.filter(a => a.status === 'interviewing').length;
  const offeredApps = apps.filter(a => a.status === 'offered').length;
  const successRate = totalApps > 0 ? Math.round((offeredApps / totalApps) * 100) : 0;

  useEffect(() => {
    // Initialize Speech Recognition
    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.onresult = (event: any) => {
          let currentTranscript = '';
          for (let i = 0; i < event.results.length; i++) {
            currentTranscript += event.results[i][0].transcript;
          }
          setTranscript(currentTranscript);
          transcriptRef.current = currentTranscript;
        };
        recognition.onerror = (event: any) => {
          console.error("Speech recognition error", event.error);
        };
        recognition.onend = () => {
          if (intentRecordingRef.current) {
            // Browser stopped recognition automatically (e.g. on silence). Restart it!
            try {
              recognition.start();
            } catch (e) {}
          } else {
            setIsRecording(false);
          }
        };
        recognitionRef.current = recognition;
      }
    }
  }, []);

  const generateFeedback = (text: string) => {
    if (!text.trim()) return;
    
    const words = text.trim().split(/\s+/);
    const wordCount = words.length;
    
    let lengthScore = "Too short (aim for 60+ words for a STAR story)";
    if (wordCount > 80) lengthScore = "Great detail! Perfect length.";
    else if (wordCount > 40) lengthScore = "Good length, but could add more detail.";

    const actionVerbs = ["led", "developed", "designed", "managed", "created", "built", "optimized", "collaborated", "increased", "decreased", "improved", "resolved", "spearheaded"];
    let keywords = ["react", "api", "team", "scale", "performance", "backend", "frontend", "database", "architecture", "agile", "leadership"];
    if (selectedApp) {
      keywords.push(...selectedApp.company.toLowerCase().split(' ').filter(w => w.length > 2));
      keywords.push(...selectedApp.role.toLowerCase().split(' ').filter(w => w.length > 2));
    }

    const textLower = text.toLowerCase();
    const foundVerbs = actionVerbs.filter(v => textLower.includes(v));
    const foundKeywords = keywords.filter(k => textLower.includes(k) && k.length > 2);

    // NEW DETECTORS
    const fillerWords = ["um ", "uh ", "like ", "you know", "basically", "literally", "stuff"];
    const foundFillers = fillerWords.filter(f => textLower.includes(f));
    
    const starWords = ["situation", "task", "action", "result", "because", "led to", "resulted in", "context", "challenge", "goal", "achieved", "impact"];
    const foundStar = starWords.filter(s => textLower.includes(s));
    let starScore = "Low (Try using the STAR method)";
    if (foundStar.length > 3) starScore = "High (Excellent STAR structure!)";
    else if (foundStar.length > 0) starScore = "Medium (Good structure)";

    setFeedback({
      length: wordCount,
      lengthScore,
      verbs: foundVerbs,
      keywords: [...new Set(foundKeywords)],
      fillers: foundFillers,
      starScore,
      starWords: foundStar
    });
  };

  const toggleRecording = () => {
    if (intentRecordingRef.current) {
      intentRecordingRef.current = false;
      recognitionRef.current?.stop();
      setIsRecording(false);
      generateFeedback(transcriptRef.current);
    } else {
      intentRecordingRef.current = true;
      setTranscript("");
      transcriptRef.current = "";
      setFeedback(null);
      recognitionRef.current?.start();
      setIsRecording(true);
    }
  };

  useEffect(() => {
    fetchApplications();
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Fix horizontal scroll wheel issue
  React.useEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      // If we are scrolling vertically and not holding Shift, let's translate to horizontal scroll
      if (e.deltaY !== 0 && !e.shiftKey) {
        e.preventDefault();
        el.scrollLeft += e.deltaY;
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [apps]);

  const addLog = (message: string, type: 'info' | 'success' | 'warning' | 'telemetry' = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, { timestamp, message, type }]);
  };

  const fetchApplications = async () => {
    setRefreshing(true);
    try {
      const resp = await fetch(`${backendUrl}/api/applications`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      
      const items = data.items || [];
      const formattedApps = items.map((item: any) => ({
        id: item.id,
        company: item.company,
        role: item.role,
        status: item.status || 'scouted',
        job_url: item.job_url,
        resume_changes: item.resume_changes,
        outreach_draft: item.outreach_draft,
        interview_notes: item.interview_notes,
        created_at: item.created_at
      }));
      
      setApps(formattedApps);
      addLog("Successfully fetched applications from Lemma Datastore.", "success");
    } catch (e: any) {
      console.error(e);
      addLog(`Failed to fetch applications: ${e.message}`, "warning");
    } finally {
      setRefreshing(false);
    }
  };

  const handleStatusChange = async (appId: string, newStatus: string) => {
    // 1. Optimistic Update (update UI instantly)
    setApps(prev => prev.map(app => {
      if (app.id === appId) {
        if (newStatus === 'offered' && app.status !== 'offered') {
          confetti({
            particleCount: 100,
            spread: 70,
            origin: { y: 0.6 }
          });
        }
        return { ...app, status: newStatus as any };
      }
      return app;
    }));
    
    if (selectedApp && selectedApp.id === appId) {
      setSelectedApp(prev => prev ? { ...prev, status: newStatus as any } : null);
    }

    // 2. Background Fetch
    try {
      addLog(`Updating status of application ${appId} to '${newStatus}'...`, "info");
      const resp = await fetch(`${backendUrl}/api/applications/${appId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      if (!resp.ok) throw new Error("Failed to update status");
      
      addLog(`Application ${appId} status updated successfully.`, "success");
    } catch (e: any) {
      addLog(`Status update failed: ${e.message}`, "warning");
      // Optionally reload from server to revert optimistic update
      fetchApplications();
    }
  };

  const handleDeleteApplication = async (id: string) => {
    if (!confirm('Are you sure you want to delete this application?')) return;
    try {
      setApps(prev => prev.filter(app => app.id !== id));
      if (selectedApp?.id === id) {
        setSelectedApp(null);
      }
      await fetch(`${backendUrl}/api/applications/${id}`, {
        method: 'DELETE',
      });
    } catch (err) {
      console.error('Failed to delete application', err);
    }
  };

  const handleProcessJob = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!company || !role || !resumePath) {
      addLog("Company, role, and resume path are required.", "warning");
      return;
    }
    
    if (inputType === 'url' && !jobUrl) {
      addLog("Job URL is required when scraping automatically.", "warning");
      return;
    }
    
    if (inputType === 'text' && !jobText) {
      addLog("Job description text is required for manual paste.", "warning");
      return;
    }

    setLoading(true);
    setShowLogs(true);
    setLogs([]); 
    
    addLog("Initializing Zero-Metadata pipeline ingestion...", "info");
    addLog(`Target company: ${company} | Role: ${role}`, "info");
    addLog(`Source Job URL: ${jobUrl}`, "info");
    addLog(`Loading resume PDF from path: ${resumePath}`, "info");

    try {
      addLog("Axum Server: Scraping HTML job description and parsing PDF text...", "info");
      
      const payload = {
        job_url: inputType === 'text' && !jobUrl ? "Manual Input" : jobUrl,
        job_text: inputType === 'text' ? jobText : undefined,
        resume_path: resumePath,
        company: company,
        role: role
      };

      const resp = await fetch(`${backendUrl}/api/process_job`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!resp.ok) {
        const errJson = await resp.json().catch(() => ({}));
        throw new Error(errJson.error || `HTTP ${resp.status}`);
      }

      const data = await resp.json();
      
      if (data.e2ee) {
        addLog(`[E2EE Boundary] Wrapped scraped job text in ${data.e2ee.algorithm} (${data.e2ee.job_ciphertext_bytes} bytes).`, "telemetry");
        addLog(`[E2EE Boundary] Wrapped parsed resume PDF in ${data.e2ee.algorithm} (${data.e2ee.resume_ciphertext_bytes} bytes).`, "telemetry");
        addLog("[E2EE Boundary] Decrypted transient blobs in-memory for Lemma workflow delivery.", "telemetry");
      }

      addLog("Triggered 'process-job' workflow on Lemma Cloud.", "success");
      addLog(`Run created successfully. Run ID: ${data.run_details?.id}`, "success");
      addLog("Local Daemon has intercepted the run. Analysis is executing...", "success");

      setCompany('');
      setRole('');
      setJobUrl('');
      setShowAddModal(false);

      let attempts = 0;
      const pollTimer = setInterval(() => {
        fetchApplications();
        attempts++;
        if (attempts >= 12) {
          clearInterval(pollTimer);
          addLog("Auto-polling finished. If the card hasn't appeared, the AI is still generating. Click the manual Refresh button in a few seconds.", "info");
        }
      }, 5000);

    } catch (e: any) {
      addLog(`Pipeline execution aborted: ${e.message}`, "warning");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (text?: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadPdf = () => {
    if (!resumeRef.current || !selectedApp) return;
    
    // Create a clone to force printable (light mode) styles without affecting UI
    const clone = resumeRef.current.cloneNode(true) as HTMLElement;
    clone.style.backgroundColor = '#ffffff';
    clone.style.color = '#000000';
    clone.style.padding = '40px';
    clone.style.width = '800px'; 
    clone.style.margin = '0 auto';

    // Force ALL child elements to use dark text (overrides CSS variable inheritance)
    clone.querySelectorAll('*').forEach((el) => {
      (el as HTMLElement).style.color = '#000000';
    });

    const opt = {
      margin: 0.5,
      filename: `${selectedApp.company}_Resume.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, letterRendering: true },
      jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
    };

    html2pdf().set(opt).from(clone.outerHTML).save();
  };

  const downloadMd = () => {
    if (!selectedApp?.resume_changes) return;
    const blob = new Blob([selectedApp.resume_changes], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedApp.company}_Resume.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const columns: { id: Application['status']; label: string }[] = [
    { id: 'scouted', label: 'Scouted' },
    { id: 'applied', label: 'Applied' },
    { id: 'interviewing', label: 'Interviewing' },
    { id: 'offered', label: 'Accepted' },
    { id: 'rejected', label: 'Rejected' },
  ];

  const onDragEnd = (result: any) => {
    if (!result.destination) return;
    const { source, destination, draggableId } = result;
    if (source.droppableId !== destination.droppableId) {
      handleStatusChange(draggableId, destination.droppableId);
    }
  };

  return (
    <div className="app-container">
      {/* Top Header */}
      <header className="app-header">
        <div className="header-brand">
          <div className="brand-icon-wrapper">
            <Terminal size={24} />
          </div>
          <div>
            <h1 className="brand-title">Lemma Job Tracker</h1>
            <p className="brand-subtitle">
              <span>E2EE Ingestion Node Active</span>
              <span className="status-dot"></span>
            </p>
          </div>
        </div>

        <div className="header-actions">


          <button 
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="btn-icon"
            title="Toggle Theme"
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>

          <button 
            onClick={fetchApplications}
            disabled={refreshing}
            className="btn-icon"
            title="Refresh Board"
          >
            <RefreshCw size={16} className={refreshing ? 'icon-spin' : ''} />
          </button>

          <button 
            onClick={() => setShowAddModal(true)}
            className="btn-primary"
          >
            <Plus size={16} />
            <span>Track Application</span>
          </button>
        </div>
      </header>

      {/* Main Workspace Layout */}
      <main className="workspace">
        {/* Analytics Ribbon */}
        <div className="analytics-ribbon">
          <div className="stat-card">
            <span className="stat-label">Total Applications</span>
            <span className="stat-value">{totalApps}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Interviewing</span>
            <span className="stat-value">{interviewingApps}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Offers</span>
            <span className="stat-value">{offeredApps}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Success Rate</span>
            <span className="stat-value">{successRate}%</span>
          </div>
        </div>

        {/* Content Area (Board + Drawer) */}
        <div style={{ display: 'flex', flex: 1, gap: '24px', overflow: 'hidden' }}>
          {/* Kanban Board */}
          <div className="kanban-board" ref={boardRef}>
          <DragDropContext onDragEnd={onDragEnd}>
            {columns.map(col => {
              const colApps = apps.filter(a => a.status === col.id);
              return (
                <div key={col.id} className={`kanban-column col-${col.id}`}>
                  <div className="kanban-column-header">
                    <h3 className="kanban-column-title">{col.label}</h3>
                    <span className="kanban-column-count">{colApps.length}</span>
                  </div>

                  <Droppable droppableId={col.id}>
                    {(provided) => (
                      <div 
                        className="kanban-cards"
                        {...provided.droppableProps}
                        ref={provided.innerRef}
                      >
                        {colApps.length === 0 ? (
                          <div className="empty-state">No applications</div>
                        ) : (
                          colApps.map((app, index) => (
                            <Draggable key={app.id} draggableId={app.id} index={index}>
                              {(provided, snapshot) => (
                                <div 
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                  {...provided.dragHandleProps}
                                  onClick={() => setSelectedApp(app)}
                                  className={`app-card ${selectedApp?.id === app.id ? 'active' : ''}`}
                                  style={{
                                    ...provided.draggableProps.style,
                                    opacity: snapshot.isDragging ? 0.8 : 1,
                                    boxShadow: snapshot.isDragging ? '0 8px 16px rgba(0,0,0,0.2)' : undefined,
                                  }}
                                >
                                  <div className="app-card-header">
                                    <div>
                                      <h4 className="app-card-title">{app.company}</h4>
                                      <p className="app-card-subtitle">{app.role}</p>
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                      {app.job_url && (
                                        <a 
                                          href={app.job_url} 
                                          target="_blank" 
                                          rel="noreferrer"
                                          onClick={(e) => e.stopPropagation()}
                                          className="app-card-link"
                                          title="View Job"
                                        >
                                          <ExternalLink size={14} />
                                        </a>
                                      )}
                                      <button 
                                        onClick={(e) => { e.stopPropagation(); handleDeleteApplication(app.id); }}
                                        className="btn-icon"
                                        style={{ color: 'var(--text-muted)' }}
                                        title="Delete Application"
                                      >
                                        <Trash2 size={14} />
                                      </button>
                                    </div>
                                  </div>

                                  <div className="app-card-footer">
                                    <span className="app-card-id">ID: {app.id.substring(0, 8)}</span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                      {app.status === 'interviewing' && (
                                        <div style={{ display: 'flex', gap: '4px' }}>
                                          <button 
                                            onClick={(e) => { e.stopPropagation(); handleStatusChange(app.id, 'offered'); }}
                                            className="btn-icon"
                                            style={{ width: '24px', height: '24px', color: 'var(--status-offered-text)' }}
                                            title="Mark as Accepted"
                                          >
                                            <Check size={12} />
                                          </button>
                                          <button 
                                            onClick={(e) => { e.stopPropagation(); handleStatusChange(app.id, 'rejected'); }}
                                            className="btn-icon"
                                            style={{ width: '24px', height: '24px', color: 'var(--text-muted)' }}
                                            title="Mark as Rejected"
                                          >
                                            <X size={12} />
                                          </button>
                                        </div>
                                      )}
                                      <select 
                                        value={app.status}
                                        onChange={(e) => {
                                          e.stopPropagation();
                                          handleStatusChange(app.id, e.target.value);
                                        }}
                                        onClick={(e) => e.stopPropagation()}
                                        className="status-select"
                                      >
                                        <option value="scouted">Scouted</option>
                                        <option value="applied">Applied</option>
                                        <option value="interviewing">Interviewing</option>
                                        <option value="offered">Accepted</option>
                                        <option value="rejected">Rejected</option>
                                      </select>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </Draggable>
                          ))
                        )}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </div>
              );
            })}
          </DragDropContext>
        </div>

        {/* Details View Drawer Panel */}
        {selectedApp && (
          <div className="details-panel">
            <div className="details-header">
              <div className="details-title-row">
                <div>
                  <h2 className="details-title">{selectedApp.company}</h2>
                  <p className="details-subtitle">{selectedApp.role}</p>
                </div>
                <button 
                  onClick={() => setSelectedApp(null)}
                  className="btn-secondary"
                  style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                >
                  Close
                </button>
              </div>

              <div className="details-status-row">
                <span className="details-status-label">Current Status:</span>
                <select 
                  value={selectedApp.status}
                  onChange={(e) => handleStatusChange(selectedApp.id, e.target.value)}
                  className="details-status-select"
                >
                  <option value="scouted">Scouted</option>
                  <option value="applied">Applied</option>
                  <option value="interviewing">Interviewing</option>
                  <option value="offered">Accepted</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>
            </div>

            <div className="details-tabs">
              <button 
                onClick={() => setActiveTab('resume')}
                className={`tab-btn ${activeTab === 'resume' ? 'active' : ''}`}
              >
                Tailored Resume
              </button>
              <button 
                onClick={() => setActiveTab('outreach')}
                className={`tab-btn ${activeTab === 'outreach' ? 'active' : ''}`}
              >
                Recruiter Draft
              </button>
              <button 
                onClick={() => setActiveTab('interview')}
                className={`tab-btn ${activeTab === 'interview' ? 'active' : ''}`}
              >
                Interview Prep
              </button>
            </div>

            <div className="details-content">
              {activeTab === 'resume' && (
                <div>
                  <div className="details-banner details-banner-action">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Sparkles size={16} />
                      <span>Full Tailored Markdown Resume</span>
                    </div>
                    {selectedApp.resume_changes && (
                      <div style={{ display: 'flex', gap: '12px' }}>
                        <button onClick={downloadMd} className="btn-copy">
                          <FileText size={14} /><span>.MD</span>
                        </button>
                        <button onClick={downloadPdf} className="btn-copy">
                          <Download size={14} /><span>PDF</span>
                        </button>
                      </div>
                    )}
                  </div>
                  {selectedApp.resume_changes ? (
                    <div className="markdown-box" ref={resumeRef}>
                      <ReactMarkdown>{selectedApp.resume_changes}</ReactMarkdown>
                    </div>
                  ) : (
                    <div className="pending-msg">Analysis in progress or not generated yet...</div>
                  )}
                </div>
              )}

              {activeTab === 'outreach' && (
                <div>
                  <div className="details-banner details-banner-action">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Mail size={16} />
                      <span>Recruiter cold message draft</span>
                    </div>
                    {selectedApp.outreach_draft && (
                      <button 
                        onClick={() => handleCopy(selectedApp.outreach_draft)}
                        className="btn-copy"
                      >
                        {copied ? (
                          <><ClipboardCheck size={14} /><span>Copied</span></>
                        ) : (
                          <><ClipboardCopy size={14} /><span>Copy</span></>
                        )}
                      </button>
                    )}
                  </div>
                  {selectedApp.outreach_draft ? (
                    <div className="markdown-box">
                      <ReactMarkdown>{selectedApp.outreach_draft}</ReactMarkdown>
                    </div>
                  ) : (
                    <div className="pending-msg">Outreach draft is being compiled...</div>
                  )}
                </div>
              )}

              {activeTab === 'interview' && (
                <div>
                  <div className="details-banner details-banner-action">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Info size={16} />
                      <span>Mock interview question prep</span>
                    </div>
                    <button 
                      onClick={() => setIsPracticing(!isPracticing)}
                      className="btn-primary"
                      style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                    >
                      <Mic size={14} />
                      <span>{isPracticing ? "Close Practice" : "Practice Mode"}</span>
                    </button>
                  </div>
                  
                  {isPracticing && (
                    <div className="practice-panel" style={{ marginBottom: '16px' }}>
                      <div className="practice-header">
                        <h4>Voice AI Practice</h4>
                        {isRecording && <span className="recording-badge"><Activity size={12} className="icon-pulse" /> Recording...</span>}
                      </div>
                      
                      <div className="transcript-box">
                        {transcript || "Click the microphone and start speaking..."}
                      </div>

                      {feedback && (
                        <div className="feedback-box">
                          <h5>Analysis Complete</h5>
                          <ul>
                            <li><strong>Length:</strong> {feedback.length} words <em>({feedback.lengthScore})</em></li>
                            <li><strong>STAR Format:</strong> {feedback.starScore}</li>
                            <li><strong>Filler Words Detected:</strong> {feedback.fillers.join(', ') || 'None! Great pacing!'}</li>
                            <li><strong>Action Verbs ({feedback.verbs.length}):</strong> {feedback.verbs.join(', ') || 'None detected'}</li>
                            <li><strong>Keywords Hit ({feedback.keywords.length}):</strong> {feedback.keywords.join(', ') || 'None detected'}</li>
                          </ul>
                        </div>
                      )}

                      <div className="practice-controls">
                        <button 
                          onClick={toggleRecording}
                          className={`btn-mic ${isRecording ? 'recording' : ''}`}
                        >
                          {isRecording ? <StopCircle size={24} /> : <Mic size={24} />}
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="markdown-box">
                    {selectedApp.interview_notes ? (
                      <ReactMarkdown>{selectedApp.interview_notes}</ReactMarkdown>
                    ) : (
                      <div className="pending-msg">Interview questions are being generated...</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        </div>
      </main>

      {/* Telemetry Logger Panel */}
      <div className="telemetry-drawer">
        <button 
          onClick={() => setShowLogs(!showLogs)}
          className="telemetry-toggle"
        >
          <span className="telemetry-title">
            <Terminal size={14} className="telemetry-icon" />
            <span>Zero-Metadata Transmission Telemetry Console</span>
          </span>
          <span>{showLogs ? 'Hide Console' : 'Show Console'}</span>
        </button>

        {showLogs && (
          <div className="telemetry-content">
            {logs.length === 0 ? (
              <div style={{ fontStyle: 'italic', color: '#525252' }}>No telemetry messages generated. Run a job to see telemetry.</div>
            ) : (
              logs.map((log, idx) => (
                <div key={idx} className="log-entry">
                  <span className="log-time">[{log.timestamp}]</span>
                  <span className={`log-msg-${log.type}`}>{log.message}</span>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Track Application Modal */}
      {showAddModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3 className="modal-title">
                <Briefcase size={20} style={{ color: 'var(--accent-primary)' }} />
                <span>Track Application & Run AI Analysis</span>
              </h3>
              <p className="modal-subtitle">
                Enter details to trigger the E2EE pipeline. Generates a tailored resume, outreach draft, and interview prep.
              </p>
            </div>

            <form onSubmit={handleProcessJob} className="modal-form">
              <div className="form-group">
                <label className="form-label">Company Name</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. Google"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <label className="form-label" style={{ margin: 0 }}>Job Details</label>
                  <div style={{ display: 'flex', gap: '8px', fontSize: '13px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                      <input 
                        type="radio" 
                        checked={inputType === 'url'} 
                        onChange={() => setInputType('url')} 
                      />
                      URL (Scraped automatically)
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                      <input 
                        type="radio" 
                        checked={inputType === 'text'} 
                        onChange={() => setInputType('text')} 
                      />
                      Manual Paste (Bypasses anti-bot)
                    </label>
                  </div>
                </div>
                
                {inputType === 'text' ? (
                  <textarea
                    value={jobText}
                    onChange={(e) => setJobText(e.target.value)}
                    className="form-input"
                    placeholder="Paste the full job description text here..."
                    style={{ height: '120px', resize: 'vertical' }}
                    required
                  />
                ) : (
                  <input
                    type="url"
                    value={jobUrl}
                    onChange={(e) => setJobUrl(e.target.value)}
                    className="form-input"
                    placeholder="https://company.com/careers/job"
                    required
                  />
                )}
                {inputType === 'text' && (
                  <input
                    type="url"
                    value={jobUrl}
                    onChange={(e) => setJobUrl(e.target.value)}
                    className="form-input"
                    placeholder="(Optional) Job URL for your records"
                    style={{ marginTop: '8px' }}
                  />
                )}
              </div>

              <div className="form-group">
                <label className="form-label">Role Title</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. Software Engineering Intern"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Local Resume Path (.pdf or .md)</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. C:/path/to/resume.md"
                  value={resumePath}
                  onChange={(e) => setResumePath(e.target.value)}
                  className="form-input"
                  style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}
                />
                <p className="form-hint">
                  Axum reads this file locally. Now supports Markdown natively!
                </p>
                <p className="form-hint" style={{ color: 'var(--status-applied-text)', fontWeight: 600 }}>
                  Note: Photos and complex graphics in PDFs are automatically stripped out to ensure ATS compliance.
                </p>
              </div>

              <div className="modal-footer">
                <button 
                  type="button" 
                  onClick={() => setShowAddModal(false)}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={loading}
                  className="btn-primary"
                >
                  {loading ? (
                    <><RefreshCw size={16} className="icon-spin" /><span>Processing...</span></>
                  ) : (
                    <><ArrowRight size={16} /><span>Ingest & Process</span></>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
