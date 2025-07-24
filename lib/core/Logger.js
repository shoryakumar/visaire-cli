const fs = require('fs-extra');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

/**
 * Advanced logging system with structured logging, metrics, and tracing
 * Implements comprehensive logging similar to Forge's logging capabilities
 */
class Logger {
  constructor(options = {}) {
    this.agentId = options.agentId || 'unknown';
    this.level = options.level || 'info';
    this.enableMetrics = options.enableMetrics !== false;
    this.enableTracing = options.enableTracing || false;
    this.logDir = options.logDir || '.visaire/logs';
    this.maxLogFiles = options.maxLogFiles || 10;
    this.maxLogSize = options.maxLogSize || 10 * 1024 * 1024; // 10MB
    
    // Log levels
    this.levels = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3
    };
    
    this.currentLevel = this.levels[this.level] || 1;
    
    // Session tracking
    this.sessionId = uuidv4();
    this.startTime = new Date();
    
    // Metrics storage
    this.metrics = {
      logCounts: { debug: 0, info: 0, warn: 0, error: 0 },
      actions: new Map(),
      performance: new Map(),
      errors: []
    };
    
    // Tracing storage
    this.traces = new Map();
    this.activeTraces = new Set();
    
    // Initialize logging
    this.initializeLogging();
  }

  /**
   * Initialize logging directory and files
   */
  async initializeLogging() {
    try {
      await fs.ensureDir(this.logDir);
      
      // Create session log file
      this.sessionLogFile = path.join(this.logDir, `session-${this.sessionId}.log`);
      this.metricsLogFile = path.join(this.logDir, `metrics-${this.sessionId}.json`);
      this.tracingLogFile = path.join(this.logDir, `tracing-${this.sessionId}.json`);
      
      // Initialize session log
      await this.writeSessionHeader();
      
      // Cleanup old log files
      await this.cleanupOldLogs();
      
    } catch (error) {
      console.error('Failed to initialize logging:', error.message);
    }
  }

  /**
   * Write session header to log file
   */
  async writeSessionHeader() {
    const header = {
      sessionId: this.sessionId,
      agentId: this.agentId,
      startTime: this.startTime.toISOString(),
      level: this.level,
      enableMetrics: this.enableMetrics,
      enableTracing: this.enableTracing,
      platform: process.platform,
      nodeVersion: process.version,
      pid: process.pid
    };

    await this.writeToFile(this.sessionLogFile, `SESSION_START: ${JSON.stringify(header)}\n`);
  }

  /**
   * Debug level logging
   */
  debug(message, data = {}) {
    this.log('debug', message, data);
  }

  /**
   * Info level logging
   */
  info(message, data = {}) {
    this.log('info', message, data);
  }

  /**
   * Warning level logging
   */
  warn(message, data = {}) {
    this.log('warn', message, data);
  }

  /**
   * Error level logging
   */
  error(message, data = {}) {
    this.log('error', message, data);
    
    // Store error for metrics
    if (this.enableMetrics) {
      this.metrics.errors.push({
        message,
        data,
        timestamp: new Date().toISOString(),
        stack: data.stack || new Error().stack
      });
    }
  }

  /**
   * Core logging method
   */
  log(level, message, data = {}) {
    if (this.levels[level] < this.currentLevel) {
      return; // Skip if below current log level
    }

    const logEntry = {
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
      agentId: this.agentId,
      level,
      message,
      data: this.sanitizeData(data),
      pid: process.pid
    };

    // Add trace information if tracing is enabled
    if (this.enableTracing && this.activeTraces.size > 0) {
      logEntry.traces = Array.from(this.activeTraces);
    }

    // Console output with formatting
    this.outputToConsole(logEntry);

    // File output
    this.outputToFile(logEntry);

    // Update metrics
    if (this.enableMetrics) {
      this.metrics.logCounts[level]++;
    }
  }

  /**
   * Output formatted log to console
   */
  outputToConsole(logEntry) {
    // Skip console output in non-debug mode for cleaner user experience
    if (this.level !== 'debug' && logEntry.level === 'debug') {
      return;
    }

    // For user-facing output, only show important messages
    if (this.level !== 'debug' && (logEntry.level === 'info' || logEntry.level === 'warn' || logEntry.level === 'error')) {
      // Check if this is a technical/internal log message
      const technicalPatterns = [
        'Tool registered',
        'Agent initialized', 
        'Default tools initialized',
        'Loaded persisted conversations',
        'Tool execution failed',
        'Prompt processing failed',
        'LLM response failed'
      ];
      
      const isTechnical = technicalPatterns.some(pattern => 
        logEntry.message.includes(pattern)
      );
      
      if (isTechnical) {
        return; // Skip technical messages in user mode
      }
    }

    const timestamp = new Date(logEntry.timestamp).toLocaleTimeString();
    const level = logEntry.level.toUpperCase().padEnd(5);
    const message = logEntry.message;
    
    let output = `[${timestamp}] ${level} ${message}`;
    
    // Only add data in debug mode or for errors
    if (this.level === 'debug' || logEntry.level === 'error') {
      if (Object.keys(logEntry.data).length > 0) {
        const dataStr = JSON.stringify(logEntry.data);
        if (dataStr.length < 200) {
          output += ` | ${dataStr}`;
        } else {
          output += ` | {data: ${Object.keys(logEntry.data).length} fields}`;
        }
      }
    }

    // Color coding for console
    switch (logEntry.level) {
      case 'debug':
        console.log(`\x1b[36m${output}\x1b[0m`); // Cyan
        break;
      case 'info':
        console.log(`\x1b[32m${output}\x1b[0m`); // Green
        break;
      case 'warn':
        console.log(`\x1b[33m${output}\x1b[0m`); // Yellow
        break;
      case 'error':
        console.log(`\x1b[31m${output}\x1b[0m`); // Red
        break;
      default:
        console.log(output);
    }
  }

  /**
   * Output log entry to file
   */
  async outputToFile(logEntry) {
    try {
      // Skip file output if session log file is not initialized yet
      if (!this.sessionLogFile) {
        return;
      }
      
      const logLine = JSON.stringify(logEntry) + '\n';
      await this.writeToFile(this.sessionLogFile, logLine);
    } catch (error) {
      console.error('Failed to write to log file:', error.message);
    }
  }

  /**
   * Log action with structured data
   */
  async logAction(component, action, data = {}) {
    const actionEntry = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      component,
      action,
      data: this.sanitizeData(data),
      sessionId: this.sessionId,
      agentId: this.agentId
    };

    this.info(`${component}:${action}`, data);

    // Store action for metrics
    if (this.enableMetrics) {
      const actionKey = `${component}:${action}`;
      if (!this.metrics.actions.has(actionKey)) {
        this.metrics.actions.set(actionKey, {
          count: 0,
          lastExecuted: null,
          averageData: {}
        });
      }
      
      const actionMetrics = this.metrics.actions.get(actionKey);
      actionMetrics.count++;
      actionMetrics.lastExecuted = actionEntry.timestamp;
    }

    return actionEntry.id;
  }

  /**
   * Log performance metrics
   */
  async logPerformance(operation, duration, metadata = {}) {
    const perfEntry = {
      operation,
      duration,
      metadata: this.sanitizeData(metadata),
      timestamp: new Date().toISOString()
    };

    this.debug(`Performance: ${operation}`, { duration, ...metadata });

    // Store performance data
    if (this.enableMetrics) {
      if (!this.metrics.performance.has(operation)) {
        this.metrics.performance.set(operation, {
          count: 0,
          totalDuration: 0,
          averageDuration: 0,
          minDuration: Infinity,
          maxDuration: 0
        });
      }

      const perfMetrics = this.metrics.performance.get(operation);
      perfMetrics.count++;
      perfMetrics.totalDuration += duration;
      perfMetrics.averageDuration = perfMetrics.totalDuration / perfMetrics.count;
      perfMetrics.minDuration = Math.min(perfMetrics.minDuration, duration);
      perfMetrics.maxDuration = Math.max(perfMetrics.maxDuration, duration);
    }
  }

  /**
   * Start a trace
   */
  startTrace(name, metadata = {}) {
    if (!this.enableTracing) {
      return null;
    }

    const traceId = uuidv4();
    const trace = {
      id: traceId,
      name,
      startTime: Date.now(),
      metadata: this.sanitizeData(metadata),
      events: [],
      status: 'active'
    };

    this.traces.set(traceId, trace);
    this.activeTraces.add(traceId);

    this.debug(`Trace started: ${name}`, { traceId, metadata });

    return traceId;
  }

  /**
   * Add event to trace
   */
  addTraceEvent(traceId, event, data = {}) {
    if (!this.enableTracing || !this.traces.has(traceId)) {
      return;
    }

    const trace = this.traces.get(traceId);
    trace.events.push({
      timestamp: Date.now(),
      event,
      data: this.sanitizeData(data)
    });

    this.debug(`Trace event: ${event}`, { traceId, data });
  }

  /**
   * End a trace
   */
  endTrace(traceId, result = {}) {
    if (!this.enableTracing || !this.traces.has(traceId)) {
      return;
    }

    const trace = this.traces.get(traceId);
    trace.endTime = Date.now();
    trace.duration = trace.endTime - trace.startTime;
    trace.result = this.sanitizeData(result);
    trace.status = 'completed';

    this.activeTraces.delete(traceId);

    this.debug(`Trace completed: ${trace.name}`, {
      traceId,
      duration: trace.duration,
      events: trace.events.length
    });

    return trace;
  }

  /**
   * Get current metrics
   */
  getMetrics() {
    if (!this.enableMetrics) {
      return null;
    }

    return {
      sessionId: this.sessionId,
      agentId: this.agentId,
      startTime: this.startTime.toISOString(),
      uptime: Date.now() - this.startTime.getTime(),
      logCounts: { ...this.metrics.logCounts },
      actions: Object.fromEntries(this.metrics.actions),
      performance: Object.fromEntries(this.metrics.performance),
      errorCount: this.metrics.errors.length,
      recentErrors: this.metrics.errors.slice(-5)
    };
  }

  /**
   * Get trace information
   */
  getTraces(options = {}) {
    if (!this.enableTracing) {
      return null;
    }

    const { active = false, limit = 50 } = options;
    let traces = Array.from(this.traces.values());

    if (active) {
      traces = traces.filter(trace => trace.status === 'active');
    }

    // Sort by start time (most recent first)
    traces.sort((a, b) => b.startTime - a.startTime);

    return traces.slice(0, limit);
  }

  /**
   * Export logs to file
   */
  async exportLogs(format = 'json', outputPath = null) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const defaultPath = path.join(this.logDir, `export-${timestamp}.${format}`);
    const exportPath = outputPath || defaultPath;

    try {
      const exportData = {
        sessionId: this.sessionId,
        agentId: this.agentId,
        exportTime: new Date().toISOString(),
        metrics: this.getMetrics(),
        traces: this.getTraces(),
        logs: await this.readSessionLogs()
      };

      if (format === 'json') {
        await fs.writeJson(exportPath, exportData, { spaces: 2 });
      } else if (format === 'txt') {
        const textContent = this.formatLogsAsText(exportData);
        await fs.writeFile(exportPath, textContent, 'utf8');
      }

      this.info('Logs exported', { path: exportPath, format });
      return exportPath;

    } catch (error) {
      this.error('Failed to export logs', { error: error.message, path: exportPath });
      throw error;
    }
  }

  /**
   * Read session logs from file
   */
  async readSessionLogs() {
    try {
      if (await fs.pathExists(this.sessionLogFile)) {
        const content = await fs.readFile(this.sessionLogFile, 'utf8');
        return content.split('\n')
          .filter(line => line.trim())
          .map(line => {
            try {
              return JSON.parse(line);
            } catch {
              return { raw: line };
            }
          });
      }
    } catch (error) {
      this.warn('Failed to read session logs', { error: error.message });
    }
    return [];
  }

  /**
   * Format logs as text
   */
  formatLogsAsText(exportData) {
    let text = `Visaire Agent Log Export\n`;
    text += `Session ID: ${exportData.sessionId}\n`;
    text += `Agent ID: ${exportData.agentId}\n`;
    text += `Export Time: ${exportData.exportTime}\n`;
    text += `\n${'='.repeat(50)}\n\n`;

    if (exportData.metrics) {
      text += `METRICS:\n`;
      text += `Log Counts: ${JSON.stringify(exportData.metrics.logCounts)}\n`;
      text += `Error Count: ${exportData.metrics.errorCount}\n`;
      text += `Uptime: ${exportData.metrics.uptime}ms\n\n`;
    }

    if (exportData.logs && exportData.logs.length > 0) {
      text += `LOGS:\n`;
      for (const log of exportData.logs) {
        if (log.timestamp && log.level && log.message) {
          text += `[${log.timestamp}] ${log.level.toUpperCase()}: ${log.message}\n`;
        }
      }
    }

    return text;
  }

  /**
   * Sanitize data for logging (remove sensitive information)
   */
  sanitizeData(data) {
    if (!data || typeof data !== 'object') {
      return data;
    }

    const sanitized = { ...data };
    const sensitiveKeys = ['password', 'token', 'key', 'secret', 'auth', 'apikey', 'api_key'];

    for (const key of Object.keys(sanitized)) {
      const lowerKey = key.toLowerCase();
      if (sensitiveKeys.some(sensitive => lowerKey.includes(sensitive))) {
        sanitized[key] = '[REDACTED]';
      }
    }

    return sanitized;
  }

  /**
   * Write to file with error handling
   */
  async writeToFile(filePath, content) {
    try {
      await fs.appendFile(filePath, content);
    } catch (error) {
      console.error(`Failed to write to ${filePath}:`, error.message);
    }
  }

  /**
   * Cleanup old log files
   */
  async cleanupOldLogs() {
    try {
      const files = await fs.readdir(this.logDir);
      const logFiles = files
        .filter(file => file.startsWith('session-') && file.endsWith('.log'))
        .map(file => ({
          name: file,
          path: path.join(this.logDir, file),
          stats: null
        }));

      // Get file stats
      for (const file of logFiles) {
        try {
          file.stats = await fs.stat(file.path);
        } catch (error) {
          // Skip files that can't be accessed
        }
      }

      // Sort by modification time (oldest first)
      const validFiles = logFiles
        .filter(file => file.stats)
        .sort((a, b) => a.stats.mtime - b.stats.mtime);

      // Remove excess files
      if (validFiles.length > this.maxLogFiles) {
        const filesToRemove = validFiles.slice(0, validFiles.length - this.maxLogFiles);
        
        for (const file of filesToRemove) {
          await fs.remove(file.path);
          this.debug('Removed old log file', { file: file.name });
        }
      }

    } catch (error) {
      this.warn('Failed to cleanup old logs', { error: error.message });
    }
  }

  /**
   * Get session ID
   */
  getSessionId() {
    return this.sessionId;
  }

  /**
   * End logging session
   */
  async endSession() {
    try {
      // Write session end marker
      const endMarker = {
        sessionId: this.sessionId,
        endTime: new Date().toISOString(),
        duration: Date.now() - this.startTime.getTime(),
        finalMetrics: this.getMetrics()
      };

      await this.writeToFile(this.sessionLogFile, `SESSION_END: ${JSON.stringify(endMarker)}\n`);

      // Write final metrics to file
      if (this.enableMetrics) {
        await fs.writeJson(this.metricsLogFile, this.getMetrics(), { spaces: 2 });
      }

      // Write traces to file
      if (this.enableTracing) {
        await fs.writeJson(this.tracingLogFile, this.getTraces(), { spaces: 2 });
      }

      this.info('Logging session ended', { duration: endMarker.duration });

    } catch (error) {
      console.error('Failed to end logging session:', error.message);
    }
  }
}

module.exports = Logger;