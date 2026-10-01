# Le Chatelier's Principle


## Learning objectives

1. State Le Chatelier's principle: a system at equilibrium that is disturbed shifts to a new equilibrium that partially counteracts the disturbance.
2. Predict the direction an equilibrium shifts when the concentration of a reactant or product is increased or decreased.
3. Predict the direction an equilibrium shifts when the temperature changes, by treating heat as a reactant for an endothermic reaction or a product for an exothermic one.
4. Predict the effect of a volume or pressure change on a gas-phase equilibrium by comparing the moles of gas on each side of the equation.
5. Explain why adding an inert gas at constant volume, and why adding a catalyst, do not shift the equilibrium.

## The principle

Le Chatelier's principle predicts the effect of a change in conditions on a chemical equilibrium: **when something that determines an equilibrium is altered — the temperature, the pressure, or a concentration — the system moves to a new equilibrium whose shift works against the alteration, though only in part.** It is a qualitative shortcut: it tells you the *direction* a disturbed system moves without a full recalculation. Because the response only *partially* offsets the disturbance, the system never fully returns to its original state — it settles at a new equilibrium.

:::info
The principle is named for Henry Louis Le Chatelier, who stated it in 1884 by extending the van 't Hoff reasoning about temperature to changes in pressure and chemical potential; Karl Ferdinand Braun discovered it independently in 1887, so it is also called the Le Chatelier–Braun principle. It describes a *passive* restoring response of a system at equilibrium — the same *disturb it and it pushes back* behaviour Chapter 1 introduced through the reaction quotient.
:::

## Changing a concentration

Changing the concentration of a species shifts the equilibrium toward the side that **opposes** the change. Add more of a species and the reaction favours the side that consumes it; remove a species and the reaction shifts to "fill the gap" and replace it.

The source illustrates this with the synthesis of methanol from carbon monoxide and hydrogen:

$$\ce{CO + 2 H2 <=> CH3OH}$$

Increasing the concentration of $\ce{CO}$ shifts the equilibrium to the right, raising the amount of methanol and thereby partly offsetting the added $\ce{CO}$. This is exploited synthetically: continuously removing a product (for example, sequestering the water made in a condensation reaction) keeps pulling the equilibrium toward products, so a thermodynamically unfavoured product can still be obtained in quantity.

## Changing the temperature

A temperature change is handled by writing **heat as a participant** in the reaction, then reasoning exactly as for a concentration change:

- **Exothermic** reaction ($\Delta H < 0$) — heat is a **product**.
- **Endothermic** reaction ($\Delta H > 0$) — heat is a **reactant**.

Take the Haber synthesis of ammonia, which is exothermic:

$$\ce{N2(g) + 3 H2(g) <=> 2 NH3(g)} \qquad \Delta H = -92\ \text{kJ mol}^{-1}$$

Because heat is effectively a product, raising the temperature adds "product," so the equilibrium shifts **left** and *less* ammonia forms. In practice the Haber process runs at a compromise temperature: lower temperature would favour more ammonia at equilibrium, but it also slows the rate.

Temperature is the one disturbance that is different in kind. Concentration and pressure changes leave the equilibrium constant $K$ untouched — the system re-shifts back to the *same* $K$. A temperature change actually **changes the value of $K$**: for an exothermic reaction a temperature increase **decreases** $K$, and for an endothermic reaction it **increases** $K$. The direction is fixed by the sign of $\Delta H$, and the quantitative law behind it is the van 't Hoff equation from Chapter 1.

## Changing the volume or pressure

For a gas-phase equilibrium, what matters is the **partial pressures**, and those change when the volume changes. Compare the moles of gas on each side of the balanced equation:

- **Decrease the volume** (raise the pressure) → the equilibrium shifts toward the side with **fewer** moles of gas, which exerts less pressure.
- **Increase the volume** (lower the pressure) → the equilibrium shifts toward the side with **more** moles of gas.
- **Equal moles** of gas on both sides → a volume/pressure change has **no effect**.

In the ammonia equilibrium the reactant side has 4 moles of gas ($\ce{N2 + 3 H2}$) and the product side has 2 moles ($\ce{2 NH3}$):

$$\underset{\text{4 mol gas}}{\ce{N2 + 3 H2}} \ce{<=>} \underset{\text{2 mol gas}}{\ce{2 NH3}}$$

Decreasing the volume shifts this equilibrium to the right (toward the 2-mole side); increasing the volume shifts it to the left.

## Adding an inert gas

Adding an inert (noble) gas to a gas-phase equilibrium **at constant volume does not shift it.** The inert gas takes no part in the reaction, so it does not change any *partial* pressure — and it is partial pressures, not the total pressure, that drive a shift. The total pressure of the vessel rises, but the equilibrium constant depends only on the reacting species, so the position is unchanged. (Only if the volume were allowed to expand would the partial pressures fall and a shift follow — toward the side with more moles of gas.)

## Adding a catalyst

A catalyst speeds up a reaction without being consumed, and it accelerates the **forward and reverse reactions by the same factor.** It therefore changes **neither the position nor the composition** of the equilibrium — only the time taken to reach it. In the Haber process, an iron-based catalyst (metallic iron reduced from magnetite, with promoters such as potassium and aluminium oxides) accelerates the approach to equilibrium but leaves the equilibrium amounts of $\ce{N2}$, $\ce{H2}$, and $\ce{NH3}$ exactly as they were. This is the same catalyst result met in Chapter 1, now seen from the Le Chatelier side.

## Which disturbances move what

{{mermaid}}
flowchart TD
    A["Disturbance"] --> B{"Which kind?"}
    B -->|"Concentration"| C["Position shifts, K same"]
    B -->|"Volume / pressure"| D{"Equal moles of gas?"}
    B -->|"Temperature"| E["Position shifts, K CHANGES"]
    B -->|"Inert gas, const. V"| F["No shift"]
    B -->|"Catalyst"| G["No shift"]
    D -->|"Yes"| F
    D -->|"No"| H["Shifts to fewer-moles side"]
{{/mermaid}}

**Visual description:** The diagram sorts the five disturbances by what they actually move. A
concentration change shifts the position of the equilibrium but leaves the equilibrium constant
unchanged. A volume or pressure change splits on a further question: if both sides carry equal moles
of gas nothing shifts, and otherwise the equilibrium moves toward the side with fewer moles of gas
when the volume decreases. A temperature change is the only branch that changes the value of the
equilibrium constant as well as the position. The last two branches, an inert gas added at constant
volume and a catalyst, move nothing at all: the inert gas changes no partial pressure, and the
catalyst accelerates both directions by the same factor.

## Worked examples

:::: tabs
::: tab Worked example 1
For the exothermic ammonia synthesis $\ce{N2 + 3 H2 <=> 2 NH3}$ ($\Delta H = -92\ \text{kJ mol}^{-1}$), predict what happens to the amount of ammonia at equilibrium if the temperature is **raised**.
:::
::: tab Solution 1
Write heat as a product (exothermic): $\ce{N2 + 3 H2 <=> 2 NH3} + \text{heat}$. Raising the temperature is like adding a product, so the equilibrium shifts **left** and the amount of ammonia **decreases**; equivalently, $K$ decreases. *(Reasoning is a teaching derivation applying Le Chatelier's principle; the reaction and $\Delta H = -92\ \text{kJ mol}^{-1}$ are from the source.)*
:::
::::

:::: tabs
::: tab Worked example 2
For the same reaction, predict the effect of **decreasing the volume** (increasing the pressure) on the yield of ammonia.
:::
::: tab Solution 2
Count moles of gas: 4 on the reactant side, 2 on the product side. Decreasing the volume favours the side with **fewer** moles, so the equilibrium shifts **right** and the yield of ammonia **increases**. *(A teaching derivation; the reaction and its mole counts are from the source.)*
:::
::::

## Common misconceptions

- **"The system completely cancels the disturbance and returns to its original equilibrium."** No — the response only *partially* counteracts the change; the system settles at a *new* equilibrium.
- **"A catalyst increases the amount of product at equilibrium."** No — it speeds up both directions equally and changes neither the position nor the composition, only the time to reach equilibrium.
- **"Adding an inert gas at constant volume shifts the equilibrium because the total pressure rises."** No — only a change in *partial* pressures shifts a gas-phase equilibrium, and an inert gas at constant volume changes none.
- **"Raising the temperature always increases the yield of product."** No — for an exothermic reaction raising the temperature *decreases* the product yield (and decreases $K$).
- **"A pressure change shifts every gas-phase equilibrium."** No — if the moles of gas are equal on both sides, a volume/pressure change has no effect.

---

*Adapted from the version-pinned English Wikipedia articles "Chemical equilibrium" (<https://en.wikipedia.org/wiki/Chemical_equilibrium>) and "Le Chatelier's principle" (<https://en.wikipedia.org/wiki/Le_Chatelier%27s_principle>) by Wikipedia contributors, licensed CC-BY-SA-4.0 (<https://creativecommons.org/licenses/by-sa/4.0/>). Adapted and reorganized for this teaching resource.*
