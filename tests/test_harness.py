from lab.harness import VectorSource, build_registry, judge_vector, load_vector_sources, run_harness


def test_fontes_pack_vectors_match_expected_verdicts():
    result = run_harness()
    assert result["ok"], result
    assert result["count"] == 14
    assert result["counts"] == {"ambiguous": 3, "invalid": 8, "valid": 3}
    assert result["registry_counts"] == {
        "pack": 1,
        "policy": 1,
        "qualifier": 1,
        "runtime": 1,
        "template": 1,
        "workflow": 1,
    }
    assert result["failures"] == []


def test_loader_keeps_source_path_and_directory_expectation():
    sources = load_vector_sources()
    assert sources
    for source in sources:
        assert f"/{source.category}/" in source.path
        assert source.vector["expect"] == source.category


def test_judge_rejects_missing_sent_to():
    verdict = judge_vector({
        "vector": "missing-route",
        "expect": "invalid",
        "tests": ["law 4"],
        "reason": "no destination",
        "envelope": {"transport": {"channel": "test"}},
        "act": {
            "who": "dan",
            "did": "played",
            "this": "card",
            "when": "2026-06-22T00:00:00Z",
            "confirmed_by": "test",
            "if_ok": "ok",
            "if_doubt": "doubt",
            "if_not": "not",
            "status": "candidate",
            "qualifier": "0",
            "runtime": "0",
            "run": "0",
        },
    })
    assert verdict["verdict"] == "invalid"
    assert "missing transport.sent_to" in verdict["problems"]


def test_registry_is_derived_from_valid_fixtures_not_hardcoded():
    source = VectorSource(
        "root/packs/santo-andre-lab/vectors/valid/custom.json",
        "valid",
        {
            "vector": "custom",
            "expect": "valid",
            "tests": ["law 13"],
            "reason": "fixture-local registered hashes",
            "envelope": {"transport": {"sent_to": "a" * 64}},
            "act": {
                "who": "dan",
                "did": "registered",
                "this": "custom",
                "when": "2026-06-22T00:00:00Z",
                "confirmed_by": "test",
                "if_ok": "ok",
                "if_doubt": "doubt",
                "if_not": "not",
                "status": "candidate",
                "pack": "b" * 64,
                "template": "c" * 64,
                "workflow": "d" * 64,
                "policy": "e" * 64,
                "qualifier": "0",
                "runtime": "0",
                "run": "0",
            },
        },
    )
    registry = build_registry([source])
    assert registry["pack"] == {"b" * 64}
    assert judge_vector(source, registry)["ok"] is True
