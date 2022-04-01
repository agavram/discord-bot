export interface GameUpdates {
  copyright:  string;
  link:       string;
  editorial:  Editorial;
  media:      Media;
  highlights: GameUpdatesHighlights;
  summary:    Summary;
  gameNotes:  unknown;
}

export interface Editorial {
  preview:  unknown;
  articles: null;
  recap:    unknown;
  wrap:     unknown;
}

export interface GameUpdatesHighlights {
  scoreboard:        null;
  gameCenter:        null;
  milestone:         null;
  highlights:        LiveClass;
  live:              LiveClass;
  scoreboardPreview: LiveClass;
}

export interface LiveClass {
  items: HighlightsItem[];
}

export interface HighlightsItem {
  type:             ItemType;
  state:            State;
  date:             string;
  id:               string;
  headline:         string;
  seoTitle:         string;
  slug:             string;
  blurb:            string;
  keywordsAll:      KeywordsAll[];
  keywordsDisplay:  unknown[];
  image:            Image;
  noIndex:          boolean;
  mediaPlaybackId:  string;
  title:            string;
  description:      string;
  duration:         string;
  mediaPlaybackUrl: string;
  playbacks:        Playback[];
}

export interface Image {
  title:       string;
  altText:     null;
  templateUrl: string;
  cuts:        Cut[];
}

export interface Cut {
  aspectRatio: AspectRatio;
  width:       number;
  height:      number;
  src:         string;
  at2x:        string;
  at3x:        string;
}

export enum AspectRatio {
  The169 = "16:9",
  The43 = "4:3",
  The6427 = "64:27",
}

export interface KeywordsAll {
  type:        KeywordsAllType;
  value:       string;
  displayName: string;
}

export enum KeywordsAllType {
  Game = "game",
  GamePk = "game_pk",
  Player = "player",
  PlayerID = "player_id",
  Taxonomy = "taxonomy",
  Team = "team",
  TeamID = "team_id",
}

export interface Playback {
  name:   Name;
  url:    string;
  width:  string;
  height: string;
}

export enum Name {
  HLSCloud = "hlsCloud",
  HTTPCloudWired = "HTTP_CLOUD_WIRED",
  HTTPCloudWired60 = "HTTP_CLOUD_WIRED_60",
  HighBit = "highBit",
  Mp4AVC = "mp4Avc",
  Trickplay = "trickplay",
}

export enum State {
  A = "A",
}

export enum ItemType {
  Video = "video",
}

export interface Media {
  epg:           Epg[];
  epgAlternate:  Epg[];
  milestones:    null;
  featuredMedia: FeaturedMedia;
  freeGame:      boolean;
  enhancedGame:  boolean;
}

export interface Epg {
  title: string;
  items: EpgItem[];
}

export interface EpgItem {
  id:                number;
  contentId?:        string;
  mediaId?:          string;
  mediaState?:       string;
  mediaFeedType?:    string;
  mediaFeedSubType?: string;
  callLetters?:      string;
  foxAuthRequired?:  boolean;
  tbsAuthRequired?:  boolean;
  espnAuthRequired?: boolean;
  fs1AuthRequired?:  boolean;
  mlbnAuthRequired?: boolean;
  freeGame?:         boolean;
  gameDate?:         string;
  type?:             string;
  description?:      string;
  renditionName?:    string;
  language?:         string;
}

export interface FeaturedMedia {
  id: string;
}

export interface Summary {
  hasPreviewArticle:  boolean;
  hasRecapArticle:    boolean;
  hasWrapArticle:     boolean;
  hasHighlightsVideo: boolean;
}
