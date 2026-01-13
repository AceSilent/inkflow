# InkFlow

<div align="center">

**AI-Powered Novel Writing Environment**

A modern, immersive desktop application for novelists with intelligent AI continuation features.

[![Release](https://img.shields.io/github/v/release/AceSilent/inkflow)](https://github.com/AceSilent/inkflow/releases)
[![License](https://img.shields.io/github/license/AceSilent/inkflow)](LICENSE)

[Download](https://github.com/AceSilent/inkflow/releases/latest) · [Features](#-features) · [Development](#-development)

</div>

---

## ✨ Features

### 🖋️ Professional Writing Experience
- **Monaco Editor Integration** - VS Code's powerful editor at your fingertips
- **Immersive Writing Mode** - Distraction-free interface for focused creativity
- **Auto-Save** - Never lose your work (every 30 seconds)
- **State Restoration** - Seamlessly resume exactly where you left off

### 🤖 AI-Powered Assistance
- **Ghost Text Suggestions** - VS Code Copilot-like inline AI completions
- **Smart Context Understanding** - AI reads your story context to provide relevant suggestions
- **Debounced Triggering** - AI activates 2 seconds after you stop typing
- **Easy Accept/Reject** - Press `Tab` to accept or `Esc` to reject suggestions

### 📁 Project Management
- **Novel Organization** - Create and manage multiple novel projects
- **Chapter System** - Split your work into manageable chapters
- **Outline Editor** - Plan and structure your plot
- **Workspace Persistence** - Your workflow is automatically saved

### 🎨 Modern UI/UX
- **Dark Theme** - Easy on the eyes during long writing sessions
- **Smooth Animations** - Framer Motion powered transitions
- **Responsive Design** - Works on different screen sizes
- **Keyboard Shortcuts** - Efficient workflow without leaving the keyboard

## 📦 Installation

### Download Releases

Visit the [Releases](https://github.com/AceSilent/inkflow/releases/latest) page to download the latest version for your platform:

- **macOS** (Apple Silicon M1/M2/M3): `InkFlow_<version>_aarch64.dmg`
- **Windows**: `InkFlow_<version>_x64_en-US.msi` or `.exe`
- **Linux**: `inkflow_<version>_amd64.deb` or `.AppImage`

### Build from Source

#### Prerequisites
- **Node.js** 20+
- **Rust** (latest stable)
- **npm** or **pnpm**

#### Development
```bash
# Clone the repository
git clone https://github.com/AceSilent/inkflow.git
cd inkflow

# Install dependencies
npm install

# Start development server
npm run tauri dev
```

#### Build for Production
```bash
# Build desktop application
npm run tauri build
```

Build artifacts will be in `src-tauri/target/release/bundle/`.

## 🚀 Usage

### Getting Started

1. **Create a New Novel**
   - Click "新建小说" (New Novel)
   - Choose a folder and name your project

2. **Start Writing**
   - Click "新建章节" (New Chapter) in the outline panel
   - Start typing your story
   - AI suggestions will appear automatically after 2 seconds

3. **AI Suggestions**
   - `Tab` - Accept the AI suggestion
   - `Esc` - Reject the suggestion
   - `Ctrl + K` - Open AI feedback panel

4. **Save & Resume**
   - Your work auto-saves every 30 seconds
   - Close and reopen - your exact position is restored
   - Use the outline to navigate between chapters

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Tab` | Accept AI suggestion |
| `Esc` | Reject AI suggestion |
| `Ctrl + S` | Save manually |
| `Ctrl + K` | Toggle AI feedback panel |

## 🏗️ Architecture

### Technology Stack

- **Frontend**
  - React 18 + TypeScript
  - Monaco Editor (VS Code editor)
  - Tailwind CSS
  - Framer Motion
  - Zustand (state management)

- **Backend**
  - Rust with Tauri framework
  - OpenAI GPT API
  - tiktoken-rs (token counting)

- **Build Tools**
  - Vite
  - Tauri CLI

### Key Features

- **Ghost Text System** - Inline AI suggestions displayed as ghost text
- **Debounced AI Triggering** - Prevents excessive API calls
- **State Persistence** - Automatic save and restoration
- **Cross-Platform** - macOS, Windows, Linux support

## 🔧 Development

### Project Structure

```
inkflow/
├── src/                     # Frontend source
│   ├── components/         # React components
│   │   └── Editor/        # Editor components
│   ├── store/             # Zustand stores
│   ├── hooks/             # Custom React hooks
│   ├── services/          # API services
│   └── utils/             # Utility functions
├── src-tauri/             # Rust backend
│   ├── src/
│   │   ├── main.rs       # Tauri entry point
│   │   ├── ai.rs         # AI service
│   │   ├── file_system.rs # File operations
│   │   └── token_counter.rs # Token counting
│   └── Cargo.toml        # Rust dependencies
└── package.json          # Node dependencies
```

### Available Scripts

```bash
# Development
npm run dev              # Start frontend dev server
npm run tauri dev        # Start Tauri desktop app

# Building
npm run build            # Build frontend
npm run tauri build      # Build desktop app
npm run lint             # Run ESLint

# Preview
npm run preview          # Preview production build
```

### Configuration

AI API keys can be configured via environment variables:

```bash
# .env or system environment
VITE_OPENAI_API_KEY=your_api_key_here
```

## 📚 Documentation

- [Technical Design Document](./InkFlow-Technical-Design-Document.md)
- [Sprint 2 Implementation](./SPRINT2_IMPLEMENTATION.md)
- [Release Guide](./RELEASE_GUIDE.md)

## 🗺️ Roadmap

- [ ] Multi-language support
- [ ] Export to PDF/ePub
- [ ] Character name management
- [ ] Plot timeline visualization
- [ ] Cloud sync (optional)
- [ ] Plugin system

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Monaco Editor** - Microsoft's powerful code editor
- **Tauri** - Modern framework for building desktop applications
- **Zustand** - Beautiful state management
- **Framer Motion** - Production-ready motion library

---

<div align="center">

**Built with ❤️ for writers worldwide**

[GitHub](https://github.com/AceSilent/inkflow) · [Issues](https://github.com/AceSilent/inkflow/issues) · [Releases](https://github.com/AceSilent/inkflow/releases)

</div>
