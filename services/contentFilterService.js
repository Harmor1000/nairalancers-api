import User from "../models/user.model.js";

class ContentFilterService {
  constructor() {
    // Regular expressions for detecting different types of contact information
    this.patterns = {
      // Email patterns - more comprehensive
      email: [
        /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
        /\b[A-Za-z0-9._%+-]+\s*@\s*[A-Za-z0-9.-]+\s*\.\s*[A-Z|a-z]{2,}\b/g,
        /\b[A-Za-z0-9._%+-]+\s*\[\s*@\s*\]\s*[A-Za-z0-9.-]+\s*\[\s*\.\s*\]\s*[A-Z|a-z]{2,}\b/g,
        /\b[A-Za-z0-9._%+-]+\s*\(\s*@\s*\)\s*[A-Za-z0-9.-]+\s*\(\s*\.\s*\)\s*[A-Z|a-z]{2,}\b/g
      ],
      
      // Phone number patterns (less aggressive)
      phone: [
        /(?:call|text|phone|mobile|whatsapp)[\s:]*(\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}\b/gi, // US format with context
        /(?:call|text|phone|mobile|whatsapp)[\s:]*(\+?234[-.\s]?)?[0-9]{10,11}\b/gi, // Nigerian format with context
        /(?:call|text|phone|mobile)[\s:]*(\+?[1-9]{1}[0-9]{0,3}[-.\s]?)?[0-9]{4,14}\b/gi, // International with context
        /\b(my|our)\s+(phone|mobile|number)\s+(is|are)[\s:]*[0-9+\-.\s]{7,}\b/gi, // Explicit sharing context
        /\b[0-9]{10,15}\b(?=\s*(is\s+my|for\s+contact|to\s+reach))/g // Long sequences only with contact context
      ],
      
      // Social media handles and platforms (less aggressive, allow portfolio mentions)
      social: [
        /(?:contact|reach|find)[\s\w]*@[A-Za-z0-9_]+\b/gi, // @ handles only in contact context
        /\b(instagram|insta|ig)[\s:]*(?:contact|dm|message)[\s:]*@?[A-Za-z0-9_.-]+\b/gi,
        /\b(twitter|tweet|tw)[\s:]*(?:contact|dm|message)[\s:]*@?[A-Za-z0-9_.-]+\b/gi,
        /\b(facebook|fb)[\s:]*(?:contact|message)[\s:]*@?[A-Za-z0-9_.-]+\b/gi,
        /\b(telegram|tg)[\s:]*(?:contact|message)[\s:]*@?[A-Za-z0-9_.-]+\b/gi,
        /\b(whatsapp|wa)[\s:]*(?:contact|message|chat)[\s:]*@?[A-Za-z0-9_.-]+\b/gi,
        /\b(discord)[\s:]*(?:contact|message)[\s:]*@?[A-Za-z0-9_.-]+#[0-9]{4}\b/gi,
        /\b(snapchat|snap)[\s:]*(?:contact|add)[\s:]*@?[A-Za-z0-9_.-]+\b/gi
      ],
      
      // URLs and website patterns (more selective)
      url: [
        /https?:\/\/(?!github\.com|behance\.net|dribbble\.com|linkedin\.com)[^\s]+/g, // Exclude portfolio sites
        /www\.(?!github\.com|behance\.net|dribbble\.com|linkedin\.com)[^\s]+\.[a-z]{2,}/gi,
        /\b(?!github|behance|dribbble|linkedin)[a-z0-9.-]+\.[a-z]{2,}(?!\.(com|net|org)\/[\w\-]+)\b/gi, // Exclude common portfolio domains
        /\b[a-z0-9.-]+\s*\[\s*\.\s*\]\s*[a-z]{2,}\b/gi, // Obfuscated dots
        /\b[a-z0-9.-]+\s*\(\s*\.\s*\)\s*[a-z]{2,}\b/gi
      ],
      
      // Skype and other messaging platforms
      messaging: [
        /\bskype[\s:]*[A-Za-z0-9_.-]+\b/gi,
        /\bzoom[\s:]*[A-Za-z0-9_.-]+\b/gi,
        /\bmeet[\s:]*[A-Za-z0-9_.-]+\b/gi,
        /\bteams[\s:]*[A-Za-z0-9_.-]+\b/gi,
        /\bkakao[\s:]*[A-Za-z0-9_.-]+\b/gi,
        /\bviber[\s:]*[A-Za-z0-9_.-]+\b/gi,
        /\bwechat[\s:]*[A-Za-z0-9_.-]+\b/gi
      ],
      
      // Obfuscated contact attempts
      obfuscated: [
        /\b(call|text|email|contact)\s+(me|us)\s+(at|on)\b/gi,
        /\b(reach|contact)\s+(me|us)\s+(outside|off)\s+(platform|site)\b/gi,
        /\b(my|our)\s+(number|phone|email|contact)\s+(is|are)\b/gi,
        /\b(email|call|text|message)\s+(me|us)\s+(directly|privately)\b/gi,
        /\b(send|give)\s+(me|us)\s+(your|ur)\s+(number|phone|email|contact)\b/gi,
        /\b(communicate|talk|discuss)\s+(outside|off)\s+(here|platform|site)\b/gi
      ]
    };

    // Common obfuscation techniques
    this.obfuscationPatterns = [
      { pattern: /\[at\]/gi, replacement: '@' },
      { pattern: /\(at\)/gi, replacement: '@' },
      { pattern: /\s*at\s*/gi, replacement: '@' },
      { pattern: /\[dot\]/gi, replacement: '.' },
      { pattern: /\(dot\)/gi, replacement: '.' },
      { pattern: /\s*dot\s*/gi, replacement: '.' },
      { pattern: /\[com\]/gi, replacement: '.com' },
      { pattern: /\(com\)/gi, replacement: '.com' },
      { pattern: /\s+/g, replacement: ' ' } // normalize whitespace
    ];

    // Whitelist patterns (legitimate use cases)
    this.whitelist = [
      /\b(company|business|website|portfolio|work|sample|project)\s+(url|link|website|site)\b/gi,
      /\b(my|our|company)\s+(official|business|portfolio|work)\s+(website|site|url|link)\b/gi,
      /\b(check\s+out\s+my|view\s+my|see\s+my|visit\s+my)\s+(portfolio|work|samples|website|github|behance|dribbble)\b/gi,
      /\b(portfolio|github|behance|dribbble|linkedin)\s+(link|url|profile)\b/gi,
      /\b(my\s+work\s+on|samples\s+on|profile\s+on)\s+(github|behance|dribbble|linkedin)\b/gi,
      /\b(business\s+hours|office\s+hours|working\s+hours)\b/gi,
      /\b(project\s+reference|work\s+reference|sample\s+work)\b/gi
    ];

    // Severity levels for different violations
    this.severityLevels = {
      LOW: 'low',      // Potential contact info, might be false positive
      MEDIUM: 'medium', // Clear contact info attempt
      HIGH: 'high'     // Obfuscated or repeated attempts
    };
  }

  /**
   * Main filter method - analyzes and filters content
   * @param {string} content - The message content to filter
   * @param {string} userId - The user ID sending the message
   * @param {Object} options - Filter options
   * @returns {Object} - Filter result
   */
  async filterContent(content, userId, options = {}) {
    if (!content || typeof content !== 'string') {
      return { isAllowed: true, filteredContent: content };
    }

    const result = {
      isAllowed: true,
      filteredContent: content,
      violations: [],
      severity: null,
      action: 'none', // 'none', 'filter', 'block', 'warn'
      warning: null
    };

    // Normalize content for analysis
    let normalizedContent = this.normalizeContent(content);

    // Check for contact information
    const detectedViolations = this.detectContactInfo(normalizedContent);

    if (detectedViolations.length > 0) {
      result.violations = detectedViolations;
      result.severity = this.calculateSeverity(detectedViolations, normalizedContent);

      // Get user's violation history
      const userViolationHistory = await this.getUserViolationHistory(userId);
      
      // Determine action based on severity and history
      const action = this.determineAction(result.severity, userViolationHistory, options);
      result.action = action.type;
      result.warning = action.warning;

      // Apply the determined action
      switch (action.type) {
        case 'block':
          result.isAllowed = false;
          result.filteredContent = null;
          break;
        
        case 'filter':
          result.filteredContent = this.censoreContent(content, detectedViolations);
          break;
        
        case 'warn':
          // Content allowed but user is warned
          result.isAllowed = true;
          break;
        
        default:
          result.isAllowed = true;
      }

      // Log the violation
      await this.logViolation(userId, content, result);
    }

    return result;
  }

  /**
   * Normalize content by removing obfuscation
   */
  normalizeContent(content) {
    let normalized = content.toLowerCase();
    
    // Remove HTML tags if present
    normalized = normalized.replace(/<[^>]*>/g, ' ');
    
    // Apply obfuscation pattern replacements
    this.obfuscationPatterns.forEach(({ pattern, replacement }) => {
      normalized = normalized.replace(pattern, replacement);
    });

    return normalized;
  }

  /**
   * Detect contact information in normalized content
   */
  detectContactInfo(normalizedContent) {
    const violations = [];

    // Check each pattern category
    Object.entries(this.patterns).forEach(([category, patterns]) => {
      patterns.forEach(pattern => {
        const matches = normalizedContent.match(pattern);
        if (matches) {
          matches.forEach(match => {
            // Skip if this matches a whitelist pattern
            const isWhitelisted = this.whitelist.some(whitePattern => 
              whitePattern.test(match)
            );

            if (!isWhitelisted) {
              violations.push({
                type: category,
                match: match.trim(),
                severity: this.getPatternSeverity(category, match),
                position: normalizedContent.indexOf(match)
              });
            }
          });
        }
      });
    });

    // Remove duplicates
    return violations.filter((violation, index, self) => 
      index === self.findIndex(v => v.match === violation.match)
    );
  }

  /**
   * Calculate overall severity based on violations
   */
  calculateSeverity(violations, content) {
    if (violations.length === 0) return null;

    let maxSeverity = this.severityLevels.LOW;
    let severityScore = 0;

    violations.forEach(violation => {
      switch (violation.severity) {
        case this.severityLevels.HIGH:
          severityScore += 3;
          maxSeverity = this.severityLevels.HIGH;
          break;
        case this.severityLevels.MEDIUM:
          severityScore += 2;
          if (maxSeverity !== this.severityLevels.HIGH) {
            maxSeverity = this.severityLevels.MEDIUM;
          }
          break;
        default:
          severityScore += 1;
      }
    });

    // Multiple violations increase severity
    if (violations.length > 2) severityScore += 2;
    if (violations.length > 4) severityScore += 3;

    // Check for obfuscation attempts
    if (this.hasObfuscationAttempts(content)) {
      severityScore += 2;
      maxSeverity = this.severityLevels.HIGH;
    }

    // Return the highest severity found
    return maxSeverity;
  }

  /**
   * Get severity for specific pattern matches
   */
  getPatternSeverity(category, match) {
    switch (category) {
      case 'email':
        return this.severityLevels.MEDIUM; // Reduced from HIGH to MEDIUM
      case 'phone':
        return match.length > 12 ? this.severityLevels.MEDIUM : this.severityLevels.LOW; // More lenient
      case 'social':
        return this.severityLevels.MEDIUM; // Reduced from HIGH to MEDIUM
      case 'url':
        return match.includes('http') ? this.severityLevels.LOW : this.severityLevels.LOW; // More lenient for URLs
      case 'messaging':
        return this.severityLevels.MEDIUM; // Reduced from HIGH to MEDIUM
      case 'obfuscated':
        return this.severityLevels.HIGH; // Keep high for obvious evasion attempts
      default:
        return this.severityLevels.LOW; // Default to low instead of medium
    }
  }

  /**
   * Check for obfuscation attempts in original content
   */
  hasObfuscationAttempts(content) {
    const obfuscationIndicators = [
      /\[at\]|\(at\)|\s+at\s+/gi,
      /\[dot\]|\(dot\)|\s+dot\s+/gi,
      /\s{3,}/g, // Excessive spaces
      /[a-z]\s+[a-z]\s+[a-z]/gi, // Spaced out words
    ];

    return obfuscationIndicators.some(pattern => pattern.test(content));
  }

  /**
   * Get user's violation history from database
   */
  async getUserViolationHistory(userId) {
    try {
      const user = await User.findById(userId);
      return {
        violationCount: user?.contentViolations?.length || 0,
        recentViolations: user?.contentViolations?.filter(v => 
          new Date() - new Date(v.timestamp) < 7 * 24 * 60 * 60 * 1000 // Last 7 days
        ).length || 0,
        lastViolation: user?.contentViolations?.length > 0 ? 
          user.contentViolations[user.contentViolations.length - 1].timestamp : null
      };
    } catch (error) {
      console.error('Error fetching user violation history:', error);
      return { violationCount: 0, recentViolations: 0, lastViolation: null };
    }
  }

  /**
   * Determine action based on severity and user history
   */
  determineAction(severity, userHistory, options = {}) {
    const { strictMode = false } = options;

    // First-time users get more lenient treatment
    if (userHistory.violationCount === 0) {
      switch (severity) {
        case this.severityLevels.HIGH:
          return {
            type: 'warn', // Changed from 'filter' to 'warn' for first-time users
            warning: 'Your message may contain contact information. For security, please use our platform messaging system for all communications.'
          };
        case this.severityLevels.MEDIUM:
          return {
            type: 'warn',
            warning: 'Tip: Keep all project discussions on our secure platform for the best experience.'
          };
        default:
          return { type: 'none' };
      }
    }

    // Users with violation history - more lenient approach
    if (userHistory.recentViolations > 5 || userHistory.violationCount > 10) { // Increased thresholds
      return {
        type: 'block',
        warning: 'Message blocked due to repeated attempts to share contact information. Please follow platform guidelines.'
      };
    }

    if (strictMode) {
      return {
        type: userHistory.violationCount > 3 ? 'filter' : 'warn', // More lenient even in strict mode
        warning: userHistory.violationCount > 3 ? 
          'Contact information filtered from your message for security.' :
          'Please keep communications on our secure platform.'
      };
    }

    if (severity === this.severityLevels.HIGH && userHistory.violationCount > 3) {
      return {
        type: 'filter',
        warning: 'Some content filtered for security. Use our platform tools for sharing work samples and portfolios.'
      };
    }

    return {
      type: 'warn',
      warning: 'Reminder: Use our platform messaging for all project communications.'
    };
  }

  /**
   * Censor detected contact information in content
   */
  censoreContent(originalContent, violations) {
    let filteredContent = originalContent;

    // Sort violations by position (reverse order to maintain positions)
    violations.sort((a, b) => b.position - a.position);

    violations.forEach(violation => {
      const replacement = this.getReplacementText(violation.type, violation.match);
      // Use a more sophisticated replacement that preserves context
      filteredContent = filteredContent.replace(
        new RegExp(this.escapeRegExp(violation.match), 'gi'),
        replacement
      );
    });

    return filteredContent;
  }

  /**
   * Get appropriate replacement text based on violation type
   */
  getReplacementText(violationType, originalMatch) {
    const replacements = {
      email: '[email removed]',
      phone: '[phone removed]',
      social: '[social handle removed]',
      url: '[link removed]',
      messaging: '[contact info removed]',
      obfuscated: '[contact attempt removed]'
    };

    return replacements[violationType] || '[contact info removed]';
  }

  /**
   * Escape special regex characters
   */
  escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Log violation to user's record and admin moderation queue
   */
  async logViolation(userId, originalContent, filterResult) {
    try {
      // Update user's violation history
      await User.findByIdAndUpdate(userId, {
        $push: {
          contentViolations: {
            timestamp: new Date(),
            content: originalContent,
            violations: filterResult.violations,
            severity: filterResult.severity,
            action: filterResult.action
          }
        }
      });

      // For high-severity or repeat violations, add to admin moderation queue
      if (filterResult.severity === this.severityLevels.HIGH || 
          filterResult.action === 'block') {
        // This could be expanded to use a proper moderation queue service
        console.log(`[MODERATION ALERT] User ${userId} - ${filterResult.severity} violation:`, {
          content: originalContent,
          violations: filterResult.violations,
          action: filterResult.action
        });
      }
    } catch (error) {
      console.error('Error logging content violation:', error);
    }
  }

  /**
   * Admin method to get user violation statistics
   */
  async getUserViolationStats(userId) {
    try {
      const user = await User.findById(userId);
      if (!user || !user.contentViolations) {
        return {
          totalViolations: 0,
          recentViolations: 0,
          severityDistribution: { low: 0, medium: 0, high: 0 },
          lastViolation: null
        };
      }

      const violations = user.contentViolations;
      const recentViolations = violations.filter(v => 
        new Date() - new Date(v.timestamp) < 30 * 24 * 60 * 60 * 1000 // Last 30 days
      );

      const severityDistribution = violations.reduce((acc, v) => {
        acc[v.severity] = (acc[v.severity] || 0) + 1;
        return acc;
      }, { low: 0, medium: 0, high: 0 });

      return {
        totalViolations: violations.length,
        recentViolations: recentViolations.length,
        severityDistribution,
        lastViolation: violations.length > 0 ? violations[violations.length - 1] : null
      };
    } catch (error) {
      console.error('Error getting user violation stats:', error);
      return null;
    }
  }
}

export default new ContentFilterService();

