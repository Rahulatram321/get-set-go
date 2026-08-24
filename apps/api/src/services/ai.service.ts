import type { Env } from '@orbitqueue/config';

export class AiFailureAnalysisService {
  constructor(private readonly env: Env) {}

  async analyzeFailure(error: string, jobName: string, attemptNumber: number): Promise<{
    summary: string;
    probableCause: string;
    suggestedFix: string;
    retryRecommendation: string;
  } | null> {
    if (!this.env.AI_ENABLED || !this.env.AI_API_KEY) {
      return this.heuristicAnalysis(error, jobName, attemptNumber);
    }

    // Optional OpenAI integration - falls back to heuristic if unavailable
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.env.AI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: 'You analyze job failures for a distributed job scheduler. Respond in JSON with keys: summary, probableCause, suggestedFix, retryRecommendation.',
            },
            {
              role: 'user',
              content: `Job "${jobName}" failed on attempt ${attemptNumber} with error: ${error}`,
            },
          ],
          response_format: { type: 'json_object' },
        }),
      });

      if (!response.ok) return this.heuristicAnalysis(error, jobName, attemptNumber);
      const data = (await response.json()) as { choices: Array<{ message: { content: string } }> };
      return JSON.parse(data.choices[0].message.content);
    } catch {
      return this.heuristicAnalysis(error, jobName, attemptNumber);
    }
  }

  private heuristicAnalysis(error: string, jobName: string, attemptNumber: number) {
    const lower = error.toLowerCase();
    let probableCause = 'An unexpected error occurred during job execution.';
    let suggestedFix = 'Review job payload and handler logic.';
    let retryRecommendation = attemptNumber < 3
      ? 'Retry with exponential backoff is recommended.'
      : 'Maximum attempts may be reached. Review before retrying.';

    if (lower.includes('timeout') || lower.includes('etimedout')) {
      probableCause = 'Execution failed because a downstream service did not respond within the configured timeout.';
      suggestedFix = 'Increase timeout settings or verify the external service is available.';
    } else if (lower.includes('connection') || lower.includes('econnrefused')) {
      probableCause = 'Unable to establish connection to a required service.';
      suggestedFix = 'Verify network connectivity and service availability.';
    } else if (lower.includes('permission') || lower.includes('unauthorized')) {
      probableCause = 'Authentication or authorization failure.';
      suggestedFix = 'Verify credentials and access permissions.';
      retryRecommendation = 'Retry is unlikely to help until credentials are fixed.';
    }

    return {
      summary: `Job "${jobName}" failed: ${error.slice(0, 200)}`,
      probableCause,
      suggestedFix,
      retryRecommendation,
    };
  }
}
