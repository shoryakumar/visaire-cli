const { v4: uuidv4 } = require('uuid');
const EventEmitter = require('events');
const fs = require('fs-extra');
const path = require('path');
const Joi = require('joi');

/**
 * Manages conversation state, history, and branching
 * Implements sophisticated conversation tracking similar to Forge
 */
class ConversationManager extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.logger = options.logger;
    this.agentId = options.agentId;
    this.storageDir = options.storageDir || '.visaire/conversations';
    this.maxHistorySize = options.maxHistorySize || 1000;
    this.compressionThreshold = options.compressionThreshold || 100;
    
    // In-memory conversation store
    this.conversations = new Map();
    this.activeConversations = new Set();
    
    // Ensure storage directory exists
    this.initializeStorage();
  }

  /**
   * Initialize storage directory
   */
  async initializeStorage() {
    try {
      await fs.ensureDir(this.storageDir);
      await this.loadPersistedConversations();
    } catch (error) {
      if (this.logger) {
        this.logger.error('Failed to initialize conversation storage', { error: error.message });
      }
    }
  }

  /**
   * Load persisted conversations from disk
   */
  async loadPersistedConversations() {
    try {
      const files = await fs.readdir(this.storageDir);
      const conversationFiles = files.filter(f => f.endsWith('.json'));
      
      for (const file of conversationFiles) {
        try {
          const filePath = path.join(this.storageDir, file);
          const data = await fs.readJson(filePath);
          this.conversations.set(data.id, data);
        } catch (error) {
          if (this.logger) {
            this.logger.warn('Failed to load conversation file', { file, error: error.message });
          }
        }
      }

      if (this.logger) {
        this.logger.info('Loaded persisted conversations', { count: this.conversations.size });
      }
    } catch (error) {
      if (this.logger) {
        this.logger.error('Failed to load persisted conversations', { error: error.message });
      }
    }
  }

  /**
   * Start a new conversation
   */
  async startConversation(options = {}) {
    const schema = Joi.object({
      id: Joi.string().default(() => uuidv4()),
      input: Joi.string().required(),
      options: Joi.object().default({}),
      agentId: Joi.string().required(),
      parentId: Joi.string().optional(),
      branchPoint: Joi.number().optional()
    });

    const { error, value } = schema.validate(options);
    if (error) {
      throw new Error(`Invalid conversation options: ${error.details[0].message}`);
    }

    const conversation = {
      id: value.id,
      agentId: value.agentId,
      parentId: value.parentId,
      branchPoint: value.branchPoint,
      startTime: new Date().toISOString(),
      endTime: null,
      status: 'active',
      messages: [
        {
          id: uuidv4(),
          role: 'user',
          content: value.input,
          timestamp: new Date().toISOString(),
          metadata: value.options
        }
      ],
      context: {
        workingDirectory: process.cwd(),
        environment: process.env.NODE_ENV || 'development',
        files: [],
        tools: [],
        variables: {}
      },
      reasoning: [],
      actions: [],
      metrics: {
        messageCount: 1,
        toolCalls: 0,
        errors: 0,
        totalTokens: 0,
        duration: 0
      },
      metadata: {
        created: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        version: '1.0.0'
      }
    };

    // Store conversation
    this.conversations.set(conversation.id, conversation);
    this.activeConversations.add(conversation.id);

    // Persist to disk
    await this.persistConversation(conversation);

    if (this.logger) {
      this.logger.info('Conversation started', {
        id: conversation.id,
        agentId: value.agentId,
        parentId: value.parentId
      });
    }

    this.emit('conversation:start', conversation);
    return conversation;
  }

  /**
   * Add message to conversation
   */
  async addMessage(conversationId, message) {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    const messageSchema = Joi.object({
      role: Joi.string().valid('user', 'assistant', 'system', 'tool').required(),
      content: Joi.string().required(),
      metadata: Joi.object().default({}),
      toolCalls: Joi.array().default([]),
      reasoning: Joi.object().optional()
    });

    const { error, value } = messageSchema.validate(message);
    if (error) {
      throw new Error(`Invalid message: ${error.details[0].message}`);
    }

    const messageObj = {
      id: uuidv4(),
      ...value,
      timestamp: new Date().toISOString(),
      conversationId
    };

    conversation.messages.push(messageObj);
    conversation.metrics.messageCount++;
    conversation.metadata.lastUpdated = new Date().toISOString();

    // Update context if this is a tool response
    if (value.role === 'tool') {
      this.updateConversationContext(conversation, messageObj);
    }

    await this.persistConversation(conversation);

    if (this.logger) {
      this.logger.debug('Message added to conversation', {
        conversationId,
        messageId: messageObj.id,
        role: value.role
      });
    }

    this.emit('message:added', { conversation, message: messageObj });
    return messageObj;
  }

  /**
   * Update conversation with reasoning and execution results
   */
  async updateConversation(conversationId, update) {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    // Add reasoning if provided
    if (update.reasoning) {
      conversation.reasoning.push({
        id: uuidv4(),
        timestamp: new Date().toISOString(),
        ...update.reasoning
      });
    }

    // Add execution results if provided
    if (update.executionResults) {
      conversation.actions.push({
        id: uuidv4(),
        timestamp: new Date().toISOString(),
        ...update.executionResults
      });
      
      conversation.metrics.toolCalls += update.executionResults.summary?.total || 0;
    }

    // Update metrics
    if (update.metrics) {
      Object.assign(conversation.metrics, update.metrics);
    }

    conversation.metadata.lastUpdated = new Date().toISOString();
    await this.persistConversation(conversation);

    this.emit('conversation:updated', { conversation, update });
    return conversation;
  }

  /**
   * Create a branch from an existing conversation
   */
  async createBranch(parentId, branchPoint, newInput) {
    const parent = this.conversations.get(parentId);
    if (!parent) {
      throw new Error(`Parent conversation ${parentId} not found`);
    }

    if (branchPoint >= parent.messages.length) {
      throw new Error(`Branch point ${branchPoint} exceeds message count`);
    }

    // Create new conversation as a branch
    const branch = await this.startConversation({
      input: newInput,
      agentId: parent.agentId,
      parentId,
      branchPoint
    });

    // Copy messages up to branch point
    const messagesToCopy = parent.messages.slice(0, branchPoint + 1);
    for (const msg of messagesToCopy) {
      if (msg.role !== 'user' || msg.content !== newInput) {
        await this.addMessage(branch.id, {
          role: msg.role,
          content: msg.content,
          metadata: { ...msg.metadata, copiedFromParent: true }
        });
      }
    }

    if (this.logger) {
      this.logger.info('Conversation branch created', {
        parentId,
        branchId: branch.id,
        branchPoint
      });
    }

    this.emit('conversation:branched', { parent, branch, branchPoint });
    return branch;
  }

  /**
   * End a conversation
   */
  async endConversation(conversationId, reason = 'completed') {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    conversation.status = 'ended';
    conversation.endTime = new Date().toISOString();
    conversation.metrics.duration = new Date(conversation.endTime) - new Date(conversation.startTime);
    conversation.metadata.lastUpdated = new Date().toISOString();
    conversation.metadata.endReason = reason;

    this.activeConversations.delete(conversationId);
    await this.persistConversation(conversation);

    if (this.logger) {
      this.logger.info('Conversation ended', {
        id: conversationId,
        reason,
        duration: conversation.metrics.duration
      });
    }

    this.emit('conversation:end', conversation);
    return conversation;
  }

  /**
   * Get conversation by ID
   */
  getConversation(conversationId) {
    return this.conversations.get(conversationId);
  }

  /**
   * Get conversation history
   */
  getHistory(options = {}) {
    const {
      limit = 50,
      agentId = null,
      status = null,
      sortBy = 'startTime',
      sortOrder = 'desc'
    } = options;

    let conversations = Array.from(this.conversations.values());

    // Filter by agent ID
    if (agentId) {
      conversations = conversations.filter(c => c.agentId === agentId);
    }

    // Filter by status
    if (status) {
      conversations = conversations.filter(c => c.status === status);
    }

    // Sort
    conversations.sort((a, b) => {
      const aVal = a[sortBy];
      const bVal = b[sortBy];
      
      if (sortOrder === 'desc') {
        return bVal > aVal ? 1 : -1;
      } else {
        return aVal > bVal ? 1 : -1;
      }
    });

    // Limit
    return conversations.slice(0, limit);
  }

  /**
   * Search conversations
   */
  searchConversations(query, options = {}) {
    const {
      searchIn = ['messages'],
      caseSensitive = false,
      limit = 20
    } = options;

    const searchTerm = caseSensitive ? query : query.toLowerCase();
    const results = [];

    for (const conversation of this.conversations.values()) {
      let matches = false;

      if (searchIn.includes('messages')) {
        for (const message of conversation.messages) {
          const content = caseSensitive ? message.content : message.content.toLowerCase();
          if (content.includes(searchTerm)) {
            matches = true;
            break;
          }
        }
      }

      if (matches) {
        results.push(conversation);
        if (results.length >= limit) break;
      }
    }

    return results;
  }

  /**
   * Update conversation context based on tool responses
   */
  updateConversationContext(conversation, message) {
    if (message.role === 'tool' && message.metadata) {
      // Update files context
      if (message.metadata.files) {
        conversation.context.files = [
          ...conversation.context.files,
          ...message.metadata.files
        ].slice(-50); // Keep last 50 files
      }

      // Update tools context
      if (message.metadata.tool) {
        conversation.context.tools.push({
          name: message.metadata.tool,
          timestamp: message.timestamp,
          result: message.metadata.result
        });
      }

      // Update variables
      if (message.metadata.variables) {
        Object.assign(conversation.context.variables, message.metadata.variables);
      }
    }
  }

  /**
   * Persist conversation to disk
   */
  async persistConversation(conversation) {
    try {
      const filePath = path.join(this.storageDir, `${conversation.id}.json`);
      await fs.writeJson(filePath, conversation, { spaces: 2 });
    } catch (error) {
      if (this.logger) {
        this.logger.error('Failed to persist conversation', {
          id: conversation.id,
          error: error.message
        });
      }
    }
  }

  /**
   * Close all active conversations
   */
  async closeAll() {
    const promises = Array.from(this.activeConversations).map(id =>
      this.endConversation(id, 'shutdown')
    );
    
    await Promise.all(promises);
    
    if (this.logger) {
      this.logger.info('All conversations closed');
    }
  }

  /**
   * Get manager status
   */
  getStatus() {
    return {
      totalConversations: this.conversations.size,
      activeConversations: this.activeConversations.size,
      storageDir: this.storageDir,
      maxHistorySize: this.maxHistorySize
    };
  }

  /**
   * Cleanup old conversations
   */
  async cleanup(options = {}) {
    const { 
      maxAge = 30 * 24 * 60 * 60 * 1000, // 30 days
      keepActive = true 
    } = options;

    const cutoff = new Date(Date.now() - maxAge);
    const toDelete = [];

    for (const [id, conversation] of this.conversations) {
      const conversationDate = new Date(conversation.startTime);
      
      if (conversationDate < cutoff) {
        if (keepActive && this.activeConversations.has(id)) {
          continue;
        }
        toDelete.push(id);
      }
    }

    // Delete conversations
    for (const id of toDelete) {
      this.conversations.delete(id);
      this.activeConversations.delete(id);
      
      try {
        const filePath = path.join(this.storageDir, `${id}.json`);
        await fs.remove(filePath);
      } catch (error) {
        if (this.logger) {
          this.logger.warn('Failed to delete conversation file', { id, error: error.message });
        }
      }
    }

    if (this.logger) {
      this.logger.info('Conversation cleanup completed', { deleted: toDelete.length });
    }

    return { deleted: toDelete.length };
  }
}

module.exports = ConversationManager;