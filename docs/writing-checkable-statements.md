# Writing checkable statements — for agents authoring a Coursewerk package

Every specific fact in a teaching unit (a value, a date, a name, a superlative, an exclusivity) is checked against
a pinned source by a context-blind verifier. The harness admits the fact only when a verbatim quote carries it.
Write so that a true statement *can* be shown true.

**Avoid general absolute statements** (operator, decisions D29 and D30). "Only temperature changes K", "always",
"never" and "every" claim more than any source can show, and they are often imprecise as well: "K depends only on the
reacting species" leaves out temperature. Every absolute is read by a context reviewer, an agent and not the
instructor. Casual usage passes. A scientific absolute passes when its section scopes it. An over-general one comes
back to you, the agent, with a suggested rewording.

**When exclusivity is the point, name the set in the same sentence, in words:**

| instead of | write |
|---|---|
| Only temperature changes $K$. | Of concentration, pressure, a catalyst and temperature, only temperature changes the equilibrium constant. |
| A catalyst changes only the rate. | A catalyst changes neither the equilibrium constant nor the position, only the rate at which equilibrium is reached. |
| Temperature is the only one of these that changes $K$. | Only temperature changes the equilibrium constant, not concentration or pressure. |

A scoped "only" is checked as a conjunction: a source must state that the member does it, and that each named
alternative does not. A set named elsewhere ("of these four") or containing a bare symbol ($K$) counts as open. Use
one "only" per sentence. "not only" and degree uses ("only partially") are not absolutes.

**Otherwise, say what is true without the absolute:** "the quotient moves while the constant stays fixed", not "only
the quotient moves".

**Name quantities and constants in words where the claim depends on them.** "the equilibrium constant" can be matched
in a source; "$K$" cannot.

Gate findings:
- An absolute not yet reviewed is `absolute-unreviewed`. Run `node scripts/verify.mjs absolutes`.
- An over-general one is `absolute-overgeneral`: a question routed to you, the agent. Reword it; it reaches the
  instructor only if you cannot.
- A scoped "only" is checked like any other semi-mechanical fact (`evidence-missing` until admitted).
