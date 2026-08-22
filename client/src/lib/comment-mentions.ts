import type { CommentMention } from "@shared/schema";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function linkifyCommentMentions(
  content: string,
  mentions: CommentMention[] | null | undefined,
): string {
  if (!Array.isArray(mentions) || mentions.length === 0) return content;

  return [...mentions]
    .sort((a, b) => b.username.length - a.username.length)
    .reduce((result, mention) => {
      if (!/^[A-Za-z0-9_.-]+$/.test(mention.username)) return result;
      const token = `@${mention.username}`;
      const pattern = new RegExp(
        `(^|[^A-Za-z0-9_.-])${escapeRegExp(token)}(?=$|[^A-Za-z0-9_.-])`,
        "g",
      );
      return result.replace(
        pattern,
        (_match, prefix: string) => `${prefix}[${token}](#mention-${mention.userId})`,
      );
    }, content);
}