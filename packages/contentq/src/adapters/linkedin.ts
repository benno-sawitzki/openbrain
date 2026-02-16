import { PlatformAdapter, Post, PublishResult } from '../types';

export const linkedinAdapter: PlatformAdapter = {
  name: 'linkedin',

  async publish(post: Post, config: any): Promise<PublishResult> {
    const apiKey = config.apiKey || process.env.LATE_API_KEY;
    if (!apiKey) {
      return { success: false, error: 'No API key configured. Set apiKey in config or LATE_API_KEY env var.' };
    }

    const accountId = config.accountId || '698f07784525118cee8daad0';
    const profileId = config.profileId || '698e1a7211ffd99f0d2eebd9';

    try {
      const res = await fetch('https://getlate.dev/api/v1/posts', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          accountId,
          profileIds: [profileId],
          text: post.text,
        }),
      });

      const data: any = await res.json();

      if (!res.ok) {
        return { success: false, error: data.message || `HTTP ${res.status}`, raw: data };
      }

      return {
        success: true,
        platformPostId: data.id || data._id,
        url: data.url,
        raw: data,
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },
};
