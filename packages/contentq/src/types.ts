export interface Post {
  id: string;
  text: string;
  platform: string;
  status: 'draft' | 'scheduled' | 'published' | 'failed';
  createdAt: string;
  scheduledFor: string | null;
  publishedAt: string | null;
  publishResult: Record<string, any>;
  tags: string[];
  template: string | null;
}

export interface Config {
  platforms: {
    [key: string]: {
      adapter: string;
      apiKey?: string;
      accountId?: string;
      profileId?: string;
      [key: string]: any;
    };
  };
  defaults?: {
    platform?: string;
  };
}

export interface PublishResult {
  success: boolean;
  platformPostId?: string;
  url?: string;
  error?: string;
  raw?: any;
}

export interface PlatformAdapter {
  name: string;
  publish(post: Post, config: any): Promise<PublishResult>;
}

export type InboxType = 'social' | 'inspo' | 'idea' | 'general';

export interface InboxItem {
  id: string;
  type: InboxType;
  title: string | null;
  note: string | null;
  media: string | null;
  mediaType: string | null;
  url: string | null;
  text: string | null;
  tags: string[];
  promoted: boolean;
  promotedTo: string | null;
  createdAt: string;
  source: string;
}
