export class BotHandlerError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message)
  }
}
