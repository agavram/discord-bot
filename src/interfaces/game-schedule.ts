export interface GameSchedule {
  copyright:            string;
  totalItems:           number;
  totalEvents:          number;
  totalGames:           number;
  totalGamesInProgress: number;
  dates:                DateElement[];
}

export interface DateElement {
  date:                 string;
  totalItems:           number;
  totalEvents:          number;
  totalGames:           number;
  totalGamesInProgress: number;
  games:                Game[];
  events:               unknown[];
}

export interface Game {
  gamePk:                 number;
  link:                   string;
  gameType:               GameType;
  season:                 string;
  gameDate:               string;
  officialDate:           string;
  status:                 Status;
  teams:                  Teams;
  venue:                  Venue;
  content:                Content;
  gameNumber:             number;
  publicFacing:           boolean;
  doubleHeader:           DoubleHeader;
  gamedayType:            DoubleHeader;
  tiebreaker:             DoubleHeader;
  calendarEventID:        string;
  seasonDisplay:          string;
  dayNight:               DayNight;
  scheduledInnings:       number;
  reverseHomeAwayStatus:  boolean;
  inningBreakLength:      number;
  gamesInSeries:          number;
  seriesGameNumber:       number;
  seriesDescription:      SeriesDescription;
  recordSource:           GameType;
  ifNecessary:            DoubleHeader;
  ifNecessaryDescription: IfNecessaryDescription;
}

export interface Content {
  link: string;
}

export enum DayNight {
  Day = "day",
  Night = "night",
}

export enum DoubleHeader {
  E = "E",
  N = "N",
}

export enum GameType {
  I = "I",
  IR = "IR",
  P = "P",
  S = "S",
}

export enum IfNecessaryDescription {
  NormalGame = "Normal Game",
}

export enum SeriesDescription {
  SpringTraining = "Spring Training",
}

export interface Status {
  abstractGameState: AbstractGameState;
  codedGameState:    GameType;
  detailedState:     string;
  statusCode:        GameType;
  startTimeTBD:      boolean;
  reason?:           string;
  abstractGameCode:  AbstractGameCode;
}

export enum AbstractGameCode {
  L = "L",
  P = "P",
}

export enum AbstractGameState {
  Live = "Live",
  Preview = "Preview",
}

export interface Teams {
  away: Away;
  home: Away;
}

export interface Away {
  leagueRecord: LeagueRecord;
  score?:       number;
  team:         Venue;
  splitSquad:   boolean;
  seriesNumber: number;
}

export interface LeagueRecord {
  wins:   number;
  losses: number;
  pct:    string;
}

export interface Venue {
  id:   number;
  name: string;
  link: string;
}
