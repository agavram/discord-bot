export interface server {
    _id?: string,
    server: string,
    channelGeneral: string,
    channelMemes: string,
    channelLogging: string,
    channelMariners?: string,
    posts: Array<string>
}

export interface event {
    _id?: string,
    title: string,
    time: Date,
    attendees: Array<string>,
    messageId: string,
    channelId: string
}

export interface user {
    _id?: string,
    userId: string,
    channelAnon?: string,
    sentAttachments?: number
}