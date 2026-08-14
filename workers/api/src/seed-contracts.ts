// Generated from processes/*.yml through lab.contracts.load_catalog.
export const SEED_CONTRACTS = [
  {
    "process_id": "attention-raise.v1",
    "title": "attention-raise.v1",
    "status": "active",
    "source_yml": "processes/attention-raise.v1.yml",
    "contract": {
      "process_id": "attention-raise.v1",
      "title": "",
      "status": "active",
      "kind": "",
      "version": "",
      "owner": "",
      "process_class": "",
      "organ": "law",
      "wakes": [],
      "requires_infra": [],
      "composable": false,
      "requires_target_hash": false,
      "idempotency": "none",
      "evidence_required": false,
      "required_slots": [
        "who",
        "did",
        "this",
        "when",
        "confirmed_by",
        "if_ok",
        "if_doubt",
        "if_not",
        "status"
      ],
      "slot_rules": {
        "who": {
          "meaning": "valor LogLine obrigatório para who",
          "source": "session",
          "predicate": "who.present",
          "values": []
        },
        "did": {
          "meaning": "valor LogLine obrigatório para did",
          "source": "llm",
          "predicate": "did.present",
          "values": []
        },
        "this": {
          "meaning": "valor LogLine obrigatório para this",
          "source": "llm",
          "predicate": "this.present",
          "values": []
        },
        "when": {
          "meaning": "valor LogLine obrigatório para when",
          "source": "clock",
          "predicate": "when.present",
          "values": []
        },
        "confirmed_by": {
          "meaning": "valor LogLine obrigatório para confirmed_by",
          "source": "session",
          "predicate": "confirmed_by.present",
          "values": []
        },
        "if_ok": {
          "meaning": "valor LogLine obrigatório para if_ok",
          "source": "contract",
          "predicate": "if_ok.present",
          "values": []
        },
        "if_doubt": {
          "meaning": "valor LogLine obrigatório para if_doubt",
          "source": "contract",
          "predicate": "if_doubt.present",
          "values": []
        },
        "if_not": {
          "meaning": "valor LogLine obrigatório para if_not",
          "source": "contract",
          "predicate": "if_not.present",
          "values": []
        },
        "status": {
          "meaning": "valor LogLine obrigatório para status",
          "source": "contract",
          "predicate": "status.present",
          "values": []
        }
      },
      "activation_rules_explicit": false,
      "must_include": [],
      "optional_aux": [],
      "allowed_who": [],
      "required_grants": [],
      "adapters": [],
      "danger_tier": "L0",
      "evidence_obligation": "separate-result-act",
      "evidence_must_include": [],
      "budget_policy": {},
      "closure_shape": {},
      "if_doubt_behavior": "attention_raise",
      "runtime_readiness_checks": [],
      "doubt_path": "attention-raise.v1"
    }
  },
  {
    "process_id": "evidence-closure.v1",
    "title": "evidence-closure.v1",
    "status": "active",
    "source_yml": "processes/evidence-closure.v1.yml",
    "contract": {
      "process_id": "evidence-closure.v1",
      "title": "",
      "status": "active",
      "kind": "",
      "version": "",
      "owner": "",
      "process_class": "",
      "organ": "law",
      "wakes": [],
      "requires_infra": [],
      "composable": false,
      "requires_target_hash": false,
      "idempotency": "none",
      "evidence_required": false,
      "required_slots": [
        "who",
        "did",
        "this",
        "when",
        "confirmed_by",
        "if_ok",
        "if_doubt",
        "if_not",
        "status"
      ],
      "slot_rules": {
        "who": {
          "meaning": "valor LogLine obrigatório para who",
          "source": "session",
          "predicate": "who.present",
          "values": []
        },
        "did": {
          "meaning": "valor LogLine obrigatório para did",
          "source": "llm",
          "predicate": "did.present",
          "values": []
        },
        "this": {
          "meaning": "valor LogLine obrigatório para this",
          "source": "llm",
          "predicate": "this.present",
          "values": []
        },
        "when": {
          "meaning": "valor LogLine obrigatório para when",
          "source": "clock",
          "predicate": "when.present",
          "values": []
        },
        "confirmed_by": {
          "meaning": "valor LogLine obrigatório para confirmed_by",
          "source": "session",
          "predicate": "confirmed_by.present",
          "values": []
        },
        "if_ok": {
          "meaning": "valor LogLine obrigatório para if_ok",
          "source": "contract",
          "predicate": "if_ok.present",
          "values": []
        },
        "if_doubt": {
          "meaning": "valor LogLine obrigatório para if_doubt",
          "source": "contract",
          "predicate": "if_doubt.present",
          "values": []
        },
        "if_not": {
          "meaning": "valor LogLine obrigatório para if_not",
          "source": "contract",
          "predicate": "if_not.present",
          "values": []
        },
        "status": {
          "meaning": "valor LogLine obrigatório para status",
          "source": "contract",
          "predicate": "status.present",
          "values": []
        }
      },
      "activation_rules_explicit": false,
      "must_include": [],
      "optional_aux": [],
      "allowed_who": [],
      "required_grants": [],
      "adapters": [],
      "danger_tier": "L0",
      "evidence_obligation": "separate-result-act",
      "evidence_must_include": [],
      "budget_policy": {},
      "closure_shape": {},
      "if_doubt_behavior": "attention_raise",
      "runtime_readiness_checks": [],
      "doubt_path": "attention-raise.v1"
    }
  },
  {
    "process_id": "github-check.v1",
    "title": "github-check.v1",
    "status": "active",
    "source_yml": "processes/github-check.v1.yml",
    "contract": {
      "process_id": "github-check.v1",
      "title": "",
      "status": "active",
      "kind": "",
      "version": "",
      "owner": "",
      "process_class": "",
      "organ": "law",
      "wakes": [],
      "requires_infra": [],
      "composable": false,
      "requires_target_hash": false,
      "idempotency": "none",
      "evidence_required": false,
      "required_slots": [
        "who",
        "did",
        "this",
        "when",
        "confirmed_by",
        "if_ok",
        "if_doubt",
        "if_not",
        "status"
      ],
      "slot_rules": {
        "who": {
          "meaning": "valor LogLine obrigatório para who",
          "source": "session",
          "predicate": "who.present",
          "values": []
        },
        "did": {
          "meaning": "valor LogLine obrigatório para did",
          "source": "llm",
          "predicate": "did.present",
          "values": []
        },
        "this": {
          "meaning": "valor LogLine obrigatório para this",
          "source": "llm",
          "predicate": "this.present",
          "values": []
        },
        "when": {
          "meaning": "valor LogLine obrigatório para when",
          "source": "clock",
          "predicate": "when.present",
          "values": []
        },
        "confirmed_by": {
          "meaning": "valor LogLine obrigatório para confirmed_by",
          "source": "session",
          "predicate": "confirmed_by.present",
          "values": []
        },
        "if_ok": {
          "meaning": "valor LogLine obrigatório para if_ok",
          "source": "contract",
          "predicate": "if_ok.present",
          "values": []
        },
        "if_doubt": {
          "meaning": "valor LogLine obrigatório para if_doubt",
          "source": "contract",
          "predicate": "if_doubt.present",
          "values": []
        },
        "if_not": {
          "meaning": "valor LogLine obrigatório para if_not",
          "source": "contract",
          "predicate": "if_not.present",
          "values": []
        },
        "status": {
          "meaning": "valor LogLine obrigatório para status",
          "source": "contract",
          "predicate": "status.present",
          "values": []
        }
      },
      "activation_rules_explicit": false,
      "must_include": [],
      "optional_aux": [],
      "allowed_who": [],
      "required_grants": [],
      "adapters": [],
      "danger_tier": "L0",
      "evidence_obligation": "separate-result-act",
      "evidence_must_include": [],
      "budget_policy": {},
      "closure_shape": {},
      "if_doubt_behavior": "attention_raise",
      "runtime_readiness_checks": [],
      "doubt_path": "attention-raise.v1"
    }
  },
  {
    "process_id": "inference.v1",
    "title": "inference.v1",
    "status": "active",
    "source_yml": "processes/inference.v1.yml",
    "contract": {
      "process_id": "inference.v1",
      "title": "",
      "status": "active",
      "kind": "",
      "version": "",
      "owner": "",
      "process_class": "",
      "organ": "law",
      "wakes": [],
      "requires_infra": [],
      "composable": false,
      "requires_target_hash": false,
      "idempotency": "none",
      "evidence_required": false,
      "required_slots": [
        "who",
        "did",
        "this",
        "when",
        "confirmed_by",
        "if_ok",
        "if_doubt",
        "if_not",
        "status"
      ],
      "slot_rules": {
        "who": {
          "meaning": "valor LogLine obrigatório para who",
          "source": "session",
          "predicate": "who.present",
          "values": []
        },
        "did": {
          "meaning": "valor LogLine obrigatório para did",
          "source": "llm",
          "predicate": "did.present",
          "values": []
        },
        "this": {
          "meaning": "valor LogLine obrigatório para this",
          "source": "llm",
          "predicate": "this.present",
          "values": []
        },
        "when": {
          "meaning": "valor LogLine obrigatório para when",
          "source": "clock",
          "predicate": "when.present",
          "values": []
        },
        "confirmed_by": {
          "meaning": "valor LogLine obrigatório para confirmed_by",
          "source": "session",
          "predicate": "confirmed_by.present",
          "values": []
        },
        "if_ok": {
          "meaning": "valor LogLine obrigatório para if_ok",
          "source": "contract",
          "predicate": "if_ok.present",
          "values": []
        },
        "if_doubt": {
          "meaning": "valor LogLine obrigatório para if_doubt",
          "source": "contract",
          "predicate": "if_doubt.present",
          "values": []
        },
        "if_not": {
          "meaning": "valor LogLine obrigatório para if_not",
          "source": "contract",
          "predicate": "if_not.present",
          "values": []
        },
        "status": {
          "meaning": "valor LogLine obrigatório para status",
          "source": "contract",
          "predicate": "status.present",
          "values": []
        }
      },
      "activation_rules_explicit": false,
      "must_include": [],
      "optional_aux": [],
      "allowed_who": [],
      "required_grants": [],
      "adapters": [
        "inference"
      ],
      "danger_tier": "L3",
      "evidence_obligation": "separate-result-act",
      "evidence_must_include": [
        "output_hash",
        "schema_hash"
      ],
      "budget_policy": {},
      "closure_shape": {},
      "if_doubt_behavior": "attention_raise",
      "runtime_readiness_checks": [],
      "doubt_path": "attention-raise.v1"
    }
  },
  {
    "process_id": "memory-register.v1",
    "title": "memory-register.v1",
    "status": "active",
    "source_yml": "processes/memory-register.v1.yml",
    "contract": {
      "process_id": "memory-register.v1",
      "title": "",
      "status": "active",
      "kind": "",
      "version": "",
      "owner": "",
      "process_class": "",
      "organ": "law",
      "wakes": [],
      "requires_infra": [],
      "composable": false,
      "requires_target_hash": false,
      "idempotency": "none",
      "evidence_required": false,
      "required_slots": [
        "who",
        "did",
        "this",
        "when",
        "confirmed_by",
        "if_ok",
        "if_doubt",
        "if_not",
        "status"
      ],
      "slot_rules": {
        "who": {
          "meaning": "valor LogLine obrigatório para who",
          "source": "session",
          "predicate": "who.present",
          "values": []
        },
        "did": {
          "meaning": "valor LogLine obrigatório para did",
          "source": "llm",
          "predicate": "did.present",
          "values": []
        },
        "this": {
          "meaning": "valor LogLine obrigatório para this",
          "source": "llm",
          "predicate": "this.present",
          "values": []
        },
        "when": {
          "meaning": "valor LogLine obrigatório para when",
          "source": "clock",
          "predicate": "when.present",
          "values": []
        },
        "confirmed_by": {
          "meaning": "valor LogLine obrigatório para confirmed_by",
          "source": "session",
          "predicate": "confirmed_by.present",
          "values": []
        },
        "if_ok": {
          "meaning": "valor LogLine obrigatório para if_ok",
          "source": "contract",
          "predicate": "if_ok.present",
          "values": []
        },
        "if_doubt": {
          "meaning": "valor LogLine obrigatório para if_doubt",
          "source": "contract",
          "predicate": "if_doubt.present",
          "values": []
        },
        "if_not": {
          "meaning": "valor LogLine obrigatório para if_not",
          "source": "contract",
          "predicate": "if_not.present",
          "values": []
        },
        "status": {
          "meaning": "valor LogLine obrigatório para status",
          "source": "contract",
          "predicate": "status.present",
          "values": []
        }
      },
      "activation_rules_explicit": false,
      "must_include": [],
      "optional_aux": [],
      "allowed_who": [],
      "required_grants": [],
      "adapters": [
        "receipt"
      ],
      "danger_tier": "L0",
      "evidence_obligation": "separate-result-act",
      "evidence_must_include": [],
      "budget_policy": {},
      "closure_shape": {},
      "if_doubt_behavior": "attention_raise",
      "runtime_readiness_checks": [],
      "doubt_path": "attention-raise.v1"
    }
  },
  {
    "process_id": "notification.v1",
    "title": "notification.v1",
    "status": "active",
    "source_yml": "processes/notification.v1.yml",
    "contract": {
      "process_id": "notification.v1",
      "title": "",
      "status": "active",
      "kind": "",
      "version": "",
      "owner": "",
      "process_class": "",
      "organ": "law",
      "wakes": [],
      "requires_infra": [],
      "composable": false,
      "requires_target_hash": false,
      "idempotency": "none",
      "evidence_required": false,
      "required_slots": [
        "who",
        "did",
        "this",
        "when",
        "confirmed_by",
        "if_ok",
        "if_doubt",
        "if_not",
        "status"
      ],
      "slot_rules": {
        "who": {
          "meaning": "valor LogLine obrigatório para who",
          "source": "session",
          "predicate": "who.present",
          "values": []
        },
        "did": {
          "meaning": "valor LogLine obrigatório para did",
          "source": "llm",
          "predicate": "did.present",
          "values": []
        },
        "this": {
          "meaning": "valor LogLine obrigatório para this",
          "source": "llm",
          "predicate": "this.present",
          "values": []
        },
        "when": {
          "meaning": "valor LogLine obrigatório para when",
          "source": "clock",
          "predicate": "when.present",
          "values": []
        },
        "confirmed_by": {
          "meaning": "valor LogLine obrigatório para confirmed_by",
          "source": "session",
          "predicate": "confirmed_by.present",
          "values": []
        },
        "if_ok": {
          "meaning": "valor LogLine obrigatório para if_ok",
          "source": "contract",
          "predicate": "if_ok.present",
          "values": []
        },
        "if_doubt": {
          "meaning": "valor LogLine obrigatório para if_doubt",
          "source": "contract",
          "predicate": "if_doubt.present",
          "values": []
        },
        "if_not": {
          "meaning": "valor LogLine obrigatório para if_not",
          "source": "contract",
          "predicate": "if_not.present",
          "values": []
        },
        "status": {
          "meaning": "valor LogLine obrigatório para status",
          "source": "contract",
          "predicate": "status.present",
          "values": []
        }
      },
      "activation_rules_explicit": false,
      "must_include": [],
      "optional_aux": [],
      "allowed_who": [],
      "required_grants": [],
      "adapters": [],
      "danger_tier": "L5",
      "evidence_obligation": "separate-result-act",
      "evidence_must_include": [],
      "budget_policy": {},
      "closure_shape": {},
      "if_doubt_behavior": "attention_raise",
      "runtime_readiness_checks": [],
      "doubt_path": "attention-raise.v1"
    }
  },
  {
    "process_id": "oauth-client.v1",
    "title": "oauth-client.v1",
    "status": "active",
    "source_yml": "processes/oauth-client.v1.yml",
    "contract": {
      "process_id": "oauth-client.v1",
      "title": "",
      "status": "active",
      "kind": "",
      "version": "",
      "owner": "",
      "process_class": "",
      "organ": "law",
      "wakes": [],
      "requires_infra": [],
      "composable": false,
      "requires_target_hash": false,
      "idempotency": "none",
      "evidence_required": false,
      "required_slots": [
        "who",
        "did",
        "this",
        "when",
        "confirmed_by",
        "if_ok",
        "if_doubt",
        "if_not",
        "status"
      ],
      "slot_rules": {
        "who": {
          "meaning": "valor LogLine obrigatório para who",
          "source": "session",
          "predicate": "who.present",
          "values": []
        },
        "did": {
          "meaning": "valor LogLine obrigatório para did",
          "source": "llm",
          "predicate": "did.present",
          "values": []
        },
        "this": {
          "meaning": "valor LogLine obrigatório para this",
          "source": "llm",
          "predicate": "this.present",
          "values": []
        },
        "when": {
          "meaning": "valor LogLine obrigatório para when",
          "source": "clock",
          "predicate": "when.present",
          "values": []
        },
        "confirmed_by": {
          "meaning": "valor LogLine obrigatório para confirmed_by",
          "source": "session",
          "predicate": "confirmed_by.present",
          "values": []
        },
        "if_ok": {
          "meaning": "valor LogLine obrigatório para if_ok",
          "source": "contract",
          "predicate": "if_ok.present",
          "values": []
        },
        "if_doubt": {
          "meaning": "valor LogLine obrigatório para if_doubt",
          "source": "contract",
          "predicate": "if_doubt.present",
          "values": []
        },
        "if_not": {
          "meaning": "valor LogLine obrigatório para if_not",
          "source": "contract",
          "predicate": "if_not.present",
          "values": []
        },
        "status": {
          "meaning": "valor LogLine obrigatório para status",
          "source": "contract",
          "predicate": "status.present",
          "values": []
        }
      },
      "activation_rules_explicit": false,
      "must_include": [],
      "optional_aux": [],
      "allowed_who": [],
      "required_grants": [],
      "adapters": [
        "oauth-client"
      ],
      "danger_tier": "L3",
      "evidence_obligation": "separate-result-act",
      "evidence_must_include": [
        "request_hash",
        "client_metadata_hash"
      ],
      "budget_policy": {},
      "closure_shape": {},
      "if_doubt_behavior": "attention_raise",
      "runtime_readiness_checks": [],
      "doubt_path": "attention-raise.v1"
    }
  },
  {
    "process_id": "projection-build.v1",
    "title": "projection-build.v1",
    "status": "active",
    "source_yml": "processes/projection-build.v1.yml",
    "contract": {
      "process_id": "projection-build.v1",
      "title": "",
      "status": "active",
      "kind": "",
      "version": "",
      "owner": "",
      "process_class": "",
      "organ": "law",
      "wakes": [],
      "requires_infra": [],
      "composable": false,
      "requires_target_hash": false,
      "idempotency": "none",
      "evidence_required": false,
      "required_slots": [
        "who",
        "did",
        "this",
        "when",
        "confirmed_by",
        "if_ok",
        "if_doubt",
        "if_not",
        "status"
      ],
      "slot_rules": {
        "who": {
          "meaning": "valor LogLine obrigatório para who",
          "source": "session",
          "predicate": "who.present",
          "values": []
        },
        "did": {
          "meaning": "valor LogLine obrigatório para did",
          "source": "llm",
          "predicate": "did.present",
          "values": []
        },
        "this": {
          "meaning": "valor LogLine obrigatório para this",
          "source": "llm",
          "predicate": "this.present",
          "values": []
        },
        "when": {
          "meaning": "valor LogLine obrigatório para when",
          "source": "clock",
          "predicate": "when.present",
          "values": []
        },
        "confirmed_by": {
          "meaning": "valor LogLine obrigatório para confirmed_by",
          "source": "session",
          "predicate": "confirmed_by.present",
          "values": []
        },
        "if_ok": {
          "meaning": "valor LogLine obrigatório para if_ok",
          "source": "contract",
          "predicate": "if_ok.present",
          "values": []
        },
        "if_doubt": {
          "meaning": "valor LogLine obrigatório para if_doubt",
          "source": "contract",
          "predicate": "if_doubt.present",
          "values": []
        },
        "if_not": {
          "meaning": "valor LogLine obrigatório para if_not",
          "source": "contract",
          "predicate": "if_not.present",
          "values": []
        },
        "status": {
          "meaning": "valor LogLine obrigatório para status",
          "source": "contract",
          "predicate": "status.present",
          "values": []
        }
      },
      "activation_rules_explicit": false,
      "must_include": [],
      "optional_aux": [],
      "allowed_who": [],
      "required_grants": [],
      "adapters": [
        "projection"
      ],
      "danger_tier": "L1",
      "evidence_obligation": "separate-result-act",
      "evidence_must_include": [
        "projection_hashes"
      ],
      "budget_policy": {},
      "closure_shape": {},
      "if_doubt_behavior": "attention_raise",
      "runtime_readiness_checks": [],
      "doubt_path": "attention-raise.v1"
    }
  },
  {
    "process_id": "route-to-devin.v1",
    "title": "route-to-devin.v1",
    "status": "active",
    "source_yml": "processes/route-to-devin.v1.yml",
    "contract": {
      "process_id": "route-to-devin.v1",
      "title": "",
      "status": "active",
      "kind": "",
      "version": "",
      "owner": "",
      "process_class": "",
      "organ": "law",
      "wakes": [],
      "requires_infra": [],
      "composable": false,
      "requires_target_hash": false,
      "idempotency": "none",
      "evidence_required": false,
      "required_slots": [
        "who",
        "did",
        "this",
        "when",
        "confirmed_by",
        "if_ok",
        "if_doubt",
        "if_not",
        "status"
      ],
      "slot_rules": {
        "who": {
          "meaning": "valor LogLine obrigatório para who",
          "source": "session",
          "predicate": "who.present",
          "values": []
        },
        "did": {
          "meaning": "valor LogLine obrigatório para did",
          "source": "llm",
          "predicate": "did.present",
          "values": []
        },
        "this": {
          "meaning": "valor LogLine obrigatório para this",
          "source": "llm",
          "predicate": "this.present",
          "values": []
        },
        "when": {
          "meaning": "valor LogLine obrigatório para when",
          "source": "clock",
          "predicate": "when.present",
          "values": []
        },
        "confirmed_by": {
          "meaning": "valor LogLine obrigatório para confirmed_by",
          "source": "session",
          "predicate": "confirmed_by.present",
          "values": []
        },
        "if_ok": {
          "meaning": "valor LogLine obrigatório para if_ok",
          "source": "contract",
          "predicate": "if_ok.present",
          "values": []
        },
        "if_doubt": {
          "meaning": "valor LogLine obrigatório para if_doubt",
          "source": "contract",
          "predicate": "if_doubt.present",
          "values": []
        },
        "if_not": {
          "meaning": "valor LogLine obrigatório para if_not",
          "source": "contract",
          "predicate": "if_not.present",
          "values": []
        },
        "status": {
          "meaning": "valor LogLine obrigatório para status",
          "source": "contract",
          "predicate": "status.present",
          "values": []
        }
      },
      "activation_rules_explicit": false,
      "must_include": [
        "target_content_hash",
        "target_process"
      ],
      "optional_aux": [],
      "allowed_who": [],
      "required_grants": [],
      "adapters": [
        "route_to_devin"
      ],
      "danger_tier": "L4",
      "evidence_obligation": "separate-result-act",
      "evidence_must_include": [],
      "budget_policy": {},
      "closure_shape": {},
      "if_doubt_behavior": "attention_raise",
      "runtime_readiness_checks": [],
      "doubt_path": "attention-raise.v1"
    }
  },
  {
    "process_id": "worker-run.v1",
    "title": "worker-run.v1",
    "status": "active",
    "source_yml": "processes/worker-run.v1.yml",
    "contract": {
      "process_id": "worker-run.v1",
      "title": "",
      "status": "active",
      "kind": "",
      "version": "",
      "owner": "",
      "process_class": "",
      "organ": "law",
      "wakes": [],
      "requires_infra": [],
      "composable": false,
      "requires_target_hash": false,
      "idempotency": "none",
      "evidence_required": false,
      "required_slots": [
        "who",
        "did",
        "this",
        "when",
        "confirmed_by",
        "if_ok",
        "if_doubt",
        "if_not",
        "status"
      ],
      "slot_rules": {
        "who": {
          "meaning": "valor LogLine obrigatório para who",
          "source": "session",
          "predicate": "who.present",
          "values": []
        },
        "did": {
          "meaning": "valor LogLine obrigatório para did",
          "source": "llm",
          "predicate": "did.present",
          "values": []
        },
        "this": {
          "meaning": "valor LogLine obrigatório para this",
          "source": "llm",
          "predicate": "this.present",
          "values": []
        },
        "when": {
          "meaning": "valor LogLine obrigatório para when",
          "source": "clock",
          "predicate": "when.present",
          "values": []
        },
        "confirmed_by": {
          "meaning": "valor LogLine obrigatório para confirmed_by",
          "source": "session",
          "predicate": "confirmed_by.present",
          "values": []
        },
        "if_ok": {
          "meaning": "valor LogLine obrigatório para if_ok",
          "source": "contract",
          "predicate": "if_ok.present",
          "values": []
        },
        "if_doubt": {
          "meaning": "valor LogLine obrigatório para if_doubt",
          "source": "contract",
          "predicate": "if_doubt.present",
          "values": []
        },
        "if_not": {
          "meaning": "valor LogLine obrigatório para if_not",
          "source": "contract",
          "predicate": "if_not.present",
          "values": []
        },
        "status": {
          "meaning": "valor LogLine obrigatório para status",
          "source": "contract",
          "predicate": "status.present",
          "values": []
        }
      },
      "activation_rules_explicit": false,
      "must_include": [],
      "optional_aux": [],
      "allowed_who": [],
      "required_grants": [],
      "adapters": [
        "worker_run"
      ],
      "danger_tier": "L4",
      "evidence_obligation": "separate-result-act",
      "evidence_must_include": [],
      "budget_policy": {},
      "closure_shape": {},
      "if_doubt_behavior": "attention_raise",
      "runtime_readiness_checks": [],
      "doubt_path": "attention-raise.v1"
    }
  },
  {
    "process_id": "workflow-run.v1",
    "title": "workflow-run.v1",
    "status": "active",
    "source_yml": "processes/workflow-run.v1.yml",
    "contract": {
      "process_id": "workflow-run.v1",
      "title": "",
      "status": "active",
      "kind": "",
      "version": "",
      "owner": "",
      "process_class": "",
      "organ": "law",
      "wakes": [],
      "requires_infra": [],
      "composable": false,
      "requires_target_hash": false,
      "idempotency": "none",
      "evidence_required": false,
      "required_slots": [
        "who",
        "did",
        "this",
        "when",
        "confirmed_by",
        "if_ok",
        "if_doubt",
        "if_not",
        "status"
      ],
      "slot_rules": {
        "who": {
          "meaning": "valor LogLine obrigatório para who",
          "source": "session",
          "predicate": "who.present",
          "values": []
        },
        "did": {
          "meaning": "valor LogLine obrigatório para did",
          "source": "llm",
          "predicate": "did.present",
          "values": []
        },
        "this": {
          "meaning": "valor LogLine obrigatório para this",
          "source": "llm",
          "predicate": "this.present",
          "values": []
        },
        "when": {
          "meaning": "valor LogLine obrigatório para when",
          "source": "clock",
          "predicate": "when.present",
          "values": []
        },
        "confirmed_by": {
          "meaning": "valor LogLine obrigatório para confirmed_by",
          "source": "session",
          "predicate": "confirmed_by.present",
          "values": []
        },
        "if_ok": {
          "meaning": "valor LogLine obrigatório para if_ok",
          "source": "contract",
          "predicate": "if_ok.present",
          "values": []
        },
        "if_doubt": {
          "meaning": "valor LogLine obrigatório para if_doubt",
          "source": "contract",
          "predicate": "if_doubt.present",
          "values": []
        },
        "if_not": {
          "meaning": "valor LogLine obrigatório para if_not",
          "source": "contract",
          "predicate": "if_not.present",
          "values": []
        },
        "status": {
          "meaning": "valor LogLine obrigatório para status",
          "source": "contract",
          "predicate": "status.present",
          "values": []
        }
      },
      "activation_rules_explicit": false,
      "must_include": [],
      "optional_aux": [],
      "allowed_who": [],
      "required_grants": [],
      "adapters": [
        "workflow_run"
      ],
      "danger_tier": "L5",
      "evidence_obligation": "separate-result-act",
      "evidence_must_include": [],
      "budget_policy": {},
      "closure_shape": {},
      "if_doubt_behavior": "attention_raise",
      "runtime_readiness_checks": [],
      "doubt_path": "attention-raise.v1"
    }
  }
] as const;
