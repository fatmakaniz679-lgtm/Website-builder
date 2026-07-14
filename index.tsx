import React, { useState, useEffect, useRef } from 'react';
import { 
  Code, Play, Download, Settings, History, Plus, 
  Terminal, Sparkles, Loader2, Layout, Trash2, CheckCircle2,
  AlertCircle, Copy
} from 'lucide-react';

// --- Types & Interfaces ---
interface Project {
  id: string;
  title: string;
  prompt: string;
  code: string;
  createdAt: number;
}

interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

// --- API Implementation with Exponential Backoff ---
const apiKey = ""; // The execution environment provides the key at runtime

const fetchWithRetry = async (url: string, options: RequestInit, retries = 5): Promise<any> => {
  const delays = [1000, 2000, 4000, 8000, 16000];
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, options);
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      return await res.json();
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise(r => setTimeout(r, delays[i]));
    }
  }
};

const generateWebsiteCode = async (prompt: string): Promise<string> => {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;
  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    systemInstruction: { 
      parts: [{ 
        text: "You are an elite frontend engineer. The user will ask for a website. You must generate a single, complete, production-ready HTML file. Include embedded CSS (you are highly encouraged to use Tailwind CSS via CDN: <script src=\"https://cdn.tailwindcss.com\"></script>) and any necessary JavaScript within the same file. Ensure the UI is modern, responsive, and visually stunning. OUTPUT ONLY THE RAW HTML CODE inside an ```html block. Do not add any conversational text."
      }] 
    }
  };

  const result = await fetchWithRetry(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  let text = result.candidates?.[0]?.content?.parts?.[0]?.text || "";
  
  // Clean up markdown formatting if present
  text = text.replace(/^```html\s*/i, '').replace(/```\s*$/i, '');
  text = text.trim();
  
  return text;
};

// --- Main Application Component ---
export default function App() {
  // State Management
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [view, setView] = useState<'dashboard' | 'settings'>('dashboard');
  const [activeTab, setActiveTab] = useState<'preview' | 'code'>('preview');
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentPrompt, setCurrentPrompt] = useState("");
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Load projects from local storage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('ai-builder-projects');
      if (saved) setProjects(JSON.parse(saved));
    } catch (e) {
      console.error("Failed to load projects", e);
    }
  }, []);

  // Save projects to local storage when they change
  useEffect(() => {
    localStorage.setItem('ai-builder-projects', JSON.stringify(projects));
  }, [projects]);

  const activeProject = projects.find(p => p.id === activeProjectId);

  // Toast Helper
  const addToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  };

  // Actions
  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPrompt.trim()) return;

    setIsGenerating(true);
    try {
      const code = await generateWebsiteCode(currentPrompt);
      
      const newProject: Project = {
        id: crypto.randomUUID(),
        title: currentPrompt.slice(0, 30) + (currentPrompt.length > 30 ? '...' : ''),
        prompt: currentPrompt,
        code: code,
        createdAt: Date.now()
      };

      setProjects(prev => [newProject, ...prev]);
      setActiveProjectId(newProject.id);
      setActiveTab('preview');
      setCurrentPrompt("");
      setView('dashboard');
      addToast("Website generated successfully!", "success");
    } catch (error) {
      console.error(error);
      addToast("Failed to generate website. Please try again.", "error");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleUpdateCode = (newCode: string) => {
    if (!activeProjectId) return;
    setProjects(prev => prev.map(p => 
      p.id === activeProjectId ? { ...p, code: newCode } : p
    ));
  };

  const deleteProject = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setProjects(prev => prev.filter(p => p.id !== id));
    if (activeProjectId === id) setActiveProjectId(null);
    addToast("Project deleted", "info");
  };

  const downloadZip = async () => {
    if (!activeProject) return;
    
    addToast("Preparing download...", "info");
    
    // Dynamically load JSZip to keep the single-file constraint clean
    if (!(window as any).JSZip) {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = '[https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js](https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js)';
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
    }

    try {
      const JSZip = (window as any).JSZip;
      const zip = new JSZip();
      
      zip.file("index.html", activeProject.code);
      zip.file("README.md", `# ${activeProject.title}\n\nGenerated using AI Website Builder.\n\n## Prompt\n${activeProject.prompt}\n`);
      
      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = `project-${activeProject.id.slice(0, 8)}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      
      addToast("Download complete!", "success");
    } catch (error) {
      addToast("Failed to create ZIP file.", "error");
    }
  };

  const copyToClipboard = () => {
    if (activeProject) {
      document.execCommand('copy');
      navigator.clipboard.writeText(activeProject.code).then(() => {
         addToast("Code copied to clipboard!", "success");
      }).catch(() => {
        // Fallback
        const textArea = document.createElement("textarea");
        textArea.value = activeProject.code;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
        addToast("Code copied to clipboard!", "success");
      });
    }
  };

  return (
    <div className="flex h-screen bg-slate-950 text-slate-300 font-sans overflow-hidden selection:bg-indigo-500/30">
      
      {/* Toast Notifications */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map(toast => (
          <div key={toast.id} className={`flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg border ${
            toast.type === 'success' ? 'bg-emerald-950/80 border-emerald-800 text-emerald-200' :
            toast.type === 'error' ? 'bg-rose-950/80 border-rose-800 text-rose-200' :
            'bg-slate-800 border-slate-700 text-slate-200'
          } backdrop-blur-sm animate-in slide-in-from-right-5 fade-in duration-300`}>
            {toast.type === 'success' && <CheckCircle2 className="w-4 h-4" />}
            {toast.type === 'error' && <AlertCircle className="w-4 h-4" />}
            <span className="text-sm font-medium">{toast.message}</span>
          </div>
        ))}
      </div>

      {/* Sidebar */}
      <aside className="w-72 border-r border-slate-800 bg-slate-950 flex flex-col z-10">
        <div className="p-4 border-b border-slate-800 flex items-center gap-3 text-white">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-900/20">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <h1 className="font-bold text-lg tracking-tight">AI Builder</h1>
        </div>

        <div className="p-4">
          <button 
            onClick={() => {
              setActiveProjectId(null);
              setView('dashboard');
              setCurrentPrompt("");
            }}
            className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2.5 rounded-lg font-medium transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            New Project
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-1">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-2 mb-2 mt-4 flex items-center gap-2">
            <History className="w-3.5 h-3.5" />
            Project History
          </div>
          
          {projects.length === 0 ? (
            <div className="text-sm text-slate-500 px-2 py-4 text-center">
              No projects yet. Start generating!
            </div>
          ) : (
            projects.map(project => (
              <div 
                key={project.id}
                onClick={() => {
                  setActiveProjectId(project.id);
                  setView('dashboard');
                }}
                className={`group flex items-center justify-between p-2 rounded-md cursor-pointer transition-colors ${
                  activeProjectId === project.id ? 'bg-slate-800 text-white' : 'hover:bg-slate-800/50 text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <Layout className="w-4 h-4 shrink-0 text-slate-500" />
                  <span className="text-sm truncate">{project.title}</span>
                </div>
                <button 
                  onClick={(e) => deleteProject(project.id, e)}
                  className="opacity-0 group-hover:opacity-100 p-1 hover:text-rose-400 transition-opacity"
                  title="Delete Project"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>

        <div className="p-4 border-t border-slate-800">
          <button 
            onClick={() => setView('settings')}
            className={`flex items-center gap-2 text-sm w-full p-2 rounded-md transition-colors ${
              view === 'settings' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Settings className="w-4 h-4" />
            Settings
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-full bg-slate-900 relative">
        
        {view === 'settings' ? (
          <div className="p-8 max-w-2xl mx-auto w-full">
            <h2 className="text-2xl font-bold text-white mb-6">Settings</h2>
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-6 space-y-6">
              <div>
                <h3 className="text-sm font-medium text-white mb-1">AI Model</h3>
                <p className="text-sm text-slate-500 mb-3">Currently using the standard environment model.</p>
                <select disabled className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-sm text-slate-300 opacity-70 cursor-not-allowed">
                  <option>gemini-2.5-flash-preview-09-2025</option>
                </select>
              </div>
              <div className="pt-4 border-t border-slate-800">
                <h3 className="text-sm font-medium text-white mb-1">Theme Preferences</h3>
                <p className="text-sm text-slate-500 mb-3">The application defaults to a dark theme for optimal viewing.</p>
                <div className="flex gap-4">
                  <div className="px-4 py-2 rounded-lg bg-indigo-600/20 text-indigo-400 border border-indigo-600/30 text-sm font-medium cursor-pointer">
                    Dark Mode
                  </div>
                  <div className="px-4 py-2 rounded-lg bg-slate-900 text-slate-500 border border-slate-800 text-sm font-medium cursor-not-allowed opacity-50">
                    Light Mode (Coming Soon)
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Top Toolbar / Prompt Area */}
            <div className="bg-slate-950 border-b border-slate-800 p-4 shrink-0">
              <form onSubmit={handleGenerate} className="max-w-5xl mx-auto flex gap-3">
                <div className="relative flex-1">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Sparkles className="h-5 w-5 text-indigo-500" />
                  </div>
                  <input
                    type="text"
                    value={currentPrompt}
                    onChange={(e) => setCurrentPrompt(e.target.value)}
                    placeholder="Describe the website you want to build (e.g. 'A sleek landing page for a coffee shop')..."
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl py-3 pl-10 pr-4 text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all shadow-inner"
                    disabled={isGenerating}
                  />
                </div>
                <button
                  type="submit"
                  disabled={isGenerating || !currentPrompt.trim()}
                  className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-white px-6 py-3 rounded-xl font-medium transition-all flex items-center gap-2 whitespace-nowrap shadow-sm disabled:shadow-none"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Play className="w-5 h-5" />
                      Generate
                    </>
                  )}
                </button>
              </form>
            </div>

            {/* Workspace Area */}
            <div className="flex-1 overflow-hidden flex flex-col bg-[#0a0a0f]">
              {activeProject ? (
                <>
                  {/* Workspace Toolbar */}
                  <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800/50 bg-slate-900/50">
                    <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
                      <button
                        onClick={() => setActiveTab('preview')}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                          activeTab === 'preview' 
                            ? 'bg-slate-800 text-white shadow-sm' 
                            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                        }`}
                      >
                        <Layout className="w-4 h-4" />
                        Preview
                      </button>
                      <button
                        onClick={() => setActiveTab('code')}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                          activeTab === 'code' 
                            ? 'bg-slate-800 text-white shadow-sm' 
                            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                        }`}
                      >
                        <Code className="w-4 h-4" />
                        Code
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                       {activeTab === 'code' && (
                        <button
                          onClick={copyToClipboard}
                          className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors border border-slate-700"
                        >
                          <Copy className="w-4 h-4" />
                          Copy
                        </button>
                      )}
                      <button
                        onClick={downloadZip}
                        className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-indigo-300 bg-indigo-950 hover:bg-indigo-900 rounded-lg transition-colors border border-indigo-900/50"
                      >
                        <Download className="w-4 h-4" />
                        Export ZIP
                      </button>
                    </div>
                  </div>

                  {/* Workspace Content */}
                  <div className="flex-1 relative overflow-hidden">
                    {activeTab === 'preview' ? (
                      <div className="absolute inset-0 p-4">
                        <div className="w-full h-full bg-white rounded-xl shadow-2xl overflow-hidden border border-slate-700">
                          <iframe
                            title="Live Preview"
                            srcDoc={activeProject.code}
                            className="w-full h-full border-0"
                            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="absolute inset-0 flex">
                        <div className="w-12 bg-slate-950 border-r border-slate-800 flex flex-col items-end py-4 pr-2 select-none text-slate-600 font-mono text-sm">
                          {/* Line numbers mock */}
                          {Array.from({ length: 50 }).map((_, i) => (
                            <div key={i}>{i + 1}</div>
                          ))}
                        </div>
                        <textarea
                          value={activeProject.code}
                          onChange={(e) => handleUpdateCode(e.target.value)}
                          className="flex-1 h-full w-full bg-transparent text-slate-300 font-mono text-sm p-4 focus:outline-none resize-none leading-relaxed"
                          spellCheck="false"
                          placeholder="<!-- Code will appear here -->"
                        />
                      </div>
                    )}
                  </div>
                </>
              ) : (
                /* Empty State Workspace */
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center max-w-md mx-auto">
                  <div className="w-16 h-16 bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-center mb-6 shadow-xl">
                    <Terminal className="w-8 h-8 text-indigo-500" />
                  </div>
                  <h2 className="text-2xl font-bold text-white mb-2">Build your next idea</h2>
                  <p className="text-slate-400 mb-8 leading-relaxed">
                    Enter a prompt above to generate a complete, production-ready website instantly. Use natural language to describe layout, colors, and features.
                  </p>
                  
                  <div className="w-full space-y-3 text-left">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Try these prompts</p>
                    {[
                      "A sleek SaaS landing page with dark mode",
                      "A personal portfolio for a photographer",
                      "A futuristic dashboard for crypto trading"
                    ].map((suggestion, i) => (
                      <button
                        key={i}
                        onClick={() => setCurrentPrompt(suggestion)}
                        className="w-full p-3 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 rounded-xl text-sm text-slate-300 transition-all flex items-center gap-3 group text-left"
                      >
                        <Sparkles className="w-4 h-4 text-slate-500 group-hover:text-indigo-400" />
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
