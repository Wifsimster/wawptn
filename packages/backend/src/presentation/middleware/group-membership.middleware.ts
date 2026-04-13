import type { Request, Response, NextFunction, RequestHandler } from 'express'
import { db } from '../../infrastructure/database/connection.js'
import { authLogger } from '../../infrastructure/logger/logger.js'

// Extend Express Request with the resolved group membership
declare global {
  namespace Express {
    interface Request {
      membership?: {
        role: 'owner' | 'member'
        groupId: string
      }
    }
  }
}

interface GroupMembershipRow {
  group_id: string
  user_id: string
  role: 'owner' | 'member'
  joined_at: Date
  notifications_enabled: boolean
}

interface RequireGroupMembershipOptions {
  /** If set, requires the user to have this role in the group */
  role?: 'owner'
  /** Request param name that holds the group id. Defaults to `'id'`. */
  paramName?: string
}

/**
 * Express middleware — verifies the authenticated user is a member of the
 * group referenced by the route param (default: `:id`). On success, attaches
 * `req.membership = { role, groupId }` for downstream handlers.
 *
 * Must be mounted after `requireAuth` so `req.userId` is populated.
 */
export function requireGroupMembership(options: RequireGroupMembershipOptions = {}): RequestHandler {
  const paramName = options.paramName ?? 'id'
  const requiredRole = options.role

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.userId!
      const groupId = String(req.params[paramName] ?? '')

      if (!groupId) {
        res.status(400).json({ error: 'validation', message: `Missing group id param '${paramName}'` })
        return
      }

      const membership = await db<GroupMembershipRow>('group_members')
        .where({ group_id: groupId, user_id: userId })
        .first()

      if (!membership) {
        res.status(403).json({ error: 'forbidden', message: 'Not a member' })
        return
      }

      if (requiredRole && membership.role !== requiredRole) {
        res.status(403).json({ error: 'forbidden', message: 'Only group owner can perform this action' })
        return
      }

      req.membership = { role: membership.role, groupId }
      next()
    } catch (error) {
      authLogger.error(
        { error: String(error), path: req.path },
        'group membership middleware: database error'
      )
      res.status(403).json({ error: 'forbidden', message: 'Not a member' })
    }
  }
}
