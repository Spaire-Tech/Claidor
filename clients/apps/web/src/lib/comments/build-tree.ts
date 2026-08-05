/**
 * Shared comment-tree builder.
 *
 * Lifted from CommentThread.tsx so the lesson-comments thread and the
 * community-comments thread render the same nesting + tombstone behavior
 * without duplicating the loop. The kit on the server side
 * (polar.kit.comments) handles tombstone fetching; this builder handles
 * the client-side flat-list → tree shape used by both surfaces.
 *
 * Generic so each surface can pass its own row shape — both
 * LessonCommentRead and CommunityCommentRead satisfy the constraint.
 */

export interface CommentLike {
  id: string
  parent_id: string | null
}

export type CommentNode<T extends CommentLike> = T & { replies: CommentNode<T>[] }

export function buildCommentTree<T extends CommentLike>(
  comments: T[],
): CommentNode<T>[] {
  const byId = new Map<string, CommentNode<T>>()
  comments.forEach((c) => byId.set(c.id, { ...c, replies: [] }))
  const roots: CommentNode<T>[] = []
  byId.forEach((node) => {
    if (node.parent_id && byId.has(node.parent_id)) {
      byId.get(node.parent_id)!.replies.push(node)
    } else {
      roots.push(node)
    }
  })
  return roots
}
