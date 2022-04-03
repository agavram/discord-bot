export interface server {
  server: string;
  channelGeneral: string;
  channelMemes: string;
  channelLogging: string;
  channelMariners: string;
  posts: Array<string>;
}

export interface user {
  userId: string;
  sentAttachments: number;
}
