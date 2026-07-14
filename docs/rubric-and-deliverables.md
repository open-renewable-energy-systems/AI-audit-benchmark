# What "identical prompts and metrics" and the three deliverables mean

*Straw-man proposal for the 2026.07.15 ORES meeting. The four dimensions come from the published abstract; the scoring scale and schema below are proposals for the owner (Pierre) to ratify or refine.*

---

## 1. "Identical prompts"

**Meaning:** one prompt template, sent verbatim to every model. The only thing that changes between runs is the standard name. Same system prompt, same temperature, same max tokens, same output schema.

If one person asks Claude "compare these standards for a microgrid" and another asks Mistral "give me a gap analysis of 2030.5," the outputs are not comparable - and the abstract's central claim (convergence across models) collapses. Identical prompts are what make the word "convergent" mean anything.

### Example prompt template

```text
SYSTEM: You are auditing an interoperability standard for its coverage of
autonomous AI agent operation on distributed energy resources (DER).
Answer only with valid JSON matching the schema. No prose outside the JSON.

STANDARD UNDER AUDIT: {{STANDARD_NAME}}

For each of the four dimensions below, assess how well this standard supports
an autonomous software agent operating a DER.

DIMENSIONS
1. capability_declaration - can a device/agent declare what it can do
   (functions, operating limits, ramp rates, modes)?
   2. bounded_authority - can the standard express limits on what an agent is
      permitted to do (scope, ceilings, expiry, revocation, human override)?
      3. decision_auditability - can an agent's decisions/commands be logged,
         attributed, and reconstructed after the fact?
         4. data_governance - are data ownership, consent, retention, and sharing
            addressed?

            For EACH dimension return exactly:
              score      : 0 | 1 | 2 | 3
                evidence   : the specific clause/section number, or "none"
                  rationale  : <= 40 words
                    confidence : 0.0 - 1.0

                    SCALE
                      0 = Absent    - no coverage
                        1 = Implicit  - inferable, but no clause says it
                          2 = Partial   - some clauses, incomplete for agent use
                            3 = Explicit  - directly specified
                            ```

                            **Run matrix:** 7 standards x 5 models x 3 repeats = 105 runs. The 3 repeats (at temperature 0) let you claim reproducibility rather than assume it.

                            **Only `{{STANDARD_NAME}}` is substituted.** Everything else is frozen and committed to the repo.

                            ---

                            ## 2. "Identical metrics"

                            **Meaning:** a fixed scoring rubric - the same scale, the same required fields, from every model. This converts free-form model prose into a 7 x 4 matrix of comparable numbers.

                            This is the piece that was missing on June 17. The complaint - "we can't compare extensive, half-structured outputs between models" - is solved here, and only here.

                            ### The metric

                            | Score | Label | Means |
                            |---|---|---|
                            | **0** | Absent | No coverage at all |
                            | **1** | Implicit | Inferable, but no clause states it |
                            | **2** | Partial | Some clauses, incomplete for agent use |
                            | **3** | Explicit | Directly specified |

                            Every cell must also carry **evidence** (a clause citation, or `"none"`) and a **confidence**. Evidence is the hallucination trap: a model that scores 3 but cites a clause that doesn't exist is caught immediately.

                            ### Required output schema

                            ```json
                            {
                              "standard": "IEEE 2030.5",
                                "model": "claude",
                                  "run": 1,
                                    "dimensions": {
                                        "capability_declaration": {
                                              "score": 3,
                                                    "evidence": "DERCapability resource, sec 10.10",
                                                          "rationale": "Device advertises supported modes and operating limits.",
                                                                "confidence": 0.9
                                                                    },
                                                                        "bounded_authority": {
                                                                              "score": 1,
                                                                                    "evidence": "none",
                                                                                          "rationale": "Control events exist but no expressible ceiling, expiry, or revocation for a delegated agent.",
                                                                                                "confidence": 0.7
                                                                                                    },
                                                                                                        "decision_auditability": { "score": 1, "evidence": "none", "confidence": 0.6 },
                                                                                                            "data_governance": { "score": 0, "evidence": "none", "confidence": 0.8 }
                                                                                                              }
                                                                                                              }
                                                                                                              ```
                                                                                                              
                                                                                                              Because every model returns this exact shape, aggregation is arithmetic instead of interpretation.
                                                                                                              
                                                                                                              ---
                                                                                                              
                                                                                                              ## 3. Deliverable A - convergent findings
                                                                                                              
                                                                                                              **Meaning:** the cells where all models independently agree. Agreement across several models (spanning different vendors and training pipelines) is your evidence that a finding is real and not a hallucination. That is the entire methodological argument of the talk.
                                                                                                              
                                                                                                              **Convergent coverage finding:** all models scored IEEE 2030.5 capability_declaration = 3 (Explicit) and all cited the DERCapability resource independently. => 2030.5 genuinely covers capability declaration.
                                                                                                              
                                                                                                              **Convergent gap finding (the headline):** all models scored bounded_authority <= 1 on all 7 standards. => No standard in the corpus can express what an autonomous agent is NOT allowed to do.
                                                                                                              
                                                                                                              **Divergent (contested) cell:** IEC 61850 decision_auditability - Claude = 2, Mistral = 0, an open model = 1. => Contested. Flag it; don't claim it. Reporting disagreement is honest and protects you from an expert in the audience.
                                                                                                              
                                                                                                              ---
                                                                                                              
                                                                                                              ## 4. Deliverable B - gap map
                                                                                                              
                                                                                                              **Meaning:** the aggregated matrix as a heatmap. Rows = 7 standards, columns = 4 dimensions, cell = convergent score (or "contested"). This is the money slide.
                                                                                                              
                                                                                                              ### Illustrative shape (numbers are placeholders - the audit fills these in)
                                                                                                              
                                                                                                              | Standard | Capability declaration | Bounded authority | Decision auditability | Data governance |
                                                                                                              |---|:--:|:--:|:--:|:--:|
                                                                                                              | IEEE 2030.5 | 3 | 1 | 1 | 0 |
                                                                                                              | IEC 61850 | 3 | 0 | contested | 0 |
                                                                                                              | CIM | 2 | 0 | 1 | 0 |
                                                                                                              | OpenADR 3 | 2 | 2 | 2 | 1 |
                                                                                                              | ISO 15118 | 3 | 2 | 1 | 2 |
                                                                                                              | IEEE 1547 | 3 | 0 | 0 | 0 |
                                                                                                              | SunSpec | 3 | 0 | 0 | 0 |
                                                                                                              
                                                                                                              *(3 = explicit coverage, 0-1 = gap; render as green/red heatmap in the app.)*
                                                                                                              
                                                                                                              The story the audience reads instantly: the left column is high, the middle-right is low. The corpus is excellent at describing what a device can do and nearly silent on what an agent may do, what it did, and who owns the data. The low region IS the gap, and the gap IS the reason GAIFARE exists.
                                                                                                              
                                                                                                              ---
                                                                                                              
                                                                                                              ## 5. Deliverable C - GAIFARE v0 interface contract
                                                                                                              
                                                                                                              **Meaning:** a concrete, machine-readable spec that fills the gap cells. Not a manifesto - an interface. One section per dimension, defining the fields an autonomous DER agent must expose. "v0" = a first draft published to invite critique, not a finished standard.
                                                                                                              
                                                                                                              ### Example - GAIFARE v0 sketch
                                                                                                              
                                                                                                              ```yaml
                                                                                                              gaifare_version: "0.1"
                                                                                                              agent_id: "did:ores:agent:7f3a"
                                                                                                              der_id: "der:hyphae:inverter:12"
                                                                                                              
                                                                                                              # Fills the one column the corpus already covers - so align, don't reinvent.
                                                                                                              capability_declaration:
                                                                                                                functions: [active_power_setpoint, reactive_power_setpoint, curtail]
                                                                                                                  limits:
                                                                                                                      active_power_kw: { min: -5.0, max: 5.0 }
                                                                                                                          ramp_rate_kw_per_s: 0.5
                                                                                                                            modes: [grid_following, island]
                                                                                                                              maps_to: "IEEE 2030.5 DERCapability"   # explicit reuse, not a new standard
                                                                                                                              
                                                                                                                              # The gap column. This is the core GAIFARE contribution.
                                                                                                                              bounded_authority:
                                                                                                                                granted_by: "did:ores:operator:utility-x"
                                                                                                                                  scope: [active_power_setpoint]               # agent may ONLY do this
                                                                                                                                    ceilings:
                                                                                                                                        active_power_kw: { min: -3.0, max: 3.0 }   # tighter than device capability
                                                                                                                                          valid_until: "2026-09-16T00:00:00Z"          # authority expires
                                                                                                                                            revocation_endpoint: "https://ores.example/revoke"
                                                                                                                                              human_override: { required_within_ms: 500 }
                                                                                                                                              
                                                                                                                                              # Gap. Every autonomous action must be reconstructable.
                                                                                                                                              decision_auditability:
                                                                                                                                                log_entry:
                                                                                                                                                    decision_id: "01JA7F3K"
                                                                                                                                                        timestamp: "2026-09-16T11:25:03Z"
                                                                                                                                                            agent_id: "did:ores:agent:7f3a"
                                                                                                                                                                model: "modelB-8b"                    # which model decided
                                                                                                                                                                    inputs_hash: "sha256:9c1f"            # what it saw
                                                                                                                                                                        action: { active_power_kw: 2.1 }
                                                                                                                                                                            rationale: "Peak shaving; price signal 0.42 EUR/kWh"
                                                                                                                                                                                authority_ref: "grant:utility-x#4"    # under whose authority
                                                                                                                                                                                  retention: P1Y
                                                                                                                                                                                    signature: "ed25519:3b9a"               # tamper-evident
                                                                                                                                                                                    
                                                                                                                                                                                    # Gap. Whose data is it?
                                                                                                                                                                                    data_governance:
                                                                                                                                                                                      data_owner: "household:15"
                                                                                                                                                                                        consent: { purpose: [optimization], granted: true, expires: "2027-01-01" }
                                                                                                                                                                                          retention: P90D
                                                                                                                                                                                            sharing: { third_parties: [], anonymization: k5 }
                                                                                                                                                                                            ```
                                                                                                                                                                                            
                                                                                                                                                                                            ### Why this shape is defensible on stage
                                                                                                                                                                                            
                                                                                                                                                                                            - **bounded_authority** is the piece no standard has: the agent's permissions are narrower than the device's physical capability, they expire, and they can be revoked. That's the difference between an agent that assists and one that acts unsupervised.
                                                                                                                                                                                            - **decision_auditability** records which model made the call and under whose authority - so an autonomous action can be reconstructed and attributed after an incident.
                                                                                                                                                                                            - **maps_to** matters politically: it shows GAIFARE reuses what the standards already do well and only adds what's missing. That is the direct answer to the "are you just creating the n+1 standard?" question.
                                                                                                                                                                                            
                                                                                                                                                                                            ---
                                                                                                                                                                                            
                                                                                                                                                                                            ## How the three deliverables chain together
                                                                                                                                                                                            
                                                                                                                                                                                            ```
                                                                                                                                                                                            identical prompts + identical metrics
                                                                                                                                                                                               -> runs -> 7x4 matrix per model
                                                                                                                                                                                               convergent findings   (where models agree = trustworthy)
                                                                                                                                                                                                  -> gap map         (the gap cells = what's missing)
                                                                                                                                                                                                     -> GAIFARE v0      (the spec that fills exactly those cells)
                                                                                                                                                                                                     ```
                                                                                                                                                                                                     
                                                                                                                                                                                                     Each deliverable is the input to the next. That chain IS the talk - and it's why the metrics rubric has to be frozen first. Nothing downstream exists until it is.
                                                                                                                                                                                                     
