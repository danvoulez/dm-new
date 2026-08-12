# Dream Machine — Identifier Derivation

**Status:** material specification. Binding for any implementation that must satisfy AT2 (rebuildable material DB).

## Why this file exists

`db/dream_machine_schema.sql` declares many `*_id` primary keys but defines the
derivation of only one (`chunk_id`, sketched in spec §C3). AT2 requires that a
deleted-and-rebuilt DB produce **identical** source/artifact/chunk IDs. That is
only possible if every ID is **content-addressed** and excludes wall-clock time.

This file is the authoritative ID contract. Where it differs from the §C3 sketch,
this file wins.

## Law

```text
ID-L1  Material IDs are content-addressed. Same bytes + same config => same ID.
ID-L2  Wall-clock fields never enter an ID hash.
       (discovered_at, mtime, created_at, generated_at are recorded, not hashed.)
ID-L3  Event IDs (runs) are not content-addressed. They are unique per occurrence.
ID-L4  Every ID carries a type prefix. Refs in evidence arrays use the same prefix.
```

## Canonicalization (applied before hashing)

```text
bytes        -> decode UTF-8 (lossy U+FFFD on invalid)
newlines     -> CRLF and CR normalized to LF
unicode      -> NFC
text_sha256  -> sha256(normalized_bytes), lowercase hex
canonical_json -> keys sorted, no insignificant whitespace, UTF-8
hash16/hash32 -> first 16 / 32 lowercase-hex chars of the sha256 digest
"|"          -> field separator in composite hash inputs
```

`hash32` (128 bits) is the default for material IDs.

## Derivations

```text
source_id      = "source:"     + hash32( kind + "|" + normalized_root )
                 normalized_root = absolute, symlink-resolved root_path, or uri.
                 Identifies a logical corpus, stable across scans.

artifact_id    = "artifact:"   + hash32( source_id + "|" + rel_path + "|" + content_sha256 )
                 content_sha256 = sha256 of the RAW file bytes (no normalization).
                 Same path, changed content => new artifact_id (a new version).

extraction_config_hash
               = hash32( canonical_json( config.extract + config.chunk + config.secret ) )
                 Only the config sections that change extraction/chunk output.

extraction_id  = "extraction:" + hash32( artifact_id + "|" + extractor_id
                                          + "|" + extraction_config_hash
                                          + "|" + text_sha256 )

chunk_id       = "chunk:"      + hash32( extraction_id + "|" + byte_start
                                          + "|" + byte_end + "|" + text_sha256 )
                 text_sha256 = sha256(normalized chunk text).
                 Supersedes the §C3 formula; extraction_id transitively encodes
                 source_sha256 and extraction_config_hash.

claim_id       = "claim:"      + hash32( subject + "|" + predicate + "|" + object
                                          + "|" + (scope|"") + "|" + modality
                                          + "|" + sorted(source_chunks).join(",") )
                 Content-addressed so the same claim from the same evidence dedupes.

edge_id        = "edge:"       + hash32( from_ref + "|" + to_ref + "|" + edge_type )

map_id         = "map:"        + hash32( topic + "|" + config_hash )
contradiction_id = "contradiction:" + hash32( sorted(claim_a,claim_b).join("|") + "|" + kind )

config_hash    = hash32( canonical_json( full resolved config ) )

run_id         = "run:" + ULID            # ID-L3: event, unique per run, NOT rebuildable.
```

## Ref grammar (for evidence / primary_sources arrays)

```text
ref := ("source"|"artifact"|"extraction"|"chunk"|"claim"|"map"|"act") ":" id_body
```

A referential validator (see `INVARIANTS.md`) resolves each ref to an existing
row. JSON Schema only checks the prefix shape; existence is checked at load time.

## Determinism checklist (AT2)

```text
[ ] source_id stable across rescans of the same root
[ ] artifact_id changes iff file bytes change
[ ] extraction_id changes iff bytes OR extraction config change
[ ] chunk_id stable for unchanged file + config
[ ] no *_id depends on mtime/discovered_at/created_at/generated_at
[ ] rebuild after `rm .dream/db/dream.sqlite` => identical source/artifact/chunk IDs
```
