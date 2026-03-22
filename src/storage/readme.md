Folder Structure on Disk:


~/.devlens/
├── index.json                        ← lightweight list of all repos
└── graphs/
    └── {graphId}/                    ← one folder per repo (stable hash)
        ├── meta.json                 ← fingerprint, routes, commit list
        └── commits/
            ├── {commitHash}.json     ← full data for that commit
            └── {commitHash}.json



index.json — only what the frontend needs to render a "your analyzed repos" list:
json{
  "version": "1.0",
  "graphs": [
    {
      "graphId":         "a3f9b2c1d4e5f6a7",
      "repoPath":        "/home/user/AniverseHD",
      "isGithubRepo":    false,
      "framework":       "nextjs",
      "language":        "typescript",
      "latestCommit":    "abc12345",
      "latestAnalyzedAt":"2025-01-01T00:00:00Z",
      "commitCount":     3
    }
  ]
}

meta.json — what is stable across all commits of the same repo:
json{
  "graphId":      "a3f9b2c1d4e5f6a7",
  "repoPath":     "/home/user/AniverseHD",
  "isGithubRepo": false,
  "fingerprint":  { ... },
  "routes":       [ ... ],
  "commits": [
    {
      "commitHash":  "abc12345",
      "branch":      "main",
      "message":     "add payment feature",
      "analyzedAt":  "2025-01-01T00:00:00Z",
      "nodeCount":   321,
      "edgeCount":   592
    }
  ]
}
commits/{hash}.json — everything that changes per commit:
json{
  "commitHash":  "abc12345",
  "analyzedAt":  "2025-01-01T00:00:00Z",
  "nodes":       [ ... ],
  "edges":       [ ... ],
  "allNodes":    [ ... ],
  "allEdges":    [ ... ],
  "nodeScores":  { ... },
  "stats":       { ... }
}
```

---

**The four operations and what they touch:**
```
saveGraph()    → write commits/{hash}.json
               → update meta.json (add commit to list)
               → update index.json (update latestCommit, commitCount)

getGraph()     → read meta.json
               → read commits/{hash}.json (latest if no hash specified)
               → merge and return PipelineResult

listGraphs()   → read index.json only (never touches graph folders)

deleteGraph()  → delete entire {graphId}/ folder
               → remove from index.json