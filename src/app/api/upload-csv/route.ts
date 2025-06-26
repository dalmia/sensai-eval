import { NextResponse } from 'next/server';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
});

const BUCKET_NAME = process.env.S3_BUCKET_NAME;
const CONVERSATIONS_KEY = `${process.env.S3_FOLDER_NAME}/conversations.json`;

interface UserAnnotation {
  judgement: 'correct' | 'wrong';
  notes: string;
  timestamp: string;
}

interface Conversation {
  id: string;
  metadata: {
    stage?: string;
    task_id?: number;
    user_id?: number;
    type?: string;
    question_id?: number;
    question_type?: string;
    question_purpose?: string;
    question_input_type?: string;
    question_has_context?: boolean;
    course?: { id?: number; name?: string; };
    milestone?: { id?: number; name?: string; };
    org?: { id?: number; name?: string; };
    uploaded_by?: string;
  };
  messages: { role: 'user' | 'assistant'; content: string; timestamp?: string; }[];
  createdAt?: string;
  start_time?: string;
  end_time?: string;
  annotations?: { [username: string]: UserAnnotation };
  uploaded_by?: string;
  span_id?: string;
  trace_id?: string;
  span_kind?: string;
  span_name?: string;
  model_name?: string;
}

// Helper function to parse CSV row properly handling quoted fields
function parseCSVRow(row: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  let i = 0;
  
  while (i < row.length) {
    const char = row[i];
    
    if (char === '"') {
      if (inQuotes && row[i + 1] === '"') {
        // Handle escaped quotes
        current += '"';
        i += 2;
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
        i++;
      }
    } else if (char === ',' && !inQuotes) {
      // Field separator
      result.push(current.trim());
      current = '';
      i++;
    } else {
      current += char;
      i++;
    }
  }
  
  // Add last field
  result.push(current.trim());
  return result;
}

// Helper function to safely parse integer from string
function safeParseInt(value: string | undefined): number | undefined {
  if (!value || value.trim() === '') return undefined;
  const parsed = parseInt(value.trim());
  return isNaN(parsed) ? undefined : parsed;
}

// Helper function to safely parse boolean from string
function safeParseBoolean(value: string | undefined): boolean | undefined {
  if (!value || value.trim() === '') return undefined;
  const lower = value.trim().toLowerCase();
  if (lower === 'true' || lower === '1' || lower === 'yes') return true;
  if (lower === 'false' || lower === '0' || lower === 'no') return false;
  return undefined;
}

// Helper function to get string value or undefined
function safeGetString(value: string | undefined): string | undefined {
  if (!value || value.trim() === '') return undefined;
  return value.trim();
}

function csvToConversations(csvContent: string, uploadedBy: string): Conversation[] {
  const lines = csvContent.split('\n').filter(line => line.trim());
  if (lines.length < 2) return [];
  
  const headers = parseCSVRow(lines[0]);
  const conversations: Conversation[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVRow(lines[i]);

    if (values.length !== headers.length) continue;
    
    const row: Record<string, string> = {};
    headers.forEach((header: string, index: number) => {
      row[header.trim()] = values[index]
    });
    
    try {
      // Parse LLM input and output messages
      const inputMessages = JSON.parse(row['attributes.llm.input_messages'])
      const outputMessages = JSON.parse(row['attributes.llm.output_messages'])
      
      // Extract user and assistant messages
      const messages: { role: 'user' | 'assistant'; content: string; timestamp?: string; }[] = [];
      
      // Add input messages (typically user messages)
      inputMessages.forEach((msg: { 'message.role': string; 'message.content': string }) => {
        if (msg['message.role'] === 'user' && msg['message.content']) {
          messages.push({
            role: 'user',
            content: msg['message.content'],
            timestamp: row['start_time'] || new Date().toISOString()
          });
        }
      });
      
      // Add output messages (assistant messages)
      outputMessages.forEach((msg: { 'message.role': string; 'message.tool_calls'?: unknown; 'message.content'?: string }) => {
        if (msg['message.role'] === 'assistant') {
          // Handle tool calls or direct content
          let content = '';
          if (msg['message.tool_calls']) {
            const toolCalls = msg['message.tool_calls'] as Array<{ 'tool_call.function.arguments': string }>;
            toolCalls.forEach((toolCall: { 'tool_call.function.arguments': string }) => {
              if (toolCall['tool_call.function.arguments']) {
                try {
                  const args = JSON.parse(toolCall['tool_call.function.arguments']);
                  if (args.feedback) {
                    content = args.feedback;
                  } else if (args.analysis) {
                    content = args.analysis;
                  }
                } catch {
                  content = toolCall['tool_call.function.arguments'];
                }
              }
            });
          } else if (msg['message.content']) {
            content = msg['message.content'];
          }
          
          if (content) {
            messages.push({
              role: 'assistant',
              content: content,
              timestamp: row['end_time'] || new Date().toISOString()
            });
          }
        }
      });
      
      // Skip if no valid messages found
      if (messages.length === 0) continue;
      
      // Parse metadata from attributes.metadata column
      let metadata: { [key: string]: unknown } = {};
      if (row['attributes.metadata']) {
        try {
          metadata = JSON.parse(row['attributes.metadata']);
        } catch {
          console.error('Error parsing attributes.metadata');
          metadata = {};
        }
      }
      
      // Extract user info from other columns
      const userId = safeGetString(row['attributes.user.id'] || row['user_id']);
      const spanId = safeGetString(row['context.span_id']) || `span-${i}`;
      
      // Create conversation from CSV data - read metadata from attributes
      const conversation: Conversation = {
        id: `csv-${spanId}-${i}`,
        start_time: safeGetString(row['start_time']),
        end_time: safeGetString(row['end_time']),
        createdAt: safeGetString(row['createdAt']) || safeGetString(row['start_time']),
        annotations: undefined, // New conversations don't have annotations initially
        uploaded_by: uploadedBy,
        metadata: {
          // Read from parsed metadata JSON
          stage: safeGetString(String(metadata.stage || '')),
          task_id: safeParseInt(String(metadata.task_id || '')) || undefined,
          user_id: safeParseInt(String(metadata.user_id || '')) || safeParseInt(userId),
          type: safeGetString(String(metadata.type || '')),
          question_id: safeParseInt(String(metadata.question_id || '')) || undefined,
          question_type: safeGetString(String(metadata.question_type || '')),
          question_purpose: safeGetString(String(metadata.question_purpose || '')),
          question_input_type: safeGetString(String(metadata.question_input_type || '')),
          question_has_context: safeParseBoolean(String(metadata.question_has_context || '')),
          course: metadata.course && typeof metadata.course === 'object' && metadata.course !== null ? {
            id: safeParseInt(String((metadata.course as { id?: unknown }).id || '')),
            name: safeGetString(String((metadata.course as { name?: unknown }).name || ''))
          } : undefined,
          milestone: metadata.milestone && typeof metadata.milestone === 'object' && metadata.milestone !== null ? {
            id: safeParseInt(String((metadata.milestone as { id?: unknown }).id || '')),
            name: safeGetString(String((metadata.milestone as { name?: unknown }).name || ''))
          } : undefined,
          org: metadata.org && typeof metadata.org === 'object' && metadata.org !== null ? {
            id: safeParseInt(String((metadata.org as { id?: unknown }).id || '')),
            name: safeGetString(String((metadata.org as { name?: unknown }).name || ''))
          } : undefined
        },
        messages: messages,
        // New trace and span fields from CSV columns
        span_id: spanId,
        trace_id: safeGetString(row['context.trace_id']),
        span_kind: safeGetString(row['span_kind']),
        span_name: safeGetString(row['name']),
        model_name: safeGetString(row['attributes.llm.model_name'])
      };
      
      conversations.push(conversation);
    } catch (error) {
      console.error('Error parsing row:', error);
      continue;
    }
  }
  
  return conversations;
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const uploadedBy = formData.get('uploadedBy') as string;
    const isChunk = formData.get('isChunk') === 'true';
    const chunkNumber = parseInt(formData.get('chunkNumber') as string || '1');
    const totalChunks = parseInt(formData.get('totalChunks') as string || '1');
    
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }
    
    if (!uploadedBy) {
      return NextResponse.json({ error: 'No uploadedBy provided' }, { status: 400 });
    }
    
    // Read CSV content
    const csvContent = await file.text();
    
    // Parse CSV to conversations
    const newConversations = csvToConversations(csvContent, uploadedBy);
    
    if (newConversations.length === 0) {
      return NextResponse.json({ 
        error: 'No valid conversations found in CSV chunk',
        newCount: 0,
        duplicateCount: 0
      }, { status: 400 });
    }
    
    // Get existing conversations from S3
    let existingConversations: Conversation[] = [];
    try {
      const getCommand = new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: CONVERSATIONS_KEY,
      });
      
      const response = await s3Client.send(getCommand);
      const data = await response.Body?.transformToString();
      
      if (data) {
        existingConversations = JSON.parse(data);
      }
    } catch {
      console.log('No existing conversations file found, creating new one');
    }
    
    // Create a set of existing span IDs for fast lookup
    const existingSpanIds = new Set(
      existingConversations
        .map(conv => conv.span_id)
        .filter(spanId => spanId) // Only include non-null/undefined span_ids
    );
    
    // Filter out conversations with duplicate span IDs
    const uniqueNewConversations = newConversations.filter(conv => {
      if (!conv.span_id) {
        // If no span_id, allow it (though this shouldn't happen with our current logic)
        return true;
      }
      return !existingSpanIds.has(conv.span_id);
    });
    
    const duplicatesCount = newConversations.length - uniqueNewConversations.length;
    
    // For chunks, we still want to save even if all are duplicates in this chunk
    // because other chunks might have unique data
    
    // Merge unique new conversations with existing ones
    const allConversations = [...existingConversations, ...uniqueNewConversations];
    
    // Save back to S3
    if (uniqueNewConversations.length > 0) {
      const putCommand = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: CONVERSATIONS_KEY,
        Body: JSON.stringify(allConversations, null, 2),
        ContentType: 'application/json',
      });
      
      await s3Client.send(putCommand);
    }
    
    // Return response with chunk information
    const response = {
      success: true,
      message: isChunk 
        ? `Chunk ${chunkNumber}/${totalChunks} processed: ${uniqueNewConversations.length} new conversations${duplicatesCount > 0 ? ` (${duplicatesCount} duplicates skipped)` : ''}`
        : `Successfully uploaded ${uniqueNewConversations.length} conversations${duplicatesCount > 0 ? ` (${duplicatesCount} duplicates skipped)` : ''}`,
      newCount: uniqueNewConversations.length,
      duplicateCount: duplicatesCount,
      totalProcessed: newConversations.length,
      chunkNumber: isChunk ? chunkNumber : undefined,
      totalChunks: isChunk ? totalChunks : undefined,
      isChunk
    };
    
    // If this is the last chunk of a multi-chunk upload and no new conversations were added across all chunks,
    // we could check for allDuplicates, but for now we'll let the client handle that logic
    
    return NextResponse.json(response);
    
  } catch (error) {
    console.error('Error processing CSV upload:', error);
    return NextResponse.json({ 
      error: 'Failed to process CSV upload',
      newCount: 0,
      duplicateCount: 0
    }, { status: 500 });
  }
} 