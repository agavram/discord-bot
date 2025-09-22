const https = require('https');
const querystring = require('querystring');

export class RedditAPI {
  private clientId: string;
  private clientSecret: string;
  private userAgent: string = 'MyRedditBot/1.0';
  private accessToken: string | null;

  constructor(clientId: string, clientSecret: string) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.accessToken = null;
  }

  async getAccessToken() {
    return new Promise((resolve, reject) => {
      const postData = querystring.stringify({
        grant_type: 'client_credentials',
      });

      const auth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');

      const options = {
        hostname: 'www.reddit.com',
        port: 443,
        path: '/api/v1/access_token',
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(postData),
          'User-Agent': this.userAgent,
        },
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            const response = JSON.parse(data);
            if (response.access_token) {
              this.accessToken = response.access_token;
              console.log('Successfully authenticated with Reddit API');
              resolve(response.access_token);
            } else {
              reject(new Error('Failed to get access token: ' + data));
            }
          } catch (error) {
            reject(error);
          }
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.write(postData);
      req.end();
    });
  }

  async getHotPosts(subreddit: string) {
    if (!this.accessToken) {
      await this.getAccessToken();
    }

    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'oauth.reddit.com',
        port: 443,
        path: `/r/${subreddit}/hot.json`,
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'User-Agent': this.userAgent,
        },
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            const response = JSON.parse(data);
            if (response.data && response.data.children) {
              resolve(response.data.children);
            } else {
              reject(new Error('Unexpected response format: ' + data));
            }
          } catch (error) {
            reject(error);
          }
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.end();
    });
  }
}
