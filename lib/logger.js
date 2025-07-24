const Utils = require('./utils');

/**
 * Simplified logging system for the CLI
 */
class Logger {
  constructor(options = {}) {
    this.debug = options.debug || false;
    this.verbose = options.verbose || false;
  }

  /**
   * Log action (only in debug mode)
   */
  logAction(tool, action, details = {}) {
    if (this.debug) {
      console.log(`[DEBUG] ${tool}.${action}:`, details);
    }
    // No-op in normal mode - CLI should be quiet unless there's an issue
  }

  /**
   * Log prompt (only in verbose mode)
   */
  async logPrompt(prompt, metadata = {}) {
    if (this.verbose) {
      console.log(`[PROMPT] ${prompt.substring(0, 100)}...`);
    }
    return Date.now().toString(); // Simple conversation ID
  }

  /**
   * Log response (only in verbose mode)
   */
  async logResponse(conversationId, response, metadata = {}) {
    if (this.verbose) {
      console.log(`[RESPONSE] ${response.substring(0, 100)}...`);
    }
  }

  /**
   * Log reasoning (only in debug mode)
   */
  async logReasoning(conversationId, reasoning, decisions = []) {
    if (this.debug) {
      console.log(`[REASONING] ${reasoning}`);
      if (decisions.length > 0) {
        console.log(`[DECISIONS]`, decisions);
      }
    }
  }

  /**
   * Log error (always shown)
   */
  async logError(error, context = {}) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    Utils.logError(`${errorMessage}`);
    
    if (this.debug && Object.keys(context).length > 0) {
      console.error('[ERROR CONTEXT]', context);
    }
  }

  /**
   * No-op methods for compatibility
   */
  async getHistory(limit = 10) {
    return [];
  }

  async endSession() {
    // No-op
  }

  getSessionId() {
    return 'simple-session';
  }

  getLogDir() {
    return null;
  }
}

module.exports = Logger;