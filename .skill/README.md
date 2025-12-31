# Witness Testimony Prep Skill

Agent skill for developing the witness-testimony-prep application.

## Directory Structure

```
.skill/
├── SKILL.md                        # Core skill (always read first)
└── references/
    └── casedev-llm-practice.md     # Question generation & practice APIs
```

---

## File Descriptions

### SKILL.md
**Purpose**: Primary entry point for the skill

**Contains**:
- Application architecture overview
- Tech stack (Next.js 15, Case.dev Vaults/LLMs/Voice)
- Core workflow (session → docs → questions → practice → review)
- Question categories (timeline, credibility, impeachment, etc.)
- API endpoint reference

**When loaded**: Queries about witness-testimony-prep, cross-examination, practice sessions

**Size**: ~130 lines

---

### references/casedev-llm-practice.md
**Purpose**: AI-powered question generation and practice mode

**Contains**:
- Question generation from vault documents
- Question generation prompt template
- Interactive examiner implementation
- Practice mode messages builder
- Coaching feedback analysis
- Weak point identification
- Voice API for session recording

**When to read**: Building practice features, improving question quality, adding feedback

**Size**: ~220 lines

---

## Trigger Examples

| Query | Loads |
|-------|-------|
| "Fix session timer display" | SKILL.md only |
| "Improve question generation prompts" | SKILL.md + casedev-llm-practice.md |
| "Add feedback for evasive answers" | SKILL.md + casedev-llm-practice.md |
| "Implement session recording" | SKILL.md + casedev-llm-practice.md |
