'use server';

import { ai } from '@/ai/genkit';
import { LogEntry } from '@/services/LogService';
import { analysisTools } from './chat-tools';
import { requestContext } from '@/lib/request-context';

export interface ChatMessage {
  role: 'user' | 'model';
  content: string;
}

export async function sendMessage(history: ChatMessage[], contextLogs: LogEntry[], contextData?: any) {
  // Wrap the entire execution in the request context store
  return requestContext.run(contextData, async () => {
    try {
      const sanitize = (data: any) => {
        const copy = JSON.parse(JSON.stringify(data));
        // Simple sanitizer: remove obvious emails and long numbers, replace with masked placeholders
        const redactString = (s: string) => s.replace(/[\w.-]+@[\w.-]+/g, '[REDACTED_EMAIL]').replace(/\b\d{6,}\b/g, '[REDACTED_ID]');
        const walk = (obj: any): any => {
          if (!obj || typeof obj !== 'object') return obj;
          if (Array.isArray(obj)) return obj.map(v => walk(v));
          const ret: any = {};
          for (const [k, v] of Object.entries(obj)) {
            if (typeof v === 'string') ret[k] = redactString(v);
            else if (typeof v === 'number') ret[k] = v; // keep numbers, but be cautious
            else ret[k] = walk(v);
          }
          return ret;
        };
        return walk(copy);
      };

      const safeContext = contextData ? sanitize(contextData) : null;
      // Summarize large arrays to avoid sending huge prompts
      const summarizeLargeArrays = (obj: any, includeFull: boolean | undefined) => {
        const SAMPLE_LIMIT = 10;
        const MAX_ROWS = 500;
        const walk = (o: any): any => {
          if (!o || typeof o !== 'object') return o;
          if (Array.isArray(o)) {
            const len = o.length;
            if (!includeFull && len > SAMPLE_LIMIT) {
              return { __type: 'summary', count: len, sample: o.slice(0, SAMPLE_LIMIT) };
            }
            if (includeFull && len > MAX_ROWS) {
              return { __type: 'summary', count: len, sample: o.slice(0, SAMPLE_LIMIT) };
            }
            return o.map(v => walk(v));
          }
          const ret: any = {};
          for (const [k, v] of Object.entries(o)) ret[k] = walk(v);
          return ret;
        };
        return walk(obj);
      };
      const summarizedContext = safeContext ? summarizeLargeArrays(safeContext, safeContext?.includeFull) : null;

      const systemPrompt = `You are a helpful AI assistant for a Production Optimization system with analytical and operational awareness capabilities.
Today is ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.

You have access to analysis tools for Sales, Production Capacity, Employee Availability, and Bottlenecks.
Use these tools proactively when the user asks questions that require data analysis.

IMPORTANT: You have visibility into real-time operations happening in the system via LOGS.
- Operations are logged with emoji indicators: ▶️ (started), ⏳ (in_progress), ✅ (completed), ❌ (failed)
- Check the recent logs for operational updates: they appear as [SECTION] emoji description (duration)
- When the user asks "what are you doing?" or "what's happening?", examine the recent logs for operation entries

OPERATIONAL AWARENESS:
${contextData?.operationsSummary ? `
System Operations Summary:
- Total operations tracked: ${contextData.operationsSummary.total}
- Currently active: ${contextData.operationsSummary.active}
- Completed successfully: ${contextData.operationsSummary.completed}
- Failed operations: ${contextData.operationsSummary.failed}
- Operations by section: ${JSON.stringify(contextData.operationsSummary.bySection)}
` : ''}

IMPORTANT GUIDELINES:
1. **Operational Questions**: If user asks "what are you doing?", "what's happening?", analyze the recent logs for operation entries
2. **Log Markers**: Look for entries like "[SECTION] ▶️/⏳/✅/❌ description (duration)" in the logs
3. **Progress Tracking**: Operations show in logs as they progress - acknowledge them from the logs you see
4. **Error Detection**: Failed operations will show as "[SECTION] ❌ description - ERROR: message"
6. **Date Inference**: If the user says "last week", "yesterday", or "this month", calculate the dates based on "Today" (${new Date().toISOString().split('T')[0]}) and pass them to the tools. Do NOT ask the user to calculate dates for you.
7. **Defaults**: If parameters are optional (like groupBy), choose a sensible default (e.g., 'day' or 'product') based on the question instead of asking the user.
8. **Actionable Answers**: Provide the analysis results directly.

RECENT LOGS (includes operations):
${contextLogs.map(l => `[${l.timestamp}] [${l.type.toUpperCase()}] ${l.message}`).join('\n')}
${summarizedContext ? '\n\nADDITIONAL CONTEXT (sanitized & summarized):\n' + JSON.stringify(summarizedContext, null, 2) : ''}

Answer the user's questions based on these logs, the analysis tools, and your general knowledge.
Keep your answers concise and actionable.`;


      // Construir el array de mensajes: system primero, luego el historial cronológico
      // Usar el formato de contenido como array de fragments `{ text: ... }` que Genkit espera
      // Ensure the first non-system message is a user message (Google API expects that)
      const firstUserIndex = history.findIndex(m => m.role === 'user');
      const historySlice = firstUserIndex === -1 ? history.slice(-1) : history.slice(firstUserIndex);
      const messages = [
        { role: 'system' as const, content: [{ text: systemPrompt }] },
        ...historySlice.map(m => ({ role: m.role as 'user'|'model'|'system'|'tool', content: [{ text: m.content }] }))
      ];

      // Log audit trail
      try {
        if (summarizedContext) {
          const keys = Object.keys(summarizedContext);
          const len = JSON.stringify(summarizedContext).length;
          console.log(`[AI PROMPT] sending sanitized context keys=[${keys.join(', ')}], size=${len}`);
        }
      } catch (e) {
        console.error('[AI PROMPT] Failed to log context length.', e);
      }

      // Diagnostic: print a compact preview of messages to detect malformed content
      try {
        const preview = messages.map((m: any, i: number) => ({
          i,
          role: m.role,
          contentIsArray: Array.isArray(m.content),
          firstFragmentType: Array.isArray(m.content) && m.content[0] ? typeof m.content[0] : typeof m.content,
          firstFragmentKeys: Array.isArray(m.content) && m.content[0] ? Object.keys(m.content[0]) : undefined
        }));
        console.debug('[AI PROMPT] messages preview:', JSON.stringify(preview, null, 2));
      } catch (e) {
        console.error('[AI PROMPT] Failed to preview messages', e);
      }

      console.log('[AI GENERATE] Starting generation with', messages.length, 'messages and', analysisTools.length, 'tools');
      console.log('[AI GENERATE] Tools available:', analysisTools.map((t: any) => t.name).join(', '));

      // Llamada al AI con las tools configuradas
      const response = await ai.generate({
        messages,
        tools: analysisTools, // Genkit handles execution automatically
        config: {
          temperature: 0.7,
        }
      });

      console.log('[CHAT RESPONSE] Success:', { textLength: response.text?.length, hasText: !!response.text });
      return { text: response.text };
    } catch (error: any) {
      console.error('[CHAT ERROR] Full error object:', error);
      console.error('[CHAT ERROR] Error message:', error.message);
      console.error('[CHAT ERROR] Error stack:', error.stack);
      console.error('[CHAT ERROR] Error details:', JSON.stringify(error, null, 2));
      
      // Log to file for debugging
      const fs = require('fs');
      try {
        fs.appendFileSync('debug_error.log', `[${new Date().toISOString()}] Error: ${error.message}\nStack: ${error.stack}\nFull: ${JSON.stringify(error, null, 2)}\n\n`);
      } catch (e) { /* ignore */ }
      
      return { text: 'Sorry, I encountered an error processing your request.' };
    }
  });
}
