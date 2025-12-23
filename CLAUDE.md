# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

InkFlow is a modern AI-powered novel writing desktop application built with Tauri + React + TypeScript + Rust. The application features an immersive writing experience with VS Code Copilot-like AI suggestions (ghost text) and professional editing capabilities.

## Architecture

### Technology Stack
- **Frontend**: React 18 + TypeScript + Tailwind CSS
- **Editor**: Monaco Editor (VS Code editor component)
- **State Management**: Zustand
- **Animations**: Framer Motion
- **Backend**: Rust with Tauri framework
- **AI Integration**: OpenAI GPT API with tiktoken-rs for token counting
- **Build Tools**: Vite + Tauri CLI

### Key Architectural Patterns
1. **Centralized State Management**: Zustand store (`src/store/editorStore.ts`) manages all editor state
2. **Ghost Text System**: Inline AI suggestions displayed as ghost text with Tab/Esc interactions
3. **Debounced AI Triggering**: 2-second delay after typing stops before AI suggestions
4. **Mock AI System**: Unified mock behavior for development across Tauri/web environments
5. **Rust Backend Services**: File I/O, token counting, and AI API calls handled in Rust

### File Structure
```
src/
├── components/Editor/           # Core editor components
│   ├── MainEditor.tsx          # Main editor with Monaco integration
│   ├── GhostTextManager.ts     # Ghost text display and interaction logic
│   └── FeedbackPanel.tsx       # AI feedback panel with animations
├── store/                      # Zustand state management
│   └── editorStore.ts         # Central editor state store
├── hooks/                      # Custom React hooks
│   └── useDebounce.ts         # Debounce hook for AI triggering
├── services/                   # Service layer
├── styles/                     # CSS styles
├── types/                      # TypeScript type definitions
└── utils/                      # Utility functions

src-tauri/
├── src/
│   ├── main.rs                # Tauri application entry
│   ├── ai.rs                  # AI service implementation
│   ├── file_system.rs         # File system operations
│   └── token_counter.rs       # Token counting service
└── Cargo.toml                 # Rust dependencies
```

## Development Commands

### Frontend Development
```bash
# Start development server (web only)
npm run dev

# Build frontend
npm run build

# Type check and lint
npm run lint

# Preview production build
npm run preview
```

### Tauri Development (Desktop App)
```bash
# Start Tauri development (desktop app)
npm run tauri dev

# Build desktop application
npm run tauri build

# Check Rust compilation
cd src-tauri && cargo check
```

### Testing
```bash
# Run comprehensive test script (PowerShell)
./sprint2-test.ps1

# TypeScript compilation check
npm run build
```

## Key Implementation Details

### State Management
- Editor state is managed in `src/store/editorStore.ts`
- Uses Zustand with TypeScript for type safety
- Key state: content, ghostText, isGenerating, feedbackPanelOpen
- Actions: updateContent, setGhostText, acceptSuggestion, generateAISuggestion

### AI Integration Pattern
1. User stops typing for 2 seconds (debounced)
2. Extract recent context (last few paragraphs)
3. Call AI API (OpenAI or mock)
4. Display ghost text with fade-in animation
5. User interactions: Tab to accept, Esc to reject, Ctrl+K for feedback

### Monaco Editor Integration
- Uses `@monaco-editor/react` wrapper
- Custom theme matching VS Code dark theme
- Event handlers: onDidChangeModelContent, onDidChangeCursorPosition
- Ghost text implemented via editor decorations

### Performance Considerations
- Virtual scrolling for large documents
- Precise token counting with tiktoken-rs (Rust backend)
- Memory-efficient file handling
- Debounced AI calls to prevent excessive API usage

## Development Workflow

### Adding New Features
1. Update Zustand store for new state/actions
2. Create React components in `src/components/`
3. Add TypeScript types in `src/types/`
4. Implement Rust backend services if needed
5. Update test script (`sprint2-test.ps1`) for validation

### Code Quality Standards
- TypeScript strict mode enabled
- ESLint with React hooks rules
- Consistent file structure and naming conventions
- Comprehensive error handling
- Mock AI for development/testing

### Testing Strategy
- Manual testing with `sprint2-test.ps1` script
- TypeScript compilation as build-time validation
- Component integration testing
- Rust compilation checks

## Important Notes

### Environment Variables
- Vite/Tauri environment variables prefixed with `VITE_` or `TAURI_`
- AI API keys should be configured via environment variables

### File System Operations
- All file I/O handled by Rust backend (`src-tauri/src/file_system.rs`)
- JSON-based metadata storage
- Auto-save every 30 seconds

### AI Service Configuration
- Mock AI used during development
- OpenAI GPT API for production
- Token counting via tiktoken-rs for cost control
- Context truncation at sentence/paragraph boundaries

## Common Issues and Solutions

### Development Server Issues
- Ensure port 1420 is available (configured in vite.config.ts)
- Check Tauri dev server compatibility

### TypeScript Errors
- Run `npm run build` to check compilation
- Ensure all imports are correctly typed

### Rust Compilation Issues
- Run `cargo check` in `src-tauri/` directory
- Check Rust version compatibility (edition 2021)

### Monaco Editor Problems
- Verify `@monaco-editor/react` version compatibility
- Check web worker configuration

## Documentation References

- `InkFlow-Technical-Design-Document.md`: Comprehensive technical design
- `SPRINT2_IMPLEMENTATION.md`: Sprint 2 implementation details
- `墨流设计方案.md`: Chinese version of design document
- `code_review/`: Code review documentation