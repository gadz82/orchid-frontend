// Commitlint — enforce Conventional Commits
// https://commitlint.js.org/

module.exports = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    // Allowed commit types (standard Conventional Commits)
    "type-enum": [
      2,
      "always",
      [
        "feat",     // New feature                    → minor bump
        "fix",      // Bug fix                        → patch bump
        "perf",     // Performance improvement         → patch bump
        "refactor", // Code refactor (no feature/fix)
        "docs",     // Documentation only
        "style",    // Formatting, whitespace
        "test",     // Adding/updating tests
        "build",    // Build system, dependencies
        "ci",       // CI/CD configuration
        "chore",    // Maintenance tasks
      ],
    ],
    "header-max-length": [2, "always", 72],
    "body-max-line-length": [1, "always", 120],
  },
};
