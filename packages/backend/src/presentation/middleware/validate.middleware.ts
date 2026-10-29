import type { Request, Response, NextFunction } from 'express'
import type { ZodType, ZodError, z } from 'zod'
import { logger } from '../../infrastructure/logger/logger.js'

export function validateBody<TSchema extends ZodType>(schema: TSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body)
    if (!result.success) {
      const issues = formatIssues(result.error)
      logger.debug({ path: req.path, issues }, 'request body validation failed')
      res.status(400).json({
        error: 'validation',
        message: 'Invalid request body',
        issues,
      })
      return
    }
    req.body = result.data as z.infer<TSchema>
    next()
  }
}

export function validateQuery<TSchema extends ZodType>(schema: TSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query)
    if (!result.success) {
      const issues = formatIssues(result.error)
      logger.debug({ path: req.path, issues }, 'request query validation failed')
      res.status(400).json({
        error: 'validation',
        message: 'Invalid query parameters',
        issues,
      })
      return
    }
    ;(req as Request & { validatedQuery: unknown }).validatedQuery = result.data
    next()
  }
}

function formatIssues(error: ZodError): Array<{ path: string; message: string }> {
  return error.issues.map((issue) => ({
    path: issue.path.map(String).join('.') || '(root)',
    message: issue.message,
  }))
}
