import { NextResponse } from 'next/server';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
});

const BUCKET_NAME = process.env.S3_BUCKET_NAME;
const QUEUES_KEY = `${process.env.S3_FOLDER_NAME}/queues.json`;

export async function GET() {
  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: QUEUES_KEY,
    });
    
    const response = await s3Client.send(command);
    const data = await response.Body?.transformToString();
    
    if (!data) {
      return NextResponse.json([]);
    }
    
    const queues = JSON.parse(data);
    return NextResponse.json(queues);
  } catch (error) {
    console.error('Error reading queues from S3:', error);
    return NextResponse.json([]);
  }
}

export async function POST(request: Request) {
  try {
    const queues = await request.json();
    
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: QUEUES_KEY,
      Body: JSON.stringify(queues, null, 2),
      ContentType: 'application/json',
    });
    
    await s3Client.send(command);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error saving queues to S3:', error);
    return NextResponse.json({ error: 'Failed to save queues' }, { status: 500 });
  }
} 