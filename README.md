# Visaire CLI

A powerful and user-friendly command-line interface for interacting with Large Language Models (Claude, Gemini, GPT). Get AI assistance directly in your terminal with zero configuration hassle.

## 🚀 Quick Start

### 1. Install
```bash
npm install -g visaire
```

### 2. Setup (Interactive)
```bash
visaire setup
```
This will guide you through:
- Choosing your preferred AI provider
- Setting up your API key
- Configuring default settings

### 3. Start Using
```bash
visaire "Explain quantum computing"
```

That's it! 🎉

## 📖 Usage

### Basic Commands

```bash
# Simple question
visaire "How do I center a div in CSS?"

# Pipe input
echo "Review this code for bugs" | visaire

# Use specific provider
visaire --provider gpt "Write a Python function to sort a list"

# Show help
visaire --help
```

### Configuration Commands

```bash
# Interactive setup (recommended for first-time users)
visaire setup

# Show current configuration
visaire config show

# Set API key for a provider
visaire config set --api-key sk-xxx --provider claude

# Set default provider
visaire config set --provider claude

# Reset all settings
visaire config reset
```

## ⚙️ Configuration

### Option 1: Interactive Setup (Recommended)
```bash
visaire setup
```

### Option 2: Manual Configuration

Create `~/.visairerc`:
```json
{
  "defaultProvider": "claude",
  "agent": {
    "enabled": true
  }
}
```

### Option 3: Environment Variables
```bash
export CLAUDE_API_KEY="sk-ant-your-key-here"
export GPT_API_KEY="sk-your-openai-key-here"
export GEMINI_API_KEY="your-google-api-key-here"
```

## 🔑 Getting API Keys

### Claude (Anthropic)
1. Visit [console.anthropic.com](https://console.anthropic.com)
2. Create account and navigate to API Keys
3. Generate new key (starts with `sk-ant-`)

### GPT (OpenAI)
1. Visit [platform.openai.com](https://platform.openai.com)
2. Create account and navigate to API Keys
3. Generate new key (starts with `sk-`)

### Gemini (Google)
1. Visit [Google AI Studio](https://makersuite.google.com)
2. Sign in and create API key
3. Copy the generated key

## 🤖 Agent Mode

Visaire includes an intelligent agent that can execute actions based on AI responses:

- **Create files** when AI suggests code
- **Run commands** when AI provides terminal instructions
- **Install packages** when AI recommends dependencies

Enable/disable with:
```bash
visaire config set --agent-enabled true
```

## 📋 Command Reference

### Main Options
| Option | Description | Example |
|--------|-------------|---------|
| `--provider, -p` | AI provider (claude/gpt/gemini) | `visaire -p claude "question"` |
| `--api-key, -k` | API key for provider | `visaire -k sk-xxx "question"` |
| `--model, -m` | Specific model | `visaire -m gpt-4 "question"` |
| `--agent` | Enable agent mode | `visaire --agent "create a todo app"` |
| `--no-agent` | Disable agent mode | `visaire --no-agent "explain code"` |

### Commands
| Command | Description |
|---------|-------------|
| `visaire setup` | Interactive first-time setup |
| `visaire config show` | Display current configuration |
| `visaire config set` | Update configuration |
| `visaire config reset` | Reset to defaults |

## 🔒 Security

### API Key Security
- **Recommended**: Use `visaire setup` or environment variables
- **Avoid**: Passing API keys via command line (visible in process lists)

### Agent Security
- Agent mode includes built-in safety restrictions
- Commands are filtered for security
- User confirmation required for destructive actions

## 🛠️ Examples

### Code Generation
```bash
visaire "Create a Python function to calculate fibonacci numbers"
```

### Code Review
```bash
cat script.py | visaire "Review this code for potential issues"
```

### Learning
```bash
visaire "Explain the difference between let, const, and var in JavaScript"
```

### Project Help
```bash
visaire "How do I set up a Node.js project with Express and TypeScript?"
```

### Creative Tasks
```bash
visaire "Write a short story about a robot learning to paint"
```

## 🔍 Troubleshooting

### Common Issues

**"No provider configured"**
- Run `visaire setup` for interactive configuration
- Or use `--provider` flag: `visaire --provider claude "question"`

**"No API key found"**
- Run `visaire setup` to set API key
- Or use `visaire config set --api-key <key> --provider <provider>`

**"Invalid API key format"**
- Check your API key matches the expected format for your provider
- Claude: starts with `sk-ant-`
- OpenAI: starts with `sk-`
- Gemini: alphanumeric string

**Network/timeout errors**
- Check internet connection
- Try again (some providers have temporary issues)
- Increase timeout: `visaire --timeout 60000 "question"`

### Getting Help

```bash
# Show all options
visaire --help

# Show current configuration
visaire config show

# Test your API key
visaire --test-key

# Enable debug mode
DEBUG=1 visaire "test prompt"
```

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Issues**: [GitHub Issues](https://github.com/shoryakumar/visaire-cli/issues)
- **Documentation**: This README and `visaire --help`

---

**Made with ❤️ for developers who love working in the terminal.**