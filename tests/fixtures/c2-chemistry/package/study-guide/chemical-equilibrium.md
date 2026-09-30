# Chemical Equilibrium


## Learning objectives

1. Define chemical equilibrium as a dynamic state in which the forward and reverse reaction rates are equal and the concentrations no longer change.
2. Write the equilibrium constant expression for a given balanced reaction, placing the products in the numerator and raising each concentration to its stoichiometric coefficient.
3. Evaluate the reaction quotient and compare it to the equilibrium constant to predict which direction the reaction will shift.
4. Explain why pure solids and pure liquids, whose activity is taken as one, are omitted from the equilibrium constant expression.
5. Relate the equilibrium constant to the standard Gibbs energy change using $\Delta G^\ominus = -RT \ln K$.
6. Predict how a change in temperature changes the equilibrium constant using the sign of the reaction enthalpy (the van 't Hoff relation).

## Dynamic equilibrium

Chemical equilibrium is the state of a reversible reaction in which the forward reaction proceeds at the same rate as the reverse reaction, so the reactant and product concentrations no longer change with time. The forward and reverse rates are generally **not zero** — they are simply equal — so individual molecules keep reacting in both directions even though the macroscopic concentrations stay constant. This is why the state is called *dynamic* equilibrium.

:::info
A worked illustration from the source: in acetic acid dissolved in water, a proton may hop from one acetic acid molecule onto a water molecule and then onto an acetate anion, forming another acetic acid molecule — the number of acetic acid molecules is unchanged, yet reaction never stops. Equilibrium is a statistical average of ceaseless microscopic events.
:::

## The equilibrium constant

For a balanced reversible reaction

$$\ce{\alpha A + \beta B <=> \sigma S + \tau T}$$

the **equilibrium constant** collects the product concentrations in the numerator and the reactant concentrations in the denominator, each raised to its stoichiometric coefficient:

$$K = \frac{[\ce{S}]^{\sigma}\,[\ce{T}]^{\tau}}{[\ce{A}]^{\alpha}\,[\ce{B}]^{\beta}}$$

This form follows from Guldberg and Waage's **law of mass action** (1865): the forward rate is $k_{+}[\ce{A}]^{\alpha}[\ce{B}]^{\beta}$ and the reverse rate is $k_{-}[\ce{S}]^{\sigma}[\ce{T}]^{\tau}$; setting them equal at equilibrium gives $K = k_{+}/k_{-}$. The equilibrium position lies "far to the right" when nearly all reactants are consumed, and "far to the left" when hardly any product forms.

## The reaction quotient

The **reaction quotient** $Q_r$ has exactly the same algebraic form as $K$, but is evaluated at *any* composition — not only at equilibrium. Comparing $Q_r$ to $K$ predicts the direction of change:

- $Q_r < K$ — too few products; the reaction shifts **forward** (toward products).
- $Q_r > K$ — too many products; the reaction shifts **reverse** (toward reactants).
- $Q_r = K$ — the system is already at equilibrium; no net shift.

## Pure solids and liquids

The concentration terms in $K$ are strictly **activities**, the effective concentration of each species. A pure solid or a pure liquid has an **activity of one**, so it does not appear in the equilibrium constant expression. For a reaction in dilute aqueous solution the solvent water is treated as a pure liquid of activity one and is likewise omitted — which is why, for acetic acid dissociation, $K$ is written over the dissolved species alone:

$$K = \frac{[\ce{CH3CO2-}][\ce{H3O+}]}{[\ce{CH3CO2H}]}$$

## Equilibrium and Gibbs energy

Equilibrium is reached when the Gibbs energy of the system is at its minimum, so the reaction Gibbs energy vanishes. The equilibrium constant is related to the **standard Gibbs energy change** of the reaction by

$$\Delta G^\ominus = -RT \ln K,$$

where $R$ is the gas constant and $T$ the absolute temperature. A negative $\Delta G^\ominus$ therefore corresponds to $K > 1$ (products favoured), and a positive $\Delta G^\ominus$ to $K < 1$ (reactants favoured).

## Temperature dependence

The equilibrium constant is genuinely constant with respect to composition, but it **does depend on temperature**, as described by the **van 't Hoff equation**. The direction of the dependence is fixed by the sign of the reaction enthalpy:

- **Endothermic** reaction — raising the temperature **increases** $K$.
- **Exothermic** reaction — raising the temperature **decreases** $K$.

## Catalysts and equilibrium

A **catalyst** speeds up the forward and reverse reactions by the same factor. It lowers the time needed to *reach* equilibrium but changes **neither the equilibrium constant nor the position of equilibrium**. This is a frequent source of error and is revisited in the misconceptions below.

## Deciding the direction of change

{{mermaid}}
flowchart TD
    A["Measure the current composition"] --> B["Evaluate the reaction quotient Qr"]
    B --> C{"Compare Qr with K"}
    C -->|"Qr < K"| D["Too few products<br/>shift FORWARD"]
    C -->|"Qr > K"| E["Too many products<br/>shift REVERSE"]
    C -->|"Qr = K"| F["Already at equilibrium<br/>no net shift"]
    D --> G["Qr rises until Qr = K"]
    E --> G
{{/mermaid}}

**Visual description:** The diagram shows the three-way decision that predicts the direction of a
reaction. From a measured composition you evaluate the reaction quotient and compare it with the
equilibrium constant. Three outcomes branch from that comparison: when the quotient is smaller than
the constant there are too few products and the reaction shifts forward; when it is larger there are
too many products and the reaction shifts in reverse; when the two are equal the system is already
at equilibrium and does not shift. Both shifting branches converge on the same end state, in which
the quotient has moved until it equals the constant. Note that the constant itself never moves in
this diagram: only the quotient does.

## Worked examples

:::: tabs
::: tab Worked example 1
Write the equilibrium constant expression for the ammonia synthesis $\ce{N2 + 3 H2 <=> 2 NH3}$.
:::
::: tab Solution 1
Products over reactants, each raised to its coefficient:
$$K = \frac{[\ce{NH3}]^{2}}{[\ce{N2}]\,[\ce{H2}]^{3}}.$$
:::
::::

:::: tabs
::: tab Worked example 2
Suppose a reaction has $K = 4.0$ at $T = 298\ \text{K}$. Using $R = 8.314\ \text{J mol}^{-1}\text{K}^{-1}$, estimate the standard Gibbs energy change.
:::
::: tab Solution 2
$\Delta G^\ominus = -RT\ln K = -(8.314)(298)\ln(4.0) = -3435\ \text{J mol}^{-1} \approx -3.4\ \text{kJ mol}^{-1}$. The negative sign is consistent with $K > 1$ (products favoured). *(The value $K = 4.0$ is a teaching hypothetical, not a source datum.)*
:::
::::

## Common misconceptions

- **"At equilibrium the reactions have stopped."** No — the rates are equal but nonzero; reaction continues at the molecular level.
- **"At equilibrium reactant and product concentrations are equal."** No — they are *constant*, but generally unequal; their ratio is fixed by $K$.
- **"A catalyst shifts equilibrium toward products and raises the yield."** No — a catalyst changes neither $K$ nor the position, only the rate at which equilibrium is reached.
- **"Adding more of a pure solid or liquid changes $K$."** No — its activity is one, so it is absent from the expression.
- **"Changing a concentration changes $K$."** No — only temperature changes $K$; a concentration change moves $Q_r$ and the system re-shifts back to the same $K$.

---

*Adapted from the version-pinned English Wikipedia articles "Chemical equilibrium" (<https://en.wikipedia.org/wiki/Chemical_equilibrium>) and "Le Chatelier's principle" (<https://en.wikipedia.org/wiki/Le_Chatelier%27s_principle>) by Wikipedia contributors, licensed CC-BY-SA-4.0 (<https://creativecommons.org/licenses/by-sa/4.0/>). Adapted and reorganized for this teaching resource.*
