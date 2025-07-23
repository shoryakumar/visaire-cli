const chalk = require('chalk');
const ora = require('ora');

/**
 * Utility functions for formatting, logging, and user feedback
 */
class Utils {
  /**
   * Create a spinner with custom text and color
   */
  static createSpinner(text, color = 'cyan') {
    return ora({
      text: chalk[color](text),
      spinner: 'dots'
    });
  }

  /**
   * Log success message with green checkmark
   */
  static logSuccess(message) {
    console.log(chalk.green('✓') + ' ' + chalk.white(message));
  }

  /**
   * Log error message with red X
   */
  static logError(message) {
    console.error(chalk.red('✗') + ' ' + chalk.white(message));
  }

  /**
   * Log warning message with yellow triangle
   */
  static logWarning(message) {
    console.warn(chalk.yellow('⚠') + ' ' + chalk.white(message));
  }

  /**
   * Log info message with blue info icon
   */
  static logInfo(message) {
    console.log(chalk.blue('ℹ') + ' ' + chalk.white(message));
  }

  /**
   * Format the LLM response for display
   */
  static formatResponse(response, provider) {
    const header = chalk.cyan(`\n📤 Response from ${provider.toUpperCase()}:\n`);
    const separator = chalk.gray('─'.repeat(50));
    const content = chalk.white(response);
    const footer = chalk.gray('\n' + '─'.repeat(50));
    
    return header + separator + '\n' + content + footer + '\n';
  }

  /**
   * Format error messages with context
   */
  static formatError(error, provider = null) {
    let message = 'An error occurred';
    
    if (error.response) {
      // HTTP error response
      const status = error.response.status;
      const statusText = error.response.statusText;
      
      if (status === 401) {
        message = 'Invalid API key. Please check your API key and try again.';
      } else if (status === 429) {
        message = 'Rate limit exceeded. Please wait a moment and try again.';
      } else if (status === 403) {
        message = 'Access forbidden. Please check your API key permissions.';
      } else if (status >= 500) {
        message = `${provider || 'API'} server error (${status}). Please try again later.`;
      } else {
        message = `API error: ${status} ${statusText}`;
      }
    } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      message = 'Network error. Please check your internet connection.';
    } else if (error.message) {
      message = error.message;
    }

    return message;
  }

  /**
   * Validate API key format for different providers
   */
  static validateApiKey(apiKey, provider) {
    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
      return false;
    }

    const trimmedKey = apiKey.trim();

    switch (provider) {
      case 'claude':
        // Anthropic API keys typically start with 'sk-ant-'
        return trimmedKey.startsWith('sk-ant-') && trimmedKey.length > 20;
      
      case 'gpt':
        // OpenAI API keys typically start with 'sk-'
        return trimmedKey.startsWith('sk-') && trimmedKey.length > 20;
      
      case 'gemini':
        // Google API keys are typically 39 characters long
        return trimmedKey.length >= 30 && !trimmedKey.includes(' ');
      
      default:
        return trimmedKey.length > 10;
    }
  }

  /**
   * Sanitize input text for logging (remove sensitive information)
   */
  static sanitizeForLog(text, maxLength = 100) {
    if (!text) return '';
    
    const sanitized = text.replace(/sk-[a-zA-Z0-9-_]+/g, 'sk-***');
    return sanitized.length > maxLength 
      ? sanitized.substring(0, maxLength) + '...'
      : sanitized;
  }

  /**
   * Check if input is coming from stdin (piped input)
   */
  static isStdinInput() {
    return !process.stdin.isTTY;
  }

  /**
   * Read input from stdin
   */
  static async readStdin() {
    return new Promise((resolve, reject) => {
      let input = '';
      
      process.stdin.setEncoding('utf8');
      
      process.stdin.on('data', (chunk) => {
        input += chunk;
      });
      
      process.stdin.on('end', () => {
        resolve(input.trim());
      });
      
      process.stdin.on('error', (error) => {
        reject(error);
      });
      
      // Handle case where stdin is not available
      setTimeout(() => {
        if (input === '') {
          reject(new Error('No input received from stdin'));
        }
      }, 1000);
    });
  }

  /**
   * Display help information with colored formatting
   */
  static displayHelp() {
    const help = `
${chalk.cyan.bold('Visaire CLI')} - Interact with Large Language Models

${chalk.yellow('USAGE:')}
  visaire [options] <prompt>
  echo "prompt" | visaire [options]

${chalk.yellow('OPTIONS:')}
  --provider, -p    LLM provider (claude, gemini, gpt) ${chalk.gray('[required]')}
  --api-key, -k     API key for the provider ${chalk.gray('[required]')}
  --help, -h        Show this help message
  --version, -v     Show version information

${chalk.yellow('EXAMPLES:')}
  ${chalk.gray('# Direct prompt')}
  visaire --provider claude --api-key sk-ant-xxx "Explain quantum computing"
  
  ${chalk.gray('# Piped input')}
  echo "Write a Python function" | visaire --provider gpt --api-key sk-xxx
  
  ${chalk.gray('# Using short flags')}
  visaire -p gemini -k your-api-key "What is machine learning?"

${chalk.yellow('CONFIGURATION:')}
  Create a ${chalk.cyan('.visairerc')} file in your home directory to set default values:
  ${chalk.gray('{')}
  ${chalk.gray('  "defaultProvider": "claude",')}
  ${chalk.gray('  "timeout": 30000')}
  ${chalk.gray('}')}

${chalk.yellow('SECURITY NOTE:')}
  ${chalk.red('⚠ API keys passed via command line are visible in process lists.')}
  ${chalk.white('Consider using environment variables or the config file.')}
`;
    
    console.log(help);
  }
}

module.exports = Utils;