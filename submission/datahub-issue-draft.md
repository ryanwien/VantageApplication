# Draft issue for datahub-project/datahub

**Not filed.** Read it, change anything you disagree with, then paste it yourself at
<https://github.com/datahub-project/datahub/issues/new?template=--bug-report.md>.

The template auto-applies the `bug` label. Everything below the title goes in the body.

---

## Title

```
Search: URN structural tokens ("dataset", "prod", platform name) match every entity, so ordinary table names return the whole catalog
```

---

## Body

```markdown
**Describe the bug**

DataHub URNs embed structural segments — the entity type, the platform, and the fabric —
e.g. `urn:li:dataset:(urn:li:dataPlatform:hive,fct_users_created,PROD)`.

Those segments are indexed as searchable tokens on every entity, so a query containing the
word `dataset`, `prod`, or a platform name matches **every** dataset in the catalog, matching
on `urn` alone.

This is not limited to contrived queries. Ordinary table names trigger it — `orders_dataset`,
`customer_prod`, `events_prod_v2` — since an underscore-separated name is split into tokens and
one of the resulting tokens matches the URN of every entity.

**To Reproduce**

Against a quickstart with the bundled sample metadata (8 datasets in my case), via
`POST /api/graphql` on GMS:

```graphql
query T($q: String!) {
  searchAcrossEntities(input: { types: [DATASET], query: $q, start: 0, count: 20 }) {
    total
    searchResults {
      entity { urn ... on Dataset { name } }
      matchedFields { name value }
    }
  }
}
```

| query | `total` | rank-1 `matchedFields` |
|---|---|---|
| `dataset` | 8 (all) | `[urn]` |
| `prod` | 8 (all) | `[urn]` |
| `hive` | 5 | `[urn, platform]` |
| `no_such_dataset` | 8 (all) | `[urn]` |
| `totally_unrelated_dataset` | 8 (all) | `[urn]` |
| `asdfghjkl_no_such_dataset` | 8 (all) | `[urn]` |
| `asdfghjkl` | **0** | — |
| `zzzz1234qqqq` | **0** | — |

Search is not broadly broken: pure gibberish (`asdfghjkl`, `zzzz1234qqqq`) correctly returns
zero. It is specifically the URN's structural segments that over-match.

**Expected behavior**

A query for a dataset name that does not exist should return no results, or at least should
not rank every entity in the catalog as a match. URN structural segments (the entity type
literal, the fabric, the platform prefix) arguably should not be searchable tokens on their
own — or, if they are intended to be, matching on them alone should be distinguishable from
a real content match without the caller having to infer it.

**Screenshots**

N/A — GraphQL responses included above.

**Desktop (please complete the following information):**

- OS: Windows 11
- Browser: N/A (queried GMS directly over HTTP)
- Version: DataHub **v1.6.0** (`acryldata/datahub-gms:v1.6.0`, Docker quickstart)

**Additional context**

There *is* a usable signal, but it is undocumented. On these over-matches every result
carries `matchedFields: [urn]` only, whereas a genuine match carries substantive entries:

```json
// query "fct_users_created" -> total: 2
"matchedFields": [
  { "name": "urn",               "value": "urn:li:dataset:(...,fct_users_created,PROD)" },
  { "name": "fieldPaths",        "value": "user_id" },
  { "name": "fieldDescriptions", "value": "Id of the user created" },
  { "name": "description",       "value": "table containing all the users created on a single day" },
  { "name": "id",                "value": "fct_users_created" }
]
```

`insights` and `extraProperties` were empty in every case I tested. No numeric relevance
score is exposed — `SearchResult` is `entity`, `insights`, `matchedFields`, `extraProperties`
at both `v1.6.0` and `master` — and `SearchAcrossEntitiesInput` has no relevance-threshold
parameter.

Why this bites API consumers in particular: a caller that reads `searchResults[0]` without
inspecting `matchedFields` gets a confident, wrong answer. I hit this building an agent that
answers catalog questions — it reported an unrelated dataset's owner as the owner of the name
the user had typed. Documenting the `matchedFields` behaviour, or exposing a match confidence,
would save every API consumer from independently reinventing a string-similarity guard.

**This may already be a known category of problem.** `V2LegacySettingsBuilder` defines:

    public static final List<String> DATAHUB_STOP_WORDS_LIST = ImmutableList.of("urn", "li");

So the URN prefix tokens `urn` and `li` are already treated as noise — which matches what I
measured (`urn` returns 0). But the entity-type segment (`dataset`), the fabric (`PROD`), and
the platform name are not in that list, and those are exactly the tokens that over-match. If
the stop-word list is the right lever, extending it may be most of the fix.

I have not traced precisely which analyzer chain splits an underscore-separated name into those
tokens — `main_tokenizer` is `[(),./:]`, which does not include `_`, so something else in the
filter chain is responsible. The measurements above are all direct observations; that mechanism
is the one part I have not confirmed.

Related: #16382 (surface matched chunks for API callers) is adjacent but semantic-search-specific.
I did not find an existing issue describing this over-match.
```

---

## Before you paste

- [x] ~~The "visible in the UI" claim~~ — **removed.** It was inferred, never observed. Every
      remaining line in this draft was measured against a live v1.6.0 instance.
- [ ] DataHub asks you to **reproduce on latest master** — you tested v1.6.0. The draft says so
      plainly, which is fine. Being silently stale is what gets issues closed; being explicit
      is not.
- [ ] Search the issue tracker once more the moment before filing — 438 issues are open and
      new ones land daily.
