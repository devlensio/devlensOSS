import { SourceFile, Node, SyntaxKind } from "ts-morph";

export type RenderingBoundary = "client" | "server" | null;

function readDirectiveFromStatements(statements: Node[]): RenderingBoundary {
  const first = statements[0];
  if (!first) return null;
  if (first.getKind() !== SyntaxKind.ExpressionStatement) return null;

  const expr = (first as any).getExpression();
  if (!expr || expr.getKind() !== SyntaxKind.StringLiteral) return null;

  const value = expr.getLiteralText();
  if (value === "use client") return "client";
  if (value === "use server") return "server";
  return null;
}

export function detectFileDirective(sourceFile: SourceFile): RenderingBoundary {
  return readDirectiveFromStatements(sourceFile.getStatements() as Node[]);
}

// Only "use server" is valid inside a function body (Next.js Server Actions).
// Returns null for anything else.
export function detectFunctionDirective(bodyNode: Node | undefined): RenderingBoundary {
  if (!bodyNode) return null;
  if (bodyNode.getKind() !== SyntaxKind.Block) return null;
  const result = readDirectiveFromStatements((bodyNode as any).getStatements() as Node[]);
  // "use client" inside a function body is not valid per Next.js spec — ignore it.
  return result === "server" ? "server" : null;
}
