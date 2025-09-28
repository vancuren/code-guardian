# Code Guardian - AI Security Scanner for VS Code/Cursor

**Code Guardian** is an advanced VS Code/Cursor extension that provides real-time security vulnerability detection and AI-powered fix suggestions for any language.

With the rise of coding assistants like Codex, security has never been more important. Code is moving from shipping in weeks to days, and that speed demands protection. Code Guardian is a VS Code extension that monitors your code in real time, detects vulnerabilities, suggests fixes, and applies them when you request all using GPT-5. It’s language-agnostic and highly configurable, so you stay in control.

Imagine you accidentally commit a hardcoded password. Code Guardian instantly flags it, explains why it’s a risk, and can generate a secure fix you can apply with one click. Security remediation becomes as simple as accepting a code suggestion—keeping your code fast, safe, and production-ready.

## Features

- **Real-time vulnerability scanning** - Automatically scans your code as you type.
- **GPT-5 powered analysis** - Uses OpenAI GPT-5 for deep on-demand security analysis.
- **Multi-lanaguage support** - Full support for most languages.
- **One-click fixes** - Apply suggested fixes directly from the editor.

## Installation

1. Install from VS Code Marketplace or Cursor Extensions
2. Configure your AI provider (OpenAI or Anthropic)
3. Add your API key in settings

## Configuration

Open VS Code/Cursor settings and search for "Code Guardian":

```json
{
  "codeGuardian.aiProvider": "openai",
  "codeGuardian.apiKey": "your-api-key-here",
  "codeGuardian.autoScan": true,
  "codeGuardian.allowedLanguages": ["javascript", "typescript"],
  "codeGuardian.blockedLanguages": ["markdown"],
  "codeGuardian.fileIncludeGlobs": ["**/*.{js,ts,jsx,tsx}"],
  "codeGuardian.fileExcludeGlobs": ["**/node_modules/**", "**/.git/**"],
  "codeGuardian.severityThreshold": "low"
}
```

- `allowedLanguages` / `blockedLanguages` let you explicitly opt in or out of language identifiers (defaults allow every text document).
- `fileIncludeGlobs` / `fileExcludeGlobs` cap analysis to the paths you care about and use the same glob syntax as VS Code's `files.exclude`.

## Usage

### Automatic Scanning
With `autoScan` enabled, Code Guardian automatically scans files when:
- You save a file
- You open a new file
- You switch between files

### Manual Scanning
- **Scan Current File**: `Cmd/Ctrl + Shift + P` → "Code Guardian: Scan Current File"
- **Scan Workspace**: `Cmd/Ctrl + Shift + P` → "Code Guardian: Scan Workspace"

### Viewing Results
- Issues appear in the Problems panel
- Click on any issue to jump to the code
- Hover over underlined code for details
- Click the lightbulb icon for fix options

### Applying Fixes
1. Click on the lightbulb icon next to a vulnerability
2. Choose from:
   - **Quick Fix** - Apply pre-defined safe fix
   - **Generate AI Fix** - Get AI-generated fix
   - **Suppress Warning** - Ignore this specific issue

## Security Panel

Open the security panel to see all vulnerabilities:
- `Cmd/Ctrl + Shift + P` → "Code Guardian: Show Security Panel"
- View vulnerabilities grouped by file
- See severity distribution
- Apply fixes in bulk

## API Providers

### OpenAI
- Uses GPT-4 Turbo for analysis
- Get API key from: https://platform.openai.com/api-keys
- Pricing: ~$0.01 per file scan

### Anthropic
- Uses Claude 3 Opus for analysis
- Get API key from: https://console.anthropic.com/
- Pricing: ~$0.015 per file scan

### Local Mode
- Basic pattern matching without AI
- No API key required
- Limited detection capabilities

## Development

```bash
# Install dependencies
npm install

# Compile extension
npm run compile

# Watch for changes
npm run watch

# Package extension
npm run package
```

## Testing

```bash
# Run tests
npm test

# Run with coverage
npm run test:coverage
```

## Security Note

Code Guardian helps identify common vulnerabilities but is not a replacement for:
- Professional security audits
- Penetration testing
- Code review by security experts
- Static Application Security Testing (SAST) tools

Always verify fixes before applying them to production code.

## Privacy

- Code is sent to AI providers for analysis (when using AI mode)
- No code is stored permanently
- API keys are stored locally in VS Code settings
- Consider using local mode for sensitive code

## Contributing

Contributions are welcome! Please read our contributing guidelines and code of conduct.

## License

MIT License - see LICENSE file for details

## Support

- Report issues: [GitHub Issues](https://github.com/yourusername/code-guardian/issues)
- Documentation: [Wiki](https://github.com/yourusername/code-guardian/wiki)
- Discord: [Join our community](https://discord.gg/yourserver)

## Acknowledgments

- Built with ❤️ for the developer community
- Inspired by security best practices from OWASP
- Powered by advanced AI models

---

**Remember**: Security is a journey, not a destination. Stay vigilant! 🛡️
