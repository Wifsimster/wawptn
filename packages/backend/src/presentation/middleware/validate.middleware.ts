import type { Request, Response, NextFunction } from 'express'
import type { ZodType, ZodError, z } from 'zod'
import { logger } from '../../infrastructure/logger/logger.js'

/**
 * Zod validation middleware factory.
 *
 * Usage:
 *   const CreatePersonaSchema = z.object({ ... })
 *   router.post('/personas', validateBody(CreatePersonaSchema), (req, res) => {
 *     // req.body is now typed as z.infer<typeof CreatePersonaSchema>
 *   })
 *
 * On success the middleware replaces `req.body` with the Zod-parsed output
 * (which may coerce / strip unknown keys depending on how the schema is
 * declared) and calls next(). Handlers downstream get a strongly-typed
 * object without having to re-validate or cast from `unknown`.
 *
 * On failure it returns 400 with a stable shape:
 *   { error: 'validation', message, issues: [{ path, message }] }
 *
 * Failures are logged at debug level so repeat bad requests don't spam the
 * logs, but the issue list is always surfaced to the client so the web UI
 * can render field-level hints when the server rejects a payload.
 */
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
    // Replace req.body so downstream handlers see the parsed value instead
    // of the raw express.json() output. Cast is safe — Express types the
    // body as `any` at the framework layer.
    req.body = result.data as z.infer<TSchema>
    next()
  }
}

/** Same pattern but for query parameters. Query values are always strings
 * or string arrays out of Express, so the schema is responsible for any
 * necessary coercion (e.g. `z.coerce.number()`). */
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
    // We don't overwrite req.query because Express 5 treats it as
    // read-only on some platforms. Attach the parsed value on a
    // dedicated property instead.
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
