import { UserInteractionModel } from '../models/UserInteraction.js';
import { SearchQueryModel } from '../models/SearchQuery.js';
import { AIModelModel } from '../models/AIModel.js';
import { 
  FeedbackAggregation, 
  ModelImprovementSuggestion, 
  UserFeedback, 
  InteractionType,
  UserInteraction 
} from '../types/index.js';

export interface FeedbackAnalytics {
  totalFeedback: number;
  averageRating: number;
  ratingDistribution: Record<number, number>;
  helpfulPercentage: number;
  trendData: Array<{
    date: string;
    averageRating: number;
    count: number;
  }>;
  topIssues: Array<{
    issue: string;
    frequency: number;
    averageRating: number;
  }>;
}

export interface UserBehaviorInsights {
  searchPatterns: Array<{
    query: string;
    frequency: number;
    averageRating?: number;
  }>;
  interactionFrequency: Record<InteractionType, number>;
  sessionMetrics: {
    averageDuration: number;
    totalSessions: number;
    bounceRate: number;
  };
  preferredFeatures: Array<{
    feature: string;
    usage: number;
    satisfaction: number;
  }>;
}

export class FeedbackService {
  /**
   * Track user interaction
   */
  async trackInteraction(
    userId: string,
    interactionType: InteractionType,
    resourceType: string,
    resourceId: string,
    metadata: Record<string, any> = {},
    sessionId?: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<UserInteraction> {
    try {
      return await UserInteractionModel.create({
        userId,
        interactionType,
        resourceType,
        resourceId,
        metadata,
        sessionId,
        ipAddress,
        userAgent
      });
    } catch (error) {
      console.error('Failed to track user interaction:', error);
      throw new Error('Failed to track user interaction');
    }
  }

  /**
   * Get feedback aggregation for a specific model
   */
  async getFeedbackAggregation(modelId: string, days: number = 30): Promise<FeedbackAggregation> {
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      // Get feedback data from database view
      const query = `
        SELECT 
          total_feedback,
          average_rating,
          rating_1_count,
          rating_2_count,
          rating_3_count,
          rating_4_count,
          rating_5_count,
          helpful_count,
          helpful_percentage,
          feedback_date
        FROM feedback_aggregation
        WHERE model_id = $1 
        AND feedback_date >= $2 
        AND feedback_date <= $3
        ORDER BY feedback_date DESC
      `;

      const result = await UserInteractionModel.query(query, [modelId, startDate, endDate]);

      // Aggregate the results
      let totalFeedback = 0;
      let totalRatingSum = 0;
      let totalHelpful = 0;
      const ratingDistribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      const trendData: Array<{ date: string; averageRating: number; count: number }> = [];

      for (const row of result.rows) {
        const dayTotal = parseInt(row.total_feedback);
        totalFeedback += dayTotal;
        totalRatingSum += parseFloat(row.average_rating) * dayTotal;
        totalHelpful += parseInt(row.helpful_count);

        // Update rating distribution
        ratingDistribution[1] += parseInt(row.rating_1_count);
        ratingDistribution[2] += parseInt(row.rating_2_count);
        ratingDistribution[3] += parseInt(row.rating_3_count);
        ratingDistribution[4] += parseInt(row.rating_4_count);
        ratingDistribution[5] += parseInt(row.rating_5_count);

        // Add to trend data
        trendData.push({
          date: row.feedback_date,
          averageRating: parseFloat(row.average_rating),
          count: dayTotal
        });
      }

      const averageRating = totalFeedback > 0 ? totalRatingSum / totalFeedback : 0;
      const helpfulPercentage = totalFeedback > 0 ? (totalHelpful / totalFeedback) * 100 : 0;

      // Get common comments/issues
      const commonComments = await this.getCommonComments(modelId, days);

      return {
        totalFeedback,
        averageRating,
        ratingDistribution,
        helpfulPercentage,
        commonComments,
        trendData
      };
    } catch (error) {
      console.error('Failed to get feedback aggregation:', error);
      throw new Error('Failed to get feedback aggregation');
    }
  }

  /**
   * Get model improvement suggestions based on feedback
   */
  async getModelImprovementSuggestions(modelId?: string): Promise<ModelImprovementSuggestion[]> {
    try {
      const query = `SELECT * FROM get_model_improvement_suggestions($1)`;
      const result = await UserInteractionModel.query(query, [modelId || null]);

      return result.rows.map(row => ({
        modelId: row.model_id,
        suggestionType: row.suggestion_type,
        priority: row.priority,
        description: row.description,
        expectedImprovement: parseFloat(row.expected_improvement),
        estimatedEffort: this.getEstimatedEffort(row.suggestion_type),
        basedOnFeedback: {
          totalSamples: parseInt(row.total_samples),
          averageRating: parseFloat(row.average_rating),
          commonIssues: row.common_issues || []
        }
      }));
    } catch (error) {
      console.error('Failed to get model improvement suggestions:', error);
      throw new Error('Failed to get model improvement suggestions');
    }
  }

  /**
   * Get user behavior insights
   */
  async getUserBehaviorInsights(userId: string, days: number = 30): Promise<UserBehaviorInsights> {
    try {
      const behaviorPatterns = await UserInteractionModel.getUserBehaviorPatterns(userId);
      
      // Get interaction frequency
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const { interactions } = await UserInteractionModel.findByUser(userId, {
        limit: 1000 // Get recent interactions
      });

      const recentInteractions = interactions.filter(
        interaction => interaction.timestamp >= startDate && interaction.timestamp <= endDate
      );

      const interactionFrequency: Record<InteractionType, number> = {
        search: 0,
        file_view: 0,
        file_download: 0,
        feedback: 0,
        model_training: 0,
        dataset_creation: 0
      };

      recentInteractions.forEach(interaction => {
        interactionFrequency[interaction.interactionType]++;
      });

      // Calculate bounce rate (sessions with only one interaction)
      const sessionCounts: Record<string, number> = {};
      recentInteractions.forEach(interaction => {
        if (interaction.sessionId) {
          sessionCounts[interaction.sessionId] = (sessionCounts[interaction.sessionId] || 0) + 1;
        }
      });

      const totalSessions = Object.keys(sessionCounts).length;
      const bounceSessions = Object.values(sessionCounts).filter(count => count === 1).length;
      const bounceRate = totalSessions > 0 ? (bounceSessions / totalSessions) * 100 : 0;

      // Get search patterns with ratings
      const searchPatternsWithRating = await this.getSearchPatternsWithRating(userId, days);

      return {
        searchPatterns: searchPatternsWithRating,
        interactionFrequency,
        sessionMetrics: {
          averageDuration: behaviorPatterns.sessionDuration.averageMinutes,
          totalSessions: behaviorPatterns.sessionDuration.totalSessions,
          bounceRate
        },
        preferredFeatures: behaviorPatterns.preferredFeatures.map(feature => ({
          feature: feature.feature,
          usage: feature.usage,
          satisfaction: 0 // Would need additional data to calculate satisfaction per feature
        }))
      };
    } catch (error) {
      console.error('Failed to get user behavior insights:', error);
      throw new Error('Failed to get user behavior insights');
    }
  }

  /**
   * Get feedback analytics for admin dashboard
   */
  async getFeedbackAnalytics(days: number = 30): Promise<FeedbackAnalytics> {
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      // Get overall feedback statistics
      const statsQuery = `
        SELECT 
          COUNT(uf.id) as total_feedback,
          AVG(uf.rating) as average_rating,
          COUNT(CASE WHEN uf.rating = 1 THEN 1 END) as rating_1,
          COUNT(CASE WHEN uf.rating = 2 THEN 1 END) as rating_2,
          COUNT(CASE WHEN uf.rating = 3 THEN 1 END) as rating_3,
          COUNT(CASE WHEN uf.rating = 4 THEN 1 END) as rating_4,
          COUNT(CASE WHEN uf.rating = 5 THEN 1 END) as rating_5,
          COUNT(CASE WHEN uf.helpful = true THEN 1 END) as helpful_count
        FROM user_feedback uf
        WHERE uf.timestamp >= $1 AND uf.timestamp <= $2
      `;

      const statsResult = await UserInteractionModel.query(statsQuery, [startDate, endDate]);
      const stats = statsResult.rows[0];

      const totalFeedback = parseInt(stats.total_feedback) || 0;
      const averageRating = parseFloat(stats.average_rating) || 0;
      const helpfulCount = parseInt(stats.helpful_count) || 0;

      const ratingDistribution = {
        1: parseInt(stats.rating_1) || 0,
        2: parseInt(stats.rating_2) || 0,
        3: parseInt(stats.rating_3) || 0,
        4: parseInt(stats.rating_4) || 0,
        5: parseInt(stats.rating_5) || 0
      };

      const helpfulPercentage = totalFeedback > 0 ? (helpfulCount / totalFeedback) * 100 : 0;

      // Get trend data
      const trendQuery = `
        SELECT 
          DATE(uf.timestamp) as date,
          AVG(uf.rating) as average_rating,
          COUNT(uf.id) as count
        FROM user_feedback uf
        WHERE uf.timestamp >= $1 AND uf.timestamp <= $2
        GROUP BY DATE(uf.timestamp)
        ORDER BY date DESC
      `;

      const trendResult = await UserInteractionModel.query(trendQuery, [startDate, endDate]);
      const trendData = trendResult.rows.map(row => ({
        date: row.date,
        averageRating: parseFloat(row.average_rating),
        count: parseInt(row.count)
      }));

      // Get top issues from comments
      const topIssues = await this.getTopIssues(days);

      return {
        totalFeedback,
        averageRating,
        ratingDistribution,
        helpfulPercentage,
        trendData,
        topIssues
      };
    } catch (error) {
      console.error('Failed to get feedback analytics:', error);
      throw new Error('Failed to get feedback analytics');
    }
  }

  /**
   * Process feedback for model improvement
   */
  async processFeedbackForImprovement(modelId: string): Promise<{
    shouldRetrain: boolean;
    confidence: number;
    reasons: string[];
    recommendedActions: string[];
  }> {
    try {
      const suggestions = await this.getModelImprovementSuggestions(modelId);
      const modelSuggestion = suggestions.find(s => s.modelId === modelId);

      if (!modelSuggestion) {
        return {
          shouldRetrain: false,
          confidence: 0,
          reasons: ['Insufficient feedback data'],
          recommendedActions: ['Collect more user feedback']
        };
      }

      const shouldRetrain = modelSuggestion.priority === 'high' && 
                           modelSuggestion.suggestionType === 'retrain';
      
      const confidence = Math.min(
        modelSuggestion.basedOnFeedback.totalSamples / 100, // More samples = higher confidence
        1.0
      );

      const reasons = [
        `Average rating: ${modelSuggestion.basedOnFeedback.averageRating.toFixed(2)}`,
        `Based on ${modelSuggestion.basedOnFeedback.totalSamples} feedback samples`,
        `Priority: ${modelSuggestion.priority}`
      ];

      const recommendedActions = [
        modelSuggestion.description,
        `Expected improvement: ${modelSuggestion.expectedImprovement.toFixed(1)}%`
      ];

      if (modelSuggestion.basedOnFeedback.commonIssues.length > 0) {
        reasons.push(`Common issues: ${modelSuggestion.basedOnFeedback.commonIssues.slice(0, 3).join(', ')}`);
      }

      return {
        shouldRetrain,
        confidence,
        reasons,
        recommendedActions
      };
    } catch (error) {
      console.error('Failed to process feedback for improvement:', error);
      throw new Error('Failed to process feedback for improvement');
    }
  }

  /**
   * Get common comments from feedback
   */
  private async getCommonComments(modelId: string, days: number): Promise<Array<{ comment: string; frequency: number }>> {
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const query = `
        SELECT 
          uf.comment,
          COUNT(*) as frequency
        FROM user_feedback uf
        JOIN search_results sr ON uf.result_id = sr.id
        JOIN search_queries sq ON sr.query_id = sq.id
        WHERE sq.model_id = $1 
        AND uf.timestamp >= $2 
        AND uf.timestamp <= $3
        AND uf.comment IS NOT NULL 
        AND LENGTH(uf.comment) > 5
        GROUP BY uf.comment
        HAVING COUNT(*) > 1
        ORDER BY frequency DESC
        LIMIT 10
      `;

      const result = await UserInteractionModel.query(query, [modelId, startDate, endDate]);
      
      return result.rows.map(row => ({
        comment: row.comment,
        frequency: parseInt(row.frequency)
      }));
    } catch (error) {
      console.error('Failed to get common comments:', error);
      return [];
    }
  }

  /**
   * Get search patterns with average ratings
   */
  private async getSearchPatternsWithRating(userId: string, days: number): Promise<Array<{
    query: string;
    frequency: number;
    averageRating?: number;
  }>> {
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const query = `
        SELECT 
          sq.query,
          COUNT(sq.id) as frequency,
          AVG(uf.rating) as average_rating
        FROM search_queries sq
        LEFT JOIN search_results sr ON sq.id = sr.query_id
        LEFT JOIN user_feedback uf ON sr.id = uf.result_id AND uf.user_id = sq.user_id
        WHERE sq.user_id = $1 
        AND sq.timestamp >= $2 
        AND sq.timestamp <= $3
        GROUP BY sq.query
        ORDER BY frequency DESC
        LIMIT 10
      `;

      const result = await UserInteractionModel.query(query, [userId, startDate, endDate]);
      
      return result.rows.map(row => ({
        query: row.query,
        frequency: parseInt(row.frequency),
        averageRating: row.average_rating ? parseFloat(row.average_rating) : undefined
      }));
    } catch (error) {
      console.error('Failed to get search patterns with rating:', error);
      return [];
    }
  }

  /**
   * Get top issues from feedback comments
   */
  private async getTopIssues(days: number): Promise<Array<{
    issue: string;
    frequency: number;
    averageRating: number;
  }>> {
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      // Simple keyword extraction from comments
      const query = `
        SELECT 
          uf.comment,
          uf.rating,
          COUNT(*) as frequency
        FROM user_feedback uf
        WHERE uf.timestamp >= $1 
        AND uf.timestamp <= $2
        AND uf.comment IS NOT NULL 
        AND uf.rating <= 3
        AND LENGTH(uf.comment) > 10
        GROUP BY uf.comment, uf.rating
        ORDER BY frequency DESC
        LIMIT 20
      `;

      const result = await UserInteractionModel.query(query, [startDate, endDate]);
      
      // Extract common keywords/phrases (simplified approach)
      const issueMap: Record<string, { frequency: number; totalRating: number; count: number }> = {};
      
      for (const row of result.rows) {
        const comment = row.comment.toLowerCase();
        const rating = parseFloat(row.rating);
        const frequency = parseInt(row.frequency);
        
        // Simple keyword extraction
        const keywords = ['slow', 'error', 'wrong', 'bad', 'poor', 'incorrect', 'missing', 'broken', 'failed'];
        
        for (const keyword of keywords) {
          if (comment.includes(keyword)) {
            if (!issueMap[keyword]) {
              issueMap[keyword] = { frequency: 0, totalRating: 0, count: 0 };
            }
            issueMap[keyword].frequency += frequency;
            issueMap[keyword].totalRating += rating * frequency;
            issueMap[keyword].count += frequency;
          }
        }
      }

      return Object.entries(issueMap)
        .map(([issue, data]) => ({
          issue,
          frequency: data.frequency,
          averageRating: data.totalRating / data.count
        }))
        .sort((a, b) => b.frequency - a.frequency)
        .slice(0, 10);
    } catch (error) {
      console.error('Failed to get top issues:', error);
      return [];
    }
  }

  /**
   * Get estimated effort for improvement suggestions
   */
  private getEstimatedEffort(suggestionType: string): string {
    switch (suggestionType) {
      case 'retrain':
        return '2-4 weeks (high effort)';
      case 'adjust_parameters':
        return '3-7 days (medium effort)';
      case 'add_data':
        return '1-3 weeks (medium-high effort)';
      case 'feature_engineering':
        return '1-2 weeks (medium effort)';
      default:
        return '1-2 weeks (medium effort)';
    }
  }
}