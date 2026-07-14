# Worked example: one gap cell, and how GAIFARE v0 fills it

> **These are hypotheses the audit must confirm, not established facts.** The clause-level claims below are what we expect the runs to show. If the models converge on something different, the finding changes. Do not put these on a slide until the audit backs them.

---

## The scenario (use this on stage - it's concrete and it's ours)

**Arila's Hyphae village microgrid.** 15 houses x 5 kW ~ 20 kW total, solar + a shared battery. An AI agent manages dispatch: it watches price signals and decides when to charge and discharge.

Hold that picture. Now walk the four dimensions.

---

## GREEN - what the standards already do well

**Dimension: capability declaration.** The battery needs to tell the system what it physically is. IEEE 2030.5 has a `DERCapability` resource for exactly this:

```
DERCapability:
  rtgMaxW:        5000        # +/- 5 kW
    rtgMaxChargeW:  5000
      modesSupported: [grid_following, island]
        rampRate:       0.5 kW/s
        ```

        This works. The standard can express **what the device is able to do**. No gap. GAIFARE should reuse this, not replace it.

        ---

        ## RED - the gap: bounded_authority

        The question no standard in the corpus appears able to answer:

        > **"This agent may operate the battery - but only within +/- 3 kW, never below 30% state of charge, not during dinner hours, only until September 30, and I can revoke that permission at any time."**

        ### Why the standards can't express it

        IEEE 2030.5 has `DERControl` - but a `DERControl` is a **command**, not a **grant of authority**. It says "do X now." It does not say "you are permitted to autonomously decide X, within this envelope, for this window."

        | What's missing | Why it bites |
        |---|---|
        | **No delegation primitive** | No way to say "Agent A acts on my behalf." The protocol assumes a human/utility issues each command. An autonomous agent has no standing in the data model, so it must impersonate the operator, inheriting full authority. |
        | **No authority envelope narrower than capability** | The device advertises +/- 5 kW. There is no field meaning "but this agent may only use +/- 3 kW." An authenticated agent can legitimately command the full physical envelope. |
        | **No expiry or revocation of agent authority** | Control events have a duration. The agent's permission to act has neither an expiry nor a revocation endpoint. |
        | **No human-override requirement** | No way to mark an action as "a human must be able to interrupt this within 500 ms." |

        **One-sentence version for the slide:**
        > Today, an AI agent's authority is binary - it either has none, or it has everything the device can physically do.

        ### The failure this permits

        18:30. Price spike. The agent discharges the battery at the full 5 kW to sell into it. The village browns out at dinner. Post-incident review:

        - *Who authorized 5 kW?* -> An authenticated credential sent a valid setpoint. The protocol was followed perfectly.
        - *Was the agent supposed to be limited to 3 kW?* -> Maybe, in someone's head. It was never expressible, so never enforceable.
        - *Did the agent exceed its bounds?* -> Unanswerable. No bound ever existed in the data model.

        Nothing malfunctioned. Nothing was hacked. The standard had no vocabulary for the constraint that mattered - and that is the gap.

        ---

        ## How GAIFARE v0 fills it

        GAIFARE introduces an **authority grant** - a first-class object, separate from the command, that sits between capability and control.

        ```yaml
        authority_grant:
          grant_id:   "grant:01JA7F3K"
            granted_by: "did:ores:operator:village-coop"   # who delegated
              granted_to: "did:ores:agent:7f3a"              # to which agent
                der_id:     "der:hyphae:battery:03"

                  # Scope: ONLY this. Not islanding, not curtailment.
                    scope: [active_power_setpoint]

                      # Ceilings: deliberately NARROWER than DERCapability's +/- 5 kW
                        ceilings:
                            active_power_kw: { min: -3.0, max: 3.0 }
                                soc_floor_pct: 30                      # never discharge below 30%

                                  # Operating constraints
                                    constraints:
                                        max_actions_per_hour: 4
                                            quiet_hours: ["17:00-21:00"]           # no autonomous discharge at dinner

                                              # Authority is time-bound and retractable
                                                valid_from:  "2026-09-01T00:00:00Z"
                                                  valid_until: "2026-09-30T00:00:00Z"
                                                    revocation_endpoint: "https://coop.example/revoke"

                                                      # Some actions a machine may never take alone
                                                        human_override:
                                                            required_for: [island_transition]
                                                                interrupt_within_ms: 500

                                                                  # Reuse, don't reinvent
                                                                    capability_ref: "IEEE2030.5:DERCapability/der:hyphae:battery:03"
                                                                    ```

                                                                    ### The enforcement rule (this is the whole contract)

                                                                    > **A command from an agent is invalid unless it references a live `authority_grant` and falls inside that grant's envelope.**

                                                                    ### Replay the incident with GAIFARE in place

                                                                    18:30. Price spike. The agent requests 5 kW. The gateway checks the grant and **rejects it twice over**:
                                                                    - 5.0 kW exceeds the `active_power_kw` ceiling of 3.0
                                                                    - 18:30 falls inside `quiet_hours`

                                                                    **The brownout never happens.** And the rejection itself is a logged, attributable event. Note what did not change: the battery is still physically capable of 5 kW, and `DERCapability` still says so. GAIFARE didn't alter the device - it made the agent's permission a separate, narrower, expirable, revocable thing, which is precisely the object the corpus is missing.

                                                                    ---

                                                                    ## The other two gap columns (same pattern, shorter)

                                                                    ### decision_auditability

                                                                    **The gap:** 61850 and 2030.5 can log that a setpoint changed. They cannot record why, which model decided, or on what inputs. After the brownout you can prove the value changed - you cannot reconstruct the decision. This bites harder with LLMs: you can't re-run the agent and get the same answer. If the model version and inputs weren't captured at decision time, the decision is gone forever.

                                                                    ```yaml
                                                                    decision_record:
                                                                      decision_id: "01JA7F3K"
                                                                        timestamp: "2026-09-16T18:30:03Z"
                                                                          agent_id: "did:ores:agent:7f3a"
                                                                            model: "modelB-8b@sha256:9c1f"    # WHICH model, pinned
                                                                              inputs_hash: "sha256:4b2e"        # WHAT it saw
                                                                                action: { active_power_kw: 2.1 }
                                                                                  rationale: "Peak shaving; price signal 0.42 EUR/kWh"
                                                                                    authority_ref: "grant:01JA7F3K"   # under WHOSE authority
                                                                                      outcome: accepted
                                                                                        signature: "ed25519:3b9a"         # tamper-evident
                                                                                        ```

                                                                                        ### data_governance

                                                                                        **The gap:** the agent ingests per-household load profiles from 15 homes - extraordinarily revealing data (occupancy, sleep schedules, when a house is empty). The standards move the telemetry competently and say nothing about who owns it, what it may be used for, or how long it's kept.

                                                                                        ```yaml
                                                                                        data_governance:
                                                                                          data_owner: "household:15"
                                                                                            consent:
                                                                                                purpose: [microgrid_optimization]   # bound to a purpose
                                                                                                    granted: true
                                                                                                        expires: "2027-01-01"
                                                                                                          retention: P90D
                                                                                                            sharing:
                                                                                                                third_parties: []
                                                                                                                    anonymization: k5                    # k-anonymity if ever shared
                                                                                                                    ```
                                                                                                                    
                                                                                                                    ---
                                                                                                                    
                                                                                                                    ## "Aren't you just building the n+1 standard?"
                                                                                                                    
                                                                                                                    Someone will ask this - it's Tony's own concern, and it's fair. **Be honest first: technically GAIFARE is one more spec.** Denying that won't survive a sharp questioner. The real argument is what kind of n+1 it is:
                                                                                                                    
                                                                                                                    - **The bad kind (redundant):** re-covers ground existing standards already handle -> fragments the ecosystem. This is what we're avoiding.
                                                                                                                    - **What GAIFARE is (additive in an empty region):** defines fields that exist in NONE of the seven standards, and `maps_to` the existing ones instead of replacing them. Numerically n+1, but not redundant.
                                                                                                                    
                                                                                                                    **The line for the slide:**
                                                                                                                    > GAIFARE adds no field the corpus already has - capability? we reuse 2030.5's `DERCapability`. It adds exactly the missing layer: what an agent is allowed to do. And **GAIFARE is designed to become obsolete** - the goal is for IEEE/IEC to absorb these fields upstream. Until they do, something has to hold that space. Think of it as a **proposed extension to existing standards, not a competitor.**
                                                                                                                    
                                                                                                                    **Framing to confirm with the team:** position GAIFARE as an extension / profile meant to be contributed upstream (a patch), not a standalone standard (a competitor). Same artifact - the framing is what dodges the n+1 charge.
                                                                                                                    
                                                                                                                    **Honest caveat:** this only holds where the gap is real and empty. If SAGE finds a standard (e.g., OpenADR 3) already covers bounded authority, GAIFARE is redundant there - so scope it to only the genuinely-empty cells. The gap map is what earns us the right to make this claim.
                                                                                                                    
