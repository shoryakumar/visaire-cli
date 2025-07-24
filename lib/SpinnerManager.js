const chalk = require('chalk');
const ora = require('ora');

/**
 * Advanced Spinner Manager with animated loading and timing
 * Provides animated spinners with elapsed time tracking and dynamic messages
 */
class SpinnerManager {
  constructor() {
    this.spinner = null;
    this.startTime = null;
    this.message = null;
    this.tracker = null;
    this.isActive = false;
  }

  /**
   * Start the spinner with a message
   */
  start(message = null) {
    // Stop any existing spinner first
    this.stop();

    const words = [
      'Thinking',
      'Processing', 
      'Analyzing',
      'Working',
      'Researching',
      'Synthesizing',
      'Reasoning',
      'Contemplating',
      'Computing',
      'Generating'
    ];

    // Use a random word from the list if no message provided
    const word = message || words[Math.floor(Math.random() * words.length)];
    
    // Store the base message for timer updates
    this.message = word;
    this.startTime = Date.now();
    this.isActive = true;

    // Create the spinner with modern styling
    this.spinner = ora({
      text: this.formatMessage(0),
      spinner: {
        interval: 60, // 60ms for smooth animation
        frames: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
      },
      color: 'green'
    });

    this.spinner.start();

    // Start the timer tracker for elapsed time updates
    this.tracker = setInterval(() => {
      if (this.isActive && this.spinner && this.startTime) {
        const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
        this.spinner.text = this.formatMessage(elapsed);
      }
    }, 500); // Update every 500ms

    return this;
  }

  /**
   * Format the message with elapsed time
   */
  formatMessage(seconds) {
    const baseMessage = chalk.green.bold(this.message);
    const timeInfo = `${seconds}s`;
    const hint = chalk.white.dim('Ctrl+C to interrupt');
    
    return `${baseMessage} ${timeInfo} · ${hint}`;
  }

  /**
   * Stop the spinner with optional completion message
   */
  stop(message = null) {
    if (this.tracker) {
      clearInterval(this.tracker);
      this.tracker = null;
    }

    if (this.spinner) {
      this.spinner.stop();
      this.spinner = null;
    }

    this.isActive = false;

    // Print completion message if provided
    if (message) {
      console.log(message);
    }

    // Reset state
    this.startTime = null;
    this.message = null;

    return this;
  }

  /**
   * Write a line while preserving spinner state
   */
  writeLn(message) {
    const wasRunning = this.isActive;
    const prevMessage = this.message;
    
    // Stop spinner, print message, restart if it was running
    this.stop(message);
    
    if (wasRunning && prevMessage) {
      // Small delay to ensure clean output
      setTimeout(() => {
        this.start(prevMessage);
      }, 10);
    }

    return this;
  }

  /**
   * Update the spinner message without restarting
   */
  updateMessage(newMessage) {
    if (this.isActive) {
      this.message = newMessage;
      if (this.spinner && this.startTime) {
        const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
        this.spinner.text = this.formatMessage(elapsed);
      }
    }
    return this;
  }

  /**
   * Check if spinner is currently active
   */
  isRunning() {
    return this.isActive;
  }

  /**
   * Get elapsed time in seconds
   */
  getElapsedTime() {
    if (this.startTime) {
      return Math.floor((Date.now() - this.startTime) / 1000);
    }
    return 0;
  }

  /**
   * Succeed and stop with success message
   */
  succeed(message = null) {
    if (this.spinner) {
      this.spinner.succeed(message);
      this.cleanup();
    } else if (message) {
      console.log(chalk.green('✓') + ' ' + message);
    }
    return this;
  }

  /**
   * Fail and stop with error message  
   */
  fail(message = null) {
    if (this.spinner) {
      this.spinner.fail(message);
      this.cleanup();
    } else if (message) {
      console.log(chalk.red('✗') + ' ' + message);
    }
    return this;
  }

  /**
   * Warn and stop with warning message
   */
  warn(message = null) {
    if (this.spinner) {
      this.spinner.warn(message);
      this.cleanup();
    } else if (message) {
      console.log(chalk.yellow('⚠') + ' ' + message);
    }
    return this;
  }

  /**
   * Info and stop with info message
   */
  info(message = null) {
    if (this.spinner) {
      this.spinner.info(message);
      this.cleanup();
    } else if (message) {
      console.log(chalk.blue('ℹ') + ' ' + message);
    }
    return this;
  }

  /**
   * Internal cleanup method
   */
  cleanup() {
    if (this.tracker) {
      clearInterval(this.tracker);
      this.tracker = null;
    }
    this.isActive = false;
    this.startTime = null;
    this.message = null;
    this.spinner = null;
  }
}

module.exports = SpinnerManager;