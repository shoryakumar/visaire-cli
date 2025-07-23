# Visaire CLI

A powerful command-line interface for interacting with Large Language Models (LLMs) including Claude, Gemini, and GPT. Get AI assistance directly in your terminal without any login or cloud syncing required.

## 🚀 Installation

Install globally via npm:

```bash
npm install -g visaire
```

## 🎯 Quick Start

```bash
# Using Claude
visaire --provider claude --api-key sk-ant-xxx "Explain quantum computing"

# Using GPT
visaire --provider gpt --api-key sk-xxx "Write a Python function to sort a list"

# Using Gemini
visaire --provider gemini --api-key your-key "What is machine learning?"

# Piped input
echo "Build a Node.js server" | visaire --provider gpt --api-key sk-xxx
```

## 📖 Usage

### Basic Syntax

```bash
visaire [options] <prompt>
echo "prompt" | visaire [options]
```

### Command Line Options

| Option | Short | Description | Required |
|--------|-------|-------------|----------|
| `--provider` | `-p` | LLM provider (claude, gemini, gpt) | Yes* |
| `--api-key` | `-k` | API key for the provider | Yes* |
| `--model` | `-m` | Specific model to use | No |
| `--timeout` | `-t` | Request timeout in milliseconds | No |
| `--max-tokens` |  | Maximum tokens in response | No |
| `--temperature` |  | Temperature for response generation (0.0-2.0) | No |
| `--help` | `-h` | Show help information | No |
| `--version` | `-v` | Show version information | No |

*Required unless set in configuration file or environment variables

### Configuration Commands

| Command | Description |
|---------|-------------|
| `--config` | Show current configuration |
| `--config-example` | Create example configuration file |
| `--config-reset` | Reset configuration to defaults |
| `--test-key` | Test API key validity |

## ⚙️ Configuration

### Configuration File

Create a `.visairerc` file in your home directory to set default values:

```json
{
  "defaultProvider": "claude",
  "timeout": 30000,
  "maxRetries": 3,
  "outputFormat": "text"
}
```

### Environment Variables

You can set API keys via environment variables to avoid passing them on the command line:

```bash
export CLAUDE_API_KEY="sk-ant-your-key-here"
export GPT_API_KEY="sk-your-openai-key-here"
export GEMINI_API_KEY="your-google-api-key-here"
```

Then use without the `--api-key` flag:

```bash
visaire --provider claude "Your prompt here"
```

## 🔧 Examples

### Direct Prompts

```bash
# Code generation
visaire -p gpt -k sk-xxx "Write a Python function to calculate fibonacci numbers"

# Text analysis
visaire -p claude -k sk-ant-xxx "Summarize this article: [paste article text]"

# Creative writing
visaire -p gemini -k your-key "Write a short story about time travel"
```

### Piped Input

```bash
# Analyze code
cat script.py | visaire -p claude -k sk-ant-xxx "Review this code for bugs"

# Process text files
echo "Large text content..." | visaire -p gpt -k sk-xxx "Summarize this"

# Chain with other commands
curl -s https://api.github.com/repos/nodejs/node | visaire -p gemini -k your-key "Explain this GitHub API response"
```

### Advanced Usage

```bash
# Use specific model
visaire -p gpt -k sk-xxx --model gpt-4 "Complex reasoning task"

# Adjust creativity
visaire -p claude -k sk-ant-xxx --temperature 0.9 "Write creative content"

# Limit response length
visaire -p gemini -k your-key --max-tokens 500 "Brief explanation needed"

# Custom timeout
visaire -p gpt -k sk-xxx --timeout 60000 "Long processing task"
```

## 🔐 Security Best Practices

### API Key Security

⚠️ **Important Security Notes:**

1. **Command-line visibility**: API keys passed via `--api-key` are visible in process lists and shell history
2. **Recommended approaches**:
   - Use environment variables: `export CLAUDE_API_KEY="your-key"`
   - Store in config file with proper permissions: `chmod 600 ~/.visairerc`
   - Use a secure credential manager

### Configuration File Security

If storing API keys in `.visairerc`, ensure proper file permissions:

```bash
# Set restrictive permissions (owner read/write only)
chmod 600 ~/.visairerc
```

Example secure configuration:

```json
{
  "defaultProvider": "claude",
  "timeout": 30000,
  "maxRetries": 3
}
```

Then use environment variables for API keys.

## 🛠️ API Provider Setup

### Claude (Anthropic)

1. Sign up at [console.anthropic.com](https://console.anthropic.com)
2. Generate an API key
3. API keys start with `sk-ant-`

**Supported Models:**
- `claude-3-sonnet-20240229` (default)
- `claude-3-haiku-20240307`
- `claude-3-opus-20240229`

### GPT (OpenAI)

1. Sign up at [platform.openai.com](https://platform.openai.com)
2. Generate an API key
3. API keys start with `sk-`

**Supported Models:**
- `gpt-3.5-turbo` (default)
- `gpt-4`
- `gpt-4-turbo-preview`
- `gpt-4-32k`

### Gemini (Google)

1. Go to [Google AI Studio](https://makersuite.google.com)
2. Create an API key
3. Enable the Gemini API

**Supported Models:**
- `gemini-pro` (default)
- `gemini-pro-vision`

## 🔍 Troubleshooting

### Common Issues

**"Invalid API key" errors:**
- Verify your API key is correct and active
- Check that the key has proper permissions
- Ensure you're using the right provider

**Network timeouts:**
- Increase timeout: `--timeout 60000`
- Check your internet connection
- Try again later if the provider is experiencing issues

**"No prompt provided" errors:**
- Ensure you're providing a prompt as arguments or via stdin
- Check that piped input is not empty

**Permission denied on config file:**
- Check file permissions: `ls -la ~/.visairerc`
- Fix permissions: `chmod 600 ~/.visairerc`

### Debug Mode

Enable debug mode for detailed error information:

```bash
DEBUG=1 visaire --provider claude --api-key sk-xxx "test prompt"
```

### Testing Your Setup

Test your API key and configuration:

```bash
# Test API key validity
visaire --provider claude --api-key sk-ant-xxx --test-key

# Show current configuration
visaire --config

# Create example configuration
visaire --config-example
```

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🔮 Future Features

- Custom prompt templates
- Plugin system for extensibility
- Response caching
- Conversation history
- Batch processing
- Output format options (JSON, Markdown)

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/visaire/visaire-cli/issues)
- **Documentation**: This README and `visaire --help`
- **Security**: Report security issues privately

---

**Made with ❤️ for developers who love working in the terminal.**