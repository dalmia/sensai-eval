import { NextResponse } from 'next/server';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
});

const BUCKET_NAME = process.env.S3_BUCKET_NAME;
const CONVERSATIONS_KEY = `${process.env.S3_FOLDER_NAME}/conversations.json`;

export async function GET() {
  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: CONVERSATIONS_KEY,
    });
    
    const response = await s3Client.send(command);
    const data = await response.Body?.transformToString();
    
    if (!data) {
      return NextResponse.json([]);
    }

    console.log(typeof data)
    
    const conversations = JSON.parse(data);
    return NextResponse.json(conversations);
  } catch (error) {
    console.error('Error reading conversations from S3:', error);
    // Return empty array if file doesn't exist or other error
    return NextResponse.json([]);
  }
}

export async function POST(request: Request) {
  try {
    const conversations = await request.json();
    
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: CONVERSATIONS_KEY,
      Body: JSON.stringify(conversations, null, 2),
      ContentType: 'application/json',
    });
    
    await s3Client.send(command);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error saving conversations to S3:', error);
    return NextResponse.json({ error: 'Failed to save conversations' }, { status: 500 });
  }
} 