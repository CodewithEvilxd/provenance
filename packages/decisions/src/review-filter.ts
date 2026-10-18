const rationale =
  /\b(?:because|so that|instead of|do not|don['’]t|must|should|avoid|never|rather than|trade[- ]off|workaround|ha(?:c)k|legacy|deprecated|breaks|regression)\b/i;

export function qualifiesComment(body: string, isBot: boolean) {
  return (
    !isBot &&
    body.trim().split(/\s+/).filter(Boolean).length >= 15 &&
    rationale.test(body)
  );
}
