export interface GameStatus {
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
}

export interface Game {
  gamePk:                 number;
  link:                   string;
  gameType:               string;
  season:                 string;
  gameDate:               string;
  officialDate:           string;
  status:                 Status;
  teams:                  Teams;
  venue:                  Venue;
  content:                Content;
  isTie:                  boolean;
  gameNumber:             number;
  publicFacing:           boolean;
  doubleHeader:           string;
  gamedayType:            string;
  tiebreaker:             string;
  calendarEventID:        string;
  seasonDisplay:          string;
  dayNight:               string;
  scheduledInnings:       number;
  reverseHomeAwayStatus:  boolean;
  inningBreakLength:      number;
  gamesInSeries:          number;
  seriesGameNumber:       number;
  seriesDescription:      string;
  recordSource:           string;
  ifNecessary:            string;
  ifNecessaryDescription: string;
}

export interface Content {
  link: string;
}

export interface Status {
  abstractGameState: string;
  codedGameState:    string;
  detailedState:     string;
  statusCode:        string;
  startTimeTBD:      boolean;
  abstractGameCode:  string;
}

export interface Teams {
  away: Away;
  home: Away;
}

export interface Away {
  leagueRecord: LeagueRecord;
  score:        number;
  team:         Venue;
  isWinner:     boolean;
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
