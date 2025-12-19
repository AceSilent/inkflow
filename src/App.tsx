import './App.css';

function App() {
  return (
    <div className="App">
      <header className="App-header">
        <h1>InkFlow</h1>
        <p>AI智能小说创作软件</p>
        <div className="status">
          <span>✅ Sprint 1: 基础架构搭建</span>
        </div>
      </header>
      <main className="App-main">
        <div className="welcome-panel">
          <h2>欢迎使用 InkFlow</h2>
          <p>这是一个现代化的AI小说创作工具，提供智能续写和沉浸式写作体验。</p>

          <div className="feature-list">
            <div className="feature-item">
              <h3>🚀 基础架构</h3>
              <p>Tauri + React + TypeScript + Rust 技术栈</p>
            </div>
            <div className="feature-item">
              <h3>🤖 AI 续写</h3>
              <p>智能文本生成和上下文管理</p>
            </div>
            <div className="feature-item">
              <h3>📚 小说管理</h3>
              <p>章节组织和文件系统管理</p>
            </div>
            <div className="feature-item">
              <h3>💾 状态持久化</h3>
              <p>自动保存和状态恢复功能</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;