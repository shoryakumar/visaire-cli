const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const { v4: uuidv4 } = require('uuid');
const Utils = require('./utils');

/**
 * Comprehensive logging system for conversations and agent actions
 */
class Logger {
  constructor(options = {}) {
    this.baseDir = options.baseDir || path.join(os.homedir(), '.visaire');
    this.historyFile = path.join(this.baseDir, 'history.log');
    this.agentLogFile = path.join(this.baseDir, 'agent-log.json');
    this.sessionId = uuidv4();
    this.sessionStartTime = new Date();
    
    // Initialize logging directory
    this.initializeLogging().catch(error => {
      console.error('Logger initialization failed:', error.message);
    });
  }

  /**
   * Initialize logging directory and files
   */
  async initializeLogging() {
    try {
      // Ensure .visaire directory exists
      await fs.ensureDir(this.baseDir);
      
      // Initialize history log if it doesn't exist
      if (!await fs.pathExists(this.historyFile)) {
        await fs.writeFile(this.historyFile, '# Visaire CLI History Log\n# Format: [TIMESTAMP] [TYPE] Content\n\n');
      }
      
      // Initialize agent log if it doesn't exist
      if (!await fs.pathExists(this.agentLogFile)) {
        await fs.writeJson(this.agentLogFile, {
          version: '1.0',
          created: new Date().toISOString(),
          sessions: []
        }, { spaces: 2 });
      }

      // Start new session
      await this.startSession();
      
    } catch (error) {
      Utils.logError(`Failed to initialize logging: ${error.message}`);
    }
  }

  /**
   * Start a new logging session
   */
  async startSession() {
    try {
      const agentLog = await fs.readJson(this.agentLogFile);
      
      const session = {
        id: this.sessionId,
        startTime: this.sessionStartTime.toISOString(),
        endTime: null,
        conversations: [],
        actions: [],
        stats: {
          totalPrompts: 0,
          totalResponses: 0,
          totalActions: 0,
          toolsUsed: [],
          errors: 0
        }
      };

      agentLog.sessions.push(session);
      await fs.writeJson(this.agentLogFile, agentLog, { spaces: 2 });
      
    } catch (error) {
      Utils.logError(`Failed to start session: ${error.message}`);
    }
  }

  /**
   * End current session
   */
  async endSession() {
    try {
      const agentLog = await fs.readJson(this.agentLogFile);
      const currentSession = agentLog.sessions.find(s => s.id === this.sessionId);
      
      if (currentSession) {
        currentSession.endTime = new Date().toISOString();
        await fs.writeJson(this.agentLogFile, agentLog, { spaces: 2 });
      }
      
    } catch (error) {
      Utils.logError(`Failed to end session: ${error.message}`);
    }
  }

  /**
   * Log user prompt
   */
  async logPrompt(prompt, metadata = {}) {
    try {
      const timestamp = new Date().toISOString();
      const sanitizedPrompt = Utils.sanitizeForLog(prompt, 500);
      
      // Log to history file
      const historyEntry = `[${timestamp}] [PROMPT] ${sanitizedPrompt}\n`;
      await fs.appendFile(this.historyFile, historyEntry);
      
      // Log to agent log
      const agentLog = await fs.readJson(this.agentLogFile);
      const currentSession = agentLog.sessions.find(s => s.id === this.sessionId);
      
      if (currentSession) {
        const conversation = {
          id: uuidv4(),
          timestamp,
          prompt: sanitizedPrompt,
          metadata,
          response: null,
          actions: [],
          duration: null
        };
        
        currentSession.conversations.push(conversation);
        currentSession.stats.totalPrompts++;
        
        await fs.writeJson(this.agentLogFile, agentLog, { spaces: 2 });
        
        return conversation.id;
      }
      
    } catch (error) {
      Utils.logError(`Failed to log prompt: ${error.message}`);
    }
    
    return null;
  }

  /**
   * Log LLM response
   */
  async logResponse(conversationId, response, metadata = {}) {
    try {
      const timestamp = new Date().toISOString();
      const sanitizedResponse = Utils.sanitizeForLog(response, 1000);
      
      // Log to history file
      const historyEntry = `[${timestamp}] [RESPONSE] ${sanitizedResponse}\n`;
      await fs.appendFile(this.historyFile, historyEntry);
      
      // Log to agent log
      const agentLog = await fs.readJson(this.agentLogFile);
      const currentSession = agentLog.sessions.find(s => s.id === this.sessionId);
      
      if (currentSession) {
        const conversation = currentSession.conversations.find(c => c.id === conversationId);
        
        if (conversation) {
          conversation.response = {
            content: sanitizedResponse,
            timestamp,
            metadata
          };
          
          // Calculate conversation duration
          const startTime = new Date(conversation.timestamp);
          const endTime = new Date(timestamp);
          conversation.duration = endTime - startTime;
          
          currentSession.stats.totalResponses++;
          
          await fs.writeJson(this.agentLogFile, agentLog, { spaces: 2 });
        }
      }
      
    } catch (error) {
      Utils.logError(`Failed to log response: ${error.message}`);
    }
  }

  /**
   * Log agent action
   */
  async logAction(tool, action, details = {}) {
    try {
      const timestamp = new Date().toISOString();
      const actionId = uuidv4();
      
      // Log to history file
      const historyEntry = `[${timestamp}] [ACTION] ${tool}.${action} - ${JSON.stringify(details)}\n`;
      await fs.appendFile(this.historyFile, historyEntry);
      
      // Log to agent log
      const agentLog = await fs.readJson(this.agentLogFile);
      const currentSession = agentLog.sessions.find(s => s.id === this.sessionId);
      
      if (currentSession) {
        const actionLog = {
          id: actionId,
          timestamp,
          tool,
          action,
          details,
          success: details.success !== false
        };
        
        currentSession.actions.push(actionLog);
        currentSession.stats.totalActions++;
        
        // Track tools used
        if (!currentSession.stats.toolsUsed.includes(tool)) {
          currentSession.stats.toolsUsed.push(tool);
        }
        
        // Track errors
        if (!actionLog.success) {
          currentSession.stats.errors++;
        }
        
        await fs.writeJson(this.agentLogFile, agentLog, { spaces: 2 });
        
        return actionId;
      }
      
    } catch (error) {
      Utils.logError(`Failed to log action: ${error.message}`);
    }
    
    return null;
  }

  /**
   * Log agent reasoning
   */
  async logReasoning(conversationId, reasoning, decisions = []) {
    try {
      const timestamp = new Date().toISOString();
      
      // Log to history file
      const historyEntry = `[${timestamp}] [REASONING] ${reasoning}\n`;
      await fs.appendFile(this.historyFile, historyEntry);
      
      // Log to agent log
      const agentLog = await fs.readJson(this.agentLogFile);
      const currentSession = agentLog.sessions.find(s => s.id === this.sessionId);
      
      if (currentSession) {
        const conversation = currentSession.conversations.find(c => c.id === conversationId);
        
        if (conversation) {
          if (!conversation.reasoning) {
            conversation.reasoning = [];
          }
          
          conversation.reasoning.push({
            timestamp,
            reasoning,
            decisions
          });
          
          await fs.writeJson(this.agentLogFile, agentLog, { spaces: 2 });
        }
      }
      
    } catch (error) {
      Utils.logError(`Failed to log reasoning: ${error.message}`);
    }
  }

  /**
   * Log error
   */
  async logError(error, context = {}) {
    try {
      const timestamp = new Date().toISOString();
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Log to history file
      const historyEntry = `[${timestamp}] [ERROR] ${errorMessage} - Context: ${JSON.stringify(context)}\n`;
      await fs.appendFile(this.historyFile, historyEntry);
      
      // Log to agent log
      const agentLog = await fs.readJson(this.agentLogFile);
      const currentSession = agentLog.sessions.find(s => s.id === this.sessionId);
      
      if (currentSession) {
        currentSession.stats.errors++;
        await fs.writeJson(this.agentLogFile, agentLog, { spaces: 2 });
      }
      
    } catch (logError) {
      Utils.logError(`Failed to log error: ${logError.message}`);
    }
  }

  /**
   * Get conversation history
   */
  async getHistory(limit = 10) {
    try {
      const agentLog = await fs.readJson(this.agentLogFile);
      const allConversations = [];
      
      // Collect conversations from all sessions
      for (const session of agentLog.sessions) {
        for (const conversation of session.conversations) {
          allConversations.push({
            ...conversation,
            sessionId: session.id
          });
        }
      }
      
      // Sort by timestamp and limit
      return allConversations
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, limit);
        
    } catch (error) {
      Utils.logError(`Failed to get history: ${error.message}`);
      return [];
    }
  }

  /**
   * Get session statistics
   */
  async getSessionStats(sessionId = null) {
    try {
      const agentLog = await fs.readJson(this.agentLogFile);
      
      if (sessionId) {
        const session = agentLog.sessions.find(s => s.id === sessionId);
        return session ? session.stats : null;
      }
      
      // Return current session stats
      const currentSession = agentLog.sessions.find(s => s.id === this.sessionId);
      return currentSession ? currentSession.stats : null;
      
    } catch (error) {
      Utils.logError(`Failed to get session stats: ${error.message}`);
      return null;
    }
  }

  /**
   * Get all sessions
   */
  async getAllSessions() {
    try {
      const agentLog = await fs.readJson(this.agentLogFile);
      return agentLog.sessions.map(session => ({
        id: session.id,
        startTime: session.startTime,
        endTime: session.endTime,
        stats: session.stats
      }));
      
    } catch (error) {
      Utils.logError(`Failed to get all sessions: ${error.message}`);
      return [];
    }
  }

  /**
   * Clean old logs
   */
  async cleanOldLogs(daysToKeep = 30) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
      
      const agentLog = await fs.readJson(this.agentLogFile);
      
      // Filter sessions
      agentLog.sessions = agentLog.sessions.filter(session => {
        const sessionDate = new Date(session.startTime);
        return sessionDate >= cutoffDate;
      });
      
      await fs.writeJson(this.agentLogFile, agentLog, { spaces: 2 });
      
      // Clean history log (keep only recent entries)
      const historyContent = await fs.readFile(this.historyFile, 'utf8');
      const lines = historyContent.split('\n');
      const filteredLines = lines.filter(line => {
        if (line.startsWith('#') || line.trim() === '') return true;
        
        const timestampMatch = line.match(/\[([^\]]+)\]/);
        if (timestampMatch) {
          const lineDate = new Date(timestampMatch[1]);
          return lineDate >= cutoffDate;
        }
        
        return true;
      });
      
      await fs.writeFile(this.historyFile, filteredLines.join('\n'));
      
      Utils.logSuccess(`Cleaned logs older than ${daysToKeep} days`);
      
    } catch (error) {
      Utils.logError(`Failed to clean old logs: ${error.message}`);
    }
  }

  /**
   * Export logs
   */
  async exportLogs(outputPath) {
    try {
      const agentLog = await fs.readJson(this.agentLogFile);
      const historyContent = await fs.readFile(this.historyFile, 'utf8');
      
      const exportData = {
        agentLog,
        history: historyContent,
        exportedAt: new Date().toISOString(),
        version: '1.0'
      };
      
      await fs.writeJson(outputPath, exportData, { spaces: 2 });
      Utils.logSuccess(`Logs exported to ${outputPath}`);
      
    } catch (error) {
      Utils.logError(`Failed to export logs: ${error.message}`);
    }
  }

  /**
   * Get logging directory path
   */
  getLogDir() {
    return this.baseDir;
  }

  /**
   * Get current session ID
   */
  getSessionId() {
    return this.sessionId;
  }
}

module.exports = Logger;