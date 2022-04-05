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

export interface game {
  highlightId: string;
  gameId: number;
  gameStart: Date;
}

export interface premove {
  targetUser: string;
  moves: Array<string>;
}
