# Practice — Chemical Equilibrium

Fifteen questions instantiated from `assessment-support/chemical-equilibrium.md`, covering all six
objectives of `concepts/chemical-equilibrium.md`. Each question is followed by a worked answer.


**Objective coverage:** Q1–Q2 objective 1 · Q3–Q5 objective 2 · Q6–Q8 objective 3 · Q9–Q10 objective 4 · Q11–Q12 objective 5 · Q13–Q15 objective 6.

## Questions

:::: tabs
::: tab Q 1
A sealed flask contains $\ce{N2O4}$ and $\ce{NO2}$. The brown colour of the mixture stops changing.
A student concludes that both reactions have stopped. Is the student right? Explain what is
happening at the molecular level. *(Objective 1)*
:::
::: tab Answer 1
The student is wrong. The colour stops changing because the forward and reverse reactions have
reached **equal, nonzero** rates, so the concentrations no longer change. Molecules of $\ce{N2O4}$
continue to dissociate and molecules of $\ce{NO2}$ continue to recombine, at matching rates. The
equilibrium is dynamic, not static.
:::
::::

:::: tabs
::: tab Q 2
At equilibrium a reaction mixture contains 0.80 M of a reactant and 0.20 M of a product, and these
values stay constant for an hour. Is this system at equilibrium, given that the concentrations are
not equal? *(Objective 1)*
:::
::: tab Answer 2
Yes. Equilibrium requires the concentrations to be **constant**, not equal. Their unequal ratio is
fixed by the value of the equilibrium constant. Expecting equal concentrations at equilibrium is a
common error.
:::
::::

:::: tabs
::: tab Q 3
Write the equilibrium constant expression for the ammonia synthesis
$\ce{N2(g) + 3 H2(g) <=> 2 NH3(g)}$. *(Objective 2)*
:::
::: tab Answer 3
Products in the numerator, each concentration raised to its stoichiometric coefficient:
$$K = \frac{[\ce{NH3}]^{2}}{[\ce{N2}]\,[\ce{H2}]^{3}}$$
:::
::::

:::: tabs
::: tab Q 4
Write the equilibrium constant expression for $\ce{2 SO2(g) + O2(g) <=> 2 SO3(g)}$, then write it
for the same reaction written in reverse. How are the two related? *(Objective 2)*
:::
::: tab Answer 4
Forward: $K = \dfrac{[\ce{SO3}]^{2}}{[\ce{SO2}]^{2}[\ce{O2}]}$.

Reverse: $K' = \dfrac{[\ce{SO2}]^{2}[\ce{O2}]}{[\ce{SO3}]^{2}}$.

The two are reciprocals: $K' = 1/K$. Reversing the equation swaps numerator and denominator.
:::
::::

:::: tabs
::: tab Q 5
A student writes, for $\ce{H2(g) + I2(g) <=> 2 HI(g)}$, the expression
$K = \dfrac{[\ce{H2}][\ce{I2}]}{[\ce{HI}]}$. Identify both errors and give the correct expression.
*(Objective 2)*
:::
::: tab Answer 5
Two errors. First, the products and reactants are the wrong way round: products belong in the
numerator. Second, the coefficient 2 on $\ce{HI}$ has been dropped as an exponent. Correct:
$$K = \frac{[\ce{HI}]^{2}}{[\ce{H2}]\,[\ce{I2}]}$$
:::
::::

:::: tabs
::: tab Q 6
For a reaction with $K = 50$, a mixture is found to have $Q_r = 12$. Which direction will the
reaction shift, and why? *(Objective 3)*
:::
::: tab Answer 6
$Q_r < K$, so there are too few products relative to equilibrium. The reaction shifts **forward**,
toward products, until $Q_r$ rises to equal $K$.
:::
::::

:::: tabs
::: tab Q 7
For the same reaction ($K = 50$), a second mixture has $Q_r = 140$. Which direction will it shift?
What would $Q_r = 50$ mean? *(Objective 3)*
:::
::: tab Answer 7
$Q_r > K$, so there are too many products. The reaction shifts **reverse**, toward reactants, until
$Q_r$ falls to 50. If $Q_r = K = 50$ the system is already at equilibrium and there is no net shift
in either direction.
:::
::::

:::: tabs
::: tab Q 8
Without using any numbers, explain through $Q_r$ and $K$ why adding more product to a system at
equilibrium drives the reaction in reverse. *(Objective 3)*
:::
::: tab Answer 8
Adding product raises the numerator of the quotient while the denominator is unchanged, so $Q_r$
rises above $K$. Since $Q_r > K$, the system shifts in reverse, consuming product, until $Q_r$
falls back to $K$. The value of $K$ itself never changed.
:::
::::

:::: tabs
::: tab Q 9
Write the equilibrium constant expression for the decomposition of solid calcium carbonate,
$\ce{CaCO3(s) <=> CaO(s) + CO2(g)}$. *(Objective 4)*
:::
::: tab Answer 9
Both solids have an activity of one and are omitted, leaving only the gas:
$$K = [\ce{CO2}]$$
:::
::::

:::: tabs
::: tab Q 10
For the reaction in Q9, a student adds more solid $\ce{CaCO3}$ to the sealed vessel and predicts
that more $\ce{CO2}$ will form. Evaluate the prediction. *(Objective 4)*
:::
::: tab Answer 10
The prediction is wrong. A pure solid has an activity of one regardless of how much is present, so
it does not appear in the expression. Neither $K$ nor the equilibrium partial pressure of
$\ce{CO2}$ changes. Adding more solid changes only the amount of solid present.
:::
::::

:::: tabs
::: tab Q 11
A reaction has $K = 4.0$ at $T = 298\ \text{K}$. Using $R = 8.314\ \text{J mol}^{-1}\text{K}^{-1}$,
calculate the standard Gibbs energy change. *(Objective 5)*
:::
::: tab Answer 11
$\Delta G^\ominus = -RT\ln K = -(8.314)(298)\ln(4.0) = -3435\ \text{J mol}^{-1} \approx
-3.4\ \text{kJ mol}^{-1}$.

The negative sign is consistent with $K > 1$, meaning products are favoured. *(The value
$K = 4.0$ is a teaching hypothetical, not a source datum.)*
:::
::::

:::: tabs
::: tab Q 12
Without calculating, state whether $K$ is greater or less than one for a reaction whose standard
Gibbs energy change is positive. Justify your answer. *(Objective 5)*
:::
::: tab Answer 12
$K < 1$. From $\Delta G^\ominus = -RT\ln K$, a positive $\Delta G^\ominus$ requires $\ln K$ to be
negative, which means $K < 1$. Reactants are favoured at equilibrium.
:::
::::

:::: tabs
::: tab Q 13
An endothermic reaction is at equilibrium. The temperature is raised. What happens to the value of
$K$? *(Objective 6)*
:::
::: tab Answer 13
For an endothermic reaction, raising the temperature **increases** $K$. This follows from the
van 't Hoff relation, in which the sign of the reaction enthalpy fixes the direction of the
temperature dependence.
:::
::::

:::: tabs
::: tab Q 14
An exothermic reaction is at equilibrium. The temperature is lowered. What happens to the value of
$K$? *(Objective 6)*
:::
::: tab Answer 14
For an exothermic reaction, raising the temperature decreases $K$; therefore **lowering** the
temperature **increases** $K$. Products are favoured more strongly at the lower temperature.
:::
::::

:::: tabs
::: tab Q 15
A system at equilibrium undergoes two separate experiments: in the first the concentration of a
reactant is doubled, in the second the temperature is raised by 20 K. In which experiment does the
value of $K$ change? *(Objective 6)*
:::
::: tab Answer 15
Only in the second. A concentration change moves $Q_r$ away from $K$, and the system shifts until
$Q_r$ equals the **same** $K$ again. A temperature change is the one disturbance that alters the
value of $K$ itself. Confusing these two is the most common error in the chapter.
:::
::::

---

*Adapted from the version-pinned English Wikipedia articles "Chemical equilibrium" (<https://en.wikipedia.org/wiki/Chemical_equilibrium>) and "Le Chatelier's principle" (<https://en.wikipedia.org/wiki/Le_Chatelier%27s_principle>) by Wikipedia contributors, licensed CC-BY-SA-4.0 (<https://creativecommons.org/licenses/by-sa/4.0/>). Adapted and reorganized for this teaching resource.*
